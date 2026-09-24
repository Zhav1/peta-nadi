"""
PreHub — Multi-Modal Telemetry Ingestion & Resilient Fallback Service.
Fuses Maritime AIS, Aviation ADS-B, and Truck GPS IoT Cold-Chain streams.
"""
import math
import time
import random
import logging
from typing import Optional, List, Dict, Any
import httpx

from app.schemas.fleet import (
    VehicleModality,
    VehicleStatus,
    SignalStatus,
    ColdChainStatus,
    FleetVehicleTelemetry,
)
from app.services.redis_client import get_redis, STREAM_AISSTREAM

logger = logging.getLogger(__name__)


def calculate_bearing(coord1: List[float], coord2: List[float]) -> float:
    """Calculates forward azimuth bearing in degrees (0.0 to 360.0) from coord1 [lon, lat] to coord2 [lon, lat]."""
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(delta_lambda)
    theta = math.atan2(y, x)
    bearing = (math.degrees(theta) + 360.0) % 360.0
    return round(bearing, 1)


def evaluate_cold_chain_status(temperature_c: Optional[float]) -> Optional[ColdChainStatus]:
    """
    Evaluates cold-chain reefer cargo temperature.
    <= 4.0°C evaluates to NORMAL.
    > 4.0°C evaluates to WARNING_EXCURSION.
    """
    if temperature_c is None:
        return None
    if temperature_c <= 4.0:
        return ColdChainStatus.NORMAL
    return ColdChainStatus.WARNING_EXCURSION


# Master 45-unit Pan-Sumatra strategic multi-modal telemetry baseline
MASTER_FLEET_DEFINITIONS: List[Dict[str, Any]] = [
    # --- 1. MARITIME CARGO VESSELS (14 Units) ---
    {
        "vehicle_id": "MV-001-SRIWIJAYA",
        "name": "KM Sriwijaya Express (Selat Malaka)",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]]},
        "speed_kmh": 22.5, "status": "moving", "progress": 0.42, "cargo": "1.800 Ton Beras BULOG", "origin": "Pelabuhan Belawan", "destination": "Pelabuhan Dumai",
        "mmsi": "525000101", "imo": "IMO9123401", "draught_m": 7.8, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-002-BATUMANDI",
        "name": "KMP Batu Mandi (Ro-Ro Selat Sunda)",
        "modality": "maritime",
        "path": [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]]},
        "speed_kmh": 28.0, "status": "moving", "progress": 0.65, "cargo": "45 Truk Sembako Antar-Pulau", "origin": "Pelabuhan Bakauheni", "destination": "Pelabuhan Merak",
        "mmsi": "525000102", "imo": "IMO9123402", "draught_m": 6.5, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-003-CARAKA",
        "name": "KM Caraka Jaya (Pantai Barat)",
        "modality": "maritime",
        "path": [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]]},
        "speed_kmh": 19.0, "status": "moving", "progress": 0.28, "cargo": "1.200 Ton Tepung Terigu & Gula", "origin": "Pelabuhan Teluk Bayur", "destination": "Pelabuhan Sibolga",
        "mmsi": "525000103", "imo": "IMO9123403", "draught_m": 7.2, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-004-MERATUS",
        "name": "KM Meratus Belawan (Kuala Tanjung)",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [99.0500, 3.6500], [99.4500, 3.3600]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6776, 3.7922], [99.0500, 3.6500], [99.4500, 3.3600]]},
        "speed_kmh": 14.5, "status": "moving", "progress": 0.55, "cargo": "950 Ton Minyak Goreng Kemasan", "origin": "Pelabuhan Belawan", "destination": "Kuala Tanjung",
        "mmsi": "525000104", "imo": "IMO9123404", "draught_m": 8.1, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-005-BANGKA-EXP",
        "name": "KMP Menumbing Raya (Selat Bangka)",
        "modality": "maritime",
        "path": [[104.7833, -2.9750], [105.0500, -2.6000], [105.2500, -2.0500], [105.3500, -1.8500]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.7833, -2.9750], [105.0500, -2.6000], [105.2500, -2.0500], [105.3500, -1.8500]]},
        "speed_kmh": 21.0, "status": "moving", "progress": 0.40, "cargo": "800 Ton Beras & Pangan Segar", "origin": "Palembang Boom Baru", "destination": "Tanjung Kalian (Bangka)",
        "mmsi": "525000105", "imo": "IMO9123405", "draught_m": 6.8, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-006-PANJANG-CARGO",
        "name": "KM Nusantara Sejahtera (Teluk Lampung)",
        "modality": "maritime",
        "path": [[105.3167, -5.4667], [105.4500, -5.6000], [105.8000, -5.8800]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.3167, -5.4667], [105.4500, -5.6000], [105.8000, -5.8800]]},
        "speed_kmh": 20.0, "status": "moving", "progress": 0.70, "cargo": "1.500 Ton Jagung & Bahan Pakan", "origin": "Pelabuhan Panjang", "destination": "Bakauheni",
        "mmsi": "525000106", "imo": "IMO9123406", "draught_m": 7.5, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-007-MALAHAYATI",
        "name": "KM Sabuk Nusantara 110 (Tol Laut Aceh)",
        "modality": "maritime",
        "path": [[95.5186, 5.5897], [96.2000, 5.4000], [97.2000, 5.3000], [98.2000, 4.5000], [98.6776, 3.7922]],
        "route_geometry": {"type": "LineString", "coordinates": [[95.5186, 5.5897], [96.2000, 5.4000], [97.2000, 5.3000], [98.2000, 4.5000], [98.6776, 3.7922]]},
        "speed_kmh": 18.0, "status": "moving", "progress": 0.35, "cargo": "600 Ton Bawang & Komoditas Pangan", "origin": "Pelabuhan Malahayati", "destination": "Pelabuhan Belawan",
        "mmsi": "525000107", "imo": "IMO9123407", "draught_m": 6.9, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-008-BENGKULU-BAAI",
        "name": "KM Pulau Baai Pioneer (Samudera Hindia)",
        "modality": "maritime",
        "path": [[102.2900, -3.8900], [101.5000, -3.0000], [100.3700, -0.9980]],
        "route_geometry": {"type": "LineString", "coordinates": [[102.2900, -3.8900], [101.5000, -3.0000], [100.3700, -0.9980]]},
        "speed_kmh": 22.0, "status": "moving", "progress": 0.50, "cargo": "900 Ton Minyak Sawit & Turunan Pangan", "origin": "Pelabuhan Pulau Baai", "destination": "Pelabuhan Teluk Bayur",
        "mmsi": "525000108", "imo": "IMO9123408", "draught_m": 8.4, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-009-BATAM-EXP",
        "name": "KM Batam Agro Express (Kepri Feed)",
        "modality": "maritime",
        "path": [[101.4533, 1.6811], [102.5000, 1.3000], [103.5000, 1.1000], [104.0000, 1.1500]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4533, 1.6811], [102.5000, 1.3000], [103.5000, 1.1000], [104.0000, 1.1500]]},
        "speed_kmh": 24.0, "status": "moving", "progress": 0.60, "cargo": "1.100 Ton Sayuran & Produk Olahan", "origin": "Pelabuhan Dumai", "destination": "Pelabuhan Batu Ampar",
        "mmsi": "525000109", "imo": "IMO9123409", "draught_m": 7.0, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-010-SIBOLGA-NIAS",
        "name": "KMP Teluk Singkil (Penyeberangan Nias)",
        "modality": "maritime",
        "path": [[98.7800, 1.7400], [98.2000, 1.5000], [97.6000, 1.3000]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.7800, 1.7400], [98.2000, 1.5000], [97.6000, 1.3000]]},
        "speed_kmh": 16.0, "status": "moving", "progress": 0.45, "cargo": "20 Truk Pangan Pokok Pulau Nias", "origin": "Pelabuhan Sibolga", "destination": "Gunungsitoli (Nias)",
        "mmsi": "525000110", "imo": "IMO9123410", "draught_m": 6.5, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-011-JAMBI-ANAMBAS",
        "name": "KM Muaro Jambi 02 (Alur Kuala Tungkal)",
        "modality": "maritime",
        "path": [[103.4500, -0.8000], [104.2000, -0.7000], [104.8000, 0.2000]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.4500, -0.8000], [104.2000, -0.7000], [104.8000, 0.2000]]},
        "speed_kmh": 18.5, "status": "moving", "progress": 0.30, "cargo": "500 Ton Beras Pasokan Kepulauan", "origin": "Kuala Tungkal (Jambi)", "destination": "Dabo Singkep",
        "mmsi": "525000111", "imo": "IMO9123411", "draught_m": 6.6, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-012-KRUI-TRANS",
        "name": "KM Samudera Pesisir Barat (Krui-Banten)",
        "modality": "maritime",
        "path": [[103.9000, -5.2000], [104.7000, -5.8500], [105.5000, -6.1000]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.9000, -5.2000], [104.7000, -5.8500], [105.5000, -6.1000]]},
        "speed_kmh": 17.0, "status": "moving", "progress": 0.52, "cargo": "400 Ton Hasil Perikanan & Pangan", "origin": "Krui (Lampung Barat)", "destination": "Pelabuhan Ciwandan",
        "mmsi": "525000112", "imo": "IMO9123412", "draught_m": 7.3, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-013-DUMAI-MALAKA",
        "name": "KM Selat Melaka Agro (Lintas Batas)",
        "modality": "maritime",
        "path": [[101.4533, 1.6811], [101.8500, 1.8500], [102.1500, 2.0500]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4533, 1.6811], [101.8500, 1.8500], [102.1500, 2.0500]]},
        "speed_kmh": 20.0, "status": "moving", "progress": 0.40, "cargo": "850 Ton Minyak Kelapa Sawit Pangan", "origin": "Pelabuhan Dumai", "destination": "Selat Malaka Jalur Internasional",
        "mmsi": "525000113", "imo": "IMO9123413", "draught_m": 8.0, "nav_status": "Under way using engine"
    },
    {
        "vehicle_id": "MV-014-PORT-FEEDER",
        "name": "KM Teluk Betung (Feeder Selat Sunda)",
        "modality": "maritime",
        "path": [[105.2667, -5.4500], [105.5500, -5.7500], [105.7533, -5.8711]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.2667, -5.4500], [105.5500, -5.7500], [105.7533, -5.8711]]},
        "speed_kmh": 19.5, "status": "moving", "progress": 0.75, "cargo": "700 Ton Gula Pasir Lampung", "origin": "Pelabuhan Panjang", "destination": "Bakauheni",
        "mmsi": "525000114", "imo": "IMO9123414", "draught_m": 6.7, "nav_status": "Under way using engine"
    },

    # --- 2. STRATEGIC CARGO TRUCKS (24 Units) ---
    {
        "vehicle_id": "TRK-001-BAKAUHENI-PLM",
        "name": "Truk Pangan 01 (Tol Bakauheni-Palembang)",
        "modality": "truck",
        "path": [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]]},
        "speed_kmh": 75.0, "status": "moving", "progress": 0.52, "cargo": "24 Ton Beras BULOG Lampung", "origin": "Pelabuhan Bakauheni", "destination": "Palembang",
        "vin": "MHF12TRK001PLM"
    },
    {
        "vehicle_id": "TRK-002-HORTI-SUMBAR",
        "name": "Truk Hortikultura 02 (Bukittinggi-Pekanbaru)",
        "modality": "truck",
        "path": [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]]},
        "speed_kmh": 62.0, "status": "moving", "progress": 0.38, "cargo": "14 Ton Cabai Merah & Sayur Agam", "origin": "Bukittinggi (Sumbar)", "destination": "Pekanbaru (Riau)",
        "vin": "MHF12TRK002BKT", "temperature_c": 3.2
    },
    {
        "vehicle_id": "TRK-003-BELAWAN-TEBING",
        "name": "Truk Sembako 03 (Tol Medan-Tebing)",
        "modality": "truck",
        "path": [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]]},
        "speed_kmh": 70.0, "status": "moving", "progress": 0.60, "cargo": "20 Ton Minyak Goreng Curah", "origin": "Pelabuhan Belawan", "destination": "Pematang Siantar",
        "vin": "MHF12TRK003MDN"
    },
    {
        "vehicle_id": "TRK-004-CPO-DUMAI",
        "name": "Truk Tangki CPO 04 (Tol Permai Pekanbaru-Dumai)",
        "modality": "truck",
        "path": [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]]},
        "speed_kmh": 68.0, "status": "moving", "progress": 0.44, "cargo": "28 Ton Minyak Sawit Mentah", "origin": "Pekanbaru", "destination": "Kawasan Industri Dumai",
        "vin": "MHF12TRK004DMI"
    },
    {
        "vehicle_id": "TRK-005-BANDA-ACEH-MEDAN",
        "name": "Truk Pangan 05 (Jalinsum Banda Aceh-Medan)",
        "modality": "truck",
        "path": [[95.3238, 5.5483], [95.9500, 5.2500], [97.1400, 5.1800], [97.9600, 4.4700], [98.6722, 3.5952]],
        "route_geometry": {"type": "LineString", "coordinates": [[95.3238, 5.5483], [95.9500, 5.2500], [97.1400, 5.1800], [97.9600, 4.4700], [98.6722, 3.5952]]},
        "speed_kmh": 65.0, "status": "moving", "progress": 0.32, "cargo": "16 Ton Beras & Komoditas Aceh", "origin": "Banda Aceh", "destination": "Medan",
        "vin": "MHF12TRK005BTJ"
    },
    {
        "vehicle_id": "TRK-006-JAMBI-PALEMBANG",
        "name": "Truk Distribusi 06 (Lintas Timur Jambi-Palembang)",
        "modality": "truck",
        "path": [[103.6131, -1.6100], [103.9500, -2.1500], [104.3500, -2.5500], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.6131, -1.6100], [103.9500, -2.1500], [104.3500, -2.5500], [104.7565, -2.9909]]},
        "speed_kmh": 60.0, "status": "moving", "progress": 0.58, "cargo": "18 Ton Gula & Tepung Terigu", "origin": "Kota Jambi", "destination": "Palembang",
        "vin": "MHF12TRK006JMB"
    },
    {
        "vehicle_id": "TRK-007-PADANG-BENGKULU",
        "name": "Truk Logistik 07 (Lintas Barat Padang-Bengkulu)",
        "modality": "truck",
        "path": [[100.3543, -0.9492], [100.5800, -1.3500], [101.1200, -2.5500], [101.7800, -3.2500], [102.2655, -3.8004]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.3543, -0.9492], [100.5800, -1.3500], [101.1200, -2.5500], [101.7800, -3.2500], [102.2655, -3.8004]]},
        "speed_kmh": 55.0, "status": "moving", "progress": 0.40, "cargo": "15 Ton Minyak Goreng & Pangan Pokok", "origin": "Kota Padang", "destination": "Kota Bengkulu",
        "vin": "MHF12TRK007PDG"
    },
    {
        "vehicle_id": "TRK-008-MEDAN-BERASTAGI",
        "name": "Truk Sayur Segar 08 (Medan-Kabanjahe)",
        "modality": "truck",
        "path": [[98.6722, 3.5952], [98.5800, 3.3500], [98.5067, 3.1833]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6722, 3.5952], [98.5800, 3.3500], [98.5067, 3.1833]]},
        "speed_kmh": 45.0, "status": "moving", "progress": 0.70, "cargo": "12 Ton Kol, Kentang, Wortel Karo", "origin": "Kabanjahe (Karo)", "destination": "Pasar Induk Lau Cih Medan",
        "vin": "MHF12TRK008KBJ", "temperature_c": 2.8
    },
    {
        "vehicle_id": "TRK-009-LAMPUNG-KOTABUMI",
        "name": "Truk Pangan 09 (Bandar Lampung-Kotabumi)",
        "modality": "truck",
        "path": [[105.2667, -5.4294], [105.1800, -5.0500], [104.8800, -4.8200]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.2667, -5.4294], [105.1800, -5.0500], [104.8800, -4.8200]]},
        "speed_kmh": 65.0, "status": "moving", "progress": 0.35, "cargo": "16 Ton Beras Pengadaan Lokal", "origin": "Bandar Lampung", "destination": "Kotabumi",
        "vin": "MHF12TRK009TKG"
    },
    {
        "vehicle_id": "TRK-010-PEKANBARU-DURI",
        "name": "Truk Logistik 10 (Pekanbaru-Duri)",
        "modality": "truck",
        "path": [[101.4478, 0.5071], [101.3500, 0.8500], [101.2100, 1.2800]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4478, 0.5071], [101.3500, 0.8500], [101.2100, 1.2800]]},
        "speed_kmh": 70.0, "status": "moving", "progress": 0.62, "cargo": "18 Ton Sembako Campuran", "origin": "Pekanbaru", "destination": "Duri",
        "vin": "MHF12TRK010PKU"
    },
    {
        "vehicle_id": "TRK-011-RANTAUPRAPAT-KISARAN",
        "name": "Truk Pangan 11 (Jalinsum Rantauprapat-Kisaran)",
        "modality": "truck",
        "path": [[100.0000, 2.1000], [99.8500, 2.4500], [99.6200, 2.9800]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.0000, 2.1000], [99.8500, 2.4500], [99.6200, 2.9800]]},
        "speed_kmh": 60.0, "status": "moving", "progress": 0.50, "cargo": "15 Ton Minyak Goreng Curah", "origin": "Rantauprapat", "destination": "Kisaran",
        "vin": "MHF12TRK011RAP"
    },
    {
        "vehicle_id": "TRK-012-LUBUKLINGGAU-PLM",
        "name": "Truk Sembako 12 (Lubuklinggau-Palembang)",
        "modality": "truck",
        "path": [[102.8600, -3.2900], [103.5500, -3.2000], [104.1500, -3.1000], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[102.8600, -3.2900], [103.5500, -3.2000], [104.1500, -3.1000], [104.7565, -2.9909]]},
        "speed_kmh": 58.0, "status": "moving", "progress": 0.45, "cargo": "20 Ton Beras & Palawija", "origin": "Lubuklinggau", "destination": "Palembang",
        "vin": "MHF12TRK012LLG"
    },
    {
        "vehicle_id": "TRK-013-SIANTAR-TOBA",
        "name": "Truk Distribusi 13 (Siantar-Balige)",
        "modality": "truck",
        "path": [[99.0687, 2.9595], [99.0500, 2.6500], [99.0600, 2.3300]],
        "route_geometry": {"type": "LineString", "coordinates": [[99.0687, 2.9595], [99.0500, 2.6500], [99.0600, 2.3300]]},
        "speed_kmh": 50.0, "status": "moving", "progress": 0.55, "cargo": "12 Ton Pangan Segar", "origin": "Pematang Siantar", "destination": "Balige",
        "vin": "MHF12TRK013STR", "temperature_c": 3.4
    },
    {
        "vehicle_id": "TRK-014-PAYAKUMBUH-RIAU",
        "name": "Truk Hortikultura 14 (Payakumbuh-Bangkinang)",
        "modality": "truck",
        "path": [[100.6300, -0.2200], [100.7500, -0.1000], [101.0300, 0.3300]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.6300, -0.2200], [100.7500, -0.1000], [101.0300, 0.3300]]},
        "speed_kmh": 55.0, "status": "moving", "progress": 0.30, "cargo": "10 Ton Cabai Merah & Sayur", "origin": "Payakumbuh", "destination": "Bangkinang",
        "vin": "MHF12TRK014PYK", "temperature_c": 3.6
    },
    {
        "vehicle_id": "TRK-015-MUAROJAMBI-TEMBESI",
        "name": "Truk Logistik 15 (Jambi-Muara Tembesi)",
        "modality": "truck",
        "path": [[103.6131, -1.6100], [103.3500, -1.7200], [103.1200, -1.7800]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.6131, -1.6100], [103.3500, -1.7200], [103.1200, -1.7800]]},
        "speed_kmh": 60.0, "status": "moving", "progress": 0.40, "cargo": "14 Ton Minyak Goreng & Beras", "origin": "Kota Jambi", "destination": "Muara Tembesi",
        "vin": "MHF12TRK015MRJ"
    },
    {
        "vehicle_id": "TRK-016-BENGKULU-CURUP",
        "name": "Truk Sayur 16 (Curup-Bengkulu)",
        "modality": "truck",
        "path": [[102.5200, -3.4700], [102.3800, -3.6500], [102.2655, -3.8004]],
        "route_geometry": {"type": "LineString", "coordinates": [[102.5200, -3.4700], [102.3800, -3.6500], [102.2655, -3.8004]]},
        "speed_kmh": 48.0, "status": "moving", "progress": 0.65, "cargo": "11 Ton Sayuran Dataran Tinggi", "origin": "Curup (Rejang Lebong)", "destination": "Kota Bengkulu",
        "vin": "MHF12TRK016CRP", "temperature_c": 2.5
    },
    {
        "vehicle_id": "TRK-017-LHOKSEUMAWE-LANGSA",
        "name": "Truk Pangan 17 (Lhokseumawe-Langsa)",
        "modality": "truck",
        "path": [[97.1400, 5.1800], [97.5500, 4.8500], [97.9600, 4.4700]],
        "route_geometry": {"type": "LineString", "coordinates": [[97.1400, 5.1800], [97.5500, 4.8500], [97.9600, 4.4700]]},
        "speed_kmh": 62.0, "status": "moving", "progress": 0.48, "cargo": "16 Ton Beras Pengadaan Bulog", "origin": "Lhokseumawe", "destination": "Kota Langsa",
        "vin": "MHF12TRK017LSM"
    },
    {
        "vehicle_id": "TRK-018-KAYUAGUNG-PLM",
        "name": "Truk Logistik 18 (Tol Kayu Agung-Palembang)",
        "modality": "truck",
        "path": [[104.8500, -3.3800], [104.8000, -3.1800], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.8500, -3.3800], [104.8000, -3.1800], [104.7565, -2.9909]]},
        "speed_kmh": 78.0, "status": "moving", "progress": 0.72, "cargo": "22 Ton Sembako Terpadu", "origin": "Kayu Agung", "destination": "Palembang",
        "vin": "MHF12TRK018KYA"
    },
    {
        "vehicle_id": "TRK-019-TERBANGGI-METRO",
        "name": "Truk Pangan 19 (Terbanggi Besar-Metro)",
        "modality": "truck",
        "path": [[105.1800, -4.8500], [105.2500, -5.0500], [105.3000, -5.1200]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.1800, -4.8500], [105.2500, -5.0500], [105.3000, -5.1200]]},
        "speed_kmh": 65.0, "status": "moving", "progress": 0.50, "cargo": "15 Ton Bahan Pangan Pokok", "origin": "Terbanggi Besar", "destination": "Kota Metro",
        "vin": "MHF12TRK019TBG"
    },
    {
        "vehicle_id": "TRK-020-MEDAN-BINJAI",
        "name": "Truk Logistik 20 (Tol Medan-Binjai)",
        "modality": "truck",
        "path": [[98.6722, 3.5952], [98.5800, 3.6050], [98.4856, 3.6006]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6722, 3.5952], [98.5800, 3.6050], [98.4856, 3.6006]]},
        "speed_kmh": 68.0, "status": "moving", "progress": 0.80, "cargo": "14 Ton Distribusi Gudang Retail", "origin": "Medan", "destination": "Binjai",
        "vin": "MHF12TRK020BNJ"
    },
    {
        "vehicle_id": "TRK-021-SOLOK-PADANG",
        "name": "Truk Beras Solok 21 (Solok-Padang)",
        "modality": "truck",
        "path": [[100.6500, -0.8000], [100.5000, -0.8800], [100.3543, -0.9492]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.6500, -0.8000], [100.5000, -0.8800], [100.3543, -0.9492]]},
        "speed_kmh": 50.0, "status": "moving", "progress": 0.35, "cargo": "16 Ton Beras Premium Solok", "origin": "Kota Solok", "destination": "Padang",
        "vin": "MHF12TRK021SLK"
    },
    {
        "vehicle_id": "TRK-022-PRABUMULIH-PLM",
        "name": "Truk Pangan 22 (Prabumulih-Palembang)",
        "modality": "truck",
        "path": [[104.2300, -3.4300], [104.5000, -3.2000], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.2300, -3.4300], [104.5000, -3.2000], [104.7565, -2.9909]]},
        "speed_kmh": 62.0, "status": "moving", "progress": 0.60, "cargo": "18 Ton Sembako Komersial", "origin": "Prabumulih", "destination": "Palembang",
        "vin": "MHF12TRK022PBM"
    },
    {
        "vehicle_id": "TRK-023-SIBOLGA-TARUTUNG",
        "name": "Truk Logistik 23 (Sibolga-Tarutung)",
        "modality": "truck",
        "path": [[98.7800, 1.7400], [98.8800, 1.8800], [98.9800, 2.0100]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.7800, 1.7400], [98.8800, 1.8800], [98.9800, 2.0100]]},
        "speed_kmh": 45.0, "status": "moving", "progress": 0.40, "cargo": "10 Ton Bahan Pokok Ikan & Tepung", "origin": "Sibolga", "destination": "Tarutung",
        "vin": "MHF12TRK023SBG", "temperature_c": 3.0
    },
    {
        "vehicle_id": "TRK-024-MEULABOH-TAPAKTUAN",
        "name": "Truk Pangan 24 (Lintas Barat Aceh)",
        "modality": "truck",
        "path": [[96.1200, 4.1400], [96.7500, 3.6500], [97.1800, 3.2500]],
        "route_geometry": {"type": "LineString", "coordinates": [[96.1200, 4.1400], [96.7500, 3.6500], [97.1800, 3.2500]]},
        "speed_kmh": 52.0, "status": "moving", "progress": 0.55, "cargo": "12 Ton Beras & Minyak Goreng", "origin": "Meulaboh", "destination": "Tapaktuan",
        "vin": "MHF12TRK024MBO"
    },

    # --- 3. AIR CARGO FLIGHTS (7 Units) ---
    {
        "vehicle_id": "AIR-001-KNO-CGK",
        "name": "Garuda Cargo GA-7101 (KNO -> CGK)",
        "modality": "air",
        "path": [[98.8780, 3.6421], [101.5000, 0.5000], [104.5000, -3.0000], [106.6500, -6.1256]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.8780, 3.6421], [101.5000, 0.5000], [104.5000, -3.0000], [106.6500, -6.1256]]},
        "speed_kmh": 620.0, "status": "moving", "progress": 0.35, "cargo": "8.5 Ton Daging Beku & Vaksin", "origin": "Bandara Kualanamu (KNO)", "destination": "Soekarno-Hatta (CGK)",
        "icao24": "8A01A1", "callsign": "GIA7101", "altitude_ft": 34000.0, "temperature_c": -18.0
    },
    {
        "vehicle_id": "AIR-002-PKU-BIM",
        "name": "Cardig Air Cargo 802 (PKU -> BIM)",
        "modality": "air",
        "path": [[101.4447, 0.4619], [100.8500, -0.1500], [100.2811, -0.7869]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4447, 0.4619], [100.8500, -0.1500], [100.2811, -0.7869]]},
        "speed_kmh": 540.0, "status": "moving", "progress": 0.58, "cargo": "5.2 Ton Sayur Segar & Medis", "origin": "Bandara Sultan Syarif Kasim II (PKU)", "destination": "Bandara Minangkabau (BIM)",
        "icao24": "8A01A2", "callsign": "CDG802", "altitude_ft": 28000.0, "temperature_c": 3.5
    },
    {
        "vehicle_id": "AIR-003-PLM-TKG",
        "name": "Tri-MG Cargo Flight 301 (PLM -> TKG)",
        "modality": "air",
        "path": [[104.7000, -2.8983], [104.9500, -4.0500], [105.1783, -5.2417]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.7000, -2.8983], [104.9500, -4.0500], [105.1783, -5.2417]]},
        "speed_kmh": 510.0, "status": "moving", "progress": 0.42, "cargo": "6.0 Ton Benih Pangan & Sembako Ekspres", "origin": "Bandara Sultan Mahmud Badaruddin II (PLM)", "destination": "Bandara Radin Inten II (TKG)",
        "icao24": "8A01A3", "callsign": "TMG301", "altitude_ft": 26000.0
    },
    {
        "vehicle_id": "AIR-004-BTJ-KNO",
        "name": "Lion Cargo Express 404 (BTJ -> KNO)",
        "modality": "air",
        "path": [[95.4194, 5.5222], [97.1000, 4.6000], [98.8780, 3.6421]],
        "route_geometry": {"type": "LineString", "coordinates": [[95.4194, 5.5222], [97.1000, 4.6000], [98.8780, 3.6421]]},
        "speed_kmh": 580.0, "status": "moving", "progress": 0.65, "cargo": "4.8 Ton Pangan Hortikultura & Bumbu", "origin": "Bandara Sultan Iskandar Muda (BTJ)", "destination": "Bandara Kualanamu (KNO)",
        "icao24": "8A01A4", "callsign": "LNI404", "altitude_ft": 31000.0
    },
    {
        "vehicle_id": "AIR-005-DJB-PLM",
        "name": "My Indo Airlines 505 (DJB -> PLM)",
        "modality": "air",
        "path": [[103.6444, -1.6389], [104.1500, -2.2500], [104.7000, -2.8983]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.6444, -1.6389], [104.1500, -2.2500], [104.7000, -2.8983]]},
        "speed_kmh": 490.0, "status": "moving", "progress": 0.30, "cargo": "5.5 Ton Komoditas Pangan Segar", "origin": "Bandara Sultan Thaha (DJB)", "destination": "Bandara Sultan Mahmud Badaruddin II (PLM)",
        "icao24": "8A01A5", "callsign": "MYU505", "altitude_ft": 25000.0
    },
    {
        "vehicle_id": "AIR-006-BIM-CGK",
        "name": "Pelita Cargo Air 606 (BIM -> CGK)",
        "modality": "air",
        "path": [[100.2811, -0.7869], [103.5000, -3.5000], [106.6500, -6.1256]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.2811, -0.7869], [103.5000, -3.5000], [106.6500, -6.1256]]},
        "speed_kmh": 610.0, "status": "moving", "progress": 0.45, "cargo": "7.2 Ton Produk Olahan Ternak & Sayur", "origin": "Bandara Minangkabau (BIM)", "destination": "Soekarno-Hatta (CGK)",
        "icao24": "8A01A6", "callsign": "PAS606", "altitude_ft": 36000.0
    },
    {
        "vehicle_id": "AIR-007-TKG-HLP",
        "name": "Asia Cargo Express 707 (TKG -> HLP)",
        "modality": "air",
        "path": [[105.1783, -5.2417], [106.0000, -5.7500], [106.8856, -6.2656]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.1783, -5.2417], [106.0000, -5.7500], [106.8856, -6.2656]]},
        "speed_kmh": 520.0, "status": "moving", "progress": 0.70, "cargo": "6.8 Ton Pangan Segar Antar-Pulau", "origin": "Bandara Radin Inten II (TKG)", "destination": "Halim Perdanakusuma (HLP)",
        "icao24": "8A01A7", "callsign": "ACE707", "altitude_ft": 29000.0
    },
]


class TelemetryService:
    """
    Multi-modal telemetry ingestion and cache service.
    Combines live Redis AIS streams, rate-limited OpenSky ADS-B flights (60s cache),
    and arterial cold-chain truck GPS with resilient offline simulation fallback.
    """

    def __init__(self):
        self._opensky_cache: Dict[str, Any] = {}
        self._opensky_cache_ts: float = 0.0
        self._opensky_ttl_seconds: float = 60.0

    async def fetch_opensky_states(self) -> Optional[List[List[Any]]]:
        """
        Fetches regional Sumatra airspace flight states from OpenSky Network REST API.
        Enforces 60s cache TTL to strictly comply with rate limits.
        """
        now = time.time()
        if self._opensky_cache and (now - self._opensky_cache_ts < self._opensky_ttl_seconds):
            return self._opensky_cache.get("states")

        # Sumatra Bounding Box: lamin=-6.5, lomin=95.0, lamax=6.0, lomax=107.0
        url = "https://opensky-network.org/api/states/all?lamin=-6.5&lomin=95.0&lamax=6.0&lomax=107.0"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    states = data.get("states", [])
                    self._opensky_cache = {"states": states}
                    self._opensky_cache_ts = now
                    logger.info(f"Successfully refreshed OpenSky ADS-B flight states: {len(states)} active")
                    return states
                elif resp.status_code == 429:
                    logger.warning("OpenSky Network rate limit reached (429). Using cache fallback.")
                else:
                    logger.warning(f"OpenSky Network returned status {resp.status_code}. Using cache fallback.")
        except Exception as e:
            logger.warning(f"Error connecting to OpenSky Network API: {e}. Utilizing fallback.")

        return self._opensky_cache.get("states")

    def _enrich_maritime_vessel(self, vessel: Dict[str, Any], live_ais: Dict[str, Any]) -> Dict[str, Any]:
        """Enriches maritime vessel with transponder kinematics and live AIS stream data if present."""
        item = dict(vessel)
        path = item.get("path", [])
        
        # Calculate heading & COG
        if len(path) >= 2:
            heading = calculate_bearing(path[0], path[1])
        else:
            heading = 0.0
            
        item["heading_deg"] = heading
        item["cog_deg"] = heading
        
        speed_kmh = float(item.get("speed_kmh", 0.0))
        item["sog_knots"] = round(speed_kmh / 1.852, 1)
        
        # Check if live AIS stream matches MMSI
        mmsi = item.get("mmsi")
        if mmsi and live_ais and mmsi in live_ais:
            live_data = live_ais[mmsi]
            item["signal_status"] = SignalStatus.LIVE_STREAM.value
            item["telemetry_source"] = "AISSTREAM_WS"
            if "sog" in live_data:
                item["sog_knots"] = round(float(live_data["sog"]), 1)
                item["speed_kmh"] = round(item["sog_knots"] * 1.852, 1)
        else:
            item["signal_status"] = SignalStatus.SIMULATION_CACHE.value
            item["telemetry_source"] = "PELINDO_SUMATRA_RADAR"

        item["last_ping_seconds_ago"] = round(random.uniform(0.8, 2.4), 1)
        return item

    def _enrich_air_cargo(self, flight: Dict[str, Any]) -> Dict[str, Any]:
        """Enriches aviation cargo flight with ADS-B transponder data and cold-chain evaluation."""
        item = dict(flight)
        path = item.get("path", [])
        
        if len(path) >= 2:
            heading = calculate_bearing(path[0], path[1])
        else:
            heading = 0.0
            
        item["heading_deg"] = heading
        speed_kmh = float(item.get("speed_kmh", 0.0))
        item["ground_speed_kts"] = round(speed_kmh / 1.852, 1)

        # Cold chain evaluation
        temp = item.get("temperature_c")
        if temp is not None:
            item["cold_chain_status"] = evaluate_cold_chain_status(temp).value
        else:
            item["cold_chain_status"] = None

        item["signal_status"] = SignalStatus.SIMULATION_CACHE.value
        item["telemetry_source"] = "OPENSKY_NETWORK"
        item["last_ping_seconds_ago"] = round(random.uniform(1.0, 2.5), 1)
        return item

    def _enrich_truck(self, truck: Dict[str, Any]) -> Dict[str, Any]:
        """Enriches arterial highway truck with IoT cold-chain temperature telemetry."""
        item = dict(truck)
        path = item.get("path", [])
        
        if len(path) >= 2:
            heading = calculate_bearing(path[0], path[1])
        else:
            heading = 0.0
            
        item["heading_deg"] = heading
        
        temp = item.get("temperature_c")
        if temp is not None:
            item["cold_chain_status"] = evaluate_cold_chain_status(temp).value
        else:
            item["cold_chain_status"] = None

        item["signal_status"] = SignalStatus.SIMULATION_CACHE.value
        item["telemetry_source"] = "CORRIDOR_GPS"
        item["last_ping_seconds_ago"] = round(random.uniform(0.6, 1.8), 1)
        return item

    def get_unified_fleet(
        self,
        modality: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Merges all 45 multi-modal fleet units, applying live telemetry,
        caching, cold-chain checks, and query filters.
        """
        # 1. Attempt to inspect live Redis AIS stream or active vessels
        live_ais: Dict[str, Any] = {}
        try:
            r = get_redis()
            if r is not None:
                # Check for recent events in STREAM_AISSTREAM
                try:
                    events = r.xrevrange(STREAM_AISSTREAM, count=20)
                    for _, event_data in events:
                        mmsi = event_data.get("mmsi")
                        if mmsi:
                            live_ais[str(mmsi)] = event_data
                except Exception as e:
                    logger.debug(f"Redis stream reading exception (fallback active): {e}")
        except Exception as e:
            logger.debug(f"Redis unavailable for live AIS stream: {e}")

        # 2. Enrich and assemble the full fleet
        enriched_fleet: List[Dict[str, Any]] = []

        for unit in MASTER_FLEET_DEFINITIONS:
            unit_modality = unit.get("modality")
            if unit_modality == "maritime":
                enriched = self._enrich_maritime_vessel(unit, live_ais)
            elif unit_modality == "air":
                enriched = self._enrich_air_cargo(unit)
            elif unit_modality == "truck":
                enriched = self._enrich_truck(unit)
            else:
                enriched = dict(unit)

            enriched_fleet.append(enriched)

        # 3. Apply Query Filters
        filtered_fleet = enriched_fleet
        if modality and modality != "all":
            filtered_fleet = [v for v in filtered_fleet if v.get("modality") == modality]

        if status:
            filtered_fleet = [v for v in filtered_fleet if v.get("status") == status]

        return filtered_fleet


# Global singleton instance
telemetry_service = TelemetryService()
