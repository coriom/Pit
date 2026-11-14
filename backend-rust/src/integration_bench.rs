use crate::{App,auth,config::Config,event_abi,rpc::Rpc,tools,worker};
use serde_json::{json,Value};
use std::{sync::Arc,time::Instant};
use sqlx::{PgPool,Row};
use uuid::Uuid;

#[tokio::test]
async fn bounded_local_event_scan_benchmark(){
    if std::env::var("PIT_BENCH_LOCAL").ok().as_deref()!=Some("1"){return}
    let url=std::env::var("PIT_TEST_RPC_URL").expect("local Anvil required");
    assert_eq!(url,"http://127.0.0.1:58545");
    let fixture:Value=serde_json::from_str(&std::fs::read_to_string("/tmp/pit-v2-parity-local.json").unwrap()).unwrap();
    let input=json!({"chain":"base-sepolia","contract":fixture["token"],"fromBlock":fixture["from"],"toBlock":fixture["last"]});
    let rpc=Rpc::local(url,84532,reqwest::Client::new());
    let mut samples=Vec::new();
    for i in 0..8 {
        let started=Instant::now();let result=tools::events(&input,&rpc).await.unwrap();
        assert_eq!(result["status"],"COMPLETE");assert_eq!(result["events"].as_array().unwrap().len(),2);
        if i>0{samples.push(started.elapsed().as_secs_f64()*1000.0)}
    }
    samples.sort_by(|a,b|a.total_cmp(b));
    let rss=std::fs::read_to_string("/proc/self/status").unwrap().lines().find(|line|line.starts_with("VmRSS:")).unwrap().to_owned();
    println!("PIT_RUST_SCAN_BENCH samples_ms={samples:?} median_ms={:.2} range_ms={:.2}-{:.2} {}",samples[3],samples[0],samples[6],rss);
    let mut rpc_samples=Vec::new();for i in 0..8 {let started=Instant::now();rpc.head().await.unwrap();if i>0{rpc_samples.push(started.elapsed().as_secs_f64()*1000.0)}}
    rpc_samples.sort_by(|a,b|a.total_cmp(b));println!("PIT_RUST_RPC_HEAD_BENCH median_ms={:.2} range_ms={:.2}-{:.2}",rpc_samples[3],rpc_samples[0],rpc_samples[6]);
    let abi=event_abi::compile(Some(&[json!({"type":"event","name":"Transfer","inputs":[{"name":"from","type":"address","indexed":true},{"name":"to","type":"address","indexed":true},{"name":"value","type":"uint256","indexed":false}]})])).unwrap();
    let topics=vec![json!(crate::rpc::event_sig("Transfer(address,address,uint256)")),json!(format!("0x{:064x}",1)),json!(format!("0x{:064x}",2))];
    let data=json!(format!("0x{:064x}",123456789u64));let mut decode_samples=Vec::new();
    for i in 0..8 {let started=Instant::now();for _ in 0..1000 {let decoded=event_abi::decode(&abi,&topics,&data).unwrap();std::hint::black_box(decoded);}if i>0{decode_samples.push(started.elapsed().as_secs_f64()*1000.0)}}
    decode_samples.sort_by(|a,b|a.total_cmp(b));println!("PIT_RUST_DECODE_1000_BENCH median_ms={:.2} range_ms={:.2}-{:.2}",decode_samples[3],decode_samples[0],decode_samples[6]);
}

#[tokio::test]
async fn bounded_local_full_job_benchmark(){
    if std::env::var("PIT_BENCH_LOCAL").ok().as_deref()!=Some("1"){return}
    let db=std::env::var("PIT_BENCH_DATABASE_URL").expect("disposable local PostgreSQL required");
    assert_eq!(db,"postgres://corio@127.0.0.1:55439/pit_v22_bench");
    let url=std::env::var("PIT_TEST_RPC_URL").expect("local Anvil required");
    assert_eq!(url,"http://127.0.0.1:58545");
    let fixture:Value=serde_json::from_str(&std::fs::read_to_string("/tmp/pit-v2-parity-local.json").unwrap()).unwrap();
    let input=json!({"chain":"base-sepolia","contract":fixture["token"],"fromBlock":fixture["from"],"toBlock":fixture["last"]});
    let pool=PgPool::connect(&db).await.unwrap();
    for sql in [include_str!("../../backend/migrations/001_init.sql"),include_str!("../../backend/migrations/002_edge_nonces.sql"),include_str!("../migrations/003_retry_schedule.sql")]{sqlx::raw_sql(sql).execute(&pool).await.unwrap();}
    sqlx::query("TRUNCATE pit_jobs CASCADE").execute(&pool).await.unwrap();
    let app=App{pool:pool.clone(),config:Config{database_url:db,invite_hash:auth::hash("bench-invite"),edge_key:"benchmark_local_hmac_key_32_bytes".into(),allowed_origin:"http://127.0.0.1:4300".into(),nft_enabled:false,port:0,allowed_emails:vec![],local_rpc_url:Some(url),local_smtp:None,local_metadata_origin:None},http:reqwest::Client::new(),request_gate:Arc::new(tokio::sync::Semaphore::new(32))};
    let mut samples=Vec::new();
    for i in 0..8 {
        let id=Uuid::new_v4();
        sqlx::query("INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json) VALUES($1,'events',$2,$3,$4)")
            .bind(id).bind(auth::hash("bench-access")).bind(auth::hash("bench-invite")).bind(&input).execute(&pool).await.unwrap();
        let started=Instant::now();worker::tick(&app).await.unwrap();
        let state=sqlx::query("SELECT status,result_json FROM pit_jobs WHERE id=$1").bind(id).fetch_one(&pool).await.unwrap();
        assert_eq!(state.get::<String,_>("status"),"COMPLETED");
        let result:Value=state.get("result_json");assert_eq!(result["events"].as_array().unwrap().len(),2);
        if i>0{samples.push(started.elapsed().as_secs_f64()*1000.0)}
    }
    samples.sort_by(|a,b|a.total_cmp(b));
    println!("PIT_RUST_FULL_JOB_BENCH samples_ms={samples:?} median_ms={:.2} range_ms={:.2}-{:.2}",samples[3],samples[0],samples[6]);
    let mut db_samples=Vec::new();for i in 0..8 {let started=Instant::now();sqlx::query("SELECT 1").execute(&pool).await.unwrap();if i>0{db_samples.push(started.elapsed().as_secs_f64()*1000.0)}}
    db_samples.sort_by(|a,b|a.total_cmp(b));println!("PIT_RUST_PG_ROUNDTRIP_BENCH median_ms={:.2} range_ms={:.2}-{:.2}",db_samples[3],db_samples[0],db_samples[6]);
    pool.close().await;
}
