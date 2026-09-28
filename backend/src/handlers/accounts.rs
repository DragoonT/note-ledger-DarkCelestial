use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::core::error::{ApiError, current_user, internal};
use crate::core::models::BankAccount;
use crate::core::models::BankAccountInput;
use crate::{AppState, validate_currency, validate_hex_color};

pub async fn list_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<BankAccount>>, ApiError> {
    let user = current_user(&state, &headers).await?;
    let mut rows=sqlx::query_as::<_,BankAccount>("SELECT id,user_id,name,currency,account_number,card_color,created_at,updated_at FROM bank_accounts WHERE user_id=$1 ORDER BY created_at").bind(user.id).fetch_all(&state.db).await.map_err(internal)?;
    if rows.is_empty() {
        let row=sqlx::query_as::<_,BankAccount>("INSERT INTO bank_accounts(id,user_id,name,currency) VALUES($1,$2,'Main Account',$3) RETURNING id,user_id,name,currency,account_number,card_color,created_at,updated_at").bind(Uuid::new_v4()).bind(user.id).bind(user.default_currency).fetch_one(&state.db).await.map_err(internal)?;
        rows.push(row)
    }
    Ok(Json(rows))
}

pub async fn create_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<BankAccountInput>,
) -> Result<(StatusCode, Json<BankAccount>), ApiError> {
    let user = current_user(&state, &headers).await?;
    let name = input.name.trim();
    if name.is_empty()
        || name.chars().count() > 100
        || !validate_currency(&input.currency)
        || input
            .account_number
            .as_deref()
            .unwrap_or("")
            .chars()
            .count()
            > 64
        || input
            .card_color
            .as_deref()
            .is_some_and(|color| !validate_hex_color(color))
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Invalid account name or currency".into(),
        ));
    }
    let row=sqlx::query_as::<_,BankAccount>("INSERT INTO bank_accounts(id,user_id,name,currency,account_number,card_color) VALUES($1,$2,$3,$4,NULLIF($5,''),$6) RETURNING id,user_id,name,currency,account_number,card_color,created_at,updated_at").bind(Uuid::new_v4()).bind(user.id).bind(name).bind(input.currency).bind(input.account_number.as_deref().unwrap_or("").trim()).bind(input.card_color).fetch_one(&state.db).await.map_err(internal)?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn reset_account_data(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user = current_user(&state, &headers).await?;
    let mut tx = state.db.begin().await.map_err(internal)?;
    sqlx::query("DELETE FROM transactions WHERE user_id=$1")
        .bind(user.id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    sqlx::query("DELETE FROM bank_accounts WHERE user_id=$1")
        .bind(user.id)
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    sqlx::query(
        "INSERT INTO bank_accounts(id,user_id,name,currency) VALUES($1,$2,'Main Account',$3)",
    )
    .bind(Uuid::new_v4())
    .bind(user.id)
    .bind(user.default_currency)
    .execute(&mut *tx)
    .await
    .map_err(internal)?;
    tx.commit().await.map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<BankAccountInput>,
) -> Result<Json<BankAccount>, ApiError> {
    let user = current_user(&state, &headers).await?;
    let name = input.name.trim();
    if name.is_empty()
        || name.chars().count() > 100
        || !validate_currency(&input.currency)
        || input
            .account_number
            .as_deref()
            .unwrap_or("")
            .chars()
            .count()
            > 64
        || input
            .card_color
            .as_deref()
            .is_some_and(|color| !validate_hex_color(color))
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Invalid account name or currency".into(),
        ));
    }
    let row = sqlx::query_as::<_, BankAccount>("UPDATE bank_accounts SET name=$1,account_number=NULLIF($4,''),card_color=$5,updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING id,user_id,name,currency,account_number,card_color,created_at,updated_at")
        .bind(name)
        .bind(id)
        .bind(user.id)
        .bind(input.account_number.as_deref().unwrap_or("").trim())
        .bind(input.card_color)
        .fetch_optional(&state.db)
        .await
        .map_err(|error| match error {
            sqlx::Error::Database(ref database) if database.is_unique_violation() => {
                ApiError(StatusCode::CONFLICT, "An account with this name already exists".into())
            }
            other => internal(other),
        })?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Bank account not found".into()))?;
    Ok(Json(row))
}

pub async fn delete_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let user = current_user(&state, &headers).await?;
    let result = sqlx::query("DELETE FROM bank_accounts a WHERE a.id=$1 AND a.user_id=$2 AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id=a.id) AND (SELECT COUNT(*) FROM bank_accounts WHERE user_id=$2)>1")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await
        .map_err(internal)?;
    if result.rows_affected() == 0 {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM bank_accounts WHERE id=$1 AND user_id=$2)",
        )
        .bind(id)
        .bind(user.id)
        .fetch_one(&state.db)
        .await
        .map_err(internal)?;
        return Err(if exists {
            ApiError(
                StatusCode::CONFLICT,
                "Only an empty account can be deleted, and you must keep at least one account"
                    .into(),
            )
        } else {
            ApiError(StatusCode::NOT_FOUND, "Bank account not found".into())
        });
    }
    Ok(StatusCode::NO_CONTENT)
}
