use crate::{event_abi, rpc::{self, Rpc}, tools::{self, RangeInput}};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::collections::{BTreeSet, HashMap};
use tokio::time::{sleep, Duration};
use uuid::Uuid;

pub struct Checkpoint<'a> {
    pub pool: &'a PgPool,
    pub job_id: Uuid,
    pub claim_token: Uuid,
}

impl Checkpoint<'_> {
    async fn save(&self, value: &Value) -> Result<(), String> {
        let saved = sqlx::query("UPDATE pit_jobs SET progress_json=$3,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1 AND claim_token=$2 AND status='RUNNING'")
            .bind(self.job_id).bind(self.claim_token).bind(value).execute(self.pool).await.map_err(|_| "DB_UNAVAILABLE")?;
        if saved.rows_affected() != 1 { return Err("STALE_LEASE".into()); }
        Ok(())
    }
}

fn range_error(code: &str) -> bool {
    let code = code.to_ascii_lowercase();
    ["range", "too many results", "response size", "possibly_truncated", "limit exceeded"].iter().any(|part| code.contains(part))
}

fn gaps(from: u64, to: u64, completed: &[(u64, u64)]) -> Vec<(u64, u64)> {
    let mut remaining = vec![(from, to)];
    for &(a, b) in completed {
        remaining = remaining.into_iter().flat_map(|(x, y)| {
            if b < x || a > y { return vec![(x, y)]; }
            let mut next = Vec::new();
            if x < a { next.push((x, a - 1)); }
            if b < y { next.push((b + 1, y)); }
            next
        }).collect();
    }
    remaining
}

async fn resume_valid(rpc: &Rpc, input: &RangeInput, resume: &Value) -> Option<(Vec<Value>, Vec<Value>, Vec<Value>)> {
    let coverage = resume["coverage"].as_array()?.clone();
    let events = resume["events"].as_array()?.clone();
    if coverage.len() > 120 || events.len() > 5000 { return None; }
    let mut completed = Vec::new();
    for interval in &coverage {
        let from = interval["from"].as_u64()?;
        let to = interval["to"].as_u64()?;
        if from < input.from_block || to > input.to_block || from > to { return None; }
        let actual = rpc.block_hash(to).await.ok()?;
        if !actual.eq_ignore_ascii_case(interval["toHash"].as_str()?) { return None; }
        completed.push(json!([from, to]));
    }
    let mut block_hashes = HashMap::new();
    for event in &events {
        let block = event["blockNumber"].as_u64()?;
        if event["chainId"].as_u64()? != rpc.chain_id()
            || !event["contract"].as_str()?.eq_ignore_ascii_case(&input.contract)
            || !coverage.iter().any(|r| r["from"].as_u64().unwrap_or(u64::MAX) <= block && block <= r["to"].as_u64().unwrap_or(0)) { return None; }
        let canonical = if let Some(hash) = block_hashes.get(&block) { hash } else {
            block_hashes.insert(block, rpc.block_hash(block).await.ok()?);
            block_hashes.get(&block)?
        };
        if !canonical.eq_ignore_ascii_case(event["blockHash"].as_str()?) { return None; }
    }
    Some((events, completed, coverage))
}

async fn checked_logs(rpc: &Rpc, input: &RangeInput, abi: &[alloy_json_abi::Event], from: u64, to: u64, logs: &[Value]) -> Result<Vec<Value>, String> {
    let mut block_hashes = HashMap::new();
    let mut batch = Vec::new();
    for log in logs {
        let block = rpc::hex_u64(&log["blockNumber"])?;
        let contract = log["address"].as_str().ok_or("RPC_LOG_MISMATCH")?;
        if block < from || block > to || !contract.eq_ignore_ascii_case(&input.contract) { return Err("RPC_LOG_MISMATCH".into()); }
        let hash = log["blockHash"].as_str().ok_or("RPC_LOG_MISMATCH")?;
        if !block_hashes.contains_key(&block) { block_hashes.insert(block, rpc.block_hash(block).await?); }
        if !block_hashes[&block].eq_ignore_ascii_case(hash) { return Err("REORGANIZED".into()); }
        let transaction = log["transactionHash"].as_str().ok_or("RPC_LOG_MISMATCH")?;
        let index = rpc::hex_u64(&log["logIndex"])?;
        let topics = log["topics"].as_array().ok_or("RPC_LOG_MISMATCH")?;
        let data = log["data"].as_str().ok_or("RPC_LOG_MISMATCH")?;
        let decoded = if input.abi.is_some() { event_abi::decode(abi, topics, &json!(data)).unwrap_or(Value::Null) } else { tools::decode_known(topics, &json!(data)) };
        batch.push(json!({
            "id":format!("{}:{}:{}", hash.to_ascii_lowercase(), transaction.to_ascii_lowercase(), index),
            "chainId":rpc.chain_id(), "contract":contract, "blockNumber":block,
            "blockHash":hash, "transactionHash":transaction,
            "transactionIndex":rpc::hex_u64(&log["transactionIndex"])?, "logIndex":index,
            "signature":topics.first(), "topics":topics, "data":data, "decoded":decoded,
        }));
    }
    Ok(batch)
}

pub async fn scan(input: &Value, rpc: &Rpc, resume: Option<&Value>, checkpoint: Option<&Checkpoint<'_>>) -> Result<Value, String> {
    let input: RangeInput = serde_json::from_value(input.clone()).map_err(|_| "VALIDATION_ERROR")?;
    rpc.assert_chain().await?;
    let abi = event_abi::compile(input.abi.as_deref())?;
    let head = rpc.head().await?;
    let safe = head.saturating_sub(12);
    let end = input.to_block.min(safe);
    let (mut events, mut completed, mut coverage) = match resume {
        Some(previous) => resume_valid(rpc, &input, previous).await.unwrap_or_default(),
        None => (Vec::new(), Vec::new(), Vec::new()),
    };
    let mut seen: BTreeSet<String> = events.iter().filter_map(|e| e["id"].as_str().map(str::to_owned)).collect();
    let mut missing = Vec::new();
    let mut requests = 0u32;
    let mut chunk = input.from_block;
    while chunk <= end {
        let chunk_end = chunk.saturating_add(499).min(end);
        let covered: Vec<_> = completed.iter().filter_map(|v| Some((v[0].as_u64()?, v[1].as_u64()?))).collect();
        for (gap_from, gap_to) in gaps(chunk, chunk_end, &covered) {
            let mut pending = vec![(gap_from, gap_to)];
            while let Some((from, to)) = pending.pop() {
                if requests >= 120 { missing.push(json!({"from":from,"to":to,"reason":"RPC_BUDGET"})); continue; }
                let mut filter = json!({"address":input.contract,"fromBlock":rpc::hex_number(from),"toBlock":rpc::hex_number(to)});
                if let Some(topic) = &input.topic0 { filter["topics"] = json!([topic]); }
                let mut response = Err("RPC_UNAVAILABLE".to_owned());
                for retry in 0..3 {
                    requests += 1;
                    response = rpc.call("eth_getLogs", json!([filter])).await;
                    if response.is_ok() || response.as_ref().is_err_and(|code| range_error(code)) || requests >= 120 { break; }
                    sleep(Duration::from_millis(200 * (1 << retry))).await;
                }
                let split = match &response {
                    Ok(Value::Array(logs)) => logs.len() >= 900 || events.len() + logs.len() > 5000,
                    Err(code) => range_error(code),
                    _ => false,
                };
                if split && from < to && requests < 120 {
                    let middle = (from + to) / 2;
                    pending.push((middle + 1, to)); pending.push((from, middle)); continue;
                }
                let batch = match response {
                    Ok(Value::Array(logs)) if !split => checked_logs(rpc, &input, &abi, from, to, &logs).await,
                    Ok(_) => Err("RPC_LOG_LIMIT_OR_INVALID_RESPONSE".into()),
                    Err(code) => Err(code),
                };
                match batch {
                    Ok(batch) => {
                        let to_hash = match rpc.block_hash(to).await {
                            Ok(hash) => hash,
                            Err(code) => {
                                missing.push(json!({"from":from,"to":to,"reason":code.chars().take(100).collect::<String>()}));
                                continue;
                            }
                        };
                        for event in batch { if let Some(id) = event["id"].as_str() { if seen.insert(id.to_owned()) { events.push(event); } } }
                        completed.push(json!([from, to])); coverage.push(json!({"from":from,"to":to,"toHash":to_hash}));
                        if let Some(checkpoint) = checkpoint {
                            checkpoint.save(&json!({"completed":completed,"coverage":coverage,"missing":missing,"count":events.len(),"events":events})).await?;
                        }
                    }
                    Err(code) => missing.push(json!({"from":from,"to":to,"reason":code.chars().take(100).collect::<String>()})),
                }
            }
        }
        if chunk_end == u64::MAX { break; }
        chunk = chunk_end + 1;
    }
    if end < input.to_block { missing.push(json!({"from":input.from_block.max(end.saturating_add(1)),"to":input.to_block,"reason":"UNCONFIRMED_HEAD"})); }
    events.sort_by_key(|event| (event["blockNumber"].as_u64().unwrap_or(0), event["transactionIndex"].as_u64().unwrap_or(0), event["logIndex"].as_u64().unwrap_or(0)));
    completed.sort_by_key(|interval| interval[0].as_u64().unwrap_or(0));
    coverage.sort_by_key(|interval| interval["from"].as_u64().unwrap_or(0));
    let intervals: Vec<_> = completed.iter().filter_map(|v| Some((v[0].as_u64()?, v[1].as_u64()?))).collect();
    let complete = end == input.to_block && missing.is_empty() && gaps(input.from_block, end, &intervals).is_empty();
    Ok(json!({"status":if complete {"COMPLETE"} else {"PARTIAL"},"requested":[input.from_block,input.to_block],
        "completed":completed,"coverage":coverage,"missing":missing,"events":events,"rpcLogRequests":requests,
        "providerLimitation":"Public RPC providers may omit logs below their retention horizon; completeness assumes conforming eth_getLogs responses below the split threshold."}))
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn skips_exact_covered_intervals() {
        assert_eq!(gaps(0, 9, &[(2, 4), (7, 8)]), vec![(0, 1), (5, 6), (9, 9)]);
        assert!(gaps(0, 9, &[(0, 9)]).is_empty());
    }
    #[tokio::test]
    async fn failed_second_range_is_partial(){
        if std::env::var("PIT_TEST_RPC_FAILURE").ok().as_deref()!=Some("1"){return}
        use axum::{routing::post,Json,Router};
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url=format!("http://{}",listener.local_addr().unwrap());
        let router=Router::new().route("/",post(|Json(request):Json<Value>|async move{
            let method=request["method"].as_str().unwrap_or("");
            let id=request["id"].clone();
            if method=="eth_getLogs"&&request["params"][0]["fromBlock"]=="0x1f5" {
                Json(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":"fixture provider unavailable"}}))
            }else{
                let result=match method {"eth_chainId"=>json!("0x14a34"),"eth_blockNumber"=>json!("0x26c"),
                    "eth_getLogs"=>json!([]),"eth_getBlockByNumber"=>json!({"hash":format!("0x{}","a".repeat(64))}),_=>Value::Null};
                Json(json!({"jsonrpc":"2.0","id":id,"result":result}))
            }
        }));
        let server=tokio::spawn(async move{axum::serve(listener,router).await.unwrap()});
        let rpc=Rpc::local(url,84532,reqwest::Client::new());
        let result=scan(&json!({"chain":"base-sepolia","contract":"0x1111111111111111111111111111111111111111","fromBlock":1,"toBlock":600}),&rpc,None,None).await.unwrap();
        assert_eq!(result["status"],"PARTIAL");assert_eq!(result["completed"],json!([[1,500]]));
        assert_eq!(result["missing"][0]["from"],501);assert_eq!(result["missing"][0]["to"],600);
        server.abort();
    }
}
