"""Phase 171 acceptance — offline Sumatra kabupaten/kota + kecamatan gazetteer.

Real assertions against the committed dataset (`backend/app/nlp/data/
sumatra_admin_gazetteer.json`) and the runtime matcher. No network access.
"""
import json
import math
from pathlib import Path

import pytest

from app.nlp import gazetteer_data

DATA_PATH = Path(gazetteer_data.ADMIN_GAZETTEER_PATH)

PROVINCES = {
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Jambi",
    "Sumatera Selatan",
    "Bengkulu",
    "Lampung",
    "Kepulauan Bangka Belitung",
    "Kepulauan Riau",
}

# Real coordinates of the province capitals + the largest cities, used to prove
# the stored centroids are physical locations, not placeholders.
WELL_KNOWN = {
    "Medan": (3.5952, 98.6722),
    "Banda Aceh": (5.5483, 95.3238),
    "Padang": (-0.9471, 100.4172),
    "Pekanbaru": (0.5071, 101.4478),
    "Jambi": (-1.6101, 103.6131),
    "Palembang": (-2.9761, 104.7754),
    "Bandar Lampung": (-5.4297, 105.2625),
    "Bengkulu": (-3.8004, 102.2655),
    "Pangkalpinang": (-2.1333, 106.1167),
    "Tanjung Pinang": (0.9167, 104.4500),
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


@pytest.fixture(scope="module")
def dataset() -> list:
    assert DATA_PATH.exists(), f"missing committed dataset at {DATA_PATH}"
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    assert isinstance(payload, list)
    return payload


def test_dataset_size_and_bbox(dataset):
    assert len(dataset) >= 1800, f"only {len(dataset)} records"

    for record in dataset:
        assert isinstance(record["lat"], (int, float)), record
        assert isinstance(record["lon"], (int, float)), record
        # SPEC decision 6 bbox: 94E..108E, 6S..6N
        assert 94.0 <= record["lon"] <= 108.0, record
        assert -6.0 <= record["lat"] <= 6.0, record
        assert record["type"] in {"kabupaten", "kota", "kecamatan"}, record
        assert record["name"], record
        assert record["province"] in PROVINCES, record
        assert isinstance(record["aliases"], list), record


def test_all_provinces_and_types_present(dataset):
    assert {record["province"] for record in dataset} == PROVINCES
    types = {record["type"] for record in dataset}
    assert {"kabupaten", "kota", "kecamatan"} <= types

    # Every province must carry both regency-level and district-level rows.
    for province in PROVINCES:
        rows = [record for record in dataset if record["province"] == province]
        assert any(row["type"] in {"kabupaten", "kota"} for row in rows), province
        assert any(row["type"] == "kecamatan" for row in rows), province


@pytest.mark.parametrize("name,expected", sorted(WELL_KNOWN.items()))
def test_well_known_places_resolve_within_15km(name, expected):
    hits = gazetteer_data.search_admin_gazetteer(name, limit=1)
    assert hits, f"no offline hit for {name}"
    top = hits[0]
    distance = haversine_km(expected[0], expected[1], top["lat"], top["lon"])
    assert distance <= 15.0, f"{name} resolved to {top['name']} at {distance:.1f} km"


def test_exact_hit_ranks_first():
    hits = gazetteer_data.search_admin_gazetteer("pekanbaru", limit=5)
    assert hits
    assert hits[0]["name"] == "Pekanbaru"
    assert hits[0]["type"] == "kota"
    assert hits[0]["province"] == "Riau"


def test_typo_tolerance_returns_pekanbaru():
    hits = gazetteer_data.search_admin_gazetteer("pekanbarru", limit=5)
    assert hits, "typo query must still resolve through the fuzzy tier"
    assert any(hit["name"] == "Pekanbaru" for hit in hits), hits


def test_lhokseumawe_spacing_variants():
    for query in ("lhokseumawe", "lhok seumawe"):
        hits = gazetteer_data.search_admin_gazetteer(query, limit=3)
        assert hits, query
        assert hits[0]["name"] == "Lhokseumawe", (query, hits)
        assert hits[0]["type"] == "kota"


def test_province_query_returns_province_records():
    hits = gazetteer_data.search_admin_gazetteer("jambi", limit=10)
    assert len(hits) >= 5
    assert hits[0]["name"] == "Jambi"
    assert hits[0]["province"] == "Jambi"
    # The province name also acts as a province filter: the bulk of the page is
    # Jambi, while a same-word place elsewhere ("Jawa Maraja Bah Jambi", in
    # Sumatera Utara) may still surface on name evidence alone.
    jambi_hits = [hit for hit in hits if hit["province"] == "Jambi"]
    assert len(jambi_hits) >= 8, hits


def test_known_miss_returns_empty_list():
    assert gazetteer_data.search_admin_gazetteer("zzzznotaplace", limit=10) == []


def test_result_payload_has_required_fields():
    hit = gazetteer_data.search_admin_gazetteer("banda aceh", limit=1)[0]
    for field in ("name", "display_name", "type", "province", "parent", "lat", "lon", "source"):
        assert field in hit, field
    assert hit["source"] == "gazetteer"
    assert hit["parent"] == "Aceh"


def test_admin_prefix_is_stripped():
    hits = gazetteer_data.search_admin_gazetteer("Kecamatan Medan Johor", limit=3)
    assert hits and hits[0]["name"] == "Medan Johor"
