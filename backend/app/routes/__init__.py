from flask import jsonify


def ok(data, status: int = 200, meta: dict | None = None):
    body = {"data": data}
    if meta is not None:
        body["meta"] = meta
    return jsonify(body), status
