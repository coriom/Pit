use alloy::primitives::B256;
use alloy_dyn_abi::{DynSolValue, EventExt};
use alloy_json_abi::Event;
use serde_json::{json, Map, Value};
use std::str::FromStr;

pub fn compile(items: Option<&[Value]>) -> Result<Vec<Event>, String> {
    let mut events = Vec::new();
    for item in items.unwrap_or_default() {
        if item.get("type").and_then(Value::as_str) != Some("event") { continue; }
        // Standard user ABI fragments commonly omit `anonymous`; JSON ABI treats it as false.
        let mut normalized = item.clone();
        if normalized.get("anonymous").is_none() {
            normalized["anonymous"] = Value::Bool(false);
        }
        let event: Event = serde_json::from_value(normalized).map_err(|_| "INVALID_ABI")?;
        if event.anonymous || event.inputs.len() > 32 || event.name.len() > 100 {
            return Err("INVALID_ABI".into());
        }
        events.push(event);
    }
    Ok(events)
}

fn value(item: &DynSolValue, depth: u8) -> Option<Value> {
    if depth > 5 { return None; }
    Some(match item {
        DynSolValue::Bool(v) => json!(v),
        DynSolValue::Int(v, _) => json!(v.to_string()),
        DynSolValue::Uint(v, _) => json!(v.to_string()),
        DynSolValue::FixedBytes(v, size) => json!(format!("0x{}", hex::encode(&v.as_slice()[..*size]))),
        DynSolValue::Address(v) => json!(format!("{v:#x}")),
        DynSolValue::Function(v) => json!(format!("0x{}", hex::encode(v.as_slice()))),
        DynSolValue::Bytes(v) => json!(format!("0x{}", hex::encode(v))),
        DynSolValue::String(v) => json!(v.chars().take(2048).collect::<String>()),
        DynSolValue::Array(v) | DynSolValue::FixedArray(v) | DynSolValue::Tuple(v) => {
            if v.len() > 100 { return None; }
            Value::Array(v.iter().map(|item| value(item, depth + 1)).collect::<Option<Vec<_>>>()?)
        },
        #[allow(unreachable_patterns)]
        _ => return None,
    })
}

pub fn decode(events: &[Event], topics: &[Value], data: &Value) -> Option<Value> {
    let selector = B256::from_str(topics.first()?.as_str()?).ok()?;
    let event = events.iter().find(|event| event.selector() == selector)?;
    let topic_words = topics.iter().map(|topic| B256::from_str(topic.as_str()?).ok()).collect::<Option<Vec<_>>>()?;
    let data = hex::decode(data.as_str()?.strip_prefix("0x")?).ok()?;
    if data.len() > 64 * 1024 { return None; }
    let decoded = event.decode_log_parts(topic_words, &data).ok()?;
    let mut indexed = decoded.indexed.iter();
    let mut body = decoded.body.iter();
    let mut args = Map::new();
    for (position, input) in event.inputs.iter().enumerate() {
        let item = if input.indexed { indexed.next()? } else { body.next()? };
        let name = if input.name.is_empty() { position.to_string() } else { input.name.clone() };
        args.insert(name, value(item, 0)?);
    }
    Some(json!({"eventName": event.name, "args": args}))
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn decodes_user_event_without_float_amounts() {
        let abi = vec![json!({"type":"event","name":"Transfer","anonymous":false,"inputs":[
            {"name":"from","type":"address","indexed":true},
            {"name":"to","type":"address","indexed":true},
            {"name":"value","type":"uint256","indexed":false}
        ]})];
        let events = compile(Some(&abi)).unwrap();
        let topic = format!("{:#x}", events[0].selector());
        let topics = vec![json!(topic), json!(format!("0x{:064x}", 1)), json!(format!("0x{:064x}", 2))];
        let data = json!(format!("0x{:064x}", 123456789u64));
        let decoded = decode(&events, &topics, &data).unwrap();
        assert_eq!(decoded["args"]["value"], "123456789");
        assert_eq!(decoded["args"]["to"], "0x0000000000000000000000000000000000000002");
    }
    #[test] fn accepts_standard_fragment_without_anonymous_field() {
        let fragment = json!({"type":"event","name":"Transfer","inputs":[{"name":"value","type":"uint256","indexed":false}]});
        assert_eq!(compile(Some(&[fragment])).unwrap().len(), 1);
    }
    #[test] fn rejects_anonymous_abi() {
        assert_eq!(compile(Some(&[json!({"type":"event","name":"X","anonymous":true,"inputs":[]})])).unwrap_err(), "INVALID_ABI");
    }
}
