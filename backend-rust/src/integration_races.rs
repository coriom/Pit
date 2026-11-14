use crate::{App, api, auth, config::Config, event_scan, rpc::Rpc, worker};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

async fn rpc(url: &str, method: &str, params: Value) -> Value {
    let response: Value = reqwest::Client::new().post(url).json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params})).send().await.unwrap().json().await.unwrap();
    assert!(response.get("error").is_none(), "local Anvil {method}: {response}");
    response["result"].clone()
}
fn test_app(pool: PgPool, url: &str) -> Arc<App> {
    Arc::new(App {
        pool, config: Config {database_url:"postgres://corio@127.0.0.1:55439/pit_v21_races".into(),
            invite_hash:auth::hash("race-test-invitation"),edge_key:"race_test_hmac_secret_32_bytes_000000".into(),
            allowed_origin:"http://127.0.0.1:4300".into(),nft_enabled:false,port:58791,
            allowed_emails:vec![],local_rpc_url:Some(url.into()),local_smtp:None,local_metadata_origin:None},
        http:reqwest::Client::new(),request_gate:Arc::new(tokio::sync::Semaphore::new(32)),
    })
}
async fn insert(pool:&PgPool,id:Uuid,input:Value,status:&str,claim:Option<Uuid>){
    sqlx::query("INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json,status,claim_token,lease_until,attempts) VALUES($1,'events',$2,$3,$4,$5,$6,now()-interval '1 second',$7)")
        .bind(id).bind(auth::hash("race-capability")).bind(auth::hash("race-test-invitation"))
        .bind(input).bind(status).bind(claim).bind(if claim.is_some(){1}else{0}).execute(pool).await.unwrap();
}
async fn signed_post(url:&str,nonce:&str,body:&str,key:&str)->reqwest::Response {
    let path="/pit/api/v1/jobs";let timestamp=chrono::Utc::now().timestamp_millis().to_string();
    let signature=auth::sign("race_test_hmac_secret_32_bytes_000000",&timestamp,nonce,"POST",path,body.as_bytes());
    reqwest::Client::new().post(url).header("x-pit-edge-timestamp",timestamp)
        .header("x-pit-edge-nonce",nonce).header("x-pit-edge-signature",signature)
        .header("x-pit-invite","race-test-invitation").header("idempotency-key",key)
        .header("content-type","application/json").body(body.to_owned()).send().await.unwrap()
}
async fn signed_access(url:&str,path:&str,method:reqwest::Method,token:&str)->reqwest::Response {
    let timestamp=chrono::Utc::now().timestamp_millis().to_string();
    let nonce=Uuid::new_v4().simple().to_string();
    let signature=auth::sign("race_test_hmac_secret_32_bytes_000000",&timestamp,&nonce,method.as_str(),path,b"");
    reqwest::Client::new().request(method,url).header("x-pit-edge-timestamp",timestamp)
        .header("x-pit-edge-nonce",nonce).header("x-pit-edge-signature",signature)
        .header("authorization",format!("Bearer {token}")).send().await.unwrap()
}

#[tokio::test(flavor="multi_thread",worker_threads=4)]
async fn local_concurrent_claim_checkpoint_recovery_and_replay(){
    let (Ok(db),Ok(url))=(std::env::var("PIT_TEST_RACE_DATABASE_URL"),std::env::var("PIT_TEST_RPC_URL")) else {eprintln!("SKIP race integration: disposable local DB and Anvil required");return};
    assert_eq!(db,"postgres://corio@127.0.0.1:55439/pit_v21_races");
    assert!(url.starts_with("http://127.0.0.1:58545"));
    let pool=PgPool::connect(&db).await.unwrap();
    for migration in [include_str!("../../backend/migrations/001_init.sql"),include_str!("../../backend/migrations/002_edge_nonces.sql"),include_str!("../migrations/003_retry_schedule.sql")] {sqlx::raw_sql(migration).execute(&pool).await.unwrap();}
    sqlx::query("TRUNCATE pit_deliveries,pit_alerts,pit_monitors,pit_jobs,pit_edge_nonces,pit_worker_heartbeat CASCADE").execute(&pool).await.unwrap();
    let head=rpc(&url,"eth_blockNumber",json!([])).await.as_str().and_then(|s|u64::from_str_radix(s.trim_start_matches("0x"),16).ok()).unwrap();
    if head<630 {rpc(&url,"anvil_mine",json!([format!("0x{:x}",630-head)])).await;}
    let contract="0x1111111111111111111111111111111111111111";
    let first=Uuid::new_v4();
    let input=json!({"chain":"base-sepolia","contract":contract,"fromBlock":1,"toBlock":1});
    insert(&pool,first,input.clone(),"QUEUED",None).await;
    let app=test_app(pool.clone(),&url);
    let (one,two)=tokio::join!(worker::tick(&app),worker::tick(&app));one.unwrap();two.unwrap();
    let state=sqlx::query("SELECT status,attempts FROM pit_jobs WHERE id=$1").bind(first).fetch_one(&pool).await.unwrap();
    assert_eq!(state.get::<String,_>("status"),"COMPLETED");assert_eq!(state.get::<i32,_>("attempts"),1);

    // A worker killed after claiming but before any checkpoint leaves a
    // leased RUNNING row. A new worker must reclaim it exactly once.
    let precheckpoint=Uuid::new_v4();
    insert(&pool,precheckpoint,input.clone(),"RUNNING",Some(Uuid::new_v4())).await;
    worker::tick(&test_app(PgPool::connect(&db).await.unwrap(),&url)).await.unwrap();
    let recovered=sqlx::query("SELECT status,attempts,result_json FROM pit_jobs WHERE id=$1").bind(precheckpoint).fetch_one(&pool).await.unwrap();
    assert_eq!(recovered.get::<String,_>("status"),"COMPLETED");
    assert_eq!(recovered.get::<i32,_>("attempts"),2);
    assert_eq!(recovered.get::<Value,_>("result_json")["events"].as_array().unwrap().len(),0);

    let resumed=Uuid::new_v4();let old_claim=Uuid::new_v4();
    let full=json!({"chain":"base-sepolia","contract":contract,"fromBlock":1,"toBlock":600});
    insert(&pool,resumed,full.clone(),"RUNNING",Some(old_claim)).await;
    let first_range=json!({"chain":"base-sepolia","contract":contract,"fromBlock":1,"toBlock":500});
    let chain=Rpc::local(url.clone(),84532,reqwest::Client::new());
    event_scan::scan(&first_range,&chain,None,Some(&event_scan::Checkpoint{pool:&pool,job_id:resumed,claim_token:old_claim})).await.unwrap();
    let checkpoint:Value=sqlx::query_scalar("SELECT progress_json FROM pit_jobs WHERE id=$1").bind(resumed).fetch_one(&pool).await.unwrap();
    assert_eq!(checkpoint["coverage"].as_array().unwrap().len(),1);
    // This is the durable state left by an interrupted worker after the first range.
    sqlx::query("UPDATE pit_jobs SET lease_until=now()-interval '1 second' WHERE id=$1")
        .bind(resumed).execute(&pool).await.unwrap();
    worker::tick(&app).await.unwrap();
    let state=sqlx::query("SELECT status,attempts,result_json FROM pit_jobs WHERE id=$1").bind(resumed).fetch_one(&pool).await.unwrap();
    assert_eq!(state.get::<String,_>("status"),"COMPLETED");assert_eq!(state.get::<i32,_>("attempts"),2);
    let result:Value=state.get("result_json");assert_eq!(result["coverage"].as_array().unwrap().len(),2);
    assert_eq!(result["rpcLogRequests"],1,"must query only the uncovered second interval");
    let mut stale_coverage=checkpoint.clone();stale_coverage["coverage"][0]["toHash"]=json!(format!("0x{}","0".repeat(64)));
    let rechecked=event_scan::scan(&full,&chain,Some(&stale_coverage),None).await.unwrap();
    assert_eq!(rechecked["status"],"COMPLETE");
    assert_eq!(rechecked["rpcLogRequests"],2,"a noncanonical checkpoint must be discarded and rescanned");

    let cancelled=Uuid::new_v4();let cancelled_claim=Uuid::new_v4();
    insert(&pool,cancelled,input.clone(),"RUNNING",Some(cancelled_claim)).await;
    sqlx::query("UPDATE pit_jobs SET status='CANCELLED' WHERE id=$1").bind(cancelled).execute(&pool).await.unwrap();
    let stale=event_scan::scan(&input,&chain,None,Some(&event_scan::Checkpoint{pool:&pool,job_id:cancelled,claim_token:cancelled_claim})).await;
    assert_eq!(stale.unwrap_err(),"STALE_LEASE");

    let server=tokio::spawn(api::serve(app.clone()));
    let health="http://127.0.0.1:58791/pit/api/v1/health";
    for _ in 0..30 {if reqwest::get(health).await.is_ok(){break}tokio::time::sleep(Duration::from_millis(100)).await;}
    let jobs="http://127.0.0.1:58791/pit/api/v1/jobs";
    let body=json!({"kind":"events","input":input.clone()}).to_string();
    let nonce=Uuid::new_v4().simple().to_string();
    let (a,b)=tokio::join!(signed_post(jobs,&nonce,&body,"race_nonce_key_0000001"),signed_post(jobs,&nonce,&body,"race_nonce_key_0000002"));
    let winner=if a.status()==202 {"race_nonce_key_0000001"}else{"race_nonce_key_0000002"};
    let mut codes=[a.status().as_u16(),b.status().as_u16()];codes.sort();assert_eq!(codes,[202,403]);
    let conflict=signed_post(jobs,&Uuid::new_v4().simple().to_string(),&body,winner).await;
    assert_eq!(conflict.status(),409);
    let first_url=format!("{jobs}/{first}");let first_path=format!("/pit/api/v1/jobs/{first}");
    assert_eq!(signed_access(&first_url,&first_path,reqwest::Method::GET,"wrong-capability").await.status(),404);
    let export_url=format!("{first_url}/export?format=json");let export_path=format!("{first_path}/export?format=json");
    assert_eq!(signed_access(&export_url,&export_path,reqwest::Method::GET,"wrong-capability").await.status(),404);
    let cancel_url=format!("{first_url}/cancel");let cancel_path=format!("{first_path}/cancel");
    assert_eq!(signed_access(&cancel_url,&cancel_path,reqwest::Method::POST,"wrong-capability").await.status(),404);
    let invalid_page=format!("{first_url}?limit=101");let invalid_path=format!("{first_path}?limit=101");
    assert_eq!(signed_access(&invalid_page,&invalid_path,reqwest::Method::GET,"race-capability").await.status(),400);
    let valid_page=format!("{first_url}?offset=0&limit=1");let valid_path=format!("{first_path}?offset=0&limit=1");
    let page=signed_access(&valid_page,&valid_path,reqwest::Method::GET,"race-capability").await;
    assert_eq!(page.status(),200);let page:Value=page.json().await.unwrap();assert_eq!(page["result"]["totalEvents"],0);
    let timestamp=chrono::Utc::now().timestamp_millis().to_string();let tampered=body.replace("events","permissions");
    let tamper_nonce=Uuid::new_v4().simple().to_string();
    let sig=auth::sign("race_test_hmac_secret_32_bytes_000000",&timestamp,&tamper_nonce,"POST","/pit/api/v1/jobs",body.as_bytes());
    // A signature over a different body must fail even before invitation validation.
    let tamper=reqwest::Client::new().post(jobs).header("x-pit-edge-timestamp",timestamp)
        .header("x-pit-edge-nonce",tamper_nonce).header("x-pit-edge-signature",sig)
        .body(tampered).send().await.unwrap();assert_eq!(tamper.status(),403);
    let too_large=reqwest::Client::new().post(jobs).body(vec![b'x';256*1024+1]).send().await.unwrap();
    assert_eq!(too_large.status(),413);
    let old_timestamp=(chrono::Utc::now().timestamp_millis()-61_000).to_string();let expired_nonce=Uuid::new_v4().simple().to_string();
    let expired_sig=auth::sign("race_test_hmac_secret_32_bytes_000000",&old_timestamp,&expired_nonce,"POST","/pit/api/v1/jobs",body.as_bytes());
    let expired=reqwest::Client::new().post(jobs).header("x-pit-edge-timestamp",old_timestamp).header("x-pit-edge-nonce",expired_nonce)
        .header("x-pit-edge-signature",expired_sig).body(body.clone()).send().await.unwrap();assert_eq!(expired.status(),403);
    for _ in 0..20 {insert(&pool,Uuid::new_v4(),input.clone(),"QUEUED",None).await;}
    let quota=signed_post(jobs,&Uuid::new_v4().simple().to_string(),&body,"race_quota_key_0000001").await;
    assert_eq!(quota.status(),429);
    let guessed=Uuid::new_v4();let guessed_url=format!("{jobs}/{guessed}");let guessed_path=format!("/pit/api/v1/jobs/{guessed}");
    assert_eq!(signed_access(&guessed_url,&guessed_path,reqwest::Method::GET,"race-capability").await.status(),404);
    let malicious=json!({"kind":"events'; DROP TABLE pit_jobs; --","input":input}).to_string();
    let rejected=signed_post(jobs,&Uuid::new_v4().simple().to_string(),&malicious,"race_injection_key_0001").await;
    assert_eq!(rejected.status(),400);
    let wrong_chain=json!({"kind":"events","input":{"chain":"https://internal.invalid/rpc","contract":contract,"fromBlock":1,"toBlock":1}}).to_string();
    assert_eq!(signed_post(jobs,&Uuid::new_v4().simple().to_string(),&wrong_chain,"race_chain_key_0000001").await.status(),400);
    sqlx::query("UPDATE pit_jobs SET access_hash=$2 WHERE id=$1").bind(first).bind(auth::hash("revoked-capability")).execute(&pool).await.unwrap();
    assert_eq!(signed_access(&first_url,&first_path,reqwest::Method::GET,"race-capability").await.status(),404);
    sqlx::query("UPDATE pit_jobs SET expires_at=now()-interval '1 second' WHERE id=$1").bind(first).execute(&pool).await.unwrap();
    assert_eq!(signed_access(&first_url,&first_path,reqwest::Method::GET,"revoked-capability").await.status(),404);
    sqlx::query("TRUNCATE pit_jobs,pit_edge_nonces CASCADE").execute(&pool).await.unwrap();
    let mut submissions=tokio::task::JoinSet::new();
    for number in 0..12 {
        let body=body.clone();let jobs=jobs.to_owned();
        submissions.spawn(async move {
            signed_post(&jobs,&Uuid::new_v4().simple().to_string(),&body,&format!("race_parallel_quota_{number:04}")).await.status().as_u16()
        });
    }
    let mut accepted=0;let mut limited=0;
    while let Some(status)=submissions.join_next().await {match status.unwrap(){202=>accepted+=1,429=>limited+=1,other=>panic!("unexpected concurrent quota response {other}")}}
    assert_eq!((accepted,limited),(10,2),"concurrent signed requests must not bypass owner quota");
    let jobs_created:i64=sqlx::query_scalar("SELECT count(*) FROM pit_jobs").fetch_one(&pool).await.unwrap();assert_eq!(jobs_created,10);
    sqlx::query("TRUNCATE pit_jobs,pit_edge_nonces CASCADE").execute(&pool).await.unwrap();
    server.abort();
    sqlx::query("UPDATE pit_jobs SET status='CANCELLED' WHERE status='QUEUED'").execute(&pool).await.unwrap();
    let fake=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let fake_url=format!("http://{}",fake.local_addr().unwrap());
    let fake_server=tokio::spawn(async move {
        let router=axum::Router::new().route("/",axum::routing::post(||async{(axum::http::StatusCode::TOO_MANY_REQUESTS,"rate limit")}));
        axum::serve(fake,router).await.unwrap();
    });
    let retry_id=Uuid::new_v4();
    insert(&pool,retry_id,json!({"chain":"base-sepolia","contract":contract,"fromBlock":1,"toBlock":1}),"QUEUED",None).await;
    let retry_app=test_app(pool.clone(),&fake_url);
    worker::tick(&retry_app).await.unwrap();
    let retry=sqlx::query("SELECT status,error_code,attempts,next_attempt_at>now() AS delayed FROM pit_jobs WHERE id=$1")
        .bind(retry_id).fetch_one(&pool).await.unwrap();
    assert_eq!(retry.get::<String,_>("status"),"QUEUED");
    assert_eq!(retry.get::<String,_>("error_code"),"RPC_RATE_LIMIT");
    assert_eq!(retry.get::<i32,_>("attempts"),1);
    assert!(retry.get::<bool,_>("delayed"));
    sqlx::query("UPDATE pit_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1").bind(retry_id).execute(&pool).await.unwrap();
    worker::tick(&retry_app).await.unwrap();
    let second=sqlx::query("SELECT status,attempts FROM pit_jobs WHERE id=$1").bind(retry_id).fetch_one(&pool).await.unwrap();
    assert_eq!(second.get::<String,_>("status"),"QUEUED");
    assert_eq!(second.get::<i32,_>("attempts"),2);
    sqlx::query("UPDATE pit_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1").bind(retry_id).execute(&pool).await.unwrap();
    worker::tick(&retry_app).await.unwrap();
    let terminal=sqlx::query("SELECT status,error_code,attempts FROM pit_jobs WHERE id=$1")
        .bind(retry_id).fetch_one(&pool).await.unwrap();
    assert_eq!(terminal.get::<String,_>("status"),"FAILED");
    assert_eq!(terminal.get::<String,_>("error_code"),"RPC_RATE_LIMIT");
    assert_eq!(terminal.get::<i32,_>("attempts"),3);
    fake_server.abort();
    let terminal_listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let terminal_url=format!("http://{}",terminal_listener.local_addr().unwrap());
    let terminal_server=tokio::spawn(async move {
        let router=axum::Router::new().route("/",axum::routing::post(||async{
            axum::Json(json!({"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"execution reverted"}}))
        }));
        axum::serve(terminal_listener,router).await.unwrap();
    });
    let terminal_id=Uuid::new_v4();insert(&pool,terminal_id,input.clone(),"QUEUED",None).await;
    worker::tick(&test_app(pool.clone(),&terminal_url)).await.unwrap();
    let terminal_rpc=sqlx::query("SELECT status,error_code,attempts FROM pit_jobs WHERE id=$1")
        .bind(terminal_id).fetch_one(&pool).await.unwrap();
    assert_eq!(terminal_rpc.get::<String,_>("status"),"FAILED");
    assert_eq!(terminal_rpc.get::<String,_>("error_code"),"RPC_REVERT");
    assert_eq!(terminal_rpc.get::<i32,_>("attempts"),1);
    terminal_server.abort();
    let reached=Arc::new(tokio::sync::Notify::new());
    let proceed=Arc::new(tokio::sync::Notify::new());
    let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let delayed_url=format!("http://{}",listener.local_addr().unwrap());
    let reached_handler=reached.clone();let proceed_handler=proceed.clone();
    let delayed_server=tokio::spawn(async move {
        let router=axum::Router::new().route("/",axum::routing::post(move |axum::Json(request):axum::Json<Value>|{
            let reached=reached_handler.clone();let proceed=proceed_handler.clone();
            async move {
                let method=request["method"].as_str().unwrap_or("");
                let result=match method {
                    "eth_chainId"=>json!("0x14a34"),"eth_blockNumber"=>json!("0x20"),
                    "eth_getLogs"=>{reached.notify_one();proceed.notified().await;json!([])},
                    "eth_getBlockByNumber"=>json!({"hash":format!("0x{}","a".repeat(64))}),
                    _=>Value::Null,
                };
                axum::Json(json!({"jsonrpc":"2.0","id":request["id"],"result":result}))
            }
        }));
        axum::serve(listener,router).await.unwrap();
    });
    let cancel_id=Uuid::new_v4();
    insert(&pool,cancel_id,json!({"chain":"base-sepolia","contract":contract,"fromBlock":1,"toBlock":1}),"QUEUED",None).await;
    let cancel_app=test_app(pool.clone(),&delayed_url);
    let processing=tokio::spawn(async move{worker::tick(&cancel_app).await});
    tokio::time::timeout(Duration::from_secs(5),reached.notified()).await.expect("worker reached held RPC log response");
    let cancelled=sqlx::query("UPDATE pit_jobs SET status='CANCELLED',lease_until=NULL WHERE id=$1 AND status='RUNNING'")
        .bind(cancel_id).execute(&pool).await.unwrap();
    assert_eq!(cancelled.rows_affected(),1);
    proceed.notify_one();
    processing.await.unwrap().unwrap();
    let final_row=sqlx::query("SELECT status,result_json,progress_json FROM pit_jobs WHERE id=$1").bind(cancel_id).fetch_one(&pool).await.unwrap();
    assert_eq!(final_row.get::<String,_>("status"),"CANCELLED");
    assert!(final_row.get::<Option<Value>,_>("result_json").is_none(),"cancelled job must not publish a completed result");
    delayed_server.abort();
    let expired_job=Uuid::new_v4();insert(&pool,expired_job,input.clone(),"QUEUED",None).await;
    sqlx::query("UPDATE pit_jobs SET expires_at=now()-interval '1 second' WHERE id=$1").bind(expired_job).execute(&pool).await.unwrap();
    let retained_job=Uuid::new_v4();insert(&pool,retained_job,input.clone(),"QUEUED",None).await;
    let expired_monitor=Uuid::new_v4();
    sqlx::query("INSERT INTO pit_monitors(id,access_hash,invite_hash,chain,contract,rule_json,cursor_block,expires_at) VALUES($1,$2,$3,'base-sepolia',$4,$5,0,now()-interval '1 second')")
        .bind(expired_monitor).bind(auth::hash("expired-monitor-capability")).bind(auth::hash("race-test-invitation")).bind(contract).bind(json!({"type":"mint"})).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO pit_edge_nonces(nonce,expires_at) VALUES($1,now()-interval '1 second')")
        .bind("ffffffffffffffffffffffffffffffff").execute(&pool).await.unwrap();
    worker::cleanup_expired(&pool).await.unwrap();
    let remaining:i64=sqlx::query_scalar("SELECT count(*) FROM pit_jobs WHERE id=$1").bind(expired_job).fetch_one(&pool).await.unwrap();assert_eq!(remaining,0);
    let remaining:i64=sqlx::query_scalar("SELECT count(*) FROM pit_jobs WHERE id=$1").bind(retained_job).fetch_one(&pool).await.unwrap();assert_eq!(remaining,1);
    let remaining:i64=sqlx::query_scalar("SELECT count(*) FROM pit_monitors WHERE id=$1").bind(expired_monitor).fetch_one(&pool).await.unwrap();assert_eq!(remaining,0);
    let remaining:i64=sqlx::query_scalar("SELECT count(*) FROM pit_edge_nonces WHERE nonce=$1").bind("ffffffffffffffffffffffffffffffff").fetch_one(&pool).await.unwrap();assert_eq!(remaining,0);
    let closed=PgPool::connect(&db).await.unwrap();closed.close().await;
    let offline=test_app(closed,&url);
    assert_eq!(worker::tick(&offline).await.unwrap_err(),"DB_UNAVAILABLE");
    let still_queued:String=sqlx::query_scalar("SELECT status FROM pit_jobs WHERE id=$1").bind(retained_job).fetch_one(&pool).await.unwrap();assert_eq!(still_queued,"QUEUED");
    worker::tick(&test_app(pool.clone(),&url)).await.unwrap();
    let recovered:String=sqlx::query_scalar("SELECT status FROM pit_jobs WHERE id=$1").bind(retained_job).fetch_one(&pool).await.unwrap();assert_eq!(recovered,"COMPLETED");
    pool.close().await;
}
