"""Phase 176.8 (M9) — versioned geocode cache namespace.

Phase 176.7 changed the gazetteer vocabulary to ``kabupaten``/``kota``/
``kecamatan``, but the Redis entries live for 24h. After the deploy,
``/geocode/search?q=natuna`` still answered with the retired
``type:"regency"`` payload served from ``lrip:geocode:search:v2:natuna:10``.

The cache key version is therefore part of the honesty contract: a vocabulary
or value-shape change MUST move the namespace so a pre-deploy payload can never
be read again. These tests pin the version and prove ``v2`` is unreachable.

No network access: Redis is faked and Nominatim is stubbed where it could run.
"""
import json
from typing import Any, Dict, List, Optional

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import geocode_router

client = TestClient(app)

EXPECTED_VERSION = "v3"


class _FakeRedis:
    """Minimal Redis stand-in: records every key read and written."""

    def __init__(self, seed: Optional[Dict[str, str]] = None):
        self.store: Dict[str, str] = dict(seed or {})
        self.reads: List[str] = []
        self.writes: List[Dict[str, Any]] = []

    def get(self, key: str) -> Optional[str]:
        self.reads.append(key)
        return self.store.get(key)

    def set(self, key: str, value: str, ex: Optional[int] = None) -> None:
        self.writes.append({"key": key, "value": value, "ex": ex})
        self.store[key] = value


class _NoNominatimClient:
    """Any outbound geocode call here would be a bug; return nothing."""

    calls = 0

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    async def __aenter__(self) -> "_NoNominatimClient":
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def get(self, *args: Any, **kwargs: Any):
        _NoNominatimClient.calls += 1

        class _Resp:
            status_code = 200

            @staticmethod
            def json() -> list:
                return []

        return _Resp()


STALE_NATUNA_V2 = json.dumps(
    [
        {
            "name": "Natuna",
            "display_name": "Natuna, Kepulauan Riau, Indonesia",
            "lat": 3.9833,
            "lon": 107.9833,
            "type": "regency",  # retired by 176.7
            "province": "Kepulauan Riau",
            "parent": "Kepulauan Riau",
            "kabupaten": "Natuna",
            "kecamatan": None,
            "source": "gazetteer",
        }
    ]
)


@pytest.fixture(autouse=True)
def _isolate(monkeypatch: pytest.MonkeyPatch):
    """No real Redis, no cache bleed, no outbound HTTP."""
    monkeypatch.setattr(geocode_router, "get_redis", lambda: None)
    monkeypatch.setattr(geocode_router.httpx, "AsyncClient", _NoNominatimClient)
    geocode_router._IN_MEMORY_SEARCH_CACHE.clear()
    geocode_router._IN_MEMORY_REVERSE_CACHE.clear()
    _NoNominatimClient.calls = 0
    yield
    geocode_router._IN_MEMORY_SEARCH_CACHE.clear()
    geocode_router._IN_MEMORY_REVERSE_CACHE.clear()


# ---------------------------------------------------------------------------
# 1. The key version itself is pinned
# ---------------------------------------------------------------------------
def test_cache_version_is_pinned():
    assert geocode_router.GEOCODE_CACHE_VERSION == EXPECTED_VERSION


def test_cache_key_builders_carry_the_version():
    assert (
        geocode_router.search_cache_key("natuna", 10)
        == f"lrip:geocode:search:{EXPECTED_VERSION}:natuna:10"
    )
    assert (
        geocode_router.reverse_cache_key(3.9833, 107.9833)
        == f"lrip:geocode:reverse:{EXPECTED_VERSION}:3.9833:107.9833"
    )


def test_search_writes_only_versioned_keys(monkeypatch: pytest.MonkeyPatch):
    redis = _FakeRedis()
    monkeypatch.setattr(geocode_router, "get_redis", lambda: redis)

    response = client.get("/api/v1/geocode/search?q=natuna&limit=10")
    assert response.status_code == 200
    assert response.json()["results"], "natuna must resolve from the gazetteer"

    assert redis.writes, "a non-empty result must be cached"
    for write in redis.writes:
        assert write["key"].startswith(f"lrip:geocode:search:{EXPECTED_VERSION}:")
        assert ":v2:" not in write["key"]
        assert write["ex"] == 86400


# ---------------------------------------------------------------------------
# 2. A pre-deploy v2 entry is never read
# ---------------------------------------------------------------------------
def test_cached_v2_entry_is_never_read(monkeypatch: pytest.MonkeyPatch):
    redis = _FakeRedis({f"lrip:geocode:search:v2:natuna:10": STALE_NATUNA_V2})
    monkeypatch.setattr(geocode_router, "get_redis", lambda: redis)

    response = client.get("/api/v1/geocode/search?q=natuna&limit=10")
    assert response.status_code == 200
    payload = response.json()

    assert "lrip:geocode:search:v2:natuna:10" not in redis.reads, (
        "the router read the stale v2 namespace"
    )
    assert all(
        "lrip:geocode:search:v2:" not in key for key in redis.reads
    ), redis.reads


def test_stale_v2_regency_value_cannot_leak(monkeypatch: pytest.MonkeyPatch):
    redis = _FakeRedis({f"lrip:geocode:search:v2:natuna:10": STALE_NATUNA_V2})
    monkeypatch.setattr(geocode_router, "get_redis", lambda: redis)

    payload = client.get("/api/v1/geocode/search?q=natuna&limit=10").json()

    # The response is rebuilt from the current gazetteer, not from v2.
    assert payload["cached"] is False
    assert payload["results"], payload
    assert payload["results"][0]["type"] == "kabupaten", payload["results"][0]
    assert "regency" not in {row["type"] for row in payload["results"]}
    assert _NoNominatimClient.calls == 0


# ---------------------------------------------------------------------------
# 3. Reverse geocoding is versioned too
# ---------------------------------------------------------------------------
def test_reverse_v2_entry_is_never_read(monkeypatch: pytest.MonkeyPatch):
    stale = json.dumps(
        {
            "name": "Stale V2 Place",
            "display_name": "Stale V2 Place, Sumatera",
            "lat": 3.5952,
            "lon": 98.6722,
            "type": "regency",
            "province": "Sumatera Utara",
            "kabupaten": "Stale",
            "kecamatan": None,
            "village": None,
            "source": "STALE_V2",
        }
    )
    redis = _FakeRedis({f"lrip:geocode:reverse:v2:3.5952:98.6722": stale})
    monkeypatch.setattr(geocode_router, "get_redis", lambda: redis)

    response = client.get("/api/v1/geocode/reverse?lat=3.5952&lon=98.6722")
    assert response.status_code == 200
    payload = response.json()

    assert all(":v2:" not in key for key in redis.reads), redis.reads
    assert payload["name"] != "Stale V2 Place"
    assert payload["source"] != "STALE_V2"
