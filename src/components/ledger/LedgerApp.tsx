"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ClipboardPaste,
  Copy,
  Edit3,
  Eraser,
  Eye,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  api,
  money,
  type BankAccount,
  type Transaction,
  type TransactionInput,
  type TransactionKind,
  type TransactionOption,
  type User,
} from "@/app/api/client";
import { Btn, Card, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { TimePicker } from "@/components/ui/TimePicker";
import { Switch } from "@/components/ui/Switch";
import { AccountingDashboard } from "@/components/accounts/AccountingDashboard";
import { BankAccounts } from "@/components/accounts/BankAccounts";
import { MoneySummaryCards } from "@/components/ledger/MoneySummaryCards";
import { TransactionFilter } from "@/components/ledger/TransactionFilter";
import { AccountPanel } from "@/components/accounts/AccountPanel";
import { UserMenu } from "@/components/app/UserMenu";
import { TopbarPreferences } from "@/components/app/TopbarPreferences";
import type { AppPage } from "@/components/app/AuthenticatedApp";
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
] as const;
const currencyOptions = currencies.map((currency) => ({
  value: currency,
  label: currency,
}));
const createEmpty = (): TransactionInput => ({
  kind: "expense",
  amount_cents: 0,
  currency: "",
  category: "",
  category_detail: "",
  description: "",
  transaction_date: "",
  transaction_time: "00:00",
  paid_to: "",
  transaction_reference: "",
  payment_channel: "",
  payment_channel_detail: "",
  promptpay_to: "",
  merchant_id: "",
  shop_id: "",
  note: "",
  linked_account_id: null,
});
type TransactionDraft = {
  form: TransactionInput;
  amountWhole: string;
  amountDec: string;
  otherCategory?: string;
  otherChannel?: string;
};
type TransactionClipboard = TransactionDraft & {
  type: "darkcelestial-transaction";
  version: 1;
};

export function LedgerApp({
  page,
  accountId,
  user,
  onUserChange,
  onLogout,
}: {
  page: AppPage;
  accountId?: string;
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => void;
}) {
  const { tr } = useI18n();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [syncRows, setSyncRows] = useState<Transaction[]>([]);
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactionOptions, setTransactionOptions] = useState<
    TransactionOption[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<TransactionKind[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [currentPeriodOnly, setCurrentPeriodOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [transferMode, setTransferMode] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState<TransactionInput>(createEmpty);
  const [otherCategory, setOtherCategory] = useState("");
  const [otherChannel, setOtherChannel] = useState("");
  const [pendingDraftAction, setPendingDraftAction] = useState<
    "close" | "clear" | null
  >(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [previewTransaction, setPreviewTransaction] = useState<Transaction | null>(null);
  const [amountWhole, setAmountWhole] = useState("");
  const [amountDec, setAmountDec] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const lastCreatedIdRef = useRef<string | null>(null);

  const currentPeriodKey = `pl-current-period-${accountId ?? "all-accounts"}`;
  const currentYear = String(new Date().getFullYear());
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const enabled = localStorage.getItem(currentPeriodKey) === "true";
      setCurrentPeriodOnly(enabled);
      if (enabled) {
        setYears([currentYear]);
        setMonths([currentMonth]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentMonth, currentPeriodKey, currentYear]);

  function toggleCurrentPeriod(enabled: boolean) {
    setCurrentPeriodOnly(enabled);
    localStorage.setItem(currentPeriodKey, String(enabled));
    setYears(enabled ? [currentYear] : []);
    setMonths(enabled ? [currentMonth] : []);
    setPageNumber(1);
  }

  function disableCurrentPeriodDefault() {
    setCurrentPeriodOnly(false);
    localStorage.setItem(currentPeriodKey, "false");
  }

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);
  const [DRAFT_KEY] = useState(() => `transaction-draft-${user.id}`);
  const savedDraftRef = useRef<TransactionDraft | null>(null);

  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;
    const limits = [
      { maxZoom: 0.6, limit: 16 },
      { maxZoom: 0.72, limit: 14 },
      { maxZoom: 0.85, limit: 12 },
      { maxZoom: 1.05, limit: 10 },
      { maxZoom: 1.18, limit: 7 },
      { maxZoom: 1.38, limit: 6 },
      { maxZoom: 1.6, limit: 5 },
      { maxZoom: Infinity, limit: 4 },
    ];
    const applyPageSize = () => {
      const dpr = window.devicePixelRatio;
      const zoom = dpr / (Math.round(dpr) || 1);
      const next = limits.find(({ maxZoom }) => zoom <= maxZoom)?.limit ?? 4;
      setPageSize(next);
      setPageNumber(1);
    };
    const subscribe = () => {
      mediaQuery?.removeEventListener("change", handleZoomChange);
      mediaQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      mediaQuery.addEventListener("change", handleZoomChange);
    };
    const handleZoomChange = () => {
      subscribe();
      applyPageSize();
    };
    subscribe();
    applyPageSize();
    return () => mediaQuery?.removeEventListener("change", handleZoomChange);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [transactions, accounts, allTransactions, options] = await Promise.all([
        api.list(false, accountId),
        accountId || page === "dashboard"
          ? api.accounts()
          : Promise.resolve([]),
        accountId ? api.list(false) : Promise.resolve([]),
        api.transactionOptions(),
      ]);
      setRows(transactions);
      setSyncRows(accountId ? allTransactions : transactions);
      setAccounts(accounts);
      setTransactionOptions(options);
      setAccount(
        accountId
          ? (accounts.find((item) => item.id === accountId) ?? null)
          : null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load your ledger",
      );
    } finally {
      setLoading(false);
    }
  }, [accountId, page]);

  const categories = useMemo<Record<TransactionKind, string[]>>(
    () => ({
      income: transactionOptions
        .filter((item) => item.option_type === "income_category")
        .map((item) => item.value),
      expense: transactionOptions
        .filter((item) => item.option_type === "expense_category")
        .map((item) => item.value),
    }),
    [transactionOptions],
  );
  const paymentChannels = useMemo(
    () =>
      transactionOptions
        .filter((item) => item.option_type === "payment_channel")
        .map((item) => ({ value: item.value, label: item.value })),
    [transactionOptions],
  );
  const categoryAllowsText = transactionOptions.some(
    (item) =>
      item.option_type === `${form.kind}_category` &&
      item.value === form.category &&
      item.optional_text_enabled,
  );
  const channelAllowsText = transactionOptions.some(
    (item) =>
      item.option_type === "payment_channel" &&
      item.value === form.payment_channel &&
      item.optional_text_enabled,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!needle ||
          `${row.description} ${row.category} ${row.paid_to ?? ""} ${row.transaction_reference ?? ""} ${row.payment_channel ?? ""} ${row.note ?? ""}`
            .toLowerCase()
            .includes(needle)) &&
        (kinds.length === 0 || kinds.includes(row.kind)) &&
        (years.length === 0 || years.includes(row.transaction_date.slice(0, 4))) &&
        (months.length === 0 || months.includes(row.transaction_date.slice(5, 7))),
    );
  }, [kinds, months, query, rows, years]);
  useEffect(() => {
    if (!highlightId || filtered.length === 0) return;
    const index = filtered.findIndex((row) => row.id === highlightId);
    if (index >= 0) {
      setPageNumber(Math.floor(index / pageSize) + 1);
      window.setTimeout(() => {
        document
          .querySelector(`tr[data-row-id="${highlightId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, rows, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(pageNumber, totalPages);
  const visibleRows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const yearOptions = useMemo(
    () => [
      { value: "all", label: "All years" },
      ...Array.from(
        new Set(rows.map((row) => row.transaction_date.slice(0, 4))),
      )
        .sort((a, b) => b.localeCompare(a))
        .map((value) => ({ value, label: value })),
    ],
    [rows],
  );

  useEffect(() => {
    if (!formOpen || editing || transferMode) return;
    const timer = window.setTimeout(
      () => writeDraft(form, amountWhole, amountDec, otherCategory, otherChannel),
      400,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, amountWhole, amountDec, otherCategory, otherChannel, formOpen, editing, transferMode]);

  useEffect(() => {
    if (!formOpen || editing || transferMode || !hasDraftInformation()) return;
    let intentionalReload = false;
    const allowIntentionalReload = () => {
      intentionalReload = true;
      writeDraft(form, amountWhole, amountDec, otherCategory, otherChannel);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      writeDraft(form, amountWhole, amountDec, otherCategory, otherChannel);
      if (intentionalReload) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const pageHide = () =>
      writeDraft(form, amountWhole, amountDec, otherCategory, otherChannel);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("darkcelestial-intentional-reload", allowIntentionalReload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("darkcelestial-intentional-reload", allowIntentionalReload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, editing, transferMode, form, amountWhole, amountDec, otherCategory, otherChannel]);

  function readDraft(): TransactionDraft | null {
    if (savedDraftRef.current) return savedDraftRef.current;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      const draft = raw ? (JSON.parse(raw) as TransactionDraft) : null;
      savedDraftRef.current = draft;
      return draft;
    } catch {
      return null;
    }
  }
  function hasDraftInformation() {
    return Boolean(
      amountWhole ||
        amountDec ||
        form.currency ||
        form.category ||
        form.description.trim() ||
        form.transaction_date ||
        form.paid_to?.trim() ||
        form.transaction_reference?.trim() ||
        form.payment_channel ||
        form.promptpay_to?.trim() ||
        form.merchant_id?.trim() ||
        form.shop_id?.trim() ||
        form.note?.trim() ||
        form.linked_account_id ||
        otherCategory.trim() ||
        otherChannel.trim(),
    );
  }
  function writeDraft(
    form: TransactionInput,
    amountWhole: string,
    amountDec: string,
    categoryDetail = otherCategory,
    channelDetail = otherChannel,
  ) {
    try {
      if (!hasDraftInformation()) {
        savedDraftRef.current = null;
        window.localStorage.removeItem(DRAFT_KEY);
      } else {
        const draft = {
          form,
          amountWhole,
          amountDec,
          otherCategory: categoryDetail,
          otherChannel: channelDetail,
        };
        savedDraftRef.current = draft;
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(draft),
        );
      }
    } catch {
      /* storage unavailable */
    }
  }
  function clearDraft() {
    savedDraftRef.current = null;
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }
  function openNew() {
    setTransferMode(false);
    setEditing(null);
    setOtherCategory("");
    setOtherChannel("");
    const draft = readDraft();
    if (draft) {
      setForm(draft.form);
      setAmountWhole(draft.amountWhole);
      setAmountDec(draft.amountDec);
      setOtherCategory(draft.otherCategory ?? draft.form.category_detail ?? "");
      setOtherChannel(
        draft.otherChannel ?? draft.form.payment_channel_detail ?? "",
      );
    } else {
      setAmountWhole("");
      setAmountDec("");
      setForm({
        ...createEmpty(),
        account_id: accountId,
      });
    }
    setFormOpen(true);
  }
  function openTransfer() {
    const now = new Date();
    setTransferMode(true);
    setEditing(null);
    setOtherCategory("");
    setOtherChannel("");
    clearDraft();
    setAmountWhole("");
    setAmountDec("");
    setForm({
      ...createEmpty(),
      account_id: accountId,
      kind: "expense",
      currency: account?.currency ?? user.default_currency,
      category: "Transfer",
      description: account ? `Transfer from ${account.name}` : "Bank transfer",
      transaction_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      transaction_time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      payment_channel: "Bank transfer",
    });
    setFormOpen(true);
  }
  function openEdit(row: Transaction) {
    setTransferMode(Boolean(row.transfer_id));
    setEditing(row);
    clearDraft();
    setAmountWhole(String(Math.floor(row.amount_cents / 100)));
    setAmountDec(String(row.amount_cents % 100).padStart(2, "0"));
    setOtherCategory(row.category_detail ?? "");
    setOtherChannel(row.payment_channel_detail ?? "");
    setForm({
      account_id: row.account_id,
      kind: row.kind,
      amount_cents: row.amount_cents,
      currency: row.currency,
      category: row.category,
      category_detail: row.category_detail ?? "",
      description: row.description,
      transaction_date: row.transaction_date,
      transaction_time: (row.transaction_time || "00:00").slice(0, 5),
      paid_to: row.paid_to ?? "",
      transaction_reference: row.transaction_reference ?? "",
      payment_channel: row.payment_channel ?? "",
      payment_channel_detail: row.payment_channel_detail ?? "",
      promptpay_to: row.promptpay_to ?? "",
      merchant_id: row.merchant_id ?? "",
      shop_id: row.shop_id ?? "",
      note: row.note ?? "",
      linked_account_id: row.counterparty_account_id,
      linked_transaction_id:
        syncRows.find(
          (candidate) =>
            row.transfer_id &&
            candidate.id !== row.id &&
            candidate.transfer_id === row.transfer_id,
        )?.id ?? null,
    });
    setFormOpen(true);
  }
  function updateAmount(whole: string, dec: string) {
    const cents =
      Number(whole || "0") * 100 +
      Number((dec || "0").padEnd(2, "0").slice(0, 2));
    setForm((old) => ({ ...old, amount_cents: cents }));
  }
  function transactionReferences() {
    return (form.transaction_reference ?? "").split("\n");
  }
  function updateTransactionReference(index: number, value: string) {
    const references = transactionReferences();
    references[index] = value;
    setForm({ ...form, transaction_reference: references.join("\n") });
  }
  function addTransactionReference() {
    const references = transactionReferences();
    if (references.length >= 20) return;
    setForm({ ...form, transaction_reference: [...references, ""].join("\n") });
  }
  function removeTransactionReference(index: number) {
    const references = transactionReferences().filter((_, item) => item !== index);
    setForm({ ...form, transaction_reference: references.join("\n") });
  }
  async function copyTransactionForm() {
    const payload: TransactionClipboard = {
      type: "darkcelestial-transaction",
      version: 1,
      form,
      amountWhole,
      amountDec,
      otherCategory,
      otherChannel,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(tr("Could not copy transaction information"));
    }
  }
  async function pasteTransactionForm() {
    try {
      const payload = JSON.parse(
        await navigator.clipboard.readText(),
      ) as Partial<TransactionClipboard>;
      const pasted = payload.form;
      if (
        payload.type !== "darkcelestial-transaction" ||
        payload.version !== 1 ||
        !pasted ||
        (pasted.kind !== "income" && pasted.kind !== "expense") ||
        typeof pasted.amount_cents !== "number" ||
        typeof pasted.currency !== "string" ||
        typeof pasted.category !== "string" ||
        typeof pasted.description !== "string" ||
        typeof pasted.transaction_date !== "string" ||
        typeof pasted.transaction_time !== "string"
      ) {
        throw new Error("invalid clipboard transaction");
      }
      setForm({ ...createEmpty(), ...pasted, account_id: pasted.account_id ?? accountId });
      setAmountWhole(String(payload.amountWhole ?? Math.floor(pasted.amount_cents / 100)));
      setAmountDec(
        String(payload.amountDec ?? pasted.amount_cents % 100).padStart(2, "0"),
      );
      setOtherCategory(payload.otherCategory ?? pasted.category_detail ?? "");
      setOtherChannel(
        payload.otherChannel ?? pasted.payment_channel_detail ?? "",
      );
    } catch {
      setError(tr("Clipboard does not contain copied transaction information"));
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents =
      Number(amountWhole || "0") * 100 +
      Number((amountDec || "0").padEnd(2, "0").slice(0, 2));
    if (cents <= 0) {
      setError("Amount must be greater than zero");
      return;
    }
    if (
      !form.currency ||
      !form.transaction_date ||
      !form.transaction_time ||
      !form.category
    ) {
      setError("Choose a currency, date, time, and category");
      return;
    }
    if (
      transferMode &&
      !form.linked_account_id &&
      !form.promptpay_to?.trim()
    ) {
      setError("Choose one of your bank accounts or enter a destination account");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const submitted = {
        ...form,
        transaction_reference: transactionReferences()
          .map((reference) => reference.trim())
          .filter(Boolean)
          .join("\n"),
        category_detail: categoryAllowsText ? otherCategory.trim() : "",
        payment_channel_detail: channelAllowsText ? otherChannel.trim() : "",
      };
      if (editing) await api.update(editing.id, submitted);
      else {
        const created = await api.create(submitted);
        lastCreatedIdRef.current = created.id;
        clearDraft();
      }
      setFormOpen(false);
      await load();
      const savedId = editing?.id ?? lastCreatedIdRef.current;
      if (savedId) {
        setHighlightId(savedId);
        if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
        highlightTimer.current = window.setTimeout(() => setHighlightId(null), 4000);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save transaction",
      );
    } finally {
      setSaving(false);
    }
  }
  function cancelForm() {
    if (!editing && !transferMode && hasDraftInformation()) {
      writeDraft(form, amountWhole, amountDec, otherCategory, otherChannel);
      setPendingDraftAction("close");
      return;
    }
    setFormOpen(false);
  }
  function clearTransactionForm() {
    clearDraft();
    setAmountWhole("");
    setAmountDec("");
    setOtherCategory("");
    setOtherChannel("");
    setForm({ ...createEmpty(), account_id: accountId });
    setPendingDraftAction(null);
  }
  async function remove(row: Transaction) {
    setPendingDelete(row);
  }
  async function confirmRemove() {
    if (!pendingDelete) return;
    const row = pendingDelete;
    setPendingDelete(null);
    try {
      await api.remove(row.id);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete transaction",
      );
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar glass-bar">
        <Link
          className="brand"
          href="/transactions"
          aria-label="DarkCelestial home"
        >
          <Image
            src="/web.png"
            width={34}
            height={34}
            alt=""
            className="brand-logo"
          />
          <span>DarkCelestial</span>
        </Link>
        <nav className="nav-tabs" aria-label="Main navigation">
          <Link
            className={page === "dashboard" ? "active" : ""}
            href="/dashboard"
          >
            <LayoutDashboard size={17} /> {tr("Dashboard")}
          </Link>
          <Link
            className={page === "transactions" ? "active" : ""}
            href="/transactions"
          >
            <WalletCards size={17} /> {tr("Transactions")}
          </Link>
        </nav>
        <div className="top-actions">
          <TopbarPreferences />
          <UserMenu user={user} onLogout={onLogout} />
        </div>
      </header>
      <main
        id="top"
        className={`main-content ${page === "dashboard" ? "dashboard-content" : ""} ${page === "transactions" ? "account-detail-content" : ""}`}
      >
        {page === "transactions" && accountId ? (
          <>
            <section className="account-detail-summary">
              <div className="account-summary-row">
                <div className="account-summary-left">
                  <Link
                    className="account-detail-back"
                    href="/transactions"
                    aria-label="Back to bank accounts"
                  >
                    <ChevronLeft />
                  </Link>
                  <div className="account-side-meta">
                    <div>
                      <p className="section-kicker">{tr("BANK ACCOUNT")}</p>
                      <h2>{account?.name ?? tr("Account")}</h2>
                    </div>
                    <div>
                      <p className="section-kicker">{tr("YOUR LEDGER")}</p>
                      <h2>{tr("Transactions")}</h2>
                      <p className="account-detail-record-count">
                        {rows.length} total records
                      </p>
                    </div>
                  </div>
                </div>
                <MoneySummaryCards
                  rows={filtered}
                  currency={account?.currency ?? user.default_currency}
                />
                <div className="section-actions account-detail-actions ledger-actions">
                  <Btn
                    variant="outline"
                    onClick={() => void load()}
                    icon={<RefreshCw size={18} />}
                  >
                    {tr("Refresh")}
                  </Btn>
                  <Btn onClick={openNew} icon={<Plus size={18} />}>
                    {tr("Add transaction")}
                  </Btn>
                  <div className="current-period-switch">
                    <Switch
                      checked={currentPeriodOnly}
                      onChange={toggleCurrentPeriod}
                      label={tr("Show only the current month and year by default")}
                    />
                  </div>
                  <Btn
                    className="send-money-action"
                    variant="outline"
                    onClick={openTransfer}
                    icon={<Send size={18} />}
                  >
                    {tr("Send money")}
                  </Btn>
                </div>
              </div>
            </section>
            <Card className={`ledger-card ledger-page-size-${pageSize}`}>
              <div className="filters">
                <label className="search-box">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPageNumber(1);
                    }}
                    placeholder={tr("Search description, category, or note")}
                  />
                </label>
                <TransactionFilter
                  kinds={kinds}
                  selectedYears={years}
                  selectedMonths={months}
                  years={yearOptions
                    .filter((option) => option.value !== "all")
                    .map((option) => option.value)}
                  onKinds={(value) => {
                    setKinds(value);
                    setPageNumber(1);
                  }}
                  onYears={(value) => {
                    disableCurrentPeriodDefault();
                    setYears(value);
                    setPageNumber(1);
                  }}
                  onMonths={(value) => {
                    disableCurrentPeriodDefault();
                    setMonths(value);
                    setPageNumber(1);
                  }}
                />
              </div>
              {loading ? (
                <EmptyState
                  icon={<LoaderCircle className="spin" />}
                  title="Loading your ledger…"
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<FileText />}
                  title={tr("No transactions found")}
                  description={tr(
                    "Add your first record or change the filters.",
                  )}
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{tr("Date & time")}</th>
                        <th>{tr("Description")}</th>
                        <th>{tr("Category")}</th>
                        <th>{tr("Type")}</th>
                        <th className="amount">{tr("Amount")}</th>
                        <th className="row-actions">{tr("Actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.id} data-row-id={row.id} className={row.id === highlightId ? "row-highlight" : ""}>
                          <td>
                            <strong>
                              {new Date(
                                `${row.transaction_date}T00:00:00`,
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </strong>
                            <span className="note">
                              {(row.transaction_time || "00:00").slice(0, 5)}
                            </span>
                          </td>
                          <td>
                            <strong>{row.description}</strong>
                            {row.note ? (
                              <span className="note" title={row.note}>
                                {row.note}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <span className="category">{row.category}</span>
                          </td>
                          <td>
                            <span className={`type-pill ${row.kind}`}>
                              {row.kind === "income" ? (
                                <ArrowDownLeft />
                              ) : (
                                <ArrowUpRight />
                              )}
                              {row.kind}
                            </span>
                          </td>
                          <td className={`amount ${row.kind}`}>
                            {money(
                              row.kind === "income" ? row.amount_cents : -row.amount_cents,
                              row.currency,
                              row.kind === "income",
                            )}
                          </td>
                          <td className="row-actions">
                            <button
                              onClick={() => openEdit(row)}
                              aria-label={`Edit ${row.description}`}
                            >
                              <Edit3 />
                            </button>
                            {!row.transfer_id && !row.counterparty_account_id ? (
                              <button
                                onClick={() => void remove(row)}
                                aria-label={`Delete ${row.description}`}
                              >
                                <Trash2 />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <div className="list-pagination" aria-label="Pagination">
                <button
                  type="button"
                  aria-label="First page"
                  disabled={currentPage === 1}
                  onClick={() => setPageNumber(1)}
                >
                  «
                </button>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={currentPage === 1}
                  onClick={() => setPageNumber((value) => value - 1)}
                >
                  ‹
                </button>
                <span className="pagination-page">{currentPage}</span>
                <span className="pagination-total">/ {totalPages}</span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={currentPage === totalPages}
                  onClick={() => setPageNumber((value) => value + 1)}
                >
                  ›
                </button>
                <button
                  type="button"
                  aria-label="Last page"
                  disabled={currentPage === totalPages}
                  onClick={() => setPageNumber(totalPages)}
                >
                  »
                </button>
            </div>
          </>
        ) : null}
        {page === "transactions" && !accountId ? (
          <BankAccounts
            rows={rows}
            defaultCurrency={user.default_currency}
            onCreated={() => void load()}
          />
        ) : null}
        {page === "dashboard" ? (
          <AccountingDashboard
            rows={rows}
            accounts={accounts}
            currency={user.default_currency}
            onRefresh={() => void load()}
          />
        ) : null}
        {page === "settings-profile" ? (
          <AccountPanel tab="profile" user={user} onUserChange={onUserChange} />
        ) : null}
        {page === "settings-appearance" ? (
          <AccountPanel
            tab="appearance"
            user={user}
            onUserChange={onUserChange}
          />
        ) : null}
        {page === "settings-password" ? (
          <AccountPanel tab="password" user={user} onUserChange={onUserChange} />
        ) : null}
        {page === "settings-delete-data" ? (
          <AccountPanel tab="delete-data" user={user} onUserChange={onUserChange} />
        ) : null}
        {page === "settings-create-account" ? (
          <AccountPanel
            tab="create-account"
            user={user}
            onUserChange={onUserChange}
          />
        ) : null}
        {page === "settings-all-accounts" ? (
          <AccountPanel
            tab="all-accounts"
            user={user}
            onUserChange={onUserChange}
          />
        ) : null}
        {page === "settings-transaction-options" ? (
          <AccountPanel
            tab="transaction-options"
            user={user}
            onUserChange={onUserChange}
          />
        ) : null}
        {page === "settings-bank-fields" ? (
          <AccountPanel tab="bank-fields" user={user} onUserChange={onUserChange} />
        ) : null}
      </main>
      {error ? (
        <div className="toast-error" role="alert" aria-live="assertive">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      ) : null}
      {pendingDelete ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null);
          }}
        >
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <div className="confirm-icon">
              <Trash2 />
            </div>
            <div className="confirm-copy">
              <h3 id="delete-title">{tr("Delete transaction?")}</h3>
              <p>
                Delete “{pendingDelete.description}”? This cannot be undone.
              </p>
            </div>
            <div className="confirm-actions">
              <Btn variant="ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </Btn>
              <Btn variant="danger" onClick={() => void confirmRemove()}>
                Delete
              </Btn>
            </div>
          </section>
        </div>
      ) : null}
      {formOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelForm();
          }}
        >
          <form className="modal transaction-modal" onSubmit={submit}>
            <div className="modal-head">
              <div>
                <p className="section-kicker">
                  {editing
                    ? tr("EDIT RECORD")
                    : transferMode
                      ? tr("SEND MONEY")
                      : tr("NEW RECORD")}
                </p>
                <h2>
                  {editing
                    ? tr("Update transaction")
                    : transferMode
                      ? tr("Send money")
                      : tr("Add transaction")}
                </h2>
              </div>
              <div className="transaction-modal-head-actions">
                <Btn
                  type="button"
                  variant="outline"
                  icon={<Copy />}
                  onClick={() => void copyTransactionForm()}
                >
                  {tr(copied ? "Copied" : "Copy")}
                </Btn>
                {!editing && !transferMode ? (
                  <Btn
                    type="button"
                    variant="outline"
                    icon={<ClipboardPaste />}
                    onClick={() => void pasteTransactionForm()}
                  >
                    {tr("Paste")}
                  </Btn>
                ) : null}
                <Btn
                  type="button"
                  variant="outline"
                  className="icon-only"
                  onClick={cancelForm}
                  icon={<X />}
                />
              </div>
            </div>
            <div className="kind-toggle">
              {(["expense", "income"] as const).map((value) =>
                transferMode && value === "income" ? null : (
                <button
                  type="button"
                  key={value}
                  className={form.kind === value ? `active ${value}` : ""}
                  onClick={() =>
                    {
                      setOtherCategory("");
                      setForm((old) => ({
                        ...old,
                        kind: value,
                        category: "",
                      }));
                    }
                  }
                >
                  {value === "income" ? <ArrowDownLeft /> : <ArrowUpRight />}
                  {value}
                </button>
                ))}
            </div>
            <div className="transaction-form-columns">
              <div className="transaction-main form-grid">
              <Field className="full" label={tr("Description")} required>
                <Input
                  required
                  maxLength={120}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder={tr("What was this for?")}
                />
              </Field>
              <Field label={`Amount (${form.currency})`} required>
                <div className="amount-split">
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={12}
                    value={amountWhole}
                    onChange={(event) => {
                      const value = event.target.value
                        .replace(/[^0-9]/g, "")
                        .replace(/^0+(?=\d)/, "");
                      setAmountWhole(value);
                      updateAmount(value, amountDec);
                    }}
                    placeholder="0"
                    aria-label="Whole amount"
                  />
                  <span className="amount-dot">.</span>
                  <input
                    className="amount-dec"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={amountDec}
                    onChange={(event) => {
                      const value = event.target.value.replace(/[^0-9]/g, "");
                      setAmountDec(value);
                      updateAmount(amountWhole, value);
                    }}
                    placeholder="00"
                    aria-label="Decimal part"
                  />
                </div>
              </Field>
              <Field label={tr("Currency")} required>
                <ThemedSelect
                  value={form.currency}
                  options={currencyOptions}
                  placeholder={tr("Select currency")}
                  onChange={(value) =>
                    value && setForm({ ...form, currency: value })
                  }
                />
              </Field>
              <Field label={tr("Date")} required>
                <DatePicker
                  value={form.transaction_date}
                  onChange={(value) =>
                    setForm({ ...form, transaction_date: value })
                  }
                />
              </Field>
              <Field label={tr("Time")} required>
                <TimePicker
                  value={form.transaction_time}
                  onChange={(value) =>
                    setForm({ ...form, transaction_time: value })
                  }
                />
              </Field>
              <Field label={tr("Category")} required>
                <ThemedSelect
                  value={form.category}
                  options={[
                    ...categories[form.kind],
                    ...(form.category && !categories[form.kind].includes(form.category)
                      ? [form.category]
                      : []),
                  ].map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(value) => {
                    if (!value) return;
                    const allowsText = transactionOptions.some(
                      (item) =>
                        item.option_type === `${form.kind}_category` &&
                        item.value === value &&
                        item.optional_text_enabled,
                    );
                    if (!allowsText) setOtherCategory("");
                    setForm({ ...form, category: value });
                  }}
                />
              </Field>
              {categoryAllowsText ? (
                <Field label={tr("Additional category details")} hint={tr("Optional")} inlineHint>
                  <Input
                    maxLength={60}
                    value={otherCategory}
                    onChange={(event) => setOtherCategory(event.target.value)}
                    placeholder={tr("Enter optional details")}
                  />
                </Field>
              ) : null}
              <Field
                className="full"
                label={tr("Sync with bank account")}
                hint={tr("Optional")}
                inlineHint
              >
                <ThemedSelect
                  value={form.linked_account_id ?? ""}
                  disabled={Boolean(editing?.transfer_id)}
                  clearable
                  options={accounts
                    .filter((item) => item.id !== (form.account_id ?? accountId))
                    .map((item) => ({
                      value: item.id,
                      disabled: item.currency !== form.currency,
                      label: item.account_number
                        ? `${item.name} · ${item.currency} · ${item.account_number}`
                        : `${item.name} · ${item.currency} · ${tr("No account number")}`,
                    }))}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      linked_account_id: value || null,
                      linked_transaction_id: null,
                    })
                  }
                  placeholder={tr("No linked account")}
                />
              </Field>
              {form.linked_account_id ? (
                <Field
                  className="full"
                  label={tr("Linked transaction record")}
                  hint={tr("Select the matching record from that account")}
                >
                  {editing?.transfer_id ? (
                    <div className="linked-transaction-view">
                      <Input
                        readOnly
                        value={(() => {
                          const linked = syncRows.find(
                            (candidate) => candidate.id === form.linked_transaction_id,
                          );
                          return linked
                            ? `${linked.transaction_date} ${linked.transaction_time.slice(0, 5)} · ${tr(linked.kind === "income" ? "Income" : "Expense")} · ${money(linked.amount_cents, linked.currency)} · ${linked.description}`
                            : tr("Linked record not available");
                        })()}
                      />
                      <Btn
                        type="button"
                        variant="outline"
                        icon={<Eye size={16} />}
                        disabled={!form.linked_transaction_id}
                        onClick={() =>
                          setPreviewTransaction(
                            syncRows.find(
                              (candidate) => candidate.id === form.linked_transaction_id,
                            ) ?? null,
                          )
                        }
                      >
                        {tr("Preview")}
                      </Btn>
                    </div>
                  ) : (
                    <div className="linked-transaction-view">
                      <ThemedSelect
                        value={form.linked_transaction_id ?? ""}
                        clearable
                        options={syncRows
                          .filter(
                            (candidate) =>
                              candidate.id !== editing?.id &&
                              candidate.account_id === form.linked_account_id &&
                              !candidate.transfer_id,
                          )
                          .map((candidate) => ({
                            value: candidate.id,
                            disabled: candidate.currency !== form.currency,
                            label: `${candidate.transaction_date} ${candidate.transaction_time.slice(0, 5)} · ${tr(candidate.kind === "income" ? "Income" : "Expense")} · ${money(candidate.amount_cents, candidate.currency)} · ${candidate.description}`,
                          }))}
                        onChange={(value) =>
                          setForm({
                            ...form,
                            linked_transaction_id: value || null,
                          })
                        }
                        placeholder={tr("Select transaction record")}
                      />
                      <Btn
                        type="button"
                        variant="outline"
                        icon={<Eye size={16} />}
                        disabled={!form.linked_transaction_id}
                        onClick={() =>
                          setPreviewTransaction(
                            syncRows.find(
                              (candidate) => candidate.id === form.linked_transaction_id,
                            ) ?? null,
                          )
                        }
                      >
                        {tr("Preview")}
                      </Btn>
                    </div>
                  )}
                </Field>
              ) : null}
              <Field
                className="full"
                label={
                  <>
                    {tr("Note")}
                    <small className="ui-field-inline-hint"> ({tr("Optional")})</small>
                  </>
                }
                hint={tr("Up to 500 characters")}
                inlineHint
              >
                <Textarea
                  maxLength={500}
                  rows={3}
                  value={form.note ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                  placeholder={tr("Add any useful detail")}
                />
              </Field>
              </div>
              <section className="expense-details">
                <div className="expense-details-head">
                  <div>
                  </div>
                </div>
                <div className="expense-details-grid">
                  <Field
                    label={tr(form.kind === "income" ? "Paid from" : "Paid to")}
                    hint={tr("Optional")}
                    inlineHint
                  >
                    <Input
                      maxLength={120}
                      value={form.paid_to ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, paid_to: event.target.value })
                      }
                      placeholder={tr(
                        form.kind === "income"
                          ? "Person, company, or income source"
                          : "Person, shop, or company",
                      )}
                    />
                  </Field>
                  <Field label={tr("Channel")} hint={tr("Optional")} inlineHint>
                    <ThemedSelect
                      value={form.payment_channel ?? ""}
                      options={[
                        ...paymentChannels,
                        ...(form.payment_channel &&
                        !paymentChannels.some(
                          (option) => option.value === form.payment_channel,
                        )
                          ? [{ value: form.payment_channel, label: form.payment_channel }]
                          : []),
                      ]}
                      onChange={(value) => {
                        const allowsText = transactionOptions.some(
                          (item) =>
                            item.option_type === "payment_channel" &&
                            item.value === value &&
                            item.optional_text_enabled,
                        );
                        if (!allowsText) setOtherChannel("");
                        setForm({ ...form, payment_channel: value });
                      }}
                      placeholder={tr("Select payment channel")}
                    />
                  </Field>
                  {channelAllowsText ? (
                    <Field label={tr("Additional channel details")} hint={tr("Optional")} inlineHint>
                      <Input
                        maxLength={120}
                        value={otherChannel}
                        onChange={(event) => setOtherChannel(event.target.value)}
                        placeholder={tr("Enter optional details")}
                      />
                    </Field>
                  ) : null}
                  <Field
                    label={tr(
                      form.kind === "income"
                        ? "Source account / PromptPay"
                        : "Destination account / PromptPay",
                    )}
                    hint={tr("Optional")}
                    inlineHint
                  >
                    <Input
                      maxLength={120}
                      value={form.promptpay_to ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, promptpay_to: event.target.value })
                      }
                      placeholder="Phone number, PromptPay ID, or account"
                    />
                  </Field>
                  <Field
                    className="full"
                    label={tr("Merchant ID")}
                    hint={tr("Optional")}
                    inlineHint
                  >
                    <Input
                      maxLength={120}
                      value={form.merchant_id ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, merchant_id: event.target.value })
                      }
                      placeholder={tr("Merchant ID, terminal ID, or POS reference")}
                    />
                  </Field>
                  <Field
                    className="full"
                    label={tr("Shop ID")}
                    hint={tr("Optional")}
                    inlineHint
                  >
                    <Input
                      maxLength={120}
                      value={form.shop_id ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, shop_id: event.target.value })
                      }
                      placeholder={tr("Shop ID, branch ID, or store reference")}
                    />
                  </Field>
                  <div className="ui-field full transaction-references-field">
                    <div className="transaction-reference-heading">
                      <span>
                        <strong>
                          {tr("Transaction reference")}
                          <small className="ui-field-inline-hint"> ({tr("Optional")})</small>
                        </strong>
                      </span>
                      {transactionReferences().length < 20 ? (
                        <Btn
                          type="button"
                          variant="outline"
                          icon={<Plus />}
                          onClick={addTransactionReference}
                        >
                          {tr("Add reference")}
                        </Btn>
                      ) : null}
                    </div>
                    <div className="transaction-reference-list">
                      {transactionReferences().map((reference, index) => (
                        <div key={index}>
                          <Input
                            maxLength={120}
                            value={reference}
                            onChange={(event) =>
                              updateTransactionReference(index, event.target.value)
                            }
                            placeholder={tr("Bank reference, PromptPay reference, receipt number…")}
                          />
                          {transactionReferences().length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeTransactionReference(index)}
                              aria-label={tr("Remove reference")}
                              title={tr("Remove reference")}
                            >
                              <X />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
            <div className="modal-actions transaction-modal-actions">
              {!editing && !transferMode ? (
                <Btn
                  type="button"
                  variant="ghost"
                  icon={<Eraser />}
                  onClick={() => setPendingDraftAction("clear")}
                >
                  {tr("Clear all information")}
                </Btn>
              ) : <span />}
              <div className="modal-action-right">
                <Btn type="button" variant="outline" onClick={cancelForm}>
                  {tr("Cancel")}
                </Btn>
                <Btn loading={saving}>
                  {editing
                    ? tr("Save changes")
                    : transferMode
                      ? tr("Send money")
                      : tr("Add transaction")}
                </Btn>
              </div>
            </div>
          </form>
        </div>
      ) : null}
      {pendingDraftAction ? (
        <div className="modal-backdrop draft-confirm-backdrop">
          <section className="confirm-dialog" role="alertdialog" aria-modal="true">
            <div className="confirm-icon"><FileText /></div>
            <div className="confirm-copy">
              <h3>
                {tr(
                  pendingDraftAction === "clear"
                    ? "Clear all information?"
                    : "Close this draft?",
                )}
              </h3>
              <p>
                {tr(
                  pendingDraftAction === "clear"
                    ? "All information in this draft will be permanently cleared."
                    : "Your draft is saved on this device and will be restored when you open Add transaction again.",
                )}
              </p>
            </div>
            <div className="confirm-actions">
              <Btn variant="outline" onClick={() => setPendingDraftAction(null)}>
                {tr("Keep editing")}
              </Btn>
              <Btn
                variant={pendingDraftAction === "clear" ? "danger" : "primary"}
                onClick={() => {
                  if (pendingDraftAction === "clear") clearTransactionForm();
                  else {
                    writeDraft(
                      form,
                      amountWhole,
                      amountDec,
                      otherCategory,
                      otherChannel,
                    );
                    setPendingDraftAction(null);
                    setFormOpen(false);
                  }
                }}
              >
                {tr(
                  pendingDraftAction === "clear"
                    ? "Clear all information"
                    : "Save draft and close",
                )}
              </Btn>
            </div>
          </section>
        </div>
      ) : null}
      {previewTransaction ? (
        <div
          className="modal-backdrop linked-preview-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewTransaction(null);
          }}
        >
          <section
            className="modal linked-transaction-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="linked-preview-title"
          >
            <div className="modal-head">
              <div>
                <p className="section-kicker">{tr("LINKED RECORD")}</p>
                <h2 id="linked-preview-title">{tr("Transaction preview")}</h2>
              </div>
              <Btn
                type="button"
                variant="outline"
                className="icon-only"
                onClick={() => setPreviewTransaction(null)}
                icon={<X />}
              />
            </div>
            <dl className="linked-preview-grid">
              <div>
                <dt>{tr("Bank account")}</dt>
                <dd>
                  {accounts.find((item) => item.id === previewTransaction.account_id)?.name ??
                    tr("Account not available")}
                </dd>
              </div>
              <div>
                <dt>{tr("Type")}</dt>
                <dd>{tr(previewTransaction.kind === "income" ? "Income" : "Expense")}</dd>
              </div>
              <div>
                <dt>{tr("Amount")}</dt>
                <dd>{money(previewTransaction.amount_cents, previewTransaction.currency)}</dd>
              </div>
              <div>
                <dt>{tr("Date & time")}</dt>
                <dd>
                  {previewTransaction.transaction_date}{" "}
                  {previewTransaction.transaction_time.slice(0, 5)}
                </dd>
              </div>
              <div>
                <dt>{tr("Category")}</dt>
                <dd>{previewTransaction.category}</dd>
              </div>
              <div className="full">
                <dt>{tr("Description")}</dt>
                <dd>{previewTransaction.description}</dd>
              </div>
              {previewTransaction.transaction_reference ? (
                <div className="full">
                  <dt>{tr("Transaction reference")}</dt>
                  <dd className="transaction-reference-preview">
                    {previewTransaction.transaction_reference
                      .split("\n")
                      .filter(Boolean)
                      .map((reference, index) => (
                        <span key={`${index}-${reference}`}>{reference}</span>
                      ))}
                  </dd>
                </div>
              ) : null}
              {previewTransaction.note ? (
                <div className="full">
                  <dt>{tr("Note")}</dt>
                  <dd>{previewTransaction.note}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}
