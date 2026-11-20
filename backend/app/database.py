"""SQLite configuration, lightweight schema migrations and initial seeding.

Migrations are an ordered list of SQL statements. Applied versions are tracked in
`schema_migrations`, so existing databases are upgraded in place and never reset.
To change the schema, append a new (version, name, statements) tuple.
"""

import logging

from sqlalchemy import event, text
from sqlalchemy.engine import Engine

from .extensions import db
from .models import AppSetting, Category, utcnow

log = logging.getLogger(__name__)

MIGRATIONS: list[tuple[int, str, list[str]]] = [
    (
        1,
        "initial schema",
        [
            """
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(60) NOT NULL COLLATE NOCASE,
                type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
                color VARCHAR(7) NOT NULL,
                icon VARCHAR(50) NOT NULL,
                description VARCHAR(255),
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                UNIQUE (name, type)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                description VARCHAR(200) NOT NULL,
                amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
                category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
                notes TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_transactions_date ON transactions (date)",
            "CREATE INDEX IF NOT EXISTS ix_transactions_type_date ON transactions (type, date)",
            "CREATE INDEX IF NOT EXISTS ix_transactions_category_id ON transactions (category_id)",
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(50) PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """,
        ],
    ),
]

DEFAULT_CATEGORIES = [
    # (name, type, color, icon)
    ("Lebensmittel", "expense", "#16a34a", "shopping-cart"),
    ("Restaurants", "expense", "#f97316", "utensils"),
    ("Transport", "expense", "#0ea5e9", "train-front"),
    ("Shopping", "expense", "#ec4899", "shopping-bag"),
    ("Abonnements", "expense", "#8b5cf6", "repeat"),
    ("Freizeit", "expense", "#eab308", "ticket"),
    ("Gesundheit", "expense", "#ef4444", "heart-pulse"),
    ("Wohnen", "expense", "#6366f1", "house"),
    ("Sonstiges", "expense", "#64748b", "circle-ellipsis"),
    ("Lohn", "income", "#059669", "briefcase"),
    ("Geschenke", "income", "#d946ef", "gift"),
    ("Rückerstattungen", "income", "#14b8a6", "rotate-ccw"),
    ("Sonstiges", "income", "#94a3b8", "circle-ellipsis"),
]

SEEDED_KEY = "default_categories_seeded"


def configure_sqlite(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


def run_migrations() -> None:
    with db.engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME NOT NULL)"
            )
        )
        applied = {row[0] for row in conn.execute(text("SELECT version FROM schema_migrations"))}
        for version, name, statements in MIGRATIONS:
            if version in applied:
                continue
            log.info("Applying migration %s: %s", version, name)
            for statement in statements:
                conn.execute(text(statement))
            conn.execute(
                text("INSERT INTO schema_migrations (version, name, applied_at) VALUES (:v, :n, :t)"),
                {"v": version, "n": name, "t": utcnow().isoformat(sep=" ")},
            )


def seed_default_categories() -> None:
    for name, type_, color, icon in DEFAULT_CATEGORIES:
        db.session.add(Category(name=name, type=type_, color=color, icon=icon))


def init_database() -> None:
    """Create/upgrade the schema and seed defaults exactly once per database."""
    run_migrations()
    if db.session.get(AppSetting, SEEDED_KEY) is None:
        seed_default_categories()
        db.session.add(AppSetting(key=SEEDED_KEY, value="true"))
        db.session.commit()
        log.info("Seeded default categories")
