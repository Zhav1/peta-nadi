"""Phase 160 — weather summary world-truth contract.

Pins the counter contract for GET /api/v1/weather/summary:

* cuaca   = active disruption (high|critical) over the whole Sumatra bbox
* waspada = early warning (medium only) — mutually exclusive with cuaca
* totals come from the UNCAPPED inventory, so the 24-feature render cap can
  never truncate a counter
* degraded upstream -> count is None (never 0); healthy zero -> 0 + "empty";
  stale cache -> last-known-good count preserved + "stale"

The fusion path itself runs for real: only the two upstream adapters are faked,
so these assertions exercise _build_weather_candidates + the inventory
partition rather than a re-implementation.
"""
from datetime import datetime, timedelta, timezone
import inspect
import json

import httpx
import pytest
from fastapi import FastAPI

from app.routers import routing_router
from app.services import weather_fusion_service as fusion
from app.services.weather_fusion_service import MAX_WEATHER_FEATURES, get_fused_spatial_weather


SUMATRA_BBOX = [94.0, -6.0, 108.0, 6.0]


# ---------------------------------------------------------------------------
# Upstream fixtures
# ---------------------------------------------------------------------------

def _om_event(idx: int, severity: str) -> dict:
    """Open-Meteo shaped prediction inside the Sumatra bbox."""
    lat = -5.0 + (idx % 20) * 0.55
    lon = 95.0 + (idx % 11) * 1.1
    return {
        "event_type": "weather_prediction",
        "source": "open_meteo",
        "severity": severity,
        "lat": lat,
        "lon": lon,
        "title": f"Grid {severity} #{idx}",
        "region": "sumatra",
        "raw_payload": {
            "predictions": {
                "precipitation_mm_24h": 70.0,
                "flood_risk_pct": 88.0,
                "wind_speed_kmh": 22.0,
            }
        },
    }


def _bmkg_medium_event(lat: float, lon: float) -> dict:
    """BMKG code 60 = medium drizzle (the advisory/watch tier)."""
    return {
        "event_type": "weather_warning",
        "source": "bmkg",
        "severity": "medium",
        "lat": lat,
        "lon": lon,
        "title": "Hujan sedang Sumatera Barat",
        "region": "sumatera_barat",
        "raw": json.dumps({"code": 60}),
    }


class _FakeBMKG:
    def __init__(self, events=None, error: Exception | None = None):
        self._events = events or []
        self._error = error

    async def fetch(self):
        return {}

    async def parse(self, raw):
        if self._error:
            raise self._error
        return list(self._events)


class _FakeOpenMeteo:
    def __init__(self, events=None, error: Exception | None = None):
        self._events = events or []
        self._error = error

    async def fetch(self):
        return {}

    async def parse(self, raw):
        if self._error:
            raise self._error
        return list(self._events)


@pytest.fixture
def summary_env(monkeypatch):
    """Isolate the endpoint from Redis and let each test choose the upstream."""
    store: dict[str, str] = {}

    def fake_get(key):
        return store.get(key)

    def fake_set(key, value, ex=None):
        store[key] = value

    monkeypatch.setattr(routing_router, "cache_get", fake_get)
    monkeypatch.setattr(routing_router, "cache_set", fake_set)

    def install(bmkg_events=None, om_events=None, bmkg_error=None, om_error=None):
        monkeypatch.setattr(
            fusion, "BMKGAdapter", lambda: _FakeBMKG(bmkg_events, bmkg_error)
        )
        monkeypatch.setattr(
            fusion, "OpenMeteoAdapter", lambda: _FakeOpenMeteo(om_events, om_error)
        )

    return {"store": store, "install": install, "monkeypatch": monkeypatch}


async def _get_summary(query: str = "") -> dict:
    app = FastAPI()
    app.include_router(routing_router.router, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(f"/api/v1/weather/summary{query}")
    assert res.status_code == 200, res.text
    return res.json()


def _assert_bucket_shape(bucket: dict) -> None:
    assert set(bucket) == {
        "count",
        "total",
        "status",
        "reason",
        "source",
        "valid_until",
        "window_hours",
    }
    assert bucket["status"] in {"ok", "stale", "degraded", "empty"}
    assert bucket["window_hours"] == 24
    assert isinstance(bucket["source"], str) and bucket["source"]


# ---------------------------------------------------------------------------
# 1. No severity/precip/flood query surface
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_summary_has_no_severity_query_params_and_ignores_them(summary_env):
    """The counter endpoint cannot be narrowed by render-only parameters."""
    params = set(inspect.signature(routing_router.fetch_weather_summary).parameters)
    assert not params & {"min_severity", "min_precip", "min_flood"}

    summary_env["install"](
        bmkg_events=[_bmkg_medium_event(0.5, 101.0)],
        om_events=[_om_event(i, "high") for i in range(3)],
    )
    plain = await _get_summary()

    summary_env["install"](
        bmkg_events=[_bmkg_medium_event(0.5, 101.0)],
        om_events=[_om_event(i, "high") for i in range(3)],
    )
    narrowed = await _get_summary("?min_severity=critical&min_precip=999&min_flood=999")

    assert plain["cuaca"]["count"] == narrowed["cuaca"]["count"] == 3
    assert plain["waspada"]["count"] == narrowed["waspada"]["count"] == 1
    assert plain["bbox"] == narrowed["bbox"] == SUMATRA_BBOX


# ---------------------------------------------------------------------------
# 2. Severity partition + the 24-cap no longer truncates
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_counts_partition_by_severity_before_the_render_cap(summary_env):
    """30 medium + 5 high => waspada 30, cuaca 5 (cap 24 must not apply)."""
    medium = [_bmkg_medium_event(0.2 + i * 0.05, 100.0 + i * 0.1) for i in range(30)]
    high = [_om_event(i, "high") for i in range(5)]

    summary_env["install"](bmkg_events=medium, om_events=high)
    summary = await _get_summary()

    assert summary["cuaca"]["total"] == 5
    assert summary["cuaca"]["count"] == 5
    assert summary["cuaca"]["status"] == "ok"
    assert summary["waspada"]["total"] == 30
    assert summary["waspada"]["count"] == 30
    assert summary["waspada"]["status"] == "ok"

    # Mutually exclusive, no double count: every zone lands in exactly one bucket.
    assert summary["cuaca"]["count"] + summary["waspada"]["count"] == 35
    assert 30 > MAX_WEATHER_FEATURES, "fixture must exceed the render cap"

    # The render path stays capped — the count path is what is uncapped.
    summary_env["install"](bmkg_events=medium, om_events=high)
    rendered = await get_fused_spatial_weather(min_severity="low")
    assert len(rendered["features"]) == MAX_WEATHER_FEATURES

    _assert_bucket_shape(summary["cuaca"])
    _assert_bucket_shape(summary["waspada"])


@pytest.mark.asyncio
async def test_cuaca_excludes_medium_and_waspada_excludes_disruption(summary_env):
    """Severity tiers never bleed across counters (medium != disruption)."""
    summary_env["install"](
        bmkg_events=[_bmkg_medium_event(0.1, 100.1), _bmkg_medium_event(0.2, 100.2)],
        om_events=[_om_event(0, "high"), _om_event(1, "critical")],
    )
    summary = await _get_summary()

    assert summary["cuaca"]["count"] == 2
    assert summary["waspada"]["count"] == 2
    assert summary["generated_at"]
    assert summary["cuaca"]["valid_until"] == summary["waspada"]["valid_until"]


# ---------------------------------------------------------------------------
# 3. Degraded upstream -> null, never 0
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_degraded_upstream_reports_null_not_zero(summary_env):
    summary_env["install"](
        bmkg_error=RuntimeError("bmkg unreachable"),
        om_error=RuntimeError("open-meteo unreachable"),
    )
    summary = await _get_summary()

    for key in ("cuaca", "waspada"):
        bucket = summary[key]
        assert bucket["status"] == "degraded"
        assert bucket["count"] is None
        assert bucket["total"] is None, "a degraded counter must never publish 0"
        assert bucket["reason"], "degraded must carry a human reason"
        _assert_bucket_shape(bucket)


@pytest.mark.asyncio
async def test_healthy_zero_zones_is_empty(summary_env):
    summary_env["install"](bmkg_events=[], om_events=[])
    summary = await _get_summary()

    for key in ("cuaca", "waspada"):
        bucket = summary[key]
        assert bucket["status"] == "empty"
        assert bucket["count"] == 0
        assert bucket["reason"] == "Tidak ada zona aktif"


# ---------------------------------------------------------------------------
# 4. Stale cache preserves the last-known-good count
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stale_cache_preserves_last_known_good_count(summary_env):
    old_iso = (datetime.now(timezone.utc) - timedelta(hours=10)).isoformat()
    cached = {
        "bbox": SUMATRA_BBOX,
        "generated_at": old_iso,
        "cuaca": {
            "count": 5,
            "total": 5,
            "status": "ok",
            "reason": None,
            "source": fusion.WEATHER_SUMMARY_SOURCE,
            "valid_until": old_iso,
            "window_hours": 24,
        },
        "waspada": {
            "count": 27,
            "total": 27,
            "status": "ok",
            "reason": None,
            "source": fusion.WEATHER_SUMMARY_SOURCE,
            "valid_until": old_iso,
            "window_hours": 24,
        },
    }
    summary_env["store"][routing_router.WEATHER_SUMMARY_CACHE_KEY] = json.dumps(cached)
    summary_env["install"](
        bmkg_error=RuntimeError("bmkg unreachable"),
        om_error=RuntimeError("open-meteo unreachable"),
    )

    summary = await _get_summary()

    assert summary["generated_at"] == old_iso
    assert summary["cuaca"]["status"] == "stale"
    assert summary["cuaca"]["count"] == 5
    assert summary["waspada"]["status"] == "stale"
    assert summary["waspada"]["count"] == 27
    assert "jam" in (summary["waspada"]["reason"] or "").lower()


@pytest.mark.asyncio
async def test_fresh_cache_is_served_without_refetching(summary_env):
    """A cache hit must not be recomputed into a different number."""
    fresh_iso = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    cached = {
        "bbox": SUMATRA_BBOX,
        "generated_at": fresh_iso,
        "cuaca": {"count": 4, "total": 4, "status": "ok", "reason": None,
                  "source": fusion.WEATHER_SUMMARY_SOURCE, "valid_until": None,
                  "window_hours": 24},
        "waspada": {"count": 9, "total": 9, "status": "ok", "reason": None,
                    "source": fusion.WEATHER_SUMMARY_SOURCE, "valid_until": None,
                    "window_hours": 24},
    }
    summary_env["store"][routing_router.WEATHER_SUMMARY_CACHE_KEY] = json.dumps(cached)

    def _boom():
        raise AssertionError("fresh cache must not re-hit the upstream adapters")

    summary_env["install"]()
    summary_env["monkeypatch"].setattr(fusion, "BMKGAdapter", _boom)

    summary = await _get_summary()
    assert summary["cuaca"]["count"] == 4
    assert summary["waspada"]["count"] == 9
    assert summary["generated_at"] == fresh_iso


@pytest.mark.asyncio
async def test_concurrent_cold_fusion_misses_share_one_upstream(summary_env):
    """Two concurrent cold misses coalesce: one upstream call, both served."""
    import asyncio

    summary_env["store"].clear()
    try:
        routing_router.reset_fusion_inflight()
    except Exception:
        pass

    calls: list[int] = []
    release = asyncio.Event()
    now_iso = datetime.now(timezone.utc).isoformat()

    async def fake_fusion():
        calls.append(1)
        await release.wait()
        return {
            "candidates": [],
            "upstream": {"degraded": False},
            "generated_at": now_iso,
        }

    summary_env["monkeypatch"].setattr(routing_router, "get_fusion_snapshot", fake_fusion)

    async def caller():
        return await routing_router._load_fusion_snapshot()

    t1 = asyncio.create_task(caller())
    t2 = asyncio.create_task(caller())
    await asyncio.sleep(0.05)
    assert len(calls) == 1, "concurrent cold misses must share one upstream fetch"
    release.set()
    (snap1, _, _), (snap2, _, _) = await asyncio.gather(t1, t2)
    assert len(calls) == 1
    assert snap1 is not None and snap2 is not None
    try:
        routing_router.reset_fusion_inflight()
    except Exception:
        pass
