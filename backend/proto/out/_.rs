// Generated from the external backup.proto schema. Do not edit by hand.
pub const RECOVERY_PUBLIC_KEY_DER_BASE64: &str = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlI3tgYS/b5yK+8AD4VDQmD45LDhUSDhW3fzBHScoGf/VmGqR+Eeovl8P/6ytOhtnsWlpgcEMDBRSNTJz2OzIPrrBkei0i1GqpQPr7gI36nZXEKa69NbxUqYRmyuO2sNkaY/KEdMZ4b7VY1Mvadxy3qokZTLar92vJt/R6EoZk7Fv+/tag3lLR0NrvH/ufElAR5gjCxlNY1nqmWjMg12raHZEinDJiKHS0ErbhZcijxIGtw1aPyvDtesVAEQ+ywG+f0E3qpyJwkLHbTXM0JDohKDYWdRTc7NgeZVnO1JHRMSxch7gCwd4lp59/QpBghDRDKNSq6LlrlORiZ9BzpdT2QIDAQAB";
#[derive(proto_derive::CmdID)]
#[derive(Clone, PartialEq, Eq, Hash, ::prost::Message)]
pub struct BackupHeader {
    #[prost(uint32, tag = "1")]
    pub version: u32,
    #[prost(int64, tag = "2")]
    pub exported_at_unix_ms: i64,
    #[prost(string, tag = "3")]
    pub format: ::prost::alloc::string::String,
}
#[derive(proto_derive::CmdID)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ClientSettings {
    #[prost(string, optional, tag = "1")]
    pub theme: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(string, optional, tag = "2")]
    pub accent: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(string, optional, tag = "3")]
    pub locale: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(map = "string, string", tag = "4")]
    pub account_images: ::std::collections::HashMap<
        ::prost::alloc::string::String,
        ::prost::alloc::string::String,
    >,
    #[prost(map = "string, string", tag = "5")]
    pub account_icon_colors: ::std::collections::HashMap<
        ::prost::alloc::string::String,
        ::prost::alloc::string::String,
    >,
}
#[derive(proto_derive::CmdID)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct BackupArchive {
    #[prost(message, optional, tag = "1")]
    pub header: ::core::option::Option<BackupHeader>,
    #[prost(bytes = "vec", tag = "2")]
    pub ledger_json: ::prost::alloc::vec::Vec<u8>,
    #[prost(message, optional, tag = "3")]
    pub client_settings: ::core::option::Option<ClientSettings>,
}
#[derive(proto_derive::CmdID)]
#[derive(Clone, PartialEq, Eq, Hash, ::prost::Message)]
pub struct AdminCredentials {
    #[prost(bytes = "vec", tag = "1")]
    pub password_b64: ::prost::alloc::vec::Vec<u8>,
}
#[derive(proto_derive::CmdID)]
#[derive(Clone, PartialEq, Eq, Hash, ::prost::Message)]
pub struct AccountCredential {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(bytes = "vec", tag = "2")]
    pub salt: ::prost::alloc::vec::Vec<u8>,
    #[prost(bytes = "vec", tag = "3")]
    pub nonce: ::prost::alloc::vec::Vec<u8>,
    #[prost(bytes = "vec", tag = "4")]
    pub encrypted_credentials: ::prost::alloc::vec::Vec<u8>,
    #[prost(string, tag = "5")]
    pub account_name: ::prost::alloc::string::String,
    #[prost(bytes = "vec", tag = "6")]
    pub recovery_nonce: ::prost::alloc::vec::Vec<u8>,
    #[prost(bytes = "vec", tag = "7")]
    pub encrypted_recovery: ::prost::alloc::vec::Vec<u8>,
}
#[derive(proto_derive::CmdID)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AccountCredentialStore {
    #[prost(uint32, tag = "1")]
    pub version: u32,
    #[prost(message, repeated, tag = "2")]
    pub accounts: ::prost::alloc::vec::Vec<AccountCredential>,
}
