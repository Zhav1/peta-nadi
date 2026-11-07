import pytest
from app.services.public_snapshot_service import (
    PUBLIC_FIELDS,
    _normalize_incident_rows,
    _curate,
)


def test_public_fields_contains_incident_id():
    assert "incident_id" in PUBLIC_FIELDS
    assert "id" in PUBLIC_FIELDS
    assert "lat" in PUBLIC_FIELDS
    assert "lon" in PUBLIC_FIELDS


def test_normalize_incident_rows_populates_id_and_decodes_ewkb_location():
    ewkb_hex = "0101000020E61000006666666666CA584054E3A59BC4A00A40"
    raw_rows = [
        {
            "incident_id": "incident-abc-123",
            "title": "Banjir Jalan Lintas",
            "location": ewkb_hex,
            "lat": None,
            "lon": None,
            "severity": "high",
            "status": "validated",
        }
    ]

    normalized = _normalize_incident_rows(raw_rows)
    assert len(normalized) == 1
    item = normalized[0]

    assert item["id"] == "incident-abc-123"
    assert item["incident_id"] == "incident-abc-123"
    assert item["lat"] == pytest.approx(3.3285, abs=1e-4)
    assert item["lon"] == pytest.approx(99.1625, abs=1e-4)

    # Verify curate preserves these fields
    curated = _curate(item)
    assert curated["id"] == "incident-abc-123"
    assert curated["incident_id"] == "incident-abc-123"
    assert curated["lat"] == pytest.approx(3.3285, abs=1e-4)
    assert curated["lon"] == pytest.approx(99.1625, abs=1e-4)


def test_normalize_incident_rows_preserves_concrete_coords():
    raw_rows = [
        {
            "id": "inc-fixed",
            "title": "Pohon Tumbang",
            "lat": 3.5852,
            "lon": 98.6756,
            "location": "0101000020E61000006666666666CA584054E3A59BC4A00A40",
        }
    ]

    normalized = _normalize_incident_rows(raw_rows)
    assert len(normalized) == 1
    item = normalized[0]

    assert item["id"] == "inc-fixed"
    assert item["incident_id"] == "inc-fixed"
    assert item["lat"] == 3.5852
    assert item["lon"] == 98.6756
