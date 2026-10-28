"""Phase 176.7 (M9) — one `type` vocabulary at the gazetteer API boundary.

Live search mixed vocabularies: ``type:"kota"``/``"kecamatan"`` from the
administrative gazetteer, but ``type:"regency"`` (English) for Natuna and
Belitung Timur, which are served by the legacy ``PAN_SUMATRA_GAZETTEER`` tier-2
nodes. Any UI badge/icon keyed on kota|kabupaten|kecamatan silently fell
through.

Covered here:
1. the committed dataset only ever stores kabupaten|kota|kecamatan,
2. the loader normalises a legacy `regency`/`city`/`district` row instead of
   dropping it,
3. the live search response for natuna / belitung timur says "kabupaten",
4. the alias mapping itself.

No network access: the Nominatim client is stubbed.
"""
import json
from typing import Any, Dict, Optional

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.nlp import gazetteer_data
from app.routers import geocode_router

client = TestClient(app)

CANONICAL_TYPES = {"kabupaten", "kota", "kecamatan"}


class _NoNominatimClient:
    """Stand-in for httpx.AsyncClient: records calls, returns no hits."""

    calls = 0

    def __init__(self, *args: Any, **kwargs: Any):
        pass

    async def __aenter__(self) -> "_NoNominatimClient":
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def get(self, url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None):
        _NoNominatimClient.calls += 1

        class _Resp:
            status_code = 200

            @staticmethod
            def json() -> list:
                return []

        return _Resp()


@pytest.fixture(autouse=True)
def _isolate(monkeypatch: pytest.MonkeyPatch):
    """No Redis, no in-memory cache bleed, no outbound Nominatim."""
    monkeypatch.setattr(geocode_router, "get_redis", lambda: None)
    monkeypatch.setattr(geocode_router.httpx, "AsyncClient", _NoNominatimClient)
    geocode_router._IN_MEMORY_SEARCH_CACHE.clear()
    yield
    geocode_router._IN_MEMORY_SEARCH_CACHE.clear()


# ---------------------------------------------------------------------------
# 1. Stored dataset
# ---------------------------------------------------------------------------
def test_dataset_only_uses_canonical_types():
    payload = json.loads(gazetteer_data.ADMIN_GAZETTEER_PATH.read_text(encoding="utf-8"))
    assert payload, "gazetteer dataset is empty"
    bad = [(row.get("name"), row.get("type")) for row in payload if row.get("type") not in CANONICAL_TYPES]
    assert bad == [], f"{len(bad)} rows outside {sorted(CANONICAL_TYPES)}: {bad[:5]}"


# ---------------------------------------------------------------------------
# 2. Loader normalises a legacy dataset row (source-level fix)
# ---------------------------------------------------------------------------
def test_loader_normalises_legacy_type_words(monkeypatch: pytest.MonkeyPatch, tmp_path):
    legacy = [
        {
            "id": "kab-natuna",
            "name": "Natuna",
            "type": "regency",
            "province": "Kepulauan Riau",
            "parent": "Kepulauan Riau",
            "aliases": ["Kabupaten Natuna"],
            "lat": 3.9833,
            "lon": 107.9833,
        }
    ]
    path = tmp_path / "legacy_gazetteer.json"
    path.write_text(json.dumps(legacy), encoding="utf-8")

    monkeypatch.setattr(gazetteer_data, "ADMIN_GAZETTEER_PATH", path)
    monkeypatch.setattr(gazetteer_data, "_admin_gazetteer", None)

    loaded = gazetteer_data.load_admin_gazetteer()
    assert len(loaded) == 1
    assert loaded[0]["type"] == "kabupaten"


# ---------------------------------------------------------------------------
# 3. API boundary
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("query", ["natuna", "belitung%20timur"])
def test_search_response_uses_kabupaten_not_regency(query):
    response = client.get(f"/api/v1/geocode/search?q={query}&limit=5")
    assert response.status_code == 200
    results = response.json()["results"]
    assert results, f"no result for {query!r}"
    top = results[0]
    assert top["type"] == "kabupaten", top
    assert "regency" not in {row["type"] for row in results}, results


def test_gazetteer_hits_never_emit_english_types():
    # "hub" is a deliberate non-administrative descriptor for a strategic
    # corridor/port node; the administrative levels must stay Indonesian.
    allowed = CANONICAL_TYPES | {"hub"}
    english = {"regency", "city", "district", "subdistrict", "county", "town"}
    for query in ("medan", "pekanbaru", "natuna", "belitung%20timur", "banda%20aceh"):
        response = client.get(f"/api/v1/geocode/search?q={query}&limit=10")
        assert response.status_code == 200
        for row in response.json()["results"]:
            if row.get("source") == "gazetteer":
                assert row["type"] in allowed, row
                assert row["type"] not in english, row


def test_legacy_tier2_node_maps_to_kabupaten():
    # The legacy hub gazetteer is what serves Natuna / Belitung Timur.
    assert geocode_router._gazetteer_result_type({"tier": 2}) == "kabupaten"
    assert geocode_router._gazetteer_result_type({"tier": 1}) == "kecamatan"
    assert geocode_router._gazetteer_result_type({"precision_tier": "corridor_point"}) == "hub"


# ---------------------------------------------------------------------------
# 4. Alias mapping
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("regency", "kabupaten"),
        ("county", "kabupaten"),
        ("kabupaten", "kabupaten"),
        ("city", "kota"),
        ("kota", "kota"),
        ("district", "kecamatan"),
        ("subdistrict", "kecamatan"),
        ("kecamatan", "kecamatan"),
        ("  Regency ", "kabupaten"),
    ],
)
def test_place_type_alias_mapping(raw, expected):
    assert gazetteer_data.normalize_place_type(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "village", "administrative", "hub"])
def test_unknown_place_type_is_not_invented(raw):
    assert gazetteer_data.normalize_place_type(raw) is None


def test_generator_and_runtime_share_the_vocabulary():
    """The generator may never write a type the runtime would drop."""
    import sys
    from pathlib import Path

    repo_root = Path(gazetteer_data.__file__).resolve().parents[3]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    from scripts.build_sumatra_gazetteer import GAZETTEER_TYPES, normalize_gazetteer_type

    assert set(GAZETTEER_TYPES) == CANONICAL_TYPES
    for alias in ("regency", "city", "district", "kabupaten", "kota", "kecamatan"):
        assert normalize_gazetteer_type(alias) == gazetteer_data.normalize_place_type(alias)
