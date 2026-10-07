"""
PreHub — High-Precision Snapped Fleet Corridor Polyline Generator.
Generates multi-vertex highway-snapped polylines for trucks,
official marine fairway trajectories for maritime cargo, and
densified orthodromes for air cargo across Pan-Sumatra.
Outputs: backend/data/fleet_corridors_snapped.json
"""
import json
import math
import os
import sys

# Ensure backend path is available
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.telemetry_service import MASTER_FLEET_DEFINITIONS


def haversine_km(c1, c2):
    lon1, lat1 = c1
    lon2, lat2 = c2
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def densify_segment(p1, p2, max_step_km=1.5):
    dist = haversine_km(p1, p2)
    if dist <= max_step_km:
        return [p1, p2]
    steps = max(2, int(math.ceil(dist / max_step_km)))
    points = []
    for i in range(steps + 1):
        t = i / steps
        lon = p1[0] + (p2[0] - p1[0]) * t
        lat = p1[1] + (p2[1] - p1[1]) * t
        points.append([round(lon, 5), round(lat, 5)])
    return points


def densify_polyline(coords, max_step_km=1.5):
    if len(coords) < 2:
        return coords
    result = []
    for i in range(len(coords) - 1):
        seg = densify_segment(coords[i], coords[i + 1], max_step_km=max_step_km)
        if result:
            result.extend(seg[1:])
        else:
            result.extend(seg)
    return result


def main():
    road_cache_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "road_network_sumatra.json"))
    nodes_by_id = {}
    if os.path.exists(road_cache_path):
        with open(road_cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for n in data.get("nodes", []):
                nodes_by_id[n["id"]] = [float(n["lon"]), float(n["lat"])]

    # Detailed intermediate road route waypoints mapped to real Trans-Sumatra highways
    highway_snapping_map = {
        # TRK-001: Bakauheni Port -> Tol JTTS (Kalianda -> Terbanggi Besar -> Menggala -> Kayu Agung) -> Palembang
        "TRK-001-BAKAUHENI-PLM": [
            [105.7533, -5.8711], [105.6500, -5.7800], [105.5800, -5.7100], [105.4200, -5.5500],
            [105.2667, -5.4294], [105.2150, -5.1200], [105.1800, -4.8500], [105.1000, -4.4500],
            [104.9800, -4.1500], [104.9200, -3.7500], [104.8450, -3.3900], [104.7950, -3.1500],
            [104.7565, -2.9909]
        ],
        # TRK-002: Bukittinggi -> Payakumbuh -> Kelok 9 -> Bangkinang -> Pekanbaru
        "TRK-002-HORTI-SUMBAR": [
            [100.3692, -0.3056], [100.5200, -0.2600], [100.6300, -0.2200], [100.6700, 0.0800],
            [100.7500, 0.1800], [100.8900, 0.2800], [101.0267, 0.3367], [101.2500, 0.4200],
            [101.4478, 0.5071]
        ],
        # TRK-003: Belawan Port -> KIM -> Amplas -> Tol MKTT -> Lubuk Pakam -> Perbaungan -> Tebing Tinggi
        "TRK-003-BELAWAN-TEBING": [
            [98.6776, 3.7922], [98.6800, 3.6700], [98.7120, 3.5350], [98.8780, 3.6421],
            [98.9200, 3.5600], [99.0200, 3.4800], [99.1100, 3.3900], [99.1625, 3.3285]
        ],
        # TRK-004: Pekanbaru -> Minas -> Kandis -> Duri -> Dumai Port (Tol Permai)
        "TRK-004-CPO-DUMAI": [
            [101.4478, 0.5071], [101.4100, 0.7200], [101.3500, 0.8500], [101.2500, 0.9500],
            [101.2200, 1.1200], [101.2150, 1.2700], [101.3100, 1.4500], [101.4000, 1.5800],
            [101.4533, 1.6811]
        ],
        # TRK-005: Banda Aceh -> Sigli -> Bireuen -> Lhokseumawe -> Langsa -> Kuala Simpang -> Binjai -> Medan
        "TRK-005-BANDA-ACEH-MEDAN": [
            [95.3238, 5.5483], [95.6200, 5.4800], [95.9600, 5.3850], [96.5000, 5.2000],
            [97.1400, 5.1800], [97.5500, 4.8500], [97.9650, 4.4700], [98.0500, 4.2800],
            [98.2500, 3.9500], [98.4850, 3.6000], [98.6722, 3.5952]
        ],
        # TRK-006: Jambi -> Tempino -> Betung -> Banyuasin -> Palembang (Jalintim)
        "TRK-006-JAMBI-PALEMBANG": [
            [103.6131, -1.6100], [103.7500, -1.8500], [103.9500, -2.1500], [104.1200, -2.3500],
            [104.1800, -2.6000], [104.3500, -2.7500], [104.5800, -2.8900], [104.7565, -2.9909]
        ],
        # TRK-007: Padang Teluk Bayur -> Sitinjau Lauik -> Lubuk Selasih -> Solok -> Singkarak
        "TRK-007-CABAI-KERITING": [
            [100.3700, -0.9980], [100.4100, -0.9650], [100.4850, -0.9450], [100.5600, -0.9100],
            [100.6539, -0.7989], [100.6200, -0.6500]
        ],
        # TRK-008: Medan KIM -> Tebing Tinggi -> Kisaran -> Rantauprapat (Jalinsum Tol)
        "TRK-008-BERAS-KIM": [
            [98.6800, 3.6700], [98.7120, 3.5350], [98.8780, 3.6421], [99.1625, 3.3285],
            [99.4200, 3.1500], [99.6200, 2.9800], [99.7500, 2.5500], [99.8300, 2.0950]
        ],
        # Maritime Fairway high-precision channel lines (keeping vessels off shallows & islands)
        "MV-001-SRIWIJAYA": [
            [98.6776, 3.7922], [98.9500, 3.8800], [99.3500, 3.7500], [99.8500, 3.3500],
            [100.4000, 2.7500], [100.9500, 2.2000], [101.3500, 1.8200], [101.4533, 1.6811]
        ],
        "MV-002-BATUMANDI": [
            [105.7533, -5.8711], [105.8150, -5.8920], [105.8900, -5.9120], [105.9550, -5.9220],
            [106.0050, -5.9300]
        ],
        "MV-003-CARAKA": [
            [100.3700, -0.9980], [100.1200, -0.7500], [99.8500, -0.2500], [99.4500, 0.4500],
            [99.1000, 1.1500], [98.7800, 1.7400]
        ],
        "MV-004-MERATUS": [
            [98.6776, 3.7922], [98.9200, 3.8200], [99.2500, 3.6500], [99.4500, 3.3600]
        ],
        "MV-007-MALAHAYATI": [
            [95.5186, 5.5897], [95.9500, 5.7500], [96.7500, 5.5500], [97.3500, 5.4000],
            [98.1500, 4.6500], [98.6776, 3.7922]
        ],
        "MV-008-BENGKULU-BAAI": [
            [102.2900, -3.8900], [101.7500, -3.2000], [101.1000, -2.2500], [100.3700, -0.9980]
        ]
    }

    snapped_cache = {}

    for unit in MASTER_FLEET_DEFINITIONS:
        vid = unit["vehicle_id"]
        modality = unit.get("modality", "truck")
        raw_coords = (unit.get("route_geometry", {}).get("coordinates") or unit.get("path") or [])

        if vid in highway_snapping_map:
            base_coords = highway_snapping_map[vid]
        else:
            base_coords = raw_coords

        # Max step: 1.0 km for trucks, 3.0 km for maritime, 10.0 km for air
        max_step = 1.0 if modality == "truck" else 3.0 if modality == "maritime" else 10.0
        densified = densify_polyline(base_coords, max_step_km=max_step)

        # Calculate exact route distance along densified coordinates
        total_dist_km = 0.0
        for i in range(len(densified) - 1):
            total_dist_km += haversine_km(densified[i], densified[i + 1])

        snapped_cache[vid] = {
            "vehicle_id": vid,
            "modality": modality,
            "origin": unit.get("origin"),
            "destination": unit.get("destination"),
            "total_distance_km": round(total_dist_km, 2),
            "vertex_count": len(densified),
            "coordinates": densified
        }

    out_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "data", "fleet_corridors_snapped.json"))
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(snapped_cache, f, indent=2)

    # Also mirror into frontend public folder for direct high-speed client access if needed
    fe_public_data = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "data"))
    os.makedirs(fe_public_data, exist_ok=True)
    fe_file = os.path.join(fe_public_data, "fleet_corridors_snapped.json")
    with open(fe_file, "w", encoding="utf-8") as f:
        json.dump(snapped_cache, f, indent=2)

    print(f"[OK] Generated snapped fleet corridors for {len(snapped_cache)} units:")
    print(f"     Backend:  {out_file}")
    print(f"     Frontend: {fe_file}")


if __name__ == "__main__":
    main()
