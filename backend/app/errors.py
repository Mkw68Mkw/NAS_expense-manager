import logging

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from .extensions import db

log = logging.getLogger(__name__)

HTTP_MESSAGES = {
    400: "Ungültige Anfrage.",
    404: "Die angeforderte Ressource wurde nicht gefunden.",
    405: "Diese Methode ist nicht erlaubt.",
    413: "Die hochgeladene Datei ist zu gross.",
    415: "Nicht unterstütztes Datenformat.",
}


class APIError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "bad_request", details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details


class ValidationError(APIError):
    def __init__(self, details: dict, message: str = "Die Eingaben sind ungültig."):
        super().__init__(message, 422, "validation_error", details)


class NotFoundError(APIError):
    def __init__(self, message: str = "Die angeforderte Ressource wurde nicht gefunden."):
        super().__init__(message, 404, "not_found")


def error_response(status: int, code: str, message: str, details: dict | None = None):
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(APIError)
    def handle_api_error(err: APIError):
        db.session.rollback()
        return error_response(err.status, err.code, err.message, err.details)

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        status = err.code or 500
        return error_response(status, f"http_{status}", HTTP_MESSAGES.get(status, "Fehler bei der Anfrage."))

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):
        # Log the full stack trace server-side only; never send it to the client.
        log.exception("Unhandled error: %s", err)
        db.session.rollback()
        return error_response(500, "internal_error", "Ein interner Fehler ist aufgetreten.")
