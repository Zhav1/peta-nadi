import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.routers.commodity_router import get_commodity_prices, CommodityPriceResponse
import app.db.supabase_client as sb_client_module

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_commodity_cache():
    """Phase 5: the 60s prices/spikes cache must not leak across tests
    (live-data tests run before mock-data tests in this file)."""
    from app.routers.commodity_router import clear_commodity_cache

    clear_commodity_cache()
    yield
    clear_commodity_cache()


@pytest.mark.asyncio
async def test_get_commodity_prices_aggregate_distinct_dates():
    """
    Test that querying without region aggregates across reporting provinces
    and returns exactly `limit` distinct chronological dates with region="sumatra_aggregate".
    Validates omission of region, region=None, region='', and whitespace.
    """
    # 1. Exact invocation required by Phase 120 spec (omitting region parameter)
    res_omitted = await get_commodity_prices(commodity="beras", limit=7)
    assert isinstance(res_omitted, CommodityPriceResponse)
    assert len(res_omitted.items) == 7
    distinct_dates = set(item.time.date() for item in res_omitted.items)
    assert len(distinct_dates) == 7
    assert all(item.region == "sumatra_aggregate" for item in res_omitted.items)

    # 2. Explicit region=None
    res_none = await get_commodity_prices(commodity="beras", region=None, limit=7)
    assert len(res_none.items) == 7
    assert len(set(item.time.date() for item in res_none.items)) == 7

    # 3. Empty string region=""
    res_empty = await get_commodity_prices(commodity="beras", region="", limit=7)
    assert len(res_empty.items) == 7
    assert len(set(item.time.date() for item in res_empty.items)) == 7

    # 4. Whitespace region="   "
    res_ws = await get_commodity_prices(commodity="beras", region="   ", limit=7)
    assert len(res_ws.items) == 7
    assert len(set(item.time.date() for item in res_ws.items)) == 7

    # Assert metadata indicates aggregate
    for item in res_omitted.items:
        assert item.metadata.get("province") == "Seluruh Sumatera (Agregat PIHPS)"
        assert item.metadata.get("sample_count", 0) >= 1


@pytest.mark.asyncio
async def test_get_commodity_prices_single_province():
    """
    Test that specifying a region returns only records for that single province.
    """
    res_north = await get_commodity_prices(commodity="beras", region="north_sumatra", limit=7)
    assert isinstance(res_north, CommodityPriceResponse)
    assert len(res_north.items) > 0
    assert all(item.region == "north_sumatra" for item in res_north.items)

    res_west = await get_commodity_prices(commodity="beras", region="west_sumatra", limit=7)
    assert isinstance(res_west, CommodityPriceResponse)
    assert len(res_west.items) > 0
    assert all(item.region == "west_sumatra" for item in res_west.items)


def test_http_endpoint_commodity_prices_aggregate():
    """
    Verify the HTTP endpoint /api/v1/commodities/prices correctly outputs
    aggregated distinct dates and proper headers via TestClient.
    """
    response = client.get("/api/v1/commodities/prices?commodity=beras&limit=7")
    assert response.status_code == 200
    data = response.json()
    items = data["items"]
    assert len(items) == 7
    dates = [item["time"][:10] for item in items]
    assert len(set(dates)) == 7
    assert all(item["region"] == "sumatra_aggregate" for item in items)


def test_mock_aggregation_averaging(monkeypatch):
    """
    Deterministic unit test using mock Supabase data to verify average price calculation.
    """
    mock_records = [
        {"commodity": "beras", "region": "north_sumatra", "price_idr": 15000.0, "time": "2026-10-18T00:00:00Z", "source": "pihps"},
        {"commodity": "beras", "region": "west_sumatra", "price_idr": 17000.0, "time": "2026-10-18T00:00:00Z", "source": "pihps"},
        {"commodity": "beras", "region": "south_sumatra", "price_idr": 16000.0, "time": "2026-10-18T00:00:00Z", "source": "pihps"},
        {"commodity": "beras", "region": "north_sumatra", "price_idr": 14000.0, "time": "2026-10-11T00:00:00Z", "source": "pihps"},
        {"commodity": "beras", "region": "south_sumatra", "price_idr": 16000.0, "time": "2026-10-11T00:00:00Z", "source": "pihps"},
    ]

    class MockQuery:
        def select(self, *a, **kw): return self
        def order(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def eq(self, *a, **kw): return self
        def execute(self):
            class R: data = mock_records
            return R()

    class MockClient:
        def table(self, name): return MockQuery()

    monkeypatch.setattr(sb_client_module, "get_client", lambda: MockClient())

    response = client.get("/api/v1/commodities/prices?commodity=beras&limit=7")
    assert response.status_code == 200
    data = response.json()
    items = data["items"]
    assert len(items) == 2

    # Latest date 2026-10-18: avg of (15000, 17000, 16000) = 16000.0
    assert items[0]["time"].startswith("2026-10-18")
    assert items[0]["price_idr"] == 16000.0
    assert items[0]["metadata"]["sample_count"] == 3
    assert items[0]["region"] == "sumatra_aggregate"

    # Previous date 2026-10-11: avg of (14000, 16000) = 15000.0
    assert items[1]["time"].startswith("2026-10-11")
    assert items[1]["price_idr"] == 15000.0
    assert items[1]["metadata"]["sample_count"] == 2


def test_mock_aggregation_province_deduplication(monkeypatch):
    """
    Verify that if a province reports multiple prices on the same date,
    it is deduplicated so that each reporting province has equal weight.
    """
    mock_records = [
        # North Sumatra reported twice on 2026-10-18 (e.g. scraper retry)
        {"commodity": "beras", "region": "north_sumatra", "price_idr": 15000.0, "time": "2026-10-18T00:00:00Z", "source": "pihps"},
        {"commodity": "beras", "region": "north_sumatra", "price_idr": 15000.0, "time": "2026-10-18T01:00:00Z", "source": "pihps"},
        # West Sumatra reported once on 2026-10-18
        {"commodity": "beras", "region": "west_sumatra", "price_idr": 17000.0, "time": "2026-10-18T00:00:00Z", "source": "pihps"},
    ]

    class MockQuery:
        def select(self, *a, **kw): return self
        def order(self, *a, **kw): return self
        def limit(self, *a, **kw): return self
        def eq(self, *a, **kw): return self
        def execute(self):
            class R: data = mock_records
            return R()

    class MockClient:
        def table(self, name): return MockQuery()

    monkeypatch.setattr(sb_client_module, "get_client", lambda: MockClient())

    response = client.get("/api/v1/commodities/prices?commodity=beras&limit=7")
    assert response.status_code == 200
    data = response.json()
    items = data["items"]
    assert len(items) == 1
    # Average should be (15000 + 17000) / 2 = 16000.0, NOT (15000+15000+17000)/3 = 15666.67
    assert items[0]["price_idr"] == 16000.0
    assert items[0]["metadata"]["sample_count"] == 2

