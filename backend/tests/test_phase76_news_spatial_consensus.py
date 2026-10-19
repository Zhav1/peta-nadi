"""
Phase 76 Unit Test Suite:
1. Gazetteer & Geocoding Remediation:
   - "antrean panjang" / "sepanjang" does NOT trigger false Panjang (Lampung) geocoding.
   - Aceh regencies (Abdya, Blangpidie, etc.) and Medan/Deli Serdang Kecamatan nodes resolve correctly.
   - Longest-key ordering with strict word boundary regex.
   - Bureau dateline stripping (detikSumut, etc.).
2. 3-Tier Micro-Spatial Bounding:
   - Tier A (corridor_point): 0.6–1.2 km anisotropic ellipse, semi_minor <= 0.5 km.
   - Tier B (kecamatan_kelurahan): 1.5–2.2 km real ADM3 subdistrict boundary polygon.
   - Tier C (kabupaten_kota / province_only): 3.2–4.5 km subtle advisory zone capped at YELLOW_CLARIFY.
3. ConsensusGate & News Escalation:
   - 4 channels (W: Weather, T: Traffic, I: OSINT, E: Economics)
   - Tier C broad regency cannot synthesize physical RED_CONFIRMED incidents.
"""
import pytest
from unittest.mock import patch, MagicMock

from app.nlp.geocoding_service import (
    resolve_sumatra_location_and_corridor,
    resolve_all_sumatra_locations,
    strip_bureau_and_dateline_noise,
)
from app.nlp.news_extractor import (
    _fast_heuristic_extraction,
    run_agent_verification_gate,
)
from app.services.incident_geometry_service import (
    compute_hazard_zone_geometry_and_radius,
)
from app.services.unified_news_ingestor import (
    UnifiedNewsIngestor,
    to_ewkt_polygon,
)


def test_abdya_aceh_no_panjang_collision():
    """Verify that 'antrean panjang' in Abdya Aceh never triggers false Panjang (Lampung) geocode."""
    text = "Hujan deras guyur Abdya Aceh, antrean panjang kendaraan di jalan lintas barat"
    res = resolve_sumatra_location_and_corridor(text)

    assert res["is_geocoded"] is True
    assert res["matched_node"] in ("Abdya", "Aceh Barat Daya")
    assert res["province"] == "Aceh"

    # Must be in Aceh (~3.74 lat), NOT in Lampung (-5.4744 lat)
    assert res["latitude"] > 0.0
    assert abs(res["latitude"] - 3.74) < 0.2
    assert abs(res["longitude"] - 96.84) < 0.2
    assert not (-5.6 <= res["latitude"] <= -5.3)


def test_padang_panjang_vs_pelabuhan_panjang():
    """Verify longest-key matching resolves Padang Panjang to West Sumatra and Pelabuhan Panjang to Lampung."""
    # 1. Padang Panjang in West Sumatra
    text_padang_panjang = "Banjir lahar dingin di Padang Panjang putus akses jalan nasional"
    res_pp = resolve_sumatra_location_and_corridor(text_padang_panjang)
    assert res_pp["matched_node"] == "Padang Panjang"
    assert res_pp["province"] == "Sumatera Barat"
    assert abs(res_pp["latitude"] - (-0.4667)) < 0.05
    assert abs(res_pp["longitude"] - 100.4) < 0.05

    # 2. Pelabuhan Panjang in Lampung
    text_pelabuhan_panjang = "Aktivitas bongkar muat di Pelabuhan Samudera Panjang Lampung berjalan normal"
    res_lp = resolve_sumatra_location_and_corridor(text_pelabuhan_panjang)
    assert "Panjang" in res_lp["matched_node"]
    assert res_lp["province"] == "Lampung"
    assert abs(res_lp["latitude"] - (-5.4744)) < 0.05


def test_medan_johor_corridor_point_and_bureau_strip():
    """Verify Medan subdistricts resolve to corridor_point with tight radius and dateline stripped."""
    raw_title = "Truk Terguling di Medan Johor, Lalin Sempat Macet - detikSumut"
    clean_title = strip_bureau_and_dateline_noise(raw_title)

    assert "detikSumut" not in clean_title
    assert "Truk Terguling di Medan Johor" in clean_title

    res = resolve_sumatra_location_and_corridor(clean_title)
    assert res["matched_node"] == "Medan Johor"
    assert res["location_precision"] == "corridor_point"
    assert abs(res["latitude"] - 3.5333) < 0.05
    assert abs(res["longitude"] - 98.6667) < 0.05

    # Test extraction radius bounding
    extracted = _fast_heuristic_extraction({
        "title": raw_title,
        "source": "detikSumut",
        "raw_description": "Kecelakaan truk di kawasan Medan Johor menyebabkan kemacetan."
    })
    assert extracted["location_precision"] == "corridor_point"
    assert extracted["radius_km"] is not None
    assert extracted["radius_km"] <= 1.2


def test_tier_c_regency_invariant_yellow_clarify_cap():
    """Verify broad regency mention without road blockage cannot be RED_CONFIRMED."""
    article = {
        "title": "Cuaca buruk di Kabupaten Aceh Barat Daya melanda perkebunan warga",
        "source": "Antara Aceh",
        "raw_description": "Hujan intensitas sedang mengguyur sebagian perkebunan kelapa sawit."
    }
    extracted = _fast_heuristic_extraction(article)

    # Location precision must be kabupaten_kota
    assert extracted["location_precision"] == "kabupaten_kota"
    # Hard invariant: Capped at YELLOW_CLARIFY, never RED_CONFIRMED
    assert extracted["zone_tier"] == "YELLOW_CLARIFY"
    assert extracted["zone_tier"] != "RED_CONFIRMED"

    # Verification gate also enforces the invariant cap
    audit = run_agent_verification_gate(extracted)
    assert audit.get("impact_corroborated") is False
    assert "YELLOW" in audit.get("agent_verdict_summary", "")


def test_three_tier_micro_spatial_geometry():
    """Verify 3-Tier micro-spatial geometry dimensions and constraints."""
    # Tier A: Corridor point
    tier_a = compute_hazard_zone_geometry_and_radius(
        incident_type="road_closure",
        severity="high",
        location_precision="corridor_point",
        zone_tier="RED_CONFIRMED",
        lat=3.5333,
        lon=98.6667,
        corridor_segment="Medan - Tebing Tinggi"
    )
    assert tier_a["spatial_tier"] == "TIER_A"
    assert 0.6 <= tier_a["radius_km"] <= 1.2
    assert tier_a["semi_minor_km"] <= 0.5
    assert len(tier_a["geometry_polygon"]) >= 16

    # Tier B: Kecamatan / Sub-district
    tier_b = compute_hazard_zone_geometry_and_radius(
        incident_type="flood",
        severity="medium",
        location_precision="kecamatan_kelurahan",
        zone_tier="YELLOW_CLARIFY",
        lat=3.5333,
        lon=98.6667,
        corridor_segment="Medan - Binjai"
    )
    assert tier_b["spatial_tier"] == "TIER_B"
    assert 1.5 <= tier_b["radius_km"] <= 2.2
    assert len(tier_b["geometry_polygon"]) >= 16

    # Tier C: Kabupaten / Kota
    tier_c = compute_hazard_zone_geometry_and_radius(
        incident_type="weather_warning",
        severity="low",
        location_precision="kabupaten_kota",
        zone_tier="YELLOW_CLARIFY",
        lat=3.74,
        lon=96.84,
        corridor_segment="Aceh Barat Daya"
    )
    assert tier_c["spatial_tier"] == "TIER_C"
    assert 3.2 <= tier_c["radius_km"] <= 4.5
    assert len(tier_c["geometry_polygon"]) >= 16


def test_to_ewkt_polygon_helper():
    """Verify PostGIS EWKT polygon serialization."""
    # Closed ring of 4 points + closing point
    ring = [[98.6, 3.5], [98.7, 3.5], [98.7, 3.6], [98.6, 3.6], [98.6, 3.5]]
    ewkt = to_ewkt_polygon(ring)
    assert ewkt is not None
    assert ewkt.startswith("SRID=4326;POLYGON((")
    assert ewkt.endswith("))")
    assert "98.6 3.5" in ewkt

    # Unclosed ring gets automatically closed
    unclosed_ring = [[98.6, 3.5], [98.7, 3.5], [98.7, 3.6]]
    ewkt_unclosed = to_ewkt_polygon(unclosed_ring)
    assert ewkt_unclosed is not None
    assert ewkt_unclosed.startswith("SRID=4326;POLYGON((")

    # Invalid returns None
    assert to_ewkt_polygon([]) is None
    assert to_ewkt_polygon(None) is None


def test_consensus_gate_multi_sensor_escalation():
    """Verify _verify_with_consensus_gate evaluates 4 channels (W, T, I, E) properly."""
    ingestor = UnifiedNewsIngestor()

    # Article with road blockage and high authority
    art_critical = {
        "title": "Banjir Luapan Putus Jalan Lintas Sumatera di Medan Johor, Macet Parah",
        "incident_type": "flood",
        "severity": "critical",
        "source": "LKBN ANTARA Sumut",
        "source_tier": "TIER_1_OFFICIAL",
        "latitude": 3.5333,
        "longitude": 98.6667,
        "corridor_segment": "Medan - Berastagi",
        "commodities_affected": ["Cabai Merah", "Beras BULOG"],
        "location_precision": "corridor_point",
        "weather_telemetry": {"rainfall_mm": 25.0, "wind_speed_kt": 15.0}
    }

    tier, audit = ingestor._verify_with_consensus_gate(art_critical)
    assert tier == "RED_CONFIRMED"
    assert audit.get("calibrated_confidence", 0) >= 0.70
    assert "BMKG_RADAR" in audit.get("corroborating_agents", [])
    assert "OSINT_AUTHORITY" in audit.get("corroborating_agents", [])

    # Article with no physical blockage and mild weather
    art_mild = {
        "title": "Prakiraan Cuaca Cerah Berawan di Wilayah Medan Johor",
        "incident_type": "weather_warning",
        "severity": "low",
        "source": "detikSumut",
        "source_tier": "TIER_2_REGIONAL",
        "latitude": 3.5333,
        "longitude": 98.6667,
        "corridor_segment": "Medan - Berastagi",
        "commodities_affected": [],
        "location_precision": "corridor_point",
        "weather_telemetry": {"rainfall_mm": 0.0, "wind_speed_kt": 5.0}
    }

    tier, audit = ingestor._verify_with_consensus_gate(art_mild)
    assert tier == "YELLOW_CLARIFY"
    assert tier != "RED_CONFIRMED"
