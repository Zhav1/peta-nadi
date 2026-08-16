"""
PreHub — Multi-Modal Fleet Vehicles Router
Provides real-time AISstream vessel positions and synthetic ground/air food logistics fleet telemetry with GeoJSON route_geometry.
"""
from fastapi import APIRouter
from datetime import datetime, timezone
import logging

router = APIRouter(tags=["fleet"])
logger = logging.getLogger(__name__)

# Synthetic Fallback Datasets (4 Maritime, 5 Trucks, 2 Air Cargo)
SYNTHETIC_FLEET = [
    # Ships
    {
        "vehicle_id": "MV-001-SRIWIJAYA",
        "name": "MV SRIWIJAYA CARGO",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [98.6900, 3.8100], [98.7200, 3.8500], [98.7800, 3.9000]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6776, 3.7922], [98.6900, 3.8100], [98.7200, 3.8500], [98.7800, 3.9000]]
        },
        "speed_kmh": 18.5,
        "status": "moving",
        "progress": 0.45,
        "cargo": "1.200 Ton Beras BULOG",
        "origin": "Pelabuhan Belawan",
        "destination": "Selat Malaka"
    },
    {
        "vehicle_id": "MV-002-MERATUS",
        "name": "KM MERATUS SORONG",
        "modality": "maritime",
        "path": [[98.7100, 3.8300], [98.6950, 3.8050], [98.6776, 3.7922]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.7100, 3.8300], [98.6950, 3.8050], [98.6776, 3.7922]]
        },
        "speed_kmh": 12.0,
        "status": "moving",
        "progress": 0.30,
        "cargo": "800 Ton Minyak Goreng",
        "origin": "Selat Malaka",
        "destination": "Pelabuhan Belawan"
    },
    {
        "vehicle_id": "MV-003-TANTO",
        "name": "MV TANTO PRATAMA",
        "modality": "maritime",
        "path": [[98.6720, 3.7980], [98.6720, 3.7980]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6720, 3.7980], [98.6720, 3.7980]]
        },
        "speed_kmh": 0.0,
        "status": "anchored",
        "progress": 0.0,
        "cargo": "600 Ton Gula Pasir",
        "origin": "Pelabuhan Belawan",
        "destination": "-"
    },
    {
        "vehicle_id": "MV-004-CARAKA",
        "name": "KM CARAKA JAYA III",
        "modality": "maritime",
        "path": [[98.6690, 3.7910], [98.6690, 3.7910]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6690, 3.7910], [98.6690, 3.7910]]
        },
        "speed_kmh": 0.0,
        "status": "anchored",
        "progress": 0.0,
        "cargo": "550 Ton Cabai",
        "origin": "Pelabuhan Belawan",
        "destination": "-"
    },
    # Trucks on Trans-Sumatra Highway
    {
        "vehicle_id": "TRK-001-RMS-A",
        "name": "Truk RMS-Belawan-01",
        "modality": "truck",
        "path": [
            [98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800],
            [98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520],
            [98.8750, 3.5600], [98.9560, 3.5680]
        ],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [
                [98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800],
                [98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520],
                [98.8750, 3.5600], [98.9560, 3.5680]
            ]
        },
        "speed_kmh": 80.0,
        "status": "moving",
        "progress": 0.55,
        "cargo": "20 Ton Minyak Goreng",
        "origin": "Pelabuhan Belawan",
        "destination": "Interchange Tebing Tinggi"
    },
    {
        "vehicle_id": "TRK-002-RMS-B",
        "name": "Truk RMS-Belawan-02",
        "modality": "truck",
        "path": [
            [98.6750, 3.7500], [98.6710, 3.6800], [98.6730, 3.6200],
            [98.7180, 3.5410], [98.8050, 3.5520], [98.8750, 3.5600],
            [98.9560, 3.5680], [99.0450, 3.4850]
        ],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [
                [98.6750, 3.7500], [98.6710, 3.6800], [98.6730, 3.6200],
                [98.7180, 3.5410], [98.8050, 3.5520], [98.8750, 3.5600],
                [98.9560, 3.5680], [99.0450, 3.4850]
            ]
        },
        "speed_kmh": 75.0,
        "status": "moving",
        "progress": 0.40,
        "cargo": "18 Ton Beras",
        "origin": "Pelabuhan Belawan",
        "destination": "Pematang Siantar"
    },
    {
        "vehicle_id": "TRK-003-KONS-A",
        "name": "Truk Konsorsium-03",
        "modality": "truck",
        "path": [[98.8050, 3.5520], [98.8750, 3.5600], [98.9560, 3.5680], [99.0450, 3.4850], [99.0687, 2.9595]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.8050, 3.5520], [98.8750, 3.5600], [98.9560, 3.5680], [99.0450, 3.4850], [99.0687, 2.9595]]
        },
        "speed_kmh": 70.0,
        "status": "moving",
        "progress": 0.65,
        "cargo": "15 Ton Gula",
        "origin": "Hub Utama Medan",
        "destination": "Pematang Siantar"
    },
    {
        "vehicle_id": "TRK-004-KONS-B",
        "name": "Truk Konsorsium-04",
        "modality": "truck",
        "path": [[98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520]]
        },
        "speed_kmh": 60.0,
        "status": "rerouting",
        "progress": 0.50,
        "cargo": "12 Ton Cabai",
        "origin": "Hub Binjai",
        "destination": "Hub Utama Medan"
    },
    {
        "vehicle_id": "TRK-005-RMS-C",
        "name": "Truk RMS-Belawan-05",
        "modality": "truck",
        "path": [[98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800]]
        },
        "speed_kmh": 55.0,
        "status": "moving",
        "progress": 0.20,
        "cargo": "22 Ton Beras BULOG",
        "origin": "Pelabuhan Belawan",
        "destination": "Gudang BULOG Medan"
    },
    # Aircraft (Cargo Flights)
    {
        "vehicle_id": "AIR-001-GARUDA",
        "name": "GA-KARGO-6201",
        "modality": "air",
        "path": [[98.8792, 3.6419], [98.9200, 3.6500], [99.0000, 3.6400], [99.0687, 3.6200], [99.1500, 3.5800]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.8792, 3.6419], [98.9200, 3.6500], [99.0000, 3.6400], [99.0687, 3.6200], [99.1500, 3.5800]]
        },
        "speed_kmh": 650.0,
        "status": "moving",
        "progress": 0.70,
        "cargo": "5 Ton Daging Sapi",
        "origin": "KNO Kualanamu",
        "destination": "Cargo Hub Siantar"
    },
    {
        "vehicle_id": "AIR-002-LIONAIR",
        "name": "JT-FREIGHT-142",
        "modality": "air",
        "path": [[99.0000, 3.7000], [98.9500, 3.6800], [98.9100, 3.6600], [98.8792, 3.6419]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[99.0000, 3.7000], [98.9500, 3.6800], [98.9100, 3.6600], [98.8792, 3.6419]]
        },
        "speed_kmh": 580.0,
        "status": "moving",
        "progress": 0.35,
        "cargo": "3 Ton Obat-obatan",
        "origin": "Cargo Hub Jakarta",
        "destination": "KNO Kualanamu"
    }
]

@router.get("/api/v1/fleet/vehicles")
async def get_fleet_vehicles():
    """Retrieve combined live AISstream vessels and synthetic logistics fleet with route_geometry."""
    vehicles = []

    try:
        from app.adapters.aisstream_adapter import AISstreamAdapter
        if hasattr(AISstreamAdapter, 'instance') and AISstreamAdapter.instance.vessels:
            for mmsi, info in AISstreamAdapter.instance.vessels.items():
                coords = [[info.get("lon", 98.6776), info.get("lat", 3.7922)], [98.6776, 3.7922]]
                vehicles.append({
                    "vehicle_id": f"MMSI:{mmsi}",
                    "name": info.get("name", f"VESSEL-{mmsi}"),
                    "modality": "maritime",
                    "path": coords,
                    "route_geometry": {
                        "type": "LineString",
                        "coordinates": coords
                    },
                    "speed_kmh": round(info.get("sog", 0.0) * 1.852, 1),
                    "status": "anchored" if info.get("sog", 0.0) < 0.5 else "moving",
                    "progress": 0.50,
                    "cargo": "Muatan Kontainer Kargo",
                    "origin": "Selat Malaka",
                    "destination": "Pelabuhan Belawan"
                })
    except Exception as e:
        logger.warning(f"AISstream adapter read error: {e}")

    if not vehicles:
        vehicles = list(SYNTHETIC_FLEET)
    else:
        vehicles.extend([v for v in SYNTHETIC_FLEET if v["modality"] != "maritime"])

    return {
        "vehicles": vehicles,
        "total": len(vehicles),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
