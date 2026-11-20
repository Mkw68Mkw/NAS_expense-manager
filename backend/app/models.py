from datetime import datetime, timezone

from .extensions import db

TYPES = ("income", "expense")


def utcnow() -> datetime:
    # Stored as naive UTC because SQLite has no timezone-aware datetime type.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_utc(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") + "Z" if value else None


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(60), nullable=False)
    type = db.Column(db.String(10), nullable=False)
    color = db.Column(db.String(7), nullable=False)
    icon = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self, transaction_count: int | None = None) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "color": self.color,
            "icon": self.icon,
            "description": self.description,
            "created_at": iso_utc(self.created_at),
            "updated_at": iso_utc(self.updated_at),
        }
        if transaction_count is not None:
            data["transaction_count"] = transaction_count
        return data


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    description = db.Column(db.String(200), nullable=False)
    amount_cents = db.Column(db.Integer, nullable=False)
    type = db.Column(db.String(10), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    category = db.relationship("Category", lazy="joined")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "description": self.description,
            "amount_cents": self.amount_cents,
            "type": self.type,
            "category_id": self.category_id,
            "category": {
                "id": self.category.id,
                "name": self.category.name,
                "color": self.category.color,
                "icon": self.category.icon,
            }
            if self.category
            else None,
            "notes": self.notes,
            "created_at": iso_utc(self.created_at),
            "updated_at": iso_utc(self.updated_at),
        }


class AppSetting(db.Model):
    __tablename__ = "app_settings"

    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
