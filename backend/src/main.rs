mod core;
mod handlers;

pub use core::error::{ApiError, internal, validate_currency, validate_hex_color};
pub use core::models::AppState;

use core::admin::{clear_all_sessions, seed_admin, sync_account_names};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "pocket_ledger_api=info,tower_http=info".into()),
        )
        .init();
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    sqlx::migrate!().run(&pool).await?;
    seed_admin(&pool).await?;
    sync_account_names(&pool).await?;
    clear_all_sessions(&pool).await?;
    core::app::serve(pool).await
}
