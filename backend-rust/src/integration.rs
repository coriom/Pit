use crate::{App,api,auth,config::Config,monitor,rpc::Rpc,tools,worker,smtp,safe_http};
use serde_json::{json,Value};
use sqlx::{PgPool,Row};
use std::{sync::Arc,time::Duration};
use uuid::Uuid;
use alloy::{sol,sol_types::SolCall};
sol! { function setTokenURI(string value); }

async fn anvil(client:&reqwest::Client,url:&str,method:&str,params:Value)->Value{
    let response:Value=client.post(url).json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params})).send().await.unwrap().json().await.unwrap();
    assert!(response.get("error").is_none(),"{method}: {response}");response["result"].clone()
}
async fn receipt(client:&reqwest::Client,url:&str,hash:&str)->Value{for _ in 0..30 {let v=anvil(client,url,"eth_getTransactionReceipt",json!([hash])).await;if !v.is_null(){return v}tokio::time::sleep(Duration::from_millis(100)).await}panic!("missing local receipt")}
async fn send(client:&reqwest::Client,url:&str,from:&str,to:Option<&str>,data:&str)->Value{
    let mut tx=json!({"from":from,"data":data,"gas":"0x7a1200"});if let Some(to)=to{tx["to"]=json!(to)}
    let hash=anvil(client,url,"eth_sendTransaction",json!([tx])).await.as_str().unwrap().to_owned();receipt(client,url,&hash).await
}
fn artifact(name:&str)->String{let path=format!("../out/PitBackendFixtures.sol/{name}.json");let body=std::fs::read_to_string(path).expect("forge build fixtures first");let v:Value=serde_json::from_str(&body).unwrap();v["bytecode"]["object"].as_str().unwrap().into()}
fn tx_hash(receipt:&Value)->String{receipt["transactionHash"].as_str().unwrap().into()}
fn signed_headers(secret:&str,method:&str,path:&str,body:&[u8],nonce:&str)->Vec<(&'static str,String)>{let timestamp=chrono::Utc::now().timestamp_millis().to_string();let signature=auth::sign(secret,&timestamp,nonce,method,path,body);vec![("x-pit-edge-timestamp",timestamp),("x-pit-edge-nonce",nonce.into()),("x-pit-edge-signature",signature)]}

#[tokio::test(flavor="multi_thread",worker_threads=2)]
async fn real_anvil_postgres_api_worker_journey(){
    let (Ok(db_url),Ok(url))=(std::env::var("PIT_TEST_DATABASE_URL"),std::env::var("PIT_TEST_RPC_URL")) else {eprintln!("SKIP real integration: PIT_TEST_DATABASE_URL and PIT_TEST_RPC_URL required");return};
    assert!(db_url.contains("127.0.0.1:55439/pit_v2_test"));assert!(url.starts_with("http://127.0.0.1:58545"));
    let pool=PgPool::connect(&db_url).await.unwrap();
    sqlx::raw_sql(include_str!("../../backend/migrations/001_init.sql")).execute(&pool).await.unwrap();
    sqlx::raw_sql(include_str!("../../backend/migrations/002_edge_nonces.sql")).execute(&pool).await.unwrap();
    sqlx::raw_sql(include_str!("../migrations/003_retry_schedule.sql")).execute(&pool).await.unwrap();
    sqlx::query("TRUNCATE pit_deliveries,pit_alerts,pit_monitors,pit_jobs,pit_edge_nonces,pit_worker_heartbeat CASCADE").execute(&pool).await.unwrap();
    let client=reqwest::Client::new();let accounts=anvil(&client,&url,"eth_accounts",json!([])).await;let sender=accounts[0].as_str().unwrap();let r1=accounts[1].as_str().unwrap();let r2=accounts[2].as_str().unwrap();
    let token=send(&client,&url,sender,None,&artifact("PitBackendTokenFixture")).await["contractAddress"].as_str().unwrap().to_owned();
    let control=send(&client,&url,sender,None,&artifact("PitBackendControlFixture")).await["contractAddress"].as_str().unwrap().to_owned();
    let transfer=|recipient:&str,amount:u64|format!("0xa9059cbb{:0>64}{:064x}",recipient.trim_start_matches("0x"),amount);
    let a=send(&client,&url,sender,Some(&token),&transfer(r1,1_500_000)).await;
    let b=send(&client,&url,sender,Some(&token),&transfer(r2,2_250_000)).await;
    let from=u64::from_str_radix(a["blockNumber"].as_str().unwrap().trim_start_matches("0x"),16).unwrap();
    let last=u64::from_str_radix(b["blockNumber"].as_str().unwrap().trim_start_matches("0x"),16).unwrap();
    anvil(&client,&url,"anvil_mine",json!(["0x10"])).await;
    let rpc=Rpc::local(url.clone(),84532,client.clone());
    let event_input=json!({"chain":"base-sepolia","contract":token,"fromBlock":from,"toBlock":last});
    let events=tools::events(&event_input,&rpc).await.unwrap();assert_eq!(events["status"],"COMPLETE");assert_eq!(events["events"].as_array().unwrap().len(),2);assert_eq!(events["missing"],json!([]));
    let distribution=tools::distribution(&json!({"chain":"base-sepolia","token":token,"csv":format!("recipient,amount\n{r1},1.5\n{r2},2.25"),"transactionHashes":[tx_hash(&a),tx_hash(&b)]}),&rpc).await.unwrap();
    assert_eq!(distribution["status"],"VERIFIED");assert_eq!(distribution["expectedTotal"],"3750000");
    let permissions=tools::permissions(&json!({"chain":"base-sepolia","contract":control,"fromBlock":0,"toBlock":last}),&rpc).await.unwrap();
    assert_eq!(permissions["facts"]["owner"],sender.to_ascii_lowercase());assert_eq!(permissions["coverage"]["status"],"COMPLETE");
    let metadata_listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let metadata_origin=format!("http://127.0.0.1:{}",metadata_listener.local_addr().unwrap().port());
    let metadata_origin_for_server=metadata_origin.clone();
    let metadata_server=tokio::spawn(async move {
        let router=axum::Router::new()
            .route("/token/1",axum::routing::get(move || {let origin=metadata_origin_for_server.clone();async move{([(axum::http::header::CONTENT_TYPE,"application/json")],json!({"name":"Fixture NFT","description":"Local fixture","image":format!("{origin}/image.png")}).to_string())}}))
            .route("/image.png",axum::routing::head(||async{([(axum::http::header::CONTENT_TYPE,"image/png")],"")}))
            .route("/parity-valid",axum::routing::get(||async{([(axum::http::header::CONTENT_TYPE,"application/json")],"{\"name\":\"Fixture NFT\",\"description\":\"Parity HTTP\",\"image\":\"https://fixture.example/image.png\"}")}))
            .route("/parity-invalid",axum::routing::get(||async{([(axum::http::header::CONTENT_TYPE,"application/json")],"{invalid")}))
            .route("/parity-media-missing",axum::routing::get(||async{([(axum::http::header::CONTENT_TYPE,"application/json")],"{\"name\":\"Fixture NFT\",\"description\":\"Parity HTTP\",\"image\":\"https://fixture.example/missing.png\"}")}))
            .route("/parity-oversized",axum::routing::get(||async{([(axum::http::header::CONTENT_TYPE,"application/json")],vec![b'x';512*1024+1])}))
            .route("/parity-slow",axum::routing::get(||async{tokio::time::sleep(std::time::Duration::from_secs(4)).await;([(axum::http::header::CONTENT_TYPE,"application/json")],"{}") }))
            .route("/redirect",axum::routing::get(||async{(axum::http::StatusCode::FOUND,[(axum::http::header::LOCATION,"http://169.254.169.254/latest/meta-data")])}))
            .route("/large",axum::routing::get(||async{vec![b'x';1024]}))
            .route("/slow",axum::routing::get(||async{tokio::time::sleep(std::time::Duration::from_secs(4)).await;"slow"}));
        axum::serve(metadata_listener,router).await.unwrap();
    });
    assert_eq!(safe_http::fetch_local_fixture("http://169.254.169.254/latest/meta-data",&metadata_origin,reqwest::Method::GET,1024).await.unwrap_err(),"LOCAL_METADATA_ORIGIN_FORBIDDEN");
    assert_eq!(safe_http::fetch_local_fixture("http://127.0.0.1:8000/admin",&metadata_origin,reqwest::Method::GET,1024).await.unwrap_err(),"LOCAL_METADATA_ORIGIN_FORBIDDEN");
    assert_eq!(safe_http::fetch_local_fixture("http://[::1]:58546/internal",&metadata_origin,reqwest::Method::GET,1024).await.unwrap_err(),"LOCAL_METADATA_ORIGIN_FORBIDDEN");
    assert_eq!(safe_http::fetch_local_fixture(&format!("{metadata_origin}/redirect"),&metadata_origin,reqwest::Method::GET,1024).await.unwrap_err(),"REDIRECT_FORBIDDEN");
    assert_eq!(safe_http::fetch_local_fixture(&format!("{metadata_origin}/large"),&metadata_origin,reqwest::Method::GET,32).await.unwrap_err(),"BODY_LIMIT");
    assert_eq!(safe_http::fetch_local_fixture(&format!("{metadata_origin}/slow"),&metadata_origin,reqwest::Method::GET,32).await.unwrap_err(),"TIMEOUT");
    let nft_contract=send(&client,&url,sender,None,&artifact("PitBackendNftFixture")).await["contractAddress"].as_str().unwrap().to_owned();
    let uri=format!("{metadata_origin}/token/1");
    let calldata=format!("0x{}",hex::encode(setTokenURICall{value:uri.clone()}.abi_encode()));
    send(&client,&url,sender,Some(&nft_contract),&calldata).await;
    let checked=tools::nft_local(&json!({"chain":"base-sepolia","contract":nft_contract,"tokenIds":["1"]}),&rpc,&metadata_origin).await.unwrap();
    assert_eq!(checked["rows"][0]["status"],"OK");
    let invite="local-test-private-invite";let secret="local_test_key_32_bytes_long_aaaaaaaa";
    std::fs::write("/tmp/pit-v2-parity-local.json",json!({"token":token,"control":control,"nft":nft_contract,"from":from,"last":last,"recipient1":r1,"recipient2":r2,"transactionHashes":[tx_hash(&a),tx_hash(&b)],"events":events,"permissions":permissions,"distribution":distribution}).to_string()).unwrap();
    let app=Arc::new(App{pool:pool.clone(),config:Config{database_url:db_url,invite_hash:auth::hash(invite),edge_key:secret.into(),allowed_origin:"http://127.0.0.1:4000".into(),nft_enabled:true,port:58789,allowed_emails:Vec::new(),local_rpc_url:Some(url.clone()),local_smtp:None,local_metadata_origin:Some(metadata_origin.clone())},http:client.clone(),request_gate:Arc::new(tokio::sync::Semaphore::new(32))});
    let server=tokio::spawn(api::serve(app.clone()));
    let health="http://127.0.0.1:58789/pit/api/v1/health";let mut ready=false;
    for _ in 0..30 {if server.is_finished(){panic!("Rust API failed before readiness: {:?}",server.await)}if client.get(health).send().await.is_ok(){ready=true;break}tokio::time::sleep(Duration::from_millis(100)).await}assert!(ready,"Rust API did not bind localhost");
    let api_url="http://127.0.0.1:58789/pit/api/v1/jobs";let path="/pit/api/v1/jobs";let body=json!({"kind":"events","input":event_input}).to_string();
    let unsigned=client.post(api_url).header("x-pit-invite",invite).body(body.clone()).send().await.unwrap();assert_eq!(unsigned.status(),403);
    let nonce="11111111111111111111111111111111";let mut request=client.post(api_url).header("x-pit-invite",invite).header("idempotency-key","integration_event_job_123").header("content-type","application/json").body(body.clone());
    for (k,v) in signed_headers(secret,"POST",path,body.as_bytes(),nonce){request=request.header(k,v)}
    let created=request.send().await.unwrap();assert_eq!(created.status(),202);let created:Value=created.json().await.unwrap();let id=created["id"].as_str().unwrap();let access=created["accessToken"].as_str().unwrap();
    let mut replay=client.post(api_url).header("x-pit-invite",invite).header("idempotency-key","integration_event_job_123").body(body.clone());for(k,v)in signed_headers(secret,"POST",path,body.as_bytes(),nonce){replay=replay.header(k,v)}assert_eq!(replay.send().await.unwrap().status(),403);
    let id_uuid=Uuid::parse_str(id).unwrap();let row=sqlx::query("SELECT status FROM pit_jobs WHERE id=$1").bind(id_uuid).fetch_one(&pool).await.unwrap();assert_eq!(row.get::<String,_>("status"),"QUEUED");
    // The same production claim path runs with only read-only blockchain calls.
    worker::tick(&app).await.unwrap();
    let row=sqlx::query("SELECT status,result_json FROM pit_jobs WHERE id=$1").bind(id_uuid).fetch_one(&pool).await.unwrap();assert_eq!(row.get::<String,_>("status"),"COMPLETED");let result:Value=row.get("result_json");assert_eq!(result["events"].as_array().unwrap().len(),2);
    let job_url=format!("{api_url}/{id}");let unauthorized=client.get(&job_url).send().await.unwrap();assert_eq!(unauthorized.status(),403); // edge before capability
    let path=format!("{path}/{id}");let mut authorized=client.get(&job_url).header("authorization",format!("Bearer {access}"));for(k,v)in signed_headers(secret,"GET",&path,b"","22222222222222222222222222222222"){authorized=authorized.header(k,v)}let fetched=authorized.send().await.unwrap();assert_eq!(fetched.status(),200);
    let page_path=format!("{path}?offset=1&limit=1");let page_url=format!("{job_url}?offset=1&limit=1");
    let mut page_request=client.get(&page_url).header("authorization",format!("Bearer {access}"));for(k,v)in signed_headers(secret,"GET",&page_path,b"","22222222222222222222222222222223"){page_request=page_request.header(k,v)}
    let page_response=page_request.send().await.unwrap();assert_eq!(page_response.status(),200);let page:Value=page_response.json().await.unwrap();
    assert_eq!(page["result"]["totalEvents"],2);assert_eq!(page["result"]["events"].as_array().unwrap().len(),1);
    let nft_body=json!({"kind":"nft","input":{"chain":"base-sepolia","contract":nft_contract,"tokenIds":["1"]}}).to_string();
    let mut nft_request=client.post(api_url).header("x-pit-invite",invite).header("idempotency-key","integration_nft_job_123").header("content-type","application/json").body(nft_body.clone());
    for (k,v) in signed_headers(secret,"POST","/pit/api/v1/jobs",nft_body.as_bytes(),"33333333333333333333333333333333"){nft_request=nft_request.header(k,v)}
    let nft_created=nft_request.send().await.unwrap();assert_eq!(nft_created.status(),202);let nft_id:Uuid=Uuid::parse_str(nft_created.json::<Value>().await.unwrap()["id"].as_str().unwrap()).unwrap();
    worker::tick(&app).await.unwrap();let nft_result:Value=sqlx::query_scalar("SELECT result_json FROM pit_jobs WHERE id=$1").bind(nft_id).fetch_one(&pool).await.unwrap();
    assert_eq!(nft_result["rows"][0]["metadata"]["name"],"Fixture NFT");
    assert_eq!(nft_result["status"],"COMPLETE");
    let _=monitor::validate(&json!({"chain":"base-sepolia","contract":token,"startBlock":last,"rule":{"type":"mint"}})).unwrap();
    let monitor_id=Uuid::new_v4();let monitor_start=rpc.head().await.unwrap()+1;
    sqlx::query("INSERT INTO pit_monitors(id,access_hash,invite_hash,chain,contract,rule_json,cursor_block,expires_at,email) VALUES($1,$2,$3,'base-sepolia',$4,$5,$6,now()+interval '1 day',$7)")
        .bind(monitor_id).bind(auth::hash("monitor-local-capability")).bind(auth::hash(invite)).bind(&token).bind(json!({"type":"transfer-threshold","minimum":"2000000"})).bind(monitor_start as i64-1).bind("test@example.com").execute(&pool).await.unwrap();
    let observed=send(&client,&url,sender,Some(&token),&transfer(r2,3_000_000)).await;anvil(&client,&url,"anvil_mine",json!(["0x10"])).await;
    let fresh=PgPool::connect("postgres://corio@127.0.0.1:55439/pit_v2_test").await.unwrap();
    assert!(monitor::poll_one(&fresh,&client,Some(&url)).await.unwrap());
    let alerts:i64=sqlx::query_scalar("SELECT count(*) FROM pit_alerts WHERE monitor_id=$1 AND transaction_hash=$2").bind(monitor_id).bind(tx_hash(&observed)).fetch_one(&fresh).await.unwrap();assert_eq!(alerts,1);
    let cursor_before:i64=sqlx::query_scalar("SELECT cursor_block FROM pit_monitors WHERE id=$1").bind(monitor_id).fetch_one(&fresh).await.unwrap();
    sqlx::query("UPDATE pit_monitors SET next_poll_at=now()-interval '1 second' WHERE id=$1").bind(monitor_id).execute(&fresh).await.unwrap();
    assert!(monitor::poll_one(&fresh,&client,Some(&url)).await.unwrap());
    let cursor_after:i64=sqlx::query_scalar("SELECT cursor_block FROM pit_monitors WHERE id=$1").bind(monitor_id).fetch_one(&fresh).await.unwrap();
    let alerts_after:i64=sqlx::query_scalar("SELECT count(*) FROM pit_alerts WHERE monitor_id=$1").bind(monitor_id).fetch_one(&fresh).await.unwrap();
    assert_eq!(cursor_before,cursor_after);assert_eq!(alerts_after,1,"restart poll must not duplicate a confirmed alert");
    use tokio::io::{AsyncBufReadExt,AsyncWriteExt,BufReader};
    let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let smtp_port=listener.local_addr().unwrap().port();
    let sink=tokio::spawn(async move {let (socket,_)=listener.accept().await.unwrap();let mut socket=BufReader::new(socket);socket.get_mut().write_all(b"220 local smtp\r\n").await.unwrap();let mut data=false;let mut lines=Vec::new();loop{let mut line=String::new();if socket.read_line(&mut line).await.unwrap()==0{break}let clean=line.trim_end_matches(['\r','\n']);if data {if clean=="."{data=false;socket.get_mut().write_all(b"250 queued\r\n").await.unwrap()}else{lines.push(clean.to_owned())}continue}let reply=if clean.starts_with("EHLO") {"250 local\r\n"}else if clean.starts_with("MAIL FROM")||clean.starts_with("RCPT TO"){"250 ok\r\n"}else if clean=="DATA"{data=true;"354 send\r\n"}else if clean=="QUIT"{"221 bye\r\n"}else{"500 error\r\n"};socket.get_mut().write_all(reply.as_bytes()).await.unwrap();if clean=="QUIT"{break}}lines});
    let status=smtp::deliver_once(&fresh,Some(&(String::from("127.0.0.1"),smtp_port,String::from("pit-test@example.com")))).await.unwrap();assert_eq!(status,"SENT");let message=sink.await.unwrap();assert!(message.iter().any(|line|line.contains("PIT Crypto contract alert")));
    let deliveries:i64=sqlx::query_scalar("SELECT count(*) FROM pit_deliveries WHERE status='SENT'").fetch_one(&fresh).await.unwrap();assert_eq!(deliveries,1);
    fresh.close().await;
    // The two implementations evaluate the same on-chain tokenURI with the
    // same deterministic HTTPS fixture, independently of local HTTP access.
    let parity_uri="https://fixture.example/metadata.json";
    let calldata=format!("0x{}",hex::encode(setTokenURICall{value:parity_uri.into()}.abi_encode()));
    send(&client,&url,sender,Some(&nft_contract),&calldata).await;
    let parity_input=json!({"chain":"base-sepolia","contract":nft_contract,"tokenIds":["1","2","3"]});
    let parity_nft=tools::nft_with_fetcher(&parity_input,&rpc,|uri,method,_|async move{
        if uri=="https://fixture.example/metadata.json"&&method==reqwest::Method::GET {
            Ok(("application/json".into(),b"{\"name\":\"Fixture NFT\",\"description\":\"Parity\",\"image\":\"https://fixture.example/image.png\"}".to_vec()))
        }else if uri=="https://fixture.example/image.png"&&method==reqwest::Method::HEAD {Ok(("image/png".into(),Vec::new()))}
        else {Err("HTTP_404".into())}
    }).await.unwrap();
    assert_eq!(parity_nft["status"],"PARTIAL");
    assert_eq!(parity_nft["rows"][0]["status"],"OK");
    assert_eq!(parity_nft["rows"][1]["status"],"ISSUES");
    assert_eq!(parity_nft["rows"][2]["issues"][0],"DUPLICATE_METADATA_WITH_1");
    let invalid_nft=tools::nft_with_fetcher(&json!({"chain":"base-sepolia","contract":nft_contract,"tokenIds":["1"]}),&rpc,|_,_,_|async{
        Ok(("application/json".into(),b"{invalid".to_vec()))
    }).await.unwrap();
    assert_eq!(invalid_nft["status"],"PARTIAL");
    let single=json!({"chain":"base-sepolia","contract":nft_contract,"tokenIds":["1"]});
    let media_failure=tools::nft_with_fetcher(&single,&rpc,|_,method,_|async move{
        if method==reqwest::Method::GET {Ok(("application/json".into(),b"{\"name\":\"Fixture NFT\",\"description\":\"Parity\",\"image\":\"https://fixture.example/missing.png\"}".to_vec()))}
        else {Err("HTTP_404".into())}
    }).await.unwrap();
    assert_eq!(media_failure["rows"][0]["media"]["reason"],"HTTP_404");
    let timed_out=tools::nft_with_fetcher(&single,&rpc,|_,_,_|async{Err("TIMEOUT".into())}).await.unwrap();
    assert_eq!(timed_out["rows"][0]["issues"][0],"TIMEOUT");
    let oversized=tools::nft_with_fetcher(&single,&rpc,|_,_,_|async{Err("BODY_LIMIT".into())}).await.unwrap();
    assert_eq!(oversized["rows"][0]["issues"][0],"BODY_LIMIT");
    let unsafe_uri="http://127.0.0.1/internal";
    let calldata=format!("0x{}",hex::encode(setTokenURICall{value:unsafe_uri.into()}.abi_encode()));
    send(&client,&url,sender,Some(&nft_contract),&calldata).await;
    let unsupported=tools::nft_with_fetcher(&single,&rpc,|_,_,_|async{Err("FETCH_MUST_NOT_RUN".into())}).await.unwrap();
    assert_eq!(unsupported["rows"][0]["issues"][0],"URI_SCHEME_FORBIDDEN");
    let calldata=format!("0x{}",hex::encode(setTokenURICall{value:parity_uri.into()}.abi_encode()));
    send(&client,&url,sender,Some(&nft_contract),&calldata).await;
    let monitor_event:Value=sqlx::query_scalar("SELECT event_json FROM pit_alerts WHERE monitor_id=$1 LIMIT 1")
        .bind(monitor_id).fetch_one(&pool).await.unwrap();
    let mut fixture:Value=serde_json::from_str(&std::fs::read_to_string("/tmp/pit-v2-parity-local.json").unwrap()).unwrap();
    fixture["nftParity"]=parity_nft;
    fixture["nftInvalid"]=invalid_nft;
    fixture["nftMediaFailure"]=media_failure;
    fixture["nftTimeout"]=timed_out;
    fixture["nftOversized"]=oversized;
    fixture["nftUnsupported"]=unsupported;
    fixture["monitorEvent"]=monitor_event;
    // The Node comparison rebinds this disposable port after this test exits.
    // Both implementations see the same on-chain HTTPS URI and fetch the same
    // bytes through an explicit local-only HTTP fixture adapter.
    let mut http_cases=serde_json::Map::new();
    for (name,path,ids) in [
        ("valid","/parity-valid",vec!["1"]),
        ("partial_duplicate","/parity-valid",vec!["1","2"]),
        ("invalid_json","/parity-invalid",vec!["1"]),
        ("media_failure","/parity-media-missing",vec!["1"]),
        ("oversized","/parity-oversized",vec!["1"]),
        ("timeout","/parity-slow",vec!["1"]),
    ] {
        let uri=format!("https://fixture.example{path}");
        let calldata=format!("0x{}",hex::encode(setTokenURICall{value:uri.clone()}.abi_encode()));
        send(&client,&url,sender,Some(&nft_contract),&calldata).await;
        let origin=metadata_origin.clone();
        let result=tools::nft_with_fetcher(&json!({"chain":"base-sepolia","contract":nft_contract,"tokenIds":ids}),&rpc,move |uri,method,max_bytes|{
            let origin=origin.clone();
            async move {
                let parsed=reqwest::Url::parse(&uri).map_err(|_|"URI_INVALID".to_owned())?;
                if parsed.scheme()!="https"||parsed.host_str()!=Some("fixture.example") {return Err("FIXTURE_HOST_FORBIDDEN".into())}
                let local=format!("{origin}{}",parsed.path());
                safe_http::fetch_local_fixture(&local,&origin,method,max_bytes).await
            }
        }).await.unwrap();
        http_cases.insert(name.into(),json!({"uri":uri,"tokenIds":ids,"result":result}));
    }
    fixture["nftHttpOrigin"]=json!(metadata_origin);
    fixture["nftHttpCases"]=json!(http_cases);
    std::fs::write("/tmp/pit-v2-parity-local.json",fixture.to_string()).unwrap();
    metadata_server.abort();server.abort();pool.close().await;
}
