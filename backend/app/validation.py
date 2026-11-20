"""Parsing and validation helpers shared by the API, CSV import and backup restore."""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import request

from .errors import APIError, ValidationError
from .models import TYPES

MAX_AMOUNT_CENTS = 10_000_000_000  # CHF 100 Mio.
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
ICON_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SWISS_DATE_RE = re.compile(r"^\d{1,2}\.\d{1,2}\.\d{4}$")

TYPE_ALIASES = {
    "income": "income",
    "einnahme": "income",
    "einnahmen": "income",
    "expense": "expense",
    "ausgabe": "expense",
    "ausgaben": "expense",
}


def parse_date(value, allow_swiss: bool = False) -> date:
    """Parse YYYY-MM-DD (and DD.MM.YYYY if allowed). Raises ValueError with a German message."""
    if not isinstance(value, str):
        raise ValueError("Datum fehlt oder ist ungültig.")
    value = value.strip()
    try:
        if ISO_DATE_RE.match(value):
            parsed = date.fromisoformat(value)
        elif allow_swiss and SWISS_DATE_RE.match(value):
            parsed = datetime.strptime(value, "%d.%m.%Y").date()
        else:
            raise ValueError
    except ValueError:
        expected = "TT.MM.JJJJ oder JJJJ-MM-TT" if allow_swiss else "JJJJ-MM-TT"
        raise ValueError(f"Ungültiges Datum (erwartet {expected}).") from None
    if not 1900 <= parsed.year <= 2100:
        raise ValueError("Datum liegt ausserhalb des erlaubten Bereichs.")
    return parsed


def parse_amount_cents(value) -> int:
    """Validate an integer amount in Rappen."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("Betrag muss eine ganze Zahl in Rappen sein.")
    if value <= 0:
        raise ValueError("Betrag muss grösser als 0 sein.")
    if value > MAX_AMOUNT_CENTS:
        raise ValueError("Betrag ist zu gross.")
    return value


def parse_amount_text(value) -> int:
    """Parse a human-entered amount like '1'234.50', '12,50' or 'CHF 99' into Rappen."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Betrag fehlt.")
    cleaned = value.strip().upper().replace("CHF", "").replace("FR.", "")
    cleaned = re.sub(r"[\s'’]", "", cleaned)
    if "," in cleaned and "." in cleaned:
        # The separator appearing last is the decimal separator.
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    else:
        cleaned = cleaned.replace(",", ".")
    if not re.fullmatch(r"-?\d+(\.\d{1,2})?", cleaned):
        raise ValueError("Ungültiger Betrag (max. 2 Nachkommastellen).")
    try:
        cents = int((Decimal(cleaned) * 100).to_integral_value())
    except InvalidOperation:
        raise ValueError("Ungültiger Betrag.") from None
    return parse_amount_cents(cents)


def parse_type(value) -> str:
    if isinstance(value, str):
        normalized = TYPE_ALIASES.get(value.strip().lower())
        if normalized:
            return normalized
    raise ValueError("Typ muss 'income' (Einnahme) oder 'expense' (Ausgabe) sein.")


def clean_text(value, field_label: str, max_length: int, required: bool = True) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ValueError(f"{field_label} ist erforderlich.")
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field_label} muss Text sein.")
    value = value.strip()
    if len(value) > max_length:
        raise ValueError(f"{field_label} darf höchstens {max_length} Zeichen lang sein.")
    return value


def parse_color(value) -> str:
    if not isinstance(value, str) or not HEX_COLOR_RE.match(value.strip()):
        raise ValueError("Farbe muss ein HEX-Wert wie #22c55e sein.")
    return value.strip().lower()


def parse_icon(value) -> str:
    if not isinstance(value, str) or len(value) > 50 or not ICON_RE.match(value.strip()):
        raise ValueError("Ungültiger Icon-Bezeichner.")
    return value.strip()


def get_json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIError("Es wird ein JSON-Objekt erwartet.", 400, "invalid_json")
    return data


def collect(fields: dict) -> dict:
    """Run a dict of {field: callable} validators and raise one ValidationError with all messages."""
    result, errors = {}, {}
    for field, validator in fields.items():
        try:
            result[field] = validator()
        except ValueError as exc:
            errors[field] = str(exc)
    if errors:
        raise ValidationError(errors)
    return result


def query_int(name: str, default: int | None = None, minimum: int | None = None, maximum: int | None = None):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValidationError({name: "Muss eine ganze Zahl sein."}) from None
    if minimum is not None and value < minimum:
        raise ValidationError({name: f"Muss mindestens {minimum} sein."})
    if maximum is not None and value > maximum:
        value = maximum
    return value


def query_date(name: str) -> date | None:
    raw = request.args.get(name)
    if not raw:
        return None
    try:
        return parse_date(raw)
    except ValueError as exc:
        raise ValidationError({name: str(exc)}) from None


def query_type(name: str = "type") -> str | None:
    raw = request.args.get(name)
    if not raw:
        return None
    if raw not in TYPES:
        raise ValidationError({name: "Muss 'income' oder 'expense' sein."})
    return raw
