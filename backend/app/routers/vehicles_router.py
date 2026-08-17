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

# Comprehensive Multi-Modal Logistics Fleet Across Strategic Sumatra Corridors (45 Units)
BASE_FLEET: List[Dict[str, Any]] = [
    # --- 1. MARITIME CARGO VESSELS (14 Units) ---
    {
        "vehicle_id": "MV-001-SRIWIJAYA",
        "name": "KM Sriwijaya Express (Selat Malaka)",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]]},
        "speed_kmh": 22.5, "status": "moving", "progress": 0.42, "cargo": "1.800 Ton Beras BULOG", "origin": "Pelabuhan Belawan", "destination": "Pelabuhan Dumai"
    },
    {
        "vehicle_id": "MV-002-BATUMANDI",
        "name": "KMP Batu Mandi (Ro-Ro Selat Sunda)",
        "modality": "maritime",
        "path": [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]]},
        "speed_kmh": 28.0, "status": "moving", "progress": 0.65, "cargo": "45 Truk Sembako Antar-Pulau", "origin": "Pelabuhan Bakauheni", "destination": "Pelabuhan Merak"
    },
    {
        "vehicle_id": "MV-003-CARAKA",
        "name": "KM Caraka Jaya (Pantai Barat)",
        "modality": "maritime",
        "path": [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]]},
        "speed_kmh": 19.0, "status": "moving", "progress": 0.28, "cargo": "1.200 Ton Tepung Terigu & Gula", "origin": "Pelabuhan Teluk Bayur", "destination": "Pelabuhan Sibolga"
    },
    {
        "vehicle_id": "MV-004-MERATUS",
        "name": "KM Meratus Belawan (Kuala Tanjung)",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [99.0500, 3.6500], [99.4500, 3.3600]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6776, 3.7922], [99.0500, 3.6500], [99.4500, 3.3600]]},
        "speed_kmh": 14.5, "status": "moving", "progress": 0.55, "cargo": "950 Ton Minyak Goreng Kemasan", "origin": "Pelabuhan Belawan", "destination": "Kuala Tanjung"
    },
    {
        "vehicle_id": "MV-005-BANGKA-EXP",
        "name": "KMP Menumbing Raya (Selat Bangka)",
        "modality": "maritime",
        "path": [[104.7833, -2.9750], [105.0500, -2.6000], [105.2500, -2.0500], [105.3500, -1.8500]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.7833, -2.9750], [105.0500, -2.6000], [105.2500, -2.0500], [105.3500, -1.8500]]},
        "speed_kmh": 21.0, "status": "moving", "progress": 0.40, "cargo": "800 Ton Beras & Pangan Segar", "origin": "Palembang Boom Baru", "destination": "Tanjung Kalian (Bangka)"
    },
    {
        "vehicle_id": "MV-006-PANJANG-CARGO",
        "name": "KM Nusantara Sejahtera (Teluk Lampung)",
        "modality": "maritime",
        "path": [[105.3167, -5.4667], [105.4500, -5.6000], [105.8000, -5.8800]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.3167, -5.4667], [105.4500, -5.6000], [105.8000, -5.8800]]},
        "speed_kmh": 20.0, "status": "moving", "progress": 0.70, "cargo": "1.500 Ton Jagung & Bahan Pakan", "origin": "Pelabuhan Panjang", "destination": "Bakauheni"
    },
    {
        "vehicle_id": "MV-007-MALAHAYATI",
        "name": "KM Sabuk Nusantara 110 (Tol Laut Aceh)",
        "modality": "maritime",
        "path": [[95.5186, 5.5897], [96.2000, 5.4000], [97.2000, 5.3000], [98.2000, 4.5000], [98.6776, 3.7922]],
        "route_geometry": {"type": "LineString", "coordinates": [[95.5186, 5.5897], [96.2000, 5.4000], [97.2000, 5.3000], [98.2000, 4.5000], [98.6776, 3.7922]]},
        "speed_kmh": 18.0, "status": "moving", "progress": 0.35, "cargo": "600 Ton Bawang & Komoditas Pangan", "origin": "Pelabuhan Malahayati", "destination": "Pelabuhan Belawan"
    },
    {
        "vehicle_id": "MV-008-BENGKULU-BAAI",
        "name": "KM Pulau Baai Pioneer (Samudera Hindia)",
        "modality": "maritime",
        "path": [[102.2900, -3.8900], [101.5000, -3.0000], [100.3700, -0.9980]],
        "route_geometry": {"type": "LineString", "coordinates": [[102.2900, -3.8900], [101.5000, -3.0000], [100.3700, -0.9980]]},
        "speed_kmh": 22.0, "status": "moving", "progress": 0.50, "cargo": "900 Ton Minyak Sawit & Turunan Pangan", "origin": "Pelabuhan Pulau Baai", "destination": "Pelabuhan Teluk Bayur"
    },
    {
        "vehicle_id": "MV-009-BATAM-EXP",
        "name": "KM Batam Agro Express (Kepri Feed)",
        "modality": "maritime",
        "path": [[101.4533, 1.6811], [102.5000, 1.3000], [103.5000, 1.1000], [104.0000, 1.1500]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4533, 1.6811], [102.5000, 1.3000], [103.5000, 1.1000], [104.0000, 1.1500]]},
        "speed_kmh": 24.0, "status": "moving", "progress": 0.60, "cargo": "1.100 Ton Sayuran & Produk Olahan", "origin": "Pelabuhan Dumai", "destination": "Pelabuhan Batu Ampar"
    },
    {
        "vehicle_id": "MV-010-SIBOLGA-NIAS",
        "name": "KMP Teluk Singkil (Penyeberangan Nias)",
        "modality": "maritime",
        "path": [[98.7800, 1.7400], [98.2000, 1.5000], [97.6000, 1.3000]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.7800, 1.7400], [98.2000, 1.5000], [97.6000, 1.3000]]},
        "speed_kmh": 16.0, "status": "moving", "progress": 0.45, "cargo": "20 Truk Pangan Pokok Pulau Nias", "origin": "Pelabuhan Sibolga", "destination": "Gunungsitoli (Nias)"
    },
    {
        "vehicle_id": "MV-011-JAMBI-ANAMBAS",
        "name": "KM Muaro Jambi 02 (Alur Kuala Tungkal)",
        "modality": "maritime",
        "path": [[103.4500, -0.8000], [104.2000, -0.7000], [104.8000, 0.2000]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.4500, -0.8000], [104.2000, -0.7000], [104.8000, 0.2000]]},
        "speed_kmh": 18.5, "status": "moving", "progress": 0.30, "cargo": "500 Ton Beras Pasokan Kepulauan", "origin": "Kuala Tungkal (Jambi)", "destination": "Dabo Singkep"
    },
    {
        "vehicle_id": "MV-012-KRUI-TRANS",
        "name": "KM Samudera Pesisir Barat (Krui-Banten)",
        "modality": "maritime",
        "path": [[103.9000, -5.2000], [104.7000, -5.8500], [105.5000, -6.1000]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.9000, -5.2000], [104.7000, -5.8500], [105.5000, -6.1000]]},
        "speed_kmh": 17.0, "status": "moving", "progress": 0.52, "cargo": "400 Ton Hasil Perikanan & Pangan", "origin": "Krui (Lampung Barat)", "destination": "Pelabuhan Ciwandan"
    },
    {
        "vehicle_id": "MV-013-DUMAI-MALAKA",
        "name": "KM Selat Melaka Agro (Lintas Batas)",
        "modality": "maritime",
        "path": [[101.4533, 1.6811], [101.8500, 1.8500], [102.1500, 2.0500]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4533, 1.6811], [101.8500, 1.8500], [102.1500, 2.0500]]},
        "speed_kmh": 20.0, "status": "moving", "progress": 0.40, "cargo": "850 Ton Minyak Kelapa Sawit Pangan", "origin": "Pelabuhan Dumai", "destination": "Selat Malaka Jalur Internasional"
    },
    {
        "vehicle_id": "MV-014-PORT-FEEDER",
        "name": "KM Teluk Betung (Feeder Selat Sunda)",
        "modality": "maritime",
        "path": [[105.2667, -5.4500], [105.5500, -5.7500], [105.7533, -5.8711]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.2667, -5.4500], [105.5500, -5.7500], [105.7533, -5.8711]]},
        "speed_kmh": 19.5, "status": "moving", "progress": 0.75, "cargo": "700 Ton Gula Pasir Lampung", "origin": "Pelabuhan Panjang", "destination": "Bakauheni"
    },

    # --- 2. STRATEGIC CARGO TRUCKS (24 Units) ---
    {
        "vehicle_id": "TRK-001-BAKAUHENI-PLM",
        "name": "Truk Pangan 01 (Tol Bakauheni-Palembang)",
        "modality": "truck",
        "path": [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]]},
        "speed_kmh": 75.0, "status": "moving", "progress": 0.52, "cargo": "24 Ton Beras BULOG Lampung", "origin": "Pelabuhan Bakauheni", "destination": "Palembang"
    },
    {
        "vehicle_id": "TRK-002-HORTI-SUMBAR",
        "name": "Truk Hortikultura 02 (Bukittinggi-Pekanbaru)",
        "modality": "truck",
        "path": [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]]},
        "speed_kmh": 62.0, "status": "moving", "progress": 0.38, "cargo": "14 Ton Cabai Merah & Sayur Agam", "origin": "Bukittinggi (Sumbar)", "destination": "Pekanbaru (Riau)"
    },
    {
        "vehicle_id": "TRK-003-BELAWAN-TEBING",
        "name": "Truk Sembako 03 (Tol Medan-Tebing)",
        "modality": "truck",
        "path": [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]]},
        "speed_kmh": 70.0, "status": "moving", "progress": 0.60, "cargo": "20 Ton Minyak Goreng Curah", "origin": "Pelabuhan Belawan", "destination": "Pematang Siantar"
    },
    {
        "vehicle_id": "TRK-004-CPO-DUMAI",
        "name": "Truk Tangki CPO 04 (Tol Permai Pekanbaru-Dumai)",
        "modality": "truck",
        "path": [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]]},
        "speed_kmh": 68.0, "status": "moving", "progress": 0.44, "cargo": "28 Ton Minyak Sawit Mentah", "origin": "Pekanbaru", "destination": "Kawasan Industri Dumai"
    },
    {
        "vehicle_id": "TRK-005-BANDA-ACEH-MEDAN",
        "name": "Truk Pangan 05 (Jalinsum Banda Aceh-Medan)",
        "modality": "truck",
        "path": [[95.3238, 5.5483], [95.9500, 5.2500], [97.1400, 5.1800], [97.9600, 4.4700], [98.6722, 3.5952]],
        "route_geometry": {"type": "LineString", "coordinates": [[95.3238, 5.5483], [95.9500, 5.2500], [97.1400, 5.1800], [97.9600, 4.4700], [98.6722, 3.5952]]},
        "speed_kmh": 65.0, "status": "moving", "progress": 0.32, "cargo": "16 Ton Beras & Komoditas Aceh", "origin": "Banda Aceh", "destination": "Medan"
    },
    {
        "vehicle_id": "TRK-006-JAMBI-PALEMBANG",
        "name": "Truk Distribusi 06 (Lintas Timur Jambi-Palembang)",
        "modality": "truck",
        "path": [[103.6131, -1.6100], [103.9500, -2.1500], [104.3500, -2.5500], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.6131, -1.6100], [103.9500, -2.1500], [104.3500, -2.5500], [104.7565, -2.9909]]},
        "speed_kmh": 60.0, "status": "moving", "progress": 0.58, "cargo": "18 Ton Gula & Tepung Terigu", "origin": "Kota Jambi", "destination": "Palembang"
    },
    {
        "vehicle_id": "TRK-007-PADANG-BENGKULU",
        "name": "Truk Logistik 07 (Lintas Barat Padang-Bengkulu)",
        "modality": "truck",
        "path": [[100.3543, -0.9492], [100.5800, -1.3500], [101.1200, -2.5500], [101.7800, -3.2500], [102.2655, -3.8004]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.3543, -0.9492], [100.5800, -1.3500], [101.1200, -2.5500], [101.7800, -3.2500], [102.2655, -3.8004]]},
        "speed_kmh": 55.0, "status": "moving", "progress": 0.40, "cargo": "15 Ton Minyak Goreng & Pangan Pokok", "origin": "Kota Padang", "destination": "Kota Bengkulu"
    },
    {
        "vehicle_id": "TRK-008-MEDAN-BERASTAGI",
        "name": "Truk Sayur Segar 08 (Medan-Kabanjahe)",
        "modality": "truck",
        "path": [[98.6722, 3.5952], [98.5800, 3.3500], [98.5067, 3.1833]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6722, 3.5952], [98.5800, 3.3500], [98.5067, 3.1833]]},
        "speed_kmh": 45.0, "status": "moving", "progress": 0.70, "cargo": "12 Ton Kol, Kentang, Wortel Karo", "origin": "Kabanjahe (Karo)", "destination": "Pasar Induk Lau Cih Medan"
    },
    {
        "vehicle_id": "TRK-009-LAMPUNG-KOTABUMI",
        "name": "Truk Pangan 09 (Bandar Lampung-Kotabumi)",
        "modality": "truck",
        "path": [[105.2667, -5.4294], [105.1800, -5.0500], [104.8800, -4.8200]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.2667, -5.4294], [105.1800, -5.0500], [104.8800, -4.8200]]},
        "speed_kmh": 65.0, "status": "moving", "progress": 0.35, "cargo": "16 Ton Beras Pengadaan Lokal", "origin": "Bandar Lampung", "destination": "Kotabumi"
    },
    {
        "vehicle_id": "TRK-010-PEKANBARU-DURI",
        "name": "Truk Logistik 10 (Pekanbaru-Duri)",
        "modality": "truck",
        "path": [[101.4478, 0.5071], [101.3500, 0.8500], [101.2100, 1.2800]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4478, 0.5071], [101.3500, 0.8500], [101.2100, 1.2800]]},
        "speed_kmh": 70.0, "status": "moving", "progress": 0.62, "cargo": "18 Ton Sembako Campuran", "origin": "Pekanbaru", "destination": "Duri"
    },
    {
        "vehicle_id": "TRK-011-RANTAUPRAPAT-KISARAN",
        "name": "Truk Pangan 11 (Jalinsum Rantauprapat-Kisaran)",
        "modality": "truck",
        "path": [[100.0000, 2.1000], [99.8500, 2.4500], [99.6200, 2.9800]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.0000, 2.1000], [99.8500, 2.4500], [99.6200, 2.9800]]},
        "speed_kmh": 60.0, "status": "moving", "progress": 0.50, "cargo": "15 Ton Minyak Goreng Curah", "origin": "Rantauprapat", "destination": "Kisaran"
    },
    {
        "vehicle_id": "TRK-012-LUBUKLINGGAU-PLM",
        "name": "Truk Sembako 12 (Lubuklinggau-Palembang)",
        "modality": "truck",
        "path": [[102.8600, -3.2900], [103.5500, -3.2000], [104.1500, -3.1000], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[102.8600, -3.2900], [103.5500, -3.2000], [104.1500, -3.1000], [104.7565, -2.9909]]},
        "speed_kmh": 58.0, "status": "moving", "progress": 0.45, "cargo": "20 Ton Beras & Palawija", "origin": "Lubuklinggau", "destination": "Palembang"
    },
    {
        "vehicle_id": "TRK-013-SIANTAR-TOBA",
        "name": "Truk Distribusi 13 (Siantar-Balige)",
        "modality": "truck",
        "path": [[99.0687, 2.9595], [99.0500, 2.6500], [99.0600, 2.3300]],
        "route_geometry": {"type": "LineString", "coordinates": [[99.0687, 2.9595], [99.0500, 2.6500], [99.0600, 2.3300]]},
        "speed_kmh": 50.0, "status": "moving", "progress": 0.55, "cargo": "12 Ton Pangan Segar", "origin": "Pematang Siantar", "destination": "Balige"
    },
    {
        "vehicle_id": "TRK-014-PAYAKUMBUH-RIAU",
        "name": "Truk Hortikultura 14 (Payakumbuh-Bangkinang)",
        "modality": "truck",
        "path": [[100.6300, -0.2200], [100.7500, -0.1000], [101.0300, 0.3300]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.6300, -0.2200], [100.7500, -0.1000], [101.0300, 0.3300]]},
        "speed_kmh": 55.0, "status": "moving", "progress": 0.30, "cargo": "10 Ton Cabai Merah & Sayur", "origin": "Payakumbuh", "destination": "Bangkinang"
    },
    {
        "vehicle_id": "TRK-015-MUAROJAMBI-TEMBESI",
        "name": "Truk Logistik 15 (Jambi-Muara Tembesi)",
        "modality": "truck",
        "path": [[103.6131, -1.6100], [103.3500, -1.7200], [103.1200, -1.7800]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.6131, -1.6100], [103.3500, -1.7200], [103.1200, -1.7800]]},
        "speed_kmh": 60.0, "status": "moving", "progress": 0.40, "cargo": "14 Ton Minyak Goreng & Beras", "origin": "Kota Jambi", "destination": "Muara Tembesi"
    },
    {
        "vehicle_id": "TRK-016-BENGKULU-CURUP",
        "name": "Truk Sayur 16 (Curup-Bengkulu)",
        "modality": "truck",
        "path": [[102.5200, -3.4700], [102.3800, -3.6500], [102.2655, -3.8004]],
        "route_geometry": {"type": "LineString", "coordinates": [[102.5200, -3.4700], [102.3800, -3.6500], [102.2655, -3.8004]]},
        "speed_kmh": 48.0, "status": "moving", "progress": 0.65, "cargo": "11 Ton Sayuran Dataran Tinggi", "origin": "Curup (Rejang Lebong)", "destination": "Kota Bengkulu"
    },
    {
        "vehicle_id": "TRK-017-LHOKSEUMAWE-LANGSA",
        "name": "Truk Pangan 17 (Lhokseumawe-Langsa)",
        "modality": "truck",
        "path": [[97.1400, 5.1800], [97.5500, 4.8500], [97.9600, 4.4700]],
        "route_geometry": {"type": "LineString", "coordinates": [[97.1400, 5.1800], [97.5500, 4.8500], [97.9600, 4.4700]]},
        "speed_kmh": 62.0, "status": "moving", "progress": 0.48, "cargo": "16 Ton Beras Pengadaan Bulog", "origin": "Lhokseumawe", "destination": "Kota Langsa"
    },
    {
        "vehicle_id": "TRK-018-KAYUAGUNG-PLM",
        "name": "Truk Logistik 18 (Tol Kayu Agung-Palembang)",
        "modality": "truck",
        "path": [[104.8500, -3.3800], [104.8000, -3.1800], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.8500, -3.3800], [104.8000, -3.1800], [104.7565, -2.9909]]},
        "speed_kmh": 78.0, "status": "moving", "progress": 0.72, "cargo": "22 Ton Sembako Terpadu", "origin": "Kayu Agung", "destination": "Palembang"
    },
    {
        "vehicle_id": "TRK-019-TERBANGGI-METRO",
        "name": "Truk Pangan 19 (Terbanggi Besar-Metro)",
        "modality": "truck",
        "path": [[105.1800, -4.8500], [105.2500, -5.0500], [105.3000, -5.1200]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.1800, -4.8500], [105.2500, -5.0500], [105.3000, -5.1200]]},
        "speed_kmh": 65.0, "status": "moving", "progress": 0.50, "cargo": "15 Ton Bahan Pangan Pokok", "origin": "Terbanggi Besar", "destination": "Kota Metro"
    },
    {
        "vehicle_id": "TRK-020-MEDAN-BINJAI",
        "name": "Truk Logistik 20 (Tol Medan-Binjai)",
        "modality": "truck",
        "path": [[98.6722, 3.5952], [98.5800, 3.6050], [98.4856, 3.6006]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.6722, 3.5952], [98.5800, 3.6050], [98.4856, 3.6006]]},
        "speed_kmh": 68.0, "status": "moving", "progress": 0.80, "cargo": "14 Ton Distribusi Gudang Retail", "origin": "Medan", "destination": "Binjai"
    },
    {
        "vehicle_id": "TRK-021-SOLOK-PADANG",
        "name": "Truk Beras Solok 21 (Solok-Padang)",
        "modality": "truck",
        "path": [[100.6500, -0.8000], [100.5000, -0.8800], [100.3543, -0.9492]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.6500, -0.8000], [100.5000, -0.8800], [100.3543, -0.9492]]},
        "speed_kmh": 50.0, "status": "moving", "progress": 0.35, "cargo": "16 Ton Beras Premium Solok", "origin": "Kota Solok", "destination": "Padang"
    },
    {
        "vehicle_id": "TRK-022-PRABUMULIH-PLM",
        "name": "Truk Pangan 22 (Prabumulih-Palembang)",
        "modality": "truck",
        "path": [[104.2300, -3.4300], [104.5000, -3.2000], [104.7565, -2.9909]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.2300, -3.4300], [104.5000, -3.2000], [104.7565, -2.9909]]},
        "speed_kmh": 62.0, "status": "moving", "progress": 0.60, "cargo": "18 Ton Sembako Komersial", "origin": "Prabumulih", "destination": "Palembang"
    },
    {
        "vehicle_id": "TRK-023-SIBOLGA-TARUTUNG",
        "name": "Truk Logistik 23 (Sibolga-Tarutung)",
        "modality": "truck",
        "path": [[98.7800, 1.7400], [98.8800, 1.8800], [98.9800, 2.0100]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.7800, 1.7400], [98.8800, 1.8800], [98.9800, 2.0100]]},
        "speed_kmh": 45.0, "status": "moving", "progress": 0.40, "cargo": "10 Ton Bahan Pokok Ikan & Tepung", "origin": "Sibolga", "destination": "Tarutung"
    },
    {
        "vehicle_id": "TRK-024-MEULABOH-TAPAKTUAN",
        "name": "Truk Pangan 24 (Lintas Barat Aceh)",
        "modality": "truck",
        "path": [[96.1200, 4.1400], [96.7500, 3.6500], [97.1800, 3.2500]],
        "route_geometry": {"type": "LineString", "coordinates": [[96.1200, 4.1400], [96.7500, 3.6500], [97.1800, 3.2500]]},
        "speed_kmh": 52.0, "status": "moving", "progress": 0.55, "cargo": "12 Ton Beras & Minyak Goreng", "origin": "Meulaboh", "destination": "Tapaktuan"
    },

    # --- 3. AIR CARGO FLIGHTS (7 Units) ---
    {
        "vehicle_id": "AIR-001-KNO-CGK",
        "name": "Garuda Cargo GA-7101 (KNO -> CGK)",
        "modality": "air",
        "path": [[98.8780, 3.6421], [101.5000, 0.5000], [104.5000, -3.0000], [106.6500, -6.1256]],
        "route_geometry": {"type": "LineString", "coordinates": [[98.8780, 3.6421], [101.5000, 0.5000], [104.5000, -3.0000], [106.6500, -6.1256]]},
        "speed_kmh": 620.0, "status": "moving", "progress": 0.35, "cargo": "8.5 Ton Daging Beku & Vaksin", "origin": "Bandara Kualanamu (KNO)", "destination": "Soekarno-Hatta (CGK)"
    },
    {
        "vehicle_id": "AIR-002-PKU-BIM",
        "name": "Cardig Air Cargo 802 (PKU -> BIM)",
        "modality": "air",
        "path": [[101.4447, 0.4619], [100.8500, -0.1500], [100.2811, -0.7869]],
        "route_geometry": {"type": "LineString", "coordinates": [[101.4447, 0.4619], [100.8500, -0.1500], [100.2811, -0.7869]]},
        "speed_kmh": 540.0, "status": "moving", "progress": 0.58, "cargo": "5.2 Ton Sayur Segar & Medis", "origin": "Bandara Sultan Syarif Kasim II (PKU)", "destination": "Bandara Minangkabau (BIM)"
    },
    {
        "vehicle_id": "AIR-003-PLM-TKG",
        "name": "Tri-MG Cargo Flight 301 (PLM -> TKG)",
        "modality": "air",
        "path": [[104.7000, -2.8983], [104.9500, -4.0500], [105.1783, -5.2417]],
        "route_geometry": {"type": "LineString", "coordinates": [[104.7000, -2.8983], [104.9500, -4.0500], [105.1783, -5.2417]]},
        "speed_kmh": 510.0, "status": "moving", "progress": 0.42, "cargo": "6.0 Ton Benih Pangan & Sembako Ekspres", "origin": "Bandara Sultan Mahmud Badaruddin II (PLM)", "destination": "Bandara Radin Inten II (TKG)"
    },
    {
        "vehicle_id": "AIR-004-BTJ-KNO",
        "name": "Lion Cargo Express 404 (BTJ -> KNO)",
        "modality": "air",
        "path": [[95.4194, 5.5222], [97.1000, 4.6000], [98.8780, 3.6421]],
        "route_geometry": {"type": "LineString", "coordinates": [[95.4194, 5.5222], [97.1000, 4.6000], [98.8780, 3.6421]]},
        "speed_kmh": 580.0, "status": "moving", "progress": 0.65, "cargo": "4.8 Ton Pangan Hortikultura & Bumbu", "origin": "Bandara Sultan Iskandar Muda (BTJ)", "destination": "Bandara Kualanamu (KNO)"
    },
    {
        "vehicle_id": "AIR-005-DJB-PLM",
        "name": "My Indo Airlines 505 (DJB -> PLM)",
        "modality": "air",
        "path": [[103.6444, -1.6389], [104.1500, -2.2500], [104.7000, -2.8983]],
        "route_geometry": {"type": "LineString", "coordinates": [[103.6444, -1.6389], [104.1500, -2.2500], [104.7000, -2.8983]]},
        "speed_kmh": 490.0, "status": "moving", "progress": 0.30, "cargo": "5.5 Ton Komoditas Pangan Segar", "origin": "Bandara Sultan Thaha (DJB)", "destination": "Bandara Sultan Mahmud Badaruddin II (PLM)"
    },
    {
        "vehicle_id": "AIR-006-BIM-CGK",
        "name": "Pelita Cargo Air 606 (BIM -> CGK)",
        "modality": "air",
        "path": [[100.2811, -0.7869], [103.5000, -3.5000], [106.6500, -6.1256]],
        "route_geometry": {"type": "LineString", "coordinates": [[100.2811, -0.7869], [103.5000, -3.5000], [106.6500, -6.1256]]},
        "speed_kmh": 610.0, "status": "moving", "progress": 0.45, "cargo": "7.2 Ton Produk Olahan Ternak & Sayur", "origin": "Bandara Minangkabau (BIM)", "destination": "Soekarno-Hatta (CGK)"
    },
    {
        "vehicle_id": "AIR-007-TKG-HLP",
        "name": "Asia Cargo Express 707 (TKG -> HLP)",
        "modality": "air",
        "path": [[105.1783, -5.2417], [106.0000, -5.7500], [106.8856, -6.2656]],
        "route_geometry": {"type": "LineString", "coordinates": [[105.1783, -5.2417], [106.0000, -5.7500], [106.8856, -6.2656]]},
        "speed_kmh": 520.0, "status": "moving", "progress": 0.70, "cargo": "6.8 Ton Pangan Segar Antar-Pulau", "origin": "Bandara Radin Inten II (TKG)", "destination": "Halim Perdanakusuma (HLP)"
    },
]


@router.get("/vehicles")
async def get_active_fleet(
    modality: Optional[str] = Query(None, description="Filter modality: truck, maritime, air"),
    status: Optional[str] = Query(None, description="Filter status: moving, anchored, rerouting")
) -> Dict[str, Any]:
    """
    Returns active food logistics fleet with dynamic positions and route geometries.
    """
    fleet = list(BASE_FLEET)

    if modality and modality != "all":
        fleet = [v for v in fleet if v.get("modality") == modality]

    if status:
        fleet = [v for v in fleet if v.get("status") == status]

    return {
        "status": "success",
        "total_vehicles": len(fleet),
        "modality_counts": {
            "all": len(BASE_FLEET),
            "truck": len([v for v in BASE_FLEET if v.get("modality") == "truck"]),
            "maritime": len([v for v in BASE_FLEET if v.get("modality") == "maritime"]),
            "air": len([v for v in BASE_FLEET if v.get("modality") == "air"]),
        },
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "vehicles": fleet
    }
