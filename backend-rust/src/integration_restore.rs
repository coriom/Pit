use sqlx::{PgPool,Row};
use uuid::Uuid;

#[tokio::test]
async fn restored_v1_schema_and_records(){
    let Ok(url)=std::env::var("PIT_TEST_RESTORE_DATABASE_URL") else {eprintln!("SKIP disposable V1 restore test");return};
    assert_eq!(url,"postgres://corio@127.0.0.1:55439/pit_v21_v1_restored");
    let pool=PgPool::connect(&url).await.unwrap();
    let job=sqlx::query("SELECT status,progress_json,result_json,next_attempt_at FROM pit_jobs WHERE id=$1")
        .bind(Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(job.get::<String,_>("status"),"PARTIAL");
    let progress:serde_json::Value=job.get("progress_json");
    assert_eq!(progress["coverage"][0]["to"],2);
    let result:serde_json::Value=job.get("result_json");
    assert_eq!(result["missing"][0]["from"],3);
    let _:chrono::DateTime<chrono::Utc>=job.get("next_attempt_at");
    let monitor=sqlx::query("SELECT cursor_block,cursor_hash FROM pit_monitors WHERE id=$1")
        .bind(Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(monitor.get::<i64,_>("cursor_block"),42);
    assert_eq!(monitor.get::<Option<String>,_>("cursor_hash").as_deref(),Some("0xabc"));
    let alerts:i64=sqlx::query_scalar("SELECT count(*) FROM pit_alerts WHERE monitor_id=$1")
        .bind(Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(alerts,1);
    let nonces:i64=sqlx::query_scalar("SELECT count(*) FROM pit_edge_nonces WHERE nonce=$1")
        .bind("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").fetch_one(&pool).await.unwrap();
    assert_eq!(nonces,1);
    pool.close().await;
}
