use crate::{rpc::{self,Rpc},tools};
use alloy::primitives::U256;
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use sqlx::{PgPool,Row};
use uuid::Uuid;

#[derive(Clone,Deserialize,Serialize)]
#[serde(deny_unknown_fields,rename_all="camelCase")]
pub struct MonitorInput {pub chain:String,pub contract:String,pub start_block:u64,pub rule:Value,#[serde(default)]pub email:Option<String>}
pub fn validate(input:&Value)->Result<MonitorInput,String>{
    let v:MonitorInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;
    crate::config::chain(&v.chain).ok_or("UNSUPPORTED_CHAIN")?;rpc::address(&v.contract)?;
    let kind=v.rule["type"].as_str().ok_or("VALIDATION_ERROR")?;
    if !["transfer-threshold","mint","burn","ownership","roles","pause","proxy-upgrade"].contains(&kind){return Err("VALIDATION_ERROR".into())}
    let expected=if kind=="transfer-threshold"{2}else{1};if v.rule.as_object().map(|x|x.len())!=Some(expected){return Err("VALIDATION_ERROR".into())}
    if kind=="transfer-threshold"&&v.rule["minimum"].as_str().filter(|s|!s.is_empty()&&s.len()<=78&&s.bytes().all(|b|b.is_ascii_digit())&&s.parse::<U256>().is_ok()).is_none(){return Err("VALIDATION_ERROR".into())}
    if v.email.as_ref().is_some_and(|e|e.len()>254||!e.contains('@')||e.contains(['\r','\n'])){return Err("VALIDATION_ERROR".into())}Ok(v)
}
pub fn matches(log:&Value,rule:&Value)->bool{
    let signature=log["signature"].as_str().unwrap_or("").to_ascii_lowercase();let kind=rule["type"].as_str().unwrap_or("");
    let topics=log["topics"].as_array();
    let transfer=rpc::event_sig("Transfer(address,address,uint256)");
    match kind {
        "transfer-threshold"|"mint"|"burn"=>{if signature!=transfer{return false}let Some(topics)=topics else{return false};if topics.len()<3{return false};let zero=format!("0x{}","0".repeat(40));
            if kind=="mint"{return topics[1].as_str().unwrap_or("").ends_with(&zero[2..])}
            if kind=="burn"{return topics[2].as_str().unwrap_or("").ends_with(&zero[2..])}
            let value=U256::from_str_radix(log["data"].as_str().unwrap_or("").trim_start_matches("0x"),16).ok();let minimum=rule["minimum"].as_str().and_then(|x|x.parse::<U256>().ok());matches!((value,minimum),(Some(v),Some(m)) if v>=m)
        },
        "ownership"=>signature==rpc::event_sig("OwnershipTransferred(address,address)"),
        "roles"=>signature==rpc::event_sig("RoleGranted(bytes32,address,address)")||signature==rpc::event_sig("RoleRevoked(bytes32,address,address)"),
        "pause"=>signature==rpc::event_sig("Paused(address)")||signature==rpc::event_sig("Unpaused(address)"),
        "proxy-upgrade"=>signature==rpc::event_sig("Upgraded(address)"),
        _=>false
    }
}
pub async fn poll_one(pool:&PgPool,http:&reqwest::Client,local_rpc:Option<&str>)->Result<bool,String>{
    let mut tx=pool.begin().await.map_err(|_|"DB_UNAVAILABLE")?;
    let monitor=sqlx::query("SELECT id,chain,contract,rule_json,cursor_block,cursor_hash,lease_token,email FROM pit_monitors WHERE status='ACTIVE' AND next_poll_at<=now() AND expires_at>now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_poll_at FOR UPDATE SKIP LOCKED LIMIT 1")
        .fetch_optional(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
    let Some(m)=monitor else{tx.commit().await.map_err(|_|"DB_UNAVAILABLE")?;return Ok(false)};
    let id:Uuid=m.get("id");let lease=Uuid::new_v4();
    sqlx::query("UPDATE pit_monitors SET lease_until=now()+interval '2 minutes',lease_token=$2 WHERE id=$1").bind(id).bind(lease).execute(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
    tx.commit().await.map_err(|_|"DB_UNAVAILABLE")?;
    let chain:String=m.get("chain");let contract:String=m.get("contract");let rule:Value=m.get("rule_json");let mut cursor:i64=m.get("cursor_block");let rpc=Rpc::with_local(&chain,http,local_rpc)?;
    rpc.assert_chain().await?;let head=rpc.head().await?;let safe=head.saturating_sub(12);
    if let Some(previous)=m.get::<Option<String>,_>("cursor_hash") {if cursor>0&&rpc.block_hash(cursor as u64).await?.to_ascii_lowercase()!=previous.to_ascii_lowercase(){cursor=(cursor-12).max(0);sqlx::query("UPDATE pit_alerts SET status='REORGANIZED' WHERE monitor_id=$1 AND block_number>$2").bind(id).bind(cursor).execute(pool).await.map_err(|_|"DB_UNAVAILABLE")?;}}
    if safe<=cursor.max(0) as u64 {defer(pool,id,lease).await?;return Ok(true)}
    let from=(cursor+1) as u64;let to=(cursor as u64+500).min(safe);
    let result=tools::events(&json!({"chain":chain,"contract":contract,"fromBlock":from,"toBlock":to}),&rpc).await?;
    if result["status"]!="COMPLETE"{defer(pool,id,lease).await?;return Ok(true)}
    let matched:Vec<_>=result["events"].as_array().into_iter().flatten().filter(|e|matches(e,&rule)).collect();
    if matched.len()>20 {sqlx::query("UPDATE pit_monitors SET status='PAUSED',lease_until=NULL WHERE id=$1 AND lease_token=$2").bind(id).bind(lease).execute(pool).await.map_err(|_|"DB_UNAVAILABLE")?;return Ok(true)}
    let hash=rpc.block_hash(to).await?;let mut tx=pool.begin().await.map_err(|_|"DB_UNAVAILABLE")?;
    for event in matched {let alert_id=Uuid::new_v4();let inserted=sqlx::query("INSERT INTO pit_alerts(id,monitor_id,chain_id,block_hash,block_number,transaction_hash,log_index,event_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id")
            .bind(alert_id).bind(id).bind(rpc.chain_id() as i32).bind(event["blockHash"].as_str().unwrap_or("")).bind(event["blockNumber"].as_i64().unwrap_or(0)).bind(event["transactionHash"].as_str().unwrap_or("")).bind(event["logIndex"].as_i64().unwrap_or(0) as i32).bind(event).fetch_optional(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
        if inserted.is_some(){if let Some(email)=m.get::<Option<String>,_>("email"){sqlx::query("INSERT INTO pit_deliveries(id,alert_id,email) VALUES($1,$2,$3) ON CONFLICT DO NOTHING").bind(Uuid::new_v4()).bind(alert_id).bind(email).execute(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;}}
    }
    let updated=sqlx::query("UPDATE pit_monitors SET cursor_block=$2,cursor_hash=$3,next_poll_at=now()+interval '30 seconds',lease_until=NULL WHERE id=$1 AND lease_token=$4 AND status='ACTIVE'")
        .bind(id).bind(to as i64).bind(hash).bind(lease).execute(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
    if updated.rows_affected()!=1{return Err("STALE_LEASE".into())}
    tx.commit().await.map_err(|_|"DB_UNAVAILABLE")?;Ok(true)
}
async fn defer(pool:&PgPool,id:Uuid,lease:Uuid)->Result<(),String>{sqlx::query("UPDATE pit_monitors SET lease_until=NULL,next_poll_at=now()+interval '30 seconds' WHERE id=$1 AND lease_token=$2").bind(id).bind(lease).execute(pool).await.map_err(|_|"DB_UNAVAILABLE")?;Ok(())}

#[cfg(test)]mod tests{use super::*;#[test]fn rules(){let t=rpc::event_sig("Transfer(address,address,uint256)");let e=json!({"signature":t,"topics":[t,format!("0x{}","0".repeat(64)),format!("0x{:064x}",1)],"data":"0x64"});assert!(matches(&e,&json!({"type":"mint"})));assert!(matches(&e,&json!({"type":"transfer-threshold","minimum":"100"})));assert!(!matches(&e,&json!({"type":"transfer-threshold","minimum":"101"})));}}
