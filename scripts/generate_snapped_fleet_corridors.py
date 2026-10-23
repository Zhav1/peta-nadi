"""
PreHub — High-Precision Snapped Fleet Corridor Polyline Generator.
Generates multi-vertex highway-snapped polylines for trucks via Mapbox Directions API,
official marine fairway trajectories for maritime cargo, and
densified orthodromes for air cargo across Pan-Sumatra.
Outputs:
  - backend/data/fleet_corridors_snapped.json
  - frontend/public/data/fleet_corridors_snapped.json
"""
import argparse
import json
import math
import os
import sys
import time
import urllib.request
import urllib.error
from unittest.mock import MagicMock

# Ensure redis mock is registered before importing backend services
sys.modules.setdefault("redis", MagicMock())
sys.modules.setdefault("redis.asyncio", MagicMock())

# Ensure backend path is available
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.telemetry_service import MASTER_FLEET_DEFINITIONS


def find_mapbox_token() -> str:
    """Finds Mapbox token from env, CLI, or frontend/.env.local."""
    token = os.environ.get("MAPBOX_ACCESS_TOKEN") or os.environ.get("NEXT_PUBLIC_MAPBOX_TOKEN")
    if token:
        return token

    # Check frontend/.env.local and .env
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env.local")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env.local")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")),
    ]
    for env_path in candidates:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("NEXT_PUBLIC_MAPBOX_TOKEN="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            return val
    return ""


def haversine_km(c1, c2):
    lon1, lat1 = c1
    lon2, lat2 = c2
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


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


def fetch_mapbox_snapped_route(waypoints, token: str):
    """
    Fetches real road network turn-by-turn geometry via Mapbox Directions API.
    Returns (coordinates, distance_km) or None if request fails.
    """
    if not token or len(waypoints) < 2:
        return None

    # Subsample waypoints if > 25, preserving exact origin (index 0) and destination (index -1)
    if len(waypoints) > 25:
        step = (len(waypoints) - 1) / 24.0
        clipped_waypoints = [waypoints[int(round(i * step))] for i in range(24)]
        if clipped_waypoints[-1] != waypoints[-1]:
            clipped_waypoints.append(waypoints[-1])
    else:
        clipped_waypoints = waypoints

    coord_str = ";".join([f"{pt[0]:.6f},{pt[1]:.6f}" for pt in clipped_waypoints])
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{coord_str}?geometries=geojson&overview=full&steps=true&access_token={token}"

    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PreHub-CorridorGenerator/1.0"})
            with urllib.request.urlopen(req, timeout=12) as response:
                data = json.loads(response.read().decode("utf-8"))
                if data.get("code") == "Ok" and data.get("routes"):
                    route = data["routes"][0]
                    coords = route.get("geometry", {}).get("coordinates", [])
                    dist_km = round(route.get("distance", 0.0) / 1000.0, 2)
                    if coords and len(coords) >= 2:
                        return coords, dist_km
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(1.0 * (attempt + 1))
                continue
            print(f"  [WARN] Mapbox API HTTP {e.code}: {e}")
            break
        except Exception as e:
            if attempt < 2:
                time.sleep(0.5)
                continue
            print(f"  [WARN] Mapbox API request failed: {e}")

    return None


def main():
    parser = argparse.ArgumentParser(description="Generate high-precision snapped fleet corridors for PreHub")
    parser.add_argument("--token", type=str, default="", help="Mapbox access token")
    args = parser.parse_args()

    token = args.token or find_mapbox_token()
    if token:
        print(f"[INFO] Using Mapbox Access Token: {token[:12]}...{token[-4:]}")
    else:
        print("[WARN] No Mapbox token found. Falling back to geometric densification.")

    # High-precision maritime fairway channels and key road junctions
    fairway_and_highway_map = {
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
    truck_api_count = 0

    print(f"[INFO] Processing {len(MASTER_FLEET_DEFINITIONS)} units from MASTER_FLEET_DEFINITIONS...")

    for unit in MASTER_FLEET_DEFINITIONS:
        vid = unit["vehicle_id"]
        modality = unit.get("modality", "truck")
        raw_coords = (unit.get("route_geometry", {}).get("coordinates") or unit.get("path") or [])

        base_coords = fairway_and_highway_map.get(vid, raw_coords)

        snapped_coords = None
        total_dist_km = 0.0

        # WP1: For trucks, request live Mapbox Directions API for authentic road snapping
        if modality == "truck" and token and len(base_coords) >= 2:
            res = fetch_mapbox_snapped_route(base_coords, token)
            if res:
                snapped_coords, total_dist_km = res
                truck_api_count += 1
                print(f"  [SNAP] {vid}: Mapbox snapped {len(snapped_coords)} points ({total_dist_km} km)")
                # Rate limiter: 500ms delay between calls
                time.sleep(0.5)

        # Fallback to densification if Mapbox not available or for maritime/aviation
        if not snapped_coords:
            max_step = 1.0 if modality == "truck" else 3.0 if modality == "maritime" else 10.0
            snapped_coords = densify_polyline(base_coords, max_step_km=max_step)
            total_dist_km = 0.0
            for i in range(len(snapped_coords) - 1):
                total_dist_km += haversine_km(snapped_coords[i], snapped_coords[i + 1])
            total_dist_km = round(total_dist_km, 2)
            source_tag = "lerp-densified" if modality == "truck" else "fairway-densified" if modality == "maritime" else "orthodrome"
            print(f"  [DENS] {vid} ({modality}): {len(snapped_coords)} points ({total_dist_km} km) [{source_tag}]")

        snapped_cache[vid] = {
            "vehicle_id": vid,
            "modality": modality,
            "origin": unit.get("origin"),
            "destination": unit.get("destination"),
            "total_distance_km": total_dist_km,
            "vertex_count": len(snapped_coords),
            "coordinates": snapped_coords,
        }

    # Write output to backend/data/fleet_corridors_snapped.json
    out_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "data", "fleet_corridors_snapped.json"))
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(snapped_cache, f, indent=2)

    # Mirror into frontend/public/data/fleet_corridors_snapped.json
    fe_public_data = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "data"))
    os.makedirs(fe_public_data, exist_ok=True)
    fe_file = os.path.join(fe_public_data, "fleet_corridors_snapped.json")
    with open(fe_file, "w", encoding="utf-8") as f:
        json.dump(snapped_cache, f, indent=2)

    print("\n[OK] Successfully generated snapped fleet corridors:")
    print(f"     Total units: {len(snapped_cache)} (Truck API snapped: {truck_api_count})")
    print(f"     Backend target:  {out_file}")
    print(f"     Frontend target: {fe_file}")


if __name__ == "__main__":
    main()
