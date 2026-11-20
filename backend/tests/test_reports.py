def get(client, url, **params):
    response = client.get(url, query_string=params)
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def test_summary_calculations(client, make_tx):
    make_tx(date="2026-03-01", amount_cents=500000, type="income", category="Lohn", description="Lohn")
    make_tx(date="2026-03-05", amount_cents=120000, category="Wohnen", description="Miete")
    make_tx(date="2026-03-20", amount_cents=30000, category="Lebensmittel")
    make_tx(date="2026-02-10", amount_cents=50000, category="Lebensmittel")  # previous period
    make_tx(date="2026-04-01", amount_cents=99999, category="Lebensmittel")  # outside

    data = get(client, "/api/reports/summary", date_from="2026-03-01", date_to="2026-03-31")
    assert data["income_cents"] == 500000
    assert data["expenses_cents"] == 150000
    assert data["net_cents"] == 350000
    assert data["savings_rate"] == 70.0
    assert data["transaction_count"] == 3
    assert data["avg_daily_spending_cents"] == round(150000 / 31)
    assert [t["amount_cents"] for t in data["largest_expenses"]] == [120000, 30000]

    # Full calendar month compares against the previous calendar month.
    assert data["previous"]["date_from"] == "2026-02-01"
    assert data["previous"]["date_to"] == "2026-02-28"
    assert data["previous"]["expenses_cents"] == 50000
    assert data["changes"]["expenses_cents"] == 200.0
    assert data["changes"]["income_cents"] is None  # previous income was 0


def test_summary_handles_empty_and_zero_income(client, make_tx):
    empty = get(client, "/api/reports/summary", date_from="2026-01-01", date_to="2026-01-31")
    assert empty["income_cents"] == 0 and empty["expenses_cents"] == 0
    assert empty["savings_rate"] is None
    assert empty["avg_daily_spending_cents"] == 0

    make_tx(date="2026-01-10", amount_cents=1000)
    only_expense = get(client, "/api/reports/summary", date_from="2026-01-01", date_to="2026-01-31")
    assert only_expense["savings_rate"] is None
    assert only_expense["net_cents"] == -1000


def test_previous_period_for_custom_range(client):
    data = get(client, "/api/reports/summary", date_from="2026-03-10", date_to="2026-03-19")
    assert data["previous"]["date_from"] == "2026-02-28"
    assert data["previous"]["date_to"] == "2026-03-09"


def test_monthly_report_fills_empty_months(client, make_tx):
    make_tx(date="2026-01-15", amount_cents=1000)
    make_tx(date="2026-03-02", amount_cents=5000, type="income", category="Lohn")
    data = get(client, "/api/reports/monthly", date_from="2026-01-01", date_to="2026-03-31")
    assert data == [
        {"period": "2026-01", "income_cents": 0, "expenses_cents": 1000, "net_cents": -1000},
        {"period": "2026-02", "income_cents": 0, "expenses_cents": 0, "net_cents": 0},
        {"period": "2026-03", "income_cents": 5000, "expenses_cents": 0, "net_cents": 5000},
    ]


def test_daily_granularity(client, make_tx):
    make_tx(date="2026-03-02", amount_cents=700)
    data = get(client, "/api/reports/monthly", date_from="2026-03-01", date_to="2026-03-03", granularity="day")
    assert [d["period"] for d in data] == ["2026-03-01", "2026-03-02", "2026-03-03"]
    assert data[1]["expenses_cents"] == 700


def test_category_report(client, make_tx):
    make_tx(date="2026-03-01", amount_cents=7500, category="Wohnen")
    make_tx(date="2026-03-02", amount_cents=2500, category="Lebensmittel")
    make_tx(date="2026-03-03", amount_cents=9999, type="income", category="Lohn")
    data = get(client, "/api/reports/categories", date_from="2026-03-01", date_to="2026-03-31", include_monthly="1")
    assert data["total_cents"] == 10000
    assert [(i["name"], i["share"]) for i in data["items"]] == [("Wohnen", 75.0), ("Lebensmittel", 25.0)]
    assert data["items"][0]["color"].startswith("#")
    assert len(data["monthly"]) == 1

    empty = get(client, "/api/reports/categories", date_from="2025-01-01", date_to="2025-01-31")
    assert empty == {"type": "expense", "total_cents": 0, "items": []}


def test_invalid_period(client):
    response = client.get("/api/reports/summary?date_from=2026-03-10&date_to=2026-03-01")
    assert response.status_code == 422
