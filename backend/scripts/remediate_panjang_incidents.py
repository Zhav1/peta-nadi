"""
Phase 76: Remediation script for contaminated false 'Panjang' incidents in Supabase.
Scans public.incidents for rows located at (-5.4744, 105.3183) where title/description
do not mention Lampung/Panjang port, and either repositions them to the correct Sumatra
coordinate or resolves/cancels statistical recaps.
"""
import sys
import os
import asyncio
from typing import Dict, Any, List

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.supabase_client import get_service_client
from app.services.redis_client import get_redis
from app.nlp.geocoding_service import resolve_sumatra_location_and_corridor
from app.services.incident_geometry_service import compute_hazard_zone_geometry_and_radius
import logging
logger = logging.getLogger(__name__)


def to_ewkt_polygon(ring: Any) -> str:
    if not ring or not isinstance(ring, (list, tuple)):
        return None
    if isinstance(ring, dict):
        coords = ring.get("coordinates")
        if coords and isinstance(coords, list) and len(coords) > 0:
            ring = coords[0]
        else:
            return None
    if len(ring) < 3:
        return None
    pts = list(ring)
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    try:
        coords_str = ", ".join(f"{float(pt[0])} {float(pt[1])}" for pt in pts)
        return f"SRID=4326;POLYGON(({coords_str}))"
    except Exception:
        return None


async def run_panjang_incident_remediation() -> Dict[str, Any]:
    print("=" * 60)
    print("Phase 76: Starting Supabase Incidents Remediation for False Panjang")
    print("=" * 60)

    try:
        sb = get_service_client()
    except Exception as e:
        print(f"Error connecting to Supabase: {e}")
        return {"status": "error", "error": str(e)}

    # Fetch incidents near Lampung/Panjang
    res = sb.table("incidents").select("incident_id, title, description, lat, lon, location, status, severity").execute()
    rows = res.data or []
    print(f"Total incidents in database: {len(rows)}")

    remediated = []

    for row in rows:
        i_id = row.get("incident_id")
        title = row.get("title") or ""
        desc = row.get("description") or ""
        combined_text = f"{title} {desc}".lower()

        lat = row.get("lat")
        lon = row.get("lon")

        if lat is None or lon is None:
            continue

        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (ValueError, TypeError):
            continue

        # Check if coordinates match the false Panjang node (-5.4744, 105.3183) within tolerance
        is_near_panjang = (-5.55 <= lat_f <= -5.40) and (105.25 <= lon_f <= 105.40)
        if not is_near_panjang:
            continue

        # Legitimate Lampung/Panjang incident check
        is_legit_lampung = any(k in combined_text for k in ("lampung", "bandar lampung", "pelabuhan panjang", "bakauheni", "lamsel"))
        if is_legit_lampung:
            print(f"[SKIP] Legitimate Lampung incident kept: {title[:60]}")
            continue

        print(f"\n[FOUND CONTAMINATED] ID: {i_id}")
        print(f"  Title: {title}")
        print(f"  Coords: ({lat_f}, {lon_f})")

        # Re-resolve location using updated gazetteer and word-boundary geocoding
        res_geo = resolve_sumatra_location_and_corridor(f"{title} {desc}")
        new_lat = res_geo.get("latitude")
        new_lon = res_geo.get("longitude")
        loc_prec = res_geo.get("location_precision", "corridor_point")
        corridor = res_geo.get("corridor_segment", "Jalur Logistik Sumatera")
        matched_node = res_geo.get("matched_node")

        print(f"  Re-geocoded: Node='{matched_node}', Prec='{loc_prec}', Coords=({new_lat}, {new_lon})")

        # Check if this is a statistical summary without physical road blockade
        is_summary_or_broad = (
            loc_prec in ("province_only", "kabupaten_kota")
            and any(w in combined_text for w in ("catat", "sepanjang september", "sepanjang agustus", "sepanjang tahun", "rekapitulasi", "bencana terjadi di"))
        )

        update_payload: Dict[str, Any] = {}
        if is_summary_or_broad:
            update_payload["status"] = "resolved"
            if new_lat is not None and new_lon is not None:
                update_payload["lat"] = float(new_lat)
                update_payload["lon"] = float(new_lon)
                update_payload["location"] = f"SRID=4326;POINT({new_lon} {new_lat})"
            action = f"Marked resolved (historical summary) & repositioned to {matched_node}"
        elif new_lat is not None and new_lon is not None and not (-5.55 <= float(new_lat) <= -5.40 and 105.25 <= float(new_lon) <= 105.40):
            update_payload["lat"] = float(new_lat)
            update_payload["lon"] = float(new_lon)
            update_payload["location"] = f"SRID=4326;POINT({new_lon} {new_lat})"
            
            geo_box = compute_hazard_zone_geometry_and_radius(
                incident_type=row.get("type", "road_closure"),
                severity=row.get("severity", "medium"),
                location_precision=loc_prec,
                zone_tier="YELLOW_CLARIFY" if loc_prec == "kabupaten_kota" else "RED_CONFIRMED",
                lat=float(new_lat),
                lon=float(new_lon),
                corridor_segment=corridor
            )
            polygon_ewkt = to_ewkt_polygon(geo_box.get("geometry_polygon"))
            if polygon_ewkt:
                update_payload["affected_area"] = polygon_ewkt
            action = f"Repositioned to {matched_node} ({new_lat}, {new_lon}) with {geo_box.get('radius_km')}km radius"
        else:
            update_payload["status"] = "resolved"
            action = "Marked resolved (unresolvable false coordinate)"

        try:
            sb.table("incidents").update(update_payload).eq("incident_id", i_id).execute()
            print(f"  [SUCCESS] {action}")
            remediated.append({
                "incident_id": i_id,
                "title": title,
                "action": action,
                "updates": update_payload
            })
        except Exception as ue:
            print(f"  [ERROR] Failed to update incident {i_id}: {ue}")

    # Set Redis cache key to mark remediation completed
    r = get_redis()
    if r:
        try:
            r.set("lrip:remediation:panjang_v5", "completed", ex=86400)
            print("\nRedis cache key 'lrip:remediation:panjang_v5' set.")
        except Exception as re:
            print(f"Redis cache set failed: {re}")

    print("\n" + "=" * 60)
    print(f"Remediation Finished: {len(remediated)} incidents corrected.")
    print("=" * 60)
    return {"status": "success", "remediated_count": len(remediated), "details": remediated}


if __name__ == "__main__":
    asyncio.run(run_panjang_incident_remediation())
