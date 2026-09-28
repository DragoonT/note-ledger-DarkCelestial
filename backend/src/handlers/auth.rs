use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

use crate::core::admin::{
    CredentialStatus, configured_admin_username, decode_admin_password, remove_account_password,
    rename_account_credential, store_account_password, verify_account_password,
};
use crate::core::error::{
    ApiError, admin, current_user, internal, password_hash, session_token, token_hash,
};
use crate::core::models::User;
use crate::core::models::{
    AuthRow, CreateUserInput, LoginInput, LoginResponse, ProfileInput, ResetPasswordInput,
    UpdateUserInput,
};
use crate::{AppState, validate_currency};

fn credential_internal(error: Box<dyn std::error::Error>) -> ApiError {
    tracing::error!(%error, "Account credential operation failed");
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Account credential operation failed".into(),
    )
}

pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginInput>,
) -> Result<Response, ApiError> {
    let username = input.username.trim().to_lowercase();
    // The password must be proto-encoded (AdminCredentials envelope).
    // Plain-text passwords are rejected before any hash verification.
    let password_plain = decode_admin_password(&input.password).map_err(|_| {
        ApiError(
            StatusCode::UNAUTHORIZED,
            "Invalid username or password".into(),
        )
    })?;
    let row=sqlx::query_as::<_,AuthRow>("SELECT id,username,password_hash,display_name,email,default_currency,is_admin,is_active,created_at FROM users WHERE username=$1").bind(username).fetch_optional(&state.db).await.map_err(internal)?;
    let row = row.ok_or_else(|| {
        ApiError(
            StatusCode::UNAUTHORIZED,
            "Invalid username or password".into(),
        )
    })?;
    let hash_valid = row.is_active
        && PasswordHash::new(&row.password_hash)
            .ok()
            .is_some_and(|hash| {
                Argon2::default()
                    .verify_password(password_plain.as_bytes(), &hash)
                    .is_ok()
            });
    let credential_verified = match verify_account_password(row.id, &password_plain) {
        Ok(CredentialStatus::Verified) => true,
        Ok(CredentialStatus::Missing) if row.username == configured_admin_username() => {
            store_account_password(row.id, &row.display_name, &password_plain)
                .map_err(credential_internal)?;
            true
        }
        Ok(CredentialStatus::Missing) if hash_valid => {
            store_account_password(row.id, &row.display_name, &password_plain)
                .map_err(credential_internal)?;
            true
        }
        _ => false,
    };
    if credential_verified {
        store_account_password(row.id, &row.display_name, &password_plain)
            .map_err(credential_internal)?;
        let hash = password_hash(&password_plain)?;
        sqlx::query("UPDATE users SET password_hash=$2 WHERE id=$1")
            .bind(row.id)
            .bind(hash)
            .execute(&state.db)
            .await
            .map_err(internal)?;
    }
    if !row.is_active || !credential_verified {
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "Invalid username or password".into(),
        ));
    }
    let token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
    sqlx::query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)")
        .bind(Uuid::new_v4())
        .bind(row.id)
        .bind(token_hash(&token))
        .bind(Utc::now() + Duration::hours(12))
        .execute(&state.db)
        .await
        .map_err(internal)?;
    let user = User {
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        email: row.email,
        default_currency: row.default_currency,
        is_admin: row.is_admin,
        is_active: row.is_active,
        created_at: row.created_at,
    };
    Ok(Json(LoginResponse { user, token }).into_response())
}
pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(token) = session_token(&headers) {
        let _ = sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(token_hash(token))
            .execute(&state.db)
            .await;
    }
    StatusCode::NO_CONTENT.into_response()
}
pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<User>, ApiError> {
    current_user(&state, &headers).await.map(Json)
}
pub async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ProfileInput>,
) -> Result<Json<User>, ApiError> {
    let user = current_user(&state, &headers).await?;
    if input.display_name.trim().is_empty()
        || input.display_name.chars().count() > 100
        || !validate_currency(&input.default_currency)
    {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid profile".into()));
    }
    sqlx::query("UPDATE users SET display_name=$2,email=NULLIF($3,''),default_currency=$4,updated_at=now() WHERE id=$1").bind(user.id).bind(input.display_name.trim()).bind(input.email.as_deref().unwrap_or("").trim()).bind(&input.default_currency).execute(&state.db).await.map_err(internal)?;
    current_user(&state, &headers).await.map(Json)
}

pub async fn reset_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ResetPasswordInput>,
) -> Result<StatusCode, ApiError> {
    let user = current_user(&state, &headers).await?;
    let current = decode_admin_password(&input.current_password).map_err(|_| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "Current password is incorrect".into(),
        )
    })?;
    let new_password = decode_admin_password(&input.new_password)
        .map_err(|_| ApiError(StatusCode::BAD_REQUEST, "New password is invalid".into()))?;
    let confirmation = decode_admin_password(&input.confirm_password).map_err(|_| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "Password confirmation is invalid".into(),
        )
    })?;
    if new_password != confirmation {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "New passwords do not match".into(),
        ));
    }
    if !(12..=256).contains(&new_password.chars().count()) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "New password must be at least 12 characters".into(),
        ));
    }
    verify_account_password(user.id, &current)
        .and_then(|status| {
            if status == CredentialStatus::Verified {
                Ok(())
            } else {
                Err("Credential is missing".into())
            }
        })
        .map_err(|_| {
            ApiError(
                StatusCode::UNAUTHORIZED,
                "Current password is incorrect".into(),
            )
        })?;
    let hash = password_hash(&new_password)?;
    sqlx::query("UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1")
        .bind(user.id)
        .bind(hash)
        .execute(&state.db)
        .await
        .map_err(internal)?;
    store_account_password(user.id, &user.display_name, &new_password)
        .map_err(credential_internal)?;
    sqlx::query("DELETE FROM sessions WHERE user_id=$1")
        .bind(user.id)
        .execute(&state.db)
        .await
        .map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<User>>, ApiError> {
    admin(&state, &headers).await?;
    sqlx::query_as::<_,User>("SELECT id,username,display_name,email,default_currency,is_admin,is_active,created_at FROM users ORDER BY created_at").fetch_all(&state.db).await.map(Json).map_err(internal)
}
pub async fn create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateUserInput>,
) -> Result<(StatusCode, Json<User>), ApiError> {
    admin(&state, &headers).await?;
    let username = input.username.trim().to_lowercase();
    if username.len() < 3
        || !username
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "_.-".contains(c))
        || input.password.len() < 10
        || input.display_name.trim().is_empty()
        || !validate_currency(&input.default_currency)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Invalid account; password must be at least 10 characters".into(),
        ));
    }
    let password_plain = decode_admin_password(&input.password).map_err(|e| {
        ApiError(
            StatusCode::BAD_REQUEST,
            format!("Invalid password encoding: {e}"),
        )
    })?;
    if password_plain.chars().count() < 12 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Password must be at least 12 characters".into(),
        ));
    }
    let hash = password_hash(&password_plain)?;
    let user=sqlx::query_as::<_,User>("INSERT INTO users(id,username,password_hash,display_name,email,default_currency,is_admin) VALUES($1,$2,$3,$4,NULLIF($5,''),$6,$7) RETURNING id,username,display_name,email,default_currency,is_admin,is_active,created_at").bind(Uuid::new_v4()).bind(username).bind(hash).bind(input.display_name.trim()).bind(input.email.as_deref().unwrap_or("").trim()).bind(input.default_currency).bind(input.is_admin).fetch_one(&state.db).await.map_err(|e|match e {sqlx::Error::Database(ref d) if d.is_unique_violation()=>ApiError(StatusCode::CONFLICT,"Username already exists".into()),other=>internal(other)})?;
    let credential_error = store_account_password(user.id, &user.display_name, &password_plain)
        .err()
        .map(|error| error.to_string());
    if let Some(message) = credential_error {
        tracing::error!(error = %message, "Could not store new account credential");
        let _ = sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(user.id)
            .execute(&state.db)
            .await;
        return Err(ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Account credential operation failed".into(),
        ));
    }
    Ok((StatusCode::CREATED, Json(user)))
}

pub async fn update_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateUserInput>,
) -> Result<Json<User>, ApiError> {
    let current = admin(&state, &headers).await?;
    let username = input.username.trim().to_lowercase();
    let password = input.password.as_deref().unwrap_or("");
    if username.len() < 3
        || !username
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "_.-".contains(c))
        || (!password.is_empty() && password.len() < 10)
        || input.display_name.trim().is_empty()
        || !validate_currency(&input.default_currency)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Invalid account; a new password must be at least 10 characters".into(),
        ));
    }
    let was_admin = sqlx::query_scalar::<_, bool>("SELECT is_admin FROM users WHERE id=$1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(internal)?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Account not found".into()))?;
    if current.id == id && !input.is_admin {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "You cannot remove your own administrator access".into(),
        ));
    }
    if was_admin && !input.is_admin {
        let admin_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM users WHERE is_admin=true AND is_active=true",
        )
        .fetch_one(&state.db)
        .await
        .map_err(internal)?;
        if admin_count <= 1 {
            return Err(ApiError(
                StatusCode::CONFLICT,
                "The last administrator account cannot be changed".into(),
            ));
        }
    }
    let (password_hash, password_plain) = if password.is_empty() {
        (None, None)
    } else {
        // Must be a proto AdminCredentials envelope (frontend encodes it).
        let password_plain = decode_admin_password(password).map_err(|e| {
            ApiError(
                StatusCode::BAD_REQUEST,
                format!("Invalid password encoding: {e}"),
            )
        })?;
        if password_plain.chars().count() < 12 {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Password must be at least 12 characters".into(),
            ));
        }
        (Some(password_hash(&password_plain)?), Some(password_plain))
    };
    let updated = sqlx::query_as::<_, User>(
        "UPDATE users SET username=$2, password_hash=COALESCE($3,password_hash), display_name=$4, email=NULLIF($5,''), default_currency=$6, is_admin=$7, updated_at=now() WHERE id=$1 RETURNING id,username,display_name,email,default_currency,is_admin,is_active,created_at",
    )
    .bind(id)
    .bind(username)
    .bind(password_hash)
    .bind(input.display_name.trim())
    .bind(input.email.as_deref().unwrap_or("").trim())
    .bind(input.default_currency)
    .bind(input.is_admin)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(ref d) if d.is_unique_violation() => {
            ApiError(StatusCode::CONFLICT, "Username already exists".into())
        }
        other => internal(other),
    })?
    .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Account not found".into()))?;
    if let Some(password_plain) = password_plain {
        store_account_password(id, &updated.display_name, &password_plain)
            .map_err(credential_internal)?;
    } else {
        rename_account_credential(id, &updated.display_name).map_err(credential_internal)?;
    }
    Ok(Json(updated))
}

pub async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let current = admin(&state, &headers).await?;
    if current.id == id {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "You cannot delete the account you are currently using".into(),
        ));
    }
    let target_admin = sqlx::query_scalar::<_, bool>("SELECT is_admin FROM users WHERE id=$1")
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .map_err(internal)?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Account not found".into()))?;
    if target_admin {
        let admin_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM users WHERE is_admin=true AND is_active=true",
        )
        .fetch_one(&state.db)
        .await
        .map_err(internal)?;
        if admin_count <= 1 {
            return Err(ApiError(
                StatusCode::CONFLICT,
                "The last administrator account cannot be deleted".into(),
            ));
        }
    }
    let mut tx = state.db.begin().await.map_err(internal)?;
    sqlx::query("DELETE FROM transactions WHERE user_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    sqlx::query("DELETE FROM bank_accounts WHERE user_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    let deleted = sqlx::query("DELETE FROM users WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    if deleted.rows_affected() != 1 {
        return Err(ApiError(StatusCode::NOT_FOUND, "Account not found".into()));
    }
    tx.commit().await.map_err(internal)?;
    remove_account_password(id).map_err(credential_internal)?;
    Ok(StatusCode::NO_CONTENT)
}
