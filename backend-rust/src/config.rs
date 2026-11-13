use std::env;
use reqwest::Url;

fn valid_origin(origin:&str, local:bool)->bool {
    let Ok(url)=Url::parse(origin) else{return false};
    let allowed_scheme=url.scheme()=="https" || (local && url.scheme()=="http" && url.host_str()==Some("127.0.0.1"));
    allowed_scheme && url.host_str().is_some() && url.username().is_empty() && url.password().is_none()
        && url.path()=="/" && url.query().is_none() && url.fragment().is_none()
        && origin==url.origin().ascii_serialization()
}

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub invite_hash: String,
    pub edge_key: String,
    pub allowed_origin: String,
    pub nft_enabled: bool,
    pub port: u16,
    pub allowed_emails: Vec<String>,
    pub local_rpc_url: Option<String>,
    pub local_smtp: Option<(String,u16,String)>,
    pub local_metadata_origin: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url = env::var("PIT_DATABASE_URL").map_err(|_| "DATABASE_NOT_CONFIGURED")?;
        let invite_hash = env::var("PIT_BACKEND_INVITE_SHA256").map_err(|_| "INVITE_HASH_REQUIRED")?;
        if invite_hash.len() != 64 || !invite_hash.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("INVITE_HASH_REQUIRED".into()) }
        let edge_key = env::var("PIT_EDGE_HMAC_KEY").map_err(|_| "EDGE_AUTH_REQUIRED")?;
        if edge_key.len() < 32 { return Err("EDGE_AUTH_WEAK".into()) }
        let allowed_origin = env::var("PIT_ALLOWED_ORIGIN").map_err(|_| "ALLOWED_ORIGIN_REQUIRED")?;
        let local=env::var("PIT_DEPLOYMENT_CLASS").ok().as_deref()==Some("local");
        if !valid_origin(&allowed_origin,local) { return Err("ALLOWED_ORIGIN_REQUIRED".into()) }
        let nft_enabled = env::var("PIT_NFT_FETCH_ENABLED").ok().as_deref() == Some("1") && env::var("PIT_ALLOW_LOCAL_NFT").ok().as_deref() == Some("1") && local;
        if env::var("PIT_NFT_FETCH_ENABLED").ok().as_deref()==Some("1") && !local { return Err("HOSTED_NFT_FETCH_DISABLED".into()) }
        let local_rpc_url=env::var("PIT_LOCAL_RPC_URL").ok();
        if local_rpc_url.is_some() && env::var("PIT_DEPLOYMENT_CLASS").ok().as_deref()!=Some("local") {return Err("LOCAL_RPC_FORBIDDEN".into())}
        let local_smtp=match (env::var("PIT_LOCAL_SMTP_HOST"),env::var("PIT_LOCAL_SMTP_PORT"),env::var("PIT_SMTP_FROM")){(Ok(host),Ok(port),Ok(from))=>{if env::var("PIT_DEPLOYMENT_CLASS").ok().as_deref()!=Some("local")||host!="127.0.0.1"{return Err("LOCAL_SMTP_FORBIDDEN".into())}Some((host,port.parse().map_err(|_|"SMTP_CONFIG_INVALID")?,from))},_=>None};
        let local_metadata_origin=env::var("PIT_LOCAL_METADATA_ORIGIN").ok();
        if let Some(origin)=&local_metadata_origin {
            let url=Url::parse(origin).map_err(|_|"LOCAL_METADATA_ORIGIN_FORBIDDEN")?;
            if !local||!nft_enabled||url.scheme()!="http"||url.host_str()!=Some("127.0.0.1")||url.port().is_none()||origin!=&url.origin().ascii_serialization(){return Err("LOCAL_METADATA_ORIGIN_FORBIDDEN".into())}
        }
        let port = env::var("PIT_API_PORT").unwrap_or_else(|_| "8789".into()).parse().map_err(|_| "INVALID_PORT")?;
        let allowed_emails=env::var("PIT_EMAIL_ALLOWED_RECIPIENTS").unwrap_or_default().split(',').filter(|s|!s.is_empty()).map(|s|s.trim().to_ascii_lowercase()).collect();
        Ok(Self { database_url, invite_hash, edge_key, allowed_origin, nft_enabled, port,allowed_emails,local_rpc_url,local_smtp,local_metadata_origin })
    }
}

#[cfg(test)]mod tests {use super::*;#[test]fn origins(){
    assert!(valid_origin("https://pit.example",false));
    assert!(valid_origin("http://127.0.0.1:4300",true));
    for origin in ["https://pit.example/path","https://user@pit.example","https://pit.example?x=1","https://pit.example/","http://127.0.0.1:4300"] {assert!(!valid_origin(origin,false),"{origin}")}
}}

pub fn chain(chain: &str) -> Option<(u64, &'static str)> {
    match chain {
        "ethereum" => Some((1, "https://ethereum-rpc.publicnode.com")),
        "base" => Some((8453, "https://base-rpc.publicnode.com")),
        "base-sepolia" => Some((84532, "https://base-sepolia-rpc.publicnode.com")),
        _ => None,
    }
}
