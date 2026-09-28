use proc_macro::TokenStream;
use quote::quote;
use syn::{DeriveInput, parse_macro_input};

#[proc_macro_derive(CmdID)]
pub fn cmd_id(input: TokenStream) -> TokenStream {
    let name = parse_macro_input!(input as DeriveInput).ident;
    TokenStream::from(quote! {
        impl crate::CmdID for #name {
            const CMD_ID: u16 = 0;
        }
    })
}
