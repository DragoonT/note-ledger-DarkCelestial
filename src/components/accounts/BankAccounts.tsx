"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Ban, Check, Download, Edit3, Eye, Landmark, Menu, Plus, Trash2, Upload, X } from "lucide-react";
import { api, money, sumCents, type BackupPreview, type BankAccount, type BankDetailTemplate, type Transaction } from "@/app/api/client";
import { Btn, Card, Checkbox, DatePicker, Field, Input, MonthPicker, SegmentedInput, Textarea } from "@/components/ui";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { Switch } from "@/components/ui/Switch";
import { ProjectColorPicker } from "@/components/ui/ProjectColorPicker";
import { MoneySummaryCards } from "@/components/ledger/MoneySummaryCards";
import { TransactionFilter } from "@/components/ledger/TransactionFilter";
import { useI18n } from "@/lib/i18n";

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
const cardColors = [
  "#3276ff",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
];

function readBankImage(
  file: File,
  onLoad: (value: string) => void,
  onError: () => void,
) {
  const reader = new FileReader();
  reader.onerror = onError;
  reader.onload = () => onLoad(String(reader.result ?? ""));
  reader.readAsDataURL(file);
}

function cropBankImage(
  value: string,
  zoom: number,
  onLoad: (value: string) => void,
  onError: () => void,
) {
    const image = new window.Image();
    image.onerror = onError;
    image.onload = () => {
      const size = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) return onError();
      context.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      onLoad(canvas.toDataURL("image/webp", 0.9));
    };
    image.src = value;
}

export function BankAccounts({
  rows,
  defaultCurrency,
  onCreated,
}: {
  rows: Transaction[];
  defaultCurrency: string;
  onCreated: () => void;
}) {
  const { tr } = useI18n();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountImages, setAccountImages] = useState<Record<string, string>>({});
  const [accountIconColors, setAccountIconColors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankAccount | null>(null);
  const [pendingBackup, setPendingBackup] = useState<{ file: File; preview: BackupPreview; password: string } | null>(null);
  const [backupPasswordDialog, setBackupPasswordDialog] = useState<{ mode: "export" } | { mode: "import"; file: File } | null>(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState("");
  const [backupPasswordError, setBackupPasswordError] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [accountNumber, setAccountNumber] = useState("");
  const [cardColor, setCardColor] = useState("");
  const [imageData, setImageData] = useState("");
  const [iconColor, setIconColor] = useState("");
  const [pendingCropImage, setPendingCropImage] = useState("");
  const [cropZoom, setCropZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showAccountNumbers, setShowAccountNumbers] = useState(false);
  const [detailTemplates, setDetailTemplates] = useState<BankDetailTemplate[]>([]);
  const [detailsEnabled, setDetailsEnabled] = useState(false);
  const [detailTemplateId, setDetailTemplateId] = useState("");
  const [detailValues, setDetailValues] = useState<Record<string,string>>({});
  const [detailPassword, setDetailPassword] = useState("");
  const [detailPasswordConfirm, setDetailPasswordConfirm] = useState("");
  const [detailsUnlocked, setDetailsUnlocked] = useState(false);
  const [unlockRequested, setUnlockRequested] = useState(false);
  const [hadProtectedDetails, setHadProtectedDetails] = useState(false);
  const [savedDetailTypes, setSavedDetailTypes] = useState<[string, string][]>([]);
  const [detailEntryId, setDetailEntryId] = useState<string>();
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [detailAction, setDetailAction] = useState<"delete" | "reset" | null>(null);
  const [currentDetailPassword, setCurrentDetailPassword] = useState("");
  const [newDetailPassword, setNewDetailPassword] = useState("");
  const [confirmDetailPassword, setConfirmDetailPassword] = useState("");
  const [creatingDetailType, setCreatingDetailType] = useState(false);
  const [summaryKinds, setSummaryKinds] = useState<("income" | "expense")[]>([]);
  const [summaryYears, setSummaryYears] = useState<string[]>([]);
  const [summaryMonths, setSummaryMonths] = useState<string[]>([]);
  const [currentPeriodOnly, setCurrentPeriodOnly] = useState(false);
  const currentYear = String(new Date().getFullYear());
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const enabled = localStorage.getItem("pl-current-period-all-accounts") === "true";
      setCurrentPeriodOnly(enabled);
      if (enabled) {
        setSummaryYears([currentYear]);
        setSummaryMonths([currentMonth]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentMonth, currentYear]);

  function toggleCurrentPeriod(enabled: boolean) {
    setCurrentPeriodOnly(enabled);
    localStorage.setItem("pl-current-period-all-accounts", String(enabled));
    setSummaryYears(enabled ? [currentYear] : []);
    setSummaryMonths(enabled ? [currentMonth] : []);
  }

  function disableCurrentPeriodDefault() {
    setCurrentPeriodOnly(false);
    localStorage.setItem("pl-current-period-all-accounts", "false");
  }

  const summaryRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (summaryKinds.length === 0 || summaryKinds.includes(row.kind)) &&
          (summaryYears.length === 0 || summaryYears.includes(row.transaction_date.slice(0, 4))) &&
          (summaryMonths.length === 0 || summaryMonths.includes(row.transaction_date.slice(5, 7))),
      ),
    [rows, summaryKinds, summaryYears, summaryMonths],
  );
  const availableSummaryYears = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.transaction_date.slice(0, 4)))).sort(
        (a, b) => b.localeCompare(a),
      ),
    [rows],
  );
  const selectedDetailTemplate = detailTemplates.find((item)=>item.id===detailTemplateId);

  useEffect(() => {
    void api.bankDetailTemplates().then(setDetailTemplates).catch(()=>null);
    void api
      .accounts()
      .then((items) => {
        setAccounts(items);
        setAccountImages(
          Object.fromEntries(
            items.map((item) => [
              item.id,
              localStorage.getItem(`pl-bank-image-${item.id}`) ?? "",
            ]),
          ),
        );
        setAccountIconColors(
          Object.fromEntries(
            items.map((item) => [
              item.id,
              localStorage.getItem(`pl-bank-icon-color-${item.id}`) ?? "",
            ]),
          ),
        );
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load accounts",
        ),
      );
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);

  function closeForm() {
    if (creatingDetailType) return;
    setSavedDetailTypes([]); setDetailEntryId(undefined);
    setCreating(false);
    setEditing(null);
    setName("");
    setCurrency(defaultCurrency);
    setAccountNumber("");
    setCardColor("");
    setImageData("");
    setIconColor("");
    setDetailsEnabled(false); setDetailTemplateId(""); setDetailValues({}); setDetailPassword(""); setDetailPasswordConfirm(""); setDetailsUnlocked(false); setUnlockRequested(false); setHadProtectedDetails(false); setDetailsDirty(false);
  }
  function startCreate() {
    void api.bankDetailTemplates().then(setDetailTemplates).catch(()=>null);
    setName("");
    setCurrency(defaultCurrency);
    setAccountNumber("");
    setCardColor("");
    setImageData("");
    setIconColor("");
    setDetailsEnabled(false); setDetailTemplateId(""); setDetailValues({}); setDetailPassword(""); setDetailPasswordConfirm(""); setDetailsUnlocked(true); setUnlockRequested(false); setHadProtectedDetails(false); setDetailsDirty(false);
    setSavedDetailTypes([]); setDetailEntryId(undefined);
    setCreating(true);
  }
  function startEdit(account: BankAccount) {
    setDetailAction(null);
    setCurrentDetailPassword("");setNewDetailPassword("");setConfirmDetailPassword("");
    void api.bankDetailTemplates().then(setDetailTemplates).catch(()=>null);
    setName(account.name);
    setCurrency(account.currency);
    setAccountNumber(account.account_number ?? "");
    setCardColor(account.card_color ?? "");
    setImageData(accountImages[account.id] ?? "");
    setIconColor(accountIconColors[account.id] ?? "");
    setEditing(account);
    setDetailValues({}); setDetailPassword(""); setDetailPasswordConfirm(""); setDetailsUnlocked(false); setUnlockRequested(false); setDetailsDirty(false);
    setSavedDetailTypes([]);
    setDetailEntryId(undefined);
    void api.protectedBankDetailMeta(account.id).then((meta)=>{ setSavedDetailTypes(meta?.entries ?? []); setDetailEntryId(meta?.entries?.[0]?.[0]); setHadProtectedDetails(Boolean(meta)); setDetailsEnabled(Boolean(meta)); setDetailTemplateId(meta?.template_id ?? ""); }).catch((cause)=>setError(cause instanceof Error ? cause.message : tr("Could not load protected details")));
  }

  function addBankDetail() {
    setDetailAction(null);
    setDetailsEnabled(true);
    setDetailsDirty(false);
    setDetailEntryId(undefined);
    setDetailTemplateId("");
    setHadProtectedDetails(false);
    setDetailsUnlocked(true);
    setDetailValues({});
    setDetailPassword("");
    setDetailPasswordConfirm("");
    setUnlockRequested(false);
  }

  async function createDetailType(name: string) {
    const trimmed = name.trim();
    if (!trimmed || creatingDetailType) return;
    const existing = detailTemplates.find(item => item.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) { setDetailTemplateId(existing.id); return; }
    const base = selectedDetailTemplate ?? detailTemplates.find(item => item.name === "Mastercard");
    if (!base) { setError(tr("Select a detail type before adding a custom name")); return; }
    setCreatingDetailType(true);
    setError("");
    try {
      const created = await api.createBankDetailTemplate(trimmed, base.fields, base.field_types, base.field_options);
      setDetailTemplates(items => [...items, created]);
      setDetailTemplateId(created.id);
      setDetailsDirty(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not add bank detail type"));
    } finally { setCreatingDetailType(false); }
  }

  async function revealDetails() {
    if (!editing || !detailPassword) return;
    setSaving(true); setError("");
    try { const detail=await api.revealProtectedBankDetail(editing.id,detailPassword,detailTemplateId,detailEntryId); setDetailTemplateId(detail.template_id); setDetailValues(detail.values); setDetailsUnlocked(true); setUnlockRequested(false); }
    catch(cause) { setError(cause instanceof Error ? cause.message : tr("Could not reveal protected details")); }
    finally { setSaving(false); }
  }

  async function applyDetailAction() {
    if (!editing || !detailEntryId || !detailAction) return;
    setSaving(true); setError("");
    try {
      if (detailAction === "delete") {
        await api.removeProtectedBankDetail(editing.id,detailEntryId);
        const remaining=savedDetailTypes.filter(([id])=>id!==detailEntryId);
        setSavedDetailTypes(remaining);
        addBankDetail();
      } else {
        if (newDetailPassword.length < 8) throw new Error(tr("Bank detail password must be at least 8 characters"));
        if (newDetailPassword !== confirmDetailPassword) throw new Error(tr("Passwords do not match"));
        const detail=await api.revealProtectedBankDetail(editing.id,currentDetailPassword,undefined,detailEntryId);
        await api.saveProtectedBankDetail(editing.id,detail.template_id,detail.values,newDetailPassword,detailEntryId,currentDetailPassword);
        setDetailValues({});setDetailPassword("");setDetailsUnlocked(false);setDetailsDirty(false);
      }
      setDetailAction(null);setCurrentDetailPassword("");setNewDetailPassword("");setConfirmDetailPassword("");
    } catch(cause) { setError(cause instanceof Error ? cause.message : tr("Could not save bank details")); }
    finally { setSaving(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (creatingDetailType) return;
    setSaving(true);
    setError("");
    try {
      if (editing) {
        if (detailsEnabled && detailsDirty) {
          if (!detailTemplateId || !detailPassword) throw new Error(tr("Password is required to save protected details"));
          if (!hadProtectedDetails && detailPassword !== detailPasswordConfirm) throw new Error(tr("Passwords do not match"));
          await api.saveProtectedBankDetail(editing.id,detailTemplateId,detailValues,detailPassword,detailEntryId);
        }
        const updated = await api.updateAccount(editing.id, {
          name,
          currency: editing.currency,
          account_number: accountNumber || null,
          card_color: cardColor || null,
        });
        if (imageData) localStorage.setItem(`pl-bank-image-${editing.id}`, imageData);
        else localStorage.removeItem(`pl-bank-image-${editing.id}`);
        setAccountImages((old) => ({ ...old, [editing.id]: imageData }));
        if (iconColor) localStorage.setItem(`pl-bank-icon-color-${editing.id}`, iconColor);
        else localStorage.removeItem(`pl-bank-icon-color-${editing.id}`);
        setAccountIconColors((old) => ({ ...old, [editing.id]: iconColor }));
        setAccounts((old) =>
          old.map((account) => (account.id === updated.id ? updated : account)),
        );
        setToast(tr("Bank account renamed successfully"));
      } else {
        const account = await api.createAccount({
          name,
          currency,
          account_number: accountNumber || null,
          card_color: cardColor || null,
        });
        if (imageData) localStorage.setItem(`pl-bank-image-${account.id}`, imageData);
        setAccountImages((old) => ({ ...old, [account.id]: imageData }));
        if (iconColor) localStorage.setItem(`pl-bank-icon-color-${account.id}`, iconColor);
        setAccountIconColors((old) => ({ ...old, [account.id]: iconColor }));
        setAccounts((old) => [...old, account]);
        setToast(tr("Bank account added successfully"));
        if (detailsEnabled) {
          if (!detailTemplateId || !detailPassword) throw new Error(tr("Password is required to save protected details"));
          if (detailPassword !== detailPasswordConfirm) throw new Error(tr("Passwords do not match"));
          try { await api.saveProtectedBankDetail(account.id,detailTemplateId,detailValues,detailPassword); }
          catch (cause) { await api.removeAccount(account.id).catch(()=>null); throw cause; }
        }
        onCreated();
      }
      closeForm();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save account",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setSaving(true);
    setError("");
    try {
      await api.removeAccount(pendingDelete.id);
      localStorage.removeItem(`pl-bank-image-${pendingDelete.id}`);
      localStorage.removeItem(`pl-bank-icon-color-${pendingDelete.id}`);
      setAccountImages((old) => {
        const next = { ...old };
        delete next[pendingDelete.id];
        return next;
      });
      setAccounts((old) =>
        old.filter((account) => account.id !== pendingDelete.id),
      );
      setPendingDelete(null);
      setToast(tr("Bank account deleted successfully"));
    } catch (cause) {
      setPendingDelete(null);
      setError(
        cause instanceof Error ? cause.message : "Could not delete account",
      );
    } finally {
      setSaving(false);
    }
  }

  async function exportBackup(password: string) {
    setSaving(true);
    setError("");
    try {
      const blob = await api.exportDragoontBackup({
        theme: localStorage.getItem("pl-theme"),
        accent: localStorage.getItem("pl-accent"),
        locale: localStorage.getItem("pl-locale"),
        account_images: accountImages,
        account_icon_colors: accountIconColors,
      }, password);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `note-ledger-${new Date().toISOString().slice(0, 10)}.dragoont`;
      link.click();
      URL.revokeObjectURL(url);
      setToast(tr("Backup exported successfully"));
      setBackupPasswordDialog(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not export backup"));
    } finally {
      setSaving(false);
    }
  }

  async function restoreBackup() {
    if (!pendingBackup) return;
    setSaving(true);
    setError("");
    try {
      const settings = await api.importDragoontBackup(pendingBackup.file, pendingBackup.password);
      for (const [key, value] of [
        ["pl-theme", settings.theme],
        ["pl-accent", settings.accent],
        ["pl-locale", settings.locale],
      ] as const) {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      }
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("pl-bank-image-") || key.startsWith("pl-bank-icon-color-")) {
          localStorage.removeItem(key);
        }
      }
      Object.entries(settings.account_images ?? {}).forEach(([id, value]) =>
        value && localStorage.setItem(`pl-bank-image-${id}`, value),
      );
      Object.entries(settings.account_icon_colors ?? {}).forEach(([id, value]) =>
        value && localStorage.setItem(`pl-bank-icon-color-${id}`, value),
      );
      setPendingBackup(null);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not restore backup"));
      setPendingBackup(null);
      setSaving(false);
    }
  }

  async function submitBackupPassword() {
    if (!backupPassword) {
      setBackupPasswordError(tr("Password is required"));
      return;
    }
    if (backupPasswordDialog?.mode === "export") {
      if (backupPassword !== backupPasswordConfirm) {
        setBackupPasswordError(tr("Passwords do not match"));
        return;
      }
      setBackupPasswordError("");
      await exportBackup(backupPassword);
      return;
    }
    if (backupPasswordDialog?.mode === "import") {
      setSaving(true);
      setBackupPasswordError("");
      try {
        const preview = await api.previewDragoontBackup(backupPasswordDialog.file, backupPassword);
        setPendingBackup({ file: backupPasswordDialog.file, preview, password: backupPassword });
        setBackupPasswordDialog(null);
      } catch (cause) {
        setBackupPasswordError(cause instanceof Error ? cause.message : tr("Could not read backup file"));
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <section className="accounts-overview">
      {error ? (
        <div className="toast-error" role="alert" aria-live="assertive">
          {error}
          <button type="button" onClick={() => setError("")} aria-label={tr("Close")}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="account-summary-row accounts-summary-row">
        <div className="account-summary-left accounts-summary-left">
          <div className="account-side-meta">
            <div>
              <p className="section-kicker">{tr("MY MONEY")}</p>
              <h2>{tr("Bank accounts")}</h2>
              <p className="account-detail-record-count">
                {accounts.length} total accounts
              </p>
              <div className="accounts-summary-filter">
                <TransactionFilter
                  kinds={summaryKinds}
                  selectedYears={summaryYears}
                  selectedMonths={summaryMonths}
                  years={availableSummaryYears}
                  onKinds={setSummaryKinds}
                  onYears={(values) => {
                    disableCurrentPeriodDefault();
                    setSummaryYears(values);
                  }}
                  onMonths={(values) => {
                    disableCurrentPeriodDefault();
                    setSummaryMonths(values);
                  }}
                />
                <div className="accounts-current-period-switch">
                  <Switch
                    checked={currentPeriodOnly}
                    onChange={toggleCurrentPeriod}
                    label={tr("Show only the current month and year by default")}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <MoneySummaryCards
          rows={summaryRows}
          currency={defaultCurrency}
          excludeTransfers
        />
        <div className="account-overview-actions account-detail-actions">
          <div className="account-top-row">
            <Switch
              checked={showAccountNumbers}
              onChange={setShowAccountNumbers}
              label={tr("Show account numbers")}
            />
            <Btn
              className="account-add-button"
              onClick={startCreate}
              icon={<Plus size={16} />}
            >
              {tr("Add account")}
            </Btn>
          </div>
          <div className="account-backup-buttons">
          <Btn
            variant="outline"
            onClick={() => {
              setBackupPassword("");
              setBackupPasswordConfirm("");
              setBackupPasswordError("");
              setBackupPasswordDialog({ mode: "export" });
            }}
            icon={<Upload size={16} />}
          >
            {tr("Export")}
          </Btn>
          <label className="ui-btn outline account-import-button">
            <Download size={16} /> {tr("Import")}
            <input
              type="file"
              accept=".dragoont,application/vnd.dragoont.backup"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBackupPassword("");
                setBackupPasswordConfirm("");
                setBackupPasswordError("");
                setBackupPasswordDialog({ mode: "import", file });
                event.target.value = "";
              }}
            />
          </label>
          </div>
        </div>
      </div>
      <div className="account-grid">
        {accounts.map((account) => {
          const accountImage = accountImages[account.id] ?? "";
          const accountIconColor = accountIconColors[account.id] ?? "";
          const accountRows = rows.filter(
            (row) => row.account_id === account.id && row.currency === account.currency,
          );
          const balance = sumCents(accountRows.map((row) => row.kind === "income" ? row.amount_cents : -row.amount_cents));
          return (
            <Card
              className={`bank-card ${account.card_color ? "has-custom-color" : "no-custom-color"}`}
              key={account.id}
              style={
                {
                  ...(account.card_color
                    ? { "--bank-color": account.card_color }
                    : {}),
                  ...(accountIconColor
                    ? { "--bank-icon-color": accountIconColor }
                    : {}),
                } as CSSProperties
              }
            >
              <Link className="bank-card-main" href={`/accounts/${account.id}`}>
                <span className="bank-icon">
                  {accountImage ? (
                    <span
                      className="bank-icon-image"
                      role="img"
                      aria-label={`${account.name} icon`}
                      style={{ backgroundImage: `url(${JSON.stringify(accountImage)})` }}
                    />
                  ) : (
                    <Landmark />
                  )}
                </span>
                <div>
                  <strong>{account.name}</strong>
                  <p>
                    {account.account_number
                      ? `${account.currency} · ${showAccountNumbers ? account.account_number : `•••• ${account.account_number.slice(-4)}`}`
                      : `${account.currency} account`}
                  </p>
                </div>
                <b className={balance >= BigInt(0) ? "income" : "expense"}>
                  {money(balance, account.currency)}
                </b>
              </Link>
              <div className="bank-actions">
                <button
                  onClick={() => startEdit(account)}
                  aria-label={`Rename ${account.name}`}
                >
                  <Edit3 />
                </button>
                <button
                  onClick={() => setPendingDelete(account)}
                  aria-label={`Delete ${account.name}`}
                >
                  <Trash2 />
                </button>
              </div>
            </Card>
          );
        })}
      </div>
      {creating || editing ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && closeForm()
          }
        >
          <form className="modal bank-account-modal" onSubmit={save}>
            <div className="modal-head">
              <div>
                <p className="section-kicker">
                  {editing ? "EDIT ACCOUNT" : "NEW ACCOUNT"}
                </p>
                <h2>
                  {editing ? tr("Rename bank account") : tr("Add bank account")}
                </h2>
              </div>
              <Btn
                type="button"
                variant="outline"
                className="icon-only"
                onClick={closeForm}
                icon={<X />}
              />
            </div>
            <div className="account-create-fields">
              <Field label={tr("Account name")} required>
                <Input
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Savings, Cash, Bangkok Bank…"
                />
              </Field>
              <Field label="Account number" hint={tr("Optional")} inlineHint>
                <Input
                  maxLength={64}
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  placeholder="Bank account number"
                />
              </Field>
              {editing ? (
                <Field label={tr("Currency")}>
                  <Input value={editing.currency} disabled />
                </Field>
              ) : (
                <Field label={tr("Currency")} required>
                  <ThemedSelect
                    value={currency}
                    options={currencies}
                    onChange={(value) => value && setCurrency(value)}
                  />
                </Field>
              )}
              <div className="protected-bank-details">
                <div className="protected-details-title">
                  <div>
                    <p className="section-kicker">{tr("PROTECTED DETAILS")}</p>
                    <h3>{tr("Bank details")}</h3>
                  </div>
                  <div className="protected-details-actions">
                    <Btn type="button" disabled={saving || creatingDetailType} onClick={addBankDetail}>+ {tr("Add bank detail")}</Btn>
                    <Switch
                      checked={detailsEnabled}
                      onChange={(enabled)=>{ if (creatingDetailType) return; setDetailsEnabled(enabled); }}
                      label={tr("Enable protected bank account details")}
                    />
                    <details className="protected-details-nav" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
                      <summary aria-label={tr("Saved bank details")} title={tr("Saved bank details")}><Menu aria-hidden="true" /></summary>
                      <div className="protected-details-menu">
                        {savedDetailTypes.length ? savedDetailTypes.map(([entryId,templateId],index)=><button key={entryId} type="button" disabled={saving || creatingDetailType} aria-current={detailEntryId === entryId ? "true" : undefined} onClick={event=>{setDetailsEnabled(true);setDetailsDirty(false);setDetailEntryId(entryId);setDetailTemplateId(templateId);setHadProtectedDetails(true);setDetailsUnlocked(false);setDetailValues({});setDetailPassword("");setDetailPasswordConfirm("");setUnlockRequested(false);event.currentTarget.closest("details")?.removeAttribute("open");}}>{index+1}. {detailTemplates.find((item)=>item.id===templateId)?.name ?? tr("Bank details")}</button>) : <p>{tr("No saved bank details")}</p>}
                      </div>
                    </details>
                  </div>
                </div>
              {detailsEnabled ? (
                <>
                  <div className="protected-details-head">
                    <Field label={tr("Detail type")} required>
                      <ThemedSelect value={detailTemplateId} options={detailTemplates.map((item)=>({value:item.id,label:tr(item.name)}))} placeholder={tr("Select or type a detail type")} disabled={creatingDetailType || Boolean(editing && hadProtectedDetails && !detailsUnlocked)} onCreate={(name)=>void createDetailType(name)} createLabel={(name)=>`${tr("Use custom type")}: ${name}`} onChange={(value)=>{ if(value){setDetailTemplateId(value);setDetailValues({});setDetailsDirty(true);} }} />
                    </Field>
                    {editing && hadProtectedDetails && !detailsUnlocked ? (
                      <button type="button" className="protected-eye" title={tr("Enter your password to view protected details")} aria-label={tr("View protected details")} onClick={()=>setUnlockRequested(true)}><Eye /></button>
                    ) : null}
                  </div>
                  {editing && hadProtectedDetails && !detailsUnlocked ? (
                    <>
                      {selectedDetailTemplate?.fields.map((field)=><Field key={field} label={tr(field)}><Input value="" disabled placeholder={tr("Hidden")} /></Field>)}
                      {unlockRequested ? <div className="protected-unlock"><Input type="password" value={detailPassword} onChange={(event)=>setDetailPassword(event.target.value)} placeholder={tr("Bank detail password")} /><Btn type="button" loading={saving} onClick={()=>void revealDetails()}>{tr("Unlock")}</Btn></div> : null}
                    </>
                  ) : (
                    <>
                      {selectedDetailTemplate?.fields.map((field)=>{
                        const fieldType=selectedDetailTemplate.field_types?.[field] ?? "text";
                        const setValue=(value:string)=>{setDetailValues({...detailValues,[field]:value});setDetailsDirty(true);};
                        return <Field key={field} label={tr(field)} required={!['checkbox','switch'].includes(fieldType)}>
                          {fieldType === "date" ? <DatePicker value={detailValues[field] ?? ""} onChange={setValue} /> : fieldType === "month" ? <MonthPicker value={detailValues[field] ?? ""} onChange={setValue} placeholder={tr("Pick a month")} /> : fieldType === "dropdown" ? <ThemedSelect value={detailValues[field] ?? ""} options={(selectedDetailTemplate.field_options?.[field] ?? []).map((option)=>({value:option,label:tr(option)}))} placeholder={tr("Select option")} onChange={(value)=>value&&setValue(value)} /> : fieldType === "segmented" ? <SegmentedInput value={detailValues[field] ?? ""} tokens={selectedDetailTemplate.field_options?.[field] ?? []} onChange={setValue} /> : fieldType === "number" ? <Input type="number" value={detailValues[field] ?? ""} onChange={(event)=>setValue(event.target.value)} /> : fieldType === "textarea" ? <Textarea value={detailValues[field] ?? ""} onChange={(event)=>setValue(event.target.value)} /> : fieldType === "checkbox" ? <Checkbox label={tr("Enabled")} checked={detailValues[field] === "true"} onChange={(event)=>setValue(String(event.target.checked))} /> : fieldType === "switch" ? <Switch label={tr(field)} checked={detailValues[field] === "true"} onChange={(checked)=>setValue(String(checked))} /> : <Input value={detailValues[field] ?? ""} onChange={(event)=>setValue(event.target.value)} />}
                        </Field>;
                      })}
                      <Field label={tr(hadProtectedDetails ? "Bank detail password" : "Create bank detail password")} required><Input type="password" minLength={8} value={detailPassword} onChange={(event)=>setDetailPassword(event.target.value)} /></Field>
                      {!hadProtectedDetails ? <Field label={tr("Confirm bank detail password")} required><Input type="password" minLength={8} value={detailPasswordConfirm} onChange={(event)=>setDetailPasswordConfirm(event.target.value)} /></Field> : null}
                    </>
                  )}
                  {editing && detailEntryId ? <div style={{gridColumn:"1 / -1"}}>
                    <div className="protected-details-actions">
                      <Btn type="button" variant="ghost" onClick={()=>{setDetailAction("reset");setCurrentDetailPassword("");setNewDetailPassword("");setConfirmDetailPassword("");}}>{tr("Reset bank detail password")}</Btn>
                      <Btn type="button" variant="ghost" onClick={()=>setDetailAction("delete")}><Trash2 />{tr("Delete bank detail")}</Btn>
                    </div>
                    {detailAction === "reset" ? <section aria-label={tr("Reset bank detail password")}>
                      <Field label={tr("Current bank detail password")}><Input type="password" autoComplete="current-password" value={currentDetailPassword} onChange={event=>setCurrentDetailPassword(event.target.value)} /></Field>
                      <Field label={tr("New bank detail password")}><Input type="password" autoComplete="new-password" value={newDetailPassword} onChange={event=>setNewDetailPassword(event.target.value)} /></Field>
                      <Field label={tr("Confirm bank detail password")}><Input type="password" autoComplete="new-password" value={confirmDetailPassword} onChange={event=>setConfirmDetailPassword(event.target.value)} /></Field>
                      <div className="confirm-actions"><Btn type="button" variant="ghost" disabled={saving} onClick={()=>setDetailAction(null)}>{tr("Cancel")}</Btn><Btn type="button" loading={saving} onClick={()=>void applyDetailAction()}>{tr("Reset bank detail password")}</Btn></div>
                    </section> : null}
                  </div> : null}
                </>
              ) : <p className="protected-details-empty">{tr("Turn on to store encrypted bank or card information.")}</p>}
              </div>
              <Field className="full" label={tr("Card color")}>
                <div className="color-options bank-color-options">
                  <button
                    type="button"
                    title={tr("No color")}
                    aria-label={tr("No color")}
                    className={`no-color-option ${cardColor ? "" : "active"}`}
                    onClick={() => setCardColor("")}
                  >
                    {cardColor ? <Ban /> : <Check />}
                  </button>
                  {cardColors.map((color) => (
                    <button
                      type="button"
                      key={color}
                      title={color}
                      aria-label={`Use ${color}`}
                      className={cardColor === color ? "active" : ""}
                      style={{ background: color }}
                      onClick={() => setCardColor(color)}
                    >
                      {cardColor === color ? <Check /> : null}
                    </button>
                  ))}
                  <ProjectColorPicker
                    value={cardColor}
                    onChange={setCardColor}
                    label={tr("Choose custom card color")}
                  />
                </div>
              </Field>
              <Field className="full" label={tr("Icon (optional)")}>
                <div className="bank-icon-editor">
                  <div
                    className="bank-image-preview"
                    style={
                      imageData
                        ? { backgroundImage: `url(${JSON.stringify(imageData)})` }
                        : iconColor
                          ? { color: iconColor }
                          : undefined
                    }
                  >
                    {!imageData ? <Landmark /> : null}
                  </div>
                  <div className="bank-icon-controls">
                    <Input
                      value={imageData}
                      onChange={(event) => setImageData(event.target.value)}
                      placeholder="https://example.com/bank-icon.png"
                      aria-label={tr("Icon URL")}
                    />
                    <div className="bank-icon-actions">
                      <label className="ui-btn outline bank-image-upload">
                        <Upload size={16} /> {tr("Upload image")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            if (!file.type.startsWith("image/") || file.size > 1_400_000) {
                              setError(tr("Choose an image smaller than 1.4 MB"));
                              return;
                            }
                            readBankImage(
                              file,
                              (value) => {
                                setCropZoom(1);
                                setPendingCropImage(value);
                              },
                              () => setError(tr("Could not read image")),
                            );
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {imageData ? (
                        <button
                          type="button"
                          className="remove-bank-icon"
                          onClick={() => setImageData("")}
                        >
                          {tr("Remove icon")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Field>
              {!imageData ? (
                <Field className="full" label={tr("Icon colour (when no icon URL)")}>
                  <div className="bank-icon-color-editor">
                    <button
                      type="button"
                      className={`icon-color-none ${iconColor ? "" : "active"}`}
                      onClick={() => setIconColor("")}
                      aria-label={tr("No icon colour")}
                    >
                      {iconColor ? "" : "none"}
                    </button>
                    <Input readOnly value={iconColor || "none"} />
                    <ProjectColorPicker
                      value={iconColor}
                      onChange={setIconColor}
                      label={tr("Choose icon colour")}
                    />
                  </div>
                </Field>
              ) : null}
              <div
                className={`bank-card-preview full ${cardColor ? "has-custom-color" : "no-custom-color"}`}
                style={
                  {
                    ...(cardColor ? { "--bank-color": cardColor } : {}),
                    ...(iconColor ? { "--bank-icon-color": iconColor } : {}),
                  } as CSSProperties
                }
              >
                <span className="bank-icon">
                  {imageData ? (
                    <span
                      className="bank-icon-image"
                      role="img"
                      aria-label={tr("Bank account image")}
                      style={{ backgroundImage: `url(${JSON.stringify(imageData)})` }}
                    />
                  ) : (
                    <Landmark />
                  )}
                </span>
                <div>
                  <strong>{name || tr("Bank account")}</strong>
                  <p>{currency} {accountNumber ? `· •••• ${accountNumber.slice(-4)}` : tr("account")}</p>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <Btn type="button" variant="outline" onClick={closeForm}>
                {tr("Cancel")}
              </Btn>
              <Btn loading={saving || creatingDetailType}>
                {editing ? tr("Save name") : tr("Add account")}
              </Btn>
            </div>
          </form>
        </div>
      ) : null}
      {pendingCropImage ? (
        <div className="modal-backdrop bank-crop-backdrop">
          <section
            className="modal bank-crop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-bank-icon-title"
          >
            <div className="modal-head">
              <div>
                <p className="section-kicker">{tr("BANK ACCOUNT ICON")}</p>
                <h2 id="crop-bank-icon-title">{tr("Crop image")}</h2>
              </div>
              <Btn
                type="button"
                variant="outline"
                className="icon-only"
                icon={<X />}
                onClick={() => setPendingCropImage("")}
              />
            </div>
            <div className="bank-crop-stage">
              <div
                className="bank-crop-image"
                style={{
                  backgroundImage: `url(${JSON.stringify(pendingCropImage)})`,
                  backgroundSize: `${cropZoom * 100}%`,
                }}
              />
            </div>
            <label className="bank-crop-zoom">
              <span>{tr("Zoom")}</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
              />
              <output>{Math.round(cropZoom * 100)}%</output>
            </label>
            <div className="modal-actions">
              <Btn type="button" variant="outline" onClick={() => setPendingCropImage("")}>
                {tr("Cancel")}
              </Btn>
              <Btn
                type="button"
                onClick={() =>
                  cropBankImage(
                    pendingCropImage,
                    cropZoom,
                    (value) => {
                      setImageData(value);
                      setPendingCropImage("");
                    },
                    () => setError(tr("Could not crop image")),
                  )
                }
              >
                {tr("Use cropped image")}
              </Btn>
            </div>
          </section>
        </div>
      ) : null}
      {pendingDelete ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setPendingDelete(null)
          }
        >
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <div className="confirm-icon">
              <Trash2 />
            </div>
            <div className="confirm-copy">
              <h3 id="delete-account-title">{tr("Delete bank account?")}</h3>
              <p>
                Delete “{pendingDelete.name}”? Only an empty account can be
                deleted.
              </p>
            </div>
            <div className="confirm-actions">
              <Btn variant="ghost" onClick={() => setPendingDelete(null)}>
                {tr("Cancel")}
              </Btn>
              <Btn
                variant="danger"
                loading={saving}
                onClick={() => void remove()}
              >
                {tr("Delete")}
              </Btn>
            </div>
          </section>
        </div>
      ) : null}
      {backupPasswordDialog ? (
        <div className="modal-backdrop">
          <form
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onSubmit={(event) => {
              event.preventDefault();
              void submitBackupPassword();
            }}
          >
            <div className="confirm-icon"><Upload /></div>
            <div className="confirm-copy">
              <h3>{tr(backupPasswordDialog.mode === "export" ? "Protect backup" : "Unlock backup")}</h3>
              <p>{tr(backupPasswordDialog.mode === "export" ? "Enter a password required to open or restore this backup." : "Enter the password used when this backup was exported.")}</p>
              <Field label={tr("Backup password")}>
                <Input
                  type="password"
                  autoFocus
                  autoComplete="new-password"
                  value={backupPassword}
                  onChange={(event) => setBackupPassword(event.target.value)}
                />
              </Field>
              {backupPasswordDialog.mode === "export" ? (
                <Field label={tr("Confirm password")}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={backupPasswordConfirm}
                    onChange={(event) => setBackupPasswordConfirm(event.target.value)}
                  />
                </Field>
              ) : null}
              {backupPasswordError ? <p className="field-error">{backupPasswordError}</p> : null}
            </div>
            <div className="confirm-actions">
              <Btn type="button" variant="ghost" onClick={() => setBackupPasswordDialog(null)}>{tr("Cancel")}</Btn>
              <Btn type="submit" loading={saving}>{tr(backupPasswordDialog.mode === "export" ? "Export" : "Unlock")}</Btn>
            </div>
          </form>
        </div>
      ) : null}
      {pendingBackup ? (
        <div className="modal-backdrop">
          <section className="confirm-dialog" role="alertdialog" aria-modal="true">
            <div className="confirm-icon"><Upload /></div>
            <div className="confirm-copy">
              <h3>{tr("Restore backup?")}</h3>
              <p>
                {tr("This will replace your current accounts and transactions.")} {pendingBackup.preview.accounts} {tr("accounts")}, {pendingBackup.preview.transactions} {tr("transactions")}.
              </p>
            </div>
            <div className="confirm-actions">
              <Btn variant="ghost" onClick={() => setPendingBackup(null)}>{tr("Cancel")}</Btn>
              <Btn loading={saving} onClick={() => void restoreBackup()}>{tr("Restore backup")}</Btn>
            </div>
          </section>
        </div>
      ) : null}
      {detailAction === "delete" ? <div className="modal-backdrop">
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-bank-detail-title" onKeyDown={event=>{if(event.key === "Escape" && !saving)setDetailAction(null);}}>
          <div className="confirm-icon"><Trash2 /></div>
          <div className="confirm-copy"><h3 id="delete-bank-detail-title">{tr("Delete bank detail?")}</h3><p>{tr("This permanently deletes only the selected bank detail.")}</p></div>
          <div className="confirm-actions"><Btn type="button" autoFocus variant="ghost" disabled={saving} onClick={()=>setDetailAction(null)}>{tr("Cancel")}</Btn><Btn type="button" loading={saving} onClick={()=>void applyDetailAction()}>{tr("Delete bank detail")}</Btn></div>
        </section>
      </div> : null}
      {toast ? (
        <div className="toast-success">
          <Check />
          {toast}
        </div>
      ) : null}
    </section>
  );
}
