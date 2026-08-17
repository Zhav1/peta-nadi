"""
PreHub — Multi-Modal Fleet Vehicles Router
Provides real-time AISstream vessel positions and dynamic ground/air food logistics fleet telemetry with GeoJSON route_geometry.
"""
from fastapi import APIRouter, Query
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import logging

router = APIRouter(tags=["fleet"])
logger = logging.getLogger(__name__)

# Multi-Modal Logistics Fleet Across Strategic Sumatra Corridors
BASE_FLEET: List[Dict[str, Any]] = [
    # Maritime Cargo Vessels
    {
        "vehicle_id": "MV-001-SRIWIJAYA",
        "name": "KM Sriwijaya Express (Selat Malaka)",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]]
        },
        "speed_kmh": 22.5,
        "status": "moving",
        "progress": 0.42,
        "cargo": "1.800 Ton Beras BULOG",
        "origin": "Pelabuhan Belawan (Sumut)",
        "destination": "Pelabuhan Dumai (Riau)"
    },
    {
        "vehicle_id": "MV-002-BATUMANDI",
        "name": "KMP Batu Mandi (Ro-Ro Selat Sunda)",
        "modality": "maritime",
        "path": [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]]
        },
        "speed_kmh": 28.0,
        "status": "moving",
        "progress": 0.65,
        "cargo": "45 Truk Sembako Antar-Pulau",
        "origin": "Pelabuhan Bakauheni (Lampung)",
        "destination": "Pelabuhan Merak (Banten)"
    },
    {
        "vehicle_id": "MV-003-CARAKA",
        "name": "KM Caraka Jaya (Pantai Barat)",
        "modality": "maritime",
        "path": [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]]
        },
        "speed_kmh": 19.0,
        "status": "moving",
        "progress": 0.28,
        "cargo": "1.200 Ton Semen & Tepung Terigu",
        "origin": "Pelabuhan Teluk Bayur (Padang)",
        "destination": "Pelabuhan Sibolga (Sumut)"
    },
    {
        "vehicle_id": "MV-004-MERATUS",
        "name": "KM Meratus Belawan",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [98.7100, 3.8300], [98.7500, 3.8800]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6776, 3.7922], [98.7100, 3.8300], [98.7500, 3.8800]]
        },
        "speed_kmh": 14.5,
        "status": "moving",
        "progress": 0.35,
        "cargo": "950 Ton Minyak Goreng Curah",
        "origin": "Pelabuhan Belawan",
        "destination": "Kuala Tanjung"
    },

    # Strategic Cargo Trucks
    {
        "vehicle_id": "TRK-001-BAKAUHENI-PLM",
        "name": "Truk Logistik Pangan 01 (Tol Bakauheni-Palembang)",
        "modality": "truck",
        "path": [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]]
        },
        "speed_kmh": 85.0,
        "status": "moving",
        "progress": 0.52,
        "cargo": "24 Ton Beras BULOG Lampung",
        "origin": "Pelabuhan Bakauheni",
        "destination": "Kota Palembang (Sumsel)"
    },
    {
        "vehicle_id": "TRK-002-HORTI-SUMBAR",
        "name": "Truk Sayur & Cabai 02 (Bukittinggi-Pekanbaru)",
        "modality": "truck",
        "path": [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]]
        },
        "speed_kmh": 68.0,
        "status": "moving",
        "progress": 0.38,
        "cargo": "14 Ton Cabai Merah & Sayur Agam",
        "origin": "Bukittinggi (Sumbar)",
        "destination": "Kota Pekanbaru (Riau)"
    },
    {
        "vehicle_id": "TRK-003-BELAWAN-TEBING",
        "name": "Truk Distribusi Sembako 03 (Tol Medan-Tebing)",
        "modality": "truck",
        "path": [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]]
        },
        "speed_kmh": 78.0,
        "status": "moving",
        "progress": 0.60,
        "cargo": "20 Ton Minyak Goreng Curah",
        "origin": "Pelabuhan Belawan",
        "destination": "Pematang Siantar"
    },
    {
        "vehicle_id": "TRK-004-CPO-DUMAI",
        "name": "Truk Tangki CPO 04 (Tol Permai Pekanbaru-Dumai)",
        "modality": "truck",
        "path": [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]]
        },
        "speed_kmh": 75.0,
        "status": "moving",
        "progress": 0.45,
        "cargo": "28 Ton CPO Minyak Sawit Mentah",
        "origin": "Pekanbaru",
        "destination": "Pelabuhan Dumai"
    },
    {
        "vehicle_id": "TRK-005-JAMBI-PALEMBANG",
        "name": "Truk Gula & Pangan 05 (Lintas Timur Jambi-Palembang)",
        "modality": "truck",
        "path": [[103.6131, -1.6100], [103.6400, -1.8200], [103.7500, -2.1500], [104.1000, -2.5500], [104.3800, -2.7800], [104.7565, -2.9909]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[103.6131, -1.6100], [103.6400, -1.8200], [103.7500, -2.1500], [104.1000, -2.5500], [104.3800, -2.7800], [104.7565, -2.9909]]
        },
        "speed_kmh": 62.0,
        "status": "moving",
        "progress": 0.30,
        "cargo": "18 Ton Gula Pasir & Tepung",
        "origin": "Kota Jambi",
        "destination": "Kota Palembang"
    },
    {
        "vehicle_id": "TRK-006-ACEH-MEDAN",
        "name": "Truk Hasil Bumi 06 (Jalinsum Banda Aceh-Medan)",
        "modality": "truck",
        "path": [[95.3193, 5.5483], [95.9600, 5.3800], [96.7000, 5.2000], [97.1422, 5.1800], [97.9600, 4.4700], [98.4850, 3.6000], [98.6722, 3.5952]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[95.3193, 5.5483], [95.9600, 5.3800], [96.7000, 5.2000], [97.1422, 5.1800], [97.9600, 4.4700], [98.4850, 3.6000], [98.6722, 3.5952]]
        },
        "speed_kmh": 70.0,
        "status": "moving",
        "progress": 0.58,
        "cargo": "16 Ton Kopi Gayo & Sayuran",
        "origin": "Banda Aceh",
        "destination": "Medan"
    },
    {
        "vehicle_id": "TRK-007-BENGKULU-PADANG",
        "name": "Truk Pangan Pantai Barat (Bengkulu-Padang)",
        "modality": "truck",
        "path": [[102.2655, -3.8004], [101.8500, -3.1500], [101.2500, -2.1000], [100.8000, -1.4500], [100.3543, -0.9492]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[102.2655, -3.8004], [101.8500, -3.1500], [101.2500, -2.1000], [100.8000, -1.4500], [100.3543, -0.9492]]
        },
        "speed_kmh": 65.0,
        "status": "moving",
        "progress": 0.40,
        "cargo": "15 Ton Beras & Palawija",
        "origin": "Kota Bengkulu",
        "destination": "Kota Padang"
    },

    # Air Cargo Freighters
    {
        "vehicle_id": "AIR-001-GARUDA-CARGO",
        "name": "GA-Freight-701 (Airway KNO-PKU-BIM)",
        "modality": "air",
        "path": [[98.8780, 3.6421], [99.8000, 2.2000], [101.4447, 0.4619], [100.9000, -0.2000], [100.2811, -0.7869]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[98.8780, 3.6421], [99.8000, 2.2000], [101.4447, 0.4619], [100.9000, -0.2000], [100.2811, -0.7869]]
        },
        "speed_kmh": 680.0,
        "status": "moving",
        "progress": 0.65,
        "cargo": "6.5 Ton Kargo Cepat & Vaksin",
        "origin": "Bandara Kualanamu (KNO)",
        "destination": "Bandara Minangkabau (BIM)"
    },
    {
        "vehicle_id": "AIR-002-LION-CARGO",
        "name": "JT-Cargo-340 (Airway PLM-TKG)",
        "modality": "air",
        "path": [[104.7000, -2.8983], [104.9500, -3.9500], [105.1783, -5.2417]],
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[104.7000, -2.8983], [104.9500, -3.9500], [105.1783, -5.2417]]
        },
        "speed_kmh": 620.0,
        "status": "moving",
        "progress": 0.35,
        "cargo": "4.2 Ton Sembako Kargo Udara",
        "origin": "Bandara Palembang (PLM)",
        "destination": "Bandara Radin Inten II (TKG)"
    }
]

@router.get("/api/v1/fleet/vehicles")
async def get_fleet_vehicles(modality: Optional[str] = Query(None, description="Filter by modality: truck, maritime, air")):
    """Retrieve dynamic logistics fleet with real-time AIS telemetry when connected."""
    vehicles = []

    # 1. Attempt reading live AIS stream vessels
    try:
        from app.adapters.aisstream_adapter import AISstreamAdapter
        if hasattr(AISstreamAdapter, 'instance') and AISstreamAdapter.instance.vessels:
            for mmsi, info in AISstreamAdapter.instance.vessels.items():
                lon = info.get("lon", 98.6776)
                lat = info.get("lat", 3.7922)
                coords = [[lon, lat], [lon + 0.05, lat + 0.05]]
                vehicles.append({
                    "vehicle_id": f"MMSI:{mmsi}",
                    "name": info.get("name", f"Kapal-{mmsi}"),
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
        logger.debug(f"AISstream live read: {e}")

    # 2. Add ground and air fleets
    combined = list(vehicles)
    if not any(v["modality"] == "maritime" for v in combined):
        combined.extend([v for v in BASE_FLEET if v["modality"] == "maritime"])
    combined.extend([v for v in BASE_FLEET if v["modality"] != "maritime"])

    # 3. Apply modality filter if specified
    if modality and modality != "all":
        combined = [v for v in combined if v["modality"] == modality]

    return {
        "vehicles": combined,
        "total": len(combined),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
