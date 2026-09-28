use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use uuid::Uuid;

use crate::{
    AppState,
    core::{
        admin::decode_admin_password,
        error::{ApiError, admin, current_user, internal},
        models::{
            BankDetailTemplate, BankDetailTemplateInput, ProtectedBankDetailInput,
            ProtectedBankDetailMeta, ProtectedBankDetailPassword, RevealedBankDetail,
        },
    },
};

const KDF_ROUNDS: u32 = 210_000;

pub async fn list_templates(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<BankDetailTemplate>>, ApiError> {
    current_user(&state, &headers).await?;
    sqlx::query_as("SELECT id,name,fields,field_types,field_options FROM bank_detail_templates ORDER BY created_at,name")
        .fetch_all(&state.db)
        .await
        .map(Json)
        .map_err(internal)
}

pub async fn create_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<BankDetailTemplateInput>,
) -> Result<(StatusCode, Json<BankDetailTemplate>), ApiError> {
    admin(&state, &headers).await?;
    let name = input.name.trim();
    let fields: Vec<String> = input
        .fields
        .into_iter()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();
    if name.is_empty()
        || name.chars().count() > 60
        || fields.is_empty()
        || fields.len() > 20
        || fields.iter().any(|v| v.chars().count() > 60)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Enter a type name and one or more valid field names".into(),
        ));
    }
    validate_field_config(&fields, &input.field_types, &input.field_options)?;
    let row = sqlx::query_as("INSERT INTO bank_detail_templates(id,name,fields,field_types,field_options) VALUES($1,$2,$3,$4,$5) RETURNING id,name,fields,field_types,field_options").bind(Uuid::new_v4()).bind(name).bind(fields).bind(serde_json::to_value(input.field_types).map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "Could not encode field configuration".into()))?).bind(serde_json::to_value(input.field_options).map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "Could not encode field configuration".into()))?).fetch_one(&state.db).await.map_err(|e| match e { sqlx::Error::Database(ref d) if d.is_unique_violation() => ApiError(StatusCode::CONFLICT,"This detail type already exists".into()), other => internal(other) })?;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn update_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<BankDetailTemplateInput>,
) -> Result<Json<BankDetailTemplate>, ApiError> {
    admin(&state, &headers).await?;
    let name = input.name.trim();
    let fields: Vec<String> = input
        .fields
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect();
    if name.is_empty()
        || name.chars().count() > 60
        || fields.is_empty()
        || fields.len() > 20
        || fields.iter().any(|value| value.chars().count() > 60)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Enter a type name and one or more valid field names".into(),
        ));
    }
    validate_field_config(&fields, &input.field_types, &input.field_options)?;
    let row = sqlx::query_as(
        "UPDATE bank_detail_templates SET name=$2,fields=$3,field_types=$4,field_options=$5 WHERE id=$1 RETURNING id,name,fields,field_types,field_options",
    )
    .bind(id)
    .bind(name)
    .bind(fields)
    .bind(serde_json::to_value(input.field_types).map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "Could not encode field configuration".into()))?)
    .bind(serde_json::to_value(input.field_options).map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "Could not encode field configuration".into()))?)
    .fetch_optional(&state.db)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(ref database_error) if database_error.is_unique_violation() => {
            ApiError(StatusCode::CONFLICT, "This detail type already exists".into())
        }
        other => internal(other),
    })?
    .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "Detail type not found".into()))?;
    Ok(Json(row))
}

fn validate_field_config(
    fields: &[String],
    field_types: &std::collections::HashMap<String, String>,
    field_options: &std::collections::HashMap<String, Vec<String>>,
) -> Result<(), ApiError> {
    for field in fields {
        let field_type = field_types.get(field).map(String::as_str).unwrap_or("text");
        if !matches!(
            field_type,
            "text"
                | "number"
                | "segmented"
                | "date"
                | "month"
                | "dropdown"
                | "textarea"
                | "checkbox"
                | "switch"
        ) {
            return Err(ApiError(
                StatusCode::BAD_REQUEST,
                "Invalid protected field type".into(),
            ));
        }
        if field_type == "dropdown" {
            let options = field_options.get(field).cloned().unwrap_or_default();
            if options.is_empty()
                || options.len() > 50
                || options
                    .iter()
                    .any(|option| option.trim().is_empty() || option.chars().count() > 100)
            {
                return Err(ApiError(
                    StatusCode::BAD_REQUEST,
                    "Dropdown fields require valid options".into(),
                ));
            }
        }
        if field_type == "segmented" {
            let tokens = field_options.get(field).cloned().unwrap_or_default();
            let valid_segment = |token: &str| {
                let token = token.trim().to_ascii_lowercase();
                token == "number"
                    || token == "number:*"
                    || token == "text"
                    || token == "text:*"
                    || token.strip_prefix("number:").is_some_and(|length| {
                        length
                            .parse::<u16>()
                            .is_ok_and(|value| value > 0 && value <= 100)
                    })
                    || token.strip_prefix("text:").is_some_and(|length| {
                        length
                            .parse::<u16>()
                            .is_ok_and(|value| value > 0 && value <= 100)
                    })
            };
            if tokens.is_empty()
                || tokens.len() > 20
                || !tokens.iter().any(|token| valid_segment(token))
                || tokens
                    .iter()
                    .any(|token| token.trim().is_empty() || token.chars().count() > 100)
            {
                return Err(ApiError(
                    StatusCode::BAD_REQUEST,
                    "Segmented fields require valid number, text, and separator tokens".into(),
                ));
            }
        }
    }
    Ok(())
}

pub async fn delete_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    admin(&state, &headers).await?;
    let result = sqlx::query("DELETE FROM bank_detail_templates WHERE id=$1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(_) => {
                ApiError(StatusCode::CONFLICT, "This detail type is in use".into())
            }
            other => internal(other),
        })?;
    if result.rows_affected() == 0 {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "Detail type not found".into(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn owned_account(state: &AppState, headers: &HeaderMap, id: Uuid) -> Result<Uuid, ApiError> {
    let user = current_user(state, headers).await?;
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM bank_accounts WHERE id=$1 AND user_id=$2)",
    )
    .bind(id)
    .bind(user.id)
    .fetch_one(&state.db)
    .await
    .map_err(internal)?;
    if !exists {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "Bank account not found".into(),
        ));
    }
    Ok(user.id)
}

fn plain_password(encoded: &str) -> Result<String, ApiError> {
    decode_admin_password(encoded)
        .map_err(|_| ApiError(StatusCode::UNAUTHORIZED, "Invalid password".into()))
}
fn protected_detail_password(encoded: &str) -> Result<String, ApiError> {
    let password = plain_password(encoded)?;
    if password.chars().count() < 8 || password.chars().count() > 200 {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Bank detail password must be at least 8 characters".into(),
        ));
    }
    Ok(password)
}

pub async fn detail_meta(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Option<ProtectedBankDetailMeta>>, ApiError> {
    owned_account(&state, &headers, id).await?;
    sqlx::query_as::<_, (Uuid,)>(
        "SELECT template_id FROM bank_account_protected_details WHERE account_id=$1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map(|row| Json(row.map(|(template_id,)| ProtectedBankDetailMeta { template_id })))
    .map_err(internal)
}

pub async fn save_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<ProtectedBankDetailInput>,
) -> Result<StatusCode, ApiError> {
    owned_account(&state, &headers, id).await?;
    let password = protected_detail_password(&input.password)?;
    let fields = sqlx::query_scalar::<_, Vec<String>>(
        "SELECT fields FROM bank_detail_templates WHERE id=$1",
    )
    .bind(input.template_id)
    .fetch_optional(&state.db)
    .await
    .map_err(internal)?
    .ok_or_else(|| ApiError(StatusCode::BAD_REQUEST, "Invalid detail type".into()))?;
    if input.values.keys().any(|key| !fields.contains(key))
        || input.values.values().any(|v| v.chars().count() > 500)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Invalid protected detail fields".into(),
        ));
    }
    let salt = Uuid::new_v4().as_bytes().to_vec();
    let nonce = Uuid::new_v4().as_bytes()[..12].to_vec();
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, KDF_ROUNDS, &mut key);
    let payload = serde_json::to_vec(&input.values).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not encode protected details".into(),
        )
    })?;
    let ciphertext = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not create encryption key".into(),
            )
        })?
        .encrypt(Nonce::from_slice(&nonce), payload.as_ref())
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not encrypt protected details".into(),
            )
        })?;
    sqlx::query("INSERT INTO bank_account_protected_details(account_id,template_id,salt,nonce,ciphertext) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id) DO UPDATE SET template_id=$2,salt=$3,nonce=$4,ciphertext=$5,updated_at=now()").bind(id).bind(input.template_id).bind(salt).bind(nonce).bind(ciphertext).execute(&state.db).await.map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reveal_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<ProtectedBankDetailPassword>,
) -> Result<Json<RevealedBankDetail>, ApiError> {
    owned_account(&state, &headers, id).await?;
    let password = protected_detail_password(&input.password)?;
    let (template_id,salt,nonce,ciphertext)=sqlx::query_as::<_,(Uuid,Vec<u8>,Vec<u8>,Vec<u8>)>("SELECT template_id,salt,nonce,ciphertext FROM bank_account_protected_details WHERE account_id=$1").bind(id).fetch_optional(&state.db).await.map_err(internal)?.ok_or_else(|| ApiError(StatusCode::NOT_FOUND,"Protected details not found".into()))?;
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, KDF_ROUNDS, &mut key);
    let payload = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| {
            ApiError(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Could not create encryption key".into(),
            )
        })?
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| ApiError(StatusCode::UNAUTHORIZED, "Invalid password".into()))?;
    let values = serde_json::from_slice(&payload).map_err(|_| {
        ApiError(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not decode protected details".into(),
        )
    })?;
    Ok(Json(RevealedBankDetail {
        template_id,
        values,
    }))
}

pub async fn delete_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    owned_account(&state, &headers, id).await?;
    sqlx::query("DELETE FROM bank_account_protected_details WHERE account_id=$1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}
