use std::{
    env, fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use pbkdf2::pbkdf2_hmac;
use prost::Message as _;
use rsa::{
    Oaep, RsaPublicKey,
    pkcs8::DecodePublicKey,
    rand_core::{OsRng, RngCore},
};
use sha2::Sha256;
use sqlx::PgPool;
use uuid::Uuid;

use crate::core::error::password_hash;
use backup_proto::{
    AccountCredential, AccountCredentialStore, AdminCredentials, RECOVERY_PUBLIC_KEY_DER_BASE64,
};

const DEFAULT_ACCOUNT_FILE: &str = "data/account.dragoont";
const LEGACY_DRAGOONT_MAGIC: &[u8] = b"DRAGOONT3";
const DRAGOONT_MAGIC: &[u8] = b"DRAGOONT5";
const KDF_ROUNDS: u32 = 210_000;
static ACCOUNT_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, PartialEq, Eq)]
pub enum CredentialStatus {
    Missing,
    Verified,
}

pub fn configured_admin_username() -> String {
    env::var("ADMIN_USERNAME")
        .unwrap_or_else(|_| "admin".into())
        .trim()
        .to_lowercase()
}

pub fn encode_admin_password(plain: &str) -> Result<String, Box<dyn std::error::Error>> {
    Ok(STANDARD.encode(
        AdminCredentials {
            password_b64: STANDARD.encode(plain.as_bytes()).into_bytes(),
        }
        .encode_to_vec(),
    ))
}

pub fn decode_admin_password(encoded: &str) -> Result<String, Box<dyn std::error::Error>> {
    let encoded = encoded.trim();
    let raw = STANDARD.decode(encoded)?;
    if STANDARD.encode(&raw) != encoded {
        return Err("Credential uses non-canonical Base64".into());
    }
    let credentials = AdminCredentials::decode(raw.as_slice())
        .map_err(|_| "Credential is not AdminCredentials protobuf")?;
    if credentials.encode_to_vec() != raw || credentials.password_b64.is_empty() {
        return Err("Credential protobuf is not canonical".into());
    }
    let inner_text = std::str::from_utf8(&credentials.password_b64)?;
    let inner = STANDARD.decode(inner_text)?;
    if STANDARD.encode(&inner) != inner_text {
        return Err("Password Base64 is not canonical".into());
    }
    Ok(String::from_utf8(inner)?)
}

fn account_file_path() -> PathBuf {
    env::var_os("ACCOUNT_CREDENTIAL_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_ACCOUNT_FILE))
}

pub(crate) fn encrypt_for_recovery(payload: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let der = STANDARD.decode(RECOVERY_PUBLIC_KEY_DER_BASE64)?;
    let public_key = RsaPublicKey::from_public_key_der(&der)?;
    Ok(public_key.encrypt(&mut OsRng, Oaep::new::<Sha256>(), payload)?)
}

fn load_store(path: &PathBuf) -> Result<AccountCredentialStore, Box<dyn std::error::Error>> {
    match fs::read(path) {
        Ok(file) => {
            let body = if file.starts_with(DRAGOONT_MAGIC) {
                &file[DRAGOONT_MAGIC.len()..]
            } else if file.starts_with(LEGACY_DRAGOONT_MAGIC) {
                &file[LEGACY_DRAGOONT_MAGIC.len()..]
            } else {
                return Err("Account file is not a supported .dragoont container".into());
            };
            let store = AccountCredentialStore::decode(body)?;
            if !matches!(store.version, 1 | 2) {
                return Err("Account credential version is unsupported".into());
            }
            Ok(store)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AccountCredentialStore {
            version: 2,
            accounts: Vec::new(),
        }),
        Err(error) => Err(error.into()),
    }
}

fn save_store(
    path: &PathBuf,
    store: &AccountCredentialStore,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = DRAGOONT_MAGIC.to_vec();
    store.encode(&mut file)?;
    fs::write(path, file)?;
    Ok(())
}

fn encrypted_entry(
    user_id: Uuid,
    account_name: &str,
    password: &str,
) -> Result<AccountCredential, Box<dyn std::error::Error>> {
    if !(12..=256).contains(&password.chars().count()) {
        return Err("Password length is invalid".into());
    }
    let payload = AdminCredentials {
        password_b64: STANDARD.encode(password.as_bytes()).into_bytes(),
    }
    .encode_to_vec();
    let encrypted_credentials = password_hash(password)
        .map_err(|error| error.1)?
        .into_bytes();
    let mut recovery_key = [0_u8; 32];
    OsRng.fill_bytes(&mut recovery_key);
    let wrapped_key = encrypt_for_recovery(&recovery_key)?;
    let wrapped_len = u16::try_from(wrapped_key.len())?;
    let recovery_nonce = Uuid::new_v4().as_bytes()[..12].to_vec();
    let ciphertext = Aes256Gcm::new_from_slice(&recovery_key)?
        .encrypt(Nonce::from_slice(&recovery_nonce), payload.as_ref())
        .map_err(|_| "Could not encrypt account recovery credential")?;
    let mut encrypted_recovery = Vec::with_capacity(2 + wrapped_key.len() + ciphertext.len());
    encrypted_recovery.extend_from_slice(&wrapped_len.to_be_bytes());
    encrypted_recovery.extend_from_slice(&wrapped_key);
    encrypted_recovery.extend_from_slice(&ciphertext);
    Ok(AccountCredential {
        user_id: user_id.to_string(),
        salt: Vec::new(),
        nonce: Vec::new(),
        encrypted_credentials,
        account_name: account_name.to_string(),
        recovery_nonce,
        encrypted_recovery,
    })
}

fn verify_entry(
    entry: &AccountCredential,
    password: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if entry.salt.is_empty() && entry.nonce.is_empty() {
        use argon2::{Argon2, PasswordHash, PasswordVerifier};
        let encoded = std::str::from_utf8(&entry.encrypted_credentials)?;
        let hash = PasswordHash::new(encoded).map_err(|_| "Invalid account password verifier")?;
        Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .map_err(|_| "Incorrect account password")?;
        return Ok(());
    }
    if entry.salt.len() != 16 || entry.nonce.len() != 12 {
        return Err("Account credential metadata is invalid".into());
    }
    let mut key = [0_u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &entry.salt, KDF_ROUNDS, &mut key);
    let payload = Aes256Gcm::new_from_slice(&key)?
        .decrypt(
            Nonce::from_slice(&entry.nonce),
            entry.encrypted_credentials.as_ref(),
        )
        .map_err(|_| "Incorrect account password")?;
    let credential = AdminCredentials::decode(payload.as_slice())?;
    if STANDARD.decode(&credential.password_b64)? != password.as_bytes() {
        return Err("Account credential does not match".into());
    }
    Ok(())
}

pub fn verify_account_password(
    user_id: Uuid,
    password: &str,
) -> Result<CredentialStatus, Box<dyn std::error::Error>> {
    let _guard = ACCOUNT_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Account credential lock is unavailable")?;
    let store = load_store(&account_file_path())?;
    let Some(entry) = store
        .accounts
        .iter()
        .find(|entry| entry.user_id == user_id.to_string())
    else {
        return Ok(CredentialStatus::Missing);
    };
    verify_entry(entry, password)?;
    Ok(CredentialStatus::Verified)
}

pub fn store_account_password(
    user_id: Uuid,
    account_name: &str,
    password: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let _guard = ACCOUNT_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Account credential lock is unavailable")?;
    let path = account_file_path();
    let mut store = load_store(&path)?;
    let replacement = encrypted_entry(user_id, account_name, password)?;
    if let Some(entry) = store
        .accounts
        .iter_mut()
        .find(|entry| entry.user_id == user_id.to_string())
    {
        *entry = replacement;
    } else {
        store.accounts.push(replacement);
    }
    store.version = 2;
    save_store(&path, &store)
}

pub fn remove_account_password(user_id: Uuid) -> Result<(), Box<dyn std::error::Error>> {
    let _guard = ACCOUNT_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Account credential lock is unavailable")?;
    let path = account_file_path();
    let mut store = load_store(&path)?;
    store
        .accounts
        .retain(|entry| entry.user_id != user_id.to_string());
    save_store(&path, &store)
}

pub fn rename_account_credential(
    user_id: Uuid,
    account_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let _guard = ACCOUNT_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Account credential lock is unavailable")?;
    let path = account_file_path();
    let mut store = load_store(&path)?;
    if let Some(entry) = store
        .accounts
        .iter_mut()
        .find(|entry| entry.user_id == user_id.to_string())
    {
        entry.account_name = account_name.to_string();
        save_store(&path, &store)?;
    }
    Ok(())
}

pub async fn clear_all_sessions(db: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    sqlx::query("DELETE FROM sessions").execute(db).await?;
    Ok(())
}

pub async fn seed_admin(db: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let username = configured_admin_username();
    if sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE username=$1)")
        .bind(&username)
        .fetch_one(db)
        .await?
    {
        return Ok(());
    }
    let hash = password_hash(&format!(
        "{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    ))
    .map_err(|e| e.1)?;
    sqlx::query("INSERT INTO users(id,username,password_hash,display_name,is_admin) VALUES($1,$2,$3,'Administrator',true)").bind(Uuid::new_v4()).bind(username).bind(hash).execute(db).await?;
    Ok(())
}

pub async fn sync_account_names(db: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let path = account_file_path();
    if !path.exists() {
        return Ok(());
    }
    let names = sqlx::query_as::<_, (Uuid, String)>("SELECT id,display_name FROM users")
        .fetch_all(db)
        .await?;
    let _guard = ACCOUNT_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Account credential lock is unavailable")?;
    let mut store = load_store(&path)?;
    for entry in &mut store.accounts {
        if let Some((_, username)) = names.iter().find(|(id, _)| entry.user_id == id.to_string()) {
            entry.account_name = username.clone();
        }
    }
    save_store(&path, &store)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_envelope_rejects_plain_base64() {
        let encoded = encode_admin_password("correct horse battery staple").unwrap();
        assert_eq!(
            decode_admin_password(&encoded).unwrap(),
            "correct horse battery staple"
        );
        assert!(decode_admin_password(&STANDARD.encode("correct horse battery staple")).is_err());
    }
    #[test]
    fn account_entry_requires_its_password() {
        let entry =
            encrypted_entry(Uuid::new_v4(), "test", "correct horse battery staple").unwrap();
        assert!(verify_entry(&entry, "correct horse battery staple").is_ok());
        assert!(verify_entry(&entry, "wrong password value").is_err());
        assert!(encrypted_entry(Uuid::new_v4(), "test", &"x".repeat(256)).is_ok());
    }
}
