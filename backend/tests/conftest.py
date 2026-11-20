import pytest

from app import create_app


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def app(db_path):
    return create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}", "TESTING": True})


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def categories(client):
    """Map of (name, type) -> id for the seeded default categories."""
    return {(c["name"], c["type"]): c["id"] for c in client.get("/api/categories").get_json()["data"]}


@pytest.fixture
def make_tx(client, categories):
    def _make(date="2026-03-10", description="Einkauf", amount_cents=1000, type="expense", category="Lebensmittel", notes=None):
        response = client.post(
            "/api/transactions",
            json={
                "date": date,
                "description": description,
                "amount_cents": amount_cents,
                "type": type,
                "category_id": categories[(category, type)],
                "notes": notes,
            },
        )
        assert response.status_code == 201, response.get_json()
        return response.get_json()["data"]

    return _make
