import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoints():
    """Verify health endpoints return 200 with service metadata and source statuses."""
    res_health = client.get("/health")
    assert res_health.status_code == 200
    data = res_health.json()
    assert data.get("status") in ["healthy", "ok"]
    assert "version" in data
    assert "service" in data

    res_sources = client.get("/api/v1/health/sources")
    assert res_sources.status_code == 200
    sources_data = res_sources.json()
    assert "sources" in sources_data
    assert isinstance(sources_data["sources"], list)
    assert len(sources_data["sources"]) > 0


def test_incidents_endpoints():
    """Verify incidents list endpoint returns structured items and total count."""
    res_list = client.get("/api/v1/incidents")
    assert res_list.status_code == 200
    data = res_list.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)

    res_filtered = client.get("/api/v1/incidents?severity=high&limit=10")
    assert res_filtered.status_code == 200
    filtered_data = res_filtered.json()
    assert isinstance(filtered_data["items"], list)


def test_approvals_endpoints():
    """Verify approvals GET returns list and POST logs operator decisions."""
    res_list = client.get("/api/v1/approvals")
    assert res_list.status_code == 200
    data = res_list.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)

    approval_payload = {
        "incident_id": "INC-TEST-001",
        "route_id": "ROUTE-ALT-2",
        "recommended_route": {
            "path_name": "Belawan Detour via Tol Tebing",
            "eta_hours": 3.5,
            "cost_idr": 4500000
        },
        "operator_id": "OPERATOR-JUDGE-01"
    }
    res_post = client.post("/api/v1/approvals", json=approval_payload)
    assert res_post.status_code in [200, 201]
    post_data = res_post.json()
    assert "approval_id" in post_data
    assert "status" in post_data


def test_commodity_endpoints():
    """Verify commodity prices endpoint returns structured price points."""
    res_prices = client.get("/api/v1/commodities/prices?commodity=beras&limit=10")
    assert res_prices.status_code == 200
    data = res_prices.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) > 0
    assert "price_idr" in data["items"][0]


def test_news_endpoints():
    """Verify live news ingestion and market regime intelligence endpoints."""
    res_live = client.get("/api/v1/news/live")
    assert res_live.status_code == 200
    data = res_live.json()
    assert "articles" in data or "items" in data
    assert "status" in data

    res_regime = client.get("/api/v1/news/market-regime")
    assert res_regime.status_code == 200
    regime = res_regime.json()
    assert "regime" in regime or "market_regime" in regime


def test_corridor_endpoints():
    """Verify corridor multi-source context aggregator returns telemetry data."""
    res_ctx = client.get("/api/v1/corridor/context?corridor_id=sumatra_belawan_medan")
    assert res_ctx.status_code == 200
    data = res_ctx.json()
    assert isinstance(data, dict)


def test_vehicles_endpoints():
    """Verify fleet vehicle tracking endpoints return active multi-modal assets."""
    res_fleet = client.get("/vehicles")
    assert res_fleet.status_code == 200
    data = res_fleet.json()
    assert data.get("status") == "success"
    assert "vehicles" in data
    assert isinstance(data["vehicles"], list)
    assert len(data["vehicles"]) > 0


def test_spatial_weather_and_traffic_endpoints():
    """Verify weather polygons and TomTom traffic flow segment endpoints."""
    res_weather = client.get("/api/v1/weather/spatial-polygons")
    assert res_weather.status_code == 200
    weather_data = res_weather.json()
    assert isinstance(weather_data, dict)

    res_traffic = client.get("/api/v1/traffic/flow-segments")
    assert res_traffic.status_code == 200
    traffic_data = res_traffic.json()
    assert "segments" in traffic_data