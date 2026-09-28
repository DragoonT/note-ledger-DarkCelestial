use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Duration, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::core::error::{ApiError, admin, current_user, internal, validate_transaction};
use crate::core::models::{
    BankAccount, CurrencySummary, Scope, Summary, Transaction, TransactionInput,
};
use crate::{AppState, validate_currency};

pub async fn list_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(scope): Query<Scope>,
) -> Result<Json<Vec<Transaction>>, ApiError> {
    let user = current_user(&state, &headers).await?;
    let all = scope.scope.as_deref() == Some("all") && user.is_admin;
    let sql = if scope.account_id.is_some() {
        "SELECT * FROM transactions WHERE user_id=$1 AND account_id=$2 ORDER BY transaction_date DESC,transaction_time DESC,created_at DESC"
    } else if all {
        "SELECT * FROM transactions ORDER BY transaction_date DESC,transaction_time DESC,created_at DESC"
    } else {
        "SELECT * FROM transactions WHERE user_id=$1 ORDER BY transaction_date DESC,transaction_time DESC,created_at DESC"
    };
    let rows = if let Some(account_id) = scope.account_id {
        sqlx::query_as::<_, Transaction>(sql)
            .bind(user.id)
            .bind(account_id)
            .fetch_all(&state.db)
            .await
    } else if all {
        sqlx::query_as::<_, Transaction>(sql)
            .fetch_all(&state.db)
            .await
    } else {
        sqlx::query_as::<_, Transaction>(sql)
            .bind(user.id)
            .fetch_all(&state.db)
            .await
    }
    .map_err(internal)?;
    Ok(Json(rows))
}
pub async fn create_transaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<TransactionInput>,
) -> Result<(StatusCode, Json<Transaction>), ApiError> {
    let user = current_user(&state, &headers).await?;
    validate_transaction(&input)?;
    let source = if let Some(id) = input.account_id {
        sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT id,name,currency FROM bank_accounts WHERE id=$1 AND user_id=$2",
        )
        .bind(id)
        .bind(user.id)
        .fetch_optional(&state.db)
        .await
        .map_err(internal)?
        .ok_or_else(|| ApiError(StatusCode::BAD_REQUEST, "Bank account not found".into()))?
    } else {
        sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT id,name,currency FROM bank_accounts WHERE user_id=$1 ORDER BY created_at LIMIT 1",
        )
        .bind(user.id)
        .fetch_one(&state.db)
        .await
        .map_err(internal)?
    };
    let linked = if let Some(linked_id) = input.linked_account_id {
        if linked_id == source.0 {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Choose a different destination account".into(),
            ));
        }
        let target = sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT id,name,currency FROM bank_accounts WHERE id=$1 AND user_id=$2",
        )
        .bind(linked_id)
        .bind(user.id)
        .fetch_optional(&state.db)
        .await
        .map_err(internal)?
        .ok_or_else(|| {
            ApiError(
                StatusCode::BAD_REQUEST,
                "Destination account not found".into(),
            )
        })?;
        if source.2 != target.2 || input.currency != source.2 {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Internal transfers require accounts with the same currency".into(),
            ));
        }
        Some(target)
    } else {
        None
    };
    let mut tx = state.db.begin().await.map_err(internal)?;
    if let (Some(linked_account_id), Some(linked_txn_id)) =
        (input.linked_account_id, input.linked_transaction_id)
    {
        let source_id = source.0;
        let target = sqlx::query_as::<_, Transaction>(
            "SELECT * FROM transactions WHERE id=$1 AND user_id=$2",
        )
        .bind(linked_txn_id)
        .bind(user.id)
        .fetch_optional(&state.db)
        .await
        .map_err(internal)?
        .ok_or_else(|| {
            ApiError(
                StatusCode::BAD_REQUEST,
                "Linked transaction not found".into(),
            )
        })?;
        let target_account_id = target.account_id.ok_or_else(|| {
            ApiError(
                StatusCode::BAD_REQUEST,
                "Linked transaction has no bank account".into(),
            )
        })?;
        if target_account_id == source_id {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Choose a transaction from a different bank account".into(),
            ));
        }
        if target.transfer_id.is_some() {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "That transaction is already linked".into(),
            ));
        }
        if target_account_id != linked_account_id {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "The selected transaction does not belong to that bank account".into(),
            ));
        }
        if target.currency != input.currency {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Linked transactions must use the same currency".into(),
            ));
        }
        if target.amount_cents != input.amount_cents {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Linked transactions must have the same amount".into(),
            ));
        }
        let transfer_id = Uuid::new_v4();
        let row=sqlx::query_as::<_,Transaction>("INSERT INTO transactions(id,user_id,account_id,transfer_id,counterparty_account_id,kind,amount_cents,currency,category,category_detail,description,transaction_date,transaction_time,paid_to,transaction_reference,payment_channel,payment_channel_detail,promptpay_to,merchant_id,shop_id,note)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),$11,$12,COALESCE($13,TIME '00:00'),NULLIF($14,''),NULLIF($15,''),NULLIF($16,''),NULLIF($17,''),NULLIF($18,''),NULLIF($19,''),NULLIF($20,''),NULLIF($21,''))RETURNING *")
            .bind(Uuid::new_v4()).bind(user.id).bind(source_id).bind(transfer_id).bind(linked_account_id).bind(&input.kind).bind(input.amount_cents).bind(&input.currency).bind(input.category.trim()).bind(input.category_detail.as_deref().unwrap_or("").trim()).bind(input.description.trim()).bind(input.transaction_date).bind(input.transaction_time).bind(input.paid_to.as_deref().unwrap_or("").trim()).bind(input.transaction_reference.as_deref().unwrap_or("").trim()).bind(input.payment_channel.as_deref().unwrap_or("").trim()).bind(input.payment_channel_detail.as_deref().unwrap_or("").trim()).bind(input.promptpay_to.as_deref().unwrap_or("").trim()).bind(input.merchant_id.as_deref().unwrap_or("").trim()).bind(input.shop_id.as_deref().unwrap_or("").trim()).bind(input.note.as_deref().unwrap_or("").trim()).fetch_one(&mut *tx).await.map_err(internal)?;
        sqlx::query("UPDATE transactions SET transfer_id=$2,counterparty_account_id=$3,updated_at=now() WHERE id=$1")
            .bind(target.id).bind(transfer_id).bind(source_id).execute(&mut *tx).await.map_err(internal)?;
        tx.commit().await.map_err(internal)?;
        return Ok((StatusCode::CREATED, Json(row)));
    }
    let transfer_id = linked.as_ref().map(|_| Uuid::new_v4());
    let row=sqlx::query_as::<_,Transaction>("INSERT INTO transactions(id,user_id,account_id,transfer_id,counterparty_account_id,kind,amount_cents,currency,category,category_detail,description,transaction_date,transaction_time,paid_to,transaction_reference,payment_channel,payment_channel_detail,promptpay_to,merchant_id,shop_id,note)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),$11,$12,COALESCE($13,TIME '00:00'),NULLIF($14,''),NULLIF($15,''),NULLIF($16,''),NULLIF($17,''),NULLIF($18,''),NULLIF($19,''),NULLIF($20,''),NULLIF($21,''))RETURNING *")
        .bind(Uuid::new_v4()).bind(user.id).bind(source.0).bind(transfer_id).bind(linked.as_ref().map(|target|target.0)).bind(&input.kind).bind(input.amount_cents).bind(&input.currency).bind(input.category.trim()).bind(input.category_detail.as_deref().unwrap_or("").trim()).bind(input.description.trim()).bind(input.transaction_date).bind(input.transaction_time).bind(input.paid_to.as_deref().unwrap_or("").trim()).bind(input.transaction_reference.as_deref().unwrap_or("").trim()).bind(input.payment_channel.as_deref().unwrap_or("").trim()).bind(input.payment_channel_detail.as_deref().unwrap_or("").trim()).bind(input.promptpay_to.as_deref().unwrap_or("").trim()).bind(input.merchant_id.as_deref().unwrap_or("").trim()).bind(input.shop_id.as_deref().unwrap_or("").trim()).bind(input.note.as_deref().unwrap_or("").trim()).fetch_one(&mut *tx).await.map_err(internal)?;
    if let Some(target) = linked {
        let opposite = if input.kind == "income" {
            "expense"
        } else {
            "income"
        };
        sqlx::query("INSERT INTO transactions(id,user_id,account_id,transfer_id,counterparty_account_id,kind,amount_cents,currency,category,description,transaction_date,transaction_time,paid_to,transaction_reference,payment_channel,promptpay_to,note)VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Transfer',$9,$10,COALESCE($11,TIME '00:00'),$12,NULLIF($13,''),'Bank transfer',$12,NULLIF($14,''))")
            .bind(Uuid::new_v4()).bind(user.id).bind(target.0).bind(transfer_id).bind(source.0).bind(opposite).bind(input.amount_cents).bind(&input.currency).bind(input.description.trim()).bind(input.transaction_date).bind(input.transaction_time).bind(&source.1).bind(input.transaction_reference.as_deref().unwrap_or("").trim()).bind("" as &str).execute(&mut *tx).await.map_err(internal)?;
    }
    tx.commit().await.map_err(internal)?;
    Ok((StatusCode::CREATED, Json(row)))
}
pub async fn update_transaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<TransactionInput>,
) -> Result<Json<Transaction>, ApiError> {
    let user = current_user(&state, &headers).await?;
    validate_transaction(&input)?;
    let existing = sqlx::query_as::<_, Transaction>(
        "SELECT * FROM transactions WHERE id=$1 AND (user_id=$2 OR $3)",
    )
    .bind(id)
    .bind(user.id)
    .bind(user.is_admin)
    .fetch_optional(&state.db)
    .await
    .map_err(internal)?
    .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Transaction not found".into()))?;
    let existing_transaction_link = if existing.transfer_id.is_none() {
        if let Some(linked_transaction_id) = input.linked_transaction_id {
            let source_account_id = existing.account_id.ok_or_else(|| {
                ApiError(StatusCode::BAD_REQUEST, "Source account not found".into())
            })?;
            let target = sqlx::query_as::<_, Transaction>(
                "SELECT * FROM transactions WHERE id=$1 AND user_id=$2",
            )
            .bind(linked_transaction_id)
            .bind(existing.user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(internal)?
            .ok_or_else(|| {
                ApiError(
                    StatusCode::BAD_REQUEST,
                    "Linked transaction not found".into(),
                )
            })?;
            let target_account_id = target.account_id.ok_or_else(|| {
                ApiError(
                    StatusCode::BAD_REQUEST,
                    "Linked transaction has no bank account".into(),
                )
            })?;
            if target.id == existing.id || target_account_id == source_account_id {
                return Err(ApiError(
                    StatusCode::BAD_REQUEST,
                    "Choose a transaction from a different bank account".into(),
                ));
            }
            if target.transfer_id.is_some() {
                return Err(ApiError(
                    StatusCode::BAD_REQUEST,
                    "That transaction is already linked".into(),
                ));
            }
            if target.currency != input.currency {
                return Err(ApiError(
                    StatusCode::BAD_REQUEST,
                    "Linked transactions must use the same currency".into(),
                ));
            }
            if target.amount_cents != input.amount_cents {
                return Err(ApiError(
                    StatusCode::BAD_REQUEST,
                    "Linked transactions must have the same amount".into(),
                ));
            }
            if input.linked_account_id != Some(target_account_id) {
                return Err(ApiError(
                    StatusCode::BAD_REQUEST,
                    "The selected transaction does not belong to that bank account".into(),
                ));
            }
            Some((
                target.id,
                source_account_id,
                target_account_id,
                Uuid::new_v4(),
            ))
        } else {
            None
        }
    } else {
        None
    };
    let new_link = if existing.transfer_id.is_none() {
        if existing_transaction_link.is_none() {
            if let Some(linked_id) = input.linked_account_id {
                let source_id = existing.account_id.ok_or_else(|| {
                    ApiError(StatusCode::BAD_REQUEST, "Source account not found".into())
                })?;
                if source_id == linked_id {
                    return Err(ApiError(
                        StatusCode::BAD_REQUEST,
                        "Choose a different destination account".into(),
                    ));
                }
                let source = sqlx::query_as::<_, (Uuid, String, String)>(
                    "SELECT id,name,currency FROM bank_accounts WHERE id=$1 AND user_id=$2",
                )
                .bind(source_id)
                .bind(existing.user_id)
                .fetch_optional(&state.db)
                .await
                .map_err(internal)?
                .ok_or_else(|| {
                    ApiError(StatusCode::BAD_REQUEST, "Source account not found".into())
                })?;
                let target = sqlx::query_as::<_, (Uuid, String, String)>(
                    "SELECT id,name,currency FROM bank_accounts WHERE id=$1 AND user_id=$2",
                )
                .bind(linked_id)
                .bind(existing.user_id)
                .fetch_optional(&state.db)
                .await
                .map_err(internal)?
                .ok_or_else(|| {
                    ApiError(
                        StatusCode::BAD_REQUEST,
                        "Destination account not found".into(),
                    )
                })?;
                if source.2 != target.2 || input.currency != source.2 {
                    return Err(ApiError(
                        StatusCode::BAD_REQUEST,
                        "Internal transfers require accounts with the same currency".into(),
                    ));
                }
                Some((source, target, Uuid::new_v4()))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };
    let unlink_existing = existing.transfer_id.is_some()
        && input.linked_account_id.is_none()
        && input.linked_transaction_id.is_none();
    let mut tx = state.db.begin().await.map_err(internal)?;
    if unlink_existing {
        sqlx::query("UPDATE transactions SET transfer_id=NULL,counterparty_account_id=NULL,updated_at=now() WHERE transfer_id=$1 AND user_id=$2")
            .bind(existing.transfer_id)
            .bind(existing.user_id)
            .execute(&mut *tx)
            .await
            .map_err(internal)?;
    }
    let row=sqlx::query_as::<_,Transaction>("UPDATE transactions SET kind=$2,amount_cents=$3,currency=$4,category=$5,category_detail=NULLIF($6,''),description=$7,transaction_date=$8,transaction_time=COALESCE($9,transaction_time),paid_to=NULLIF($10,''),transaction_reference=NULLIF($11,''),payment_channel=NULLIF($12,''),payment_channel_detail=NULLIF($13,''),promptpay_to=NULLIF($14,''),merchant_id=NULLIF($15,''),shop_id=NULLIF($16,''),note=NULLIF($17,''),transfer_id=COALESCE(transfer_id,$18,$20),counterparty_account_id=COALESCE(counterparty_account_id,$19,$21),updated_at=now() WHERE id=$1 RETURNING *").bind(id).bind(&input.kind).bind(input.amount_cents).bind(&input.currency).bind(input.category.trim()).bind(input.category_detail.as_deref().unwrap_or("").trim()).bind(input.description.trim()).bind(input.transaction_date).bind(input.transaction_time).bind(input.paid_to.as_deref().unwrap_or("").trim()).bind(input.transaction_reference.as_deref().unwrap_or("").trim()).bind(input.payment_channel.as_deref().unwrap_or("").trim()).bind(input.payment_channel_detail.as_deref().unwrap_or("").trim()).bind(input.promptpay_to.as_deref().unwrap_or("").trim()).bind(input.merchant_id.as_deref().unwrap_or("").trim()).bind(input.shop_id.as_deref().unwrap_or("").trim()).bind(input.note.as_deref().unwrap_or("").trim()).bind(new_link.as_ref().map(|link|link.2)).bind(new_link.as_ref().map(|link|link.1.0)).bind(existing_transaction_link.as_ref().map(|link|link.3)).bind(existing_transaction_link.as_ref().map(|link|link.2)).fetch_one(&mut *tx).await.map_err(internal)?;
    if let Some((target_id, source_account_id, _, transfer_id)) = existing_transaction_link {
        sqlx::query("UPDATE transactions SET transfer_id=$2,counterparty_account_id=$3,updated_at=now() WHERE id=$1")
            .bind(target_id)
            .bind(transfer_id)
            .bind(source_account_id)
            .execute(&mut *tx)
            .await
            .map_err(internal)?;
    }
    if let Some(transfer_id) = existing.transfer_id.filter(|_| !unlink_existing) {
        let opposite = if input.kind == "income" {
            "expense"
        } else {
            "income"
        };
        sqlx::query("UPDATE transactions SET kind=$2,amount_cents=$3,currency=$4,updated_at=now() WHERE transfer_id=$1 AND id<>$5").bind(transfer_id).bind(opposite).bind(input.amount_cents).bind(&input.currency).bind(id).execute(&mut *tx).await.map_err(internal)?;
    } else if let Some((source, target, transfer_id)) = new_link {
        let opposite = if input.kind == "income" {
            "expense"
        } else {
            "income"
        };
        sqlx::query("INSERT INTO transactions(id,user_id,account_id,transfer_id,counterparty_account_id,kind,amount_cents,currency,category,description,transaction_date,transaction_time,paid_to,transaction_reference,payment_channel,promptpay_to,note)VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Transfer',$9,$10,COALESCE($11,TIME '00:00'),$12,NULLIF($13,''),'Bank transfer',$12,NULLIF($14,''))")
            .bind(Uuid::new_v4()).bind(existing.user_id).bind(target.0).bind(transfer_id).bind(source.0).bind(opposite).bind(input.amount_cents).bind(&input.currency).bind(input.description.trim()).bind(input.transaction_date).bind(input.transaction_time).bind(&source.1).bind(input.transaction_reference.as_deref().unwrap_or("").trim()).bind("" as &str).execute(&mut *tx).await.map_err(internal)?;
    }
    tx.commit().await.map_err(internal)?;
    Ok(Json(row))
}
pub async fn delete_transaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let user = current_user(&state, &headers).await?;
    let transfer_id = sqlx::query_scalar::<_, Option<Uuid>>(
        "SELECT transfer_id FROM transactions WHERE id=$1 AND (user_id=$2 OR $3)",
    )
    .bind(id)
    .bind(user.id)
    .bind(user.is_admin)
    .fetch_optional(&state.db)
    .await
    .map_err(internal)?
    .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Transaction not found".into()))?;
    if transfer_id.is_some() {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Unlink this transaction before deleting it".into(),
        ));
    }
    let result = sqlx::query("DELETE FROM transactions WHERE id=$1 AND (user_id=$2 OR $3)")
        .bind(id)
        .bind(user.id)
        .bind(user.is_admin)
        .execute(&state.db)
        .await
        .map_err(internal)?;
    if result.rows_affected() == 0 {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "Transaction not found".into(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}
pub async fn summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(scope): Query<Scope>,
) -> Result<Json<Summary>, ApiError> {
    let user = current_user(&state, &headers).await?;
    let all = scope.scope.as_deref() == Some("all") && user.is_admin;
    let filter = if all {
        " WHERE transfer_id IS NULL"
    } else {
        " WHERE user_id=$1 AND transfer_id IS NULL"
    };
    let query = format!(
        "SELECT currency,COALESCE(SUM(amount_cents)FILTER(WHERE kind='income'),0)::text,COALESCE(SUM(amount_cents)FILTER(WHERE kind='expense'),0)::text,(COALESCE(SUM(amount_cents)FILTER(WHERE kind='income'),0)-COALESCE(SUM(amount_cents)FILTER(WHERE kind='expense'),0))::text FROM transactions{filter} GROUP BY currency ORDER BY currency"
    );
    let rows = if all {
        sqlx::query_as::<_, (String, String, String, String)>(&query)
            .fetch_all(&state.db)
            .await
    } else {
        sqlx::query_as::<_, (String, String, String, String)>(&query)
            .bind(user.id)
            .fetch_all(&state.db)
            .await
    }
    .map_err(internal)?;
    let count = if all {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM transactions")
            .fetch_one(&state.db)
            .await
    } else {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM transactions WHERE user_id=$1")
            .bind(user.id)
            .fetch_one(&state.db)
            .await
    }
    .map_err(internal)?;
    Ok(Json(Summary {
        by_currency: rows
            .into_iter()
            .map(|r| CurrencySummary {
                currency: r.0,
                income_cents: r.1,
                expense_cents: r.2,
                balance_cents: r.3,
            })
            .collect(),
        transaction_count: count,
    }))
}
