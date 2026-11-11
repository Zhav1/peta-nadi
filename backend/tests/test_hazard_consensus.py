"""
Unit and Integration Tests for Phase 182: Unified Backend Hazard Consensus Engine.
Verifies:
1. Authority Tiering: CONFIRMED (>=2 sources, >=1 official/physical), WATCH (1 source), ADVISORY (official text warning).
2. Geometry & Advisory Boundaries: Real administrative boundary polygon used, flagged 'advisory_area', never blocks.
3. Missing Boundary Gap Reporting: Missing administrative fixture returns None & reports gap (no synthetic shapes).
4. Earthquake Gate M4.0: Shallow M>=4.0 quakes ingested, deep quakes excluded, consistent radius in geometry.
5. Routing Flag When No Detour Exists: affected segment geometry/indices, note, risk level, and delay minutes attached.
6. LLM Conflict Resolution & Offline Fallback: LLMGateway invoked on conflict; fallback sets llm_used=False.
7. API Endpoints: GET /api/v1/hazards/consensus and POST /api/v1/hazards/check-route contracts.
"""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

from app.services.hazard_consensus_service import (
    compute_hazard_consensus,
    trip_hazard_intersections,
    get_cached_hazards_consensus,
    save_hazards_consensus_cache,
    persist_hazards_consensus_to_supabase,
)
from app.services.adm_boundary_service import (
    get_advisory_boundary_for_area,
    get_province_boundaries,
)
from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.cpu_routing_adapter import get_cpu_router
from app.services.hazard_evidence import (
    normalize_hazard_evidence,
    assess_route_hazards,
    route_intersects_geometry,
)


@pytest.fixture
def sample_now():
    return datetime(2026, 11, 11, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# 1. Authority Tiering Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_authority_tiering_confirmed(sample_now):
    """Multi-source cluster (>=2 sources, >=1 official/physical) produces CONFIRMED tier."""
    signals = [
        {
            "source": "bmkg_cap",
            "hazard_type": "flood",
            "severity": "high",
            "lat": 3.78,
            "lon": 98.68,
            "title": "Banjir Rob Belawan",
            "ts": sample_now.isoformat(),
        },
        {
            "source": "petabencana",
            "hazard_type": "flood",
            "severity": "high",
            "lat": 3.782,
            "lon": 98.681,
            "title": "Laporan Banjir Genangan Warga",
            "ts": sample_now.isoformat(),
        },
    ]

    records = await compute_hazard_consensus(signals=signals, now=sample_now)
    assert len(records) == 1
    rec = records[0]
    assert rec["tier"] == "CONFIRMED"
    assert rec["type"] == "flood"
    assert rec["confidence"] >= 0.80
    assert set(rec["sources"]) == {"bmkg_cap", "petabencana"}
    assert rec["llm_used"] is False
    assert "Terkonfirmasi" in rec["reason"]


@pytest.mark.asyncio
async def test_authority_tiering_watch(sample_now):
    """Single credible source produces WATCH tier."""
    signals = [
        {
            "source": "firms",
            "hazard_type": "fire",
            "severity": "high",
            "lat": 1.67,
            "lon": 101.45,
            "title": "Hotspot Dumai",
            "ts": sample_now.isoformat(),
        }
    ]

    records = await compute_hazard_consensus(signals=signals, now=sample_now)
    assert len(records) == 1
    rec = records[0]
    assert rec["tier"] == "WATCH"
    assert rec["type"] == "fire"
    assert rec["sources"] == ["firms"]
    assert rec["llm_used"] is False
    assert "Terpantau" in rec["reason"]


@pytest.mark.asyncio
async def test_authority_tiering_advisory(sample_now):
    """Official text-only warning with extent_unknown produces ADVISORY tier."""
    signals = [
        {
            "source": "bmkg",
            "hazard_type": "weather_warning",
            "geometry_role": "extent_unknown",
            "province": "Sumatera Utara",
            "title": "Peringatan Dini Cuaca BMKG Wilayah Sumut",
            "ts": sample_now.isoformat(),
        }
    ]

    records = await compute_hazard_consensus(signals=signals, now=sample_now)
    assert len(records) == 1
    rec = records[0]
    assert rec["tier"] == "ADVISORY"
    assert rec["type"] == "flood" or rec["type"] == "weather" or "weather" in rec["type"]
    assert rec["geometry_role"] == "advisory_area"
    assert rec["geometry"] is not None
    assert rec["geometry"]["type"] in ("Polygon", "MultiPolygon")
    assert "Peringatan dini administratif" in rec["reason"]


# ---------------------------------------------------------------------------
# 2. Advisory Boundaries & Cap Reconciliation (Never Block)
# ---------------------------------------------------------------------------

def test_advisory_boundary_resolver():
    """Real boundaries are returned for Sumatra provinces and regencies."""
    aceh = get_advisory_boundary_for_area("Aceh")
    assert aceh is not None and aceh["type"] == "MultiPolygon"

    sumut = get_advisory_boundary_for_area("Sumut")
    assert sumut is not None and sumut["type"] == "MultiPolygon"

    medan = get_advisory_boundary_for_area("Kota Medan")
    assert medan is not None and medan["type"] in ("Polygon", "MultiPolygon")


@pytest.mark.asyncio
async def test_missing_boundary_reports_gap_not_synthetic_shape(sample_now):
    """Missing boundary fixture leaves geometry=None, extent_unknown, and reports gap."""
    signals = [
        {
            "source": "bmkg",
            "hazard_type": "weather_warning",
            "geometry_role": "extent_unknown",
            "area_name": "Wilayah Fiktif Antah Berantah",
            "title": "Peringatan Wilayah Unknown",
            "ts": sample_now.isoformat(),
        }
    ]

    records = await compute_hazard_consensus(signals=signals, now=sample_now)
    assert len(records) == 1
    rec = records[0]
    assert rec["tier"] == "ADVISORY"
    assert rec["geometry"] is None
    assert rec["geometry_role"] == "extent_unknown"
    assert "belum tersedia" in rec["reason"]


def test_advisory_tier_never_treated_as_confirmed_blockage(sample_now):
    """Even with a massive province boundary, an ADVISORY record is never classified as CONFIRMED_BLOCKAGE."""
    sumut_geom = get_advisory_boundary_for_area("Sumatera Utara")
    advisory_hazard = {
        "incident_id": "cons-adv-weather-sumut",
        "type": "weather",
        "tier": "ADVISORY",
        "geometry_role": "advisory_area",
        "geometry": sumut_geom,
        "observed_at": sample_now.isoformat(),
        "status": "active",
        "source": "bmkg",
    }

    evidence = normalize_hazard_evidence(advisory_hazard, now=sample_now)
    assert evidence["classification"] == "PRECAUTIONARY_RISK"
    assert evidence["classification"] != "CONFIRMED_BLOCKAGE"
    assert evidence["is_advisory"] is True
    assert evidence["reason"] == "advisory_warning_area"

    # Assess route crossing this province boundary
    route = [[98.67, 3.59], [98.70, 3.65]]
    assessment = assess_route_hazards(route, [evidence], coverage_status="complete")
    assert assessment["status"] != "BLOCKED"
    assert assessment["clearance_status"] == "REVIEW"


# ---------------------------------------------------------------------------
# 3. Earthquake Ingestion Gate M>=4.0 & Consistent Radius
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_quake_gate_m4_shallow_included():
    """BMKG autogempa M>=4.0 shallow event in Sumatra is ingested with consistent geometry."""
    adapter = BMKGAdapter()
    raw = {
        "earthquake": {
            "Infogempa": {
                "gempa": {
                    "Magnitude": "4.3",
                    "Wilayah": "Pusat gempa berada di darat 15 km barat daya Tarutung, Sumut",
                    "Coordinates": "2.01,98.96",
                    "Kedalaman": "10 km",
                    "Tanggal": "11 Nov 2026",
                    "Jam": "12:00:00 WIB",
                }
            }
        }
    }

    with patch("app.adapters.bmkg_adapter.get_redis", return_value=None):
        events = await adapter.parse(raw)
        assert len(events) == 1
        ev = events[0]
        assert ev["event_type"] == "earthquake"
        assert ev["magnitude"] == 4.3
        assert ev["radius_km"] == 1.5
        assert ev["geometry_role"] == "source_footprint"
        assert ev["geometry"]["type"] == "Polygon"


@pytest.mark.asyncio
async def test_quake_gate_deep_excluded():
    """Deep earthquake (>60 km) is excluded even if M>=4.0."""
    adapter = BMKGAdapter()
    raw = {
        "earthquake": {
            "Infogempa": {
                "gempa": {
                    "Magnitude": "4.8",
                    "Wilayah": "Pusat gempa berada di laut 80 km barat Padang",
                    "Coordinates": "-1.15,99.85",
                    "Kedalaman": "120 km",  # Deep event
                    "Tanggal": "11 Nov 2026",
                    "Jam": "12:05:00 WIB",
                }
            }
        }
    }

    with patch("app.adapters.bmkg_adapter.get_redis", return_value=None):
        events = await adapter.parse(raw)
        assert len(events) == 0


@pytest.mark.asyncio
async def test_quake_gate_sub4_excluded():
    """Earthquake with magnitude < 4.0 is excluded."""
    adapter = BMKGAdapter()
    raw = {
        "earthquake": {
            "Infogempa": {
                "gempa": {
                    "Magnitude": "3.8",
                    "Wilayah": "Pusat gempa di darat 5 km Tapanuli",
                    "Coordinates": "2.01,98.96",
                    "Kedalaman": "10 km",
                    "Tanggal": "11 Nov 2026",
                    "Jam": "12:10:00 WIB",
                }
            }
        }
    }

    with patch("app.adapters.bmkg_adapter.get_redis", return_value=None):
        events = await adapter.parse(raw)
        assert len(events) == 0


# ---------------------------------------------------------------------------
# 4. Routing Flag When Best Route Intersects Hazard With No Detour
# ---------------------------------------------------------------------------

def test_routing_flag_when_no_detour_exists(sample_now):
    """When the best route intersects a hazard and no clear detour exists, hazard_intersection is attached."""
    router = get_cpu_router()
    # A hazard right across the Belawan - Medan corridor (Belmera segment)
    crossing_polygon = {
        "type": "Polygon",
        "coordinates": [[[98.67, 3.65], [98.72, 3.65], [98.72, 3.75], [98.67, 3.75], [98.67, 3.65]]],
    }
    hazard = {
        "id": "cons-flood-belawan-cross",
        "type": "flood",
        "tier": "CONFIRMED",
        "severity": "high",
        "geometry": crossing_polygon,
        "geometry_role": "buffer_footprint",
        "reason": "Luapan banjir pasang rob menutup arteri Belawan.",
        "observed_at": sample_now.isoformat(),
        "status": "active",
        "source": "bmkg_cap",
    }

    # Solve route from Belawan to Medan (chokepoint corridor)
    solution = router.solve_shortest_path(
        origin_id="belawan_port",
        dest_id="medan_kim",
        hazard_zones=[hazard],
        k_alternatives=1,  # Only 1 path requested -> no detour available
    )

    routes = solution.get("routes", [])
    assert len(routes) > 0
    r0 = routes[0]

    # Best route still intersects hazard and has no detour
    assert "hazard_intersection" in r0
    h_int = r0["hazard_intersection"]
    assert h_int is not None
    assert h_int["has_intersection"] is True
    assert h_int["has_detour"] is False
    assert len(h_int["affected_segment_indices"]) > 0
    assert len(h_int["affected_segments"]) > 0
    assert h_int["risk_level"] in ("high", "medium")
    assert h_int["estimated_delay_minutes"] > 0
    assert "Melintasi area bahaya" in h_int["note"] or "Rute terbaik" in h_int["note"]

    # Top-level solution also carries the hazard intersection
    assert "hazard_intersection" in solution
    assert solution["hazard_intersection"] == h_int


# ---------------------------------------------------------------------------
# 5. LLM Conflict Resolution & Offline Fallback
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_llm_conflict_resolution_success(sample_now):
    """When signals conflict and LLM is available, LLM verdict & reason are used."""
    signals = [
        {
            "source": "news",
            "hazard_type": "flood",
            "severity": "critical",
            "lat": 3.595,
            "lon": 98.672,
            "title": "Banjir Bandang Menutup Total Jalan di Medan",
            "ts": sample_now.isoformat(),
        },
        {
            "source": "tomtom",
            "hazard_type": "traffic",
            "severity": "low",
            "lat": 3.596,
            "lon": 98.673,
            "title": "Arteri Medan Normal Lancar",
            "ts": sample_now.isoformat(),
        },
    ]

    mock_llm_response = (
        "VONIS: WATCH\n"
        "ALASAN: Informasi media belum terkonfirmasi oleh sensor TomTom yang menunjukkan arus lancar. Pemantauan berkala disarankan."
    )

    with patch("agents.llm_gateway.LLMGateway.generate_content", new_callable=AsyncMock) as mock_generate:
        mock_generate.return_value = mock_llm_response
        records = await compute_hazard_consensus(signals=signals, now=sample_now)

        assert len(records) == 1
        rec = records[0]
        assert rec["tier"] == "WATCH"
        assert rec["llm_used"] is True
        assert "belum terkonfirmasi" in rec["reason"]


@pytest.mark.asyncio
async def test_llm_conflict_resolution_fallback(sample_now):
    """When LLMGateway is unavailable, falls back to rule tier with llm_used=False."""
    from agents.llm_gateway import LLMGatewayUnavailable

    signals = [
        {
            "source": "news",
            "hazard_type": "flood",
            "severity": "critical",
            "lat": 3.595,
            "lon": 98.672,
            "title": "Banjir Total Medan",
            "ts": sample_now.isoformat(),
        },
        {
            "source": "tomtom",
            "hazard_type": "traffic",
            "severity": "low",
            "lat": 3.596,
            "lon": 98.673,
            "title": "Arteri Medan Lancar",
            "ts": sample_now.isoformat(),
        },
    ]

    with patch("agents.llm_gateway.LLMGateway.generate_content", side_effect=LLMGatewayUnavailable("API down")):
        records = await compute_hazard_consensus(signals=signals, now=sample_now)

        assert len(records) == 1
        rec = records[0]
        assert rec["tier"] in ("CONFIRMED", "WATCH")
        assert rec["llm_used"] is False
        assert "aturan deterministik" in rec["reason"]


# ---------------------------------------------------------------------------
# 6. Trip Hazard Intersections & API Endpoints
# ---------------------------------------------------------------------------

def test_trip_hazard_intersections_contract(sample_now):
    """trip_hazard_intersections evaluates route geometry against consensus records."""
    poly = {
        "type": "Polygon",
        "coordinates": [[[98.65, 3.55], [98.75, 3.55], [98.75, 3.65], [98.65, 3.65], [98.65, 3.55]]],
    }
    mock_consensus = [
        {
            "id": "cons-flood-medan-1",
            "type": "flood",
            "tier": "CONFIRMED",
            "severity": "high",
            "geometry": poly,
            "geometry_role": "buffer_footprint",
            "reason": "Banjir luapan sungai Deli di Kota Medan.",
        }
    ]

    # Crossing route
    crossing_line = [[98.60, 3.60], [98.80, 3.60]]
    res = trip_hazard_intersections(crossing_line, consensus_records=mock_consensus)

    assert res["intersects_hazard"] is True
    assert res["total_hazards"] == 1
    assert res["risk_level"] == "high"
    assert res["estimated_extra_delay_minutes"] == 45
    assert len(res["hazards"]) == 1
    h0 = res["hazards"][0]
    assert h0["hazard_id"] == "cons-flood-medan-1"
    assert h0["tier"] == "CONFIRMED"
    assert h0["affected_segment_indices"] == [0]

    # Non-crossing route
    clear_line = [[98.0, 3.0], [98.1, 3.0]]
    clear_res = trip_hazard_intersections(clear_line, consensus_records=mock_consensus)
    assert clear_res["intersects_hazard"] is False
    assert clear_res["total_hazards"] == 0
    assert clear_res["estimated_extra_delay_minutes"] == 0


@pytest.mark.asyncio
async def test_api_hazards_consensus_and_check_route_endpoints():
    """Verifies FastAPI routing endpoints for /api/v1/hazards/consensus and /check-route."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # 1. GET /api/v1/hazards/consensus
    resp = client.get("/api/v1/hazards/consensus")
    assert resp.status_code == 200
    data = resp.json()
    assert "records" in data
    assert "generated_at" in data
    assert "total" in data

    # 2. POST /api/v1/hazards/check-route
    payload = {
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.60, 3.58], [98.70, 3.62]],
        }
    }
    resp_check = client.post("/api/v1/hazards/check-route", json=payload)
    assert resp_check.status_code == 200
    check_data = resp_check.json()
    assert "intersects_hazard" in check_data
    assert "total_hazards" in check_data
    assert "hazards" in check_data
    assert "risk_level" in check_data
    assert "estimated_extra_delay_minutes" in check_data


# ---------------------------------------------------------------------------
# 7. SPEC #6 / #2-backend regressions: CAP province advisory + display titles
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bmkg_cap_province_with_geometry_becomes_advisory_area(sample_now):
    """SPEC #6: a bmkg_cap signal naming a province routes to the advisory path
    even when it carries affected_area geometry, emitting the real province
    polygon (geometry_role='advisory_area') instead of a nowcast footprint."""
    cap_polygon = {
        "type": "Polygon",
        "coordinates": [[[102.0, -3.2], [102.6, -3.2], [102.6, -2.8], [102.0, -2.8], [102.0, -3.2]]],
    }
    signals = [
        {
            "id": "cap-1",
            "source": "bmkg_cap",
            "event": "weather_warning",
            "hazard_type": "weather_warning",
            "province": "Sumatera Selatan",
            "title": "Waspada Hujan Deras Sumsel",
            "effective": "2026-11-11T10:00:00+00:00",
            "expires": "2026-11-11T16:00:00+00:00",
            "geometry_role": "forecast_warning_area",
            "affected_area": cap_polygon,
        }
    ]

    records = await compute_hazard_consensus(signals=signals, now=sample_now)
    assert len(records) == 1
    rec = records[0]
    assert rec["tier"] == "ADVISORY"
    assert rec["geometry_role"] == "advisory_area"
    assert rec["geometry"] is not None
    assert rec["geometry"]["type"] in ("Polygon", "MultiPolygon")
    assert rec["title"] == "Cuaca · Sumatera Selatan"
    assert "Waspada Hujan Deras Sumsel" in (rec.get("raw_title") or "")


def test_display_title_sanitizes_machine_patterns():
    """SPEC #2-backend: short Indonesian titles; machine patterns stripped."""
    from app.services.hazard_consensus_service import _display_title

    assert _display_title("flood", "Medan") == "Banjir · Medan"
    assert _display_title("landslide", "Sitinjau Lauik") == "Longsor · Sitinjau Lauik"
    assert _display_title("fire", "") == "Kebakaran · Sumatera"
    # Quake: magnitude + nearest place extracted from the BMKG wilayah sentence.
    assert _display_title(
        "earthquake",
        "",
        raw_title="M4.9 Earthquake - Pusat gempa berada di darat 15 km barat daya Padang Panjang, Sumbar",
        magnitude=4.9,
    ) == "Gempa M4.9 · Padang Panjang"
    # Machine patterns stripped from title-derived areas.
    assert _display_title("weather", "", raw_title="Weather Alert (rain)") == "Cuaca · Sumatera"
    assert _display_title("flood", "", raw_title="Flood Corridor Alert - Tebing Tinggi") == "Banjir · Tebing Tinggi"
    assert _display_title("flood", "Medan", raw_title="Flood (CRITICAL - 8km Radius)") == "Banjir · Medan"
    assert _display_title("traffic", "JL. Jalinsum KM 50") == "Kemacetan · JL. Jalinsum"
    # Simulation prefix + raw title never mutated.
    assert _display_title("flood", "Medan", raw_title="[Simulasi] Flood Belawan", source="simulation") == "Simulasi: Banjir · Medan"


@pytest.mark.asyncio
async def test_advisory_without_boundary_keeps_honest_point_fallback(sample_now):
    """SPEC #6: no official boundary -> point at the signal's own location with
    an honest note; never an invented administrative shape."""
    signals = [
        {
            "source": "bmkg_cap",
            "event": "weather_warning",
            "province": "Sumatera Selatan",
            "lat": -2.9,
            "lon": 104.7,
            "title": "Waspada Hujan Deras Sumsel",
            "ts": sample_now.isoformat(),
        }
    ]

    with patch(
        "app.services.hazard_consensus_service.get_advisory_boundary_for_area",
        return_value=None,
    ):
        records = await compute_hazard_consensus(signals=signals, now=sample_now)

    assert len(records) == 1
    rec = records[0]
    assert rec["tier"] == "ADVISORY"
    assert rec["geometry_role"] == "buffer_footprint"
    assert rec["center"] == {"lat": -2.9, "lon": 104.7}
    assert "titik indikatif" in rec["reason"]
    assert "belum tersedia" in rec["reason"]
