use crate::{App,monitor,rpc::Rpc,tools,smtp};
use serde_json::{json,Value};
use sqlx::Row;
use std::{sync::Arc,time::Duration};
use uuid::Uuid;

pub async fn run(app:Arc<App>)->Result<(),Box<dyn std::error::Error+Send+Sync>>{
    let mut shutdown=Box::pin(tokio::signal::ctrl_c());let mut cycles=0u64;
    loop {
        tokio::select!{_=&mut shutdown=>break,_=tokio::time::sleep(Duration::from_secs(1))=>{}}
        if cycles%30==0 {sqlx::query("INSERT INTO pit_worker_heartbeat(singleton,last_seen) VALUES(true,now()) ON CONFLICT(singleton) DO UPDATE SET last_seen=now()") .execute(&app.pool).await?;}
        if let Err(error)=tick(&app).await {tracing::warn!(code=%error,"worker iteration failed");}
        cycles+=1;if cycles%60==0 {sqlx::query("DELETE FROM pit_jobs WHERE expires_at<now()").execute(&app.pool).await?;sqlx::query("DELETE FROM pit_monitors WHERE expires_at<now()").execute(&app.pool).await?;sqlx::query("DELETE FROM pit_edge_nonces WHERE expires_at<now()").execute(&app.pool).await?;}
    }
    app.pool.close().await;Ok(())
}
pub async fn tick(app:&App)->Result<(),String>{
    let mut tx=app.pool.begin().await.map_err(|_|"DB_UNAVAILABLE")?;
    let row=sqlx::query("SELECT id,kind,input_json,attempts FROM pit_jobs WHERE ((status='QUEUED' AND next_attempt_at<=now()) OR (status='RUNNING' AND lease_until<now())) AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")
        .fetch_optional(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
    let Some(row)=row else{tx.commit().await.map_err(|_|"DB_UNAVAILABLE")?;if !monitor::poll_one(&app.pool,&app.http,app.config.local_rpc_url.as_deref()).await?{let _=smtp::deliver_once(&app.pool,app.config.local_smtp.as_ref()).await?;}return Ok(())};
    let id:Uuid=row.get("id");let kind:String=row.get("kind");let input:Value=row.get("input_json");let attempts:i32=row.get("attempts");let claim=Uuid::new_v4();
    sqlx::query("UPDATE pit_jobs SET status='RUNNING',attempts=attempts+1,lease_until=now()+interval '2 minutes',claim_token=$2,updated_at=now() WHERE id=$1")
        .bind(id).bind(claim).execute(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
    tx.commit().await.map_err(|_|"DB_UNAVAILABLE")?;
    let lease_pool=app.pool.clone();
    let heartbeat=tokio::spawn(async move {loop {tokio::time::sleep(Duration::from_secs(30)).await;let _=sqlx::query("UPDATE pit_jobs SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND claim_token=$2 AND status='RUNNING'").bind(id).bind(claim).execute(&lease_pool).await;}});
    let chain=input["chain"].as_str().ok_or("VALIDATION_ERROR")?;
    let rpc=Rpc::with_local(chain,&app.http,app.config.local_rpc_url.as_deref())?;
    let result=tools::run(&kind,&input,&rpc).await;
    heartbeat.abort();
    match result {
        Ok(value)=>{
            let status=if value["status"]=="COMPLETE"||value["status"]=="VERIFIED"{"COMPLETED"}else{"PARTIAL"};
            let progress=json!({"count":value["events"].as_array().map(Vec::len),"completed":value["completed"],"missing":value["missing"]});
            sqlx::query("UPDATE pit_jobs SET status=$3,result_json=$4,progress_json=$5,lease_until=NULL,updated_at=now() WHERE id=$1 AND claim_token=$2 AND status='RUNNING'")
                .bind(id).bind(claim).bind(status).bind(value).bind(progress).execute(&app.pool).await.map_err(|_|"DB_UNAVAILABLE")?;
        },
        Err(code)=>{
            let retry=matches!(code.as_str(),"RPC_UNAVAILABLE"|"RPC_RATE_LIMIT")&&attempts<2;
            let backoff=(2i32.pow((attempts as u32).min(5))*5).min(120);
            sqlx::query("UPDATE pit_jobs SET status=$3,error_code=$4,lease_until=NULL,next_attempt_at=now()+($5::int * interval '1 second'),updated_at=now() WHERE id=$1 AND claim_token=$2 AND status='RUNNING'")
                .bind(id).bind(claim).bind(if retry{"QUEUED"}else{"FAILED"}).bind(if code.len()<64{code}else{"JOB_FAILED".into()}).bind(if retry{backoff}else{0}).execute(&app.pool).await.map_err(|_|"DB_UNAVAILABLE")?;
        }
    }
    Ok(())
}
