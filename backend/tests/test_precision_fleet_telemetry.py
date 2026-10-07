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
