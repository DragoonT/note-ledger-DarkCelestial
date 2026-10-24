# DarkCelestial · note-ledger

[English](README.md) · [ไทย](README-TH.md)

DarkCelestial is a personal, self-hosted money tracker. You write down what you earn and spend by hand — the app keeps a clean, searchable history of every note, organizes it by bank account, and shows you where your money goes.

It doesn't connect to your bank or scrape anything. Every record is entered by you, which means the history is exactly as accurate as you make it.

## Preview

**Ledger — transaction history you write yourself**

![Ledger preview](public/ledger.png)

**Bank accounts — balances built from your notes**

![Bank accounts preview](public/bank.png)

## Why DarkCelestial · note-ledger?

- **Manual by design** — no bank connections, no credentials to trust, no sync to break. You add each record yourself, so the history is a notebook you control.
- **History-first** — every entry keeps its date, time, description, category, payment details, and note, so old records stay readable years later.
- **Multi-account** — track several bank accounts side by side and see the total across all of them.
- **Multi-currency** — 10 currencies built in (USD, THB, EUR, GBP, JPY, CNY, KRW, SGD, AUD, CAD). Note: there is **no automatic currency conversion** — each record keeps its own currency, and totals are grouped per currency. If you change a record's currency later, the amount stays the same number; you must edit it manually.
- **Private & self-hosted** — your data lives in your own database. Nothing leaves your server.

## Features

### Ledger (Transactions)
- Add income and expense records with amount, currency, date, time, category, payment channel, and note
- Digit-only amount input: type the whole number and the decimals in separate boxes — no spinners, no auto-formatting
- Optional payment details: paid to/from, transaction references (multiple), Merchant ID, Shop ID, PromptPay, channel details
- Sync a record with a bank account to auto-create the mirrored record (expense ↔ income) on the other account — same description, amount, currency, date and time; the note stays yours to write
- Send money between your own accounts in one step
- Search, filter by type/year/month, and paginate; after saving, the list jumps to the record's page and highlights it
- Draft autosave: if you refresh or close the tab mid-entry, your form comes back
- Edit or delete any record; errors and toasts auto-dismiss after 3 seconds

### Bank accounts
- Create accounts with name, currency, account number, and card color/image
- Balances are computed from your records automatically
- Export/Import backups (JSON) for safekeeping
- Show/hide account numbers

### Dashboard
- Totals for money, income, and expenses
- Salary income vs. non-salary expenses breakdown
- Reports rendered per currency

### Money limits and calculation safety

> **Warning:** one transaction can contain at most **999,999,999,999.99** (12 whole-number digits and 2 decimal digits). The form blocks larger values instead of accepting a value that cannot be handled safely.

- Account balances, summary cards, dashboard totals, and chart tooltip amounts are calculated as exact integer cents with `BigInt`.
- Combined totals can exceed the single-transaction limit without losing cents.
- Chart shapes use floating-point coordinates for drawing only; the monetary values shown in cards, balances, and tooltips remain exact.

### General
- **English & Thai** interface — switch anytime from the top bar or the sign-in screen
- **Light / Dark / System theme** plus a custom accent color
- Admin mode to review all users' records
- Encrypted, password-protected backups
- Session timeout after 10 minutes of inactivity

## Tech stack

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend:** Rust (Axum + SQLx) with PostgreSQL
- **Deployment:** Docker Compose (api + db + web)

## Getting started

### Requirements

- **Docker** and **Docker Compose** (recommended — runs everything)

Or, to run without Docker:

- **Node.js** 20+ and **pnpm** 11+ — frontend build (Next.js 16, React 19)
- **Rust** stable 2024-edition toolchain — backend build
- **PostgreSQL** 14+ — database

### Run without Docker

With PostgreSQL already running and `DATABASE_URL` pointing to it:

- Terminal 1 — backend (from the project root)

```bash
cd backend
cargo run
```
- Terminal 2 — frontend (from the project root)

```bash
pnpm install
pnpm dev
```

The frontend expects the API at `http://localhost:8080` by default (set `NEXT_PUBLIC_API_URL` to override).

### 0. Create the database in your PostgreSQL

The app needs a running PostgreSQL server and a database named `pocket_ledger`. **pgAdmin is
optional**; it is only a graphical database-management tool and does not need to stay open while
the website runs.

Create the database using either pgAdmin or `psql`:

**pgAdmin 4 (Windows):**

1. Open **pgAdmin 4** from the Start menu and sign in with the password you set when installing PostgreSQL.
2. In the left tree, expand **Servers → PostgreSQL**.
3. Right-click **Databases → Create → Database…**
4. In the **Database** field, type `pocket_ledger`, then click **Save**.

**SQL Shell (`psql`, available on Windows, Linux, and macOS):**

1. On Windows, open **SQL Shell (psql)**. On Linux or macOS, open Terminal.
2. Connect as your PostgreSQL user (commonly `psql -U postgres`) and enter its password when asked.
3. Type this and press Enter:

   ```sql
   CREATE DATABASE pocket_ledger;
   ```

4. You should see `CREATE DATABASE` — the database now exists.

Keep your PostgreSQL user password handy — `DATABASE_URL` needs it.

Before starting the website on any operating system:

1. Start PostgreSQL itself. On Linux this is normally its system service; on macOS it may be a
   Homebrew service or Postgres.app. pgAdmin may be closed after the database is created.
2. Start Docker Desktop, or start Docker Engine and make sure `docker compose version` works.
3. Open a terminal in the project directory and run the launcher shown below for your operating
   system. It starts both website containers; the steps are otherwise the same on every platform.

### 1. Clone and configure

```bash
git clone https://github.com/DragoonT/note-ledger-DarkCelestial.git
cd note-ledger-DarkCelestial
```

`.env` is **not** committed to the repository. Create it in the project root:

```env
DATABASE_URL=postgres://postgres:URL_ENCODED_PASSWORD@host.docker.internal:5432/pocket_ledger
ADMIN_USERNAME=your_admin_username
PUBLIC_WEB_URL=http://localhost:3000
PUBLIC_API_URL=http://localhost:8080
```

Notes:
- Use `host.docker.internal` as the DB host if PostgreSQL runs on your host machine. Compose maps
  this name correctly on Linux as well as Docker Desktop for Windows and macOS.
- More users can be created later inside the app after signing in as admin.

### 2. Run with Docker (recommended)

Standard Docker Compose still works and uses fixed ports `3000` and `8080`:

```powershell
docker compose up -d --build
```

If either fixed port may already be in use, run the automatic launcher for your operating system:
- Windows PowerShell

```powershell
.\start.ps1
```

- Linux or macOS

```bash
bash ./start.sh
```

Normal startup reuses the existing images and does not force another build. After changing source
code, rebuild explicitly:

- Windows PowerShell

```powershell
.\start.ps1 -Build
```

- Linux or macOS

```bash
bash ./start.sh --build
```

This starts:
- `api` — the Rust backend (runs migrations automatically on start)
- `web` — the Next.js frontend

Plain `docker compose up` reports a port-binding error when `3000` or `8080` is occupied. The
automatic scripts use those ports when available; if either is already in use, they
automatically select the next free port, configure the frontend API URL and CORS origin, and
print both URLs. Existing containers from this project keep their current published ports.

Each automatic launcher also runs BuildKit cache maintenance with an 8 GB maximum. This prevents
repeated Rust and Next.js builds from accumulating tens of gigabytes. It never prunes containers,
volumes, database data, or project files. The plain `docker compose up -d --build` command remains
available, but it does not apply this project cache-retention step.

Then open the printed Web URL (default: `http://localhost:3000`).

### 3. Sign in as admin

There is no public registration.

1. Open the app and enter the same username configured in `ADMIN_USERNAME` (for example, `DragoonT`). Enter the administrator password you want to use; it must contain at least 12 characters. The first successful login creates `data/account.dragoont` inside the project and stores the encrypted account credential.
2. Change your password later in **Settings → Reset password**.
3. Create more users in the admin section of the app settings.

### 4. Start writing your history

1. Go to **Bank accounts** and add the accounts you want to track.
2. Go to **Transactions** and press **Add transaction** to record your first income or expense.
3. Use **Send money** when you move funds between your own accounts — both sides are recorded automatically.

## Backup & restore

- **Export** on the bank accounts page downloads a full dragoont(JSON) backup of accounts and transactions.
- **Import** restores a previously exported file (you'll confirm before anything is overwritten).

## Project structure

```
backend/           Rust API server (Axum, SQLx, PostgreSQL migrations)
src/               Next.js frontend (App Router)
  components/      UI components (ledger, accounts, settings, auth)
  lib/             API client, i18n catalogs
  locales/         English & Thai translations
public/            Static assets and preview images
```
