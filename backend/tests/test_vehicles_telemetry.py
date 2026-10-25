"""
Test suite for PreHub Multi-Modal Transponder Telemetry.
Validates Pydantic v2 schemas, modality filtering, cold-chain threshold safety, and resilient offline fallback.
"""
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from app.main import app
from app.schemas.fleet import (
    VehicleModality,
    VehicleStatus,
    SignalStatus,
    ColdChainStatus,
    RouteGeometry,
    FleetVehicleTelemetry,
    FleetTelemetryListResponse,
)

client = TestClient(app)


def test_fleet_telemetry_schema():
    """Validates that maritime, air, and truck payloads conform to FleetVehicleTelemetry and invalid payloads fail."""
    # 1. Valid Maritime Asset
    maritime_payload = {
        "vehicle_id": "MV-001-SRIWIJAYA",
        "name": "KM Sriwijaya Express",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [99.1500, 3.6500]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6776, 3.7922], [99.1500, 3.6500]]},
        "speed_kmh": 22.5,
        "status": "moving",
        "progress": 0.42,
        "cargo": "1.800 Ton Beras BULOG",
        "origin": "Pelabuhan Belawan",
        "destination": "Pelabuhan Dumai",
        "heading_deg": 135.0,
        "mmsi": "525000101",
        "imo": "IMO9123401",
        "sog_knots": 12.1,
        "cog_deg": 134.8,
        "draught_m": 7.2,
        "nav_status": "Under way using engine",
        "signal_status": "LIVE_STREAM",
        "telemetry_source": "AISSTREAM_WS",
        "last_ping_seconds_ago": 1.5,
    }
    maritime_obj = FleetVehicleTelemetry(**maritime_payload)
    assert maritime_obj.modality == VehicleModality.MARITIME
    assert maritime_obj.mmsi == "525000101"
    assert maritime_obj.sog_knots == 12.1
    assert maritime_obj.signal_status == SignalStatus.LIVE_STREAM

    # 2. Valid Aviation Asset
    air_payload = {
        "vehicle_id": "AIR-001-KNO-CGK",
        "name": "Garuda Cargo GA-7101",
        "modality": "air",
        "path": [[98.8780, 3.6421], [101.5000, 0.5000]],
        "speed_kmh": 620.0,
        "status": "moving",
        "progress": 0.35,
        "cargo": "8.5 Ton Daging Beku & Vaksin",
        "origin": "Bandara Kualanamu (KNO)",
        "destination": "Soekarno-Hatta (CGK)",
        "heading_deg": 140.0,
        "icao24": "8A01A1",
        "callsign": "GIA7101",
        "altitude_ft": 32000.0,
        "ground_speed_kts": 334.8,
        "temperature_c": -18.5,
        "cold_chain_status": "NORMAL",
        "signal_status": "CACHE_FALLBACK",
        "telemetry_source": "OPENSKY_NETWORK",
        "last_ping_seconds_ago": 2.0,
    }
    air_obj = FleetVehicleTelemetry(**air_payload)
    assert air_obj.modality == VehicleModality.AIR
    assert air_obj.icao24 == "8A01A1"
    assert air_obj.altitude_ft == 32000.0
    assert air_obj.cold_chain_status == ColdChainStatus.NORMAL

    # 3. Valid Truck Asset with Cold-Chain Excursion
    truck_payload = {
        "vehicle_id": "TRK-002-HORTI-SUMBAR",
        "name": "Truk Hortikultura 02",
        "modality": "truck",
        "path": [[100.3692, -0.3056], [100.6300, -0.2200]],
        "speed_kmh": 62.0,
        "status": "moving",
        "progress": 0.38,
        "cargo": "14 Ton Cabai Merah & Sayur Agam",
        "origin": "Bukittinggi",
        "destination": "Pekanbaru",
        "heading_deg": 75.0,
        "vin": "MHF12TRK002BKT",
        "temperature_c": 5.4,
        "cold_chain_status": "WARNING_EXCURSION",
        "signal_status": "SIMULATION_CACHE",
        "telemetry_source": "CORRIDOR_GPS",
        "last_ping_seconds_ago": 0.8,
    }
    truck_obj = FleetVehicleTelemetry(**truck_payload)
    assert truck_obj.modality == VehicleModality.TRUCK
    assert truck_obj.vin == "MHF12TRK002BKT"
    assert truck_obj.temperature_c == 5.4
    assert truck_obj.cold_chain_status == ColdChainStatus.WARNING_EXCURSION

    # 4. List response wrapper
    list_response = FleetTelemetryListResponse(
        status="success",
        total_vehicles=3,
        modality_counts={"all": 3, "truck": 1, "maritime": 1, "air": 1},
        updated_at="2026-09-24T10:00:00Z",
        vehicles=[maritime_obj, air_obj, truck_obj]
    )
    assert list_response.total_vehicles == 3
    assert len(list_response.vehicles) == 3

    # 5. Invalid Payloads (Out of bounds coordinates, negative speed)
    with pytest.raises(ValidationError):
        FleetVehicleTelemetry(
            vehicle_id="INV-001",
            name="Invalid Speed",
            modality="truck",
            path=[[100.0, 0.0], [101.0, 0.0]],
            speed_kmh=-10.0,  # Invalid: ge=0.0
            status="moving"
        )

    with pytest.raises(ValidationError):
        FleetVehicleTelemetry(
            vehicle_id="INV-002",
            name="Invalid Longitude",
            modality="truck",
            path=[[250.0, 0.0], [101.0, 0.0]],  # Invalid lon > 180
            speed_kmh=50.0,
            status="moving"
        )


def test_fleet_modality_filters():
    """Tests FastAPI router /api/v1/fleet/vehicles with modality and status query parameters."""
    # All vehicles
    res_all = client.get("/api/v1/fleet/vehicles")
    assert res_all.status_code == 200
    data_all = res_all.json()
    assert data_all["status"] == "success"
    assert data_all["total_vehicles"] >= 120
    assert data_all["modality_counts"]["all"] >= 120
    assert data_all["modality_counts"]["truck"] >= 20
    assert data_all["modality_counts"]["maritime"] >= 88
    assert data_all["modality_counts"]["air"] >= 40

    # Filter Truck
    res_truck = client.get("/api/v1/fleet/vehicles?modality=truck")
    assert res_truck.status_code == 200
    data_truck = res_truck.json()
    assert data_truck["total_vehicles"] >= 20
    assert all(v["modality"] == "truck" for v in data_truck["vehicles"])

    # Filter Maritime
    res_maritime = client.get("/api/v1/fleet/vehicles?modality=maritime")
    assert res_maritime.status_code == 200
    data_maritime = res_maritime.json()
    assert data_maritime["total_vehicles"] >= 88
    assert all(v["modality"] == "maritime" for v in data_maritime["vehicles"])
    for v in data_maritime["vehicles"]:
        assert "current_coords" in v and len(v["current_coords"]) == 2
        assert "location" in v and v["location"]["type"] == "Point"
        assert "current_location" in v and v["current_location"]["type"] == "Point"
        if len(v.get("path", [])) == 3:
            assert v["progress"] == 0.5
            assert v["current_coords"] == v["path"][1]

    # Filter Air
    res_air = client.get("/api/v1/fleet/vehicles?modality=air")
    assert res_air.status_code == 200
    data_air = res_air.json()
    assert data_air["total_vehicles"] >= 40
    assert all(v["modality"] == "air" for v in data_air["vehicles"])
    for v in data_air["vehicles"]:
        assert "current_coords" in v and len(v["current_coords"]) == 2
        assert "location" in v and v["location"]["type"] == "Point"
        assert "current_location" in v and v["current_location"]["type"] == "Point"
        if len(v.get("path", [])) == 3:
            assert v["progress"] == 0.5
            assert v["current_coords"] == v["path"][1]


def test_cold_chain_threshold_evaluation():
    """Asserts that perishable units evaluate dynamically: <= 4.0°C as NORMAL and > 4.0°C as WARNING_EXCURSION."""
    from app.services.telemetry_service import TelemetryService, evaluate_cold_chain_status

    # Direct unit tests on evaluation helper
    assert evaluate_cold_chain_status(3.5) == ColdChainStatus.NORMAL
    assert evaluate_cold_chain_status(4.0) == ColdChainStatus.NORMAL
    assert evaluate_cold_chain_status(4.1) == ColdChainStatus.WARNING_EXCURSION
    assert evaluate_cold_chain_status(8.5) == ColdChainStatus.WARNING_EXCURSION
    assert evaluate_cold_chain_status(None) is None

    # Service enrichment verification
    service = TelemetryService()
    fleet = service.get_unified_fleet()
    
    # Verify cold chain tagged units
    perishable_trucks = [v for v in fleet if v.get("temperature_c") is not None]
    assert len(perishable_trucks) > 0

    for unit in perishable_trucks:
        temp = unit["temperature_c"]
        status = unit["cold_chain_status"]
        if temp <= 4.0:
            assert status == ColdChainStatus.NORMAL or status == "NORMAL"
        else:
            assert status == ColdChainStatus.WARNING_EXCURSION or status == "WARNING_EXCURSION"


def test_offline_telemetry_fallback():
    """Mocks external network failure or empty Redis stream, asserting resilient baseline delivery with HTTP 200."""
    from app.services.telemetry_service import TelemetryService

    service = TelemetryService()

    # Simulate network exception during OpenSky fetch and empty Redis stream
    with patch("app.services.telemetry_service.get_redis") as mock_redis:
        mock_redis.side_effect = Exception("Redis connection refused")
        fleet = service.get_unified_fleet()

        assert len(fleet) >= 120
        assert all(v.get("signal_status") for v in fleet)
        
        # Verify transponder fields exist in fallback units
        maritime_units = [v for v in fleet if v["modality"] == "maritime"]
        assert len(maritime_units) >= 88
        assert all("mmsi" in v and v["mmsi"] for v in maritime_units)

        air_units = [v for v in fleet if v["modality"] == "air"]
        assert len(air_units) >= 40
        assert all("icao24" in v and v["icao24"] for v in air_units)

        truck_units = [v for v in fleet if v["modality"] == "truck"]
        assert len(truck_units) >= 20
        assert all("vin" in v and v["vin"] for v in truck_units)


def test_fleet_tenancy_filter_by_query():
    """Verify that ?company_id= filters trucks strictly to that tenant while preserving macro maritime & air assets."""
    res_pos = client.get("/api/v1/fleet/vehicles?company_id=pos_logistik")
    assert res_pos.status_code == 200
    data_pos = res_pos.json()
    assert data_pos["status"] == "success"
    assert data_pos["total_vehicles"] > 0
    trucks_pos = [v for v in data_pos["vehicles"] if v["modality"] == "truck"]
    assert len(trucks_pos) > 0
    assert all(v["company_id"] == "pos_logistik" for v in trucks_pos)
    assert all(v.get("is_tenant_asset") is True for v in trucks_pos)

    res_pelindo = client.get("/api/v1/fleet/vehicles?company_id=pelindo_belawan")
    assert res_pelindo.status_code == 200
    data_pelindo = res_pelindo.json()
    assert data_pelindo["total_vehicles"] > 0
    trucks_pelindo = [v for v in data_pelindo["vehicles"] if v["modality"] == "truck"]
    assert len(trucks_pelindo) > 0
    assert all(v["company_id"] == "pelindo_belawan" for v in trucks_pelindo)


def test_fleet_tenancy_filter_by_dispatcher_jwt():
    """Verify that a DISPATCHER session automatically filters fleet by user.company_id and tags is_tenant_asset."""
    from app.auth.supabase_auth import create_guest_token, ROLE_DISPATCHER

    token = create_guest_token(role=ROLE_DISPATCHER, company_id="pos_logistik")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/fleet/vehicles", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_vehicles"] > 0
    trucks = [v for v in data["vehicles"] if v["modality"] == "truck"]
    assert len(trucks) > 0
    assert all(v["company_id"] == "pos_logistik" for v in trucks)
    assert all(v.get("is_tenant_asset") is True for v in trucks)


def test_fleet_regulator_sees_corridor_wide():
    """Verify that a REGULATOR session sees the full corridor-wide macro fleet (>= 120 units)."""
    from app.auth.supabase_auth import create_guest_token, ROLE_REGULATOR

    token = create_guest_token(role=ROLE_REGULATOR)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/fleet/vehicles", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_vehicles"] >= 120
    assert all(v.get("is_tenant_asset") is True for v in data["vehicles"])


def test_ais_vessel_continuity_and_overlay():
    """Phase 70 Wave 1: Verify that 10+ live AIS vessels overlay onto the 96 fallback vessels without discarding them."""
    from app.adapters.aisstream_adapter import get_aisstream_adapter, get_live_ais_vessels

    adapter = get_aisstream_adapter()
    # Inject 15 mock live vessels
    mock_live = {}
    for i in range(15):
        mmsi = 999000100 + i
        mock_live[mmsi] = {
            "mmsi": str(mmsi),
            "ship_name": f"Live Vessel {i}",
            "name": f"Live Vessel {i}",
            "lat": 3.79 + (i * 0.01),
            "lon": 98.68 + (i * 0.01),
            "sog": 12.5,
            "cog": 135.0,
            "heading": 135.0,
            "ship_type": "Cargo",
            "telemetry_source": "AISSTREAM_WS",
        }

    with patch.object(adapter, "vessels", mock_live):
        vessels = get_live_ais_vessels()
        # Must retain all baseline 96 vessels + newly added 15 mock vessels = 111
        assert len(vessels) >= 96 + 15
        for v in vessels:
            assert "current_coords" in v and len(v["current_coords"]) == 2
            assert round(v["current_coords"][0], 4) == round(float(v["lon"]), 4)
            assert round(v["current_coords"][1], 4) == round(float(v["lat"]), 4)


@pytest.mark.asyncio
async def test_intermodal_legs_and_coastal_maritime_routing():
    """Phase 70 Wave 1: Verify multi-modal legs [{truck}, {maritime}, {truck}] and non-Euclidean coastal maritime routing."""
    from app.adapters.cpu_routing_adapter import (
        calculate_sea_intermodal_corridor,
        generate_nautical_coastal_route,
        get_cpu_router,
    )
    from agents.nodes.route_optimization import route_optimization_agent

    # 1. Direct coastal maritime route generation
    # Belawan Port [98.6776, 3.7922] to Dumai Port [101.4533, 1.6811]
    sea_coords = generate_nautical_coastal_route([98.6776, 3.7922], [101.4533, 1.6811])
    assert len(sea_coords) >= 4, "Maritime route must follow nautical perimeter, not 2-point straight line"

    # 2. Intermodal Corridor 3-leg chain
    medan_coords = [98.6722, 3.5952]
    pekanbaru_coords = [101.4478, 0.5071]
    corridor = calculate_sea_intermodal_corridor(medan_coords, pekanbaru_coords)
    assert "legs" in corridor
    assert len(corridor["legs"]) == 3

    leg1, leg2, leg3 = corridor["legs"]
    assert leg1["modality"] == "truck"
    assert leg1["color"] == "#10B981"

    assert leg2["modality"] == "maritime"
    assert leg2["color"] == "#3B82F6"
    assert len(leg2["coordinates"]) >= 4, "Maritime leg must follow coastal perimeter without cutting across land"

    assert leg3["modality"] == "truck"
    assert leg3["color"] == "#10B981"

    # 3. CPURoutingAdapter solve_shortest_path with modality="intermodal"
    router = get_cpu_router()
    route_res = router.solve_shortest_path(
        origin_id="belawan_port",
        dest_id="dumai_port",
        origin_coords=medan_coords,
        dest_coords=pekanbaru_coords,
        modality="intermodal",
    )
    assert route_res["status"] == "success"
    top_route = route_res["routes"][0]
    assert "legs" in top_route
    assert len(top_route["legs"]) == 3
    assert top_route["legs"][1]["modality"] == "maritime"
    assert top_route["legs"][1]["color"] == "#3B82F6"

    # 4. RouteOptimizationAgent preserves/generates multi-modal legs
    agent_state = {
        "crisis_id": "CRISIS-TEST-001",
        "title": "Uji Rute Intermodal",
        "type": "flood",
        "is_simulated": True,
        "lat": 3.5952,
        "lon": 98.6722,
        "region": "north_sumatra",
        "status": "detecting",
        "overall_confidence": 0.8,
        "origin": "Medan",
        "destination": "Dumai",
        "origin_coords": medan_coords,
        "dest_coords": [101.4533, 1.6811],
        "modality": "intermodal",
    }
    agent_res = await route_optimization_agent(agent_state)
    assert len(agent_res["route_recommendations"]) >= 1
    rec = agent_res["route_recommendations"][0]
    assert "legs" in rec
    assert any(l["modality"] == "maritime" and l["color"] == "#3B82F6" for l in rec["legs"])


def test_fleet_modality_and_status_all_filters():
    """Verify that modality=all and status=all return full fleet instead of dropping to 0."""
    from app.routers.vehicles_router import clear_fleet_cache

    clear_fleet_cache()
    res_base = client.get("/api/v1/fleet/vehicles")
    assert res_base.status_code == 200
    base_count = res_base.json()["total_vehicles"]
    assert base_count > 0

    # modality=all must match baseline count
    res_all = client.get("/api/v1/fleet/vehicles?modality=all")
    assert res_all.status_code == 200
    assert res_all.json()["total_vehicles"] == base_count

    # status=all must match baseline count
    res_stat = client.get("/api/v1/fleet/vehicles?status=all")
    assert res_stat.status_code == 200
    assert res_stat.json()["total_vehicles"] == base_count

    # Warm cache test on stripped geometry
    res_warm = client.get("/api/v1/fleet/vehicles?include_geometry=false")
    assert res_warm.status_code == 200
    assert res_warm.json()["total_vehicles"] == base_count


def test_vehicle_geometry_caching_and_not_found():
    """Verify route geometry lookup succeeds on valid asset and 404s on nonexistent asset."""
    res_fleet = client.get("/api/v1/fleet/vehicles")
    assert res_fleet.status_code == 200
    vehicles = res_fleet.json()["vehicles"]
    assert len(vehicles) > 0
    valid_vid = vehicles[0]["vehicle_id"]

    res_geo = client.get(f"/api/v1/fleet/vehicles/{valid_vid}/geometry")
    assert res_geo.status_code == 200
    geo_data = res_geo.json()
    assert geo_data["status"] == "success"
    assert geo_data["vehicle_id"] == valid_vid
    assert "path" in geo_data

    # 404 test
    res_404 = client.get("/api/v1/fleet/vehicles/NON_EXISTENT_ID_999/geometry")
    assert res_404.status_code == 404


