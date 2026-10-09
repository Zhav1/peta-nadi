import asyncio
import json
import logging
from typing import Tuple, Optional, Dict, Any
import httpx
from app.services.redis_client import get_redis
from app.config import get_settings
from app.nlp.gazetteer_data import PAN_SUMATRA_GAZETTEER, SUMATRA_BOUNDING_BOX

logger = logging.getLogger(__name__)

GEOCODE_CACHE_TTL = 7 * 24 * 3600  # 7 days in seconds


def is_within_sumatra(lat: float, lon: float) -> bool:
    """Verifies that coordinates fall strictly within Sumatra island boundaries."""
    return (
        SUMATRA_BOUNDING_BOX["min_lat"] <= lat <= SUMATRA_BOUNDING_BOX["max_lat"] and
        SUMATRA_BOUNDING_BOX["min_lon"] <= lon <= SUMATRA_BOUNDING_BOX["max_lon"]
    )


async def geocode(location_name: str) -> Optional[Tuple[float, float]]:
    """
    Geocodes a Sumatra location using a 3-tier hybrid strategy:
    Tier 1: Pre-compiled Pan-Sumatra Logistics Gazetteer (instant, deterministic)
    Tier 2: Redis-cached results
    Tier 3: OpenStreetMap Nominatim with Sumatra bounding box restriction
    """
    slug = location_name.lower().strip()
    if not slug:
        return None

    # 1. Tier 1: Direct Pan-Sumatra Gazetteer Hit
    if slug in PAN_SUMATRA_GAZETTEER:
        coords = PAN_SUMATRA_GAZETTEER[slug]["coords"]
        return coords

    # Check partial / normalized matches in gazetteer
    for key, val in PAN_SUMATRA_GAZETTEER.items():
        if key in slug or slug in key:
            return val["coords"]

    # 2. Tier 2: Check Redis Cache
    r = get_redis()
    cache_key = f"lrip:geocode:{slug}"
    try:
        cached = r.get(cache_key)
        if cached:
            coords = json.loads(cached)
            return tuple(coords)
    except Exception as e:
        logger.debug(f"Geocode cache miss/skipped: {e}")

    # 3. Tier 3: Live OpenStreetMap Nominatim with Sumatra Viewbox
    url = "https://nominatim.openstreetmap.org/search"
    # viewbox: left,top,right,bottom (min_lon, max_lat, max_lon, min_lat)
    viewbox_str = f"{SUMATRA_BOUNDING_BOX['min_lon']},{SUMATRA_BOUNDING_BOX['max_lat']},{SUMATRA_BOUNDING_BOX['max_lon']},{SUMATRA_BOUNDING_BOX['min_lat']}"
    params = {
        "q": f"{location_name}, Sumatera, Indonesia",
        "format": "jsonv2",
        "countrycodes": "id",
        "viewbox": viewbox_str,
        "bounded": 1,
        "limit": 1
    }
    headers = {
        "User-Agent": "PetaNadi-Sumatra-Logistics/2.0 (research-logistics@petanadi.id)"
    }

    try:
        logger.info(f"Querying Nominatim for Sumatra location: '{location_name}'...")
        await asyncio.sleep(0.5)  # Respect rate limit
        
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, headers=headers, timeout=6.0)
            if resp.status_code == 200:
                data = resp.json()
                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    if is_within_sumatra(lat, lon):
                        coords = (lat, lon)
                        try:
                            r.set(cache_key, json.dumps(coords), ex=GEOCODE_CACHE_TTL)
                        except Exception:
                            pass
                        return coords
    except Exception as e:
        logger.debug(f"Nominatim lookup skipped for '{location_name}': {e}")

    return None


def resolve_sumatra_location_and_corridor(text: str, fallback_province: str = "Sumatera") -> Dict[str, Any]:
    """
    Resolves the best matching location, coordinates, province, and corridor segment
    from article text using the pan-Sumatra gazetteer.
    """
    text_lower = text.lower()
    
    # Priority matching: Check longest key matches first to avoid sub-string shadowing
    sorted_keys = sorted(PAN_SUMATRA_GAZETTEER.keys(), key=lambda k: len(k), reverse=True)
    
    for key in sorted_keys:
        if key in text_lower:
            data = PAN_SUMATRA_GAZETTEER[key]
            lat, lon = data["coords"]
            return {
                "matched_node": key.title(),
                "latitude": lat,
                "longitude": lon,
                "province": data["province"],
                "corridor_segment": data["corridor"],
                "is_geocoded": True
            }

    # Province-level centroids fallback if no specific town/road matched
    province_centroids = {
        "Aceh": (5.5483, 95.3238),
        "Sumatera Utara": (3.5952, 98.6722),
        "Sumatera Barat": (-0.9471, 100.4172),
        "Riau": (0.5071, 101.4478),
        "Kepulauan Riau": (1.1301, 104.0529),
        "Jambi": (-1.6101, 103.6131),
        "Sumatera Selatan": (-2.9761, 104.7754),
        "Bengkulu": (-3.8004, 102.2655),
        "Lampung": (-5.4297, 105.2625),
        "Bangka Belitung": (-2.1333, 106.1167),
    }

    target_prov = fallback_province if fallback_province in province_centroids else "Sumatera Utara"
    lat, lon = province_centroids.get(target_prov, (3.5952, 98.6722))

    return {
        "matched_node": target_prov,
        "latitude": lat,
        "longitude": lon,
        "province": target_prov,
        "corridor_segment": "Jalur Arteri Logistik Sumatera",
        "is_geocoded": False
    }
