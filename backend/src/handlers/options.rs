use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::AppState;
use crate::core::error::{ApiError, admin, current_user, internal};
use crate::core::models::{Scope, TransactionOption, TransactionOptionInput};

pub async fn list_transaction_options(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<TransactionOption>>, ApiError> {
    current_user(&state, &headers).await?;
    sqlx::query_as::<_, TransactionOption>(
        "SELECT id,option_type,value,optional_text_enabled FROM transaction_options ORDER BY option_type,created_at,value",
    )
    .fetch_all(&state.db)
    .await
    .map(Json)
    .map_err(internal)
}

pub async fn create_transaction_option(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<TransactionOptionInput>,
) -> Result<(StatusCode, Json<TransactionOption>), ApiError> {
    admin(&state, &headers).await?;
    let value = input.value.trim();
    if !matches!(
        input.option_type.as_str(),
        "income_category" | "expense_category" | "payment_channel"
    ) || value.is_empty()
        || value.chars().count() > 60
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Choose a valid field and enter a value up to 60 characters".into(),
        ));
    }
    let row = sqlx::query_as::<_, TransactionOption>(
        "INSERT INTO transaction_options(id,option_type,value,optional_text_enabled) VALUES($1,$2,$3,$4) RETURNING id,option_type,value,optional_text_enabled",
    )
    .bind(Uuid::new_v4())
    .bind(input.option_type)
    .bind(value)
    .bind(input.optional_text_enabled)
    .fetch_one(&state.db)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(ref database) if database.is_unique_violation() => {
            ApiError(StatusCode::CONFLICT, "This option already exists".into())
        }
        other => internal(other),
    })?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update_transaction_option(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<TransactionOptionInput>,
) -> Result<Json<TransactionOption>, ApiError> {
    admin(&state, &headers).await?;
    let value = input.value.trim();
    if !matches!(
        input.option_type.as_str(),
        "income_category" | "expense_category" | "payment_channel"
    ) || value.is_empty()
        || value.chars().count() > 60
    {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Invalid option".into()));
    }
    sqlx::query_as::<_, TransactionOption>(
        "UPDATE transaction_options SET value=$2,optional_text_enabled=$3 WHERE id=$1 AND option_type=$4 RETURNING id,option_type,value,optional_text_enabled",
    )
    .bind(id)
    .bind(value)
    .bind(input.optional_text_enabled)
    .bind(input.option_type)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(ref database) if database.is_unique_violation() => {
            ApiError(StatusCode::CONFLICT, "This option already exists".into())
        }
        other => internal(other),
    })?
    .map(Json)
    .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Option not found".into()))
}

pub async fn delete_transaction_option(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    admin(&state, &headers).await?;
    let deleted = sqlx::query("DELETE FROM transaction_options WHERE id=$1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(internal)?;
    if deleted.rows_affected() == 0 {
        return Err(ApiError(StatusCode::NOT_FOUND, "Option not found".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}
