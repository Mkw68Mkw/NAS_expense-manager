# Expense Manager

Lightweight, self-hosted personal expense manager (German UI, CHF) running with Docker Compose.
Built for local use first and later deployment on a UGREEN DXP2800 NAS (Intel N100, 8 GB RAM).

- **Frontend:** React, Vite, TypeScript (strict), Tailwind CSS v4, shadcn/ui (Radix), Lucide, Recharts, TanStack Table, date-fns
- **Backend:** Python 3.12, Flask, Flask-SQLAlchemy, SQLite (WAL), Gunicorn
- **Infrastructure:** Nginx serves the static build and proxies `/api` to Flask; SQLite lives in a named Docker volume

```text
expense-manager/
├── backend/              Flask API, models, migrations, tests, Dockerfile
│   ├── app/
│   │   ├── __init__.py   App factory, health check
│   │   ├── database.py   SQLite pragmas, schema migrations, default categories
│   │   ├── models.py     Category, Transaction, AppSetting
│   │   ├── validation.py Shared parsing/validation (dates, Rappen amounts, …)
│   │   ├── errors.py     Central JSON error handling
│   │   └── routes/       transactions, categories, reports, data (CSV, backup, demo, settings)
│   └── tests/            pytest suite
├── frontend/             React app, Nginx config, multi-stage Dockerfile
├── docker-compose.yml
└── .env.example
```

## Quick start

Requirements: Docker Engine with the Compose plugin (Docker Desktop is not required).

```bash
cd expense-manager
cp .env.example .env        # optional – all values have defaults
docker compose up --build -d
```

Open **http://localhost:3000**. The API is available at **http://localhost:3000/api** (e.g. `/api/health`).

On first start the database is created and the default categories are seeded. The database is empty
otherwise; use *Einstellungen → Demo-Daten laden* to add sample transactions (only possible while
no transactions exist).

Useful commands:

```bash
docker compose ps                 # status incl. health
docker compose logs -f backend    # backend logs
docker compose down               # stop (data is kept)
docker compose up --build -d      # update after code changes (data is kept)
```

## Features

- **Dashboard:** income, expenses, balance, savings rate (with change vs. previous period); income vs.
  expenses chart, expense donut by category, spending trend, top categories. Period filter: current month,
  last month, last 3 months, current year, custom range.
- **Transactions:** create/edit/delete, server-side search, filters (type, category, date range, amount
  range), sorting (date, amount, description, category), pagination, bulk delete, CSV import with preview
  and row-level errors, CSV export of the current filter.
- **Categories:** stored in SQLite, custom name/type/color/icon (curated Lucide set)/description. Deleting
  a category that is in use requires reassigning its transactions to another category of the same type.
- **Reports:** KPIs incl. average daily spending, monthly income/expenses with net cash-flow line,
  cumulative cash flow, comparison table with previous period, category distribution (income or expenses),
  stacked monthly trends by category, largest expenses, monthly overview table.
- **Settings:** light/dark/system theme, currency (CHF only), JSON backup export/import, demo data,
  delete all data (requires typing `LÖSCHEN`).

### Data rules

- Amounts are stored as **integer Rappen** (`amount_cents`), never as floats. Amounts are always
  positive; the `type` (`income`/`expense`) determines the direction.
- A transaction's category must have the same type as the transaction.
- "Previous period": for whole calendar months the same number of preceding months, otherwise the
  equally long range immediately before. Savings rate and changes are `null` (shown as "–") when the
  base is zero, so there is never a division by zero.

### CSV format

Export (UTF-8 with BOM, `;` separator, opens directly in Excel):

```text
Datum;Beschreibung;Betrag;Typ;Kategorie;Notizen
01.03.2026;Migros Einkauf;95.45;Ausgabe;Lebensmittel;
25.03.2026;Lohn Muster AG;7120.00;Einnahme;Lohn;
```

Import accepts `;`, `,` or tab separators, UTF-8 (with/without BOM) or Windows-1252, dates as
`TT.MM.JJJJ` or `JJJJ-MM-TT`, amounts like `1'234.50`, `1234,50` or `CHF 12`, type `Einnahme`/`Ausgabe`
(or `income`/`expense`). English headers (`date, description, amount, type, category, notes`) work too.
Categories must already exist. The preview flags invalid rows; identical rows within the same file are
imported only once. Max. 10 000 rows per file.

### Backup format

`GET /api/backup` returns a versioned JSON document (`"format": "expense-manager-backup", "version": 1`)
containing all categories, transactions and settings. `POST /api/restore` validates the whole document
first and then replaces all data in a single database transaction – an invalid backup changes nothing.

## SQLite persistence

- The database file is `/app/data/expenses.db` inside the backend container.
- `/app/data` is the named Docker volume `expense-manager_expense-data`, so the data survives
  container restarts, rebuilds and `docker compose down`.
- **Only `docker compose down -v` (or `docker volume rm …`) deletes the data.**
- Schema migrations run once at container start (`python -m app.init_db`) before Gunicorn starts.
  Applied migrations are tracked in the `schema_migrations` table; existing data is never reset.
  Default categories are seeded only once per database (tracked in `app_settings`).
- SQLite runs with `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`.

Backing up the raw volume (in addition to the in-app JSON backup):

```bash
docker compose stop backend
docker run --rm -v expense-manager_expense-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/expenses-volume-$(date +%F).tar.gz -C /data .
docker compose start backend
```

## Security & deployment scope

This is a **private single-user app without authentication**. Anyone who can reach port 3000 can read,
change and delete all financial data.

- Do **not** expose it to the public internet and do **not** set up router port forwarding.
- No telemetry, analytics, external fonts or third-party services are used; all data stays in SQLite.
- The backend has no published port; it is only reachable through the frontend's Nginx proxy.

### Restricting access (localhost / Tailscale)

By default the UI is published on all host interfaces (`APP_BIND_ADDRESS=0.0.0.0`), i.e. reachable
from every network the host is connected to (LAN, Tailscale, …). Restrict it to trusted clients:

- **Local testing only:** `APP_BIND_ADDRESS=127.0.0.1` in `.env`.
- **Tailscale only:** set `APP_BIND_ADDRESS` to the NAS's Tailscale IP (`tailscale ip -4`, e.g.
  `100.x.y.z`). Note that this IP must exist when the container starts.

Installing Tailscale alone does **not** restrict Docker-published ports: a port published on `0.0.0.0`
remains reachable from the LAN as well, and Docker's port publishing can bypass host firewall rules
(e.g. `ufw`). Use the bind address above and/or Tailscale ACLs and your LAN firewall to limit who can
connect. Treat everyone who can reach the port as having full access.

## Deployment on the UGREEN DXP2800

1. Copy the `expense-manager` folder to the NAS (e.g. via SMB, `git clone` or `scp`).
2. Connect via SSH (or use the UGOS Docker app's "Project/Compose" feature with this
   `docker-compose.yml`).
3. Create `.env` from `.env.example` and set `APP_BIND_ADDRESS` (see above).
4. `docker compose up --build -d`
5. Open `http://<nas-tailscale-ip>:3000`.

The images are built on the NAS itself (x86-64), so no registry is needed. Resource usage is small
(Nginx + 2 Gunicorn workers); `GUNICORN_WORKERS`/`GUNICORN_THREADS` can be adjusted in `.env`.

## Development

Backend tests (run in a Python 3.12 container, no local Python needed):

```bash
docker run --rm -v "$PWD/backend:/src" -w /src python:3.12-slim \
  sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q -p no:cacheprovider"
```

Local development without Docker:

```bash
# Backend (Python 3.12)
cd backend
pip install -r requirements.txt
DATABASE_PATH=./data/expenses.db flask --app app:create_app run --port 5000   # create ./data first

# Frontend (Node 20.19+), proxies /api to localhost:5000
cd frontend
npm install
npm run dev
```

`npm run build` runs the strict TypeScript check and the production build.

## API overview

All responses are JSON: success `{"data": …, "meta"?: …}`, errors `{"error": {"code", "message", "details"?}}`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check incl. database |
| GET/POST | `/api/transactions` | List (filters: `search, type, category_id, date_from, date_to, amount_min, amount_max, sort, order, page, page_size`) / create |
| GET/PUT/DELETE | `/api/transactions/:id` | Read / update / delete |
| POST | `/api/transactions/bulk-delete` | `{"ids": [...]}` |
| GET/POST | `/api/categories` | List (incl. `transaction_count`) / create |
| PUT/DELETE | `/api/categories/:id` | Update / delete (`?reassign_to=<id>` if in use) |
| GET | `/api/reports/summary` | Totals, savings rate, avg. daily spending, previous period, largest expenses |
| GET | `/api/reports/monthly` | Time series (`granularity=month|day`) |
| GET | `/api/reports/categories` | Category distribution (`type`, `include_monthly=1`) |
| POST | `/api/import/csv` | Multipart `file`; `?mode=preview` (default) or `?mode=commit` |
| GET | `/api/export/csv` | CSV export (same filters as the list) |
| GET | `/api/backup` | JSON backup |
| POST | `/api/restore` | Restore JSON backup (replaces all data) |
| POST | `/api/demo` | Load demo data (empty database only) |
| DELETE | `/api/data?confirm=true` | Delete all data, re-seed default categories |
| GET/PUT | `/api/settings` | Currency (CHF only) |

Amounts in the API are integer Rappen (`amount_cents`), dates are `YYYY-MM-DD`.

## Limitations

- Single user, no authentication, CHF only (no currency conversion).
- CSV import does not detect duplicates against transactions that already exist in the database –
  only duplicates within the uploaded file are skipped. Unknown categories are reported as errors
  rather than created automatically.
- No recurring transactions, budgets or attachments.
- Theme preference is stored per browser (localStorage), not in the database.
