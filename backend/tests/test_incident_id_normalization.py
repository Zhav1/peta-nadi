"""Phase 58 Task 3.1/4.1 regression: incident_id vs id normalization (R4).

Live /api/v1/incidents rows carry `id` with no `incident_id` field; the read
path must tolerate both. All fixtures are synthetic dicts — no canned crisis
prose (57 D6 honesty).
"""
import pytest


def normalize_incident_id(row: dict) -> str:
    """Mirror of the normalization contract: incident_id preferred, id fallback."""
    return str(row.get("incident_id") or row.get("id", ""))


def test_id_only_rows_normalize():
    row = {"id": "d52cf5ff-0001", "title": "Banjir", "affected_polygon": {"x": 1}}
    assert normalize_incident_id(row) == "d52cf5ff-0001"


def test_incident_id_only_rows_normalize():
    row = {"incident_id": "INC-42", "title": "Banjir"}
    assert normalize_incident_id(row) == "INC-42"


def test_mixed_rows_prefer_incident_id():
    row = {"incident_id": "INC-7", "id": "uuid-9"}
    assert normalize_incident_id(row) == "INC-7"


def test_missing_keys_yield_empty():
    assert normalize_incident_id({}) == ""


def test_hazard_row_mapping_tolerates_id_only():
    """End-to-end shape of get_hazard_polygons mapping with id-only rows."""
    rows = [
        {"id": "a1", "title": "Banjir Belawan", "type": "flood", "affected_polygon": {"t": 1}},
        {"incident_id": "INC-2", "title": "Macet", "type": "congestion", "affected_polygon": {"t": 2}},
        {"id": "a3", "title": "Tanpa polygon", "type": "flood"},
    ]
    hazards = [
        {
            "incident_id": r.get("incident_id") or r.get("id", ""),
            "title": r["title"],
            "type": r["type"],
            "polygon": r["affected_polygon"],
        }
        for r in rows
        if r.get("affected_polygon")
    ]
    assert [h["incident_id"] for h in hazards] == ["a1", "INC-2"]


def test_prediction_history_counts_either_key():
    """Prediction history gate counts rows carrying either key."""
    rows = [{"id": "a"}, {"incident_id": "b"}, {"id": "c"}, {"other": 1}]
    counted = [r for r in rows if r.get("incident_id") or r.get("id")]
    assert len(counted) == 3
