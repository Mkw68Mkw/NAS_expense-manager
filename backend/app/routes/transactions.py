from flask import Blueprint, request
from sqlalchemy import delete, func, select

from ..errors import APIError, NotFoundError, ValidationError
from ..extensions import db
from ..models import Category, Transaction
from ..validation import (
    clean_text,
    collect,
    get_json_body,
    parse_amount_cents,
    parse_date,
    parse_type,
    query_date,
    query_int,
    query_type,
)
from . import ok

bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")

SORT_COLUMNS = {
    "date": Transaction.date,
    "amount": Transaction.amount_cents,
    "description": func.lower(Transaction.description),
    "category": func.lower(Category.name),
}
MAX_BULK_DELETE = 10_000


def filtered_query():
    """Build a SELECT for transactions using the filter/sort query parameters."""
    query = select(Transaction).join(Category, Transaction.category_id == Category.id)

    search = (request.args.get("search") or "").strip()
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(Transaction.description.ilike(f"%{escaped}%", escape="\\"))

    tx_type = query_type()
    if tx_type:
        query = query.where(Transaction.type == tx_type)

    category_param = request.args.get("category_id")
    if category_param:
        try:
            category_ids = [int(part) for part in category_param.split(",") if part.strip()]
        except ValueError:
            raise ValidationError({"category_id": "Ungültige Kategorie-ID."}) from None
        query = query.where(Transaction.category_id.in_(category_ids))

    date_from, date_to = query_date("date_from"), query_date("date_to")
    if date_from:
        query = query.where(Transaction.date >= date_from)
    if date_to:
        query = query.where(Transaction.date <= date_to)

    amount_min = query_int("amount_min", minimum=0)
    amount_max = query_int("amount_max", minimum=0)
    if amount_min is not None:
        query = query.where(Transaction.amount_cents >= amount_min)
    if amount_max is not None:
        query = query.where(Transaction.amount_cents <= amount_max)

    sort = request.args.get("sort", "date")
    if sort not in SORT_COLUMNS:
        raise ValidationError({"sort": "Ungültige Sortierung."})
    column = SORT_COLUMNS[sort]
    descending = request.args.get("order", "desc") != "asc"
    order = column.desc() if descending else column.asc()
    tiebreak = Transaction.id.desc() if descending else Transaction.id.asc()
    return query.order_by(order, tiebreak)


def validate_payload(data: dict) -> dict:
    values = collect(
        {
            "date": lambda: parse_date(data.get("date")),
            "description": lambda: clean_text(data.get("description"), "Beschreibung", 200),
            "amount_cents": lambda: parse_amount_cents(data.get("amount_cents")),
            "type": lambda: parse_type(data.get("type")),
            "notes": lambda: clean_text(data.get("notes"), "Notizen", 2000, required=False),
        }
    )
    category_id = data.get("category_id")
    category = db.session.get(Category, category_id) if isinstance(category_id, int) and not isinstance(category_id, bool) else None
    if category is None:
        raise ValidationError({"category_id": "Bitte eine gültige Kategorie wählen."})
    if category.type != values["type"]:
        raise ValidationError({"category_id": "Die Kategorie passt nicht zum Transaktionstyp."})
    values["category_id"] = category.id
    return values


def get_transaction_or_404(transaction_id: int) -> Transaction:
    transaction = db.session.get(Transaction, transaction_id)
    if transaction is None:
        raise NotFoundError("Transaktion nicht gefunden.")
    return transaction


@bp.get("")
def list_transactions():
    page = query_int("page", 1, minimum=1)
    page_size = query_int("page_size", 25, minimum=1, maximum=200)
    pagination = db.paginate(filtered_query(), page=page, per_page=page_size, error_out=False)
    return ok(
        [t.to_dict() for t in pagination.items],
        meta={"page": page, "page_size": page_size, "total": pagination.total, "total_pages": pagination.pages},
    )


@bp.post("")
def create_transaction():
    transaction = Transaction(**validate_payload(get_json_body()))
    db.session.add(transaction)
    db.session.commit()
    return ok(transaction.to_dict(), 201)


@bp.get("/<int:transaction_id>")
def get_transaction(transaction_id: int):
    return ok(get_transaction_or_404(transaction_id).to_dict())


@bp.put("/<int:transaction_id>")
def update_transaction(transaction_id: int):
    transaction = get_transaction_or_404(transaction_id)
    for key, value in validate_payload(get_json_body()).items():
        setattr(transaction, key, value)
    db.session.commit()
    db.session.refresh(transaction)
    return ok(transaction.to_dict())


@bp.delete("/<int:transaction_id>")
def delete_transaction(transaction_id: int):
    db.session.delete(get_transaction_or_404(transaction_id))
    db.session.commit()
    return ok({"deleted": 1})


@bp.post("/bulk-delete")
def bulk_delete():
    ids = get_json_body().get("ids")
    if (
        not isinstance(ids, list)
        or not ids
        or len(ids) > MAX_BULK_DELETE
        or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids)
    ):
        raise APIError("Es wird eine Liste von Transaktions-IDs erwartet.", 422, "validation_error")
    result = db.session.execute(delete(Transaction).where(Transaction.id.in_(ids)))
    db.session.commit()
    return ok({"deleted": result.rowcount})
