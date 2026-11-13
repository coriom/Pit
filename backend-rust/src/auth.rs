use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub fn hash(value: &str) -> String { hex::encode(Sha256::digest(value.as_bytes())) }
pub fn matches_hash(expected: &str, value: &str) -> bool {
    if value.len() > 200 { return false }
    expected.as_bytes().ct_eq(hash(value).as_bytes()).into()
}
pub fn sign(key: &str, timestamp: &str, nonce: &str, method: &str, path: &str, body: &[u8]) -> String {
    let digest = hex::encode(Sha256::digest(body));
    let message = format!("{timestamp}\n{nonce}\n{}\n{path}\n{digest}", method.to_ascii_uppercase());
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).expect("HMAC accepts all key sizes");
    mac.update(message.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}
pub fn verify(key: &str, timestamp: &str, nonce: &str, method: &str, path: &str, body: &[u8], now_ms: i64, signature: &str) -> bool {
    if timestamp.len()!=13 || !timestamp.bytes().all(|b| b.is_ascii_digit()) || nonce.len()!=32 || !nonce.bytes().all(|b| b.is_ascii_hexdigit()) || signature.len()!=64 { return false }
    let Ok(time) = timestamp.parse::<i64>() else { return false };
    if (now_ms-time).abs()>60_000 { return false }
    let expected=sign(key,timestamp,nonce,method,path,body);
    expected.as_bytes().ct_eq(signature.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn node_signature_fixture() {
        let s=sign("a".repeat(32).as_str(),"1760000000000","0123456789abcdef0123456789abcdef","post","/pit/api/v1/jobs",br#"{"kind":"events"}"#);
        assert_eq!(s,"cec4bdc1ceda3f732a73875b189a656a31e7f8418cb1d367a40164008780a4b4");
        assert!(verify(&"a".repeat(32),"1760000000000","0123456789abcdef0123456789abcdef","POST","/pit/api/v1/jobs",br#"{"kind":"events"}"#,1760000000000,&s));
        assert!(!verify(&"a".repeat(32),"1760000000000","0123456789abcdef0123456789abcdef","POST","/pit/api/v1/jobs",b"different",1760000000000,&s));
    }
}
