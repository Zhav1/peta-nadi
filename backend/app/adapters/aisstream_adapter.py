import asyncio
import json
import math
import time
import logging
import websockets
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_AISSTREAM, get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# =============================================================================
# DETERMINISTIC REGIONAL MARITIME FALLBACK GENERATOR (85+ VESSELS)
# Covers Malacca Strait, Sunda Strait, Belawan, Dumai, Kuala Tanjung,
# Panjang, Bakauheni, Teluk Bayur shipping lanes.
# =============================================================================

FALLBACK_VESSEL_BASELINES = [
    # --- 1. SELAT MALAKA ARTERIAL CORRIDOR (35 Vessels) ---
    {"mmsi": 525011001, "name": "KM Sinabung Raya", "type": "Container", "lat": 4.8500, "lon": 98.3200, "sog": 15.4, "cog": 132.0, "origin": "Selat Malaka Utara"},
    {"mmsi": 525011002, "name": "MT Srikandi Dumai", "type": "Crude Oil Tanker", "lat": 2.4500, "lon": 101.2000, "sog": 12.8, "cog": 312.0, "origin": "Pelabuhan Dumai"},
    {"mmsi": 525011003, "name": "MV Meratus Belawan II", "type": "Feeder Container", "lat": 4.1200, "lon": 99.1500, "sog": 14.2, "cog": 135.0, "origin": "Pelabuhan Belawan"},
    {"mmsi": 525011004, "name": "KM Tanto Harmoni", "type": "Container", "lat": 3.7500, "lon": 99.7800, "sog": 16.0, "cog": 315.0, "origin": "Port Klang"},
    {"mmsi": 525011005, "name": "MT Galunggung Star", "type": "Product Tanker", "lat": 1.9500, "lon": 102.1000, "sog": 11.5, "cog": 130.0, "origin": "Sungai Pakning"},
    {"mmsi": 525011006, "name": "MV Oriental Emerald", "type": "Bulk Carrier", "lat": 5.2000, "lon": 97.9000, "sog": 13.0, "cog": 128.0, "origin": "Lhokseumawe"},
    {"mmsi": 525011007, "name": "KM Bali Dwipa Express", "type": "General Cargo", "lat": 3.2000, "lon": 100.4500, "sog": 12.1, "cog": 308.0, "origin": "Kuala Tanjung"},
    {"mmsi": 525011008, "name": "MT Musi River Pioneer", "type": "Chemical Tanker", "lat": 2.8000, "lon": 100.9500, "sog": 13.6, "cog": 134.0, "origin": "Dumai"},
    {"mmsi": 525011009, "name": "KM Strait Pioneer IX", "type": "Container", "lat": 4.6000, "lon": 98.6500, "sog": 17.2, "cog": 314.0, "origin": "Belawan"},
    {"mmsi": 525011010, "name": "MV Samudera Mas", "type": "Feeder Container", "lat": 1.5500, "lon": 102.8500, "sog": 14.8, "cog": 126.0, "origin": "Batu Pahat / Bengkalis"},
    {"mmsi": 525011011, "name": "MT Samudra Palm 05", "type": "Palm Oil Tanker", "lat": 2.2000, "lon": 101.6500, "sog": 10.9, "cog": 310.0, "origin": "Pelabuhan Dumai"},
    {"mmsi": 525011012, "name": "KM Malacca Express IV", "type": "General Cargo", "lat": 3.9500, "lon": 99.4000, "sog": 11.8, "cog": 132.0, "origin": "Belawan"},
    {"mmsi": 525011013, "name": "MT Anambas Crude", "type": "Crude Oil Tanker", "lat": 1.3500, "lon": 103.2000, "sog": 13.2, "cog": 305.0, "origin": "Batam / Selat Malaka"},
    {"mmsi": 525011014, "name": "KM Cendrawasih 8", "type": "General Cargo", "lat": 4.4000, "lon": 98.9000, "sog": 12.5, "cog": 136.0, "origin": "Langsa"},
    {"mmsi": 525011015, "name": "MV Sumatra Feeder 1", "type": "Feeder Container", "lat": 3.4500, "lon": 100.1500, "sog": 15.0, "cog": 312.0, "origin": "Kuala Tanjung"},
    {"mmsi": 525011016, "name": "MT Riau Gas Carrier", "type": "LPG Tanker", "lat": 2.1000, "lon": 101.8500, "sog": 14.1, "cog": 129.0, "origin": "Dumai"},
    {"mmsi": 525011017, "name": "KM Batam Forwarder", "type": "Container", "lat": 1.2500, "lon": 103.4500, "sog": 16.5, "cog": 306.0, "origin": "Batam"},
    {"mmsi": 525011018, "name": "MV Port Klang Feeder", "type": "Feeder Container", "lat": 3.0500, "lon": 100.7000, "sog": 13.9, "cog": 133.0, "origin": "Port Klang"},
    {"mmsi": 525011019, "name": "MT Dumai Perdana 01", "type": "Product Tanker", "lat": 1.7500, "lon": 102.4000, "sog": 11.2, "cog": 311.0, "origin": "Dumai"},
    {"mmsi": 525011020, "name": "KM Tanjung Pinang Indah", "type": "General Cargo", "lat": 1.1500, "lon": 103.7000, "sog": 10.5, "cog": 125.0, "origin": "Tanjung Balai Karimun"},
    {"mmsi": 525011021, "name": "MT Bintan Star 88", "type": "Chemical Tanker", "lat": 2.6500, "lon": 101.0500, "sog": 12.4, "cog": 313.0, "origin": "Rupat Strait"},
    {"mmsi": 525011022, "name": "MV Nusantara Trans 2", "type": "Container", "lat": 4.9500, "lon": 98.1500, "sog": 15.8, "cog": 131.0, "origin": "Lhokseumawe"},
    {"mmsi": 525011023, "name": "KM Lintas Malaka 01", "type": "General Cargo", "lat": 3.6000, "lon": 99.9500, "sog": 11.7, "cog": 309.0, "origin": "Kuala Tanjung"},
    {"mmsi": 525011024, "name": "MT Asahan Petroleum", "type": "Product Tanker", "lat": 3.3500, "lon": 100.3000, "sog": 12.0, "cog": 135.0, "origin": "Tanjung Balai Asahan"},
    {"mmsi": 525011025, "name": "KM Sabang Express", "type": "Ro-Ro Cargo", "lat": 5.4500, "lon": 97.4000, "sog": 16.2, "cog": 127.0, "origin": "Sabang"},
    {"mmsi": 525011026, "name": "MV Karimun Leader", "type": "Bulk Carrier", "lat": 1.4000, "lon": 103.0500, "sog": 12.9, "cog": 307.0, "origin": "Karimun"},
    {"mmsi": 525011027, "name": "KM Siak Raya 07", "type": "General Cargo", "lat": 1.8500, "lon": 102.2500, "sog": 10.8, "cog": 132.0, "origin": "Sungai Siak"},
    {"mmsi": 525011028, "name": "MT Barito Carrier", "type": "Palm Oil Tanker", "lat": 2.3000, "lon": 101.4500, "sog": 11.6, "cog": 312.0, "origin": "Dumai"},
    {"mmsi": 525011029, "name": "KM Melaka Jaya 3", "type": "General Cargo", "lat": 2.9000, "lon": 100.8000, "sog": 11.0, "cog": 133.0, "origin": "Bagan Siapi-api"},
    {"mmsi": 525011030, "name": "MV Singapore Connector", "type": "Feeder Container", "lat": 1.2000, "lon": 103.6000, "sog": 17.5, "cog": 305.0, "origin": "Singapore Strait"},
    {"mmsi": 525011031, "name": "KM Pelindo Star 1", "type": "Tug / Supply", "lat": 3.8200, "lon": 99.6000, "sog": 9.8, "cog": 134.0, "origin": "Belawan"},
    {"mmsi": 525011032, "name": "MT Selat Crude IX", "type": "Crude Oil Tanker", "lat": 4.3000, "lon": 99.0000, "sog": 13.1, "cog": 314.0, "origin": "Arun"},
    {"mmsi": 525011033, "name": "KM Lingga Maju", "type": "General Cargo", "lat": 1.6500, "lon": 102.6000, "sog": 10.4, "cog": 128.0, "origin": "Kepulauan Riau"},
    {"mmsi": 525011034, "name": "MV Dumai Fortune", "type": "Bulk Carrier", "lat": 2.5000, "lon": 101.1500, "sog": 12.7, "cog": 310.0, "origin": "Dumai"},
    {"mmsi": 525011035, "name": "KM Medan Bahari", "type": "Container", "lat": 4.7000, "lon": 98.5000, "sog": 15.6, "cog": 130.0, "origin": "Belawan"},
    {"mmsi": 525011036, "name": "KM Aceh Sejahtera", "type": "General Cargo", "lat": 5.2500, "lon": 97.2000, "sog": 13.4, "cog": 115.0, "origin": "Lhokseumawe"},
    {"mmsi": 525011037, "name": "MT Arun Gas Leader", "type": "LPG Tanker", "lat": 5.3000, "lon": 97.4000, "sog": 14.8, "cog": 305.0, "origin": "Pelabuhan Arun Lhokseumawe"},
    {"mmsi": 525011038, "name": "KM Belawan Samudera 7", "type": "Container", "lat": 4.0500, "lon": 99.2500, "sog": 16.2, "cog": 136.0, "origin": "Belawan Outer Channel"},
    {"mmsi": 525011039, "name": "MV Malacca Trader 11", "type": "Feeder Container", "lat": 3.1500, "lon": 100.5500, "sog": 15.1, "cog": 312.0, "origin": "Selat Malaka Tengah"},
    {"mmsi": 525011040, "name": "KM Deli Express II", "type": "General Cargo", "lat": 3.6500, "lon": 99.8500, "sog": 12.0, "cog": 133.0, "origin": "Kuala Tanjung"},
    {"mmsi": 525011041, "name": "MT Meulaboh Spirit", "type": "Product Tanker", "lat": 4.1000, "lon": 96.0500, "sog": 11.2, "cog": 155.0, "origin": "Meulaboh Pantai Barat"},
    {"mmsi": 525011042, "name": "KM Sabang Poros 01", "type": "Ro-Ro Cargo", "lat": 5.8500, "lon": 95.3000, "sog": 15.0, "cog": 85.0, "origin": "Pelabuhan Bebas Sabang"},
    {"mmsi": 525011043, "name": "TB Ujung Baru Tug 04", "type": "Harbor Tug", "lat": 3.7880, "lon": 98.6820, "sog": 3.8, "cog": 120.0, "origin": "Pelabuhan Belawan Dermaga Ujung Baru"},

    # --- 2. SELAT SUNDA & BAKAUHENI - MERAK CORRIDOR (15 Vessels) ---
    {"mmsi": 525022001, "name": "KMP Batu Mandi", "type": "Ro-Ro Ferry", "lat": -5.8750, "lon": 105.7800, "sog": 13.5, "cog": 118.0, "origin": "Pelabuhan Bakauheni"},
    {"mmsi": 525022002, "name": "KMP Sebuku Raya", "type": "Ro-Ro Ferry", "lat": -5.9100, "lon": 105.8900, "sog": 14.2, "cog": 298.0, "origin": "Pelabuhan Merak"},
    {"mmsi": 525022003, "name": "KMP Legundi Nusantara", "type": "Ro-Ro Ferry", "lat": -5.8900, "lon": 105.8300, "sog": 13.8, "cog": 120.0, "origin": "Pelabuhan Bakauheni"},
    {"mmsi": 525022004, "name": "KMP Portlink III", "type": "Ro-Ro Ferry", "lat": -5.9250, "lon": 105.9500, "sog": 15.1, "cog": 300.0, "origin": "Pelabuhan Merak"},
    {"mmsi": 525022005, "name": "KMP Duta Banten", "type": "Ro-Ro Ferry", "lat": -5.8600, "lon": 105.7400, "sog": 12.0, "cog": 115.0, "origin": "Pelabuhan Bakauheni"},
    {"mmsi": 525022006, "name": "KMP Jatra II Express", "type": "Ro-Ro Ferry", "lat": -5.9000, "lon": 105.8600, "sog": 14.5, "cog": 295.0, "origin": "Pelabuhan Merak"},
    {"mmsi": 525022007, "name": "KMP Rajabasa Utama", "type": "Ro-Ro Ferry", "lat": -5.8800, "lon": 105.8000, "sog": 13.0, "cog": 117.0, "origin": "Pelabuhan Bakauheni"},
    {"mmsi": 525022008, "name": "MT Krakatau Star", "type": "Chemical Tanker", "lat": -5.9600, "lon": 105.7200, "sog": 11.4, "cog": 210.0, "origin": "Cilegon"},
    {"mmsi": 525022009, "name": "MV Sunda Pioneer 3", "type": "Bulk Carrier", "lat": -6.0200, "lon": 105.6500, "sog": 12.8, "cog": 35.0, "origin": "Samudera Hindia"},
    {"mmsi": 525022010, "name": "KM Lampung Sejahtera", "type": "General Cargo", "lat": -5.8200, "lon": 105.7000, "sog": 10.8, "cog": 112.0, "origin": "Panjang"},
    {"mmsi": 525022011, "name": "KMP Titian Nusantara", "type": "Ro-Ro Ferry", "lat": -5.9150, "lon": 105.9200, "sog": 13.7, "cog": 298.0, "origin": "Pelabuhan Merak"},
    {"mmsi": 525022012, "name": "MT Panjang Fuel 02", "type": "Product Tanker", "lat": -5.7800, "lon": 105.6200, "sog": 11.0, "cog": 170.0, "origin": "Pelabuhan Panjang"},
    {"mmsi": 525022013, "name": "KMP Panorama Selat", "type": "Ro-Ro Ferry", "lat": -5.8850, "lon": 105.8150, "sog": 14.0, "cog": 118.0, "origin": "Pelabuhan Bakauheni"},
    {"mmsi": 525022014, "name": "MV Merak Express 9", "type": "Feeder Container", "lat": -5.9400, "lon": 105.9800, "sog": 15.2, "cog": 302.0, "origin": "Tanjung Priok"},
    {"mmsi": 525022015, "name": "KM Sunda Mandiri 1", "type": "Tug / Supply", "lat": -5.8500, "lon": 105.7600, "sog": 8.5, "cog": 120.0, "origin": "Bakauheni"},

    # --- 3. PELABUHAN BELAWAN & OUTER ANCHORAGE (10 Vessels) ---
    {"mmsi": 525033001, "name": "TB Deli Pioneer 01", "type": "Harbor Tug", "lat": 3.7920, "lon": 98.6850, "sog": 4.2, "cog": 45.0, "origin": "Pelabuhan Belawan"},
    {"mmsi": 525033002, "name": "KM Belawan Jaya", "type": "Container", "lat": 3.8250, "lon": 98.7100, "sog": 0.2, "cog": 15.0, "origin": "Belawan Anchorage"},
    {"mmsi": 525033003, "name": "MT Belawan Palm III", "type": "Palm Oil Tanker", "lat": 3.8100, "lon": 98.6950, "sog": 0.1, "cog": 90.0, "origin": "Belawan Terminal Cair"},
    {"mmsi": 525033004, "name": "KM Sinar Belawan", "type": "Feeder Container", "lat": 3.8600, "lon": 98.7400, "sog": 9.5, "cog": 35.0, "origin": "Alur Pelayaran Belawan"},
    {"mmsi": 525033005, "name": "TB Sei Mangkei Tug", "type": "Harbor Tug", "lat": 3.7780, "lon": 98.6700, "sog": 3.5, "cog": 220.0, "origin": "Dermaga Ujung Baru"},
    {"mmsi": 525033006, "name": "KM Deli Container 5", "type": "Container", "lat": 3.8850, "lon": 98.7650, "sog": 11.2, "cog": 40.0, "origin": "Belawan Outer Buoy"},
    {"mmsi": 525033007, "name": "TB Belawan Dock 02", "type": "Tug / Pilot", "lat": 3.7850, "lon": 98.6780, "sog": 2.0, "cog": 180.0, "origin": "Belawan Basin"},
    {"mmsi": 525033008, "name": "MT Medan Star 02", "type": "Bunkering Tanker", "lat": 3.8400, "lon": 98.7200, "sog": 0.3, "cog": 70.0, "origin": "Belawan Anchorage"},
    {"mmsi": 525033009, "name": "KM Aru Bahari", "type": "General Cargo", "lat": 3.7990, "lon": 98.6890, "sog": 0.1, "cog": 310.0, "origin": "Dermaga Gudang Garam"},
    {"mmsi": 525033010, "name": "TB Malacca Tug 1", "type": "Harbor Tug", "lat": 3.7700, "lon": 98.6620, "sog": 5.0, "cog": 95.0, "origin": "Belawan Terminal Multipurpose"},

    # --- 4. PELABUHAN DUMAI & SELAT RUPAT (8 Vessels) ---
    {"mmsi": 525044001, "name": "MT Dumai CPO Explorer", "type": "Palm Oil Tanker", "lat": 1.6850, "lon": 101.4600, "sog": 0.2, "cog": 110.0, "origin": "Pelabuhan Dumai"},
    {"mmsi": 525044002, "name": "MT Rupat Spirit", "type": "Crude Oil Tanker", "lat": 1.7200, "lon": 101.4900, "sog": 8.5, "cog": 125.0, "origin": "Selat Rupat"},
    {"mmsi": 525044003, "name": "MT Intan Baruna Dumai", "type": "Product Tanker", "lat": 1.6700, "lon": 101.4350, "sog": 0.1, "cog": 80.0, "origin": "Dermaga Pertamina Dumai"},
    {"mmsi": 525044004, "name": "KM Dumai Cargo 03", "type": "General Cargo", "lat": 1.7050, "lon": 101.4750, "sog": 6.8, "cog": 305.0, "origin": "Dumai Port Area"},
    {"mmsi": 525044005, "name": "MT Palm Oil Pioneer", "type": "Chemical Tanker", "lat": 1.7450, "lon": 101.5200, "sog": 9.2, "cog": 130.0, "origin": "Pelintung Dumai"},
    {"mmsi": 525044006, "name": "TB Dumai Towing 08", "type": "Harbor Tug", "lat": 1.6800, "lon": 101.4480, "sog": 3.1, "cog": 200.0, "origin": "Pelabuhan Dumai"},
    {"mmsi": 525044007, "name": "MT Riau Clean Energy", "type": "LPG Tanker", "lat": 1.7600, "lon": 101.5400, "sog": 10.4, "cog": 312.0, "origin": "Selat Rupat Timur"},
    {"mmsi": 525044008, "name": "KM Minas Leader", "type": "Bulk Carrier", "lat": 1.6600, "lon": 101.4200, "sog": 0.2, "cog": 150.0, "origin": "Dumai Anchorage"},

    # --- 5. PELABUHAN KUALA TANJUNG (6 Vessels) ---
    {"mmsi": 525055001, "name": "KM Kuala Tanjung Sejahtera", "type": "Container", "lat": 3.3650, "lon": 99.4550, "sog": 0.2, "cog": 45.0, "origin": "Pelabuhan Kuala Tanjung"},
    {"mmsi": 525055002, "name": "MV Inalum Aluminum 1", "type": "Bulk Carrier", "lat": 3.3850, "lon": 99.4750, "sog": 7.5, "cog": 130.0, "origin": "Dermaga Inalum"},
    {"mmsi": 525055003, "name": "KM Batubara Mandiri", "type": "Coal Carrier", "lat": 3.4100, "lon": 99.5000, "sog": 8.8, "cog": 310.0, "origin": "Kuala Tanjung Offshore"},
    {"mmsi": 525055004, "name": "TB Kuala Tug 02", "type": "Harbor Tug", "lat": 3.3580, "lon": 99.4450, "sog": 3.8, "cog": 220.0, "origin": "Kuala Tanjung Basin"},
    {"mmsi": 525055005, "name": "MV Asahan Bulk 9", "type": "Bulk Carrier", "lat": 3.4400, "lon": 99.5300, "sog": 10.2, "cog": 128.0, "origin": "Kuala Tanjung Anchorage"},
    {"mmsi": 525055006, "name": "KM North Sumatra Feeder", "type": "Feeder Container", "lat": 3.3750, "lon": 99.4620, "sog": 0.1, "cog": 90.0, "origin": "Kuala Tanjung Multipurpose"},

    # --- 6. TELUK BAYUR (PADANG) & PANTAI BARAT SUMATERA (8 Vessels) ---
    {"mmsi": 525066001, "name": "KM Teluk Bayur Raya", "type": "Container", "lat": -0.9950, "lon": 100.3720, "sog": 0.2, "cog": 210.0, "origin": "Pelabuhan Teluk Bayur"},
    {"mmsi": 525066002, "name": "MT Padang Star 01", "type": "Product Tanker", "lat": -1.0200, "lon": 100.3550, "sog": 8.2, "cog": 195.0, "origin": "Teluk Bayur Outbound"},
    {"mmsi": 525066003, "name": "KM Minangkabau Jaya", "type": "General Cargo", "lat": -0.9850, "lon": 100.3800, "sog": 0.1, "cog": 90.0, "origin": "Dermaga Teluk Bayur"},
    {"mmsi": 525066004, "name": "KM Caraka Bayur", "type": "General Cargo", "lat": -1.0500, "lon": 100.3300, "sog": 11.5, "cog": 340.0, "origin": "Samudera Hindia Barat"},
    {"mmsi": 525066005, "name": "KM Sibolga Bahari", "type": "General Cargo", "lat": 1.7420, "lon": 98.7850, "sog": 0.2, "cog": 180.0, "origin": "Pelabuhan Sibolga"},
    {"mmsi": 525066006, "name": "TB Barus Jaya 03", "type": "Harbor Tug", "lat": 1.7550, "lon": 98.7950, "sog": 4.1, "cog": 45.0, "origin": "Teluk Tapian Nauli"},
    {"mmsi": 525066007, "name": "KM Mentawai Fast 2", "type": "Fast Passenger / Cargo", "lat": -1.1500, "lon": 100.2200, "sog": 18.0, "cog": 235.0, "origin": "Padang - Mentawai"},
    {"mmsi": 525066008, "name": "MT Nias Petroleum", "type": "Product Tanker", "lat": 1.6800, "lon": 98.6500, "sog": 9.8, "cog": 160.0, "origin": "Sibolga / Nias"},

    # --- 7. PELABUHAN PANJANG & TELUK LAMPUNG (6 Vessels) ---
    {"mmsi": 525077001, "name": "KM Panjang Mandiri", "type": "Container", "lat": -5.4650, "lon": 105.3180, "sog": 0.2, "cog": 120.0, "origin": "Pelabuhan Panjang"},
    {"mmsi": 525077002, "name": "MT Lampung Bay Star", "type": "Product Tanker", "lat": -5.4950, "lon": 105.3350, "sog": 7.8, "cog": 175.0, "origin": "Teluk Lampung"},
    {"mmsi": 525077003, "name": "KM Tarahan Coal 1", "type": "Coal Carrier", "lat": -5.5200, "lon": 105.3500, "sog": 8.5, "cog": 165.0, "origin": "Pelabuhan Tarahan"},
    {"mmsi": 525077004, "name": "TB Panjang Tow 01", "type": "Harbor Tug", "lat": -5.4580, "lon": 105.3100, "sog": 3.6, "cog": 210.0, "origin": "Panjang Port Basin"},
    {"mmsi": 525077005, "name": "KM Way Galih Express", "type": "General Cargo", "lat": -5.4800, "lon": 105.3250, "sog": 0.1, "cog": 90.0, "origin": "Dermaga Panjang"},
    {"mmsi": 525077006, "name": "MT Bakau Star 9", "type": "Bunkering Tanker", "lat": -5.5500, "lon": 105.3800, "sog": 9.2, "cog": 160.0, "origin": "Lampung Selatan"},
]


def generate_sumatra_maritime_fallback() -> List[Dict[str, Any]]:
    """
    Generates a deterministic, realistic regional Malacca Strait & Sumatra maritime
    dataset (85+ active cargo/tanker/feeder vessels along Malacca Strait, Sunda Strait,
    Belawan, Dumai, Kuala Tanjung, Panjang, Bakauheni, Teluk Bayur shipping lanes).
    Positions have subtle deterministic drift based on current epoch time so movement
    is natural and alive on Render (peta-nadi.onrender.com).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    t = time.time()
    vessels = []

    for v in FALLBACK_VESSEL_BASELINES:
        mmsi = v["mmsi"]
        base_lat = v["lat"]
        base_lon = v["lon"]
        sog = v["sog"]
        cog = v["cog"]

        # Deterministic micro-drift along course vector
        if sog > 0.5:
            drift_scale = 0.003
            cog_rad = math.radians(cog)
            # Cycle every 600s
            cycle_phase = (t % 600.0) / 600.0
            d_lat = math.cos(cog_rad) * drift_scale * math.sin(cycle_phase * 2.0 * math.pi)
            d_lon = math.sin(cog_rad) * drift_scale * math.sin(cycle_phase * 2.0 * math.pi)
            cur_lat = round(base_lat + d_lat, 4)
            cur_lon = round(base_lon + d_lon, 4)
            cur_heading = cog
        else:
            cur_lat = base_lat
            cur_lon = base_lon
            cur_heading = cog

        vessels.append({
            "mmsi": str(mmsi),
            "ship_name": v["name"],
            "name": v["name"],
            "lat": cur_lat,
            "lon": cur_lon,
            "sog": sog,
            "sog_knots": sog,
            "cog": cog,
            "cog_deg": cog,
            "heading": cur_heading,
            "heading_deg": cur_heading,
            "ship_type": v["type"],
            "port_origin": v.get("origin", "Pelabuhan Sumatra"),
            "last_seen": now_iso,
            "telemetry_source": "MARITIME_RADAR_FALLBACK",
            "current_coords": [round(cur_lon, 4), round(cur_lat, 4)],
        })

    return vessels


# =============================================================================
# AISSTREAM ADAPTER
# =============================================================================

class AISstreamAdapter(BaseAdapter):
    source_name = "aisstream"
    stream_key = STREAM_AISSTREAM
    poll_interval_seconds = 60  # Check queue depth every 60s in memory
    MAX_LIVE_VESSELS = 1500
    MAX_VESSELS = 1500

    # Strategic Sumatra Seaports Bounding Boxes: [[lat_max, lon_min], [lat_min, lon_max]]
    PORTS = {
        "belawan": {
            "name": "Pelabuhan Belawan",
            "bbox": [[3.90, 98.60], [3.70, 98.80]],
            "center": {"lat": 3.7922, "lon": 98.6776},
        },
        "kuala_tanjung": {
            "name": "Pelabuhan Kuala Tanjung",
            "bbox": [[3.45, 99.35], [3.25, 99.55]],
            "center": {"lat": 3.3600, "lon": 99.4500},
        },
        "dumai": {
            "name": "Pelabuhan Dumai",
            "bbox": [[1.78, 101.35], [1.60, 101.55]],
            "center": {"lat": 1.6811, "lon": 101.4533},
        },
        "teluk_bayur": {
            "name": "Pelabuhan Teluk Bayur",
            "bbox": [[-0.92, 100.30], [-1.08, 100.45]],
            "center": {"lat": -0.9980, "lon": 100.3700},
        },
        "boom_baru": {
            "name": "Pelabuhan Boom Baru (Palembang)",
            "bbox": [[-2.90, 104.70], [-3.05, 104.85]],
            "center": {"lat": -2.9750, "lon": 104.7833},
        },
        "panjang": {
            "name": "Pelabuhan Panjang (Lampung)",
            "bbox": [[-5.40, 105.25], [-5.55, 105.40]],
            "center": {"lat": -5.4667, "lon": 105.3167},
        },
        "bakauheni": {
            "name": "Pelabuhan Bakauheni (Sunda Strait Ferry)",
            "bbox": [[-5.80, 105.68], [-5.95, 105.82]],
            "center": {"lat": -5.8711, "lon": 105.7533},
        },
        "lhokseumawe": {
            "name": "Pelabuhan Lhokseumawe (Aceh)",
            "bbox": [[5.35, 97.00], [5.15, 97.25]],
            "center": {"lat": 5.2400, "lon": 97.0600},
        },
        "malahayati": {
            "name": "Pelabuhan Malahayati (Aceh)",
            "bbox": [[5.68, 95.45], [5.50, 95.60]],
            "center": {"lat": 5.5897, "lon": 95.5186},
        },
    }

    # Macro Bounding Box covering Sumatra, Malacca Strait, and Sunda Strait: [[North_Lat, West_Lon], [South_Lat, East_Lon]]
    MACRO_BBOX = [[6.2, 94.8], [-6.2, 109.0]]

    # Combined bounding boxes for AISstream subscription (Macro + 8 Ports)
    BBOX = [MACRO_BBOX] + [info["bbox"] for info in PORTS.values()]

    def __init__(self):
        super().__init__()
        self.ws_url = "wss://stream.aisstream.io/v0/stream"
        # Bounded ring-buffer dictionary: { mmsi: { mmsi, ship_name, lat, lon, sog, ... } }
        self.vessels: Dict[int, Dict[str, Any]] = {}
        self._ws_connected = False
        self._last_msg_ts: float = 0.0
        self._current_ws: Optional[Any] = None

    async def fetch(self) -> Any:
        """For streaming, fetch is not called directly in a polling loop."""
        pass

    async def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        """Normalize streaming AIS position reports into events."""
        pass

    async def health_check(self) -> bool:
        """Check if WebSocket is connected."""
        return self._ws_connected

    async def _watchdog_loop(self):
        """
        aisWatchdog pattern: Auto-reconnect resilience if socket is connected
        but silent for > 90 seconds.
        """
        while True:
            await asyncio.sleep(15)
            if self._ws_connected:
                idle_sec = time.time() - self._last_msg_ts
                if idle_sec > 90.0:
                    logger.warning(f"AIS Watchdog: No position reports for {idle_sec:.1f}s. Triggering auto-reconnect...")
                    if self._current_ws:
                        try:
                            await self._current_ws.close()
                        except Exception as e:
                            logger.debug(f"Watchdog socket close exception: {e}")

    async def run(self):
        """Override base run loop for streaming WebSocket ingestion with watchdog."""
        logger.info(f"Starting streaming adapter for {self.source_name}")
        
        # Start queue processing and watchdog background tasks
        asyncio.create_task(self._process_queue_loop())
        asyncio.create_task(self._watchdog_loop())
        
        reconnect_delay = 1
        max_reconnect_delay = 60

        while True:
            try:
                if not settings.aisstream_api_key:
                    logger.info("AISstream API key not configured. Maritime fallback simulator active.")
                    self.update_source_health("degraded")
                    await asyncio.sleep(60)
                    continue

                logger.info(f"Connecting to AISstream WebSocket: {self.ws_url}")
                async with websockets.connect(self.ws_url, ping_interval=20, ping_timeout=20) as ws:
                    self._current_ws = ws
                    self._ws_connected = True
                    self._last_msg_ts = time.time()
                    self.update_source_health("ok")
                    reconnect_delay = 1  # Reset backoff on successful connect

                    # Send subscription message with macro bounding box and port zones
                    subscription = {
                        "APIKey": settings.aisstream_api_key,
                        "BoundingBoxes": self.BBOX,
                        "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
                    }
                    await ws.send(json.dumps(subscription))
                    logger.info("AISstream subscription sent successfully for Sumatra & Malacca Strait Macro BBox")

                    async for message in ws:
                        try:
                            data = json.loads(message)
                            await self._handle_raw_message(data)
                        except Exception as e:
                            logger.error(f"Error parsing incoming AIS message: {e}")

            except websockets.exceptions.ConnectionClosed:
                logger.warning("AISstream WebSocket connection closed")
            except Exception as e:
                logger.error(f"Error in AISstream WebSocket client: {e}")
            finally:
                self._current_ws = None
                self._ws_connected = False
                self.update_source_health("down")
                
            # Reconnect with exponential backoff
            logger.info(f"Reconnecting to AISstream in {reconnect_delay}s...")
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)

    async def _handle_raw_message(self, data: Dict[str, Any]):
        """Update bounded vessel ring-buffer from dynamic AIS reports."""
        msg_type = data.get("MessageType")
        metadata = data.get("MetaData", {})
        mmsi = metadata.get("MMSI")
        ship_name = metadata.get("ShipName", "").strip()

        if not mmsi:
            return

        self._last_msg_ts = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        if msg_type == "PositionReport":
            pos_report = data.get("Message", {}).get("PositionReport", {})
            sog = float(pos_report.get("Sog", 0.0))  # Speed over ground in knots
            cog = float(pos_report.get("Cog", 0.0))  # Course over ground
            true_heading = float(pos_report.get("TrueHeading", cog))
            if true_heading == 511.0:
                true_heading = cog
            lat = metadata.get("latitude")
            lon = metadata.get("longitude")

            if lat is None or lon is None:
                return

            # Check port proximity
            port_origin = "Selat Malaka / Lintas Selat"
            for pid, pdata in self.PORTS.items():
                bbox = pdata["bbox"]
                lat_min = min(bbox[0][0], bbox[1][0])
                lat_max = max(bbox[0][0], bbox[1][0])
                lon_min = min(bbox[0][1], bbox[1][1])
                lon_max = max(bbox[0][1], bbox[1][1])
                if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
                    port_origin = pdata["name"]
                    break

            # Enforce bounded ring-buffer capacity (MAX_LIVE_VESSELS = 1500)
            if len(self.vessels) >= self.MAX_LIVE_VESSELS and mmsi not in self.vessels:
                # Evict oldest vessel
                oldest_mmsi = min(self.vessels.keys(), key=lambda k: self.vessels[k].get("last_seen", ""))
                del self.vessels[oldest_mmsi]

            existing = self.vessels.get(mmsi, {})
            self.vessels[mmsi] = {
                "mmsi": str(mmsi),
                "ship_name": ship_name or existing.get("ship_name") or f"MMSI:{mmsi}",
                "name": ship_name or existing.get("name") or f"MMSI:{mmsi}",
                "lat": lat,
                "lon": lon,
                "sog": sog,
                "sog_knots": sog,
                "cog": cog,
                "cog_deg": cog,
                "heading": true_heading,
                "heading_deg": true_heading,
                "ship_type": existing.get("ship_type") or ("Tanker" if "MT " in ship_name else "Cargo"),
                "port_origin": port_origin,
                "last_seen": now_iso,
                "telemetry_source": "AISSTREAM_WS",
                "current_coords": [round(float(lon), 4), round(float(lat), 4)],
            }

        elif msg_type == "ShipStaticData" and mmsi in self.vessels:
            static_data = data.get("Message", {}).get("ShipStaticData", {})
            type_code = static_data.get("Type", 0)
            type_desc = "Cargo"
            if 80 <= type_code <= 89:
                type_desc = "Tanker"
            elif 70 <= type_code <= 79:
                type_desc = "Container / Cargo"
            elif 60 <= type_code <= 69:
                type_desc = "Passenger / Ferry"
            elif 30 <= type_code <= 39:
                type_desc = "Fishing"
            elif 50 <= type_code <= 55:
                type_desc = "Tug / Pilot"

            self.vessels[mmsi]["ship_type"] = type_desc
            if ship_name:
                self.vessels[mmsi]["ship_name"] = ship_name
                self.vessels[mmsi]["name"] = ship_name

    async def _process_queue_loop(self):
        """Periodically analyze vessel registry and emit port queue congestion events."""
        while True:
            await self._process_queue()
            await asyncio.sleep(self.poll_interval_seconds)

    async def _process_queue(self):
        """Analyze vessel registry once and emit events if threshold exceeded."""
        r = get_redis()
        current_hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
        
        try:
            # Cleanup vessels not seen in the last 45 minutes (2700s)
            now = datetime.now(timezone.utc)
            to_delete = []
            for mmsi, info in self.vessels.items():
                try:
                    last_seen = datetime.fromisoformat(info["last_seen"])
                    if (now - last_seen).total_seconds() > 2700:
                        to_delete.append(mmsi)
                except Exception:
                    pass
            
            for mmsi in to_delete:
                if mmsi in self.vessels:
                    del self.vessels[mmsi]

            # Group vessels by port based on bounding box
            port_vessels: Dict[str, List[Dict[str, Any]]] = {pid: [] for pid in self.PORTS.keys()}
            for v in self.vessels.values():
                v_lat, v_lon = v.get("lat"), v.get("lon")
                if v_lat is None or v_lon is None:
                    continue
                for pid, pdata in self.PORTS.items():
                    bbox = pdata["bbox"]
                    lat_min = min(bbox[0][0], bbox[1][0])
                    lat_max = max(bbox[0][0], bbox[1][0])
                    lon_min = min(bbox[0][1], bbox[1][1])
                    lon_max = max(bbox[0][1], bbox[1][1])
                    if lat_min <= v_lat <= lat_max and lon_min <= v_lon <= lon_max:
                        port_vessels[pid].append(v)
                        break

            events_to_publish = []
            for pid, vessels_at_port in port_vessels.items():
                port_meta = self.PORTS[pid]
                anchored_vessels = [v for v in vessels_at_port if v.get("sog", 1.0) < 0.5]
                anchored_count = len(anchored_vessels)
                total_count = len(vessels_at_port)

                logger.debug(f"{port_meta['name']} status: {anchored_count} anchored, {total_count} total vessels")

                # If queue depth exceeds threshold, trigger warning
                if anchored_count >= 8:
                    severity = "critical" if anchored_count >= 15 else "high"
                    dedup_key = f"aisstream:queue_depth:{pid}:{current_hour}"
                    
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=3600)  # 1 hour dedup
                        
                        events_to_publish.append({
                            "source": self.source_name,
                            "event_type": "port_queue",
                            "severity": severity,
                            "lat": str(port_meta["center"]["lat"]),
                            "lon": str(port_meta["center"]["lon"]),
                            "title": f"Port Congestion Alert: {anchored_count} vessels waiting at {port_meta['name']}",
                            "raw": json.dumps({
                                "port_id": pid,
                                "port_name": port_meta["name"],
                                "total_vessels": total_count,
                                "anchored_vessels": anchored_count,
                                "vessel_details": [{"name": v["name"], "sog": v["sog"]} for v in anchored_vessels]
                            }),
                            "ts": now.isoformat(),
                            "dedup_key": dedup_key
                        })
            if events_to_publish:
                self.publish(events_to_publish)
                    
        except Exception as e:
            logger.error(f"Error in AIS queue processing: {e}", exc_info=True)


# =============================================================================
# SINGLETON ACCESSOR & PUBLIC EXPORTS
# =============================================================================

_GLOBAL_AIS_ADAPTER: Optional[AISstreamAdapter] = None


def get_aisstream_adapter() -> AISstreamAdapter:
    """Returns singleton AISstreamAdapter instance."""
    global _GLOBAL_AIS_ADAPTER
    if _GLOBAL_AIS_ADAPTER is None:
        _GLOBAL_AIS_ADAPTER = AISstreamAdapter()
    return _GLOBAL_AIS_ADAPTER


def get_live_ais_vessels() -> List[Dict[str, Any]]:
    """
    Returns live maritime vessels across Sumatra and Malacca Strait.
    Starts with the 96-vessel regional Sumatra fallback baseline and overlays/merges
    all active live AISStream vessels on top of it so live vessels enrich and expand
    the maritime fleet without ever discarding the Sumatra baseline.
    Every vessel includes current_coords: [round(lon, 4), round(lat, 4)] (p_curr).
    """
    adapter = get_aisstream_adapter()
    baseline_vessels = generate_sumatra_maritime_fallback()
    vessels_dict: Dict[str, Dict[str, Any]] = {
        str(v.get("mmsi") or v.get("vehicle_id")): dict(v)
        for v in baseline_vessels
    }

    # Overlay active live AISStream vessels on top of baseline
    for mmsi_key, live_v in adapter.vessels.items():
        v_key = str(live_v.get("mmsi") or mmsi_key)
        if v_key in vessels_dict:
            vessels_dict[v_key].update(live_v)
        else:
            vessels_dict[v_key] = dict(live_v)

    # Ensure every vessel object includes current_coords: [round(lon, 4), round(lat, 4)] (p_curr)
    result = []
    for v in vessels_dict.values():
        lat = v.get("lat")
        lon = v.get("lon")
        if lat is not None and lon is not None:
            v["current_coords"] = [round(float(lon), 4), round(float(lat), 4)]
        result.append(v)
    return result
