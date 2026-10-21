"""
Unit & Integration tests for Phase 84: Deterministic BMKG Sensor Cross-Validation & Consensus Gate Hardening.
Verifies:
1. Spatial tolerance gate (Delta d <= 30 km; <= 50 km for M >= 4.5 quakes).
2. Temporal tolerance window (Delta t <= 6.0 hours).
3. Physical sensor thresholds: radar rainfall >= 20 mm/h, earthquake M >= 4.5, wave >= 2.5 m.
4. Hard confidence cap (<= 0.50) on uncorroborated news claims.
5. Strict anti-tautology enforcement: news headlines cannot corroborate themselves.
6. Structured consensus audit ledger completeness.
"""
import pytest
from datetime import datetime, timezone, timedelta
from agents.tools.consensus_gate import (
    haversine_distance_km,
    compute_temporal_delta_hours,
    cross_validate_news_with_bmkg,
    compute_consensus,
)
from backend.app.services.unified_news_ingestor import UnifiedNewsIngestor


def test_haversine_and_temporal_helpers():
    """Validates basic mathematical and date parsing helpers."""
    # Medan (3.5952, 98.6722) to Belawan (3.7847, 98.6833) is ~21 km
    dist = haversine_distance_km(3.5952, 98.6722, 3.7847, 98.6833)
    assert 20.0 <= dist <= 23.0

    # Same location is 0 km
    assert haversine_distance_km(3.5952, 98.6722, 3.5952, 98.6722) == 0.0

    # Temporal delta
    t1 = "2026-10-21T10:00:00+00:00"
    t2 = "2026-10-21T13:30:00+00:00"
    delta = compute_temporal_delta_hours(t1, t2)
    assert delta == 3.5


def test_corroborated_flood_radar():
    """A flood report corroborated by local high BMKG radar rainfall (>=20 mm/h) promotes to VALIDATED."""
    now = datetime.now(timezone.utc)
    news = {
        "title": "Banjir rendam jalan lintas di Solok",
        "latitude": -0.79,
        "longitude": 100.65,
        "published_at": now.isoformat(),
        "incident_type": "flood",
        "confidence": 0.85,
    }
    bmkg = {
        "latitude": -0.82,
        "longitude": 100.67,  # ~4 km away
        "timestamp": (now - timedelta(hours=1.5)).isoformat(),
        "rainfall_mm": 35.0,  # Extreme precipitation
        "warning_level": "SIAGA",
    }

    audit = cross_validate_news_with_bmkg(news, bmkg, ref_time=now)
    assert audit["is_corroborated"] is True
    assert audit["spatial_delta_km"] <= 30.0
    assert audit["temporal_delta_hours"] <= 6.0
    assert "radar_rain_rate" in audit["bmkg_parameter_matched"]
    assert audit["validation_status"] == "VALIDATED"
    assert audit["composite_confidence"] >= 0.85

    # Full consensus gate computation
    state = {
        "data_collection_finding": {"confidence": audit["composite_confidence"], "distance_km": audit["spatial_delta_km"]},
        "osint_hazard_finding": {"confidence": 0.85, "distance_km": 5.0},
        "bmkg_cross_validation": audit,
    }
    consensus = compute_consensus(state)
    assert consensus["overall_confidence"] >= 0.85
    assert consensus["route"] == "validated"
    assert consensus["validation_status"] == "VALIDATED"
    assert consensus["bmkg_cross_validation"]["is_corroborated"] is True


def test_spatial_mismatch_dropped():
    """Heavy rain in Padang does NOT corroborate a flood report in Medan (>500 km away)."""
    now = datetime.now(timezone.utc)
    news = {
        "title": "Banjir melanda Medan Amplas",
        "latitude": 3.55,
        "longitude": 98.70,
        "published_at": now.isoformat(),
        "incident_type": "flood",
        "confidence": 0.80,
    }
    bmkg_padang = {
        "latitude": -0.95,
        "longitude": 100.35,  # Padang, ~530 km away
        "timestamp": now.isoformat(),
        "rainfall_mm": 50.0,
        "warning_level": "AWAS",
    }

    audit = cross_validate_news_with_bmkg(news, bmkg_padang, ref_time=now)
    assert audit["is_corroborated"] is False
    assert audit["spatial_delta_km"] > 30.0
    assert audit["composite_confidence"] <= 0.50
    assert audit["validation_status"] == "UNCONFIRMED"

    # In consensus gate, uncorroborated news must be capped at <= 0.50
    state = {
        "data_collection_finding": {"confidence": 0.10, "distance_km": audit["spatial_delta_km"]},
        "osint_hazard_finding": {"confidence": 0.80, "distance_km": 5.0},
        "bmkg_cross_validation": audit,
    }
    consensus = compute_consensus(state)
    assert consensus["overall_confidence"] <= 0.50
    assert consensus["route"] == "unconfirmed"
    assert consensus["validation_status"] == "UNCONFIRMED"


def test_temporal_mismatch_dropped():
    """Heavy rain recorded 18 hours ago does NOT corroborate a fresh morning disruption claim."""
    now = datetime.now(timezone.utc)
    news = {
        "title": "Genangan jalan baru terjadi di Lubuk Alung",
        "latitude": -0.68,
        "longitude": 100.28,
        "published_at": now.isoformat(),
        "incident_type": "flood",
        "confidence": 0.75,
    }
    stale_bmkg = {
        "latitude": -0.69,
        "longitude": 100.29,  # Very close (~1.5 km)
        "timestamp": (now - timedelta(hours=18)).isoformat(),  # But 18 hours old
        "rainfall_mm": 40.0,
    }

    audit = cross_validate_news_with_bmkg(news, stale_bmkg, ref_time=now)
    assert audit["is_corroborated"] is False
    assert audit["temporal_delta_hours"] > 6.0
    assert audit["composite_confidence"] <= 0.50
    assert audit["validation_status"] == "UNCONFIRMED"


def test_physical_threshold_mismatch():
    """A claim of road blockage from flood with only 2.5 mm/h light drizzle fails the physical threshold."""
    now = datetime.now(timezone.utc)
    news = {
        "title": "Jalan nasional tergenang banjir di Kampar",
        "latitude": 0.33,
        "longitude": 101.02,
        "published_at": now.isoformat(),
        "incident_type": "flood",
        "confidence": 0.75,
    }
    drizzle_bmkg = {
        "latitude": 0.34,
        "longitude": 101.03,  # Nearby
        "timestamp": now.isoformat(),
        "rainfall_mm": 2.5,  # Only light drizzle (<20 mm/h threshold)
        "warning_level": None,
    }

    audit = cross_validate_news_with_bmkg(news, drizzle_bmkg, ref_time=now)
    assert audit["is_corroborated"] is False
    assert audit["composite_confidence"] <= 0.50
    assert audit["validation_status"] == "UNCONFIRMED"


def test_earthquake_magnitude_threshold():
    """Earthquake claims require official BMKG magnitude M >= 4.5 within 50 km."""
    now = datetime.now(timezone.utc)
    news = {
        "title": "Guncangan gempa bumi di Tarutung",
        "latitude": 2.01,
        "longitude": 98.96,
        "published_at": now.isoformat(),
        "incident_type": "earthquake",
        "confidence": 0.75,
    }

    # Case A: Minor tremor M = 3.4 -> Does not corroborate major disruption
    minor_eq = {
        "latitude": 2.02,
        "longitude": 98.97,
        "timestamp": now.isoformat(),
        "magnitude": 3.4,
    }
    audit_minor = cross_validate_news_with_bmkg(news, minor_eq, ref_time=now)
    assert audit_minor["is_corroborated"] is False
    assert audit_minor["composite_confidence"] <= 0.50

    # Case B: Significant quake M = 5.3 -> Corroborated
    major_eq = {
        "latitude": 2.10,
        "longitude": 98.90,  # ~12 km away
        "timestamp": now.isoformat(),
        "magnitude": 5.3,
    }
    audit_major = cross_validate_news_with_bmkg(news, major_eq, ref_time=now)
    assert audit_major["is_corroborated"] is True
    assert "seismic_magnitude_5.3" in audit_major["bmkg_parameter_matched"]
    assert audit_major["composite_confidence"] >= 0.85
    assert audit_major["validation_status"] == "VALIDATED"


def test_anti_tautology_headline_cannot_corroborate_itself():
    """
    Critical Anti-Tautology Test:
    A dramatic article headline ("Banjir bandang dan hujan badai ekstrem") without physical BMKG telemetry
    MUST NOT inflate weather confidence to 0.75, and consensus MUST remain capped at <= 0.50.
    """
    article = {
        "id": "test_tautology_article",
        "title": "Banjir bandang dan hujan badai ekstrem rendam koridor logistik",
        "summary": "Hujan deras berjam-jam akibatkan debit air sungai meluap tinggi.",
        "latitude": 3.5952,
        "longitude": 98.6722,
        "source": "Media Lokal",
        "source_tier": "TIER_2",
        "weather_telemetry": None,  # No physical telemetry
        "location_precision": "corridor_point",
    }

    ingestor = UnifiedNewsIngestor()
    final_tier, audit_payload = ingestor._verify_with_consensus_gate(article)

    # Weather channel must NOT be 0.75; must stay conservative
    channel_breakdown = audit_payload.get("channel_breakdown", {})
    weather_score = channel_breakdown.get("weather", 0.0)
    assert weather_score < 0.20

    # Overall consensus probability and confidence must not reach validated threshold
    assert audit_payload["calibrated_confidence"] <= 0.50
    assert "BMKG_RADAR" not in audit_payload.get("corroborating_agents", [])

    # Audit ledger must explicitly state unconfirmed status
    bmkg_cross = audit_payload.get("bmkg_cross_validation") or {}
    assert bmkg_cross.get("is_corroborated") is False
    assert bmkg_cross.get("validation_status") == "UNCONFIRMED"


def test_structured_audit_ledger_fields():
    """Asserts that all fields required by the BMKGCrossValidationResult schema exist and are properly typed."""
    claim = {"latitude": 3.0, "longitude": 98.0, "confidence": 0.7}
    telemetry = {"latitude": 3.05, "longitude": 98.02, "rainfall_mm": 28.0, "warning_level": "SIAGA"}

    result = cross_validate_news_with_bmkg(claim, telemetry)

    required_keys = [
        "is_corroborated",
        "spatial_delta_km",
        "temporal_delta_hours",
        "bmkg_parameter_matched",
        "bmkg_warning_level",
        "composite_confidence",
        "validation_status",
        "audit_notes",
    ]
    for key in required_keys:
        assert key in result, f"Missing required audit field: {key}"

    assert isinstance(result["is_corroborated"], bool)
    assert isinstance(result["spatial_delta_km"], float)
    assert isinstance(result["temporal_delta_hours"], float)
    assert isinstance(result["bmkg_parameter_matched"], str)
    assert isinstance(result["composite_confidence"], float)
    assert result["validation_status"] in ("VALIDATED", "UNCONFIRMED")
    assert isinstance(result["audit_notes"], str)
