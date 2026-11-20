def category_payload(**overrides):
    payload = {"name": "Haustiere", "type": "expense", "color": "#AABBCC", "icon": "paw-print", "description": "Futter & Tierarzt"}
    payload.update(overrides)
    return payload


def test_default_categories_seeded(client):
    data = client.get("/api/categories").get_json()["data"]
    names = {(c["name"], c["type"]) for c in data}
    assert ("Lebensmittel", "expense") in names
    assert ("Sonstiges", "expense") in names
    assert ("Sonstiges", "income") in names
    assert ("Rückerstattungen", "income") in names


def test_category_crud(client):
    response = client.post("/api/categories", json=category_payload())
    assert response.status_code == 201
    created = response.get_json()["data"]
    assert created["color"] == "#aabbcc"
    assert created["transaction_count"] == 0

    response = client.put(f"/api/categories/{created['id']}", json=category_payload(name="Tiere", color="#112233"))
    assert response.status_code == 200
    assert response.get_json()["data"]["name"] == "Tiere"

    assert client.delete(f"/api/categories/{created['id']}").status_code == 200
    ids = [c["id"] for c in client.get("/api/categories").get_json()["data"]]
    assert created["id"] not in ids


def test_category_validation(client):
    response = client.post("/api/categories", json=category_payload(color="red", icon="Bad Icon", name=""))
    assert response.status_code == 422
    assert set(response.get_json()["error"]["details"]) == {"color", "icon", "name"}


def test_duplicate_category_name_rejected(client):
    response = client.post("/api/categories", json=category_payload(name="lebensmittel"))
    assert response.status_code == 422
    # Same name with a different type is allowed.
    assert client.post("/api/categories", json=category_payload(name="Lebensmittel", type="income")).status_code == 201


def test_delete_category_with_transactions_requires_reassignment(client, categories, make_tx):
    tx = make_tx(category="Restaurants")
    restaurants = categories[("Restaurants", "expense")]

    response = client.delete(f"/api/categories/{restaurants}")
    assert response.status_code == 409
    assert response.get_json()["error"]["details"]["transaction_count"] == 1

    # Incompatible target (income category) is rejected.
    response = client.delete(f"/api/categories/{restaurants}?reassign_to={categories[('Lohn', 'income')]}")
    assert response.status_code == 422

    target = categories[("Sonstiges", "expense")]
    response = client.delete(f"/api/categories/{restaurants}?reassign_to={target}")
    assert response.status_code == 200
    assert response.get_json()["data"]["reassigned"] == 1
    assert client.get(f"/api/transactions/{tx['id']}").get_json()["data"]["category_id"] == target


def test_type_change_blocked_when_in_use(client, categories, make_tx):
    make_tx(category="Freizeit")
    freizeit = categories[("Freizeit", "expense")]
    response = client.put(
        f"/api/categories/{freizeit}", json=category_payload(name="Freizeit", type="income")
    )
    assert response.status_code == 409
