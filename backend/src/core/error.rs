use argon2::{Argon2, PasswordHash, PasswordHasher, password_hash::SaltString};
use axum::{
    Json,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

use crate::core::models::AppState;
use crate::core::models::TransactionInput;
use crate::core::models::User;

#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({"error": self.1}))).into_response()
    }
}

pub fn internal(error: sqlx::Error) -> ApiError {
    tracing::error!(%error, "database error");
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Database operation failed".into(),
    )
}
pub fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}
pub fn password_hash(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Password setup failed".into(),
        )
    })?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Password setup failed".into(),
            )
        })
}
pub fn session_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty())
}
pub async fn current_user(state: &AppState, headers: &HeaderMap) -> Result<User, ApiError> {
    let token = session_token(headers)
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "Authentication required".into()))?;
    let hash = token_hash(token);
    // Reject sessions idle for more than 10 minutes server-side, so a browser
    // refresh cannot bypass the inactivity timeout.
    let idle = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
        "SELECT last_seen_at FROM sessions WHERE token_hash=$1",
    )
    .bind(&hash)
    .fetch_optional(&state.db)
    .await
    .map_err(internal)?;
    if let Some(Some(last_seen)) = idle {
        if Utc::now() - last_seen > Duration::minutes(10) {
            sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
                .bind(&hash)
                .execute(&state.db)
                .await
                .map_err(internal)?;
            return Err(ApiError(StatusCode::UNAUTHORIZED, "Session expired".into()));
        }
    }
    let user = sqlx::query_as::<_, User>("SELECT u.id,u.username,u.display_name,u.email,u.default_currency,u.is_admin,u.is_active,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true")
        .bind(&hash).fetch_optional(&state.db).await.map_err(internal)?.ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "Session expired".into()))?;
    sqlx::query("UPDATE sessions SET last_seen_at=$2 WHERE token_hash=$1")
        .bind(hash)
        .bind(Utc::now())
        .execute(&state.db)
        .await
        .map_err(internal)?;
    Ok(user)
}
pub async fn admin(state: &AppState, headers: &HeaderMap) -> Result<User, ApiError> {
    let user = current_user(state, headers).await?;
    if !user.is_admin {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Administrator access required".into(),
        ));
    }
    Ok(user)
}
pub fn validate_currency(value: &str) -> bool {
    value.len() == 3 && value.chars().all(|c| c.is_ascii_uppercase())
}
pub fn validate_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}
pub fn validate_transaction(input: &TransactionInput) -> Result<(), ApiError> {
    if !matches!(input.kind.as_str(), "income" | "expense") {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Type must be income or expense".into(),
        ));
    }
    if input.amount_cents <= 0 || input.amount_cents > 9_007_199_254_740_991 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Amount must be greater than zero and within the supported exact range".into(),
        ));
    }
    if !validate_currency(&input.currency) {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid currency".into()));
    }
    if input.description.trim().is_empty()
        || input.description.chars().count() > 120
        || input.category.trim().is_empty()
        || input.category.chars().count() > 60
        || input
            .category_detail
            .as_deref()
            .unwrap_or("")
            .chars()
            .count()
            > 120
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Description or category is invalid".into(),
        ));
    }
    let references = input
        .transaction_reference
        .as_deref()
        .unwrap_or("")
        .lines()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>();
    if input.paid_to.as_deref().unwrap_or("").chars().count() > 120
        || references.len() > 20
        || references.iter().any(|value| value.chars().count() > 120)
        || input
            .payment_channel
            .as_deref()
            .unwrap_or("")
            .chars()
            .count()
            > 50
        || input
            .payment_channel_detail
            .as_deref()
            .unwrap_or("")
            .chars()
            .count()
            > 120
        || input.promptpay_to.as_deref().unwrap_or("").chars().count() > 120
        || input.merchant_id.as_deref().unwrap_or("").chars().count() > 120
        || input.shop_id.as_deref().unwrap_or("").chars().count() > 120
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Expense details are too long".into(),
        ));
    }
    Ok(())
}
