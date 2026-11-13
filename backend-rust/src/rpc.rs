use crate::config;
use alloy::primitives::{Address, B256};
use alloy::providers::{Provider,RootProvider};
use serde_json::{json, Value};
use std::str::FromStr;

#[derive(Clone)]
pub struct Rpc { provider:RootProvider, chain_id: u64 }

impl Rpc {
    pub fn public(chain: &str, _client: &reqwest::Client) -> Result<Self, &'static str> {
        let (chain_id,url)=config::chain(chain).ok_or("UNSUPPORTED_CHAIN")?;
        Ok(Self { provider:RootProvider::new_http(url.parse().expect("fixed RPC URL")), chain_id })
    }
    pub fn with_local(chain:&str,client:&reqwest::Client,local:Option<&str>)->Result<Self,&'static str>{
        let mut rpc=Self::public(chain,client)?;
        if let Some(url)=local {let parsed=reqwest::Url::parse(url).map_err(|_|"LOCAL_RPC_FORBIDDEN")?;if parsed.scheme()!="http"||parsed.host_str()!=Some("127.0.0.1")||parsed.port().is_none()||parsed.path()!="/"||parsed.query().is_some()||parsed.username()!=""||parsed.password().is_some(){return Err("LOCAL_RPC_FORBIDDEN")}rpc.provider=RootProvider::new_http(parsed);}
        Ok(rpc)
    }
    #[cfg(test)]pub fn local(url:String,chain_id:u64,_client:reqwest::Client)->Self{Self{provider:RootProvider::new_http(url.parse().unwrap()),chain_id}}
    pub fn chain_id(&self) -> u64 { self.chain_id }
    pub async fn call(&self, method: &str, params: Value) -> Result<Value,String> {
        const METHODS: &[&str] = &["eth_chainId","eth_blockNumber","eth_getLogs","eth_getBlockByNumber","eth_getTransactionReceipt","eth_call","eth_getCode","eth_getStorageAt"];
        if !METHODS.contains(&method) { return Err("RPC_METHOD_FORBIDDEN".into()) }
        let result=tokio::time::timeout(std::time::Duration::from_secs(12),self.provider.client().request::<Value,Value>(method.to_owned(),params)).await;
        match result {Ok(Ok(value))=>Ok(value),Ok(Err(error))=>{let message=error.to_string();Err(if message.contains("429"){"RPC_RATE_LIMIT".into()}else{format!("RPC_ERROR:{}",message.chars().take(80).collect::<String>())})},Err(_)=>Err("RPC_UNAVAILABLE".into())}
    }
    pub async fn assert_chain(&self)->Result<(),String>{let id=hex_u64(&self.call("eth_chainId",json!([])).await?)?;if id!=self.chain_id {Err("RPC_CHAIN_MISMATCH".into())}else{Ok(())}}
    pub async fn head(&self)->Result<u64,String>{hex_u64(&self.call("eth_blockNumber",json!([])).await?)}
    pub async fn block_hash(&self,n:u64)->Result<String,String>{self.call("eth_getBlockByNumber",json!([hex_number(n),false])).await?.get("hash").and_then(Value::as_str).map(str::to_owned).ok_or_else(||"BLOCK_UNAVAILABLE".into())}
    pub async fn code(&self,address:&str)->Result<String,String>{self.call("eth_getCode",json!([address,"latest"])).await?.as_str().map(str::to_owned).ok_or_else(||"RPC_INVALID_RESPONSE".into())}
    pub async fn code_at(&self,address:&str,block:u64)->Result<String,String>{self.call("eth_getCode",json!([address,hex_number(block)])).await?.as_str().map(str::to_owned).ok_or_else(||"RPC_INVALID_RESPONSE".into())}
    pub async fn eth_call(&self,address:&str,data:&str,block:Value)->Result<String,String>{self.call("eth_call",json!([{"to":address,"data":data},block])).await?.as_str().map(str::to_owned).ok_or_else(||"RPC_INVALID_RESPONSE".into())}
}
pub fn hex_u64(value:&Value)->Result<u64,String>{u64::from_str_radix(value.as_str().ok_or("RPC_INVALID_HEX")?.trim_start_matches("0x"),16).map_err(|_|"RPC_INVALID_HEX".into())}
pub fn hex_number(n:u64)->String{format!("0x{n:x}")}
pub fn address(value:&str)->Result<Address,String>{Address::from_str(value).map_err(|_|"INVALID_ADDRESS".into())}
pub fn hash32(value:&str)->Result<B256,String>{B256::from_str(value).map_err(|_|"INVALID_HASH".into())}
pub fn event_sig(signature:&str)->String { format!("{:#x}",alloy::primitives::keccak256(signature.as_bytes())) }

#[cfg(test)]
mod tests { use super::*; #[test] fn parser() { assert_eq!(hex_u64(&json!("0x2105")).unwrap(),8453); assert!(address("0x00").is_err());
    // Standard ERC-20 Transfer topic; this is public protocol data, not a credential.
    let public_topic="ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    assert_eq!(event_sig("Transfer(address,address,uint256)"),format!("0x{public_topic}")); } }
