use crate::{App,auth,tools,monitor,rpc::Rpc};
use axum::{Router,body::{Body,to_bytes},extract::{State,ConnectInfo},http::{Request,StatusCode,header},response::{IntoResponse,Response},routing::any};
use chrono::Utc;
use serde_json::{json,Value};
use sqlx::Row;
use std::{sync::Arc,net::SocketAddr};
use uuid::Uuid;

const PREFIX:&str="/pit/api/v1";
fn response(status:StatusCode,value:Value)->Response{let mut r=(status,axum::Json(value)).into_response();r.headers_mut().insert(header::CACHE_CONTROL,header::HeaderValue::from_static("no-store"));r.headers_mut().insert(header::X_CONTENT_TYPE_OPTIONS,header::HeaderValue::from_static("nosniff"));r.headers_mut().insert(header::REFERRER_POLICY,header::HeaderValue::from_static("no-referrer"));r.headers_mut().insert(header::X_FRAME_OPTIONS,header::HeaderValue::from_static("DENY"));r}
fn error(status:StatusCode,code:&str)->Response{response(status,json!({"code":code}))}
fn token()->String{use sha2::{Digest,Sha256};let nonce=Uuid::new_v4();let digest=Sha256::digest(format!("{nonce}:{}",Uuid::new_v4()).as_bytes());base64_url(&digest)}
fn base64_url(bytes:&[u8])->String{const ABC:&[u8]=b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";let mut out=String::new();let mut n=0u32;let mut bits=0;for b in bytes {n=(n<<8)|(*b as u32);bits+=8;while bits>=6{bits-=6;out.push(ABC[((n>>bits)&63) as usize] as char)}}if bits>0{out.push(ABC[((n<<(6-bits))&63) as usize] as char)}out}

pub async fn serve(app:Arc<App>)->Result<(),Box<dyn std::error::Error+Send+Sync>>{
    let listener=tokio::net::TcpListener::bind(("0.0.0.0",app.config.port)).await?;
    let router=Router::new().fallback(any(handle)).with_state(app);
    axum::serve(listener,router.into_make_service_with_connect_info::<SocketAddr>()).with_graceful_shutdown(async{let _=tokio::signal::ctrl_c().await;}).await?;
    Ok(())
}
async fn handle(State(app):State<Arc<App>>,ConnectInfo(addr):ConnectInfo<SocketAddr>,req:Request<Body>)->Response{
    let Ok(_permit)=app.request_gate.clone().try_acquire_owned() else{return error(StatusCode::SERVICE_UNAVAILABLE,"SERVER_BUSY")};
    let origin=req.headers().get(header::ORIGIN).and_then(|v|v.to_str().ok()).map(str::to_owned);
    let allowed=app.config.allowed_origin.clone();
    let mut result=match handle_inner(app,addr,req).await {Ok(r)=>r,Err(code)=>error(status_for(code),code)};
    if origin.as_deref()==Some(&allowed) {
        if let Ok(value)=header::HeaderValue::from_str(&allowed){result.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_ORIGIN,value);}
    }
    result
}
fn status_for(code:&str)->StatusCode {match code {
    "BODY_LIMIT"=>StatusCode::PAYLOAD_TOO_LARGE,
    "EDGE_AUTH_REQUIRED"|"EDGE_REPLAY_DENIED"|"INVITE_REQUIRED"|"ORIGIN_DENIED"=>StatusCode::FORBIDDEN,
    "NFT_FETCH_DISABLED"|"SERVER_BUSY"=>StatusCode::SERVICE_UNAVAILABLE,
    "INTERNAL_ERROR"|"DB_UNAVAILABLE"=>StatusCode::INTERNAL_SERVER_ERROR,
    _=>StatusCode::BAD_REQUEST,
}}
fn pagination(query:Option<&str>)->Result<(usize,usize),&'static str>{
    let mut offset=None;let mut limit=None;
    if let Some(query)=query {
        let url=reqwest::Url::parse(&format!("http://local.invalid/?{query}")).map_err(|_|"PAGINATION_INVALID")?;
        for (key,value) in url.query_pairs(){let parsed=value.parse::<usize>().map_err(|_|"PAGINATION_INVALID")?;
            match key.as_ref(){"offset" if offset.is_none()&&parsed<=5000=>offset=Some(parsed),"limit" if limit.is_none()&&(1..=100).contains(&parsed)=>limit=Some(parsed),_=>return Err("PAGINATION_INVALID")}
        }
    }
    Ok((offset.unwrap_or(0),limit.unwrap_or(50)))
}
async fn handle_inner(app:Arc<App>,addr:SocketAddr,req:Request<Body>)->Result<Response,&'static str>{
    let method=req.method().as_str().to_owned();let path=req.uri().path().to_owned();
    let path_and_query=req.uri().path_and_query().map(|p|p.as_str().to_owned()).unwrap_or(path.clone());
    let headers=req.headers().clone();let body=to_bytes(req.into_body(),256*1024).await.map_err(|_|"BODY_LIMIT")?;
    let h=|name:&str|headers.get(name).and_then(|v|v.to_str().ok()).map(str::to_owned);
    let local_health=(path==format!("{PREFIX}/health")||path==format!("{PREFIX}/ready")) && addr.ip().is_loopback();
    if !local_health {
        let timestamp=h("x-pit-edge-timestamp").unwrap_or_default();let nonce=h("x-pit-edge-nonce").unwrap_or_default();let signature=h("x-pit-edge-signature").unwrap_or_default();
        if !auth::verify(&app.config.edge_key,&timestamp,&nonce,&method,&path_and_query,&body,Utc::now().timestamp_millis(),&signature){return Err("EDGE_AUTH_REQUIRED")}
        let inserted=sqlx::query("INSERT INTO pit_edge_nonces(nonce,expires_at) VALUES($1,now()+interval '2 minutes') ON CONFLICT DO NOTHING")
            .bind(&nonce).execute(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;
        if inserted.rows_affected()!=1{return Err("EDGE_REPLAY_DENIED")}
    }
    if h("origin").is_some_and(|o|o!=app.config.allowed_origin){return Err("ORIGIN_DENIED")}
    if method=="OPTIONS"{let mut r=StatusCode::NO_CONTENT.into_response();r.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_METHODS,header::HeaderValue::from_static("GET,POST,DELETE"));r.headers_mut().insert(header::ACCESS_CONTROL_ALLOW_HEADERS,header::HeaderValue::from_static("Content-Type,Authorization,X-PIT-Invite,Idempotency-Key"));return Ok(r)}
    if method=="GET"&&path==format!("{PREFIX}/health"){return Ok(response(StatusCode::OK,json!({"status":"UP"})))}
    if method=="GET"&&path==format!("{PREFIX}/ready"){
        let live:Option<bool>=sqlx::query_scalar("SELECT last_seen>now()-interval '2 minutes' FROM pit_worker_heartbeat WHERE singleton=true").fetch_optional(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;
        return Ok(response(if live==Some(true){StatusCode::OK}else{StatusCode::SERVICE_UNAVAILABLE},json!({"status":if live==Some(true){"READY"}else{"WORKER_UNAVAILABLE"}})))
    }
    let Some(tail)=path.strip_prefix(PREFIX) else{return Ok(error(StatusCode::NOT_FOUND,"NOT_FOUND"))};
    let parts:Vec<_>=tail.split('/').filter(|s|!s.is_empty()).collect();
    if method=="POST"&&parts.as_slice()==["jobs"]{
        let invite=h("x-pit-invite").unwrap_or_default();if !auth::matches_hash(&app.config.invite_hash,&invite){return Err("INVITE_REQUIRED")}
        let key=h("idempotency-key").unwrap_or_default();if key.len()<16||key.len()>100||!key.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-'){return Err("IDEMPOTENCY_REQUIRED")}
        let payload:Value=serde_json::from_slice(&body).map_err(|_|"INVALID_JSON")?;
        let kind=payload["kind"].as_str().ok_or("VALIDATION_ERROR")?;
        let input=tools::validate(kind,&payload["input"],app.config.nft_enabled).map_err(map_validation)?;
        let mut tx=app.pool.begin().await.map_err(|_|"INTERNAL_ERROR")?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))").bind(&app.config.invite_hash).execute(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        let existing:Option<Uuid>=sqlx::query_scalar("SELECT id FROM pit_jobs WHERE invite_hash=$1 AND idempotency_key=$2").bind(&app.config.invite_hash).bind(&key).fetch_optional(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        if let Some(id)=existing {return Ok(response(StatusCode::CONFLICT,json!({"code":"ALREADY_SUBMITTED","jobId":id})))}
        let counts:(i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM pit_jobs WHERE invite_hash=$1 AND created_at>now()-interval '1 day'),(SELECT count(*) FROM pit_jobs WHERE invite_hash=$1 AND created_at>now()-interval '1 minute')")
            .bind(&app.config.invite_hash).fetch_one(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        if counts.0>=20{return Ok(error(StatusCode::TOO_MANY_REQUESTS,"DAILY_QUOTA"))}if counts.1>=10{return Ok(error(StatusCode::TOO_MANY_REQUESTS,"RATE_LIMIT"))}
        let id=Uuid::new_v4();let access=token();
        sqlx::query("INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(id).bind(kind).bind(auth::hash(&access)).bind(&app.config.invite_hash).bind(input).bind(key).execute(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        tx.commit().await.map_err(|_|"INTERNAL_ERROR")?;
        return Ok(response(StatusCode::ACCEPTED,json!({"id":id,"accessToken":access,"status":"QUEUED"})))
    }
    if parts.first()==Some(&"jobs")&&parts.len()>=2&&parts.len()<=3{
        let id=Uuid::parse_str(parts[1]).map_err(|_|"INVALID_ID")?;let access=h("authorization").and_then(|s|s.strip_prefix("Bearer ").map(str::to_owned)).unwrap_or_default();
        let job=sqlx::query("SELECT kind,access_hash,status,progress_json,result_json,error_code,expires_at FROM pit_jobs WHERE id=$1 AND expires_at>now()").bind(id).fetch_optional(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;
        let Some(job)=job else{return Ok(error(StatusCode::NOT_FOUND,"NOT_FOUND"))};
        if !auth::matches_hash(job.get("access_hash"),&access){return Ok(error(StatusCode::NOT_FOUND,"NOT_FOUND"))}
        let status:String=job.get("status");let kind:String=job.get("kind");
        if method=="DELETE"&&parts.len()==2 {sqlx::query("DELETE FROM pit_jobs WHERE id=$1").bind(id).execute(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;return Ok(response(StatusCode::OK,json!({"status":"DELETED"})))}
        if method=="POST"&&parts.get(2)==Some(&"cancel") {let result=sqlx::query("UPDATE pit_jobs SET status='CANCELLED',lease_until=NULL WHERE id=$1 AND status IN ('QUEUED','RUNNING')").bind(id).execute(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;return Ok(response(StatusCode::OK,json!({"status":if result.rows_affected()>0{"CANCELLED"}else{&status}})))}
        if method!="GET"{return Ok(error(StatusCode::METHOD_NOT_ALLOWED,"METHOD_NOT_ALLOWED"))}
        let result:Option<Value>=job.get("result_json");
        if parts.get(2)==Some(&"export"){
            if status!="COMPLETED"&&status!="PARTIAL"{return Ok(error(StatusCode::CONFLICT,"RESULT_NOT_READY"))}
            let format=path_and_query.split('?').nth(1).unwrap_or("");let Some(result)=result else{return Ok(error(StatusCode::CONFLICT,"RESULT_NOT_READY"))};
            if format!="format=csv"&&format!="format=json"{return Ok(error(StatusCode::BAD_REQUEST,"FORMAT_INVALID"))}
            let (content,content_type)=if format=="format=csv"{(csv_export(&kind,&result),"text/csv; charset=utf-8")}else{(result.to_string(),"application/json; charset=utf-8")};
            let mut response=(StatusCode::OK,content).into_response();response.headers_mut().insert(header::CONTENT_TYPE,header::HeaderValue::from_static(content_type));response.headers_mut().insert(header::CACHE_CONTROL,header::HeaderValue::from_static("no-store"));
            let filename=format!("attachment; filename=\"pit-{kind}-{id}.{}\"",if format=="format=csv"{"csv"}else{"json"});
            response.headers_mut().insert(header::CONTENT_DISPOSITION,header::HeaderValue::from_str(&filename).map_err(|_|"INTERNAL_ERROR")?);
            return Ok(response)
        }
        if parts.len()!=2{return Ok(error(StatusCode::NOT_FOUND,"NOT_FOUND"))}
        let (offset,limit)=pagination(path_and_query.split_once('?').map(|(_,q)|q))?;
        let result=result.map(|mut value|{if let Some(events)=value.get_mut("events").and_then(Value::as_array_mut){let total=events.len();let page=events.iter().skip(offset).take(limit).cloned().collect();*events=page;value["totalEvents"]=json!(total)}value});
        let mut progress:Value=job.get("progress_json");if let Some(obj)=progress.as_object_mut(){obj.remove("events");}
        return Ok(response(StatusCode::OK,json!({"id":id,"kind":kind,"status":status,"progress":progress,"result":result,"errorCode":job.get::<Option<String>,_>("error_code"),"expiresAt":job.get::<chrono::DateTime<Utc>,_>("expires_at")})))
    }
    if method=="POST"&&parts.as_slice()==["monitors"]{
        let invite=h("x-pit-invite").unwrap_or_default();if !auth::matches_hash(&app.config.invite_hash,&invite){return Err("INVITE_REQUIRED")}
        let key=h("idempotency-key").unwrap_or_default();if key.len()<16||key.len()>100||!key.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-'){return Err("IDEMPOTENCY_REQUIRED")}
        let payload:Value=serde_json::from_slice(&body).map_err(|_|"INVALID_JSON")?;let input=monitor::validate(&payload).map_err(map_validation)?;
        if input.email.as_ref().is_some_and(|email|!app.config.allowed_emails.contains(&email.to_ascii_lowercase())){return Ok(error(StatusCode::FORBIDDEN,"EMAIL_NOT_ALLOWED"))}
        let rpc=Rpc::with_local(&input.chain,&app.http,app.config.local_rpc_url.as_deref()).map_err(|_|"UNSUPPORTED_CHAIN")?;rpc.assert_chain().await.map_err(|_|"RPC_CHAIN_MISMATCH")?;
        let head=rpc.head().await.map_err(|_|"RPC_UNAVAILABLE")?;if input.start_block>head||head-input.start_block>20_000{return Ok(error(StatusCode::BAD_REQUEST,"START_BLOCK_LIMIT"))}
        let mut tx=app.pool.begin().await.map_err(|_|"INTERNAL_ERROR")?;sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))").bind(&app.config.invite_hash).execute(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        let existing:Option<Uuid>=sqlx::query_scalar("SELECT id FROM pit_monitors WHERE invite_hash=$1 AND idempotency_key=$2").bind(&app.config.invite_hash).bind(&key).fetch_optional(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        if let Some(id)=existing{return Ok(response(StatusCode::CONFLICT,json!({"code":"ALREADY_SUBMITTED","monitorId":id})))}
        let counts:(i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM pit_monitors WHERE invite_hash=$1 AND expires_at>now()),(SELECT count(*) FROM pit_monitors WHERE invite_hash=$1 AND created_at>now()-interval '1 minute')")
            .bind(&app.config.invite_hash).fetch_one(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        if counts.0>=3{return Ok(error(StatusCode::TOO_MANY_REQUESTS,"MONITOR_QUOTA"))}if counts.1>=1{return Ok(error(StatusCode::TOO_MANY_REQUESTS,"RATE_LIMIT"))}
        let id=Uuid::new_v4();let access=token();
        sqlx::query("INSERT INTO pit_monitors(id,access_hash,invite_hash,chain,contract,rule_json,cursor_block,email,expires_at,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '72 hours',$9)")
            .bind(id).bind(auth::hash(&access)).bind(&app.config.invite_hash).bind(&input.chain).bind(&input.contract).bind(&input.rule).bind(input.start_block as i64-1).bind(&input.email).bind(&key).execute(&mut *tx).await.map_err(|_|"INTERNAL_ERROR")?;
        tx.commit().await.map_err(|_|"INTERNAL_ERROR")?;return Ok(response(StatusCode::ACCEPTED,json!({"id":id,"accessToken":access,"status":"ACTIVE","expiresInHours":72})))
    }
    if parts.first()==Some(&"monitors")&&parts.len()>=2&&parts.len()<=3{
        let id=Uuid::parse_str(parts[1]).map_err(|_|"INVALID_ID")?;let access=h("authorization").and_then(|s|s.strip_prefix("Bearer ").map(str::to_owned)).unwrap_or_default();
        let monitor=sqlx::query("SELECT chain,contract,rule_json,cursor_block,status,email,access_hash,expires_at FROM pit_monitors WHERE id=$1 AND expires_at>now()")
            .bind(id).fetch_optional(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;
        let Some(m)=monitor else{return Ok(error(StatusCode::NOT_FOUND,"NOT_FOUND"))};if !auth::matches_hash(m.get("access_hash"),&access){return Ok(error(StatusCode::NOT_FOUND,"NOT_FOUND"))}
        if method=="DELETE"&&parts.len()==2{sqlx::query("DELETE FROM pit_monitors WHERE id=$1").bind(id).execute(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;return Ok(response(StatusCode::OK,json!({"status":"DELETED"})))}
        if method=="POST"&&parts.get(2)==Some(&"pause"){sqlx::query("UPDATE pit_monitors SET status='PAUSED',lease_until=NULL WHERE id=$1").bind(id).execute(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;return Ok(response(StatusCode::OK,json!({"status":"PAUSED"})))}
        if method=="POST"&&parts.get(2)==Some(&"resume"){sqlx::query("UPDATE pit_monitors SET status='ACTIVE',next_poll_at=now() WHERE id=$1 AND expires_at>now()").bind(id).execute(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;return Ok(response(StatusCode::OK,json!({"status":"ACTIVE"})))}
        if method=="GET"&&parts.get(2)==Some(&"alerts") {let rows=sqlx::query("SELECT id,block_hash,block_number,transaction_hash,log_index,event_json,status,created_at FROM pit_alerts WHERE monitor_id=$1 ORDER BY created_at DESC LIMIT 100")
            .bind(id).fetch_all(&app.pool).await.map_err(|_|"INTERNAL_ERROR")?;let alerts:Vec<Value>=rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"block_hash":r.get::<String,_>("block_hash"),"block_number":r.get::<i64,_>("block_number"),"transaction_hash":r.get::<String,_>("transaction_hash"),"log_index":r.get::<i32,_>("log_index"),"event_json":r.get::<Value,_>("event_json"),"status":r.get::<String,_>("status"),"created_at":r.get::<chrono::DateTime<Utc>,_>("created_at")})).collect();return Ok(response(StatusCode::OK,json!({"alerts":alerts})))}
        if method=="GET"&&parts.len()==2 {return Ok(response(StatusCode::OK,json!({"id":id,"chain":m.get::<String,_>("chain"),"contract":m.get::<String,_>("contract"),"rule":m.get::<Value,_>("rule_json"),"cursorBlock":m.get::<i64,_>("cursor_block"),"status":m.get::<String,_>("status"),"expiresAt":m.get::<chrono::DateTime<Utc>,_>("expires_at"),"emailEnabled":m.get::<Option<String>,_>("email").is_some()})))}
    }
    Ok(error(StatusCode::NOT_FOUND,"NOT_FOUND"))
}
fn map_validation(code:String)->&'static str{match code.as_str(){"NFT_FETCH_DISABLED"=>"NFT_FETCH_DISABLED","BLOCK_RANGE_LIMIT"=>"BLOCK_RANGE_LIMIT","UNSUPPORTED_CHAIN"=>"UNSUPPORTED_CHAIN","INVALID_ADDRESS"=>"INVALID_ADDRESS","INVALID_HASH"=>"INVALID_HASH","INVALID_ABI"=>"INVALID_ABI","UNSUPPORTED_JOB"=>"UNSUPPORTED_JOB",_=>"VALIDATION_ERROR"}}
fn csv_export(kind:&str,result:&Value)->String{
    let (rows,columns):(&[Value],&[&str])=match kind{"events"=>(result["events"].as_array().map(Vec::as_slice).unwrap_or(&[]),&["chainId","contract","blockNumber","blockHash","transactionHash","logIndex","signature","decoded"]),"distribution"=>(result["rows"].as_array().map(Vec::as_slice).unwrap_or(&[]),&["recipient","amount","observedAmount","transferCount","balanceEvidence","status"]),"permissions"=>(result["history"].as_array().map(Vec::as_slice).unwrap_or(&[]),&["event","blockNumber","transactionHash","args"]),_=>(result["rows"].as_array().map(Vec::as_slice).unwrap_or(&[]),&["tokenId","status","uri","metadataHash","issues","media"])};
    if rows.is_empty(){return String::new()}
    let mut lines=Vec::with_capacity(rows.len()+1);lines.push(columns.join(","));
    for row in rows {let values:Vec<_>=columns.iter().map(|column|{
        let mut cell=match row.get(*column){None=>String::new(),Some(Value::String(text))=>text.to_owned(),Some(value)=>value.to_string()};
        if cell.starts_with(['=','+','-','@','\t','\r']){cell.insert(0,'\'');}
        format!("\"{}\"",cell.replace('"',"\"\""))
    }).collect();lines.push(values.join(","));}
    lines.join("\n")
}

#[cfg(test)] mod tests{use super::*;#[test]fn access_token_entropy_shape(){let t=token();assert_eq!(t.len(),43);assert!(t.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-'));}#[test]fn csv_escapes_formula(){let s=csv_export("distribution",&json!({"rows":[{"recipient":"=cmd","amount":"1","status":"MISMATCH"}]}));assert!(s.contains("'=cmd"));}#[test]fn csv_preserves_explicit_null(){let s=csv_export("events",&json!({"events":[{"chainId":1,"decoded":null}]}));assert!(s.ends_with("\"null\""));assert!(s.contains("\"1\",\"\""));}}
