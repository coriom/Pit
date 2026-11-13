use crate::{config, rpc::{self,Rpc},safe_http};
use alloy::primitives::U256;
use sha2::Digest;
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{collections::{BTreeMap,BTreeSet,HashMap},str::FromStr};

#[derive(Clone,Deserialize,Serialize)]
#[serde(deny_unknown_fields,rename_all="camelCase")]
pub struct RangeInput {pub chain:String,pub contract:String,pub from_block:u64,pub to_block:u64,#[serde(default)]pub topic0:Option<String>,#[serde(default)]pub abi:Option<Vec<Value>>}
#[derive(Clone,Deserialize,Serialize)]
#[serde(deny_unknown_fields,rename_all="camelCase")]
pub struct DistributionInput {pub chain:String,pub token:String,pub csv:String,pub transaction_hashes:Vec<String>}
#[derive(Clone,Deserialize,Serialize)]
#[serde(deny_unknown_fields,rename_all="camelCase")]
pub struct NftInput {pub chain:String,pub contract:String,pub token_ids:Vec<String>}

pub fn validate(kind:&str,input:&Value,nft_enabled:bool)->Result<Value,String>{
    match kind {
        "events"|"permissions"=>{
            let mut v:RangeInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;
            if kind=="permissions" && (v.topic0.is_some()||v.abi.is_some()) { return Err("VALIDATION_ERROR".into()) }
            config::chain(&v.chain).ok_or("UNSUPPORTED_CHAIN")?;rpc::address(&v.contract)?;
            if v.to_block<v.from_block||v.to_block-v.from_block>=20_000 {return Err("BLOCK_RANGE_LIMIT".into())}
            if let Some(t)=&v.topic0 {rpc::hash32(t)?;}
            if v.abi.as_ref().is_some_and(|a|a.len()>30){return Err("VALIDATION_ERROR".into())}
            if kind=="permissions" {v.abi=None;v.topic0=None;}
            serde_json::to_value(v).map_err(|_|"VALIDATION_ERROR".into())
        },
        "distribution"=>{
            let v:DistributionInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;
            config::chain(&v.chain).ok_or("UNSUPPORTED_CHAIN")?;rpc::address(&v.token)?;
            if v.csv.len()>80_000||v.transaction_hashes.is_empty()||v.transaction_hashes.len()>20{return Err("VALIDATION_ERROR".into())}
            for h in &v.transaction_hashes {rpc::hash32(h)?;}
            serde_json::to_value(v).map_err(|_|"VALIDATION_ERROR".into())
        },
        "nft"=>{
            if !nft_enabled {return Err("NFT_FETCH_DISABLED".into())}
            let v:NftInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;
            config::chain(&v.chain).ok_or("UNSUPPORTED_CHAIN")?;rpc::address(&v.contract)?;
            if v.token_ids.is_empty()||v.token_ids.len()>25||v.token_ids.iter().any(|x|x.len()>78||x.parse::<U256>().is_err()){return Err("VALIDATION_ERROR".into())}
            serde_json::to_value(v).map_err(|_|"VALIDATION_ERROR".into())
        },
        _=>Err("UNSUPPORTED_JOB".into())
    }
}

pub async fn run(kind:&str,input:&Value,rpc:&Rpc)->Result<Value,String>{
    match kind {
        "events"=>events(input,rpc).await,
        "permissions"=>permissions(input,rpc).await,
        "distribution"=>distribution(input,rpc).await,
        "nft"=>nft(input,rpc).await,
        _=>Err("UNSUPPORTED_JOB".into())
    }
}

pub async fn events(input:&Value,rpc:&Rpc)->Result<Value,String>{
    let v:RangeInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;
    rpc.assert_chain().await?;
    let head=rpc.head().await?;let safe=head.saturating_sub(12);let end=v.to_block.min(safe);
    let mut rows=Vec::<Value>::new();let mut completed=Vec::<Value>::new();let mut coverage=Vec::<Value>::new();let mut missing=Vec::<Value>::new();let mut seen=BTreeSet::<String>::new();
    let mut requests=0u32;let mut ranges=Vec::<(u64,u64)>::new();
    if end>=v.from_block {let mut cursor=v.from_block;while cursor<=end {let to=(cursor+499).min(end);ranges.push((cursor,to));cursor=to+1;}}
    while let Some((from,to))=ranges.pop(){
        if requests>=120 {missing.push(json!({"from":from,"to":to,"reason":"RPC_BUDGET"}));continue}
        requests+=1;
        let mut filter=json!({"address":v.contract,"fromBlock":rpc::hex_number(from),"toBlock":rpc::hex_number(to)});
        if let Some(t)=&v.topic0 {filter["topics"]=json!([t]);}
        let fetched=rpc.call("eth_getLogs",json!([filter])).await;
        match fetched {
            Ok(Value::Array(logs)) if logs.len()<900 && rows.len()+logs.len()<=5000=>{
                let mut valid=true;let mut batch=Vec::new();let mut block_cache=HashMap::<u64,String>::new();
                for log in logs {
                    let bn=rpc::hex_u64(&log["blockNumber"])?;
                    let contract=log["address"].as_str().unwrap_or("");
                    if bn<from||bn>to||!contract.eq_ignore_ascii_case(&v.contract){valid=false;break}
                    let block_hash=log["blockHash"].as_str().unwrap_or("");
                    let canonical=if let Some(h)=block_cache.get(&bn){h.clone()}else{let h=rpc.block_hash(bn).await?;block_cache.insert(bn,h.clone());h};
                    if !canonical.eq_ignore_ascii_case(block_hash){valid=false;break}
                    let tx=log["transactionHash"].as_str().unwrap_or("");let index=rpc::hex_u64(&log["logIndex"])?;
                    let id=format!("{}:{}:{}",block_hash.to_ascii_lowercase(),tx.to_ascii_lowercase(),index);
                    if seen.insert(id.clone()) {let topics=log["topics"].as_array().cloned().unwrap_or_default();
                        let signature=topics.first().and_then(Value::as_str).map(str::to_owned);
                        let decoded=decode_known(&topics,&log["data"]);
                        batch.push(json!({"id":id,"chainId":rpc.chain_id(),"contract":contract,"blockNumber":bn,"blockHash":block_hash,"transactionHash":tx,"transactionIndex":rpc::hex_u64(&log["transactionIndex"]).unwrap_or(0),"logIndex":index,"signature":signature,"topics":topics,"data":log["data"],"decoded":decoded}));}
                }
                if !valid {missing.push(json!({"from":from,"to":to,"reason":"REORGANIZED_OR_RPC_LOG_MISMATCH"}));continue}
                let to_hash=rpc.block_hash(to).await?;rows.extend(batch);completed.push(json!([from,to]));coverage.push(json!({"from":from,"to":to,"toHash":to_hash}));
            },
            Ok(Value::Array(logs)) if from<to && (logs.len()>=900||rows.len()+logs.len()>5000)=>{let mid=(from+to)/2;ranges.push((mid+1,to));ranges.push((from,mid));},
            Err(e) if from<to && (e.contains("range")||e.contains("results")||e.contains("response size"))=>{let mid=(from+to)/2;ranges.push((mid+1,to));ranges.push((from,mid));},
            Ok(_) => missing.push(json!({"from":from,"to":to,"reason":"RPC_LOG_LIMIT_OR_INVALID_RESPONSE"})),
            Err(e)=>missing.push(json!({"from":from,"to":to,"reason":e.chars().take(100).collect::<String>()})),
        }
    }
    if safe<v.to_block {missing.push(json!({"from":v.from_block.max(safe+1),"to":v.to_block,"reason":"UNCONFIRMED_HEAD"}));}
    rows.sort_by_key(|r|(r["blockNumber"].as_u64().unwrap_or(0),r["transactionIndex"].as_u64().unwrap_or(0),r["logIndex"].as_u64().unwrap_or(0)));
    completed.sort_by_key(|r|r[0].as_u64().unwrap_or(0));coverage.sort_by_key(|r|r["from"].as_u64().unwrap_or(0));
    Ok(json!({"status":if missing.is_empty(){"COMPLETE"}else{"PARTIAL"},"requested":[v.from_block,v.to_block],"completed":completed,"coverage":coverage,"missing":missing,"events":rows,"rpcLogRequests":requests,"providerLimitation":"Public RPC completeness depends on conforming provider responses and historical retention."}))
}

fn topic_address(topic:&Value)->Option<String>{let s=topic.as_str()?;if s.len()!=66 {return None}Some(format!("0x{}",&s[26..]).to_ascii_lowercase())}
fn decode_known(topics:&[Value],data:&Value)->Value{
    let signature=topics.first().and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
    if signature==rpc::event_sig("Transfer(address,address,uint256)") && topics.len()>=3 {
        let value=U256::from_str_radix(data.as_str().unwrap_or("0x").trim_start_matches("0x"),16).ok();
        return json!({"eventName":"Transfer","args":{"from":topic_address(&topics[1]),"to":topic_address(&topics[2]),"value":value.map(|v|v.to_string())}})
    }
    if signature==rpc::event_sig("OwnershipTransferred(address,address)") && topics.len()>=3 {return json!({"eventName":"OwnershipTransferred","args":{"previousOwner":topic_address(&topics[1]),"newOwner":topic_address(&topics[2])}})}
    if (signature==rpc::event_sig("RoleGranted(bytes32,address,address)")||signature==rpc::event_sig("RoleRevoked(bytes32,address,address)"))&&topics.len()>=4 {return json!({"eventName":if signature==rpc::event_sig("RoleGranted(bytes32,address,address)"){"RoleGranted"}else{"RoleRevoked"},"args":{"role":topics[1],"account":topic_address(&topics[2]),"sender":topic_address(&topics[3])}})}
    Value::Null
}

async fn optional_call(rpc:&Rpc,address:&str,selector:&str,block:u64)->Option<String>{rpc.eth_call(address,selector,json!(rpc::hex_number(block))).await.ok().filter(|x|x.len()>=66)}
fn word_address(word:&str)->Option<String>{if word.len()<42{return None}let tail=&word[word.len()-40..];if tail.chars().all(|c|c=='0'){None}else{Some(format!("0x{tail}").to_ascii_lowercase())}}
pub async fn permissions(input:&Value,rpc:&Rpc)->Result<Value,String>{
    let v:RangeInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;
    rpc.assert_chain().await?;
    let code=rpc.code_at(&v.contract,v.to_block).await?;if code=="0x"{return Err("NO_CONTRACT_CODE".into())}
    let owner=optional_call(rpc,&v.contract,"0x8da5cb5b",v.to_block).await.and_then(|x|word_address(&x));
    let pending_owner=optional_call(rpc,&v.contract,"0xe30c3978",v.to_block).await.and_then(|x|word_address(&x));
    let paused=optional_call(rpc,&v.contract,"0x5c975abb",v.to_block).await.and_then(|x|u64::from_str_radix(x.trim_start_matches("0x"),16).ok()).map(|x|x!=0);
    // Public EIP-1967 storage slots, encoded as hex payloads rather than credentials.
    const IMPL:&str="360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const ADMIN:&str="b53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
    let block=rpc::hex_number(v.to_block);
    let implementation=rpc.call("eth_getStorageAt",json!([v.contract,format!("0x{IMPL}"),block])).await.ok().and_then(|x|x.as_str().and_then(word_address));
    let proxy_admin=rpc.call("eth_getStorageAt",json!([v.contract,format!("0x{ADMIN}"),block])).await.ok().and_then(|x|x.as_str().and_then(word_address));
    let mut role_admins=BTreeMap::<String,Value>::new();
    for name in ["DEFAULT_ADMIN_ROLE","MINTER_ROLE","PAUSER_ROLE"] {let role=if name=="DEFAULT_ADMIN_ROLE"{format!("0x{}","0".repeat(64))}else{rpc::event_sig(name)};
        let data=format!("0x248a9ca3{}",role.trim_start_matches("0x"));
        if let Some(admin)=optional_call(rpc,&v.contract,&data,v.to_block).await {role_admins.insert(name.into(),json!({"role":role,"adminRole":admin}));}
    }
    let history_result=events(&json!({"chain":v.chain,"contract":v.contract,"fromBlock":v.from_block,"toBlock":v.to_block}),rpc).await?;
    let history:Vec<Value>=history_result["events"].as_array().unwrap_or(&vec![]).iter().filter_map(|e|{
        let name=e["decoded"]["eventName"].as_str()?;
        if !["OwnershipTransferred","RoleGranted","RoleRevoked"].contains(&name){return None}
        Some(json!({"event":name,"blockNumber":e["blockNumber"],"transactionHash":e["transactionHash"],"logIndex":e["logIndex"],"blockHash":e["blockHash"],"args":e["decoded"]["args"]}))
    }).collect();
    let mut holders=BTreeMap::<String,BTreeSet<String>>::new();
    for row in &history {let event=row["event"].as_str().unwrap_or("");if event=="RoleGranted"||event=="RoleRevoked" {if let (Some(role),Some(account))=(row["args"]["role"].as_str(),row["args"]["account"].as_str()){if event=="RoleGranted"{holders.entry(role.into()).or_default().insert(account.into());}else{holders.entry(role.into()).or_default().remove(account);}}}}
    let source_url=format!("https://sourcify.dev/server/v2/contract/{}/{}",rpc.chain_id(),v.contract);
    let source=match reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).redirect(reqwest::redirect::Policy::none()).build(){Ok(http)=>match http.get(&source_url).send().await{Ok(response) if response.status().is_success()=>json!({"status":"VERIFIED","url":source_url}),Ok(response) if response.status().as_u16()==404=>json!({"status":"NOT_VERIFIED","url":source_url}),_=>json!({"status":"UNKNOWN","url":source_url})},Err(_)=>json!({"status":"UNKNOWN","url":source_url})};
    let coverage=history_result["status"].as_str().unwrap_or("PARTIAL");
    let status=if coverage=="COMPLETE"&&source["status"]=="VERIFIED"{"COMPLETE"}else{"PARTIAL"};
    Ok(json!({"status":status,"contract":v.contract,"chain":v.chain,"analysisBlock":v.to_block,"codeHash":format!("{:#x}",alloy::primitives::keccak256(hex::decode(code.trim_start_matches("0x")).unwrap_or_default())),"verifiedSource":source,"permissionModel":if owner.is_some(){"Ownable"}else if !role_admins.is_empty(){"AccessControl compatible"}else{"UNKNOWN"},"facts":{"owner":owner,"pendingOwner":pending_owner,"paused":paused,"proxyImplementation":implementation,"proxyAdmin":proxy_admin,"roleAdmins":role_admins,"observedRoleHolders":holders},"history":history,"coverage":{"status":coverage,"requested":[v.from_block,v.to_block],"missing":history_result["missing"],"roleEnumeration":"INCOMPLETE"},"limitations":["Recognized getters and event signatures only; arbitrary privileges are not ruled out.","Verified source is not a security guarantee.","Role events alone do not prove complete membership."]}))
}

fn u256_hex(value:&str)->Result<U256,String>{U256::from_str_radix(value.trim_start_matches("0x"),16).map_err(|_|"RPC_INVALID_HEX".into())}
fn parse_allocations(input:&str,decimals:u32)->Result<Vec<(String,U256)>,String>{
    if input.len()>80_000{return Err("CSV_ROW_LIMIT".into())}
    let mut reader=csv::ReaderBuilder::new().has_headers(true).from_reader(input.as_bytes());
    let headers=reader.headers().map_err(|_|"CSV_HEADER")?;
    if headers.len()!=2||headers.get(0)!=Some("recipient")||headers.get(1)!=Some("amount"){return Err("CSV_HEADER".into())}
    let mut rows=Vec::new();let mut seen=BTreeSet::new();
    for row in reader.records(){let row=row.map_err(|_|"CSV_ROW_INVALID")?;if row.len()!=2{return Err("CSV_ROW_INVALID".into())}
        let recipient=row[0].trim().to_ascii_lowercase();rpc::address(&recipient)?;
        if !seen.insert(recipient.clone()){return Err("DUPLICATE_RECIPIENT".into())}
        let value=row[1].trim();if value.is_empty()||!value.bytes().all(|b|b.is_ascii_digit()||b==b'.')||value.matches('.').count()>1{return Err("CSV_ROW_INVALID".into())}
        let (whole,fraction)=value.split_once('.').unwrap_or((value,""));if fraction.len()>decimals as usize{return Err("TOKEN_PRECISION".into())}
        let base=U256::from(10).pow(U256::from(decimals));
        let whole=U256::from_str(whole).map_err(|_|"CSV_ROW_INVALID")?;
        let fractional=U256::from_str(&format!("{}{}",fraction,"0".repeat(decimals as usize-fraction.len()))).map_err(|_|"CSV_ROW_INVALID")?;
        let amount=whole.checked_mul(base).and_then(|v|v.checked_add(fractional)).ok_or("TOKEN_OVERFLOW")?;
        rows.push((recipient,amount));if rows.len()>500{return Err("CSV_ROW_LIMIT".into())}
    }
    if rows.is_empty(){return Err("EMPTY_CSV".into())}Ok(rows)
}
pub async fn distribution(input:&Value,rpc:&Rpc)->Result<Value,String>{
    let v:DistributionInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;rpc.assert_chain().await?;
    let decimals=u256_hex(&rpc.eth_call(&v.token,"0x313ce567",json!("latest")).await?)?.to::<u64>();
    if decimals>36{return Err("UNSUPPORTED_DECIMALS".into())}
    let expected=parse_allocations(&v.csv,decimals as u32)?;let mut observed=BTreeMap::<String,(U256,u32,Vec<Value>)>::new();
    let head=rpc.head().await?;let mut receipts=Vec::<Value>::new();let mut min_block=None::<u64>;let mut max_block=None::<u64>;
    for hash in &v.transaction_hashes {
        let receipt=rpc.call("eth_getTransactionReceipt",json!([hash])).await?;
        if receipt.is_null(){receipts.push(json!({"transactionHash":hash,"status":"PENDING_OR_MISSING"}));continue}
        let block=rpc::hex_u64(&receipt["blockNumber"])?;let block_hash=receipt["blockHash"].as_str().unwrap_or("");
        let status=if !rpc.block_hash(block).await?.eq_ignore_ascii_case(block_hash){"REORGANIZED"}else if head<block.saturating_add(12){"UNCONFIRMED"}else if receipt["status"]=="0x1"{"CONFIRMED"}else{"REVERTED"};
        receipts.push(json!({"transactionHash":hash,"status":status,"blockHash":block_hash,"blockNumber":block}));
        if status!="CONFIRMED"{continue}
        min_block=Some(min_block.map_or(block,|b|b.min(block)));max_block=Some(max_block.map_or(block,|b|b.max(block)));
        for log in receipt["logs"].as_array().into_iter().flatten(){
            if !log["address"].as_str().unwrap_or("").eq_ignore_ascii_case(&v.token){continue}
            let topics=log["topics"].as_array().cloned().unwrap_or_default();
            if topics.len()<3||topics[0].as_str().unwrap_or("").to_ascii_lowercase()!=rpc::event_sig("Transfer(address,address,uint256)"){continue}
            let Some(to)=topic_address(&topics[2]) else {continue};let amount=u256_hex(log["data"].as_str().unwrap_or("0x"))?;
            let entry=observed.entry(to).or_insert((U256::ZERO,0,Vec::new()));entry.0=entry.0.checked_add(amount).ok_or("TOKEN_OVERFLOW")?;entry.1+=1;entry.2.push(json!({"transactionHash":hash,"blockHash":block_hash,"logIndex":rpc::hex_u64(&log["logIndex"]).unwrap_or(0)}));
        }
    }
    let expected_set:BTreeSet<_>=expected.iter().map(|(r,_)|r.clone()).collect();let mut unexpected=Vec::new();
    for (r,(amount,_,events)) in &observed {if !expected_set.contains(r){unexpected.push(json!({"recipient":r,"amount":amount.to_string(),"events":events}));}}
    let mut rows=Vec::new();let mut verified=0usize;let mut expected_total=U256::ZERO;let mut observed_total=U256::ZERO;
    for (amount,_,_) in observed.values(){observed_total=observed_total.checked_add(*amount).ok_or("TOKEN_OVERFLOW")?;}
    for (recipient,amount) in expected {expected_total=expected_total.checked_add(amount).ok_or("TOKEN_OVERFLOW")?;let found=observed.get(&recipient);let actual=found.map(|x|x.0).unwrap_or(U256::ZERO);
        let balance=if let (Some(min),Some(max))=(min_block,max_block){if min>0 {let data=format!("0x70a08231000000000000000000000000{}",recipient.trim_start_matches("0x"));
            match (rpc.eth_call(&v.token,&data,json!(rpc::hex_number(min-1))).await,rpc.eth_call(&v.token,&data,json!(rpc::hex_number(max))).await){(Ok(before),Ok(after))=>match (u256_hex(&before),u256_hex(&after)){(Ok(b),Ok(a))=>if a>=b&&a-b>=amount{"CORROBORATED"}else{"MISMATCH"},_=>"UNAVAILABLE"},_=>"UNAVAILABLE"}}else{"UNAVAILABLE"}}else{"UNAVAILABLE"};
        let status=if actual!=amount{"MISMATCH"}else if balance=="MISMATCH"{"AMBIGUOUS_DELIVERY"}else if balance=="CORROBORATED"{"VERIFIED"}else{"EVENT_MATCH_ONLY"};
        if status=="VERIFIED"{verified+=1}
        rows.push(json!({"recipient":recipient,"amount":amount.to_string(),"observedAmount":actual.to_string(),"transferCount":found.map(|x|x.1).unwrap_or(0),"balanceEvidence":balance,"status":status,"events":found.map(|x|x.2.clone()).unwrap_or_default()}));
    }
    let status=if receipts.iter().all(|r|r["status"]=="CONFIRMED")&&unexpected.is_empty()&&verified==rows.len(){"VERIFIED"}else{"PARTIAL"};
    Ok(json!({"status":status,"chain":v.chain,"token":v.token,"decimals":decimals,"expectedCount":rows.len(),"verifiedCount":verified,"expectedTotal":expected_total.to_string(),"observedTotal":observed_total.to_string(),"rows":rows,"unexpected":unexpected,"receipts":receipts,"limitations":["Transfer events and balance deltas cannot certify nonstandard, fee-on-transfer, rebasing or malicious tokens."]}))
}

fn decode_abi_string(hex_data:&str)->Result<String,String>{
    let bytes=hex::decode(hex_data.trim_start_matches("0x")).map_err(|_|"INVALID_URI_ENCODING")?;
    if bytes.len()<64{return Err("INVALID_URI_ENCODING".into())}
    let word_usize=|word:&[u8]|->Result<usize,String>{
        if word.len()!=32||word[..24].iter().any(|byte|*byte!=0){return Err("INVALID_URI_ENCODING".into())}
        let value=u64::from_be_bytes(word[24..32].try_into().map_err(|_|"INVALID_URI_ENCODING")?);
        usize::try_from(value).map_err(|_|"INVALID_URI_ENCODING".into())
    };
    let offset=word_usize(&bytes[..32])?;
    let length_start=offset.checked_add(32).ok_or("INVALID_URI_ENCODING")?;
    if length_start>bytes.len(){return Err("INVALID_URI_ENCODING".into())}
    let length=word_usize(&bytes[offset..length_start])?;
    let end=length_start.checked_add(length).ok_or("INVALID_URI_ENCODING")?;
    if length>2048||end>bytes.len(){return Err("URI_INVALID".into())}
    String::from_utf8(bytes[length_start..end].to_vec()).map_err(|_|"INVALID_URI_ENCODING".into())
}
pub async fn nft(input:&Value,rpc:&Rpc)->Result<Value,String>{
    nft_with_fetcher(input,rpc,|uri:String,method,max_bytes|async move{safe_http::fetch(&uri,method,max_bytes).await}).await
}
pub async fn nft_with_fetcher<F,Fut>(input:&Value,rpc:&Rpc,fetcher:F)->Result<Value,String>
where F:Fn(String,reqwest::Method,usize)->Fut,Fut:std::future::Future<Output=Result<(String,Vec<u8>),String>>{
    let v:NftInput=serde_json::from_value(input.clone()).map_err(|_|"VALIDATION_ERROR")?;rpc.assert_chain().await?;
    if rpc.code(&v.contract).await?=="0x"{return Err("NO_CONTRACT_CODE".into())}
    let mut rows=Vec::<Value>::new();let mut ids=BTreeSet::new();let mut hashes=HashMap::<String,String>::new();
    for token_id in &v.token_ids {
        if !ids.insert(token_id.clone()){rows.push(json!({"tokenId":token_id,"status":"DUPLICATE_TOKEN_ID"}));continue}
        let mut issues=Vec::<String>::new();let mut uri=Value::Null;let mut metadata_hash=Value::Null;let mut metadata=Value::Null;let mut media=Value::Null;
        let result:Result<(),String>=async{
            let id=token_id.parse::<U256>().map_err(|_|"INVALID_TOKEN_ID")?;let arg=format!("{id:064x}");
            let raw=match rpc.eth_call(&v.contract,&format!("0xc87b56dd{arg}"),json!("latest")).await{Ok(s)=>s,Err(_)=>rpc.eth_call(&v.contract,&format!("0x0e89341c{arg}"),json!("latest")).await?};
            let token_uri=decode_abi_string(&raw)?.replace("{id}",&arg);uri=json!(token_uri);
            safe_http::normalize(&token_uri)?;let (content_type,body)=fetcher(token_uri.clone(),reqwest::Method::GET,512*1024).await?;
            if !content_type.to_ascii_lowercase().contains("json"){issues.push("METADATA_CONTENT_TYPE".into())}
            let value:Value=serde_json::from_slice(&body).map_err(|_|"INVALID_JSON")?;
            if !value.is_object(){return Err("METADATA_OBJECT_REQUIRED".into())}
            if value["name"].as_str().filter(|s|!s.trim().is_empty()).is_none(){issues.push("NAME_MISSING".into())}
            if value["description"].as_str().is_none(){issues.push("DESCRIPTION_MISSING".into())}
            metadata=json!({"name":value["name"].as_str().map(|s|s.chars().take(500).collect::<String>()),"description":value["description"].as_str().map(|s|s.chars().take(2000).collect::<String>())});
            let hash=hex::encode(sha2::Sha256::digest(&body));metadata_hash=json!(hash);
            if let Some(previous)=hashes.insert(hash,token_id.clone()){issues.push(format!("DUPLICATE_METADATA_WITH_{previous}"))}
            if let Some(image)=value["image"].as_str(){match fetcher(image.to_owned(),reqwest::Method::HEAD,0).await {Ok((type_,_)) if type_.starts_with("image/")||type_.starts_with("video/")||type_.starts_with("audio/")=>media=json!({"uri":image,"contentType":type_,"status":"ACCESSIBLE"}),Ok(_)=>{issues.push("MEDIA_UNAVAILABLE".into());media=json!({"uri":image,"status":"UNAVAILABLE","reason":"MEDIA_CONTENT_TYPE"})},Err(code)=>{issues.push("MEDIA_UNAVAILABLE".into());media=json!({"uri":image,"status":"UNAVAILABLE","reason":code})}}}else{issues.push("IMAGE_MISSING".into())}
            Ok(())
        }.await;
        let status=if let Err(code)=result {issues.push(code);"UNAVAILABLE"}else if issues.is_empty(){"OK"}else{"ISSUES"};
        rows.push(json!({"tokenId":token_id,"status":status,"uri":uri,"metadataHash":metadata_hash,"metadata":metadata,"media":media,"issues":issues}));
    }
    let ok=rows.iter().filter(|r|r["status"]=="OK").count();
    Ok(json!({"status":if ok==rows.len(){"COMPLETE"}else{"PARTIAL"},"chain":v.chain,"contract":v.contract,"rows":rows,"summary":{"checked":v.token_ids.len(),"ok":ok,"issues":v.token_ids.len()-ok},"limitations":["Availability at scan time does not prove permanent IPFS pinning or immutable content.","Token enumeration and ownership are not inferred."]}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn exact_allocations_and_duplicates(){let rows=parse_allocations("recipient,amount\n0x1111111111111111111111111111111111111111,1.234\n",6).unwrap();assert_eq!(rows[0].1.to_string(),"1234000");assert!(parse_allocations("recipient,amount\n0x1111111111111111111111111111111111111111,1\n0x1111111111111111111111111111111111111111,2",18).is_err());}
    #[test] fn input_limits(){let v=json!({"chain":"base","contract":"0x1111111111111111111111111111111111111111","fromBlock":1,"toBlock":20001});assert_eq!(validate("events",&v,false).unwrap_err(),"BLOCK_RANGE_LIMIT");assert_eq!(validate("nft",&json!({}),false).unwrap_err(),"NFT_FETCH_DISABLED");}
}
