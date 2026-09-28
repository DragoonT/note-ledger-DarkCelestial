use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use pbkdf2::pbkdf2_hmac;
use prost::Message as _;
use rsa::rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::FromRow;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use backup_proto::{BackupArchive, BackupHeader, ClientSettings};

use crate::core::admin::encrypt_for_recovery;
use crate::core::error::{ApiError, admin, current_user, internal, validate_hex_color};
use crate::core::models::{
    BackupClientSettings, BackupExportRequest, BackupImportPreview, BackupPayload, BackupProfile,
    BackupRestoreResult,
};
use crate::core::models::{BankAccount, Transaction, User};
use crate::{AppState, validate_currency};

const BACKUP_MAGIC: &[u8] = b"DRAGOONT7";
const PASSWORD_ONLY_BACKUP_MAGIC: &[u8] = b"DRAGOONT6";
const PRIVATE_KEY_BACKUP_MAGIC: &[u8] = b"DRAGOONT5";
const BACKUP_KDF_ROUNDS: u32 = 210_000;
const WRAPPED_DATA_KEY_LEN: usize = 32 + 16;

fn backup_key(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0_u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, BACKUP_KDF_ROUNDS, &mut key);
    key
}

pub async fn export_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BackupPayload>, ApiError> {
    let user = current_user(&state, &headers).await?;
    let accounts = sqlx::query_as::<_, BankAccount>(
        "SELECT id,user_id,name,currency,account_number,card_color,created_at,updated_at FROM bank_accounts WHERE user_id=$1 ORDER BY created_at",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    .map_err(internal)?;
    let transactions = sqlx::query_as::<_, Transaction>(
        "SELECT * FROM transactions WHERE user_id=$1 ORDER BY transaction_date,transaction_time,created_at",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    .map_err(internal)?;
    Ok(Json(BackupPayload {
        version: 1,
        exported_at: Utc::now(),
        profile: BackupProfile {
            display_name: user.display_name,
            email: user.email,
            default_currency: user.default_currency,
        },
        accounts,
        transactions,
    }))
}

pub fn backup_password(headers: &HeaderMap) -> Result<&str, ApiError> {
    let password = headers
        .get("x-backup-password")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if password.is_empty() || password.chars().count() > 256 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Backup password is required".into(),
        ));
    }
    Ok(password)
}

pub fn encrypt_backup(password: &str, archive: &BackupArchive) -> Result<Vec<u8>, ApiError> {
    if password.is_empty() || password.chars().count() > 256 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Backup password is required".into(),
        ));
    }
    let salt = *Uuid::new_v4().as_bytes();
    let password_key = backup_key(password, &salt);
    let password_cipher = Aes256Gcm::new_from_slice(&password_key).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Backup encryption is unavailable".into(),
        )
    })?;
    let mut data_key = [0_u8; 32];
    OsRng.fill_bytes(&mut data_key);
    let password_nonce_source = Uuid::new_v4();
    let password_nonce = &password_nonce_source.as_bytes()[..12];
    let password_wrapped_key = password_cipher
        .encrypt(Nonce::from_slice(password_nonce), data_key.as_ref())
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not protect backup key".into(),
            )
        })?;
    let recovery_wrapped_key = encrypt_for_recovery(&data_key).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not protect backup recovery key".into(),
        )
    })?;
    let recovery_length = u16::try_from(recovery_wrapped_key.len()).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Backup recovery key is too large".into(),
        )
    })?;
    let data_cipher = Aes256Gcm::new_from_slice(&data_key).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Backup encryption is unavailable".into(),
        )
    })?;
    let data_nonce_source = Uuid::new_v4();
    let data_nonce = &data_nonce_source.as_bytes()[..12];
    let ciphertext = data_cipher
        .encrypt(
            Nonce::from_slice(data_nonce),
            archive.encode_to_vec().as_ref(),
        )
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not encrypt backup".into(),
            )
        })?;
    let mut output = Vec::with_capacity(
        BACKUP_MAGIC.len()
            + salt.len()
            + password_nonce.len()
            + password_wrapped_key.len()
            + 2
            + recovery_wrapped_key.len()
            + data_nonce.len()
            + ciphertext.len(),
    );
    output.extend_from_slice(BACKUP_MAGIC);
    output.extend_from_slice(&salt);
    output.extend_from_slice(password_nonce);
    output.extend_from_slice(&password_wrapped_key);
    output.extend_from_slice(&recovery_length.to_be_bytes());
    output.extend_from_slice(&recovery_wrapped_key);
    output.extend_from_slice(data_nonce);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

pub fn decrypt_backup(
    password: &str,
    file: &[u8],
) -> Result<(BackupPayload, BackupClientSettings), ApiError> {
    if file.starts_with(PRIVATE_KEY_BACKUP_MAGIC) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "This older backup requires the private recovery tool".into(),
        ));
    }
    if password.is_empty() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Backup password is required".into(),
        ));
    }
    let plaintext = if file.starts_with(BACKUP_MAGIC) {
        let salt_start = BACKUP_MAGIC.len();
        let password_nonce_start = salt_start + 16;
        let password_wrapped_start = password_nonce_start + 12;
        let recovery_length_start = password_wrapped_start + WRAPPED_DATA_KEY_LEN;
        if file.len() <= recovery_length_start + 2 {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "This is not a valid .dragoont backup file".into(),
            ));
        }
        let recovery_length =
            u16::from_be_bytes([file[recovery_length_start], file[recovery_length_start + 1]])
                as usize;
        let recovery_start = recovery_length_start + 2;
        let data_nonce_start = recovery_start + recovery_length;
        let data_start = data_nonce_start + 12;
        if recovery_length == 0 || file.len() <= data_start + 16 {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "This is not a valid .dragoont backup file".into(),
            ));
        }
        let password_key = backup_key(password, &file[salt_start..password_nonce_start]);
        let password_cipher = Aes256Gcm::new_from_slice(&password_key).map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Backup decryption is unavailable".into(),
            )
        })?;
        let data_key = password_cipher
            .decrypt(
                Nonce::from_slice(&file[password_nonce_start..password_wrapped_start]),
                &file[password_wrapped_start..recovery_length_start],
            )
            .map_err(|_| {
                ApiError(
                    StatusCode::BAD_REQUEST,
                    "Incorrect backup password or damaged backup file".into(),
                )
            })?;
        let data_cipher = Aes256Gcm::new_from_slice(&data_key).map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Backup decryption is unavailable".into(),
            )
        })?;
        data_cipher
            .decrypt(
                Nonce::from_slice(&file[data_nonce_start..data_start]),
                &file[data_start..],
            )
            .map_err(|_| ApiError(StatusCode::BAD_REQUEST, "Damaged backup file".into()))?
    } else if file.starts_with(PASSWORD_ONLY_BACKUP_MAGIC) {
        let salt_start = PASSWORD_ONLY_BACKUP_MAGIC.len();
        let nonce_start = salt_start + 16;
        let data_start = nonce_start + 12;
        if file.len() <= data_start + 16 {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "This is not a valid .dragoont backup file".into(),
            ));
        }
        let key = backup_key(password, &file[salt_start..nonce_start]);
        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Backup decryption is unavailable".into(),
            )
        })?;
        cipher
            .decrypt(
                Nonce::from_slice(&file[nonce_start..data_start]),
                &file[data_start..],
            )
            .map_err(|_| {
                ApiError(
                    StatusCode::BAD_REQUEST,
                    "Incorrect backup password or damaged backup file".into(),
                )
            })?
    } else {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "This is not a valid .dragoont backup file".into(),
        ));
    };
    let archive = BackupArchive::decode(plaintext.as_slice()).map_err(|_| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "Backup protobuf data is invalid".into(),
        )
    })?;
    let header = archive
        .header
        .ok_or_else(|| ApiError(StatusCode::BAD_REQUEST, "Backup header is missing".into()))?;
    if header.version != 1 || header.format != "expense-ledger" {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Backup version is not supported".into(),
        ));
    }
    let payload = serde_json::from_slice::<BackupPayload>(&archive.ledger_json).map_err(|_| {
        ApiError(
            StatusCode::BAD_REQUEST,
            "Backup ledger data is invalid".into(),
        )
    })?;
    let settings = archive.client_settings.unwrap_or_default();
    Ok((
        payload,
        BackupClientSettings {
            theme: settings.theme,
            accent: settings.accent,
            locale: settings.locale,
            account_images: settings.account_images,
            account_icon_colors: settings.account_icon_colors,
        },
    ))
}

pub async fn export_dragoont_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BackupExportRequest>,
) -> Result<Response, ApiError> {
    let Json(payload) = export_backup(State(state.clone()), headers).await?;
    let archive = BackupArchive {
        header: Some(BackupHeader {
            version: 1,
            exported_at_unix_ms: Utc::now().timestamp_millis(),
            format: "expense-ledger".into(),
        }),
        ledger_json: serde_json::to_vec(&payload).map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not encode backup".into(),
            )
        })?,
        client_settings: Some(ClientSettings {
            theme: request.settings.theme,
            accent: request.settings.accent,
            locale: request.settings.locale,
            account_images: request.settings.account_images,
            account_icon_colors: request.settings.account_icon_colors,
        }),
    };
    let encrypted = encrypt_backup(&request.password, &archive)?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/vnd.dragoont.backup"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=note-ledger.dragoont",
            ),
        ],
        encrypted,
    )
        .into_response())
}

pub async fn preview_dragoont_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<BackupImportPreview>, ApiError> {
    current_user(&state, &headers).await?;
    let password = backup_password(&headers)?;
    if body.len() > 100 * 1024 * 1024 {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Backup file is too large".into(),
        ));
    }
    let (payload, _) = decrypt_backup(password, &body)?;
    Ok(Json(BackupImportPreview {
        accounts: payload.accounts.len(),
        transactions: payload.transactions.len(),
    }))
}

pub async fn import_dragoont_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<BackupClientSettings>, ApiError> {
    if body.len() > 100 * 1024 * 1024 {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Backup file is too large".into(),
        ));
    }
    let password = backup_password(&headers)?.to_owned();
    let (payload, mut settings) = decrypt_backup(&password, &body)?;
    let (_, Json(restored)) = restore_backup(State(state), headers, Json(payload)).await?;
    settings.account_images = settings
        .account_images
        .into_iter()
        .filter_map(|(id, value)| {
            restored
                .account_ids
                .get(&id)
                .cloned()
                .map(|new_id| (new_id, value))
        })
        .collect();
    settings.account_icon_colors = settings
        .account_icon_colors
        .into_iter()
        .filter_map(|(id, value)| {
            restored
                .account_ids
                .get(&id)
                .cloned()
                .map(|new_id| (new_id, value))
        })
        .collect();
    Ok(Json(settings))
}

pub async fn restore_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut backup): Json<BackupPayload>,
) -> Result<(StatusCode, Json<BackupRestoreResult>), ApiError> {
    let user = current_user(&state, &headers).await?;
    if backup.version != 1
        || backup.accounts.is_empty()
        || backup.accounts.len() > 1_000
        || backup.transactions.len() > 100_000
        || backup.profile.display_name.trim().is_empty()
        || backup.profile.display_name.chars().count() > 100
        || backup.profile.default_currency.len() != 3
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Invalid or unsupported backup file".into(),
        ));
    }

    let original_account_ids: HashSet<Uuid> =
        backup.accounts.iter().map(|account| account.id).collect();
    if original_account_ids.len() != backup.accounts.len()
        || backup.accounts.iter().any(|account| {
            account.name.trim().is_empty()
                || account.name.chars().count() > 100
                || account.currency.len() != 3
                || account
                    .card_color
                    .as_deref()
                    .is_some_and(|color| !validate_hex_color(color))
        })
        || backup.transactions.iter().any(|row| {
            row.amount_cents <= 0
                || row.amount_cents > 9_007_199_254_740_991
                || !matches!(row.kind.as_str(), "income" | "expense")
                || row
                    .account_id
                    .is_some_and(|id| !original_account_ids.contains(&id))
                || row
                    .counterparty_account_id
                    .is_some_and(|id| !original_account_ids.contains(&id))
        })
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Backup data is inconsistent".into(),
        ));
    }

    let account_id_map: HashMap<Uuid, Uuid> = backup
        .accounts
        .iter()
        .map(|account| (account.id, Uuid::new_v4()))
        .collect();
    let transaction_id_map: HashMap<Uuid, Uuid> = backup
        .transactions
        .iter()
        .map(|row| (row.id, Uuid::new_v4()))
        .collect();
    let transfer_id_map: HashMap<Uuid, Uuid> = backup
        .transactions
        .iter()
        .filter_map(|row| row.transfer_id)
        .collect::<HashSet<_>>()
        .into_iter()
        .map(|id| (id, Uuid::new_v4()))
        .collect();
    for account in &mut backup.accounts {
        account.id = account_id_map[&account.id];
    }
    for row in &mut backup.transactions {
        row.id = transaction_id_map[&row.id];
        row.account_id = row.account_id.map(|id| account_id_map[&id]);
        row.counterparty_account_id = row.counterparty_account_id.map(|id| account_id_map[&id]);
        row.transfer_id = row.transfer_id.map(|id| transfer_id_map[&id]);
    }
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
    for account in backup.accounts {
        sqlx::query("INSERT INTO bank_accounts(id,user_id,name,currency,account_number,card_color,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
            .bind(account.id).bind(user.id).bind(account.name.trim()).bind(account.currency.to_uppercase()).bind(account.account_number).bind(account.card_color).bind(account.created_at).bind(account.updated_at).execute(&mut *tx).await.map_err(internal)?;
    }
    for row in backup.transactions {
        sqlx::query("INSERT INTO transactions(id,user_id,account_id,transfer_id,counterparty_account_id,kind,amount_cents,currency,category,category_detail,description,transaction_date,transaction_time,paid_to,transaction_reference,payment_channel,payment_channel_detail,promptpay_to,merchant_id,shop_id,note,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)")
            .bind(row.id).bind(user.id).bind(row.account_id).bind(row.transfer_id).bind(row.counterparty_account_id).bind(row.kind).bind(row.amount_cents).bind(row.currency).bind(row.category).bind(row.category_detail).bind(row.description).bind(row.transaction_date).bind(row.transaction_time).bind(row.paid_to).bind(row.transaction_reference).bind(row.payment_channel).bind(row.payment_channel_detail).bind(row.promptpay_to).bind(row.merchant_id).bind(row.shop_id).bind(row.note).bind(row.created_at).bind(row.updated_at).execute(&mut *tx).await.map_err(internal)?;
    }
    tx.commit().await.map_err(internal)?;
    Ok((
        StatusCode::OK,
        Json(BackupRestoreResult {
            account_ids: account_id_map
                .into_iter()
                .map(|(old, new)| (old.to_string(), new.to_string()))
                .collect(),
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_backup_round_trips_with_its_password_only() {
        let archive = BackupArchive {
            header: Some(BackupHeader {
                version: 1,
                exported_at_unix_ms: 1,
                format: "expense-ledger".into(),
            }),
            ledger_json: serde_json::to_vec(&BackupPayload {
                version: 1,
                exported_at: Utc::now(),
                profile: BackupProfile {
                    display_name: "Test".into(),
                    email: None,
                    default_currency: "THB".into(),
                },
                accounts: Vec::new(),
                transactions: Vec::new(),
            })
            .unwrap(),
            client_settings: None,
        };
        let encrypted = encrypt_backup("correct backup password", &archive).unwrap();
        assert!(encrypted.starts_with(BACKUP_MAGIC));
        assert!(decrypt_backup("correct backup password", &encrypted).is_ok());
        assert!(decrypt_backup("wrong backup password", &encrypted).is_err());
    }
}
