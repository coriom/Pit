use sqlx::{PgPool,Row};
use tokio::{io::{AsyncBufReadExt,AsyncWriteExt,BufReader},net::TcpStream};
use uuid::Uuid;

pub async fn deliver_once(pool:&PgPool,local:Option<&(String,u16,String)>)->Result<&'static str,String>{
    let Some((host,port,from))=local else{return Ok("DISABLED")};
    if host!="127.0.0.1"||from.len()>254||!from.contains('@')||from.contains(['\r','\n']){return Err("SMTP_CONFIG_INVALID".into())}
    let mut tx=pool.begin().await.map_err(|_|"DB_UNAVAILABLE")?;
    let row=sqlx::query("SELECT d.id,d.email,d.attempts,a.monitor_id,a.transaction_hash FROM pit_deliveries d JOIN pit_alerts a ON a.id=d.alert_id WHERE d.status='QUEUED' AND d.next_attempt_at<=now() AND a.status='CONFIRMED' ORDER BY d.next_attempt_at FOR UPDATE OF d SKIP LOCKED LIMIT 1")
        .fetch_optional(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
    let Some(row)=row else{tx.commit().await.map_err(|_|"DB_UNAVAILABLE")?;return Ok("EMPTY")};
    let id:Uuid=row.get("id");let email:String=row.get("email");let attempts:i32=row.get("attempts");
    if email.len()>254||!email.contains('@')||email.contains(['\r','\n']){return Err("SMTP_RECIPIENT_INVALID".into())}
    sqlx::query("UPDATE pit_deliveries SET attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' WHERE id=$1").bind(id).execute(&mut *tx).await.map_err(|_|"DB_UNAVAILABLE")?;
    tx.commit().await.map_err(|_|"DB_UNAVAILABLE")?;
    let body=format!("From: {from}\r\nTo: {email}\r\nSubject: PIT Crypto contract alert\r\n\r\nMonitor {} observed confirmed transaction {}. Review your PIT Crypto inbox.\r\n",row.get::<Uuid,_>("monitor_id"),row.get::<String,_>("transaction_hash"));
    let outcome=tokio::time::timeout(std::time::Duration::from_secs(5),send(host,*port,from,&email,&body)).await;
    if matches!(outcome,Ok(Ok(()))){sqlx::query("UPDATE pit_deliveries SET status='SENT',sent_at=now() WHERE id=$1").bind(id).execute(pool).await.map_err(|_|"DB_UNAVAILABLE")?;return Ok("SENT")}
    sqlx::query("UPDATE pit_deliveries SET status=$2,next_attempt_at=now()+interval '5 minutes' WHERE id=$1").bind(id).bind(if attempts>=2{"FAILED"}else{"QUEUED"}).execute(pool).await.map_err(|_|"DB_UNAVAILABLE")?;Ok("RETRY")
}
async fn send(host:&str,port:u16,from:&str,to:&str,body:&str)->Result<(),String>{
    let stream=TcpStream::connect((host,port)).await.map_err(|_|"SMTP_UNAVAILABLE")?;let mut socket=BufReader::new(stream);
    reply(&mut socket,220).await?;command(&mut socket,"EHLO pit-crypto.local\r\n",250).await?;
    command(&mut socket,&format!("MAIL FROM:<{from}>\r\n"),250).await?;
    command(&mut socket,&format!("RCPT TO:<{to}>\r\n"),250).await?;
    command(&mut socket,"DATA\r\n",354).await?;
    socket.get_mut().write_all(body.as_bytes()).await.map_err(|_|"SMTP_UNAVAILABLE")?;
    socket.get_mut().write_all(b".\r\n").await.map_err(|_|"SMTP_UNAVAILABLE")?;reply(&mut socket,250).await?;
    let _=command(&mut socket,"QUIT\r\n",221).await;Ok(())
}
async fn command(socket:&mut BufReader<TcpStream>,message:&str,code:u16)->Result<(),String>{socket.get_mut().write_all(message.as_bytes()).await.map_err(|_|"SMTP_UNAVAILABLE")?;reply(socket,code).await}
async fn reply(socket:&mut BufReader<TcpStream>,expected:u16)->Result<(),String>{let mut line=String::new();for _ in 0..20 {line.clear();if socket.read_line(&mut line).await.map_err(|_|"SMTP_UNAVAILABLE")?==0{return Err("SMTP_DISCONNECTED".into())}if line.len()>1024||line.len()<4{return Err("SMTP_INVALID_RESPONSE".into())}let code=line[..3].parse::<u16>().map_err(|_|"SMTP_INVALID_RESPONSE")?;if code!=expected{return Err("SMTP_REJECTED".into())}if line.as_bytes()[3]==b' '{return Ok(())}}Err("SMTP_INVALID_RESPONSE".into())}
