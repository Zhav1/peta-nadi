"""
Spatial Incident Fusion Engine (Phase 179 - Realtime Fusion Early Warning)
Deterministic H3 res-8 (~460m edge) spatial grid indexer, localized footprint builder,
Sumatra gazetteer resolver, and multi-source authority tiering (CONFIRMED / WATCH).
"""
from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Check if h3 library is available
try:
    import h3
    _HAS_H3 = True
except ImportError:
    _HAS_H3 = False

# ---------------------------------------------------------------------------
# 1. Deterministic H3 Res-8 Indexer (~460m Edge Resolution)
# ---------------------------------------------------------------------------

HEX8_EDGE_METERS = 460.0
# At equator: 1 deg lat = 111,320m
METERS_PER_DEG_LAT = 111320.0


def lat_lon_to_hex8(lat: float, lon: float) -> str:
    """Indexes a lat/lon coordinate to an H3 res-8 cell ID (~460m edge).
    
    Uses `h3` if installed, otherwise uses pure-Python axial hexagonal projection
    with identical ~460m cell sizing, avoiding C-compiler fragility.
    """
    if _HAS_H3:
        try:
            if hasattr(h3, "latlng_to_cell"):
                return h3.latlng_to_cell(lat, lon, 8)
            elif hasattr(h3, "geo_to_h3"):
                return h3.geo_to_h3(lat, lon, 8)
        except Exception:
            pass

    # Pure-Python Pointy-Top Hexagonal Axial Grid
    # Project (lat, lon) to local planar meters
    rad_lat = math.radians(lat)
    cos_lat = max(0.1, math.cos(rad_lat))
    x = lon * METERS_PER_DEG_LAT * cos_lat
    y = lat * METERS_PER_DEG_LAT

    # Axial coordinates (q, r)
    size = HEX8_EDGE_METERS
    q = (math.sqrt(3.0) / 3.0 * x - 1.0 / 3.0 * y) / size
    r = (2.0 / 3.0 * y) / size

    # Cube rounding
    x_c = q
    z_c = r
    y_c = -x_c - z_c

    rx = round(x_c)
    ry = round(y_c)
    rz = round(z_c)

    x_diff = abs(rx - x_c)
    y_diff = abs(ry - y_c)
    z_diff = abs(rz - z_c)

    if x_diff > y_diff and x_diff > z_diff:
        rx = -ry - rz
    elif y_diff > z_diff:
        ry = -rx - rz
    else:
        rz = -rx - ry

    return f"hex8_{rx}_{rz}"


def hex8_ring1(cell_id: str) -> Set[str]:
    """Returns the set containing cell_id and its 6 immediate neighbors (7 cells total)."""
    if _HAS_H3 and not cell_id.startswith("hex8_"):
        try:
            if hasattr(h3, "grid_disk"):
                return set(h3.grid_disk(cell_id, 1))
            elif hasattr(h3, "k_ring"):
                return set(h3.k_ring(cell_id, 1))
        except Exception:
            pass

    if cell_id.startswith("hex8_"):
        try:
            parts = cell_id.split("_")
            q = int(parts[1])
            r = int(parts[2])
            # 6 axial directions in pointy-top hex grid + center
            axial_dirs = [(0, 0), (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
            return {f"hex8_{q + dq}_{r + dr}" for dq, dr in axial_dirs}
        except Exception:
            return {cell_id}

    return {cell_id}


def polygon_to_hex8_cells(
    geojson_geom: Optional[Dict[str, Any]],
    centroid_lat: Optional[float] = None,
    centroid_lon: Optional[float] = None,
) -> Set[str]:
    """Extracts the set of H3 res-8 cells touched by a geometry or its centroid."""
    cells: Set[str] = set()

    c_lat = centroid_lat
    c_lon = centroid_lon

    if geojson_geom and isinstance(geojson_geom, dict):
        g_type = geojson_geom.get("type", "")
        coords = geojson_geom.get("coordinates", [])

        if g_type == "Point" and coords and len(coords) >= 2:
            c_lon = float(coords[0])
            c_lat = float(coords[1])
        elif g_type in ("Polygon", "MultiPolygon") and coords:
            # Flatten to points list
            all_pts: List[Tuple[float, float]] = []
            if g_type == "Polygon" and len(coords) > 0:
                for pt in coords[0]:
                    if len(pt) >= 2:
                        all_pts.append((float(pt[0]), float(pt[1])))
            elif g_type == "MultiPolygon":
                for poly in coords:
                    if poly and len(poly) > 0:
                        for pt in poly[0]:
                            if len(pt) >= 2:
                                all_pts.append((float(pt[0]), float(pt[1])))

            if all_pts:
                if c_lat is None or c_lon is None:
                    c_lon = sum(p[0] for p in all_pts) / len(all_pts)
                    c_lat = sum(p[1] for p in all_pts) / len(all_pts)

                for p_lon, p_lat in all_pts:
                    cells.add(lat_lon_to_hex8(p_lat, p_lon))

                # If bounding box is compact, sample interior points
                min_lon = min(p[0] for p in all_pts)
                max_lon = max(p[0] for p in all_pts)
                min_lat = min(p[1] for p in all_pts)
                max_lat = max(p[1] for p in all_pts)

                delta_lon = max_lon - min_lon
                delta_lat = max_lat - min_lat
                if delta_lat <= 0.25 and delta_lon <= 0.25:
                    step = 0.005  # ~500m
                    curr_lat = min_lat
                    while curr_lat <= max_lat:
                        curr_lon = min_lon
                        while curr_lon <= max_lon:
                            cells.add(lat_lon_to_hex8(curr_lat, curr_lon))
                            curr_lon += step
                        curr_lat += step

    if c_lat is not None and c_lon is not None:
        center_cell = lat_lon_to_hex8(c_lat, c_lon)
        cells.update(hex8_ring1(center_cell))

    return cells


# ---------------------------------------------------------------------------
# 2. Sumatra Kecamatan/Kabupaten Logistics Gazetteer
# ---------------------------------------------------------------------------

SUMATRA_GAZETTEER: Dict[str, Dict[str, Any]] = {
    # North Sumatra (Sumut) & Medan Metro
    "medan": {"lat": 3.5952, "lon": 98.6722, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Utara"},
    "belawan": {"lat": 3.7944, "lon": 98.6913, "bbox_radius_m": 450, "type": "port", "province": "Sumatera Utara"},
    "medan belawan": {"lat": 3.7750, "lon": 98.6830, "bbox_radius_m": 450, "type": "kecamatan", "province": "Sumatera Utara"},
    "medan deli": {"lat": 3.6550, "lon": 98.6680, "bbox_radius_m": 450, "type": "kecamatan", "province": "Sumatera Utara"},
    "medan labuhan": {"lat": 3.7330, "lon": 98.6780, "bbox_radius_m": 450, "type": "kecamatan", "province": "Sumatera Utara"},
    "medan amplas": {"lat": 3.5380, "lon": 98.7120, "bbox_radius_m": 450, "type": "kecamatan", "province": "Sumatera Utara"},
    "medan marelan": {"lat": 3.7020, "lon": 98.6600, "bbox_radius_m": 450, "type": "kecamatan", "province": "Sumatera Utara"},
    "deli serdang": {"lat": 3.5852, "lon": 98.6756, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "tanjung morawa": {"lat": 3.5280, "lon": 98.7840, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Utara"},
    "percut sei tuan": {"lat": 3.6280, "lon": 98.7560, "bbox_radius_m": 450, "type": "kecamatan", "province": "Sumatera Utara"},
    "binjai": {"lat": 3.6001, "lon": 98.4854, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Utara"},
    "stabat": {"lat": 3.7431, "lon": 98.4514, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Utara"},
    "langkat": {"lat": 3.7431, "lon": 98.4514, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "serdang bedagai": {"lat": 3.4862, "lon": 99.1128, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "sei rampah": {"lat": 3.4862, "lon": 99.1128, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Utara"},
    "tebing tinggi": {"lat": 3.3285, "lon": 99.1625, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Utara"},
    "pematangsiantar": {"lat": 2.9591, "lon": 99.0687, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Utara"},
    "simalungun": {"lat": 2.9591, "lon": 99.0687, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "kisaran": {"lat": 2.9839, "lon": 99.6272, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Utara"},
    "asahan": {"lat": 2.9839, "lon": 99.6272, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "rantauprapat": {"lat": 2.0950, "lon": 99.8290, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Utara"},
    "labuhanbatu": {"lat": 2.0950, "lon": 99.8290, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "sibolga": {"lat": 1.7426, "lon": 98.7792, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Utara"},
    "tapanuli tengah": {"lat": 1.7426, "lon": 98.7792, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "tapanuli selatan": {"lat": 1.5167, "lon": 99.2500, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "tapanuli utara": {"lat": 2.0167, "lon": 98.9667, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "tarutung": {"lat": 2.0167, "lon": 98.9667, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Utara"},
    "batang toru": {"lat": 1.4889, "lon": 99.0650, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Utara"},
    "mandailing natal": {"lat": 0.8500, "lon": 99.5500, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Utara"},
    "padang sidempuan": {"lat": 1.3734, "lon": 99.2734, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Utara"},
    "bukit barisan": {"lat": -0.4500, "lon": 100.4000, "bbox_radius_m": 800, "type": "corridor", "province": "Sumatera Barat"},

    # Aceh
    "banda aceh": {"lat": 5.5483, "lon": 95.3238, "bbox_radius_m": 800, "type": "city", "province": "Aceh"},
    "aceh besar": {"lat": 5.4167, "lon": 95.5167, "bbox_radius_m": 800, "type": "regency", "province": "Aceh"},
    "pidie": {"lat": 5.3833, "lon": 95.9667, "bbox_radius_m": 800, "type": "regency", "province": "Aceh"},
    "sigli": {"lat": 5.3833, "lon": 95.9667, "bbox_radius_m": 450, "type": "chokepoint", "province": "Aceh"},
    "bireuen": {"lat": 5.2000, "lon": 96.7000, "bbox_radius_m": 800, "type": "regency", "province": "Aceh"},
    "lhokseumawe": {"lat": 5.1801, "lon": 97.1407, "bbox_radius_m": 800, "type": "city", "province": "Aceh"},
    "aceh utara": {"lat": 5.0500, "lon": 97.2500, "bbox_radius_m": 800, "type": "regency", "province": "Aceh"},
    "langsa": {"lat": 4.4744, "lon": 97.9658, "bbox_radius_m": 800, "type": "city", "province": "Aceh"},
    "aceh tamiang": {"lat": 4.3500, "lon": 98.0500, "bbox_radius_m": 800, "type": "regency", "province": "Aceh"},
    "kuala simpang": {"lat": 4.2861, "lon": 98.0558, "bbox_radius_m": 450, "type": "chokepoint", "province": "Aceh"},
    "meulaboh": {"lat": 4.1447, "lon": 96.1285, "bbox_radius_m": 450, "type": "port", "province": "Aceh"},
    "subulussalam": {"lat": 2.6394, "lon": 98.0053, "bbox_radius_m": 800, "type": "city", "province": "Aceh"},

    # Riau
    "pekanbaru": {"lat": 0.5071, "lon": 101.4478, "bbox_radius_m": 800, "type": "city", "province": "Riau"},
    "dumai": {"lat": 1.6700, "lon": 101.4500, "bbox_radius_m": 800, "type": "city", "province": "Riau"},
    "siak": {"lat": 0.8000, "lon": 101.9833, "bbox_radius_m": 800, "type": "regency", "province": "Riau"},
    "kampar": {"lat": 0.3333, "lon": 101.0333, "bbox_radius_m": 800, "type": "regency", "province": "Riau"},
    "bangkinang": {"lat": 0.3333, "lon": 101.0333, "bbox_radius_m": 450, "type": "chokepoint", "province": "Riau"},
    "pelalawan": {"lat": 0.3333, "lon": 101.9000, "bbox_radius_m": 800, "type": "regency", "province": "Riau"},
    "pangkalan kerinci": {"lat": 0.3333, "lon": 101.9000, "bbox_radius_m": 450, "type": "chokepoint", "province": "Riau"},
    "indragiri hulu": {"lat": -0.5500, "lon": 102.3167, "bbox_radius_m": 800, "type": "regency", "province": "Riau"},
    "rengat": {"lat": -0.3833, "lon": 102.5500, "bbox_radius_m": 450, "type": "chokepoint", "province": "Riau"},
    "bengkalis": {"lat": 1.4667, "lon": 102.1333, "bbox_radius_m": 800, "type": "regency", "province": "Riau"},
    "rokan hilir": {"lat": 2.1667, "lon": 100.8333, "bbox_radius_m": 800, "type": "regency", "province": "Riau"},

    # West Sumatra (Sumbar)
    "padang": {"lat": -0.9471, "lon": 100.4172, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Barat"},
    "bukittinggi": {"lat": -0.3056, "lon": 100.3692, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Barat"},
    "padang panjang": {"lat": -0.4639, "lon": 100.4417, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Barat"},
    "agam": {"lat": -0.2500, "lon": 100.1667, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Barat"},
    "tanah datar": {"lat": -0.4500, "lon": 100.5833, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Barat"},
    "lembah anai": {"lat": -0.4850, "lon": 100.3550, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Barat"},
    "solok": {"lat": -0.7983, "lon": 100.6539, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Barat"},
    "payakumbuh": {"lat": -0.2244, "lon": 100.6308, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Barat"},
    "pariaman": {"lat": -0.6264, "lon": 100.1206, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Barat"},
    "pesisir selatan": {"lat": -1.3500, "lon": 100.5667, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Barat"},
    "teluk bayur": {"lat": -0.9992, "lon": 100.3800, "bbox_radius_m": 450, "type": "port", "province": "Sumatera Barat"},

    # Jambi
    "jambi": {"lat": -1.6101, "lon": 103.6131, "bbox_radius_m": 800, "type": "city", "province": "Jambi"},
    "muaro jambi": {"lat": -1.5833, "lon": 103.8000, "bbox_radius_m": 800, "type": "regency", "province": "Jambi"},
    "batanghari": {"lat": -1.7500, "lon": 103.1167, "bbox_radius_m": 800, "type": "regency", "province": "Jambi"},
    "bungo": {"lat": -1.5000, "lon": 101.9667, "bbox_radius_m": 800, "type": "regency", "province": "Jambi"},
    "sarolangun": {"lat": -2.3000, "lon": 102.6500, "bbox_radius_m": 800, "type": "regency", "province": "Jambi"},

    # South Sumatra (Sumsel)
    "palembang": {"lat": -2.9761, "lon": 104.7754, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Selatan"},
    "banyuasin": {"lat": -2.8833, "lon": 104.3833, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Selatan"},
    "ogan ilir": {"lat": -3.4333, "lon": 104.6500, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Selatan"},
    "indralaya": {"lat": -3.2333, "lon": 104.6500, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Selatan"},
    "ogan komering ilir": {"lat": -3.3833, "lon": 104.8667, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Selatan"},
    "kayuagung": {"lat": -3.3833, "lon": 104.8667, "bbox_radius_m": 450, "type": "chokepoint", "province": "Sumatera Selatan"},
    "prabumulih": {"lat": -3.4300, "lon": 104.2300, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Selatan"},
    "muara enim": {"lat": -3.6500, "lon": 103.7833, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Selatan"},
    "lahat": {"lat": -3.7833, "lon": 103.5333, "bbox_radius_m": 800, "type": "regency", "province": "Sumatera Selatan"},
    "lubuklinggau": {"lat": -3.2936, "lon": 102.8611, "bbox_radius_m": 800, "type": "city", "province": "Sumatera Selatan"},

    # Bengkulu
    "bengkulu": {"lat": -3.8004, "lon": 102.2655, "bbox_radius_m": 800, "type": "city", "province": "Bengkulu"},
    "curup": {"lat": -3.4700, "lon": 102.5200, "bbox_radius_m": 450, "type": "chokepoint", "province": "Bengkulu"},

    # Lampung
    "bandar lampung": {"lat": -5.4500, "lon": 105.2667, "bbox_radius_m": 800, "type": "city", "province": "Lampung"},
    "lampung selatan": {"lat": -5.7333, "lon": 105.5833, "bbox_radius_m": 800, "type": "regency", "province": "Lampung"},
    "bakauheni": {"lat": -5.8672, "lon": 105.7533, "bbox_radius_m": 450, "type": "port", "province": "Lampung"},
    "kalianda": {"lat": -5.7333, "lon": 105.5833, "bbox_radius_m": 450, "type": "chokepoint", "province": "Lampung"},
    "terbanggi besar": {"lat": -4.8833, "lon": 105.2167, "bbox_radius_m": 450, "type": "chokepoint", "province": "Lampung"},
    "lampung tengah": {"lat": -4.8833, "lon": 105.2167, "bbox_radius_m": 800, "type": "regency", "province": "Lampung"},
    "metro": {"lat": -5.1136, "lon": 105.3069, "bbox_radius_m": 800, "type": "city", "province": "Lampung"},
    "kotabumi": {"lat": -4.8167, "lon": 104.8833, "bbox_radius_m": 450, "type": "chokepoint", "province": "Lampung"},

    # Riau Islands (Kepri) & Bangka Belitung
    "batam": {"lat": 1.1301, "lon": 104.0529, "bbox_radius_m": 800, "type": "city", "province": "Kepulauan Riau"},
    "bintan": {"lat": 1.0000, "lon": 104.5000, "bbox_radius_m": 800, "type": "regency", "province": "Kepulauan Riau"},
    "tanjung pinang": {"lat": 0.9167, "lon": 104.4500, "bbox_radius_m": 800, "type": "city", "province": "Kepulauan Riau"},
    "pangkal pinang": {"lat": -2.1290, "lon": 106.1139, "bbox_radius_m": 800, "type": "city", "province": "Bangka Belitung"},
    "pangkalpinang": {"lat": -2.1290, "lon": 106.1139, "bbox_radius_m": 800, "type": "city", "province": "Bangka Belitung"},
}

# Sorted lookup keys (longest keys first for substring / regex resolution)
_SORTED_GAZETTEER_KEYS = sorted(SUMATRA_GAZETTEER.keys(), key=lambda k: len(k), reverse=True)


def resolve_sumatra_location(text_or_article: Any) -> Optional[Dict[str, Any]]:
    """Resolves coordinates and localized radius for a Sumatra location.
    
    Accepts an article dict (inspecting coordinates, location fields, title, summary)
    or a raw string. Returns dict with {lat, lon, name, radius_m} or None.
    """
    if not text_or_article:
        return None

    if isinstance(text_or_article, dict):
        # 1. Check direct coordinates if inside Sumatra bounds
        lat = text_or_article.get("lat") or text_or_article.get("latitude")
        lon = text_or_article.get("lon") or text_or_article.get("longitude")
        if lat is not None and lon is not None:
            try:
                f_lat = float(lat)
                f_lon = float(lon)
                if -6.5 <= f_lat <= 6.5 and 94.0 <= f_lon <= 109.0:
                    name = (
                        text_or_article.get("verified_sumatra_location")
                        or text_or_article.get("location")
                        or text_or_article.get("title")
                        or "Sumatra Verified Location"
                    )
                    return {
                        "lat": f_lat,
                        "lon": f_lon,
                        "name": str(name),
                        "radius_m": 450,
                    }
            except (ValueError, TypeError):
                pass

        # 2. Check dedicated location fields
        for field in (
            "verified_sumatra_location",
            "location",
            "kecamatan",
            "kabupaten",
            "city",
            "regency",
            "corridor_segment",
        ):
            val = text_or_article.get(field)
            if val and isinstance(val, str):
                res = resolve_sumatra_location(val)
                if res:
                    return res

        # 3. Check corridor_nodes list
        nodes = text_or_article.get("corridor_nodes")
        if isinstance(nodes, list):
            for n in nodes:
                if isinstance(n, str):
                    res = resolve_sumatra_location(n)
                    if res:
                        return res

        # 4. Check title and description
        text = " ".join([
            str(text_or_article.get("title") or ""),
            str(text_or_article.get("summary") or ""),
            str(text_or_article.get("raw_description") or ""),
        ])
        return resolve_sumatra_location(text)

    elif isinstance(text_or_article, str):
        query = text_or_article.lower()
        for key in _SORTED_GAZETTEER_KEYS:
            pattern = r"\b" + re.escape(key) + r"\b"
            if re.search(pattern, query):
                item = SUMATRA_GAZETTEER[key]
                return {
                    "lat": item["lat"],
                    "lon": item["lon"],
                    "name": key.title(),
                    "radius_m": item["bbox_radius_m"],
                    "province": item.get("province"),
                }

    return None


# ---------------------------------------------------------------------------
# 3. Evidence-Based Localized Footprint Builder
# ---------------------------------------------------------------------------

def make_point_buffer_polygon(lat: float, lon: float, radius_m: float, num_points: int = 16) -> Dict[str, Any]:
    """Generates an explicit GeoJSON Polygon (16-point circle approximation)."""
    r_lat = radius_m / METERS_PER_DEG_LAT
    cos_lat = max(0.1, math.cos(math.radians(lat)))
    r_lon = radius_m / (METERS_PER_DEG_LAT * cos_lat)

    coordinates: List[List[float]] = []
    for i in range(num_points):
        angle = 2.0 * math.pi * i / num_points
        p_lat = round(lat + r_lat * math.sin(angle), 6)
        p_lon = round(lon + r_lon * math.cos(angle), 6)
        coordinates.append([p_lon, p_lat])
    coordinates.append(coordinates[0])

    return {
        "type": "Polygon",
        "coordinates": [coordinates],
    }


def build_signal_geometry(signal: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Builds a realistic, localized GeoJSON polygon for a raw signal.
    
    NEVER generates 15-35 km circles.
    - bmkg_cap: official polygon if <=2500 km²; else 1200m buffer around centroid.
    - petabencana: RW/kelurahan polygon if present, else 300m localized buffer.
    - firms: 375m square polygon around pixel.
    - tomtom: 250m corridor envelope.
    - news: 450m localized polygon around resolved coordinates, or None.
    - gdacs: 1500m (flood/slide) or 3000m (M>=5.0 eq).
    """
    if not isinstance(signal, dict):
        return None

    src = str(signal.get("source") or "").lower()

    # Extract coordinates
    lat = signal.get("lat") or signal.get("latitude")
    lon = signal.get("lon") or signal.get("longitude")
    if lat is None or lon is None:
        center = signal.get("center")
        if isinstance(center, dict):
            lat = center.get("lat")
            lon = center.get("lon")

    # If coordinates are missing, attempt gazetteer resolution
    if (lat is None or lon is None) and (src == "news" or not src):
        resolved = resolve_sumatra_location(signal)
        if resolved:
            lat = resolved["lat"]
            lon = resolved["lon"]
            signal["lat"] = lat
            signal["lon"] = lon

    if lat is None or lon is None:
        # Check if existing polygon is already present
        geom = signal.get("geometry")
        if isinstance(geom, dict) and geom.get("type") in ("Polygon", "MultiPolygon"):
            return geom
        return None

    try:
        f_lat = float(lat)
        f_lon = float(lon)
    except (ValueError, TypeError):
        return None

    # Source-specific rules
    if src == "bmkg_cap":
        raw_geom = signal.get("geometry") or signal.get("affected_area")
        if isinstance(raw_geom, dict) and raw_geom.get("type") in ("Polygon", "MultiPolygon"):
            coords = raw_geom.get("coordinates")
            if coords and isinstance(coords, list):
                # Calculate approx bounding box area
                all_pts: List[Tuple[float, float]] = []
                if raw_geom.get("type") == "Polygon" and len(coords) > 0:
                    all_pts = [(p[0], p[1]) for p in coords[0] if len(p) >= 2]
                elif raw_geom.get("type") == "MultiPolygon":
                    for p_arr in coords:
                        if p_arr and len(p_arr) > 0:
                            all_pts.extend([(p[0], p[1]) for p in p_arr[0] if len(p) >= 2])
                if all_pts:
                    min_lon = min(p[0] for p in all_pts)
                    max_lon = max(p[0] for p in all_pts)
                    min_lat = min(p[1] for p in all_pts)
                    max_lat = max(p[1] for p in all_pts)
                    w_km = (max_lon - min_lon) * 111.32 * max(0.1, math.cos(math.radians(f_lat)))
                    h_km = (max_lat - min_lat) * 111.32
                    if (w_km * h_km) <= 2500.0:
                        return raw_geom
        return make_point_buffer_polygon(f_lat, f_lon, radius_m=1200.0)

    elif src == "petabencana":
        raw_geom = signal.get("geometry")
        if isinstance(raw_geom, dict) and raw_geom.get("type") in ("Polygon", "MultiPolygon"):
            return raw_geom
        return make_point_buffer_polygon(f_lat, f_lon, radius_m=300.0)

    elif src == "firms":
        # 375m VIIRS pixel (~ ±0.0017 deg)
        d = 0.0017
        ring = [
            [round(f_lon - d, 6), round(f_lat - d, 6)],
            [round(f_lon + d, 6), round(f_lat - d, 6)],
            [round(f_lon + d, 6), round(f_lat + d, 6)],
            [round(f_lon - d, 6), round(f_lat + d, 6)],
            [round(f_lon - d, 6), round(f_lat - d, 6)],
        ]
        return {"type": "Polygon", "coordinates": [ring]}

    elif src == "tomtom":
        raw_geom = signal.get("geometry")
        if isinstance(raw_geom, dict) and raw_geom.get("type") == "LineString":
            line_coords = raw_geom.get("coordinates")
            if line_coords and len(line_coords) >= 2:
                # Envelope around line points (±0.0011 deg ~ 125m on either side)
                d = 0.0011
                all_lons = [p[0] for p in line_coords]
                all_lats = [p[1] for p in line_coords]
                min_x, max_x = min(all_lons) - d, max(all_lons) + d
                min_y, max_y = min(all_lats) - d, max(all_lats) + d
                return {
                    "type": "Polygon",
                    "coordinates": [[
                        [round(min_x, 6), round(min_y, 6)],
                        [round(max_x, 6), round(min_y, 6)],
                        [round(max_x, 6), round(max_y, 6)],
                        [round(min_x, 6), round(max_y, 6)],
                        [round(min_x, 6), round(min_y, 6)],
                    ]],
                }
        return make_point_buffer_polygon(f_lat, f_lon, radius_m=250.0)

    elif src == "news":
        return make_point_buffer_polygon(f_lat, f_lon, radius_m=450.0)

    elif src == "gdacs":
        hazard = str(signal.get("hazard_type") or signal.get("disaster_type") or "").lower()
        if "earthquake" in hazard or "gempa" in hazard:
            return make_point_buffer_polygon(f_lat, f_lon, radius_m=3000.0)
        return make_point_buffer_polygon(f_lat, f_lon, radius_m=1500.0)

    # Generic localized fallback
    return make_point_buffer_polygon(f_lat, f_lon, radius_m=450.0)


# ---------------------------------------------------------------------------
# 4. Spatial Incident Fusion & Authority Tiering
# ---------------------------------------------------------------------------

# Per-hazard TTLs (seconds)
HAZARD_TTLS: Dict[str, float] = {
    "flood": 21600.0,            # 6 hours
    "extreme_weather": 21600.0,  # 6 hours
    "weather": 21600.0,          # 6 hours
    "traffic": 1800.0,           # 30 minutes
    "congestion": 1800.0,        # 30 minutes
    "landslide": 172800.0,       # 48 hours
    "infrastructure": 172800.0,  # 48 hours
    "road_closure": 172800.0,    # 48 hours
    "bridge_collapse": 172800.0, # 48 hours
    "fire": 43200.0,             # 12 hours
    "haze": 43200.0,             # 12 hours
    "earthquake": 86400.0,       # 24 hours
}

OFFICIAL_OR_PHYSICAL_SOURCES = frozenset({"bmkg_cap", "petabencana", "firms", "tomtom", "gdacs"})


def _normalize_hazard_group(hazard: str) -> str:
    h = (hazard or "").lower().strip()
    if any(k in h for k in ("flood", "banjir", "terendam", "luapan", "weather", "cuaca", "hujan", "badai", "cyclone")):
        return "flood"
    if any(k in h for k in ("landslide", "longsor", "amblas", "road_closure", "jalan putus", "jembatan putus", "infrastructure")):
        return "landslide"
    if any(k in h for k in ("traffic", "congestion", "macet", "lumpuh", "antrean")):
        return "traffic"
    if any(k in h for k in ("fire", "wildfire", "karhutla", "kebakaran", "haze", "asap")):
        return "fire"
    if any(k in h for k in ("earthquake", "gempa", "tsunami")):
        return "earthquake"
    if any(k in h for k in ("port", "pelabuhan", "ferry", "penyeberangan")):
        return "port"
    return h or "disruption"


def _parse_signal_time(signal: Dict[str, Any]) -> Optional[datetime]:
    candidates = [
        signal.get("reported_at"),
        signal.get("updated_at"),
        signal.get("timestamp"),
        signal.get("published_at"),
        signal.get("pubDate"),
        signal.get("created_at"),
    ]
    for c in candidates:
        if not c:
            continue
        if isinstance(c, datetime):
            return c if c.tzinfo else c.replace(tzinfo=timezone.utc)
        try:
            parsed = datetime.fromisoformat(str(c).replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return None


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def fuse_signals_to_incidents(
    signals: List[Dict[str, Any]],
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Fuses heterogeneous multi-source signals into deduplicated, evidence-based incidents.
    
    Rules:
    - Filters out expired signals using per-hazard TTLs.
    - Groups compatible hazard types.
    - Indexes signals to H3 res-8 cells.
    - Merges connected components sharing H3 cells or within 1.5 km.
    - Evaluates Authority Tiers:
        * CONFIRMED: >= 2 sources with >= 1 official/physical source.
        * WATCH: 1 credible source.
    - Corroborates localized footprint capped at <= 1.5 km.
    """
    if not signals:
        return []

    ref_time = now or datetime.now(timezone.utc)
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)

    # 1. Filter expired signals and prepare indexed items
    active_signals: List[Dict[str, Any]] = []

    for s in signals:
        if not isinstance(s, dict):
            continue

        raw_hazard = str(s.get("hazard_type") or s.get("disaster_type") or s.get("event_type") or "disruption").lower()
        hazard_group = _normalize_hazard_group(raw_hazard)
        ttl = HAZARD_TTLS.get(hazard_group, 21600.0)

        sig_time = _parse_signal_time(s)
        if sig_time is not None:
            age_s = (ref_time - sig_time).total_seconds()
            if age_s > ttl or age_s < -86400:  # Expired or absurd future
                continue

        # Build signal geometry
        geom = build_signal_geometry(s)
        lat = s.get("lat") or s.get("latitude")
        lon = s.get("lon") or s.get("longitude")
        if (lat is None or lon is None) and isinstance(geom, dict):
            coords = geom.get("coordinates")
            if coords and len(coords) > 0 and len(coords[0]) > 0:
                lon = coords[0][0][0]
                lat = coords[0][0][1]

        if lat is None or lon is None or geom is None:
            continue

        try:
            f_lat = float(lat)
            f_lon = float(lon)
        except (ValueError, TypeError):
            continue

        cells = polygon_to_hex8_cells(geom, f_lat, f_lon)
        src = str(s.get("source") or "unknown").lower()

        active_signals.append({
            "raw": s,
            "source": src,
            "hazard_group": hazard_group,
            "lat": f_lat,
            "lon": f_lon,
            "geom": geom,
            "cells": cells,
            "sig_time": sig_time or ref_time,
        })

    if not active_signals:
        return []

    # 2. Build adjacency graph for connected components
    n = len(active_signals)
    adj: List[List[int]] = [[] for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            sig_a = active_signals[i]
            sig_b = active_signals[j]

            # Must share compatible hazard group
            if sig_a["hazard_group"] != sig_b["hazard_group"]:
                continue

            # Check H3 cell intersection or proximity <= 1.5 km
            shares_cell = bool(sig_a["cells"] & sig_b["cells"])
            if not shares_cell:
                # Check spatial distance
                dist_km = _haversine_distance_km(sig_a["lat"], sig_a["lon"], sig_b["lat"], sig_b["lon"])
                if dist_km <= 1.5:
                    shares_cell = True

            if shares_cell:
                adj[i].append(j)
                adj[j].append(i)

    # 3. Find connected components (incident clusters)
    visited = [False] * n
    clusters: List[List[Dict[str, Any]]] = []

    for i in range(n):
        if not visited[i]:
            cluster: List[Dict[str, Any]] = []
            queue = [i]
            visited[i] = True
            while queue:
                curr = queue.pop(0)
                cluster.append(active_signals[curr])
                for neighbor in adj[curr]:
                    if not visited[neighbor]:
                        visited[neighbor] = True
                        queue.append(neighbor)
            clusters.append(cluster)

    # 4. Synthesize unified incidents from clusters
    fused_incidents: List[Dict[str, Any]] = []

    for cluster in clusters:
        sources_set = {item["source"] for item in cluster}
        sources = sorted(list(sources_set))
        source_count = len(sources)
        has_physical_or_official = any(s in OFFICIAL_OR_PHYSICAL_SOURCES for s in sources)

        # Authority Tiering (D4)
        if source_count >= 2 and has_physical_or_official:
            tier = "CONFIRMED"
            status = "CONFIRMED"
            confidence = min(0.98, round(0.65 + 0.12 * source_count, 2))
        elif source_count >= 1:
            tier = "WATCH"
            status = "WATCH"
            confidence = 0.45 if has_physical_or_official else 0.35
        else:
            continue

        # Aggregate evidence items
        evidence_items: List[Dict[str, Any]] = []
        for item in cluster:
            raw = item["raw"]
            evidence_items.append({
                "source": item["source"],
                "id": str(raw.get("id") or raw.get("warning_id") or raw.get("report_id") or ""),
                "title": str(raw.get("title") or raw.get("name") or raw.get("headline") or ""),
                "reported_at": (
                    item["sig_time"].isoformat()
                    if isinstance(item["sig_time"], datetime)
                    else str(item["sig_time"])
                ),
                "url": raw.get("url") or raw.get("link") or raw.get("source_url") or "",
            })

        # Calculate representative center and localized footprint
        pts = [(item["lat"], item["lon"]) for item in cluster]
        center_lat = sum(p[0] for p in pts) / len(pts)
        center_lon = sum(p[1] for p in pts) / len(pts)

        # Primary H3 Res-8 cell ID
        primary_hex8 = lat_lon_to_hex8(center_lat, center_lon)
        hazard_group = cluster[0]["hazard_group"]

        # Corroborated footprint radius calculation
        if len(cluster) == 1:
            # Single source footprint
            single = cluster[0]
            geom = single["geom"]
            raw_s = single["raw"]
            radius_km = float(raw_s.get("radius_km") or 0.45)
            if radius_km > 1.5 and single["source"] != "gdacs":
                radius_km = 1.2
        else:
            # Multi-source corroborated footprint
            max_d_km = max(_haversine_distance_km(center_lat, center_lon, p[0], p[1]) for p in pts)
            # Localized buffer envelope capped at <= 1.5 km
            radius_km = min(1.5, max(0.45, round(max_d_km + 0.35, 2)))
            geom = make_point_buffer_polygon(center_lat, center_lon, radius_m=radius_km * 1000.0)

        # Extract polygon ring coordinates
        polygon_ring: List[List[float]] = []
        if isinstance(geom, dict) and geom.get("coordinates"):
            c_list = geom.get("coordinates")
            if c_list and len(c_list) > 0:
                polygon_ring = c_list[0]

        # Determine severity (highest across signals)
        severities = [str(item["raw"].get("severity") or "").lower() for item in cluster]
        if any(s in ("critical", "extreme", "danger") for s in severities):
            severity = "critical"
        elif any(s in ("high", "alert") for s in severities):
            severity = "high"
        elif any(s in ("medium", "waspada") for s in severities):
            severity = "medium"
        else:
            severity = "low"

        # Determine title and description
        titles = [item["raw"].get("title") or item["raw"].get("name") for item in cluster if item["raw"].get("title") or item["raw"].get("name")]
        primary_title = titles[0] if titles else f"Sumatra {hazard_group.capitalize()} Incident"
        if tier == "CONFIRMED" and not primary_title.startswith("[CONFIRMED]"):
            title = f"{primary_title}"
        else:
            title = primary_title

        desc_parts = [
            f"Multi-source verified incident ({', '.join(sources)})." if source_count > 1 else f"Signal from {sources[0]}."
        ]
        for it in evidence_items[:3]:
            if it.get("title"):
                desc_parts.append(f"- {it['title']} ({it['source']})")
        description = "\n".join(desc_parts)

        # Impacted corridors
        all_corridors: Set[str] = set()
        for item in cluster:
            corr = item["raw"].get("impacted_corridors")
            if isinstance(corr, list):
                all_corridors.update(corr)
            elif isinstance(corr, str) and corr:
                all_corridors.add(corr)

        incident_id = f"inc-fused-{hazard_group}-{primary_hex8.replace('hex8_', '')}"

        fused_incidents.append({
            "id": incident_id,
            "title": title,
            "description": description,
            "hazard_type": hazard_group,
            "disaster_type": hazard_group,
            "event_type": hazard_group,
            "severity": severity,
            "tier": tier,
            "status": status,
            "confidence": confidence,
            "sources": sources,
            "source_count": source_count,
            "evidence_count": len(evidence_items),
            "evidence_items": evidence_items,
            "has_physical_or_official": has_physical_or_official,
            "center": {"lat": round(center_lat, 5), "lon": round(center_lon, 5)},
            "lat": round(center_lat, 5),
            "lon": round(center_lon, 5),
            "radius_km": round(radius_km, 2),
            "geometry": geom,
            "polygon": polygon_ring,
            "impacted_corridors": sorted(list(all_corridors)),
            "updated_at": ref_time.isoformat(),
        })

    return fused_incidents
