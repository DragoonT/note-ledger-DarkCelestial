use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderValue, Method, header},
    routing::{get, post, put},
};
use sqlx::PgPool;
use std::net::SocketAddr;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::core::models::AppState;
use crate::handlers::{
    accounts::{create_account, delete_account, list_accounts, reset_account_data, update_account},
    auth::{
        create_user, delete_user, list_users, login, logout, me, reset_password, update_profile,
        update_user,
    },
    backup::{
        export_backup, export_dragoont_backup, import_dragoont_backup, preview_dragoont_backup,
        restore_backup,
    },
    bank_details::{
        create_template, delete_detail, delete_template, detail_meta, list_templates,
        reveal_detail, save_detail, update_template,
    },
    options::{
        create_transaction_option, delete_transaction_option, list_transaction_options,
        update_transaction_option,
    },
    transactions::{
        create_transaction, delete_transaction, list_transactions, summary, update_transaction,
    },
};

/// Build the full API router on top of the shared database pool.
pub fn build_router(pool: PgPool) -> Router {
    let origin = std::env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into());
    let cors = CorsLayer::new()
        .allow_origin(origin.parse::<HeaderValue>().expect("invalid CORS_ORIGIN"))
        .allow_credentials(true)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::HeaderName::from_static("x-backup-password"),
        ]);

    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/profile", put(update_profile))
        .route("/api/profile/password", put(reset_password))
        .route(
            "/api/profile/data",
            axum::routing::delete(reset_account_data),
        )
        .route("/api/backup", get(export_backup).post(restore_backup))
        .route("/api/backup/export", post(export_dragoont_backup))
        .route("/api/backup/preview", post(preview_dragoont_backup))
        .route("/api/backup/import", post(import_dragoont_backup))
        .route("/api/admin/users", get(list_users).post(create_user))
        .route(
            "/api/admin/users/{id}",
            put(update_user).delete(delete_user),
        )
        .route(
            "/api/transaction-options",
            get(list_transaction_options).post(create_transaction_option),
        )
        .route(
            "/api/transaction-options/{id}",
            put(update_transaction_option).delete(delete_transaction_option),
        )
        .route("/api/accounts", get(list_accounts).post(create_account))
        .route(
            "/api/bank-detail-templates",
            get(list_templates).post(create_template),
        )
        .route(
            "/api/bank-detail-templates/{id}",
            put(update_template).delete(delete_template),
        )
        .route(
            "/api/accounts/{id}/protected-details",
            get(detail_meta).put(save_detail).delete(delete_detail),
        )
        .route(
            "/api/accounts/{id}/protected-details/reveal",
            post(reveal_detail),
        )
        .route(
            "/api/accounts/{id}",
            put(update_account).delete(delete_account),
        )
        .route(
            "/api/transactions",
            get(list_transactions).post(create_transaction),
        )
        .route(
            "/api/transactions/{id}",
            put(update_transaction).delete(delete_transaction),
        )
        .route("/api/summary", get(summary))
        .with_state(AppState { db: pool })
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

/// Bind the listener and serve the API until shutdown.
pub async fn serve(pool: PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let app = build_router(pool);
    let address = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!(%address, "API listening");
    axum::serve(tokio::net::TcpListener::bind(address).await?, app).await?;
    Ok(())
}
