"""Phase 168 — FIRMS keyless CSV fallback + tri-state hotspot envelope.

Pins the fix for Titik Panas rendering empty because ``NASA_FIRMS_MAP_KEY`` was
unset in production. GET /api/v1/fire/hotspots must now:

* use the keyless public Indonesia CSV when no MAP_KEY exists (24h default),
* fall back to the MAP_KEY API when a key is present (and not touch the CSV),
* return ``ok`` with the true in-bbox count, ``empty`` for a healthy zero,
  ``stale`` for last-known-good, and ``degraded`` with ``count: null`` when
  there is no data at all — never a fabricated 0 or a fabricated point.

No new deps: the HTTP layer is monkeypatched on the adapter module and Redis is
an injected dict, so nothing here touches the network or a live Redis.
"""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import FastAPI

from app.adapters import nasa_firms_adapter as adapter_module
from app.routers import routing_router


HEADER = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_ti5,frp,daynight"
)
VIIRS_URL_24H = "SUOMI_VIIRS_C2_Indonesia_24h.csv"


def _csv_row(
    lat: float,
    lon: float,
    frp: float = 10.0,
    confidence: str = "nominal",
    acq: str = "2026-10-27",
    clock: str = "0612",
    satellite: str = "N",
    instrument: str = "VIIRS",
) -> str:
    return (
        f"{lat},{lon},340.1,0.4,0.4,{acq},{clock},{satellite},{instrument},"
        f"{confidence},2.0NRT,295.2,{frp},D"
    )


def _csv(rows) -> str:
    return HEADER + "\n" + "\n".join(rows) + "\n"


IN_BBOX_ROWS = [
    _csv_row(3.60, 98.60, 12.5),  # Medan
    _csv_row(-2.98, 104.76, 210.0, confidence="high"),  # Palembang
    _csv_row(-5.45, 105.30, 8.0),  # Bandar Lampung
]
OUT_OF_BBOX_ROW = _csv_row(-7.50, 110.00, 15.0)  # Central Java


def _hotspot(lat: float, lon: float, frp: float = 10.0) -> dict:
    """A persisted last-known-good hotspot in the endpoint's own shape."""
    return {
        "coordinates": [lon, lat],
        "lon": lon,
        "lat": lat,
        "confidence": 80,
        "frp": frp,
        "conf": "nominal",
        "dist_to_corridor_km": 1.3,
        "severity": "high",
        "radius_km": 2.5,
        "title": f"Hotspot VIIRS FRP {frp}MW",
        "source": "VIIRS_SNPP_NRT",
        "near_segment": "Medan Hub",
        "ts": "2026-10-27T00:00:00+00:00",
        "acq_date": "2026-10-27",
        "acq_time": "0612",
        "satellite": "N",
        "instrument": "VIIRS",
        "daynight": "D",
        "type": "wildfire",
    }


@pytest.fixture
def firms_env(monkeypatch):
    """Isolate Redis + settings; each test chooses the HTTP layer outcome."""
    store: dict[str, str] = {}

    def fake_get(key):
        return store.get(key)

    def fake_set(key, value, ex=None):
        store[key] = value

    monkeypatch.setattr(routing_router, "cache_get", fake_get)
    monkeypatch.setattr(routing_router, "cache_set", fake_set)

    settings = SimpleNamespace(nasa_firms_map_key="")
    monkeypatch.setattr(routing_router, "get_settings", lambda: settings)

    # Only the MAP_KEY API path uses Redis (adapter-level dedup).
    fake_redis = MagicMock()
    fake_redis.get.return_value = None
    monkeypatch.setattr(adapter_module, "get_redis", lambda: fake_redis)

    def serve_csv(text_or_exc):
        calls: list[str] = []

        async def fake_http_get_text(url: str, timeout: float = 15.0) -> str:
            calls.append(url)
            if isinstance(text_or_exc, Exception):
                raise text_or_exc
            return text_or_exc

        monkeypatch.setattr(adapter_module, "_http_get_text", fake_http_get_text)
        return calls

    return {
        "store": store,
        "monkeypatch": monkeypatch,
        "serve_csv": serve_csv,
        "set_key": lambda value: setattr(settings, "nasa_firms_map_key", value),
    }


async def _get_hotspots() -> dict:
    app = FastAPI()
    app.include_router(routing_router.router, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/fire/hotspots")
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------------------
# 1. Keyless CSV: ok + true in-bbox count, out-of-bbox row excluded
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_keyless_csv_serves_bbox_filtered_hotspots(firms_env):
    calls = firms_env["serve_csv"](_csv(IN_BBOX_ROWS + [OUT_OF_BBOX_ROW]))

    body = await _get_hotspots()

    assert body["status"] == "ok"
    assert body["count"] == 3
    assert body["total"] == 3
    assert body["capped"] is False
    assert body["source"] == "nasa-firms-csv"
    assert body["window_hours"] == 24
    assert body["reason"] is None
    assert body["updated_at"]
    assert len(body["hotspots"]) == 3

    # The Java row never reaches the client.
    assert {round(h["lat"], 2) for h in body["hotspots"]} == {3.6, -2.98, -5.45}

    # Exact UI-shaped properties the map/heat layers consume.
    hotspot = body["hotspots"][0]
    for key in (
        "lat", "lon", "coordinates", "frp", "confidence", "conf", "severity",
        "radius_km", "acq_date", "acq_time", "satellite", "instrument",
        "daynight", "type", "title", "source",
    ):
        assert key in hotspot, f"missing hotspot property {key}"
    assert hotspot["coordinates"] == [hotspot["lon"], hotspot["lat"]]

    # Highest FRP renders first (render priority) and VIIRS 24h was used.
    assert body["hotspots"][0]["frp"] == 210.0
    assert calls and calls[0].endswith(VIIRS_URL_24H)


# ---------------------------------------------------------------------------
# 2. Keyless CSV unreachable -> degraded, null count, truthy reason
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_keyless_csv_failure_is_degraded_not_zero(firms_env):
    firms_env["serve_csv"](httpx.ConnectError("firms.modaps.eosdis.nasa.gov unreachable"))

    body = await _get_hotspots()

    assert body["status"] == "degraded"
    assert body["count"] is None
    assert body["total"] == 0
    assert body["capped"] is False
    assert body["hotspots"] == []
    assert body["reason"], "degraded must carry a human reason"
    assert body["source"] == "nasa-firms-csv"


# ---------------------------------------------------------------------------
# 3. Healthy CSV but zero in-bbox rows -> empty (verified zero, not unknown)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_all_rows_outside_sumatra_is_empty(firms_env):
    firms_env["serve_csv"](_csv([OUT_OF_BBOX_ROW, _csv_row(-6.80, 109.00)]))

    body = await _get_hotspots()

    assert body["status"] == "empty"
    assert body["count"] == 0
    assert body["total"] == 0
    assert body["hotspots"] == []
    assert body["reason"] == routing_router.FIRMS_EMPTY_REASON


# ---------------------------------------------------------------------------
# 4. MAP_KEY present -> API path chosen, keyless CSV never called
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_map_key_uses_api_and_never_calls_csv(firms_env):
    firms_env["set_key"]("test-map-key")

    async def csv_must_not_run(url: str, timeout: float = 15.0) -> str:
        raise AssertionError(f"keyless CSV must not be called with a MAP_KEY: {url}")

    firms_env["monkeypatch"].setattr(adapter_module, "_http_get_text", csv_must_not_run)

    async def fake_fetch(self):
        return _csv(IN_BBOX_ROWS)

    async def fake_parse(self, raw, window_hours=24):
        return [
            {
                "lat": "3.60",
                "lon": "98.60",
                "frp": 12.5,
                "conf": "nominal",
                "severity": "high",
                "dist_to_corridor_km": 1.2,
                "title": "API hotspot",
                "near_segment": "Medan Hub",
                "ts": "2026-10-27T00:00:00+00:00",
            }
        ]

    firms_env["monkeypatch"].setattr(routing_router.NASAFIRMSAdapter, "fetch", fake_fetch)
    # Phase 173.6: the counter parses the API CSV with the stateless parser
    # (parse() applies the poller's Redis dedup and collapses to 0).
    firms_env["monkeypatch"].setattr(
        routing_router.NASAFIRMSAdapter, "parse_keyless_csv", fake_parse
    )

    body = await _get_hotspots()

    assert body["source"] == "nasa-firms-api"
    assert body["status"] == "ok"
    assert body["count"] == 1
    assert body["hotspots"][0]["title"] == "API hotspot"


# ---------------------------------------------------------------------------
# 5. CSV fails but last-known-good exists -> stale, count preserved
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_failed_csv_serves_stale_last_known_good(firms_env):
    stale_at = (datetime.now(timezone.utc) - timedelta(hours=2, minutes=30)).isoformat()
    firms_env["store"][routing_router.FIRMS_LAST_GOOD_KEY] = json.dumps(
        {
            "hotspots": [_hotspot(3.6, 98.6, 15.0), _hotspot(-2.98, 104.76, 220.0)],
            "total": 2,
            "status": "ok",
            "reason": None,
            "source": "nasa-firms-csv",
            "updated_at": stale_at,
            "window_hours": 24,
        }
    )
    firms_env["serve_csv"](httpx.ConnectTimeout("CSV timed out"))

    body = await _get_hotspots()

    assert body["status"] == "stale"
    assert body["count"] == 2
    assert body["total"] == 2
    assert len(body["hotspots"]) == 2
    assert body["source"] == "cache"
    assert body["updated_at"] == stale_at
    assert "jam" in (body["reason"] or "").lower()


# ---------------------------------------------------------------------------
# Phase 173.6 — a key must never make the counter LESS truthful than no key.
#
# Production smoke (2026-10-28) returned {"count":0,"status":"empty",
# "source":"nasa-firms-api"} while the keyless CSV held ~190 in-bbox rows:
# the area API's `day_range=1` is "today only" and answers header-only until the
# current UTC day's first NRT pass lands.
# ---------------------------------------------------------------------------

HEADER_ONLY = HEADER + "\n"

FIVE_ROWS = [
    _csv_row(3.60, 98.60, 12.5),
    _csv_row(-2.98, 104.76, 210.0, confidence="high"),
    _csv_row(-5.45, 105.30, 8.0),
    _csv_row(0.51, 101.45, 30.0),
    _csv_row(-1.61, 103.61, 4.0),
]


def _stub_api(firms_env, *, raw: str = "", exc: Exception | None = None):
    """Make the keyed API path answer with an empty CSV or raise."""

    async def fake_fetch(self):
        if exc is not None:
            raise exc
        return raw

    firms_env["monkeypatch"].setattr(routing_router.NASAFIRMSAdapter, "fetch", fake_fetch)


@pytest.mark.asyncio
async def test_api_empty_is_crosschecked_against_csv(firms_env):
    """API answers 0 rows (header-only 200) but the CSV has 5 -> serve 5."""
    firms_env["set_key"]("test-map-key")
    _stub_api(firms_env, raw=HEADER_ONLY)
    calls = firms_env["serve_csv"](_csv(FIVE_ROWS))

    body = await _get_hotspots()

    assert body["count"] == 5
    assert body["total"] == 5
    assert body["status"] == "ok"
    assert body["source"] == "nasa-firms-csv"
    assert "cross-check" in (body["reason"] or "")
    assert calls, "the keyless CSV must be consulted when the API yields 0"


@pytest.mark.asyncio
async def test_api_error_falls_back_to_csv_not_degraded(firms_env):
    """API raises -> CSV 5 rows is served, the error is recorded in reason."""
    firms_env["set_key"]("test-map-key")
    _stub_api(firms_env, exc=httpx.ReadTimeout("FIRMS API timed out"))
    firms_env["serve_csv"](_csv(FIVE_ROWS))

    body = await _get_hotspots()

    assert body["status"] == "ok"
    assert body["count"] == 5
    assert body["source"] == "nasa-firms-csv"
    reason = body["reason"] or ""
    assert "cross-check" in reason
    assert "timed out" in reason or "gagal" in reason.lower()


@pytest.mark.asyncio
async def test_api_and_csv_both_zero_is_verified_empty(firms_env):
    """Both sources genuinely 0 -> empty, count 0 (never degraded, never ok)."""
    firms_env["set_key"]("test-map-key")
    _stub_api(firms_env, raw=HEADER_ONLY)
    firms_env["serve_csv"](_csv([OUT_OF_BBOX_ROW]))

    body = await _get_hotspots()

    assert body["status"] == "empty"
    assert body["count"] == 0
    assert body["total"] == 0
    assert body["hotspots"] == []
    assert body["reason"] == routing_router.FIRMS_EMPTY_REASON


@pytest.mark.asyncio
async def test_api_request_uses_rolling_24h_day_range(firms_env):
    """Regression: day_range=1 is "today only" and silently under-reports."""
    adapter = routing_router.NASAFIRMSAdapter()

    url = adapter.api_csv_url(map_key="test-map-key")

    assert "/VIIRS_SNPP_NRT/94,-6,108,6/2" in url, url
    assert url.startswith("https://firms.modaps.eosdis.nasa.gov/api/area/csv/")
    assert adapter.api_csv_url(map_key="k", day_range=3).endswith("/94,-6,108,6/3")
    # Default window is the rolling 24h two-day range, pinned.
    assert adapter_module.FIRMS_API_DAY_RANGE == 2

