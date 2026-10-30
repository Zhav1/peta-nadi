import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth.supabase_auth import create_guest_token, ROLE_DISPATCHER

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_commodity_cache():
    """Phase 5: the 60s prices/spikes cache must not leak across tests."""
    from app.routers.commodity_router import clear_commodity_cache

    clear_commodity_cache()
    yield
    clear_commodity_cache()


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


def test_incidents_ewkb_location_parsing():
    """S4: PostgREST EWKB hex Points (SRID 4326, both endiannesses) parse into (lat, lon)."""
    import struct

    from app.routers.incidents import _parse_ewkb_point_hex, _parse_location_coords

    little_endian = "0101000020E6100000C217265305AB584034A2B437F8C20C40"
    assert _parse_ewkb_point_hex(little_endian) == pytest.approx((3.5952, 98.6722), abs=1e-4)

    big_endian = "00" + "20000001" + "000010E6" + struct.pack(">dd", 98.6722, 3.5952).hex().upper()
    assert _parse_ewkb_point_hex(big_endian) == pytest.approx((3.5952, 98.6722), abs=1e-4)

    # SRID-less WKB hex and a non-WGS84 SRID
    assert _parse_ewkb_point_hex("0101000000C217265305AB584034A2B437F8C20C40") == pytest.approx(
        (3.5952, 98.6722), abs=1e-4
    )
    assert _parse_ewkb_point_hex("0101000020E6100000C217265305AB584034A2B437F8C20C40") == pytest.approx(
        (3.5952, 98.6722), abs=1e-4
    )
    assert _parse_ewkb_point_hex("0101000020E8640000C217265305AB584034A2B437F8C20C40") == (None, None)
    assert _parse_ewkb_point_hex(None) == (None, None)
    assert _parse_ewkb_point_hex("") == (None, None)
    assert _parse_ewkb_point_hex("not-an-ewkb-point") == (None, None)
    assert _parse_ewkb_point_hex("0101000020E610") == (None, None)

    # WKT still works through the combined parser
    assert _parse_location_coords("POINT(98.6667 3.5833)") == pytest.approx((3.5833, 98.6667))
    assert _parse_location_coords(little_endian) == pytest.approx((3.5952, 98.6722), abs=1e-4)


def test_incidents_ewkb_rows_map_to_lat_lon_without_warning(monkeypatch, caplog):
    """S4: EWKB 'location' rows surface as float coords and emit no 'unparseable' warning."""
    import logging

    import app.db.supabase_client as sb_client_module

    class FakeResult:
        data = [{
            "incident_id": "INC-EWKB-1",
            "title": "Banjir Belawan",
            "type": "flood",
            "severity": "high",
            "status": "validated",
            "confidence": 0.9,
            "created_at": "2026-10-04T00:00:00Z",
            "location": "0101000020E6100000C217265305AB584034A2B437F8C20C40",
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

    with caplog.at_level(logging.WARNING, logger="app.routers.incidents"):
        res = client.get("/api/v1/incidents?limit=5")

    assert res.status_code == 200
    items = res.json()["items"]
    incident = next((item for item in items if item["id"] == "INC-EWKB-1"), None)
    assert incident is not None
    assert incident["lat"] == pytest.approx(3.5952, abs=1e-4)
    assert incident["lon"] == pytest.approx(98.6722, abs=1e-4)
    assert not [rec for rec in caplog.records if "unparseable" in rec.getMessage()]


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
        "action": "REJECT",
        "tactical_action": "REROUTE",
        "notes": "Incident review only; no trip is modified.",
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
    assert post_data["status"] in {"decision_recorded", "local_queued"}
    assert post_data.get("travel_id") is None


def test_commodity_endpoints():
    """Verify commodity prices endpoint returns structured price points."""
    res_prices = client.get("/api/v1/commodities/prices?commodity=beras&limit=10")
    assert res_prices.status_code == 200
    data = res_prices.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) > 0
    res_spikes = client.get("/api/v1/commodities/spikes")
    assert res_spikes.status_code == 200
    spikes_data = res_spikes.json()
    assert "spikes" in spikes_data
    assert "total" in spikes_data
    assert isinstance(spikes_data["spikes"], list)


def test_commodity_spikes_calculation_and_guard(monkeypatch):
    """Verify D5: % change vs 30-day baseline with min-records guard (honest [] if insufficient)."""
    import app.db.supabase_client as sb_client_module

    # Test 1: insufficient records (< 3) returns honest []
    class InsufficientQuery:
        def select(self, *a, **kw): return self
        def gte(self, *a, **kw): return self
        def order(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def eq(self, *a, **kw): return self
        def execute(self):
            class R: data = [{"commodity": "cabai_merah", "region": "north_sumatra", "price_idr": 60000.0, "time": "2026-10-10T00:00:00Z"}]
            return R()

    class FakeClientInsufficient:
        def table(self, name): return InsufficientQuery()

    monkeypatch.setattr(sb_client_module, "get_client", lambda: FakeClientInsufficient())
    res1 = client.get("/api/v1/commodities/spikes")
    assert res1.status_code == 200
    assert res1.json()["spikes"] == []
    assert res1.json()["total"] == 0

    # Phase 2 uses a different mock backend: drop the phase-1 cached [] first.
    from app.routers.commodity_router import clear_commodity_cache

    clear_commodity_cache()

    # Test 2: sufficient records (>= 3) computes percent change
    class SufficientQuery:
        def select(self, *a, **kw): return self
        def gte(self, *a, **kw): return self
        def order(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def eq(self, *a, **kw): return self
        def execute(self):
            class R:
                data = [
                    {"commodity": "cabai_merah", "region": "north_sumatra", "price_idr": 60000.0, "time": "2026-10-10T12:00:00Z"},
                    {"commodity": "cabai_merah", "region": "north_sumatra", "price_idr": 48000.0, "time": "2026-10-05T12:00:00Z"},
                    {"commodity": "cabai_merah", "region": "north_sumatra", "price_idr": 50000.0, "time": "2026-10-01T12:00:00Z"},
                ]
            return R()

    class FakeClientSufficient:
        def table(self, name): return SufficientQuery()

    monkeypatch.setattr(sb_client_module, "get_client", lambda: FakeClientSufficient())
    res2 = client.get("/api/v1/commodities/spikes")
    assert res2.status_code == 200
    spikes2 = res2.json()["spikes"]
    assert len(spikes2) == 1
    assert spikes2[0]["commodity"] == "cabai_merah"
    assert spikes2[0]["current_price"] == 60000.0
    # baseline is (60000 + 48000 + 50000) / 3 = 52666.67
    assert spikes2[0]["baseline_price"] == pytest.approx(52666.67, 0.1)
    # spike_pct is ((60000 - 52666.67) / 52666.67) * 100 = 13.9%
    assert spikes2[0]["spike_pct"] == pytest.approx(13.9, 0.2)
    assert spikes2[0]["severity"] == "high"


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