use std::{net::{IpAddr,SocketAddr},time::Duration};
use reqwest::Url;

pub fn public_ip(ip:IpAddr)->bool{match ip {
    IpAddr::V4(v)=>{let o=v.octets();!(v.is_private()||v.is_loopback()||v.is_link_local()||v.is_multicast()||v.is_unspecified()||o[0]==0||o[0]>=224||(o[0]==100&&(64..=127).contains(&o[1]))||(o[0]==198&&(18..=19).contains(&o[1]))||(o[0]==192&&o[1]==0&&o[2]==0))},
    IpAddr::V6(v)=>{let s=v.segments();if let Some(mapped)=v.to_ipv4_mapped(){return public_ip(IpAddr::V4(mapped))}!(v.is_loopback()||v.is_unspecified()||v.is_multicast()||v.is_unique_local()||v.is_unicast_link_local())&&s[0]&0xe000==0x2000}
}}
pub fn validate_answers(addresses:&[IpAddr])->Result<IpAddr,String>{
    if addresses.is_empty()||addresses.iter().any(|ip|!public_ip(*ip)){return Err("PRIVATE_ADDRESS_FORBIDDEN".into())}
    Ok(addresses[0])
}
pub fn normalize(uri:&str)->Result<Url,String>{
    if uri.len()>2048{return Err("URI_INVALID".into())}
    let normalized=if let Some(path)=uri.strip_prefix("ipfs://"){let path=path.strip_prefix("ipfs/").unwrap_or(path);if path.len()<46||path.len()>2048||path.contains("..")||!path.bytes().all(|b|b.is_ascii_alphanumeric()||b"/._~!$&'()+,;=:@%-".contains(&b)){return Err("IPFS_PATH_INVALID".into())}format!("https://ipfs.io/ipfs/{path}")}else{uri.into()};
    let url=Url::parse(&normalized).map_err(|_|"URI_INVALID")?;
    if url.scheme()!="https"||!url.username().is_empty()||url.password().is_some()||url.port().is_some()||url.fragment().is_some(){return Err("URI_SCHEME_FORBIDDEN".into())}
    let host=url.host_str().ok_or("HOST_FORBIDDEN")?;
    if host.parse::<IpAddr>().is_ok()||host.ends_with(".local")||host.ends_with(".internal")||host.len()<3||host.len()>253||!host.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'.'||b==b'-'){return Err("HOST_FORBIDDEN".into())}
    Ok(url)
}
pub async fn fetch(uri:&str,method:reqwest::Method,max_bytes:usize)->Result<(String,Vec<u8>),String>{
    let url=normalize(uri)?;let host=url.host_str().ok_or("HOST_FORBIDDEN")?.to_owned();
    let addresses:Vec<IpAddr>=tokio::net::lookup_host((host.as_str(),443)).await.map_err(|_|"DNS_UNAVAILABLE")?.map(|x|x.ip()).collect();
    let pinned=SocketAddr::new(validate_answers(&addresses)?,443);
    let client=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(8)).redirect(reqwest::redirect::Policy::none()).resolve(&host,pinned).build().map_err(|_|"FETCH_CONFIG")?;
    let mut response=client.request(method,url).header("Accept","application/json,image/*;q=0.5").header("User-Agent","PIT-Crypto-Metadata-Checker/2.0").send().await.map_err(|_|"FETCH_UNAVAILABLE")?;
    if response.status().is_redirection(){return Err("REDIRECT_FORBIDDEN".into())}if !response.status().is_success(){return Err(format!("HTTP_{}",response.status().as_u16()))}
    let content_type=response.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("").to_owned();
    let mut body=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"FETCH_UNAVAILABLE")?{if body.len()+chunk.len()>max_bytes{return Err("BODY_LIMIT".into())}body.extend(chunk)}Ok((content_type,body))
}

/// Only the explicitly configured loopback fixture is reachable in local test mode.
pub async fn fetch_local_fixture(uri:&str,origin:&str,method:reqwest::Method,max_bytes:usize)->Result<(String,Vec<u8>),String>{
    let url=Url::parse(uri).map_err(|_|"URI_INVALID")?;
    let configured=Url::parse(origin).map_err(|_|"LOCAL_METADATA_ORIGIN_FORBIDDEN")?;
    if url.scheme()!="http"||url.host_str()!=Some("127.0.0.1")||url.port()!=configured.port()||
        configured.host_str()!=Some("127.0.0.1")||configured.scheme()!="http"||
        !url.username().is_empty()||url.password().is_some()||url.fragment().is_some()||uri.len()>2048 {
        return Err("LOCAL_METADATA_ORIGIN_FORBIDDEN".into())
    }
    let client=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(3)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"FETCH_CONFIG")?;
    let mut response=client.request(method,url).send().await.map_err(|_|"FETCH_UNAVAILABLE")?;
    if response.status().is_redirection(){return Err("REDIRECT_FORBIDDEN".into())}
    if !response.status().is_success(){return Err(format!("HTTP_{}",response.status().as_u16()))}
    let content_type=response.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("").to_owned();
    let mut body=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"FETCH_UNAVAILABLE")?{
        if body.len()+chunk.len()>max_bytes{return Err("BODY_LIMIT".into())}body.extend(chunk)
    }
    Ok((content_type,body))
}

#[cfg(test)]mod tests{use super::*;#[test]fn addresses(){for ip in ["127.0.0.1","10.0.0.1","172.18.0.3","192.168.1.1","169.254.169.254","::1","fc00::1","fe80::1","::ffff:127.0.0.1"]{assert!(!public_ip(ip.parse().unwrap()),"{ip}")};assert!(public_ip("1.1.1.1".parse().unwrap()));assert!(public_ip("2606:4700:4700::1111".parse().unwrap()));assert!(validate_answers(&["1.1.1.1".parse().unwrap(),"10.0.0.5".parse().unwrap()]).is_err());assert!(validate_answers(&["2606:4700:4700::1111".parse().unwrap(),"::1".parse().unwrap()]).is_err())}#[test]fn urls(){for uri in ["http://example.com/a","https://127.0.0.1/a","https://[::1]/a","https://host.local/a","https://user@example.com/a"]{assert!(normalize(uri).is_err(),"{uri}")}}}
