import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth.supabase_auth import create_guest_token, ROLE_DISPATCHER

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


def test_incidents_wkt_location_parsing():
    """S4: WKT 'POINT(lon lat)' strings parse into float lat/lon; missing/malformed input degrades to None."""
    from app.routers.incidents import _parse_wkt_point

    assert _parse_wkt_point("POINT(98.6667 3.5833)") == pytest.approx((3.5833, 98.6667))
    assert _parse_wkt_point("SRID=4326;POINT(99.1625 3.3285)") == pytest.approx((3.3285, 99.1625))
    assert _parse_wkt_point(None) == (None, None)
    assert _parse_wkt_point("") == (None, None)
    assert _parse_wkt_point("not-a-wkt-point") == (None, None)


def test_incidents_supabase_rows_map_wkt_location_to_lat_lon(monkeypatch):
    """S4: Supabase rows (WKT 'location', null concrete coords) surface as float coords in the API."""
    import app.db.supabase_client as sb_client_module

    class FakeResult:
        data = [{
            "incident_id": "INC-WKT-1",
            "title": "Banjir Belawan",
            "type": "flood",
            "severity": "high",
            "status": "validated",
            "confidence": 0.9,
            "created_at": "2026-10-01T00:00:00Z",
            "location": "POINT(98.6890 3.8012)",
            "lat": None,
            "lon": None,
            "description": "Akses pelabuhan terendam",
            "affected_area": "Belawan",
        }]

    class FakeQuery:
        def select(self, columns, *args, **kwargs):
            assert "location" in columns
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def execute(self):
            return FakeResult()

    class FakeClient:
        def table(self, name):
            assert name == "incidents"
            return FakeQuery()

    monkeypatch.setattr(sb_client_module, "get_client", lambda: FakeClient())

    res = client.get("/api/v1/incidents?limit=5")
    assert res.status_code == 200
    items = res.json()["items"]
    incident = next((item for item in items if item["id"] == "INC-WKT-1"), None)
    assert incident is not None
    assert incident["lat"] == pytest.approx(3.8012)
    assert incident["lon"] == pytest.approx(98.6890)


def test_incidents_prefers_concrete_lat_lon_over_wkt(monkeypatch):
    """S4/S7: concrete lat/lon columns (migration 010) take precedence over WKT 'location'."""
    import app.db.supabase_client as sb_client_module

    class FakeResult:
        data = [{
            "incident_id": "INC-COORD-1",
            "title": "Longsor Sitinjau Lauik",
            "type": "landslide",
            "severity": "critical",
            "status": "validated",
            "confidence": 0.93,
            "created_at": "2026-10-02T00:00:00Z",
            "location": "POINT(100.5200 -0.9450)",
            "lat": -0.9451,
            "lon": 100.5201,
            "description": "Tebing runtuh",
            "affected_area": "Padang",
        }]

    class FakeQuery:
        def select(self, columns, *args, **kwargs):
            assert "location" in columns
            assert "lat" in columns and "lon" in columns
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def execute(self):
            return FakeResult()

    class FakeClient:
        def table(self, name):
            assert name == "incidents"
            return FakeQuery()

    monkeypatch.setattr(sb_client_module, "get_client", lambda: FakeClient())

    res = client.get("/api/v1/incidents?limit=5")
    assert res.status_code == 200
    items = res.json()["items"]
    incident = next((item for item in items if item["id"] == "INC-COORD-1"), None)
    assert incident is not None
    assert incident["lat"] == pytest.approx(-0.9451)
    assert incident["lon"] == pytest.approx(100.5201)


def test_incidents_falls_back_to_legacy_projection(monkeypatch):
    """S4: when the lat/lon projection fails (pre-migration schema), the legacy WKT-only query is used."""
    import app.db.supabase_client as sb_client_module

    class FakeResult:
        data = [{
            "incident_id": "INC-LEGACY-1",
            "title": "Banjir Jalinsum",
            "type": "flood",
            "severity": "high",
            "status": "validated",
            "confidence": 0.88,
            "created_at": "2026-10-03T00:00:00Z",
            "location": "POINT(99.1625 3.3285)",
            "description": "Genangan",
            "affected_area": "Tebing Tinggi",
        }]

    class FakeQuery:
        def select(self, columns, *args, **kwargs):
            if "lat" in columns or "lon" in columns:
                raise RuntimeError("column incidents.lat does not exist")
            assert "location" in columns
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def execute(self):
            return FakeResult()

    class FakeClient:
        def table(self, name):
            assert name == "incidents"
            return FakeQuery()

    monkeypatch.setattr(sb_client_module, "get_client", lambda: FakeClient())

    res = client.get("/api/v1/incidents?limit=5")
    assert res.status_code == 200
    items = res.json()["items"]
    incident = next((item for item in items if item["id"] == "INC-LEGACY-1"), None)
    assert incident is not None
    assert incident["lat"] == pytest.approx(3.3285)
    assert incident["lon"] == pytest.approx(99.1625)


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
    dispatcher_token = create_guest_token(role=ROLE_DISPATCHER)
    res_post = client.post(
        "/api/v1/approvals",
        json=approval_payload,
        headers={"Authorization": f"Bearer {dispatcher_token}"},
    )
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


def test_simulate_crisis_stream_endpoint():
    """Verify that POST /api/v1/simulate/stream returns real-time SSE stream events."""
    payload = {
        "title": "Banjir Jalinsum Lubuk Pakam",
        "type": "flood",
        "severity": "critical",
        "lat": 3.56,
        "lon": 98.87,
        "region": "north_sumatra",
        "commodity": "cabai_merah",
        "cargo_tonnage": 10.0,
        "has_bkhit_cert": True
    }
    
    # Test /api/v1/simulate/stream
    res = client.post("/api/v1/simulate/stream", json=payload)
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]
    assert "data: " in res.text
    assert "simulation_started" in res.text
    assert "node_update" in res.text
    assert "simulation_complete" in res.text

    # Verify AGENT_STATUS_STORE updated
    res_status = client.get("/api/v1/agents/status")
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert "agents" in status_data
    assert len(status_data["agents"]) == 6