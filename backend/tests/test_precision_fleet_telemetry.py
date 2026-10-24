import json
import pytest
from pathlib import Path
from app.services.telemetry_service import TelemetryService

def test_fleet_corridors_snapped_file_exists():
    corridor_path = Path(__file__).resolve().parent.parent / "data" / "fleet_corridors_snapped.json"
    assert corridor_path.exists(), "fleet_corridors_snapped.json file must exist in backend/data/"
    
    with open(corridor_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    assert isinstance(data, dict)
    assert len(data) >= 40, f"Expected at least 40 fleet features, found {len(data)}"
    
    # Check that road coordinates have high resolution (>15 coordinates)
    sample_road = next((v for v in data.values() if v.get("modality") == "truck"), None)
    assert sample_road is not None
    coords = sample_road.get("coordinates", [])
    assert len(coords) >= 15, f"Road corridor should have high vertex density, found {len(coords)}"

def test_telemetry_service_precision_snapping():
    service = TelemetryService()
    vehicles = service.get_unified_fleet()
    
    assert len(vehicles) >= 40
    
    # Ensure trucks do not have identical fallback dummy coords
    trucks = [v for v in vehicles if v.get("modality") == "truck"]
    assert len(trucks) >= 20
    
    # Check that route geometries are multi-vertex snapped polylines
    for truck in trucks[:5]:
        route = truck.get("route_geometry", {}).get("coordinates", [])
        assert len(route) >= 10, f"Truck {truck.get('vehicle_id')} route should have >= 10 waypoints"
        # Verify coordinates are in valid Sumatra/Indonesia bounding box
        for lon, lat in route:
            assert 95.0 <= lon <= 107.0, f"Invalid longitude: {lon}"
            assert -7.0 <= lat <= 6.0, f"Invalid latitude: {lat}"

def test_telemetry_service_reroute_vehicle():
    service = TelemetryService()
    vehicles = service.get_unified_fleet()
    target_truck = next((v for v in vehicles if v.get("modality") == "truck"), None)
    assert target_truck is not None
    target_id = target_truck["vehicle_id"]
    
    mock_new_route = [
        [98.67, 3.59],
        [98.70, 3.55],
        [98.80, 3.45],
        [98.90, 3.35],
        [99.00, 3.25]
    ]
    
    res = service.reroute_vehicle(target_id, mock_new_route, new_eta_minutes=42)
    assert res is not None
    assert res["eta_minutes"] == 42
    assert res["route_geometry"]["coordinates"] == mock_new_route
    
    # Re-fetch active vehicles and verify the rerouted vehicle has updated trajectory
    updated_vehicles = service.get_unified_fleet()
    updated_target = next(v for v in updated_vehicles if v["vehicle_id"] == target_id)
    
    assert updated_target["status"] == "rerouting"
    assert updated_target["eta_minutes"] == 42
    assert updated_target["route_geometry"]["coordinates"] == mock_new_route


def test_lightweight_telemetry_payload_reduction():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)

    # 1. Fetch full geometry (include_geometry=true)
    res_full = client.get("/api/v1/fleet/vehicles?include_geometry=true")
    assert res_full.status_code == 200
    full_data = res_full.json()
    full_bytes = len(res_full.content)

    # 2. Fetch lightweight telemetry (include_geometry=false)
    res_lean = client.get("/api/v1/fleet/vehicles?include_geometry=false")
    assert res_lean.status_code == 200
    lean_data = res_lean.json()
    lean_bytes = len(res_lean.content)

    # Assert payload reduction > 90% and lean payload < 10% of full
    assert full_bytes > 500 * 1024, f"Full payload expected > 500 KB, got {full_bytes / 1024:.2f} KB"
    assert lean_bytes < 250 * 1024, f"Lean all-fleet payload must be < 250 KB, got {lean_bytes / 1024:.2f} KB"
    assert lean_bytes < full_bytes * 0.1, f"Lean payload should be < 10% of full, full={full_bytes}, lean={lean_bytes}"

    # Specific truck-only telemetry polling must be < 35 KB (< 30 KB objective)
    res_truck = client.get("/api/v1/fleet/vehicles?include_geometry=false&modality=truck")
    assert res_truck.status_code == 200
    truck_bytes = len(res_truck.content)
    assert truck_bytes < 35 * 1024, f"Truck lean payload must be < 35 KB, got {truck_bytes / 1024:.2f} KB"

    # Verify vehicle kinematics fields are preserved in lean response
    assert len(lean_data["vehicles"]) == len(full_data["vehicles"])
    for v in lean_data["vehicles"]:
        assert "vehicle_id" in v
        assert "current_coords" in v and len(v["current_coords"]) == 2
        assert "speed_kmh" in v
        assert "heading_deg" in v
        assert "progress" in v
        assert "status" in v
        # Bulky geometries must be stripped in lean mode
        assert v.get("path") == []
        assert v.get("route_geometry") is None


def test_vehicle_geometry_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)

    # Get a vehicle ID from list
    res_lean = client.get("/api/v1/fleet/vehicles?include_geometry=false")
    assert res_lean.status_code == 200
    first_vehicle = res_lean.json()["vehicles"][0]
    vid = first_vehicle["vehicle_id"]

    # Fetch geometry for this specific vehicle via /api/v1/fleet path
    res_geom = client.get(f"/api/v1/fleet/vehicles/{vid}/geometry")
    assert res_geom.status_code == 200
    geom_data = res_geom.json()
    assert geom_data["status"] == "success"
    assert geom_data["vehicle_id"] == vid
    assert "route_geometry" in geom_data
    assert "path" in geom_data

    # Fetch geometry via legacy /vehicles/{vid}/geometry alias path
    res_alias = client.get(f"/vehicles/{vid}/geometry")
    assert res_alias.status_code == 200
    assert res_alias.json()["vehicle_id"] == vid

    # Non-existent vehicle returns 404
    res_404 = client.get("/api/v1/fleet/vehicles/NON_EXISTENT_XYZ/geometry")
    assert res_404.status_code == 404

