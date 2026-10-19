"""
PetaNadi / LRIP : Incident Geometry Generator Service
Generates algorithmically correct, visually distinct, organic GeoJSON geometries per hazard type.
Replaces rectangular bounding boxes with realistic geographic representations:
- Earthquake: Multi-ring shockwaves + fault crack vectors (LineString)
- Flood: River-following valley contours (Polygon)
- Landslide: Downslope debris wedge (Polygon)
- Wildfire: Wind-skewed dispersion ellipse (Polygon)
- Congestion: Buffered highway corridor segment (Polygon/LineString)
"""
import math
from typing import Dict, Any, List, Tuple

def _create_circle_polygon(center_lon: float, center_lat: float, radius_km: float, points: int = 36) -> List[List[float]]:
    ring = []
    km_to_rad = radius_km / 6371.0
    lat_rad = math.radians(center_lat)
    lon_rad = math.radians(center_lon)

    for i in range(points + 1):
        theta = (i * 2 * math.pi) / points
        point_lat_rad = math.asin(
            math.sin(lat_rad) * math.cos(km_to_rad) +
            math.cos(lat_rad) * math.sin(km_to_rad) * math.cos(theta)
        )
        point_lon_rad = lon_rad + math.atan2(
            math.sin(theta) * math.sin(km_to_rad) * math.cos(lat_rad),
            math.cos(km_to_rad) - math.sin(lat_rad) * math.sin(point_lat_rad)
        )
        ring.append([math.degrees(point_lon_rad), math.degrees(point_lat_rad)])
    return ring

def _create_skewed_ellipse(
    center_lon: float,
    center_lat: float,
    semi_major_km: float,
    semi_minor_km: float,
    bearing_deg: float,
    points: int = 36
) -> List[List[float]]:
    ring = []
    lat_deg_per_km = 1.0 / 111.0
    lon_deg_per_km = 1.0 / (111.0 * math.cos(math.radians(center_lat)))
    bearing_rad = math.radians(bearing_deg)

    for i in range(points + 1):
        t = (i * 2 * math.pi) / points
        # Ellipse before rotation
        x = semi_minor_km * math.cos(t)
        y = semi_major_km * math.sin(t)

        # Rotate by bearing
        rot_x = x * math.cos(bearing_rad) - y * math.sin(bearing_rad)
        rot_y = x * math.sin(bearing_rad) + y * math.cos(bearing_rad)

        lon = center_lon + rot_x * lon_deg_per_km
        lat = center_lat + rot_y * lat_deg_per_km
        ring.append([round(lon, 5), round(lat, 5)])

    return ring

def generate_earthquake_geometry(
    lon: float, lat: float, magnitude: float = 5.5, strike_deg: float = 150.0
) -> Dict[str, Any]:
    """Generates 3 concentric shockwave rings (MultiPolygon) + fault line cracks (MultiLineString)."""
    base_radius = max(5.0, (magnitude - 3.0) * 12.0)
    outer_ring = _create_circle_polygon(lon, lat, base_radius, points=36)
    mid_ring = _create_circle_polygon(lon, lat, base_radius * 0.65, points=28)
    inner_ring = _create_circle_polygon(lon, lat, base_radius * 0.35, points=20)

    # Fault line crack vector along strike angle
    strike_rad = math.radians(strike_deg)
    crack_len_km = base_radius * 1.4
    lat_deg_per_km = 1.0 / 111.0
    lon_deg_per_km = 1.0 / (111.0 * math.cos(math.radians(lat)))

    dx = math.sin(strike_rad) * crack_len_km * lon_deg_per_km
    dy = math.cos(strike_rad) * crack_len_km * lat_deg_per_km

    main_crack = [
        [round(lon - dx, 5), round(lat - dy, 5)],
        [round(lon, 5), round(lat, 5)],
        [round(lon + dx, 5), round(lat + dy, 5)]
    ]

    # Secondary branch crack at 45 degree angle
    branch_rad = math.radians(strike_deg + 45)
    bdx = math.sin(branch_rad) * (crack_len_km * 0.5) * lon_deg_per_km
    bdy = math.cos(branch_rad) * (crack_len_km * 0.5) * lat_deg_per_km

    branch_crack = [
        [round(lon, 5), round(lat, 5)],
        [round(lon + bdx, 5), round(lat + bdy, 5)]
    ]

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [[outer_ring], [mid_ring], [inner_ring]]
                },
                "properties": {
                    "hazard_type": "earthquake",
                    "magnitude": magnitude,
                    "severity_label": f"M{magnitude} SEISMIC SHOCKWAVE ZONE"
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": [main_crack, branch_crack]
                },
                "properties": {
                    "hazard_type": "earthquake_crack",
                    "strike_deg": strike_deg,
                    "severity_label": "TECTONIC FAULT CRACK VECTOR"
                }
            }
        ]
    }

def generate_flood_geometry(lon: float, lat: float, water_depth_m: float = 1.2) -> Dict[str, Any]:
    """Generates an organic river-valley inundation polygon (elongated N-S along coastal flow)."""
    major_axis = max(4.0, water_depth_m * 8.0)
    minor_axis = max(2.5, water_depth_m * 4.5)
    # North Sumatra rivers flow SSW -> NNE (~20 degrees bearing)
    polygon_ring = _create_skewed_ellipse(lon, lat, major_axis, minor_axis, bearing_deg=20.0, points=32)

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [polygon_ring]
        },
        "properties": {
            "hazard_type": "flood",
            "water_depth_m": water_depth_m,
            "severity_label": f"FLOOD INUNDATION ({water_depth_m}m)"
        }
    }

def generate_landslide_geometry(lon: float, lat: float, slope_angle_deg: float = 45.0) -> Dict[str, Any]:
    """Generates a downslope debris wedge polygon (narrow top, wide debris fan bottom)."""
    lat_deg_per_km = 1.0 / 111.0
    lon_deg_per_km = 1.0 / (111.0 * math.cos(math.radians(lat)))

    # Debris flows downhill towards east/southeast in Berastagi/North Sumatra spine
    top = [lon - 0.01 * lon_deg_per_km, lat + 0.02 * lat_deg_per_km]
    top_right = [lon + 0.01 * lon_deg_per_km, lat + 0.02 * lat_deg_per_km]
    bottom_right = [lon + 0.04 * lon_deg_per_km, lat - 0.03 * lat_deg_per_km]
    fan_bottom = [lon + 0.02 * lon_deg_per_km, lat - 0.04 * lat_deg_per_km]
    bottom_left = [lon - 0.02 * lon_deg_per_km, lat - 0.03 * lat_deg_per_km]

    wedge = [
        [round(top[0], 5), round(top[1], 5)],
        [round(top_right[0], 5), round(top_right[1], 5)],
        [round(bottom_right[0], 5), round(bottom_right[1], 5)],
        [round(fan_bottom[0], 5), round(fan_bottom[1], 5)],
        [round(bottom_left[0], 5), round(bottom_left[1], 5)],
        [round(top[0], 5), round(top[1], 5)]
    ]

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [wedge]
        },
        "properties": {
            "hazard_type": "landslide",
            "slope_angle": slope_angle_deg,
            "severity_label": "LANDSLIDE DEBRIS FLOW FAN"
        }
    }

def generate_incident_geometry(
    hazard_type: str,
    lat: float,
    lon: float,
    magnitude: float = 5.2,
    water_depth_m: float = 1.2
) -> Dict[str, Any]:
    """Factory function to generate organic GeoJSON for any hazard type."""
    if hazard_type == "earthquake":
        return generate_earthquake_geometry(lon, lat, magnitude=magnitude)
    elif hazard_type == "landslide":
        return generate_landslide_geometry(lon, lat)
    elif hazard_type == "flood":
        return generate_flood_geometry(lon, lat, water_depth_m=water_depth_m)
    else:
        # Default organic ellipse for congestion/wildfire
        ring = _create_skewed_ellipse(lon, lat, 4.0, 2.5, bearing_deg=45.0)
        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"hazard_type": hazard_type, "severity_label": f"{hazard_type.upper()} ZONE"}
        }


def compute_hazard_zone_geometry_and_radius(
    incident_type: str,
    severity: str,
    location_precision: str,
    zone_tier: str,
    lat: float,
    lon: float,
    corridor_segment: str = "",
) -> Dict[str, Any]:
    """Agent-decided hazard-specific radius + anisotropic polygon geometry.

    Returns {"radius_km": float, "geometry_polygon": list[list[float]]} where
    geometry_polygon is a closed ring of [lon, lat] coordinates.
    """
    sev = (severity or "medium").lower()
    itype = (incident_type or "other_disruption").lower()
    is_critical = sev == "critical"
    is_province_only = (location_precision or "") == "province_only"
    is_yellow = (zone_tier or "") == "YELLOW_CLARIFY"

    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except Exception:
        lat_f, lon_f = -1.0, 102.0

    # Default fallback (regency weather alert / other_disruption).
    radius_km = 7.2
    major_km, minor_km, bearing = 7.2 * 1.15, 7.2 * 0.78, 45.0

    if itype in ("landslide", "road_closure"):
        # Pinpoint chokepoint — narrow corridor wedge/ellipse.
        radius_km = 3.5 if is_critical else 2.8
        major_km, minor_km, bearing = radius_km * 1.15, radius_km * 0.55, 60.0
    elif itype == "port_closure":
        radius_km = 3.2
        major_km, minor_km, bearing = 3.4, 2.3, 35.0
    elif itype == "congestion":
        radius_km = 2.5
        major_km, minor_km, bearing = 3.0, 1.3, 60.0
    elif itype == "flood":
        radius_km = 6.0 if is_critical else 4.8
        major_km, minor_km, bearing = radius_km * 1.2, radius_km * 0.65, 22.0
    elif itype == "wildfire":
        radius_km = 7.5
        major_km, minor_km, bearing = 8.5, 5.0, 115.0
    elif itype == "marine_wave":
        radius_km = 8.5
        major_km, minor_km, bearing = 9.5, 4.8, 140.0
    elif itype == "volcanic_eruption":
        radius_km = 10.0
        major_km, minor_km, bearing = 10.5, 8.5, 30.0
    elif itype == "earthquake":
        radius_km = 12.0
        major_km, minor_km, bearing = 12.5, 10.0, 150.0
    else:
        # other_disruption or YELLOW_CLARIFY regency weather alert.
        if is_yellow or itype == "other_disruption":
            radius_km = 9.0 if is_province_only else 7.2
            major_km, minor_km, bearing = radius_km * 1.15, radius_km * 0.78, 45.0

    try:
        ring = _create_skewed_ellipse(lon_f, lat_f, major_km, minor_km, bearing_deg=bearing, points=36)
    except Exception:
        ring = _create_circle_polygon(lon_f, lat_f, radius_km)

    return {"radius_km": float(radius_km), "geometry_polygon": ring}
