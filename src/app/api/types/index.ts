export type TransactionKind = "income" | "expense";

export type Transaction = {
  id: string;
  account_id: string | null;
  transfer_id: string | null;
  counterparty_account_id: string | null;
  kind: TransactionKind;
  amount_cents: number;
  currency: string;
  category: string;
  category_detail: string | null;
  description: string;
  transaction_date: string;
  transaction_time: string;
  paid_to: string | null;
  transaction_reference: string | null;
  payment_channel: string | null;
  payment_channel_detail: string | null;
  promptpay_to: string | null;
  merchant_id: string | null;
  shop_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionInput = Pick<
  Transaction,
  | "kind"
  | "amount_cents"
  | "currency"
  | "category"
  | "category_detail"
  | "description"
  | "transaction_date"
  | "transaction_time"
  | "paid_to"
  | "transaction_reference"
  | "payment_channel"
  | "payment_channel_detail"
  | "promptpay_to"
  | "merchant_id"
  | "shop_id"
  | "note"
> & {
  account_id?: string | null;
  linked_account_id?: string | null;
  linked_transaction_id?: string | null;
};
export type CurrencySummary = {
  currency: string;
  income_cents: string;
  expense_cents: string;
  balance_cents: string;
};
export type Summary = {
  by_currency: CurrencySummary[];
  transaction_count: number;
};
export type User = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  default_currency: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
};
export type CreateUserInput = {
  username: string;
  password: string;
  display_name: string;
  email: string | null;
  default_currency: string;
  is_admin: boolean;
};
export type UpdateUserInput = Omit<CreateUserInput, "password"> & {
  password?: string;
};
export type TransactionOptionType =
  | "income_category"
  | "expense_category"
  | "payment_channel";
export type TransactionOption = {
  id: string;
  option_type: TransactionOptionType;
  value: string;
  optional_text_enabled: boolean;
};
export type BankAccount = {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  account_number: string | null;
  card_color: string | null;
  created_at: string;
  updated_at: string;
};
export type BankDetailFieldType = "text" | "number" | "segmented" | "date" | "month" | "dropdown" | "textarea" | "checkbox" | "switch";
export type BankDetailTemplate = {
  id: string;
  name: string;
  fields: string[];
  field_types: Record<string, BankDetailFieldType>;
  field_options: Record<string, string[]>;
};
export type ProtectedBankDetail = { template_id: string; values: Record<string, string> };
export type ProtectedBankDetailMeta = { template_id: string; template_ids: string[]; entries: [string, string][] } | null;
export type BackupData = {
  version: number;
  exported_at: string;
  profile: Pick<User, "display_name" | "email" | "default_currency">;
  accounts: BankAccount[];
  transactions: Transaction[];
  client_settings?: {
    theme?: string | null;
    accent?: string | null;
    locale?: string | null;
    account_images?: Record<string, string>;
    account_icon_colors?: Record<string, string>;
  };
};
export type BackupClientSettings = NonNullable<BackupData["client_settings"]>;
export type BackupPreview = { accounts: number; transactions: number };
