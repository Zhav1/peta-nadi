"""Regression tests for Gazetteer-first geocode search (issue #1).

Covers the failure modes that made map search look broken on production:
- exact city/hub names must rank first (naive substring order returned
  Padang Sidempuan ahead of Kota Padang),
- a total miss must return an honest empty list, never a Medan centroid,
- empty results must not be cached as a permanent negative entry,
- an exact gazetteer hit must not pay the Nominatim round-trip,
- gazetteer nodes must carry real coordinates (no fabricated Medan default).

No network access: the Nominatim client is stubbed.
"""
from typing import Any, Dict, List, Optional

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import geocode_router

client = TestClient(app)


class _FakeResponse:
    def __init__(self, payload: Any, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def json(self) -> Any:
        return self._payload


class _FakeAsyncClient:
    """Stand-in for httpx.AsyncClient; counts Nominatim lookups."""

    calls = 0

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def get(self, url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> _FakeResponse:
        _FakeAsyncClient.calls += 1
        q = (params or {}).get("q", "")
        return _FakeResponse([
            {
                "lat": "-0.3056",
                "lon": "100.3692",
                "display_name": f"{q}, Agam, Sumatera Barat, Indonesia",
                "type": "village",
                "address": {
                    "state": "Sumatera Barat",
                    "county": "Agam",
                    "village": q,
                },
            }
        ])


class _EmptyAsyncClient(_FakeAsyncClient):
    async def get(self, url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> _FakeResponse:
        _FakeAsyncClient.calls += 1
        return _FakeResponse([])


@pytest.fixture(autouse=True)
def _isolate_caches(monkeypatch: pytest.MonkeyPatch):
    """Keep tests hermetic: no Redis, no in-memory cache bleed."""
    monkeypatch.setattr(geocode_router, "get_redis", lambda: None)
    geocode_router._IN_MEMORY_SEARCH_CACHE.clear()
    yield
    geocode_router._IN_MEMORY_SEARCH_CACHE.clear()


def _search(monkeypatch: pytest.MonkeyPatch, q: str, client_cls=_FakeAsyncClient, limit: int = 10) -> Dict[str, Any]:
    _FakeAsyncClient.calls = 0
    monkeypatch.setattr(geocode_router.httpx, "AsyncClient", client_cls)
    response = client.get(f"/api/v1/geocode/search?q={q}&limit={limit}")
    assert response.status_code == 200
    return response.json()


@pytest.mark.parametrize(
    "query,expected",
    [
        ("medan", "Medan"),
        ("padang", "Padang"),
        ("bukittinggi", "Bukittinggi"),
        ("pekanbaru", "Pekanbaru"),
        ("belawan", "Belawan"),
    ],
)
def test_exact_name_ranks_first(monkeypatch, query, expected):
    data = _search(monkeypatch, query)
    names = [row["name"] for row in data["results"]]
    assert names, f"expected gazetteer hits for {query!r}"
    assert names[0] == expected, names


def test_prefixed_query_matches_gazetteer(monkeypatch):
    data = _search(monkeypatch, "Kecamatan%20Medan%20Johor")
    names = [row["name"] for row in data["results"]]
    assert "Medan Johor" in names, names


def test_miss_returns_empty_not_medan_centroid(monkeypatch):
    data = _search(monkeypatch, "zzzznotaplace", client_cls=_EmptyAsyncClient)
    assert data["results"] == []
    assert data["count"] == 0


def test_empty_result_is_not_negatively_cached(monkeypatch):
    _search(monkeypatch, "zzzznotaplace", client_cls=_EmptyAsyncClient)
    assert "zzzznotaplace:10" not in geocode_router._IN_MEMORY_SEARCH_CACHE


def test_exact_hit_skips_nominatim(monkeypatch):
    data = _search(monkeypatch, "medan")
    assert data["results"]
    assert _FakeAsyncClient.calls == 0


def test_gazetteer_nodes_have_real_coordinates():
    response = client.get("/api/v1/geocode/nodes")
    assert response.status_code == 200
    nodes = response.json()["nodes"]
    assert len(nodes) >= 50
    for node in nodes:
        assert isinstance(node["lat"], float)
        assert isinstance(node["lon"], float)
        # The old code defaulted missing coords to the Medan centroid; only the
        # actual Medan node may legitimately sit there.
        if (node["lat"], node["lon"]) == (3.5952, 98.6722):
            assert node["id"] == "medan", node
