"""
PreHub — Test Suite for Self-Serve Fleet Onboarding & Live GPS Ingestion.
Tests single registration, bulk CSV manifest parsing, TMS GPS telematics webhooks,
SQLite local persistence, TelemetryService dynamic fusion, and RBAC authorization.
"""
import io
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.supabase_auth import (
    create_guest_token,
    ROLE_DISPATCHER,
    ROLE_REGULATOR,
    ROLE_GUEST,
)
from app.services.telemetry_service import telemetry_service
from app.db.local_storage import (
    init_db,
    list_custom_vehicles,
    delete_custom_vehicle,
    get_latest_telemetry_ping,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_teardown():
    """Ensure clean test environment before and after each test."""
    init_db()
    # Clean up any previously created test vehicles
    test_vids = [
        "TEST-TRK-01",
        "TEST-TRK-02",
        "TEST-TRK-03",
        "TEST-CSV-01",
        "TEST-CSV-02",
        "TEST-CSV-03",
        "TEST-DEL-01",
        "TEST-PING-01",
        "TEST-COLD-01",
        "BK-8821-XA",
    ]
    for vid in test_vids:
        delete_custom_vehicle(vid)
    yield
    for vid in test_vids:
        delete_custom_vehicle(vid)


def test_manifest_template_endpoint():
    """Verify standard manifest template headers, sample CSV, and supported hubs."""
    response = client.get("/api/v1/fleet/manifest/template")
    assert response.status_code == 200
    data = response.json()
    assert "headers" in data
    assert "vehicle_id" in data["headers"]
    assert "modality" in data["headers"]
    assert "sample_csv" in data
    assert "BK-8821-XA" in data["sample_csv"]
    assert "supported_hubs" in data
    assert len(data["supported_hubs"]) >= 15


def test_register_single_vehicle_success():
    """Test manual single vehicle registration with automatic hub path resolution."""
    dispatcher_token = create_guest_token(role=ROLE_DISPATCHER)
    headers = {"Authorization": f"Bearer {dispatcher_token}"}

    payload = {
        "vehicle_id": "TEST-TRK-01",
        "name": "Truk Cabai Karo Unit 1",
        "modality": "truck",
        "driver_name": "Budi Santoso",
        "driver_phone": "+6281234567890",
        "cargo": "10 Ton Cabai Merah",
        "origin": "Kabanjahe (Karo)",
        "destination": "Pasar Induk Lau Cih Medan",
        "speed_kmh": 50.0,
        "temperature_c": 3.2,
        "status": "moving"
    }

    response = client.post("/api/v1/fleet/register", json=payload, headers=headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["registered_count"] == 1
    assert res_data["vehicles"][0]["vehicle_id"] == "TEST-TRK-01"
    assert res_data["vehicles"][0]["path"] is not None
    assert len(res_data["vehicles"][0]["path"]) >= 2

    # Verify presence in database
    custom_units = list_custom_vehicles()
    found = [u for u in custom_units if u["vehicle_id"] == "TEST-TRK-01"]
    assert len(found) == 1
    assert found[0]["cargo"] == "10 Ton Cabai Merah"


def test_register_single_vehicle_regulator_forbidden():
    """Verify that Regulator role is rejected with HTTP 403 Forbidden."""
    regulator_token = create_guest_token(role=ROLE_REGULATOR)
    headers = {"Authorization": f"Bearer {regulator_token}"}

    payload = {
        "vehicle_id": "TEST-TRK-REG",
        "name": "Truk Ilegal",
        "modality": "truck"
    }

    response = client.post("/api/v1/fleet/register", json=payload, headers=headers)
    assert response.status_code == 403
    assert "Akses ditolak" in response.json()["detail"]["message"]


def test_bulk_manifest_upload_json():
    """Test uploading a batch manifest via JSON request."""
    token = create_guest_token(role=ROLE_DISPATCHER)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "manifest_name": "Manifest Ekspedisi Sembako Sumut",
        "vehicles": [
            {
                "vehicle_id": "TEST-TRK-02",
                "name": "Truk Beras Belawan 02",
                "modality": "truck",
                "cargo": "20 Ton Beras SPHP",
                "origin": "Pelabuhan Belawan",
                "destination": "Tebing Tinggi",
                "speed_kmh": 65.0
            },
            {
                "vehicle_id": "TEST-TRK-03",
                "name": "Truk Minyak Goreng Siantar 03",
                "modality": "truck",
                "cargo": "15 Ton Minyak Goreng",
                "origin": "Medan",
                "destination": "Pematang Siantar",
                "speed_kmh": 60.0
            }
        ]
    }

    response = client.post("/api/v1/fleet/upload-manifest", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["registered_count"] == 2


def test_bulk_manifest_upload_csv_file():
    """Test uploading a batch manifest via multipart CSV file."""
    token = create_guest_token(role=ROLE_GUEST)
    headers = {"Authorization": f"Bearer {token}"}

    csv_data = (
        "vehicle_id,name,modality,driver_name,driver_phone,cargo,origin,destination,speed_kmh,temperature_c\n"
        "TEST-CSV-01,Truk Bawang Aceh,truck,Joko,+62811111111,8 Ton Bawang Merah,Banda Aceh,Medan,62.0,\n"
        "TEST-CSV-02,Kapal Feri Ro-Ro,maritime,Kapten Agus,+62822222222,40 Truk Sembako,Pelabuhan Bakauheni,Pelabuhan Belawan,24.0,\n"
        "TEST-CSV-03,Kargo Udara KNO,air,Pilot Dedi,+62833333333,5 Ton Vaksin & Daging,Bandara Kualanamu (KNO),Soekarno-Hatta (CGK),580.0,-15.0\n"
    )

    file_bytes = io.BytesIO(csv_data.encode("utf-8"))
    files = {"file": ("manifest.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/fleet/upload-manifest/file", files=files, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["registered_count"] == 3

    # Check that air unit was registered with cold temp
    custom_units = list_custom_vehicles()
    air_unit = next((u for u in custom_units if u["vehicle_id"] == "TEST-CSV-03"), None)
    assert air_unit is not None
    assert air_unit["modality"] == "air"
    assert air_unit["temperature_c"] == -15.0


def test_tms_telemetry_webhook_ingestion():
    """Test standard TMS GPS webhook receiving live coordinates and logging to SQLite."""
    # First register vehicle
    telemetry_service.register_custom_vehicle({
        "vehicle_id": "TEST-PING-01",
        "name": "Truk GPS Realtime",
        "modality": "truck",
        "origin": "Medan",
        "destination": "Binjai",
    })

    # Send GPS Ping
    ping_payload = {
        "vehicle_id": "TEST-PING-01",
        "latitude": 3.6010,
        "longitude": 98.5820,
        "speed_kmh": 64.5,
        "heading_deg": 270.0,
        "altitude_m": 35.0,
        "temperature_c": 2.1,
        "battery_level": 98.0,
        "ignition": True
    }

    response = client.post("/api/v1/fleet/telemetry/ingest", json=ping_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "Telemetri GPS" in data["message"]

    # Verify latest ping in DB
    latest_ping = get_latest_telemetry_ping("TEST-PING-01")
    assert latest_ping is not None
    assert latest_ping["latitude"] == 3.6010
    assert latest_ping["longitude"] == 98.5820
    assert latest_ping["temperature_c"] == 2.1


def test_telemetry_service_dynamic_fusion():
    """Verify TelemetryService merges custom vehicles with baseline and applies live GPS pings."""
    telemetry_service.register_custom_vehicle({
        "vehicle_id": "TEST-PING-01",
        "name": "Truk GPS Realtime",
        "modality": "truck",
        "origin": "Medan",
        "destination": "Binjai",
    })

    telemetry_service.ingest_gps_ping({
        "vehicle_id": "TEST-PING-01",
        "latitude": 3.6010,
        "longitude": 98.5820,
        "speed_kmh": 72.0,
        "heading_deg": 285.0,
        "temperature_c": 3.8,
    })

    unified = telemetry_service.get_unified_fleet()
    custom_in_fleet = next((v for v in unified if v["vehicle_id"] == "TEST-PING-01"), None)
    assert custom_in_fleet is not None
    assert custom_in_fleet["signal_status"] == "LIVE_STREAM"
    assert custom_in_fleet["telemetry_source"] == "TMS_GPS_WEBHOOK"
    assert custom_in_fleet["speed_kmh"] == 72.0
    assert custom_in_fleet["heading_deg"] == 285.0
    assert custom_in_fleet["cold_chain_status"] == "NORMAL"
    assert len(unified) >= 46  # 45 baseline + 1 custom


def test_cold_chain_excursion_evaluation_on_custom_fleet():
    """Test that cold-chain temperature > 4.0°C triggers warning excursion."""
    telemetry_service.register_custom_vehicle({
        "vehicle_id": "TEST-COLD-01",
        "name": "Truk Cold Excursion",
        "modality": "truck",
        "origin": "Kabanjahe",
        "destination": "Medan",
        "temperature_c": 8.5,  # Excursion!
    })

    unified = telemetry_service.get_unified_fleet()
    unit = next((v for v in unified if v["vehicle_id"] == "TEST-COLD-01"), None)
    assert unit is not None
    assert unit["cold_chain_status"] == "WARNING_EXCURSION"


def test_custom_vehicle_listing_and_deletion():
    """Test retrieving custom fleet list and deleting a unit."""
    telemetry_service.register_custom_vehicle({
        "vehicle_id": "TEST-DEL-01",
        "name": "Truk Hapus",
        "modality": "truck",
    })

    # List custom
    res_list = client.get("/api/v1/fleet/custom")
    assert res_list.status_code == 200
    assert any(u["vehicle_id"] == "TEST-DEL-01" for u in res_list.json())

    # Delete with Regulator token -> should fail 403
    reg_token = create_guest_token(role=ROLE_REGULATOR)
    del_forbidden = client.delete("/api/v1/fleet/custom/TEST-DEL-01", headers={"Authorization": f"Bearer {reg_token}"})
    assert del_forbidden.status_code == 403

    # Delete with Dispatcher token -> should succeed 200
    disp_token = create_guest_token(role=ROLE_DISPATCHER)
    del_ok = client.delete("/api/v1/fleet/custom/TEST-DEL-01", headers={"Authorization": f"Bearer {disp_token}"})
    assert del_ok.status_code == 200
    assert del_ok.json()["status"] == "success"

    # Verify no longer exists
    assert not any(u["vehicle_id"] == "TEST-DEL-01" for u in client.get("/api/v1/fleet/custom").json())
