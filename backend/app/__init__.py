import logging
import os

from flask import Flask, jsonify
from sqlalchemy import text

from .database import configure_sqlite, init_database
from .errors import register_error_handlers
from .extensions import db


def create_app(config: dict | None = None) -> Flask:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = Flask(__name__)
    db_path = os.environ.get("DATABASE_PATH", "/app/data/expenses.db")
    app.config.update(
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{db_path}",
        SQLALCHEMY_ENGINE_OPTIONS={"connect_args": {"timeout": 10}},
        MAX_CONTENT_LENGTH=int(os.environ.get("MAX_UPLOAD_MB", "20")) * 1024 * 1024,
        AUTO_INIT_DB=True,
    )
    if config:
        app.config.update(config)

    db.init_app(app)
    with app.app_context():
        configure_sqlite(db.engine)
        if app.config["AUTO_INIT_DB"]:
            init_database()

    register_error_handlers(app)

    from .routes.categories import bp as categories_bp
    from .routes.data import bp as data_bp
    from .routes.reports import bp as reports_bp
    from .routes.transactions import bp as transactions_bp

    app.register_blueprint(transactions_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(data_bp)

    @app.get("/api/health")
    def health():
        try:
            db.session.execute(text("SELECT 1"))
            return jsonify({"data": {"status": "ok", "database": "ok"}})
        except Exception:
            app.logger.exception("Health check failed")
            return jsonify({"data": {"status": "error", "database": "unavailable"}}), 503

    return app
