use crate::{rpc::Rpc,tools};
use serde_json::{json,Value};
use std::time::Instant;

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
}
