from flask import Blueprint, request
from sqlalchemy import func, select, update

from ..errors import APIError, NotFoundError, ValidationError
from ..extensions import db
from ..models import Category, Transaction
from ..validation import clean_text, collect, get_json_body, parse_color, parse_icon, parse_type, query_type
from . import ok

bp = Blueprint("categories", __name__, url_prefix="/api/categories")


def transaction_count(category_id: int) -> int:
    return db.session.scalar(select(func.count()).where(Transaction.category_id == category_id)) or 0


def validate_payload(data: dict, current_id: int | None = None) -> dict:
    values = collect(
        {
            "name": lambda: clean_text(data.get("name"), "Name", 60),
            "type": lambda: parse_type(data.get("type")),
            "color": lambda: parse_color(data.get("color")),
            "icon": lambda: parse_icon(data.get("icon")),
            "description": lambda: clean_text(data.get("description"), "Beschreibung", 255, required=False),
        }
    )
    duplicate = db.session.scalar(
        select(Category.id).where(
            func.lower(Category.name) == values["name"].lower(),
            Category.type == values["type"],
            Category.id != (current_id or 0),
        )
    )
    if duplicate:
        raise ValidationError({"name": "Eine Kategorie mit diesem Namen und Typ existiert bereits."})
    return values


def get_category_or_404(category_id: int) -> Category:
    category = db.session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Kategorie nicht gefunden.")
    return category


@bp.get("")
def list_categories():
    counts = (
        select(Transaction.category_id, func.count().label("cnt")).group_by(Transaction.category_id).subquery()
    )
    query = (
        select(Category, func.coalesce(counts.c.cnt, 0))
        .outerjoin(counts, counts.c.category_id == Category.id)
        .order_by(Category.type, func.lower(Category.name))
    )
    category_type = query_type()
    if category_type:
        query = query.where(Category.type == category_type)
    return ok([category.to_dict(count) for category, count in db.session.execute(query)])


@bp.post("")
def create_category():
    category = Category(**validate_payload(get_json_body()))
    db.session.add(category)
    db.session.commit()
    return ok(category.to_dict(0), 201)


@bp.put("/<int:category_id>")
def update_category(category_id: int):
    category = get_category_or_404(category_id)
    values = validate_payload(get_json_body(), current_id=category_id)
    count = transaction_count(category_id)
    if values["type"] != category.type and count > 0:
        raise APIError(
            "Der Typ kann nicht geändert werden, solange Transaktionen dieser Kategorie zugeordnet sind.",
            409,
            "category_in_use",
            {"transaction_count": count},
        )
    for key, value in values.items():
        setattr(category, key, value)
    db.session.commit()
    return ok(category.to_dict(count))


@bp.delete("/<int:category_id>")
def delete_category(category_id: int):
    category = get_category_or_404(category_id)
    count = transaction_count(category_id)

    if count > 0:
        reassign_raw = request.args.get("reassign_to")
        if not reassign_raw:
            raise APIError(
                "Dieser Kategorie sind Transaktionen zugeordnet. Bitte eine Ersatzkategorie wählen.",
                409,
                "category_in_use",
                {"transaction_count": count},
            )
        try:
            target = db.session.get(Category, int(reassign_raw))
        except ValueError:
            target = None
        if target is None or target.id == category.id:
            raise ValidationError({"reassign_to": "Ungültige Ersatzkategorie."})
        if target.type != category.type:
            raise ValidationError({"reassign_to": "Die Ersatzkategorie muss denselben Typ haben."})
        db.session.execute(
            update(Transaction).where(Transaction.category_id == category.id).values(category_id=target.id)
        )

    db.session.delete(category)
    db.session.commit()
    return ok({"deleted": 1, "reassigned": count})
