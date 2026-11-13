mod api;
mod auth;
mod config;
mod monitor;
mod rpc;
mod safe_http;
mod smtp;
mod tools;
mod worker;
#[cfg(test)] mod integration;

use std::sync::Arc;
use config::Config;
use sqlx::postgres::PgPoolOptions;

pub struct App {
    pub pool: sqlx::PgPool,
    pub config: Config,
    pub http: reqwest::Client,
    pub request_gate: Arc<tokio::sync::Semaphore>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error+Send+Sync>> {
    tracing_subscriber::fmt().with_env_filter("pit_crypto_backend_v2=info,warn").init();
    if std::env::args().nth(1).as_deref()==Some("api-health") {
        let port=std::env::var("PIT_API_PORT").unwrap_or_else(|_|"8789".into());
        let response=reqwest::Client::builder().timeout(std::time::Duration::from_secs(3)).no_proxy().build()?.get(format!("http://127.0.0.1:{port}/pit/api/v1/ready")).send().await?;
        if !response.status().is_success(){return Err("API_NOT_READY".into())}return Ok(())
    }
    let config = Config::from_env()?;
    let pool = PgPoolOptions::new().max_connections(5).acquire_timeout(std::time::Duration::from_secs(3))
        .connect(&config.database_url).await?;
    let http = reqwest::Client::builder().timeout(std::time::Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none()).build()?;
    let app = Arc::new(App { pool, config, http, request_gate:Arc::new(tokio::sync::Semaphore::new(32)) });
    match std::env::args().nth(1).as_deref() {
        Some("api") => api::serve(app).await?,
        Some("worker") => worker::run(app).await?,
        Some("worker-health") => {let live:Option<bool>=sqlx::query_scalar("SELECT last_seen>now()-interval '2 minutes' FROM pit_worker_heartbeat WHERE singleton=true").fetch_optional(&app.pool).await?;if live!=Some(true){return Err("WORKER_NOT_READY".into())}},
        Some("migrate") => {
            for migration in [include_str!("../../backend/migrations/001_init.sql"), include_str!("../../backend/migrations/002_edge_nonces.sql"),include_str!("../migrations/003_retry_schedule.sql")] {
                sqlx::raw_sql(migration).execute(&app.pool).await?;
            }
        },
        _ => return Err("expected mode: api, worker, migrate".into()),
    }
    Ok(())
}
