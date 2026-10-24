const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const SESSION_TOKEN_KEY = "expense-ledger-tab-session";

import type {
  BackupClientSettings,
  BackupData,
  BackupPreview,
  BankAccount,
  BankDetailTemplate,
  ProtectedBankDetail,
  ProtectedBankDetailMeta,
  Summary,
  Transaction,
  TransactionInput,
  TransactionKind,
  TransactionOption,
  CreateUserInput,
  UpdateUserInput,
  TransactionOptionType,
  User,
} from "../types";

function sessionToken() {
  return typeof window === "undefined" ? "" : window.sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
}

function authenticatedHeaders(): Record<string, string> {
  const token = sessionToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authenticatedHeaders(), ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}


export function encodePassword(plain: string): string {
  const passwordB64 = btoa(unescape(encodeURIComponent(plain)));
  // field 1 (password_b64), wire type 2 => tag byte 0x0a, then length, then bytes
  const inner = new TextEncoder().encode(passwordB64);
  const envelope = new Uint8Array(1 + 1 + inner.length);
  envelope[0] = 0x0a;
  envelope[1] = inner.length;
  envelope.set(inner, 2);
  return btoa(String.fromCharCode(...envelope));
}

async function backupRequest(path: string, body: BodyInit, response: "blob", password?: string): Promise<Blob>;
async function backupRequest<T>(path: string, body: BodyInit, response: "json", password?: string): Promise<T>;
async function backupRequest(path: string, body: BodyInit, response: "blob" | "json", password?: string) {
  const result = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": body instanceof Blob ? "application/vnd.dragoont.backup" : "application/json",
      ...authenticatedHeaders(),
      ...(password ? { "X-Backup-Password": password } : {}),
    },
    body,
  });
  if (!result.ok) {
    const error = (await result.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `Request failed (${result.status})`);
  }
  return response === "blob" ? result.blob() : result.json();
}

export const api = {
  hasTabSession: () => Boolean(sessionToken()),
  me: () => request<User>("/api/auth/me"),
  login: async (username: string, password: string) => {
    // Password travels proto-encoded; the backend decodes before verifying.
    const response = await request<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password: encodePassword(password) }),
    });
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, response.token);
    return response.user;
  },
  logout: async () => {
    try {
      await request<void>("/api/auth/logout", { method: "POST" });
    } finally {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  },
  updateProfile: (
    body: Pick<User, "display_name" | "email" | "default_currency">,
  ) =>
    request<User>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  resetPassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    request<void>("/api/profile/password", {
      method: "PUT",
      body: JSON.stringify({
        current_password: encodePassword(currentPassword),
        new_password: encodePassword(newPassword),
        confirm_password: encodePassword(confirmPassword),
      }),
    }),
  users: () => request<User[]>("/api/admin/users"),
  createUser: (body: CreateUserInput) =>
    request<User>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ ...body, password: encodePassword(body.password) }),
    }),
  updateUser: (id: string, body: UpdateUserInput) =>
    request<User>(`/api/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...body,
        ...(body.password ? { password: encodePassword(body.password) } : {}),
      }),
    }),
  removeUser: (id: string) =>
    request<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
  transactionOptions: () =>
    request<TransactionOption[]>("/api/transaction-options"),
  createTransactionOption: (
    option_type: TransactionOptionType,
    value: string,
    optional_text_enabled: boolean,
  ) =>
    request<TransactionOption>("/api/transaction-options", {
      method: "POST",
      body: JSON.stringify({ option_type, value, optional_text_enabled }),
    }),
  updateTransactionOption: (option: TransactionOption) =>
    request<TransactionOption>(`/api/transaction-options/${option.id}`, {
      method: "PUT",
      body: JSON.stringify(option),
    }),
  removeTransactionOption: (id: string) =>
    request<void>(`/api/transaction-options/${id}`, { method: "DELETE" }),
  accounts: () => request<BankAccount[]>("/api/accounts"),
  createAccount: (
    body: Pick<
      BankAccount,
      "name" | "currency" | "account_number" | "card_color"
    >,
  ) =>
    request<BankAccount>("/api/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAccount: (
    id: string,
    body: Pick<
      BankAccount,
      "name" | "currency" | "account_number" | "card_color"
    >,
  ) =>
    request<BankAccount>(`/api/accounts/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  removeAccount: (id: string) =>
    request<void>(`/api/accounts/${id}`, { method: "DELETE" }),
  resetAccountData: () =>
    request<void>("/api/profile/data", { method: "DELETE" }),
  bankDetailTemplates: () => request<BankDetailTemplate[]>("/api/bank-detail-templates", { cache: "no-store" }),
  createBankDetailTemplate: (name: string, fields: string[], field_types: BankDetailTemplate["field_types"], field_options: BankDetailTemplate["field_options"]) =>
    request<BankDetailTemplate>("/api/bank-detail-templates", { method: "POST", body: JSON.stringify({ name, fields, field_types, field_options }) }),
  updateBankDetailTemplate: (id: string, name: string, fields: string[], field_types: BankDetailTemplate["field_types"], field_options: BankDetailTemplate["field_options"]) =>
    request<BankDetailTemplate>(`/api/bank-detail-templates/${id}`, { method: "PUT", body: JSON.stringify({ name, fields, field_types, field_options }) }),
  removeBankDetailTemplate: (id: string) =>
    request<void>(`/api/bank-detail-templates/${id}`, { method: "DELETE" }),
  protectedBankDetailMeta: (id: string) => request<ProtectedBankDetailMeta>(`/api/accounts/${id}/protected-details`),
  saveProtectedBankDetail: (id: string, template_id: string, values: Record<string,string>, password: string, entryId?: string, currentPassword?: string) =>
    request<void>(`/api/accounts/${id}/protected-details`, { method: "PUT", body: JSON.stringify({ id: entryId, template_id, values, password: encodePassword(password), current_password: currentPassword ? encodePassword(currentPassword) : undefined }) }),
  revealProtectedBankDetail: (id: string, password: string, template_id?: string, entryId?: string) =>
    request<ProtectedBankDetail>(`/api/accounts/${id}/protected-details/reveal`, { method: "POST", body: JSON.stringify({ id: entryId, password: encodePassword(password), template_id }) }),
  removeProtectedBankDetail: (id: string, entryId?: string) => request<void>(`/api/accounts/${id}/protected-details${entryId ? `?entry_id=${encodeURIComponent(entryId)}` : ""}`, { method: "DELETE" }),
  exportBackup: () => request<BackupData>("/api/backup"),
  restoreBackup: (body: BackupData) =>
    request<void>("/api/backup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  exportDragoontBackup: (settings: BackupClientSettings, password: string) =>
    backupRequest("/api/backup/export", JSON.stringify({ ...settings, password }), "blob"),
  previewDragoontBackup: (file: File, password: string) =>
    backupRequest<BackupPreview>("/api/backup/preview", file, "json", password),
  importDragoontBackup: (file: File, password: string) =>
    backupRequest<BackupClientSettings>("/api/backup/import", file, "json", password),
  list: (all = false, accountId?: string) =>
    request<Transaction[]>(
      `/api/transactions${accountId ? `?account_id=${accountId}` : all ? "?scope=all" : ""}`,
    ),
  summary: (all = false) =>
    request<Summary>(`/api/summary${all ? "?scope=all" : ""}`),
  create: (body: TransactionInput) =>
    request<Transaction>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: TransactionInput) =>
    request<Transaction>(`/api/transactions/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<void>(`/api/transactions/${id}`, { method: "DELETE" }),
};

export function centsBigInt(cents: number | bigint | string): bigint {
  if (typeof cents === "bigint") return cents;
  if (typeof cents === "number" && !Number.isSafeInteger(cents)) {
    throw new RangeError("Money cents must be a safe integer");
  }
  return BigInt(cents);
}

export function sumCents(values: Iterable<number | bigint | string>): bigint {
  let total = BigInt(0);
  for (const value of values) total += centsBigInt(value);
  return total;
}

export function money(
  cents: number | bigint | string,
  currency: string,
  showPositiveSign = false,
) {
  const value = centsBigInt(cents);
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const rounded = fractionDigits === 0 ? absolute + BigInt(50) : absolute;
  const major = rounded / BigInt(100);
  const minor = rounded % BigInt(100);
  const fraction = fractionDigits > 0
    ? (minor * (BigInt(10) ** BigInt(Math.max(0, fractionDigits - 2))))
        .toString()
        .padStart(fractionDigits, "0")
        .slice(0, fractionDigits)
    : "";
  let integerSeen = false;
  return formatter
    .formatToParts(major)
    .map((part) => {
      if (part.type === "integer" && !integerSeen) {
        integerSeen = true;
        return `${negative ? "-" : showPositiveSign ? "+" : ""}${part.value}`;
      }
      return part.type === "fraction" ? fraction : part.value;
    })
    .join("");
}
