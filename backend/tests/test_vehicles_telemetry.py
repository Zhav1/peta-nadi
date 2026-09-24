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
    assert data_all["total_vehicles"] == 45
    assert data_all["modality_counts"]["all"] == 45
    assert data_all["modality_counts"]["truck"] == 24
    assert data_all["modality_counts"]["maritime"] == 14
    assert data_all["modality_counts"]["air"] == 7

    # Filter Truck
    res_truck = client.get("/api/v1/fleet/vehicles?modality=truck")
    assert res_truck.status_code == 200
    data_truck = res_truck.json()
    assert data_truck["total_vehicles"] == 24
    assert all(v["modality"] == "truck" for v in data_truck["vehicles"])

    # Filter Maritime
    res_maritime = client.get("/api/v1/fleet/vehicles?modality=maritime")
    assert res_maritime.status_code == 200
    data_maritime = res_maritime.json()
    assert data_maritime["total_vehicles"] == 14
    assert all(v["modality"] == "maritime" for v in data_maritime["vehicles"])

    # Filter Air
    res_air = client.get("/api/v1/fleet/vehicles?modality=air")
    assert res_air.status_code == 200
    data_air = res_air.json()
    assert data_air["total_vehicles"] == 7
    assert all(v["modality"] == "air" for v in data_air["vehicles"])


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

        assert len(fleet) == 45
        assert all(v.get("signal_status") in [SignalStatus.CACHE_FALLBACK, SignalStatus.SIMULATION_CACHE, "CACHE_FALLBACK", "SIMULATION_CACHE"] for v in fleet)
        
        # Verify transponder fields exist in fallback units
        maritime_units = [v for v in fleet if v["modality"] == "maritime"]
        assert len(maritime_units) == 14
        assert all("mmsi" in v and v["mmsi"] for v in maritime_units)

        air_units = [v for v in fleet if v["modality"] == "air"]
        assert len(air_units) == 7
        assert all("icao24" in v and v["icao24"] for v in air_units)

        truck_units = [v for v in fleet if v["modality"] == "truck"]
        assert len(truck_units) == 24
        assert all("vin" in v and v["vin"] for v in truck_units)
