"""CSV import/export, JSON backup/restore, demo data, full reset and settings."""

import csv
import io
import logging
import random
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, Response, request
from sqlalchemy import delete, func, select

from ..database import SEEDED_KEY, DEFAULT_CATEGORIES, seed_default_categories
from ..errors import APIError, ValidationError
from ..extensions import db
from ..models import AppSetting, Category, Transaction, utcnow
from ..validation import (
    clean_text,
    get_json_body,
    parse_amount_cents,
    parse_amount_text,
    parse_color,
    parse_date,
    parse_icon,
    parse_type,
)
from . import ok
from .transactions import filtered_query

log = logging.getLogger(__name__)
bp = Blueprint("data", __name__, url_prefix="/api")

MAX_CSV_ROWS = 10_000
BACKUP_FORMAT = "expense-manager-backup"
BACKUP_VERSION = 1
SUPPORTED_CURRENCIES = ["CHF"]
CSV_HEADERS = ["Datum", "Beschreibung", "Betrag", "Typ", "Kategorie", "Notizen"]
TYPE_LABELS = {"income": "Einnahme", "expense": "Ausgabe"}
HEADER_ALIASES = {
    "datum": "date",
    "date": "date",
    "beschreibung": "description",
    "description": "description",
    "betrag": "amount",
    "amount": "amount",
    "typ": "type",
    "type": "type",
    "kategorie": "category",
    "category": "category",
    "notizen": "notes",
    "notiz": "notes",
    "notes": "notes",
}
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


# ---- CSV ------------------------------------------------------------------


def csv_safe(value: str) -> str:
    """Prevent spreadsheet formula injection when the export is opened in Excel."""
    return "'" + value if value and value.startswith(FORMULA_PREFIXES) else value


def csv_unsafe(value: str) -> str:
    return value[1:] if value.startswith("'") and value[1:2] in FORMULA_PREFIXES else value


def format_amount(cents: int) -> str:
    return f"{cents // 100}.{cents % 100:02d}"


def decode_upload(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


@bp.get("/export/csv")
def export_csv():
    query = filtered_query().order_by(None).order_by(Transaction.date.asc(), Transaction.id.asc())
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(CSV_HEADERS)
    for t in db.session.scalars(query):
        writer.writerow(
            [
                t.date.strftime("%d.%m.%Y"),
                csv_safe(t.description),
                format_amount(t.amount_cents),
                TYPE_LABELS[t.type],
                csv_safe(t.category.name),
                csv_safe(t.notes or ""),
            ]
        )
    filename = f"transaktionen_{date.today().isoformat()}.csv"
    return Response(
        "\ufeff" + buffer.getvalue(),
        content_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def read_csv_rows(text: str) -> list[dict]:
    sample = text[:4096]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
    except csv.Error:
        delimiter = ";"
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration:
        raise APIError("Die CSV-Datei ist leer.", 400, "empty_file") from None

    columns = [HEADER_ALIASES.get(h.strip().lower()) for h in header]
    missing = [name for name in ("date", "description", "amount", "type", "category") if name not in columns]
    if missing:
        raise APIError(
            "Fehlende Spalten. Erwartet werden: Datum, Beschreibung, Betrag, Typ, Kategorie (optional Notizen).",
            400,
            "invalid_csv_header",
        )

    rows = []
    for line_number, values in enumerate(reader, start=2):
        if not any(v.strip() for v in values):
            continue
        if len(rows) >= MAX_CSV_ROWS:
            raise APIError(f"Maximal {MAX_CSV_ROWS} Zeilen pro Import erlaubt.", 400, "too_many_rows")
        row = {col: csv_unsafe(values[i].strip()) for i, col in enumerate(columns) if col and i < len(values)}
        rows.append({"line": line_number, "raw": row})
    return rows


@bp.post("/import/csv")
def import_csv():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        raise APIError("Bitte eine CSV-Datei hochladen.", 400, "missing_file")
    commit = request.args.get("mode", "preview") == "commit"
    rows = read_csv_rows(decode_upload(upload.read()))

    categories = {(c.name.lower(), c.type): c for c in db.session.scalars(select(Category))}
    seen: set[tuple] = set()
    results, to_insert = [], []

    for row in rows:
        raw, errors, parsed = row["raw"], {}, {}
        for field, parse in (
            ("date", lambda: parse_date(raw.get("date"), allow_swiss=True)),
            ("description", lambda: clean_text(raw.get("description"), "Beschreibung", 200)),
            ("amount_cents", lambda: parse_amount_text(raw.get("amount"))),
            ("type", lambda: parse_type(raw.get("type"))),
            ("notes", lambda: clean_text(raw.get("notes"), "Notizen", 2000, required=False)),
        ):
            try:
                parsed[field] = parse()
            except ValueError as exc:
                errors[field] = str(exc)

        category_name = (raw.get("category") or "").strip()
        category = categories.get((category_name.lower(), parsed.get("type")))
        if not category_name:
            errors["category"] = "Kategorie ist erforderlich."
        elif "type" in parsed and category is None:
            errors["category"] = f"Kategorie «{category_name}» existiert nicht für diesen Typ."

        duplicate = False
        if not errors:
            parsed["category_id"] = category.id
            key = (parsed["date"], parsed["description"].lower(), parsed["amount_cents"], parsed["type"], category.id)
            duplicate = key in seen
            seen.add(key)
            if not duplicate:
                to_insert.append(parsed)

        results.append(
            {
                "line": row["line"],
                "date": parsed["date"].isoformat() if "date" in parsed else raw.get("date"),
                "description": parsed.get("description", raw.get("description")),
                "amount_cents": parsed.get("amount_cents"),
                "type": parsed.get("type"),
                "category": category_name,
                "notes": parsed.get("notes"),
                "errors": errors,
                "duplicate": duplicate,
            }
        )

    imported = 0
    if commit and to_insert:
        db.session.add_all(Transaction(**values) for values in to_insert)
        db.session.commit()
        imported = len(to_insert)

    invalid = sum(1 for r in results if r["errors"])
    duplicates = sum(1 for r in results if r["duplicate"])
    return ok(
        {
            "rows": results,
            "summary": {
                "total": len(results),
                "valid": len(results) - invalid - duplicates,
                "invalid": invalid,
                "duplicates": duplicates,
                "imported": imported,
            },
        }
    )


# ---- Backup / restore -----------------------------------------------------


def parse_timestamp(value) -> datetime:
    if value is None:
        return utcnow()
    if not isinstance(value, str):
        raise ValueError("Ungültiger Zeitstempel.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("Ungültiger Zeitstempel.") from None
    return parsed if parsed.tzinfo is None else parsed.astimezone(timezone.utc).replace(tzinfo=None)


def positive_int(value) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("Ungültige ID.")
    return value


@bp.get("/backup")
def backup():
    data = {
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "exported_at": utcnow().isoformat(timespec="seconds") + "Z",
        "currency": "CHF",
        "data": {
            "categories": [c.to_dict() for c in db.session.scalars(select(Category).order_by(Category.id))],
            "transactions": [
                {k: v for k, v in t.to_dict().items() if k != "category"}
                for t in db.session.scalars(select(Transaction).order_by(Transaction.id))
            ],
            "settings": {
                s.key: s.value for s in db.session.scalars(select(AppSetting)) if s.key != SEEDED_KEY
            },
        },
    }
    response = ok(data)[0]
    response.headers["Content-Disposition"] = f'attachment; filename="expense-manager-backup_{date.today().isoformat()}.json"'
    return response


def validate_backup(payload: dict) -> tuple[list[Category], list[Transaction], list[AppSetting]]:
    """Validate the complete backup before touching the database."""
    if payload.get("format") != BACKUP_FORMAT:
        raise APIError("Die Datei ist kein gültiges Expense-Manager-Backup.", 422, "invalid_backup")
    if payload.get("version") != BACKUP_VERSION:
        raise APIError(f"Nicht unterstützte Backup-Version: {payload.get('version')}.", 422, "unsupported_version")
    data = payload.get("data")
    if not isinstance(data, dict) or not isinstance(data.get("categories"), list) or not isinstance(data.get("transactions"), list):
        raise APIError("Das Backup ist unvollständig.", 422, "invalid_backup")

    errors: dict[str, str] = {}
    categories, category_types, names = [], {}, set()
    for index, item in enumerate(data["categories"]):
        try:
            if not isinstance(item, dict):
                raise ValueError("Ungültiger Eintrag.")
            category = Category(
                id=positive_int(item.get("id")),
                name=clean_text(item.get("name"), "Name", 60),
                type=parse_type(item.get("type")),
                color=parse_color(item.get("color")),
                icon=parse_icon(item.get("icon")),
                description=clean_text(item.get("description"), "Beschreibung", 255, required=False),
                created_at=parse_timestamp(item.get("created_at")),
                updated_at=parse_timestamp(item.get("updated_at")),
            )
            if category.id in category_types:
                raise ValueError("Doppelte Kategorie-ID.")
            if (category.name.lower(), category.type) in names:
                raise ValueError("Doppelter Kategoriename.")
        except ValueError as exc:
            errors[f"categories[{index}]"] = str(exc)
            continue
        category_types[category.id] = category.type
        names.add((category.name.lower(), category.type))
        categories.append(category)

    transactions, transaction_ids = [], set()
    for index, item in enumerate(data["transactions"]):
        try:
            if not isinstance(item, dict):
                raise ValueError("Ungültiger Eintrag.")
            transaction = Transaction(
                id=positive_int(item.get("id")),
                date=parse_date(item.get("date")),
                description=clean_text(item.get("description"), "Beschreibung", 200),
                amount_cents=parse_amount_cents(item.get("amount_cents")),
                type=parse_type(item.get("type")),
                category_id=positive_int(item.get("category_id")),
                notes=clean_text(item.get("notes"), "Notizen", 2000, required=False),
                created_at=parse_timestamp(item.get("created_at")),
                updated_at=parse_timestamp(item.get("updated_at")),
            )
            if transaction.id in transaction_ids:
                raise ValueError("Doppelte Transaktions-ID.")
            if category_types.get(transaction.category_id) != transaction.type:
                raise ValueError("Kategorie fehlt oder passt nicht zum Typ.")
        except ValueError as exc:
            errors[f"transactions[{index}]"] = str(exc)
            if len(errors) >= 50:
                break
            continue
        transaction_ids.add(transaction.id)
        transactions.append(transaction)

    raw_settings = data.get("settings") or {}
    if not isinstance(raw_settings, dict):
        errors["settings"] = "Ungültige Einstellungen."
        raw_settings = {}
    settings = []
    for key, value in raw_settings.items():
        if key == "currency" and value not in SUPPORTED_CURRENCIES:
            errors["settings.currency"] = "Nicht unterstützte Währung."
        elif isinstance(key, str) and isinstance(value, str) and len(key) <= 50 and key != SEEDED_KEY:
            settings.append(AppSetting(key=key, value=value))

    if errors:
        raise ValidationError(errors, "Das Backup enthält ungültige Daten. Es wurde nichts verändert.")
    return categories, transactions, settings


def wipe_all_data() -> None:
    db.session.execute(delete(Transaction))
    db.session.execute(delete(Category))
    db.session.execute(delete(AppSetting))


@bp.post("/restore")
def restore():
    categories, transactions, settings = validate_backup(get_json_body())
    try:
        wipe_all_data()
        db.session.add_all(categories)
        db.session.flush()
        db.session.add_all(transactions)
        db.session.add_all(settings)
        db.session.add(AppSetting(key=SEEDED_KEY, value="true"))
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return ok({"categories": len(categories), "transactions": len(transactions)})


@bp.delete("/data")
def delete_all_data():
    if request.args.get("confirm") != "true":
        raise APIError("Löschen muss mit confirm=true bestätigt werden.", 400, "confirmation_required")
    wipe_all_data()
    db.session.flush()
    seed_default_categories()
    db.session.add(AppSetting(key=SEEDED_KEY, value="true"))
    db.session.commit()
    return ok({"reset": True})


# ---- Demo data ------------------------------------------------------------


def ensure_category(name: str, tx_type: str) -> Category:
    category = db.session.scalar(
        select(Category).where(func.lower(Category.name) == name.lower(), Category.type == tx_type)
    )
    if category is None:
        color, icon = next(((c, i) for n, t, c, i in DEFAULT_CATEGORIES if n == name and t == tx_type), ("#64748b", "circle"))
        category = Category(name=name, type=tx_type, color=color, icon=icon)
        db.session.add(category)
        db.session.flush()
    return category


@bp.post("/demo")
def load_demo_data():
    if db.session.scalar(select(func.count()).select_from(Transaction)):
        raise APIError(
            "Demo-Daten können nur in eine leere Datenbank geladen werden.", 409, "database_not_empty"
        )
    rng = random.Random(2800)
    today = date.today()
    entries: list[tuple[date, str, int, str, str]] = []

    for months_back in range(3, -1, -1):
        index = today.year * 12 + today.month - 1 - months_back
        first = date(index // 12, index % 12 + 1, 1)

        def day(n: int) -> date:
            return first + timedelta(days=n - 1)

        monthly = [
            (day(25), "Lohn Muster AG", 712_000, "income", "Lohn"),
            (day(1), "Miete Wohnung", 198_000, "expense", "Wohnen"),
            (day(3), "Krankenkasse Prämie", 41_250, "expense", "Gesundheit"),
            (day(5), "SBB Halbtax & Billette", rng.randint(6_000, 14_000), "expense", "Transport"),
            (day(8), "Netflix", 2_190, "expense", "Abonnements"),
            (day(8), "Spotify", 1_395, "expense", "Abonnements"),
            (day(12), "Swisscom Mobile", 4_990, "expense", "Abonnements"),
            (day(15), "Strom & Nebenkosten", rng.randint(9_000, 13_000), "expense", "Wohnen"),
        ]
        entries.extend(monthly)
        for week in range(4):
            entries.append((day(2 + week * 7), "Migros Einkauf", rng.randint(4_500, 13_500), "expense", "Lebensmittel"))
            entries.append((day(5 + week * 7), "Coop Einkauf", rng.randint(2_000, 8_000), "expense", "Lebensmittel"))
        for n in rng.sample(range(1, 28), 3):
            entries.append((day(n), rng.choice(["Pizzeria Da Mario", "Tibits", "Hiltl", "Café Sprüngli"]), rng.randint(2_500, 9_500), "expense", "Restaurants"))
        entries.append((day(rng.randint(10, 26)), rng.choice(["Galaxus Bestellung", "Zalando", "IKEA"]), rng.randint(3_000, 25_000), "expense", "Shopping"))
        entries.append((day(rng.randint(6, 26)), rng.choice(["Kino Pathé", "Hallenbad", "Konzertticket"]), rng.randint(1_800, 9_000), "expense", "Freizeit"))
        if months_back == 1:
            entries.append((day(18), "Rückerstattung Krankenkasse", 12_480, "income", "Rückerstattungen"))
        if months_back == 2:
            entries.append((day(20), "Geburtstagsgeschenk", 10_000, "income", "Geschenke"))

    created = 0
    for tx_date, description, amount, tx_type, category_name in entries:
        if tx_date > today:
            continue
        category = ensure_category(category_name, tx_type)
        db.session.add(Transaction(date=tx_date, description=description, amount_cents=amount, type=tx_type, category_id=category.id))
        created += 1
    db.session.commit()
    return ok({"created": created}, 201)


# ---- Settings -------------------------------------------------------------


def current_settings() -> dict:
    currency = db.session.get(AppSetting, "currency")
    return {"currency": currency.value if currency else "CHF", "supported_currencies": SUPPORTED_CURRENCIES}


@bp.get("/settings")
def get_settings():
    return ok(current_settings())


@bp.put("/settings")
def update_settings():
    data = get_json_body()
    currency = data.get("currency")
    if currency not in SUPPORTED_CURRENCIES:
        raise ValidationError({"currency": "Aktuell wird nur CHF unterstützt."})
    setting = db.session.get(AppSetting, "currency") or AppSetting(key="currency")
    setting.value = currency
    db.session.add(setting)
    db.session.commit()
    return ok(current_settings())
