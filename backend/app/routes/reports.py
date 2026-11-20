import calendar
from datetime import date, timedelta

from flask import Blueprint, request
from sqlalchemy import func, select

from ..errors import ValidationError
from ..extensions import db
from ..models import Category, Transaction
from ..validation import query_date, query_int, query_type
from . import ok

bp = Blueprint("reports", __name__, url_prefix="/api/reports")

MAX_DAILY_SPAN_DAYS = 400


# ---- period helpers -------------------------------------------------------


def month_end(day: date) -> date:
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def add_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def parse_period() -> tuple[date, date]:
    """Read date_from/date_to; defaults to the current calendar month."""
    today = date.today()
    start = query_date("date_from") or today.replace(day=1)
    end = query_date("date_to") or month_end(today)
    if start > end:
        raise ValidationError({"date_from": "Das Startdatum muss vor dem Enddatum liegen."})
    return start, end


def previous_period(start: date, end: date) -> tuple[date, date]:
    """Whole calendar months compare against the same number of preceding months,
    any other range against the equally long range directly before it."""
    if start.day == 1 and end == month_end(end):
        months = (end.year - start.year) * 12 + end.month - start.month + 1
        return add_months(start, -months), start - timedelta(days=1)
    length = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return prev_end - timedelta(days=length - 1), prev_end


# ---- calculations ---------------------------------------------------------


def percentage(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def change_pct(current: int, previous: int) -> float | None:
    return round((current - previous) / abs(previous) * 100, 1) if previous else None


def totals(start: date, end: date) -> dict:
    rows = db.session.execute(
        select(Transaction.type, func.coalesce(func.sum(Transaction.amount_cents), 0), func.count())
        .where(Transaction.date >= start, Transaction.date <= end)
        .group_by(Transaction.type)
    ).all()
    sums = {tx_type: (int(total), count) for tx_type, total, count in rows}
    income, income_count = sums.get("income", (0, 0))
    expenses, expense_count = sums.get("expense", (0, 0))
    days = (end - start).days + 1
    return {
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "income_cents": income,
        "expenses_cents": expenses,
        "net_cents": income - expenses,
        "savings_rate": percentage(income - expenses, income),
        "transaction_count": income_count + expense_count,
        "days": days,
        "avg_daily_spending_cents": round(expenses / days),
    }


def period_buckets(start: date, end: date, granularity: str) -> list[str]:
    if granularity == "day":
        return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    buckets, current = [], start.replace(day=1)
    while current <= end:
        buckets.append(current.strftime("%Y-%m"))
        current = add_months(current, 1)
    return buckets


def period_expression(granularity: str):
    return func.strftime("%Y-%m-%d" if granularity == "day" else "%Y-%m", Transaction.date)


def read_granularity(start: date, end: date) -> str:
    granularity = request.args.get("granularity", "month")
    if granularity not in ("day", "month"):
        raise ValidationError({"granularity": "Muss 'day' oder 'month' sein."})
    if granularity == "day" and (end - start).days + 1 > MAX_DAILY_SPAN_DAYS:
        raise ValidationError({"granularity": "Tagesansicht ist auf 400 Tage begrenzt."})
    return granularity


# ---- endpoints ------------------------------------------------------------


@bp.get("/summary")
def summary():
    start, end = parse_period()
    limit = query_int("largest_limit", 5, minimum=1, maximum=50)
    current = totals(start, end)
    prev_start, prev_end = previous_period(start, end)
    previous = totals(prev_start, prev_end)

    largest = db.session.scalars(
        select(Transaction)
        .where(Transaction.type == "expense", Transaction.date >= start, Transaction.date <= end)
        .order_by(Transaction.amount_cents.desc(), Transaction.date.desc())
        .limit(limit)
    ).all()

    keys = ("income_cents", "expenses_cents", "net_cents", "avg_daily_spending_cents")
    changes = {key: change_pct(current[key], previous[key]) for key in keys}
    changes["savings_rate"] = (
        round(current["savings_rate"] - previous["savings_rate"], 1)
        if current["savings_rate"] is not None and previous["savings_rate"] is not None
        else None
    )
    return ok({**current, "previous": previous, "changes": changes, "largest_expenses": [t.to_dict() for t in largest]})


@bp.get("/monthly")
def monthly():
    start, end = parse_period()
    granularity = read_granularity(start, end)
    period = period_expression(granularity)
    rows = db.session.execute(
        select(period, Transaction.type, func.sum(Transaction.amount_cents))
        .where(Transaction.date >= start, Transaction.date <= end)
        .group_by(period, Transaction.type)
    ).all()
    values: dict[tuple[str, str], int] = {(p, t): int(total) for p, t, total in rows}

    result = []
    for bucket in period_buckets(start, end, granularity):
        income = values.get((bucket, "income"), 0)
        expenses = values.get((bucket, "expense"), 0)
        result.append({"period": bucket, "income_cents": income, "expenses_cents": expenses, "net_cents": income - expenses})
    return ok(result, meta={"granularity": granularity})


@bp.get("/categories")
def categories():
    start, end = parse_period()
    tx_type = query_type() or "expense"
    in_period = (Transaction.date >= start, Transaction.date <= end, Transaction.type == tx_type)

    rows = db.session.execute(
        select(Category.id, Category.name, Category.color, Category.icon, func.sum(Transaction.amount_cents), func.count())
        .join(Transaction, Transaction.category_id == Category.id)
        .where(*in_period)
        .group_by(Category.id)
        .order_by(func.sum(Transaction.amount_cents).desc())
    ).all()
    grand_total = sum(int(row[4]) for row in rows)
    items = [
        {
            "category_id": cid,
            "name": name,
            "color": color,
            "icon": icon,
            "total_cents": int(total),
            "transaction_count": count,
            "share": percentage(int(total), grand_total),
        }
        for cid, name, color, icon, total, count in rows
    ]

    data = {"type": tx_type, "total_cents": grand_total, "items": items}

    if request.args.get("include_monthly") in ("1", "true"):
        period = period_expression("month")
        monthly_rows = db.session.execute(
            select(period, Transaction.category_id, func.sum(Transaction.amount_cents))
            .where(*in_period)
            .group_by(period, Transaction.category_id)
        ).all()
        per_month: dict[str, dict[str, int]] = {bucket: {} for bucket in period_buckets(start, end, "month")}
        for bucket, category_id, total in monthly_rows:
            per_month.setdefault(bucket, {})[str(category_id)] = int(total)
        data["monthly"] = [{"period": bucket, "values": vals} for bucket, vals in per_month.items()]

    return ok(data)
