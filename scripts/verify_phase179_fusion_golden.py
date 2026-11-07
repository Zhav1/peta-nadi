#!/usr/bin/env python3
"""
scripts/verify_phase179_fusion_golden.py
Phase 179 Golden Acceptance Suite: Spatial Incident Fusion, Disruption Rubric, and Baseline Purge.
"""
from __future__ import annotations

import sys
import os
from datetime import datetime, timezone

# Ensure project root & backend are in sys.path
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.services.spatial_fusion_engine import fuse_signals_to_incidents
from app.nlp.news_extractor import passes_logistics_disruption_prefilter
from app.routers.news_router import classify_relevance_tier, is_regional_context
from app.services.observed_disaster_service import get_northern_sumatra_flood_zones
from app.adapters.aisstream_adapter import generate_sumatra_maritime_fallback
from app.adapters.tomtom_adapter import is_in_sumatra_bounds, extract_polyline_from_flow


def test_case_1_corroborated_localized_flood() -> None:
    print("\n--- [CASE 1] Corroborated Localized Flood at Medan Belawan ---")
    now = datetime.now(timezone.utc)
    signals = [
        {
            "id": "pb-belawan-001",
            "source": "petabencana",
            "hazard_type": "flood",
            "lat": 3.7850,
            "lon": 98.6850,
            "title": "Banjir Rob Belawan RW 02",
            "reported_at": now.isoformat(),
        },
        {
            "id": "bmkg-cap-belawan-002",
            "source": "bmkg_cap",
            "hazard_type": "flood",
            "lat": 3.7855,
            "lon": 98.6855,
            "title": "Peringatan Dini Cuaca Ekstrem Medan Belawan",
            "reported_at": now.isoformat(),
        },
        {
            "id": "news-belawan-003",
            "source": "news",
            "hazard_type": "flood",
            "lat": 3.7848,
            "lon": 98.6848,
            "title": "Banjir Rob Rendam Jalan Akses Pelabuhan Belawan",
            "reported_at": now.isoformat(),
        },
    ]

    incidents = fuse_signals_to_incidents(signals, now=now)
    assert len(incidents) == 1, f"Expected exactly 1 merged incident, got {len(incidents)}"

    inc = incidents[0]
    print(f"Merged Incident ID: {inc['id']}")
    print(f"Tier: {inc['tier']}, Source count: {inc['source_count']}, Sources: {inc['sources']}")
    print(f"Radius km: {inc['radius_km']}, Geometry type: {inc['geometry'].get('type')}")

    assert inc["tier"] == "CONFIRMED", f"Expected tier CONFIRMED, got {inc['tier']}"
    assert inc["source_count"] == 3, f"Expected 3 sources, got {inc['source_count']}"
    assert set(inc["sources"]) == {"petabencana", "bmkg_cap", "news"}
    assert inc["radius_km"] <= 1.5, f"Expected localized radius_km <= 1.5, got {inc['radius_km']}"
    assert inc["geometry"]["type"] in ("Polygon", "MultiPolygon"), "Expected valid GeoJSON Polygon geometry"
    assert len(inc["polygon"]) >= 4, "Expected valid closed polygon ring vertices"
    print("✓ Case 1 Passed: 3 Belawan signals correctly fused into 1 CONFIRMED localized incident.")


def test_case_2_isolated_zone_preserved() -> None:
    print("\n--- [CASE 2] Isolated Zone Preserved in Padang ---")
    now = datetime.now(timezone.utc)
    signals = [
        {
            "id": "pb-belawan-001",
            "source": "petabencana",
            "hazard_type": "flood",
            "lat": 3.7850,
            "lon": 98.6850,
            "title": "Banjir Rob Belawan",
            "reported_at": now.isoformat(),
        },
        {
            "id": "bmkg-cap-belawan-002",
            "source": "bmkg_cap",
            "hazard_type": "flood",
            "lat": 3.7855,
            "lon": 98.6855,
            "title": "Peringatan Dini Cuaca Ekstrem Medan Belawan",
            "reported_at": now.isoformat(),
        },
        {
            "id": "news-belawan-003",
            "source": "news",
            "hazard_type": "flood",
            "lat": 3.7848,
            "lon": 98.6848,
            "title": "Banjir Rob Rendam Jalan Akses Pelabuhan Belawan",
            "reported_at": now.isoformat(),
        },
        {
            "id": "pb-padang-004",
            "source": "petabencana",
            "hazard_type": "flood",
            "lat": -0.9471,
            "lon": 100.3543,
            "title": "Genangan Air di Padang Barat",
            "reported_at": now.isoformat(),
        },
    ]

    incidents = fuse_signals_to_incidents(signals, now=now)
    assert len(incidents) == 2, f"Expected exactly 2 incidents, got {len(incidents)}"

    # Find Belawan and Padang incidents
    belawan_inc = next((i for i in incidents if i["lat"] > 2.0), None)
    padang_inc = next((i for i in incidents if i["lat"] < 0.0), None)

    assert belawan_inc is not None, "Belawan incident missing"
    assert padang_inc is not None, "Padang incident missing"

    assert belawan_inc["tier"] == "CONFIRMED", f"Belawan should be CONFIRMED, got {belawan_inc['tier']}"
    assert belawan_inc["source_count"] == 3
    assert belawan_inc["radius_km"] <= 1.5

    assert padang_inc["tier"] == "WATCH", f"Padang should be WATCH, got {padang_inc['tier']}"
    assert padang_inc["source_count"] == 1
    assert padang_inc["sources"] == ["petabencana"]
    assert padang_inc["radius_km"] <= 0.5, f"Padang single-source radius_km should be <= 0.5, got {padang_inc['radius_km']}"

    print(f"Belawan: {belawan_inc['id']} ({belawan_inc['tier']}, {belawan_inc['radius_km']}km)")
    print(f"Padang:  {padang_inc['id']} ({padang_inc['tier']}, {padang_inc['radius_km']}km)")
    print("✓ Case 2 Passed: Isolated Padang incident preserved as separate WATCH zone without cross-provincial merge.")


def test_case_3_irrelevant_csr_routine_news_dropped() -> None:
    print("\n--- [CASE 3] Irrelevant CSR/Routine News Dropped + LLM Hold-Back ---")
    articles = [
        {
            "url": "https://sumut.antaranews.com/berita/676263/pln-sumut-tingkatkan-kompetensi-siswa-melalui-pelatihan-motor-listrik",
            "title": "PLN Sumut tingkatkan kompetensi siswa melalui pelatihan motor listrik",
            "raw_description": "Medan (ANTARA) - PT PLN Unit Induk Distribusi Sumatera Utara menggelar pelatihan teknis konversi motor listrik.",
            "summary": "Medan (ANTARA) - PT PLN Unit Induk Distribusi Sumatera Utara menggelar pelatihan teknis konversi motor listrik.",
        },
        {
            "url": "https://sumut.antaranews.com/berita/676247/kapolres-tapsel-bagikan-helm-sni-ingatkan-pengendara-keselamatan-keluarga",
            "title": "Kapolres Tapsel bagikan helm SNI ingatkan pengendara keselamatan keluarga",
            "raw_description": "Tapanuli Selatan (ANTARA) - Kapolres Tapanuli Selatan membagikan puluhan helm berstandar SNI gratis kepada pengendara.",
            "summary": "Tapanuli Selatan (ANTARA) - Kapolres Tapanuli Selatan membagikan puluhan helm berstandar SNI gratis kepada pengendara.",
        },
    ]

    for art in articles:
        prefilter_passed = passes_logistics_disruption_prefilter(art["title"], art["summary"])
        relevance_tier = classify_relevance_tier(art)
        regional = is_regional_context(art)

        print(f"Article: \"{art['title'][:45]}...\"")
        print(f"  passes_logistics_disruption_prefilter: {prefilter_passed}")
        print(f"  classify_relevance_tier:               {relevance_tier}")
        print(f"  is_regional_context:                   {regional}")

        assert prefilter_passed is False, f"Expected prefilter=False for CSR/ceremony: {art['title']}"
        assert relevance_tier == "dropped", f"Expected relevance_tier='dropped', got {relevance_tier}"
        assert regional is False, f"Expected is_regional_context=False, got {regional}"

    print("✓ Case 3 Passed: Routine CSR & ceremonial articles are dropped with 0 token waste.")


def test_case_4_hardcoded_baselines_purged_and_polylines_preserved() -> None:
    print("\n--- [CASE 4] Hardcoded Baselines Purged & Real Polylines Preserved ---")

    # A. Flood baselines purged
    flood_zones = get_northern_sumatra_flood_zones()
    assert flood_zones == [], f"Expected get_northern_sumatra_flood_zones() == [], got {flood_zones}"
    print("✓ Flood baselines purged: get_northern_sumatra_flood_zones() == []")

    # B. Maritime fallback purged
    maritime_fallback = generate_sumatra_maritime_fallback()
    assert maritime_fallback == [], f"Expected generate_sumatra_maritime_fallback() == [], got {maritime_fallback}"
    print("✓ Maritime baselines purged: generate_sumatra_maritime_fallback() == []")

    # C. Sumatra boundary filter
    kl_in_sumatra = is_in_sumatra_bounds(3.1390, 101.6869)
    medan_in_sumatra = is_in_sumatra_bounds(3.5952, 98.6722)
    print(f"Kuala Lumpur (3.1390, 101.6869) in Sumatra bounds: {kl_in_sumatra} (expected False)")
    print(f"Medan (3.5952, 98.6722) in Sumatra bounds:         {medan_in_sumatra} (expected True)")
    assert kl_in_sumatra is False, "Kuala Lumpur should NOT be in Sumatra operational bounds"
    assert medan_in_sumatra is True, "Medan should be in Sumatra operational bounds"

    # D. TomTom multi-vertex road polyline preservation
    flow_segment_payload = {
        "coordinates": {
            "coordinate": [
                {"latitude": 3.7850, "longitude": 98.6850},
                {"latitude": 3.7865, "longitude": 98.6862},
                {"latitude": 3.7880, "longitude": 98.6875},
                {"latitude": 3.7900, "longitude": 98.6890},
            ]
        }
    }
    extracted_polyline = extract_polyline_from_flow(flow_segment_payload)
    print(f"Extracted road polyline vertex count: {len(extracted_polyline)}")
    print(f"First vertex: {extracted_polyline[0]}, Last vertex: {extracted_polyline[-1]}")
    assert len(extracted_polyline) == 4, f"Expected 4 vertices, got {len(extracted_polyline)}"
    assert extracted_polyline[0] == [98.6850, 3.7850]
    assert extracted_polyline[-1] == [98.6890, 3.7900]
    print("✓ Real TomTom multi-vertex road polyline preserved successfully.")


def test_case_5_public_snapshot_curation_end_to_end() -> None:
    print("\n--- [CASE 5] Public Snapshot Curation & Operational Field Retention ---")
    import asyncio
    from app.services.public_snapshot_service import (
        _curate,
        _build_fleet_entry,
        _compute_source_health,
        build_public_snapshot,
    )

    # 1. Test _curate preserves operational incident / hotspot fields
    sample_payload = {
        "hotspots": [{"lat": 1.0, "lon": 101.0, "frp": 12.5}],
        "tier": "CONFIRMED",
        "sources": ["bmkg_cap", "petabencana"],
        "radius_km": 0.45,
        "generated_at": "2026-11-07T00:00:00Z",
        "company_id": "secret-corp",  # should be stripped
        "driver_id": "driver-secret", # should be stripped
    }
    curated = _curate(sample_payload)
    print(f"Curated keys: {list(curated.keys())}")
    assert "hotspots" in curated, "Expected 'hotspots' preserved in _curate"
    assert "frp" in curated["hotspots"][0], "Expected 'frp' preserved in hotspots list"
    assert curated["tier"] == "CONFIRMED", "Expected 'tier' preserved in _curate"
    assert curated["sources"] == ["bmkg_cap", "petabencana"], "Expected 'sources' preserved in _curate"
    assert curated["radius_km"] == 0.45, "Expected 'radius_km' preserved in _curate"
    assert curated["generated_at"] == "2026-11-07T00:00:00Z", "Expected 'generated_at' preserved in _curate"
    assert "company_id" not in curated, "Expected 'company_id' stripped by _curate"
    assert "driver_id" not in curated, "Expected 'driver_id' stripped by _curate"

    # 2. Test fleet entry & source health
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    fleet_entry, raw_vehicles = asyncio.run(_build_fleet_entry(now_iso, {}))
    assert isinstance(fleet_entry["data"]["vehicles"], list), "Fleet vehicles must be a list in fleet_entry['data']"

    dummy_sections = {
        "official_warnings": {"status": "ok", "observed_at": now_iso},
        "disaster_reports": {"status": "ok", "observed_at": now_iso},
    }
    health = _compute_source_health(dummy_sections, None, {}, [], now_dt)
    assert "sources" in health and isinstance(health["sources"], list), "Source health must contain 'sources' list"
    assert "bmkg_cap" in health, "Source health must contain dict key 'bmkg_cap'"

    # 3. Test build_public_snapshot() end to end
    snapshot = asyncio.run(build_public_snapshot())
    sections = snapshot["sections"]

    assert "fleet" in sections, "Snapshot must contain 'fleet' section"
    assert isinstance(sections["fleet"]["data"]["vehicles"], list), "sections['fleet']['data']['vehicles'] must not be stripped"

    assert "source_health" in sections, "Snapshot must contain 'source_health' section"
    sh_data = sections["source_health"]["data"]
    assert "sources" in sh_data and isinstance(sh_data["sources"], list) and len(sh_data["sources"]) > 0, (
        "sections['source_health']['data']['sources'] must be non-empty list"
    )
    assert "bmkg_cap" in sh_data, "sections['source_health']['data']['bmkg_cap'] must exist"

    print("✓ Case 5 Passed: Public snapshot preserves fleet vehicles, source health, and operational fields without silent drops.")


def main() -> None:
    print("=" * 70)
    print("Phase 179 Golden Acceptance Suite: Spatial Incident Fusion Engine")
    print("=" * 70)

    test_case_1_corroborated_localized_flood()
    test_case_2_isolated_zone_preserved()
    test_case_3_irrelevant_csr_routine_news_dropped()
    test_case_4_hardcoded_baselines_purged_and_polylines_preserved()
    test_case_5_public_snapshot_curation_end_to_end()

    print("\n" + "=" * 70)
    print("ALL PHASE 179 FUSION GOLDEN ACCEPTANCE TESTS PASSED (EXIT 0)")
    print("=" * 70)


if __name__ == "__main__":
    main()
