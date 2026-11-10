"""Phase 174 — provider-budget starvation must not make sections permanently stale.

Pins the three fixes for the production incident (the dashboard snapshot had 9
of 14 sections stale for days; BMKG view valid_until 2026-11-06, fire_hotspots
published count 0 sourced "nasa-firms-api"):

1. PROVIDER_BUDGET_DAILY_LIMITS must be at least 2x the cadence-derived need
   (attempts/day = 86400 / cadence; units/attempt read from the real adapters)
   — the old caps equalled the cadence exactly and denied the rest of the day.
2. A budget denial keeps last-good data with status stale and is retried on the
   next tick (short in-memory backoff), never blocked until UTC midnight.
3. FIRMS: a keyed header-only (0 row) CSV is cross-checked against the keyless
   CSV before count 0; a denied/errored upstream never publishes count 0.
"""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.adapters import bmkg_adapter, nasa_firms_adapter, open_meteo_adapter, tomtom_adapter
from app.config import get_settings
from app.routers import routing_router
from app.services import public_operational_cache as operational_cache


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def cache_store(monkeypatch):
    store = {}
    monkeypatch.setattr(operational_cache, "cache_get", lambda key: store.get(key))
    monkeypatch.setattr(operational_cache, "cache_set", lambda key, value, ex=None: store.__setitem__(key, value))
    monkeypatch.setattr(operational_cache, "_read_durable", lambda key: None)
    monkeypatch.setattr(operational_cache, "_write_durable", lambda key, payload, source: True)
    # backoff state is process-global; isolate per test
    _denial_after = {}
    monkeypatch.setattr(operational_cache, "_denial_retry_after", _denial_after)
    return store


async def _allow_budget(source, *, units=1, request_id=None):
    return True


async def _deny_budget(source, *, units=1, request_id=None):
    return False


def _seed_record(store, source: str, *, events=1, age_hours=0) -> dict:
    """A last-known-good source record in the composer's own shape."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    fetched_at = now - timedelta(hours=age_hours)
    events_list = [
        {
            "source": "VIIRS_SNPP_NRT", "event_type": "wildfire", "severity": "medium",
            "lat": str(3.6 + i * 0.1), "lon": str(98.6 + i * 0.1),
            "coordinates": [98.6 + i * 0.1, 3.6 + i * 0.1],
            "frp": 12.5, "confidence": 80, "conf": "nominal",
            "title": f"Hotspot VIIRS FRP 12.5MW#{i}", "ts": fetched_at.isoformat(),
        }
        for i in range(events)
    ] if events else []
    record = {
        "source": source,
        "provider_source": "nasa-firms-csv" if source == "firms" else source,
        "raw": "csv",
        "events": events_list,
        "fetched_at": fetched_at.isoformat(),
        "observed_at": fetched_at.isoformat(),
        "valid_until": (fetched_at + timedelta(seconds=3600)).isoformat(),
        "status": "ok" if events else "empty",
        "error": None,
    }
    store[f"public_operational_raw:v1:{source}"] = json.dumps(record)
    return record


# ---------------------------------------------------------------------------
# 1. headroom arithmetic
# ---------------------------------------------------------------------------

def _daily_limits() -> dict[str, int]:
    from app.services.provider_budget import _daily_limits as parse

    return parse()


CADENCE = {"bmkg": 300, "bmkg_cap": 300, "tomtom": 3600, "open_meteo": 21600, "firms": 10800}


def test_budget_limits_have_double_cadence_headroom():
    limits = _daily_limits()
    # bmkg: 1 earthquake + 1 known-hub forecast reserve per 5-minute attempt.
    bmkg_units = 1 + sum(1 for v in bmkg_adapter.BMKGAdapter().hub_adm4.values() if v)
    need = bmkg_units * (86400 // CADENCE["bmkg"])
    assert limits["bmkg"] >= 2 * need, (limits["bmkg"], bmkg_units, need)
    # open_meteo: one bulk reserve of len(grid) locations per 6h attempt.
    need = len(open_meteo_adapter.SUMATRA_GRID) * (86400 // CADENCE["open_meteo"])
    assert limits["open_meteo"] >= 2 * need, (limits["open_meteo"], need)
    # tomtom: one flow checkpoint reserve per checkpoint per hourly attempt.
    need = len(tomtom_adapter.TomTomAdapter.CHECKPOINTS) * (86400 // CADENCE["tomtom"])
    assert limits["tomtom"] >= 2 * need, (limits["tomtom"], need)
    # firms: up to 1 keyed API + 4 keyless CSV candidates per 3h attempt.
    need = (1 + len(nasa_firms_adapter.NASAFIRMSAdapter().keyless_csv_urls())) * (86400 // CADENCE["firms"])
    assert limits["firms"] >= 2 * need, (limits["firms"], need)
    # bmkg_cap: at least the daily attempt count itself.
    assert limits["bmkg_cap"] >= 2 * (86400 // CADENCE["bmkg_cap"])


# ---------------------------------------------------------------------------
# 2. denial keeps last-good data; retried next tick
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_budget_denial_keeps_last_good_data_with_stale_status(cache_store):
    previous = _seed_record(cache_store, "firms", events=2)

    sections = await operational_cache.refresh_public_operational_cache(
        source="firms", reserve_provider_budget=_deny_budget
    )

    fire = sections["fire_hotspots"]
    assert fire["status"] == "stale"
    assert fire["data"]["count"] == 2  # last-good count, never a fabricated 0
    assert fire["data"]["hotspots"] == previous["events"]
    assert "provider budget" in (fire["error"] or "")

    raw = json.loads(cache_store["public_operational_raw:v1:firms"])
    assert raw["status"] == "stale"
    assert raw["events"] == previous["events"]


@pytest.mark.asyncio
async def test_denial_backoff_retries_on_next_tick_not_utc_midnight(cache_store, monkeypatch):
    # warm cache: a denial keeps last-good data (a cold-start denial raises
    # instead — see test_denied_firms_never_publishes_a_zero_count)
    _seed_record(cache_store, "firms", events=1)

    # first refresh denied -> denial recorded
    await operational_cache.refresh_public_operational_cache(
        source="firms", reserve_provider_budget=_deny_budget
    )
    assert operational_cache._denial_retry_after["firms"]

    calls = []

    async def must_not_fetch(self, *, reserve_provider_budget=None):
        calls.append("fetch")
        return ""

    monkeypatch.setattr(nasa_firms_adapter.NASAFIRMSAdapter, "fetch", must_not_fetch)

    # inside the backoff window the adapter is not hammered again
    await operational_cache.refresh_public_operational_cache(
        source="firms", reserve_provider_budget=_deny_budget
    )
    assert calls == []

    # a later tick (> 120s backoff) does retry the source, recover, and clear
    operational_cache._denial_retry_after["firms"] = 0.0
    calls = []

    header = (
        "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,"
        "instrument,confidence,version,bright_ti5,frp,daynight"
    )
    keyless_csv = (
        header + "\n3.60,98.60,340.1,0.4,0.4,2026-11-10,0612,N,VIIRS,nominal,2.0NRT,295.2,12.5,D\n"
    )

    async def fake_fetch(self, *, reserve_provider_budget=None):
        calls.append("fetch")
        return keyless_csv

    monkeypatch.setattr(nasa_firms_adapter.NASAFIRMSAdapter, "fetch", fake_fetch)

    sections = await operational_cache.refresh_public_operational_cache(
        source="firms", reserve_provider_budget=_allow_budget
    )
    assert calls == ["fetch"]
    assert sections["fire_hotspots"]["status"] == "ok"
    assert sections["fire_hotspots"]["data"]["count"] == 1


# ---------------------------------------------------------------------------
# 3. FIRMS 0-row cross-check; denied never publishes count 0
# ---------------------------------------------------------------------------

HEADER = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_ti5,frp,daynight"
)
HEADER_ONLY = HEADER + "\n"
KEYED_EVENT_CSV = (
    HEADER
    + "\n3.60,98.60,340.1,0.4,0.4,2026-11-10,0612,N,VIIRS,nominal,2.0NRT,295.2,210.0,D\n"
)


def _keyed_env(monkeypatch, *, api_raw: str):
    monkeypatch.setattr(nasa_firms_adapter, "settings", SimpleNamespace(nasa_firms_map_key="test-key"))

    async def fake_fetch(self, *, reserve_provider_budget=None):
        return api_raw

    monkeypatch.setattr(nasa_firms_adapter.NASAFIRMSAdapter, "fetch", fake_fetch)

    urls = []

    async def fake_http(url: str, timeout: float = 15.0) -> str:
        urls.append(url)
        raise AssertionError(f"keyless CSV transport not configured in test: {url}")

    return urls, fake_http


@pytest.mark.asyncio
async def test_keyed_header_only_csv_is_crosschecked_against_keyless(cache_store, monkeypatch):
    urls, _ = _keyed_env(monkeypatch, api_raw=HEADER_ONLY)

    async def csv_transport(url: str, timeout: float = 15.0) -> str:
        urls.append(url)
        return KEYED_EVENT_CSV

    monkeypatch.setattr(nasa_firms_adapter, "_http_get_text", csv_transport)

    sections = await operational_cache.refresh_public_operational_cache(
        source="firms", reserve_provider_budget=_allow_budget
    )

    assert urls, "keyless CSV must be consulted when the keyed API yields 0 rows"
    fire = sections["fire_hotspots"]
    # the cross-check data is served, never the API's 0
    assert fire["data"]["count"] == 1
    assert fire["data"]["source"] == "nasa-firms-csv"
    assert "cross-check" in (fire["error"] or "")
    assert fire["status"] == "ok"


@pytest.mark.asyncio
async def test_keyed_zero_and_keyless_zero_is_verified_empty(cache_store, monkeypatch):
    urls, fake_http = _keyed_env(monkeypatch, api_raw=HEADER_ONLY)

    async def csv_transport(url: str, timeout: float = 15.0) -> str:
        urls.append(url)
        # a valid CSV file whose only row is outside Sumatra
        return HEADER + "\n-7.50,110.00,340.1,0.4,0.4,2026-11-10,0612,N,VIIRS,nominal,2.0NRT,295.2,15.0,D\n"

    monkeypatch.setattr(nasa_firms_adapter, "_http_get_text", csv_transport)

    sections = await operational_cache.refresh_public_operational_cache(
        source="firms", reserve_provider_budget=_allow_budget
    )

    fire = sections["fire_hotspots"]
    assert fire["status"] == "empty"
    assert fire["data"]["count"] == 0
    assert "cross-check" in (fire["error"] or "")


@pytest.mark.asyncio
async def test_denied_firms_never_publishes_a_zero_count(cache_store, monkeypatch):
    _keyed_env(monkeypatch, api_raw=HEADER_ONLY)

    async def csv_transport(url: str, timeout: float = 15.0) -> str:
        raise AssertionError("a denied budget must not consume the CSV fallback either")

    monkeypatch.setattr(nasa_firms_adapter, "_http_get_text", csv_transport)
    # no last-good record exists -> cold start
    with pytest.raises(RuntimeError, match="provider budget"):
        await operational_cache.refresh_public_operational_cache(
            source="firms", reserve_provider_budget=_deny_budget
        )


@pytest.mark.asyncio
async def test_denied_firms_warm_cache_is_stale_on_the_route(cache_store, monkeypatch):
    _seed_record(cache_store, "firms", events=1)
    # set an expired validity so the reader itself marks the section stale
    record = json.loads(cache_store["public_operational_raw:v1:firms"])
    record["valid_until"] = (
        datetime.now(timezone.utc) - timedelta(hours=2)
    ).isoformat()
    cache_store["public_operational_raw:v1:firms"] = json.dumps(record)

    await operational_cache.refresh_public_operational_cache(
        source="firms", reserve_provider_budget=_deny_budget
    )

    snapshot = json.loads(cache_store[operational_cache.CACHE_KEY])
    assert snapshot["sections"]["fire_hotspots"]["status"] == "stale"
    assert snapshot["sections"]["fire_hotspots"]["data"]["count"] == 1


# ---------------------------------------------------------------------------
# 4. route envelope: degraded/cold sections must not materialise count 0
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_route_degraded_section_keeps_null_count(cache_store, monkeypatch):
    monkeypatch.setattr(routing_router, "coalesce_background_refresh", lambda key, fn: None)
    monkeypatch.setattr(routing_router, "read_public_operational_cache", operational_cache.read_public_operational_cache)
    cache_store[operational_cache.CACHE_KEY] = json.dumps({
        "sections": {
            "fire_hotspots": {
                "status": "degraded",
                "data": {"hotspots": [], "count": None, "total": None, "capped": False,
                         "source": "nasa-firms-csv", "window_hours": 24},
                "error": "NASA FIRMS keyless CSV denied by provider budget",
            }
        }
    })

    app = FastAPI()
    app.include_router(routing_router.router, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/fire/hotspots")

    body = res.json()
    assert res.status_code == 200
    assert body["status"] == "degraded"
    assert body["count"] is None
    assert "provider budget" in (body["reason"] or "")


@pytest.mark.asyncio
async def test_route_cold_miss_baseline_is_degraded_not_zero(cache_store, monkeypatch):
    monkeypatch.setattr(routing_router, "coalesce_background_refresh", lambda key, fn: None)
    monkeypatch.setattr(routing_router, "read_public_operational_cache", operational_cache.read_public_operational_cache)

    app = FastAPI()
    app.include_router(routing_router.router, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/fire/hotspots")

    body = res.json()
    assert res.status_code == 200
    assert body["status"] == "degraded"
    assert body["count"] is None
    assert body["source"] == "nasa-firms-baseline"
