use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub default_currency: String,
    pub is_admin: bool,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Transaction {
    pub id: Uuid,
    pub user_id: Uuid,
    pub account_id: Option<Uuid>,
    pub transfer_id: Option<Uuid>,
    pub counterparty_account_id: Option<Uuid>,
    pub kind: String,
    pub amount_cents: i64,
    pub currency: String,
    pub category: String,
    #[serde(default)]
    pub category_detail: Option<String>,
    pub description: String,
    pub transaction_date: NaiveDate,
    pub transaction_time: NaiveTime,
    pub paid_to: Option<String>,
    pub transaction_reference: Option<String>,
    pub payment_channel: Option<String>,
    #[serde(default)]
    pub payment_channel_detail: Option<String>,
    pub promptpay_to: Option<String>,
    #[serde(default)]
    pub merchant_id: Option<String>,
    #[serde(default)]
    pub shop_id: Option<String>,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Deserialize)]
pub struct TransactionInput {
    pub account_id: Option<Uuid>,
    pub linked_account_id: Option<Uuid>,
    pub linked_transaction_id: Option<Uuid>,
    pub kind: String,
    pub amount_cents: i64,
    pub currency: String,
    pub category: String,
    pub category_detail: Option<String>,
    pub description: String,
    pub transaction_date: NaiveDate,
    pub transaction_time: Option<NaiveTime>,
    pub paid_to: Option<String>,
    pub transaction_reference: Option<String>,
    pub payment_channel: Option<String>,
    pub payment_channel_detail: Option<String>,
    pub promptpay_to: Option<String>,
    #[serde(default)]
    pub merchant_id: Option<String>,
    #[serde(default)]
    pub shop_id: Option<String>,
    pub note: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct CurrencySummary {
    pub currency: String,
    pub income_cents: String,
    pub expense_cents: String,
    pub balance_cents: String,
}
#[derive(Debug, Serialize)]
pub struct Summary {
    pub by_currency: Vec<CurrencySummary>,
    pub transaction_count: i64,
}
#[derive(Debug, Deserialize)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub user: User,
    pub token: String,
}
#[derive(Debug, Deserialize)]
pub struct ProfileInput {
    pub display_name: String,
    pub email: Option<String>,
    pub default_currency: String,
}
#[derive(Debug, Deserialize)]
pub struct ResetPasswordInput {
    pub current_password: String,
    pub new_password: String,
    pub confirm_password: String,
}
#[derive(Debug, Deserialize)]
pub struct CreateUserInput {
    pub username: String,
    pub password: String,
    pub display_name: String,
    pub email: Option<String>,
    pub default_currency: String,
    pub is_admin: bool,
}
#[derive(Debug, Deserialize)]
pub struct UpdateUserInput {
    pub username: String,
    pub password: Option<String>,
    pub display_name: String,
    pub email: Option<String>,
    pub default_currency: String,
    pub is_admin: bool,
}
#[derive(Debug, Serialize, FromRow)]
pub struct TransactionOption {
    pub id: Uuid,
    pub option_type: String,
    pub value: String,
    pub optional_text_enabled: bool,
}
#[derive(Debug, Deserialize)]
pub struct TransactionOptionInput {
    pub option_type: String,
    pub value: String,
    pub optional_text_enabled: bool,
}
#[derive(Debug, Deserialize)]
pub struct Scope {
    pub scope: Option<String>,
    pub account_id: Option<Uuid>,
}
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BankAccount {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub currency: String,
    pub account_number: Option<String>,
    pub card_color: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Deserialize)]
pub struct BankAccountInput {
    pub name: String,
    pub currency: String,
    pub account_number: Option<String>,
    pub card_color: Option<String>,
}
#[derive(Debug, Serialize, FromRow)]
pub struct BankDetailTemplate {
    pub id: Uuid,
    pub name: String,
    pub fields: Vec<String>,
    pub field_types: serde_json::Value,
    pub field_options: serde_json::Value,
}
#[derive(Debug, Deserialize)]
pub struct BankDetailTemplateInput {
    pub name: String,
    pub fields: Vec<String>,
    #[serde(default)]
    pub field_types: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub field_options: std::collections::HashMap<String, Vec<String>>,
}
#[derive(Debug, Deserialize)]
pub struct ProtectedBankDetailInput {
    pub current_password: Option<String>,
    pub id: Option<Uuid>,
    pub template_id: Uuid,
    pub values: std::collections::HashMap<String, String>,
    pub password: String,
}
#[derive(Debug, Deserialize)]
pub struct ProtectedBankDetailPassword {
    pub id: Option<Uuid>,
    pub password: String,
    pub template_id: Option<Uuid>,
}
#[derive(Debug, Serialize)]
pub struct ProtectedBankDetailMeta {
    pub entries: Vec<(Uuid, Uuid)>,
    pub template_id: Uuid,
    pub template_ids: Vec<Uuid>,
}
#[derive(Debug, Serialize)]
pub struct RevealedBankDetail {
    pub template_id: Uuid,
    pub values: std::collections::HashMap<String, String>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct BackupProfile {
    pub display_name: String,
    pub email: Option<String>,
    pub default_currency: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct BackupPayload {
    pub version: u32,
    pub exported_at: DateTime<Utc>,
    pub profile: BackupProfile,
    pub accounts: Vec<BankAccount>,
    pub transactions: Vec<Transaction>,
}
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct BackupClientSettings {
    pub theme: Option<String>,
    pub accent: Option<String>,
    pub locale: Option<String>,
    #[serde(default)]
    pub account_images: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub account_icon_colors: std::collections::HashMap<String, String>,
}
#[derive(Debug, Deserialize)]
pub struct BackupExportRequest {
    pub password: String,
    #[serde(flatten)]
    pub settings: BackupClientSettings,
}
#[derive(Debug, Serialize)]
pub struct BackupImportPreview {
    pub accounts: usize,
    pub transactions: usize,
}
#[derive(Debug, Serialize)]
pub struct BackupRestoreResult {
    pub account_ids: HashMap<String, String>,
}
#[derive(Debug, FromRow)]
pub struct AuthRow {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub display_name: String,
    pub email: Option<String>,
    pub default_currency: String,
    pub is_admin: bool,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}
