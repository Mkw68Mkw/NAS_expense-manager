import io

from app import create_app


def test_database_persists_across_app_restarts(db_path, client, make_tx):
    make_tx(description="Bleibt erhalten")
    client.post("/api/categories", json={"name": "Eigene", "type": "expense", "color": "#123456", "icon": "star"})
    client.delete(f"/api/categories/{next(c['id'] for c in client.get('/api/categories').get_json()['data'] if c['name'] == 'Shopping')}")

    restarted = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}", "TESTING": True}).test_client()
    transactions = restarted.get("/api/transactions").get_json()["data"]
    assert [t["description"] for t in transactions] == ["Bleibt erhalten"]
    names = [c["name"] for c in restarted.get("/api/categories").get_json()["data"]]
    assert "Eigene" in names
    assert "Shopping" not in names  # deleted defaults are not re-seeded
    assert names.count("Lebensmittel") == 1


def test_sqlite_pragmas(app):
    from sqlalchemy import text

    from app.extensions import db

    with app.app_context():
        assert db.session.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert db.session.execute(text("PRAGMA journal_mode")).scalar() == "wal"


def upload(client, content: str, mode="preview"):
    return client.post(
        f"/api/import/csv?mode={mode}",
        data={"file": (io.BytesIO(content.encode("utf-8-sig")), "import.csv")},
        content_type="multipart/form-data",
    )


CSV = (
    "Datum;Beschreibung;Betrag;Typ;Kategorie;Notizen\n"
    "01.03.2026;Migros;1'234.50;Ausgabe;Lebensmittel;\n"
    "01.03.2026;Migros;1'234.50;Ausgabe;Lebensmittel;\n"  # duplicate
    "2026-03-25;Lohn;6500;Einnahme;Lohn;März\n"
    "31.02.2026;Falsch;-5;Ausgabe;Unbekannt;\n"
)


def test_csv_import_preview_and_commit(client):
    preview = upload(client, CSV).get_json()["data"]
    assert preview["summary"] == {"total": 4, "valid": 2, "invalid": 1, "duplicates": 1, "imported": 0}
    assert preview["rows"][0]["amount_cents"] == 123450
    assert preview["rows"][1]["duplicate"] is True
    assert set(preview["rows"][3]["errors"]) == {"date", "amount_cents", "category"}
    assert client.get("/api/transactions").get_json()["meta"]["total"] == 0

    committed = upload(client, CSV, mode="commit").get_json()["data"]
    assert committed["summary"]["imported"] == 2
    assert client.get("/api/transactions").get_json()["meta"]["total"] == 2


def test_csv_import_rejects_missing_columns(client):
    response = upload(client, "foo;bar\n1;2\n")
    assert response.status_code == 400


def test_csv_export_roundtrip(client, make_tx):
    make_tx(date="2026-03-01", description="=Formel", amount_cents=1205, notes="Grüsse")
    response = client.get("/api/export/csv")
    body = response.data.decode("utf-8")
    assert body.startswith("\ufeff")
    assert "01.03.2026;'=Formel;12.05;Ausgabe;Lebensmittel;Grüsse" in body

    client.delete("/api/data?confirm=true")
    result = upload(client, body.lstrip("\ufeff"), mode="commit").get_json()["data"]
    assert result["summary"]["imported"] == 1
    assert client.get("/api/transactions").get_json()["data"][0]["description"] == "=Formel"


def test_backup_and_restore(client, make_tx):
    make_tx(description="Vor Backup", amount_cents=4200)
    backup = client.get("/api/backup").get_json()["data"]
    assert backup["format"] == "expense-manager-backup" and backup["version"] == 1

    client.delete("/api/data?confirm=true")
    assert client.get("/api/transactions").get_json()["meta"]["total"] == 0

    response = client.post("/api/restore", json=backup)
    assert response.status_code == 200, response.get_json()
    transactions = client.get("/api/transactions").get_json()["data"]
    assert transactions[0]["description"] == "Vor Backup"
    assert transactions[0]["amount_cents"] == 4200


def test_invalid_restore_changes_nothing(client, make_tx):
    make_tx(description="Bleibt")
    backup = client.get("/api/backup").get_json()["data"]
    backup["data"]["transactions"][0]["category_id"] = 99999
    response = client.post("/api/restore", json=backup)
    assert response.status_code == 422
    assert client.get("/api/transactions").get_json()["data"][0]["description"] == "Bleibt"

    assert client.post("/api/restore", json={"format": "x"}).status_code == 422


def test_delete_all_requires_confirmation(client, make_tx):
    make_tx()
    assert client.delete("/api/data").status_code == 400
    assert client.delete("/api/data?confirm=true").status_code == 200
    assert client.get("/api/transactions").get_json()["meta"]["total"] == 0
    assert len(client.get("/api/categories").get_json()["data"]) == 13


def test_demo_data_only_into_empty_database(client, make_tx):
    response = client.post("/api/demo")
    assert response.status_code == 201
    assert response.get_json()["data"]["created"] > 0
    assert client.post("/api/demo").status_code == 409


def test_settings_only_chf(client):
    assert client.get("/api/settings").get_json()["data"]["currency"] == "CHF"
    assert client.put("/api/settings", json={"currency": "EUR"}).status_code == 422
    assert client.put("/api/settings", json={"currency": "CHF"}).status_code == 200
