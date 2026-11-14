use crate::{App,auth,config::Config,rpc::Rpc,worker};
use sqlx::{PgPool,Row};
use std::{sync::Arc,time::Duration};
use uuid::Uuid;

#[tokio::test]
async fn restored_v1_schema_and_records(){
    let Ok(url)=std::env::var("PIT_TEST_RESTORE_DATABASE_URL") else {eprintln!("SKIP disposable V1 restore test");return};
    assert_eq!(url,"postgres://corio@127.0.0.1:55439/pit_v21_v1_restored");
    let pool=PgPool::connect(&url).await.unwrap();
    let job=sqlx::query("SELECT status,progress_json,result_json,next_attempt_at FROM pit_jobs WHERE id=$1")
        .bind(Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(job.get::<String,_>("status"),"PARTIAL");
    let progress:serde_json::Value=job.get("progress_json");
    assert_eq!(progress["coverage"][0]["to"],2);
    let result:serde_json::Value=job.get("result_json");
    assert_eq!(result["missing"][0]["from"],3);
    let _:chrono::DateTime<chrono::Utc>=job.get("next_attempt_at");
    let monitor=sqlx::query("SELECT cursor_block,cursor_hash FROM pit_monitors WHERE id=$1")
        .bind(Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(monitor.get::<i64,_>("cursor_block"),42);
    assert_eq!(monitor.get::<Option<String>,_>("cursor_hash").as_deref(),Some("0xabc"));
    let alerts:i64=sqlx::query_scalar("SELECT count(*) FROM pit_alerts WHERE monitor_id=$1")
        .bind(Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(alerts,1);
    let nonces:i64=sqlx::query_scalar("SELECT count(*) FROM pit_edge_nonces WHERE nonce=$1")
        .bind("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").fetch_one(&pool).await.unwrap();
    assert_eq!(nonces,1);
    let expected=[
        ("44444444-4444-4444-8444-444444444444","QUEUED",0),
        ("55555555-5555-4555-8555-555555555555","RUNNING",1),
        ("66666666-6666-4666-8666-666666666666","FAILED",2),
        ("77777777-7777-4777-8777-777777777778","COMPLETED",1),
        ("88888888-8888-4888-8888-888888888888","EXPIRED",1),
        ("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","CANCELLED",1),
    ];
    for (id,status,attempts) in expected {
        let row=sqlx::query("SELECT status,attempts,access_hash,invite_hash FROM pit_jobs WHERE id=$1")
            .bind(Uuid::parse_str(id).unwrap()).fetch_one(&pool).await.unwrap();
        assert_eq!(row.get::<String,_>("status"),status);
        assert_eq!(row.get::<i32,_>("attempts"),attempts);
        assert_eq!(row.get::<String,_>("access_hash").len(),64);
        assert_eq!(row.get::<String,_>("invite_hash").len(),64);
    }
    let running=sqlx::query("SELECT progress_json,claim_token,lease_until<now() AS expired_lease FROM pit_jobs WHERE id=$1")
        .bind(Uuid::parse_str("55555555-5555-4555-8555-555555555555").unwrap()).fetch_one(&pool).await.unwrap();
    let checkpoint:serde_json::Value=running.get("progress_json");
    assert_eq!(checkpoint["coverage"][0]["to"],2);
    assert_eq!(running.get::<Option<Uuid>,_>("claim_token"),Some(Uuid::parse_str("77777777-7777-4777-8777-777777777777").unwrap()));
    assert!(running.get::<bool,_>("expired_lease"));
    let completed:serde_json::Value=sqlx::query_scalar("SELECT result_json FROM pit_jobs WHERE id=$1")
        .bind(Uuid::parse_str("77777777-7777-4777-8777-777777777778").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(completed["expectedTotal"],"3");
    let delivery=sqlx::query("SELECT status,attempts FROM pit_deliveries WHERE alert_id=$1")
        .bind(Uuid::parse_str("33333333-3333-4333-8333-333333333333").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(delivery.get::<String,_>("status"),"QUEUED");
    assert_eq!(delivery.get::<i32,_>("attempts"),1);
    let rpc_url=std::env::var("PIT_TEST_RPC_URL").expect("disposable local Anvil required for restored worker recovery");
    assert_eq!(rpc_url,"http://127.0.0.1:58545");
    let rpc=Rpc::local(rpc_url.clone(),84532,reqwest::Client::new());
    assert!(rpc.head().await.unwrap()>=2,"Anvil fixture needs two blocks");
    sqlx::query("UPDATE pit_jobs SET next_attempt_at=now()+interval '1 hour' WHERE id=$1")
        .bind(Uuid::parse_str("44444444-4444-4444-8444-444444444444").unwrap()).execute(&pool).await.unwrap();
    let app=App{pool:pool.clone(),config:Config{database_url:url,invite_hash:auth::hash("restore-local-invite"),edge_key:"restore_local_hmac_key_32_bytes_0000".into(),allowed_origin:"http://127.0.0.1:4300".into(),nft_enabled:false,port:0,allowed_emails:vec![],local_rpc_url:Some(rpc_url),local_smtp:None,local_metadata_origin:None},http:reqwest::Client::builder().timeout(Duration::from_secs(12)).build().unwrap(),request_gate:Arc::new(tokio::sync::Semaphore::new(32))};
    worker::tick(&app).await.unwrap();
    let recovered=sqlx::query("SELECT status,attempts,result_json FROM pit_jobs WHERE id=$1")
        .bind(Uuid::parse_str("55555555-5555-4555-8555-555555555555").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(recovered.get::<String,_>("status"),"COMPLETED");
    assert_eq!(recovered.get::<i32,_>("attempts"),2);
    let result:serde_json::Value=recovered.get("result_json");
    assert_eq!(result["status"],"COMPLETE");
    assert_eq!(result["missing"],serde_json::json!([]));
    let cancelled:String=sqlx::query_scalar("SELECT status FROM pit_jobs WHERE id=$1")
        .bind(Uuid::parse_str("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(cancelled,"CANCELLED");
    pool.close().await;
}
