import pytest


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["data"]["status"] == "ok"


def test_transaction_crud(client, categories, make_tx):
    created = make_tx(description="Migros", amount_cents=4550, notes="Wocheneinkauf")
    assert created["amount_cents"] == 4550
    assert created["category"]["name"] == "Lebensmittel"

    fetched = client.get(f"/api/transactions/{created['id']}").get_json()["data"]
    assert fetched["description"] == "Migros"

    response = client.put(
        f"/api/transactions/{created['id']}",
        json={
            "date": "2026-03-11",
            "description": "Coop",
            "amount_cents": 1999,
            "type": "expense",
            "category_id": categories[("Restaurants", "expense")],
        },
    )
    assert response.status_code == 200
    updated = response.get_json()["data"]
    assert updated["description"] == "Coop"
    assert updated["category"]["name"] == "Restaurants"
    assert updated["notes"] is None

    assert client.delete(f"/api/transactions/{created['id']}").status_code == 200
    assert client.get(f"/api/transactions/{created['id']}").status_code == 404


@pytest.mark.parametrize("amount", [0, -100, 12.5, "100", None, True, 10_000_000_001])
def test_amount_validation(client, categories, amount):
    response = client.post(
        "/api/transactions",
        json={
            "date": "2026-03-10",
            "description": "Test",
            "amount_cents": amount,
            "type": "expense",
            "category_id": categories[("Lebensmittel", "expense")],
        },
    )
    assert response.status_code == 422
    assert "amount_cents" in response.get_json()["error"]["details"]


def test_category_type_must_match(client, categories):
    response = client.post(
        "/api/transactions",
        json={
            "date": "2026-03-10",
            "description": "Lohn",
            "amount_cents": 100,
            "type": "income",
            "category_id": categories[("Lebensmittel", "expense")],
        },
    )
    assert response.status_code == 422
    assert "category_id" in response.get_json()["error"]["details"]


def test_invalid_date_rejected(client, categories):
    response = client.post(
        "/api/transactions",
        json={"date": "2026-02-30", "description": "X", "amount_cents": 100, "type": "expense",
              "category_id": categories[("Lebensmittel", "expense")]},
    )
    assert response.status_code == 422
    assert "date" in response.get_json()["error"]["details"]


def test_filtering_sorting_and_pagination(client, categories, make_tx):
    make_tx(date="2026-01-05", description="Migros Zürich", amount_cents=5000)
    make_tx(date="2026-02-10", description="Restaurant Hiltl", amount_cents=8000, category="Restaurants")
    make_tx(date="2026-03-15", description="Lohn März", amount_cents=600000, type="income", category="Lohn")
    make_tx(date="2026-03-20", description="Migros Bern", amount_cents=2500)

    def ids(**params):
        return [t["description"] for t in client.get("/api/transactions", query_string=params).get_json()["data"]]

    assert ids(search="migros") == ["Migros Bern", "Migros Zürich"]
    assert ids(type="income") == ["Lohn März"]
    assert ids(category_id=categories[("Restaurants", "expense")]) == ["Restaurant Hiltl"]
    assert ids(date_from="2026-02-01", date_to="2026-03-15") == ["Lohn März", "Restaurant Hiltl"]
    assert ids(amount_min=3000, amount_max=10000) == ["Restaurant Hiltl", "Migros Zürich"]
    assert ids(sort="amount", order="asc")[0] == "Migros Bern"
    assert ids(sort="description", order="asc")[0] == "Lohn März"
    assert ids(search="100%") == []

    page = client.get("/api/transactions", query_string={"page": 2, "page_size": 3}).get_json()
    assert page["meta"] == {"page": 2, "page_size": 3, "total": 4, "total_pages": 2}
    assert len(page["data"]) == 1


def test_invalid_filter_returns_422(client):
    assert client.get("/api/transactions?date_from=gestern").status_code == 422
    assert client.get("/api/transactions?sort=foo").status_code == 422


def test_bulk_delete(client, make_tx):
    a, b, c = make_tx(), make_tx(), make_tx()
    response = client.post("/api/transactions/bulk-delete", json={"ids": [a["id"], b["id"]]})
    assert response.get_json()["data"]["deleted"] == 2
    remaining = client.get("/api/transactions").get_json()["data"]
    assert [t["id"] for t in remaining] == [c["id"]]
    assert client.post("/api/transactions/bulk-delete", json={"ids": []}).status_code == 422


def test_errors_are_json_without_stacktrace(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "http_404"
    response = client.post("/api/transactions", data="kein json", content_type="text/plain")
    assert response.status_code == 400
