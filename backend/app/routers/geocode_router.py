"""
PreHub : Pan-Sumatra Universal Geocoding & Village Dispatcher Router
Provides hierarchical geocoding across Pan-Sumatra strategic gazetteer nodes,
high-precision ADM boundaries, and OpenStreetMap Nominatim universal village
(desa/kelurahan/nagari/gampong) & kecamatan search and reverse geocoding.
"""
import math
import logging
from typing import Dict, Any, List, Optional
import httpx
from fastapi import APIRouter, Query, HTTPException

from app.nlp.gazetteer_data import PAN_SUMATRA_GAZETTEER, SUMATRA_BOUNDING_BOX
from app.services.adm_boundary_service import get_adm_boundaries
from app.services.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/geocode",
    tags=["Universal Geocoding & Gazetteers"],
)

# In-memory LRU cache to avoid excessive external HTTP calls
_IN_MEMORY_SEARCH_CACHE: Dict[str, List[Dict[str, Any]]] = {}
_IN_MEMORY_REVERSE_CACHE: Dict[str, Dict[str, Any]] = {}

NOMINATIM_HEADERS = {
    "User-Agent": "PreHubSumatraLogistics/1.0 (Live Fleet Pilot Sumatra; contact@pidi.id)"
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates Haversine distance in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


@router.get("/nodes")
async def get_gazetteer_nodes() -> Dict[str, Any]:
    """
    Returns all 70+ PAN_SUMATRA_GAZETTEER Kabupaten/Kota/Kecamatan strategic logistics nodes
    (id, name, lat, lon, province, corridor, tier: 'regency') along with the official
    Google Maps-style ADM boundary polygons from adm_boundary_service.
    """
    try:
        nodes = []
        for slug, data in PAN_SUMATRA_GAZETTEER.items():
            coords = data.get("coords", (3.5952, 98.6722))
            nodes.append({
                "id": slug,
                "name": slug.title(),
                "lat": coords[0],
                "lon": coords[1],
                "province": data.get("province", "Sumatera"),
                "corridor": data.get("corridor", "Jalinsum Arteri"),
                "tier": "regency",
            })

        boundaries = get_adm_boundaries()
        return {
            "status": "success",
            "total": len(nodes),
            "total_nodes": len(nodes),
            "nodes": nodes,
            "boundaries": boundaries
        }
    except Exception as e:
        logger.error(f"Error fetching geocode nodes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_places(
    q: str = Query(..., min_length=2, description="Village, kecamatan, kabupaten, or hub search query"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of results to return")
) -> Dict[str, Any]:
    """
    Searches PAN_SUMATRA_GAZETTEER first, then queries OpenStreetMap Nominatim
    bounded to Sumatra (95.0, -6.2 to 109.0, 6.0) with caching so searching ANY
    remote village (desa/kelurahan/nagari/gampong) or kecamatan in Sumatra
    returns structured results.
    """
    query_clean = q.strip()
    cache_key = f"{query_clean.lower()}:{limit}"

    # 1. Check in-memory cache
    if cache_key in _IN_MEMORY_SEARCH_CACHE:
        return {
            "status": "success",
            "query": query_clean,
            "cached": True,
            "count": len(_IN_MEMORY_SEARCH_CACHE[cache_key]),
            "results": _IN_MEMORY_SEARCH_CACHE[cache_key]
        }

    # 2. Check Redis cache
    r = get_redis()
    if r is not None:
        try:
            cached_val = r.get(f"lrip:geocode:search:{cache_key}")
            if cached_val:
                import json
                parsed = json.loads(cached_val)
                _IN_MEMORY_SEARCH_CACHE[cache_key] = parsed
                return {
                    "status": "success",
                    "query": query_clean,
                    "cached": True,
                    "count": len(parsed),
                    "results": parsed
                }
        except Exception as e:
            logger.debug(f"Redis search cache lookup error: {e}")

    results: List[Dict[str, Any]] = []
    seen_coords: List[Tuple[float, float]] = []

    # 3. Match against PAN_SUMATRA_GAZETTEER
    q_lower = query_clean.lower()
    for slug, data in PAN_SUMATRA_GAZETTEER.items():
        if q_lower in slug or slug in q_lower:
            coords = data["coords"]
            results.append({
                "name": slug.title(),
                "display_name": f"{slug.title()}, {data['province']}, Indonesia",
                "lat": coords[0],
                "lon": coords[1],
                "type": "regency_hub",
                "province": data.get("province"),
                "kabupaten": slug.title(),
                "kecamatan": None,
                "source": "PAN_SUMATRA_GAZETTEER"
            })
            seen_coords.append((coords[0], coords[1]))
            if len(results) >= limit:
                break

    # 4. Query OpenStreetMap Nominatim for villages, gampong, nagari, subdistricts
    if len(results) < limit:
        try:
            osm_url = "https://nominatim.openstreetmap.org/search"
            params = {
                "q": query_clean,
                "format": "jsonv2",
                "viewbox": "95.0,6.0,109.0,-6.2",
                "bounded": "1",
                "countrycodes": "id",
                "addressdetails": "1",
                "limit": limit
            }
            async with httpx.AsyncClient(timeout=4.5) as client:
                resp = await client.get(osm_url, params=params, headers=NOMINATIM_HEADERS)
                if resp.status_code == 200:
                    items = resp.json()
                    for item in items:
                        try:
                            lat = float(item["lat"])
                            lon = float(item["lon"])
                        except (ValueError, KeyError):
                            continue

                        # Check bounding box
                        if not (-6.2 <= lat <= 6.0 and 95.0 <= lon <= 109.0):
                            continue

                        # Avoid duplicates
                        is_dup = any(haversine_km(lat, lon, sc[0], sc[1]) < 1.5 for sc in seen_coords)
                        if is_dup:
                            continue

                        addr = item.get("address", {})
                        prov = addr.get("state") or addr.get("province") or "Sumatera"
                        kab = addr.get("county") or addr.get("city") or addr.get("regency") or ""
                        kec = addr.get("municipality") or addr.get("subdistrict") or addr.get("district") or addr.get("town") or ""
                        village = addr.get("village") or addr.get("hamlet") or addr.get("suburb") or addr.get("neighbourhood") or ""

                        place_name = village or kec or item.get("name") or query_clean.title()
                        p_type = item.get("type") or item.get("addresstype") or "village"

                        results.append({
                            "name": place_name,
                            "display_name": item.get("display_name", f"{place_name}, {kab}, {prov}"),
                            "lat": round(lat, 6),
                            "lon": round(lon, 6),
                            "type": p_type,
                            "province": prov,
                            "kabupaten": kab,
                            "kecamatan": kec,
                            "village": village,
                            "source": "OSM_NOMINATIM"
                        })
                        seen_coords.append((lat, lon))
                        if len(results) >= limit:
                            break
        except Exception as e:
            logger.warning(f"Nominatim search query exception: {e}")

    # Cache results (both in-memory and Redis)
    _IN_MEMORY_SEARCH_CACHE[cache_key] = results
    if r is not None and results:
        try:
            import json
            r.set(f"lrip:geocode:search:{cache_key}", json.dumps(results), ex=86400)
        except Exception:
            pass

    return {
        "status": "success",
        "query": query_clean,
        "cached": False,
        "count": len(results),
        "results": results
    }


@router.get("/reverse")
async def reverse_geocode(
    lat: float = Query(..., ge=-10.0, le=10.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=90.0, le=115.0, description="Longitude in decimal degrees")
) -> Dict[str, Any]:
    """
    Reverse geocodes any clicked [lat, lon] coordinate on Sumatra via nearest gazetteer
    check and OSM Nominatim /reverse to return the exact village / kelurahan / kecamatan.
    """
    cache_key = f"{round(lat, 4)}:{round(lon, 4)}"

    # 1. In-memory cache
    if cache_key in _IN_MEMORY_REVERSE_CACHE:
        return {
            "status": "success",
            "cached": True,
            **_IN_MEMORY_REVERSE_CACHE[cache_key]
        }

    # 2. Redis cache
    r = get_redis()
    if r is not None:
        try:
            cached_val = r.get(f"lrip:geocode:reverse:{cache_key}")
            if cached_val:
                import json
                parsed = json.loads(cached_val)
                _IN_MEMORY_REVERSE_CACHE[cache_key] = parsed
                return {
                    "status": "success",
                    "cached": True,
                    **parsed
                }
        except Exception:
            pass

    # 3. Check if immediately adjacent (< 2.5 km) to a strategic gazetteer node
    for slug, data in PAN_SUMATRA_GAZETTEER.items():
        c = data["coords"]
        if haversine_km(lat, lon, c[0], c[1]) < 2.5:
            info = {
                "name": slug.title(),
                "display_name": f"{slug.title()}, {data['province']}, Indonesia",
                "lat": lat,
                "lon": lon,
                "type": "strategic_hub",
                "province": data.get("province"),
                "kabupaten": slug.title(),
                "kecamatan": None,
                "village": None,
                "source": "PAN_SUMATRA_GAZETTEER"
            }
            _IN_MEMORY_REVERSE_CACHE[cache_key] = info
            return {"status": "success", "cached": False, **info}

    # 4. OSM Nominatim reverse geocode
    info = {
        "name": f"Lokasi [{round(lat, 4)}, {round(lon, 4)}]",
        "display_name": f"Koordinat {round(lat, 4)}, {round(lon, 4)}, Sumatera",
        "lat": lat,
        "lon": lon,
        "type": "point",
        "province": "Sumatera",
        "kabupaten": None,
        "kecamatan": None,
        "village": None,
        "source": "COORDINATE_ESTIMATED"
    }

    try:
        osm_url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": lat,
            "lon": lon,
            "format": "jsonv2",
            "addressdetails": "1"
        }
        async with httpx.AsyncClient(timeout=4.5) as client:
            resp = await client.get(osm_url, params=params, headers=NOMINATIM_HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                addr = data.get("address", {})
                prov = addr.get("state") or addr.get("province") or "Sumatera"
                kab = addr.get("county") or addr.get("city") or addr.get("regency")
                kec = addr.get("municipality") or addr.get("subdistrict") or addr.get("district") or addr.get("town")
                village = addr.get("village") or addr.get("hamlet") or addr.get("suburb") or addr.get("neighbourhood")

                name = village or kec or kab or data.get("name") or f"Lokasi [{round(lat, 4)}, {round(lon, 4)}]"
                info = {
                    "name": name,
                    "display_name": data.get("display_name", f"{name}, {kab}, {prov}"),
                    "lat": lat,
                    "lon": lon,
                    "type": data.get("type", "village"),
                    "province": prov,
                    "kabupaten": kab,
                    "kecamatan": kec,
                    "village": village,
                    "source": "OSM_NOMINATIM"
                }
    except Exception as e:
        logger.warning(f"Reverse geocode lookup exception for ({lat}, {lon}): {e}")

    _IN_MEMORY_REVERSE_CACHE[cache_key] = info
    if r is not None:
        try:
            import json
            r.set(f"lrip:geocode:reverse:{cache_key}", json.dumps(info), ex=86400)
        except Exception:
            pass

    return {
        "status": "success",
        "cached": False,
        **info
    }
