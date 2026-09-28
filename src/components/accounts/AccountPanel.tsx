"use client";
import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Camera,
  CreditCard,
  Check,
  Edit3,
  ListPlus,
  LockKeyhole,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  api,
  type CreateUserInput,
  type BankDetailTemplate,
  type BankDetailFieldType,
  type TransactionOption,
  type TransactionOptionType,
  type UpdateUserInput,
  type User,
} from "@/app/api/client";
import { Btn, Field, Input } from "@/components/ui";
import { Checkbox } from "@/components/ui/Checkbox";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { ProjectColorPicker } from "@/components/ui/ProjectColorPicker";
import { useI18n } from "@/lib/i18n";
export type SettingsTab =
  | "profile"
  | "appearance"
  | "password"
  | "delete-data"
  | "create-account"
  | "all-accounts"
  | "transaction-options"
  | "bank-fields";
const currencies = [
  "USD",
  "THB",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "KRW",
  "SGD",
  "AUD",
  "CAD",
].map((value) => ({ value, label: value }));
const colors = [
  "#3276ff",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#16a34a",
  "#0891b2",
];
function applyColor(color: string) {
  document.documentElement.style.setProperty("--brand", color);
  document.documentElement.style.setProperty(
    "--brand-hover",
    `color-mix(in oklab, ${color} 82%, white)`,
  );
  document.documentElement.style.setProperty(
    "--brand-soft",
    `color-mix(in oklab, ${color} 16%, transparent)`,
  );
  localStorage.setItem("pl-accent", color);
}
function loadProfileMedia(
  file: File,
  onLoad: (value: string) => void,
  onError: (message: string) => void,
) {
  if (!file.type.startsWith("image/"))
    return onError("Choose an image or GIF file");
  if (file.size > 1_500_000)
    return onError("Profile images and GIFs must be 1.5 MB or smaller");
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result));
  reader.onerror = () => onError("Could not read the selected image");
  reader.readAsDataURL(file);
}
export function AccountPanel({
  tab,
  user,
  onUserChange,
  onTabChange,
}: {
  tab: SettingsTab;
  user: User;
  onUserChange: (user: User) => void;
  onTabChange?: (tab: SettingsTab) => void;
}) {
  void onTabChange;
  const [profile, setProfile] = useState({
    display_name: user.display_name,
    email: user.email,
    default_currency: user.default_currency,
  });
  const [users, setUsers] = useState<User[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [editDraft, setEditDraft] = useState<UpdateUserInput>({
    username: "",
    password: "",
    display_name: "",
    email: "",
    default_currency: "",
    is_admin: false,
  });
  const [options, setOptions] = useState<TransactionOption[]>([]);
  const [bankTemplates, setBankTemplates] = useState<BankDetailTemplate[]>([]);
  const [bankTemplateName, setBankTemplateName] = useState("");
  const [bankTemplateFields, setBankTemplateFields] = useState<{name:string;type:BankDetailFieldType|"";options:string;segments:{kind:"number"|"text"|"separator"|"";value:string}[]}[]>([{name:"",type:"",options:"",segments:[]}]);
  const [editingBankTemplate, setEditingBankTemplate] = useState<BankDetailTemplate | null>(null);
  const [optionType, setOptionType] = useState<TransactionOptionType | "">("");
  const [optionValue, setOptionValue] = useState("");
  const [optionTextEnabled, setOptionTextEnabled] = useState(false);
  const [editingOption, setEditingOption] = useState<TransactionOption | null>(
    null,
  );
  const [editingOptionName, setEditingOptionName] = useState("");
  const [editingOptionTextEnabled, setEditingOptionTextEnabled] =
    useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deleteDataConfirm, setDeleteDataConfirm] = useState(false);
  const [skipDeleteBackup, setSkipDeleteBackup] = useState(false);
  const [deleteBackupPassword, setDeleteBackupPassword] = useState("");
  const [deleteBackupPasswordConfirm, setDeleteBackupPasswordConfirm] = useState("");
  const [deletingData, setDeletingData] = useState(false);
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem(`dc-avatar-${user.id}`) || "",
  );
  const [cover, setCover] = useState(
    () => localStorage.getItem(`dc-cover-${user.id}`) || "",
  );
  const [color, setColor] = useState(
    () => localStorage.getItem("pl-accent") || "#3276ff",
  );
  const { tr, catalog: t } = useI18n();
  const [draft, setDraft] = useState<CreateUserInput>({
    username: "",
    password: "",
    display_name: "",
    email: "",
    default_currency: "",
    is_admin: false,
  });
  useEffect(() => {
    if (tab === "all-accounts" && user.is_admin) {
      const timer = setTimeout(
        () =>
          void api
            .users()
            .then(setUsers)
            .catch((c) =>
              setError(
                c instanceof Error ? c.message : "Could not load accounts",
              ),
            ),
        0,
      );
      return () => clearTimeout(timer);
    }
  }, [tab, user.is_admin]);
  useEffect(() => {
    if (tab !== "bank-fields" || !user.is_admin) return;
    const timer = setTimeout(() => void api.bankDetailTemplates().then(setBankTemplates).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load bank detail fields")), 0);
    return () => clearTimeout(timer);
  }, [tab, user.is_admin]);

  async function addBankTemplate(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const fields=bankTemplateFields.map((field)=>field.name);
      if (bankTemplateFields.some((field)=>!field.type)) throw new Error(tr("Select a type for every field"));
      const fieldTypes=Object.fromEntries(bankTemplateFields.map((field)=>[field.name,field.type])) as Record<string,BankDetailFieldType>;
      if (bankTemplateFields.some((field)=>field.type==="segmented"&&(field.segments.length===0||field.segments.some((segment)=>!segment.kind||!segment.value.trim())))) throw new Error(tr("Complete every segment"));
      const fieldOptions=Object.fromEntries(bankTemplateFields.filter((field)=>field.type==="dropdown"||field.type==="segmented").map((field)=>[field.name,field.type==="segmented"?field.segments.map((segment)=>segment.kind==="separator"?segment.value:`${segment.kind}:${segment.value}`):field.options.split(",").map((option)=>option.trim()).filter(Boolean)]));
      if (editingBankTemplate) {
        const updated=await api.updateBankDetailTemplate(editingBankTemplate.id,bankTemplateName,fields,fieldTypes,fieldOptions);
        setBankTemplates((items)=>items.map((item)=>item.id===updated.id?updated:item));
        setEditingBankTemplate(null); setToast(tr("Bank detail type updated successfully"));
      } else {
        const created=await api.createBankDetailTemplate(bankTemplateName,fields,fieldTypes,fieldOptions);
        setBankTemplates((items)=>[...items,created]); setToast(tr("Bank detail type added successfully"));
      }
      setBankTemplateName(""); setBankTemplateFields([{name:"",type:"",options:"",segments:[]}]);
    } catch(cause) { setError(cause instanceof Error ? cause.message : tr("Could not add bank detail type")); }
  }
  function beginEditBankTemplate(item: BankDetailTemplate) {
    setEditingBankTemplate(item);
    setBankTemplateName(item.name);
    setBankTemplateFields(item.fields.length ? item.fields.map((name)=>({name,type:item.field_types?.[name] ?? "text",options:(item.field_options?.[name] ?? []).join(", "),segments:(item.field_options?.[name] ?? []).map((token)=>{const match=/^(number|text):(.+)$/.exec(token);return match?{kind:match[1] as "number"|"text",value:match[2]}:{kind:"separator" as const,value:token};})})) : [{name:"",type:"",options:"",segments:[]}]);
  }
  function cancelEditBankTemplate() {
    setEditingBankTemplate(null);
    setBankTemplateName("");
    setBankTemplateFields([{name:"",type:"",options:"",segments:[]}]);
  }
  async function removeBankTemplate(id: string) {
    try { await api.removeBankDetailTemplate(id); setBankTemplates((items)=>items.filter((item)=>item.id!==id)); setToast(tr("Bank detail type deleted successfully")); }
    catch(cause) { setError(cause instanceof Error ? cause.message : tr("Could not delete bank detail type")); }
  }
  useEffect(() => {
    if (tab === "transaction-options" && user.is_admin) {
      const timer = setTimeout(
        () =>
          void api
            .transactionOptions()
            .then(setOptions)
            .catch((cause) =>
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not load transaction options",
              ),
            ),
        0,
      );
      return () => clearTimeout(timer);
    }
  }, [tab, user.is_admin]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 3000);
    return () => clearTimeout(timer);
  }, [error]);
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const updated = await api.updateProfile(profile);
      try {
        if (avatar) localStorage.setItem(`dc-avatar-${user.id}`, avatar);
        else localStorage.removeItem(`dc-avatar-${user.id}`);
        if (cover) localStorage.setItem(`dc-cover-${user.id}`, cover);
        else localStorage.removeItem(`dc-cover-${user.id}`);
      } catch {
        setError("The selected images are too large for browser storage");
        return;
      }
      onUserChange(updated);
      setToast(t.settings.saved);
    } catch (c) {
      setError(c instanceof Error ? c.message : "Could not save profile");
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const created = await api.createUser(draft);
      setUsers((old) => [...old, created]);
      setDraft({
        username: "",
        password: "",
        display_name: "",
        email: "",
        default_currency: "",
        is_admin: false,
      });
      setToast(t.settings.created);
    } catch (c) {
      setError(c instanceof Error ? c.message : "Could not create account");
    } finally {
      setCreating(false);
    }
  }
  async function removeAccount() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    try {
      await api.removeUser(pendingDelete.id);
      setUsers((old) => old.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
      setToast(tr("Account deleted successfully"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not delete account"));
    } finally {
      setDeleting(false);
    }
  }
  function beginEditUser(account: User) {
    setEditingUser(account);
    setEditDraft({
      username: account.username,
      password: "",
      display_name: account.display_name,
      email: account.email ?? "",
      default_currency: account.default_currency,
      is_admin: account.is_admin,
    });
  }
  async function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    setError("");
    try {
      const updated = await api.updateUser(editingUser.id, editDraft);
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (updated.id === user.id) onUserChange(updated);
      setEditingUser(null);
      setToast(tr("Account updated successfully"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : tr("Could not update account"),
      );
    } finally {
      setSavingUser(false);
    }
  }
  async function addTransactionOption(event: FormEvent) {
    event.preventDefault();
    if (!optionType || !optionValue.trim()) {
      setError(tr("Choose a dropdown field and enter an option name"));
      return;
    }
    setError("");
    try {
      const created = await api.createTransactionOption(
        optionType,
        optionValue.trim(),
        optionTextEnabled,
      );
      setOptions((current) => [...current, created]);
      setOptionType("");
      setOptionValue("");
      setOptionTextEnabled(false);
      setToast(tr("Option added successfully"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not add option"));
    }
  }
  function beginEditOption(option: TransactionOption) {
    setEditingOption(option);
    setEditingOptionName(option.value);
    setEditingOptionTextEnabled(option.optional_text_enabled);
  }
  async function saveTransactionOption(event: FormEvent) {
    event.preventDefault();
    if (!editingOption || !editingOptionName.trim()) return;
    setError("");
    try {
      const updated = await api.updateTransactionOption({
        ...editingOption,
        value: editingOptionName.trim(),
        optional_text_enabled: editingOptionTextEnabled,
      });
      setOptions((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingOption(null);
      setToast(tr("Option updated successfully"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : tr("Could not update option"),
      );
    }
  }
  async function removeTransactionOption(option: TransactionOption) {
    setError("");
    try {
      await api.removeTransactionOption(option.id);
      setOptions((current) => current.filter((item) => item.id !== option.id));
      setToast(tr("Option deleted successfully"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : tr("Could not delete option"),
      );
    }
  }
  async function resetAccountData() {
    setError("");
    if (!skipDeleteBackup && !deleteBackupPassword) {
      setError(tr("Enter a backup password before deleting your data"));
      return;
    }
    if (!skipDeleteBackup && deleteBackupPassword !== deleteBackupPasswordConfirm) {
      setError(tr("Backup passwords do not match"));
      return;
    }
    setDeletingData(true);
    try {
      if (!skipDeleteBackup) {
        const accountImages: Record<string, string> = {};
        const accountIconColors: Record<string, string> = {};
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("pl-bank-image-")) accountImages[key.slice("pl-bank-image-".length)] = localStorage.getItem(key) ?? "";
          if (key.startsWith("pl-bank-icon-color-")) accountIconColors[key.slice("pl-bank-icon-color-".length)] = localStorage.getItem(key) ?? "";
        }
        const blob = await api.exportDragoontBackup({
          theme: localStorage.getItem("pl-theme"),
          accent: localStorage.getItem("pl-accent"),
          locale: localStorage.getItem("pl-locale"),
          account_images: accountImages,
          account_icon_colors: accountIconColors,
        }, deleteBackupPassword);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `note-ledger-${new Date().toISOString().slice(0, 10)}.dragoont`;
        link.click();
        URL.revokeObjectURL(url);
      }
      await api.resetAccountData();
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("pl-bank-image-") || key.startsWith("pl-bank-icon-color-")) localStorage.removeItem(key);
      }
      window.location.assign("/transactions");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not delete account data"));
      setDeletingData(false);
    }
  }
  const isAdministration =
    tab === "create-account" ||
    tab === "all-accounts" ||
    tab === "transaction-options" ||
    tab === "bank-fields";
  const tabs: [SettingsTab, string, React.ReactNode, string][] =
    isAdministration
      ? [
          [
            "create-account",
            tr("Create account"),
            <Plus key="c" />,
            "/settings/accounts",
          ],
          [
            "all-accounts",
            tr("All accounts"),
            <UsersRound key="u" />,
            "/settings/all-accounts",
          ],
          [
            "transaction-options",
            tr("Transaction fields"),
            <ListPlus key="o" />,
            "/settings/transaction-options",
          ],
          ["bank-fields", tr("Bank detail fields"), <CreditCard key="b" />, "/settings/bank-fields"],
        ]
      : [
          [
            "profile",
            t.settings.profile,
            <UserRound key="p" />,
            "/settings/profile",
          ],
          [
            "appearance",
            t.settings.appearance,
            <Palette key="a" />,
            "/settings/appearance",
          ],
          [
            "password",
            tr("Reset password"),
            <LockKeyhole key="w" />,
            "/settings/password",
          ],
          [
            "delete-data",
            tr("Delete data"),
            <Trash2 key="d" />,
            "/settings/delete-data",
          ],
        ];
  return (
    <section className="settings-panel settings-page">
      <div className="settings-head">
        <div>
          <p className="section-kicker">
            {tr(isAdministration ? "ADMINISTRATION" : "SETTINGS")}
          </p>
          <h2>
            {tr(
              isAdministration
                ? "Manage accounts and access"
                : "Personalize your workspace",
            )}
          </h2>
        </div>
      </div>
      <nav className="settings-tabs">
        {tabs.map(([value, label, icon, href]) => (
          <Link
            key={value}
            href={href}
            className={tab === value ? "active" : ""}
          >
            {icon}
            {label}
          </Link>
        ))}
      </nav>
      <div className="settings-content">
        {tab === "password" ? (
          <form className="profile-editor-form" onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            if (passwordForm.next !== passwordForm.confirm) {
              setError(tr("New passwords do not match"));
              return;
            }
            setResettingPassword(true);
            try {
              await api.resetPassword(passwordForm.current, passwordForm.next, passwordForm.confirm);
              setPasswordForm({ current: "", next: "", confirm: "" });
              setToast(tr("Password changed successfully. Sign in again."));
              window.setTimeout(() => void api.logout().finally(() => window.location.assign("/")), 900);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : tr("Could not change password"));
            } finally {
              setResettingPassword(false);
            }
          }}>
            <p className="profile-label">{tr("RESET PASSWORD")}</p>
            <Field label={tr("Current password")} required>
              <Input type="password" autoComplete="current-password" value={passwordForm.current} onChange={(event) => setPasswordForm({ ...passwordForm, current: event.target.value })} />
            </Field>
            <Field label={tr("New password")} required>
              <Input type="password" autoComplete="new-password" value={passwordForm.next} onChange={(event) => setPasswordForm({ ...passwordForm, next: event.target.value })} />
            </Field>
            <Field label={tr("Confirm new password")} required>
              <Input type="password" autoComplete="new-password" value={passwordForm.confirm} onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })} />
            </Field>
            <Btn loading={resettingPassword} icon={<LockKeyhole />}>{tr("Reset password")}</Btn>
          </form>
        ) : null}
        {tab === "delete-data" ? (
          <div className="profile-editor-form delete-data-panel">
            <p className="profile-label">{tr("DELETE ACCOUNT DATA")}</p>
            <h3>{tr("Reset this account to a new empty account")}</h3>
            <p>{tr("This permanently removes every transaction, bank account, and protected bank detail owned by this login. Your username, password, and profile remain available.")}</p>
            <Btn
              variant="danger"
              icon={<Trash2 />}
              onClick={() => {
                setSkipDeleteBackup(false);
                setDeleteBackupPassword("");
                setDeleteBackupPasswordConfirm("");
                setDeleteDataConfirm(true);
              }}
            >
              {tr("Delete account data")}
            </Btn>
          </div>
        ) : null}
        {tab === "profile" ? (
          <div className="profile-editor">
            <form className="profile-editor-form" onSubmit={saveProfile}>
              <p className="profile-label">{tr("MAIN PROFILE")}</p>
              <div className="profile-photo-row">
                <div>
                  <p className="profile-label">{tr("PROFILE PHOTO")}</p>
                  <label className="profile-photo-tile profile-media-input">
                    {avatar ? (
                      <Image
                        src={avatar}
                        width={64}
                        height={64}
                        unoptimized
                        alt="Profile"
                      />
                    ) : (
                      <span className="profile-media-placeholder">
                        <Camera />
                      </span>
                    )}
                    <strong>{tr("Profile photo")}</strong>
                    <small>{tr("Click to upload image or GIF")}</small>
                    <input
                      type="file"
                      accept="image/*,.gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) loadProfileMedia(file, setAvatar, setError);
                      }}
                    />
                  </label>
                </div>
                <label className="cover-tile profile-media-input">
                  <p className="profile-label">{tr("COVER")}</p>
                  <div
                    className="profile-cover"
                    style={
                      cover ? { backgroundImage: `url(${cover})` } : undefined
                    }
                  >
                    {!cover ? <Camera /> : null}
                  </div>
                  <strong>{tr("Profile cover")}</strong>
                  <small>{tr("Click to upload image or GIF")}</small>
                  <input
                    type="file"
                    accept="image/*,.gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) loadProfileMedia(file, setCover, setError);
                    }}
                  />
                </label>
              </div>
              <div className="account-form">
                <Field label={tr("Username")}>
                  <Input value={user.username} disabled />
                </Field>
                <Field label={tr("Display name")} required>
                  <Input
                    value={profile.display_name}
                    onChange={(e) =>
                      setProfile({ ...profile, display_name: e.target.value })
                    }
                  />
                </Field>
                <Field label={tr("Email")}>
                  <Input
                    type="email"
                    value={profile.email ?? ""}
                    onChange={(e) =>
                      setProfile({ ...profile, email: e.target.value })
                    }
                  />
                </Field>
                <Field label={tr("Default currency")}>
                  <ThemedSelect
                    value={profile.default_currency}
                    options={currencies}
                    onChange={(v) =>
                      v && setProfile({ ...profile, default_currency: v })
                    }
                  />
                </Field>
              </div>
              <div className="modal-actions">
                <Btn>{tr("Save profile")}</Btn>
              </div>
            </form>
            <aside className="profile-preview">
              <p className="profile-label">{tr("PREVIEW")}</p>
              <div className="preview-card">
                <div
                  className="profile-cover"
                  style={
                    cover ? { backgroundImage: `url(${cover})` } : undefined
                  }
                />
                {avatar ? (
                  <Image
                    src={avatar}
                    width={72}
                    height={72}
                    unoptimized
                    alt=""
                  />
                ) : (
                  <span className="preview-avatar">
                    {profile.display_name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <strong>{profile.display_name || user.username}</strong>
                <span>@{user.username}</span>
                <small>{profile.email || profile.default_currency}</small>
              </div>
            </aside>
          </div>
        ) : null}
        {tab === "appearance" ? (
          <div className="appearance-settings">
            <section>
              <div className="appearance-title">
                <div>
                  <h3>{tr("Accent color")}</h3>
                  <p>{tr("Saved automatically on this device.")}</p>
                </div>
                <Btn
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setColor("#3276ff");
                    applyColor("#3276ff");
                    setToast(t.settings.saved);
                  }}
                  icon={<RotateCcw />}
                >
                  Reset
                </Btn>
              </div>
              <div className="color-options">
                {colors.map((v) => (
                  <button
                    type="button"
                    key={v}
                    title={v}
                    aria-label={`Use ${v}`}
                    className={color === v ? "active" : ""}
                    style={{ background: v }}
                    onClick={() => {
                      setColor(v);
                      applyColor(v);
                      setToast(t.settings.saved);
                    }}
                  >
                    {color === v ? <Check /> : null}
                  </button>
                ))}
                <ProjectColorPicker
                  value={color}
                  label={tr("Choose custom accent color")}
                  onChange={(next) => {
                    setColor(next);
                    applyColor(next);
                    setToast(t.settings.saved);
                  }}
                />
                <div className="accent-color-preview" title={color}>
                  <span style={{ background: color }} />
                  <code>{color.toUpperCase()}</code>
                </div>
              </div>
            </section>
          </div>
        ) : null}
        {tab === "create-account" && user.is_admin ? (
          <form className="admin-create" onSubmit={create}>
              <Field label={tr("Username")} required>
                <Input
                  value={draft.username}
                  onChange={(e) =>
                    setDraft({ ...draft, username: e.target.value })
                  }
                />
              </Field>
              <Field
                label={tr("Temporary password")}
                hint="At least 10 characters"
                required
              >
                <Input
                  type="password"
                  value={draft.password}
                  onChange={(e) =>
                    setDraft({ ...draft, password: e.target.value })
                  }
                />
              </Field>
              <Field label={tr("Display name")} required>
                <Input
                  value={draft.display_name}
                  onChange={(e) =>
                    setDraft({ ...draft, display_name: e.target.value })
                  }
                />
              </Field>
              <Field label={tr("Email")}>
                <Input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, email: e.target.value })
                  }
                />
              </Field>
              <Field label={tr("Currency")} required>
                <ThemedSelect
                  value={draft.default_currency}
                  options={currencies}
                  placeholder={tr("Select currency")}
                  onChange={(v) =>
                    v && setDraft({ ...draft, default_currency: v })
                  }
                />
              </Field>
              <Checkbox
                checked={draft.is_admin}
                onChange={(e) =>
                  setDraft({ ...draft, is_admin: e.target.checked })
                }
                label={tr("Administrator")}
                description={tr(
                  "Can view all transactions and manage accounts.",
                )}
              />
              <Btn loading={creating} icon={<Plus />}>
                {tr("Create account")}
              </Btn>
          </form>
        ) : null}
        {tab === "all-accounts" && user.is_admin ? (
          <div className="account-list">
            {users.map((a) => (
              <article key={a.id}>
                  <span className="account-avatar">
                    {a.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{a.display_name}</strong>
                    <p>
                      @{a.username} · {a.default_currency}
                    </p>
                  </div>
                  <span className="account-user-actions">
                    {a.is_admin ? (
                      <span className="admin-badge">{tr("Admin")}</span>
                    ) : null}
                    <button
                      type="button"
                      className="account-edit-user"
                      onClick={() => beginEditUser(a)}
                      aria-label={`${tr("Edit account")} ${a.display_name}`}
                      title={tr("Edit account")}
                    >
                      <Edit3 />
                    </button>
                    {a.id !== user.id ? (
                      <button
                        type="button"
                        className="account-delete-user"
                        onClick={() => setPendingDelete(a)}
                        aria-label={`${tr("Delete account")} ${a.display_name}`}
                        title={tr("Delete account")}
                      >
                        <Trash2 />
                      </button>
                    ) : null}
                  </span>
              </article>
            ))}
          </div>
        ) : null}
        {tab === "transaction-options" && user.is_admin ? (
          <div className="transaction-options-admin">
            <form className="admin-option-create" onSubmit={addTransactionOption}>
              <Field label={tr("Dropdown field")} required>
                <ThemedSelect
                  value={optionType}
                  placeholder={tr("Select field")}
                  options={[
                    { value: "income_category", label: tr("Income category") },
                    { value: "expense_category", label: tr("Expense category") },
                    { value: "payment_channel", label: tr("Channel") },
                  ]}
                  onChange={(value) =>
                    value && setOptionType(value as TransactionOptionType)
                  }
                />
              </Field>
              <Field label={tr("Option name")} required>
                <Input
                  maxLength={60}
                  value={optionValue}
                  onChange={(event) => setOptionValue(event.target.value)}
                  placeholder={tr("Enter a dropdown option")}
                />
              </Field>
              <Checkbox
                checked={optionTextEnabled}
                onChange={(event) => setOptionTextEnabled(event.target.checked)}
                label={tr("Enable optional text field")}
              />
              <Btn icon={<Plus />}>{tr("Add option")}</Btn>
            </form>
            <div className="transaction-option-groups">
              {([
                ["income_category", tr("Income categories")],
                ["expense_category", tr("Expense categories")],
                ["payment_channel", tr("Channels")],
              ] as [TransactionOptionType, string][]).map(([type, label]) => (
                <section key={type}>
                  <h3>{label}</h3>
                  <div className="transaction-option-list">
                    {options.filter((item) => item.option_type === type).map((item) => (
                      <div key={item.id}>
                        <span>{item.value}</span>
                        <span className="transaction-option-actions">
                          <button
                            type="button"
                            onClick={() => beginEditOption(item)}
                            aria-label={`${tr("Edit")} ${item.value}`}
                            title={tr("Edit")}
                          >
                            <Edit3 />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeTransactionOption(item)}
                            aria-label={`${tr("Delete")} ${item.value}`}
                            title={tr("Delete")}
                          >
                            <Trash2 />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
        {tab === "bank-fields" && user.is_admin ? (
          <div className="transaction-options-admin bank-fields-admin">
            <form className="admin-option-create" onSubmit={addBankTemplate}>
              <Field label={tr("Detail type name")} required>
                <Input value={bankTemplateName} onChange={(event)=>setBankTemplateName(event.target.value)} placeholder="Mastercard, Visa, Membership…" />
              </Field>
              <Field label={tr("Protected fields")} required>
                <div className="bank-template-fields">
                  {bankTemplateFields.map((field, index) => (
                    <div className="bank-template-field-editor" key={index}>
                      <div className="bank-template-field-row">
                        <Input required value={field.name} onChange={(event) => setBankTemplateFields((items) => items.map((item, itemIndex) => itemIndex === index ? {...item,name:event.target.value} : item))} placeholder={tr("Field name")} />
                        <ThemedSelect value={field.type} placeholder={tr("Select field type")} options={[{value:"text",label:tr("Text")},{value:"number",label:tr("Number")},{value:"segmented",label:tr("Segmented input")},{value:"date",label:tr("Date picker")},{value:"month",label:tr("Month picker")},{value:"dropdown",label:tr("Dropdown")},{value:"textarea",label:tr("Text area")},{value:"checkbox",label:tr("Checkbox")},{value:"switch",label:tr("Switch")}]} onChange={(value)=>setBankTemplateFields((items)=>items.map((item,itemIndex)=>itemIndex===index?{...item,type:value as BankDetailFieldType|"",options:"",segments:value==="segmented"?[{kind:"",value:""}]:[]}:item))} />
                        <button type="button" className="bank-template-field-remove" aria-label={tr("Remove field")} title={tr("Remove field")} onClick={() => setBankTemplateFields((items) => items.length === 1 ? [{name:"",type:"",options:"",segments:[]}] : items.filter((_, itemIndex) => itemIndex !== index))}><X /></button>
                      </div>
                      {field.type === "dropdown" ? <Input required value={field.options} onChange={(event)=>setBankTemplateFields((items)=>items.map((item,itemIndex)=>itemIndex===index?{...item,options:event.target.value}:item))} placeholder={tr("Dropdown options separated by commas")} /> : null}
                      {field.type === "segmented" ? <div className="segment-builder">
                        {field.segments.map((segment,segmentIndex)=><div className="segment-builder-row" key={segmentIndex}>
                          <ThemedSelect value={segment.kind} placeholder={tr("Segment type")} options={[{value:"number",label:tr("Number only")},{value:"text",label:tr("Text")},{value:"separator",label:tr("Special text / separator")}]} onChange={(value)=>setBankTemplateFields((items)=>items.map((item,itemIndex)=>itemIndex===index?{...item,segments:item.segments.map((part,partIndex)=>partIndex===segmentIndex?{kind:value as typeof part.kind,value:""}:part)}:item))} />
                          <Input required type="text" inputMode={segment.kind==="number"||segment.kind==="text"?"numeric":undefined} pattern={segment.kind==="number"||segment.kind==="text"?"[1-9][0-9]*":undefined} value={segment.value} onChange={(event)=>{const value=segment.kind==="number"||segment.kind==="text"?event.target.value.replace(/\D/g,""):event.target.value;setBankTemplateFields((items)=>items.map((item,itemIndex)=>itemIndex===index?{...item,segments:item.segments.map((part,partIndex)=>partIndex===segmentIndex?{...part,value}:part)}:item));}} placeholder={segment.kind==="separator"?tr("Character such as / . : -"):tr("Number of characters")} />
                          <button type="button" className="bank-template-field-remove" onClick={()=>setBankTemplateFields((items)=>items.map((item,itemIndex)=>itemIndex===index?{...item,segments:item.segments.length===1?[{kind:"",value:""}]:item.segments.filter((_,partIndex)=>partIndex!==segmentIndex)}:item))} aria-label={tr("Remove segment")}><X /></button>
                        </div>)}
                        <Btn type="button" variant="outline" icon={<Plus />} onClick={()=>setBankTemplateFields((items)=>items.map((item,itemIndex)=>itemIndex===index?{...item,segments:[...item.segments,{kind:"",value:""}]}:item))}>{tr("Add segment")}</Btn>
                      </div> : null}
                    </div>
                  ))}
                  <Btn type="button" variant="outline" icon={<Plus />} onClick={() => setBankTemplateFields((items) => [...items, {name:"",type:"",options:"",segments:[]}])}>{tr("Add field")}</Btn>
                </div>
              </Field>
              <div className="admin-option-form-actions">
                {editingBankTemplate ? <Btn type="button" variant="ghost" onClick={cancelEditBankTemplate}>{tr("Cancel")}</Btn> : null}
                <Btn icon={editingBankTemplate ? <Check /> : <Plus />}>{tr(editingBankTemplate ? "Save changes" : "Add type")}</Btn>
              </div>
            </form>
            <div className="transaction-option-groups">
              <section>
                <h3>{tr("Bank detail types")}</h3>
                <div className="transaction-option-list">
                  {bankTemplates.map((item)=><div key={item.id}><span><strong>{tr(item.name)}</strong><small>{item.fields.map((field)=>`${tr(field)} (${tr(({date:"Date picker",month:"Month picker",dropdown:"Dropdown",number:"Number",segmented:"Segmented input",textarea:"Text area",checkbox:"Checkbox",switch:"Switch"} as Record<string,string>)[item.field_types?.[field]] ?? "Text")})`).join(" · ")}</small></span><span className="transaction-option-actions"><button type="button" onClick={()=>beginEditBankTemplate(item)} aria-label={`${tr("Edit")} ${item.name}`} title={tr("Edit")}><Edit3 /></button><button type="button" onClick={()=>void removeBankTemplate(item.id)} aria-label={`${tr("Delete")} ${item.name}`} title={tr("Delete")}><Trash2 /></button></span></div>)}
                </div>
              </section>
            </div>
          </div>
        ) : null}
        {(tab === "create-account" ||
          tab === "all-accounts" ||
          tab === "transaction-options" || tab === "bank-fields") &&
        !user.is_admin ? (
          <div className="empty-state">
            <h3>{tr("Administrator access required")}</h3>
          </div>
        ) : null}
      </div>
      {deleteDataConfirm ? (
        <div className="modal-backdrop">
          <section className="confirm-dialog delete-data-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-data-title">
            <div className="confirm-icon danger"><Trash2 /></div>
            <div className="confirm-copy">
              <h3 id="delete-data-title">{tr("Delete all account data?")}</h3>
              <p>{tr("This cannot be undone. By default, an encrypted backup will be downloaded before deletion.")}</p>
            </div>
            <Checkbox
              className="delete-data-checkbox"
              checked={skipDeleteBackup}
              onChange={(event) => setSkipDeleteBackup(event.target.checked)}
              label={tr("Delete now without exporting a backup")}
              description={tr("Leave this unchecked to export your data before it is deleted.")}
            />
            {!skipDeleteBackup ? (
              <div className="delete-backup-passwords">
                <Field label={tr("Backup password")} required>
                  <Input type="password" value={deleteBackupPassword} onChange={(event) => setDeleteBackupPassword(event.target.value)} />
                </Field>
                <Field label={tr("Confirm backup password")} required>
                  <Input type="password" value={deleteBackupPasswordConfirm} onChange={(event) => setDeleteBackupPasswordConfirm(event.target.value)} />
                </Field>
              </div>
            ) : null}
            <div className="confirm-actions">
              <Btn variant="ghost" disabled={deletingData} onClick={() => setDeleteDataConfirm(false)}>{tr("Cancel")}</Btn>
              <Btn variant="danger" loading={deletingData} onClick={() => void resetAccountData()}>{tr(skipDeleteBackup ? "Delete now" : "Export and delete")}</Btn>
            </div>
          </section>
        </div>
      ) : null}
      {pendingDelete ? (
        <div className="modal-backdrop">
          <section className="confirm-dialog" role="alertdialog" aria-modal="true">
            <div className="confirm-icon danger"><Trash2 /></div>
            <div className="confirm-copy">
              <h3>{tr("Delete account?")}</h3>
              <p>{tr("This permanently deletes the account and all of its bank accounts and transactions.")} <strong>{pendingDelete.display_name}</strong> (@{pendingDelete.username})</p>
            </div>
            <div className="confirm-actions">
              <Btn variant="ghost" onClick={() => setPendingDelete(null)}>{tr("Cancel")}</Btn>
              <Btn variant="danger" loading={deleting} onClick={() => void removeAccount()}>{tr("Delete account")}</Btn>
            </div>
          </section>
        </div>
      ) : null}
      {editingUser ? (
        <div className="modal-backdrop">
          <form className="modal account-edit-modal" onSubmit={saveUser}>
            <div className="modal-head">
              <div>
                <p className="section-kicker">{tr("ADMINISTRATION")}</p>
                <h2>{tr("Edit account")}</h2>
              </div>
              <Btn
                type="button"
                variant="outline"
                className="icon-only"
                onClick={() => setEditingUser(null)}
                icon={<X />}
              />
            </div>
            <div className="account-form">
              <Field label={tr("Username")} required>
                <Input
                  value={editDraft.username}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, username: event.target.value })
                  }
                />
              </Field>
              <Field
                label={tr("New password")}
                hint={tr("Leave blank to keep the current password")}
              >
                <Input
                  type="password"
                  value={editDraft.password ?? ""}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, password: event.target.value })
                  }
                />
              </Field>
              <Field label={tr("Display name")} required>
                <Input
                  value={editDraft.display_name}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, display_name: event.target.value })
                  }
                />
              </Field>
              <Field label={tr("Email")}>
                <Input
                  type="email"
                  value={editDraft.email ?? ""}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, email: event.target.value })
                  }
                />
              </Field>
              <Field label={tr("Currency")} required>
                <ThemedSelect
                  value={editDraft.default_currency}
                  options={currencies}
                  placeholder={tr("Select currency")}
                  onChange={(value) =>
                    value && setEditDraft({ ...editDraft, default_currency: value })
                  }
                />
              </Field>
              <Checkbox
                checked={editDraft.is_admin}
                disabled={editingUser.id === user.id}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, is_admin: event.target.checked })
                }
                label={tr("Administrator")}
                description={tr("Can view all transactions and manage accounts.")}
              />
            </div>
            <div className="modal-actions">
              <Btn type="button" variant="outline" onClick={() => setEditingUser(null)}>
                {tr("Cancel")}
              </Btn>
              <Btn loading={savingUser}>{tr("Save changes")}</Btn>
            </div>
          </form>
        </div>
      ) : null}
      {editingOption ? (
        <div className="modal-backdrop">
          <form className="modal option-edit-modal" onSubmit={saveTransactionOption}>
            <div className="modal-head">
              <div>
                <p className="section-kicker">{tr("TRANSACTION FIELD")}</p>
                <h2>{tr("Edit option")}</h2>
              </div>
              <Btn
                type="button"
                variant="outline"
                className="icon-only"
                onClick={() => setEditingOption(null)}
                icon={<X />}
              />
            </div>
            <Field label={tr("Option name")} required>
              <Input
                autoFocus
                maxLength={60}
                value={editingOptionName}
                onChange={(event) => setEditingOptionName(event.target.value)}
              />
            </Field>
            <Checkbox
              checked={editingOptionTextEnabled}
              onChange={(event) =>
                setEditingOptionTextEnabled(event.target.checked)
              }
              label={tr("Enable optional text field")}
            />
            <div className="modal-actions">
              <Btn type="button" variant="outline" onClick={() => setEditingOption(null)}>
                {tr("Cancel")}
              </Btn>
              <Btn>{tr("Save changes")}</Btn>
            </div>
          </form>
        </div>
      ) : null}
      {error ? (
        <div className="toast-error" role="alert" aria-live="assertive">
          <span>{error}</span>
          <button
            type="button"
            aria-label={tr("Close")}
            onClick={() => setError("")}
          >
            <X />
          </button>
        </div>
      ) : null}
      {toast ? (
        <div className="toast-success">
          <Check />
          {toast}
        </div>
      ) : null}
    </section>
  );
}
