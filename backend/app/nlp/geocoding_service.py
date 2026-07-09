import asyncio
import json
import logging
from typing import Tuple, Optional
import httpx
from app.services.redis_client import get_redis

logger = logging.getLogger(__name__)

GEOCODE_CACHE_TTL = 7 * 24 * 3600  # 7 days in seconds

# Pre-seeded POIs to avoid external Nominatim requests during demo or for common points
KNOWN_POIS = {
    "belawan": (3.7944, 98.6913),
    "medan": (3.5952, 98.6722),
    "binjai": (3.5997, 98.4885),
    "pematangsiantar": (2.9595, 99.0687),
    "danau toba": (2.6845, 98.8756),
    "dumai": (1.6784, 101.4503),
    "trans sumatra": (3.7000, 98.6500),
    "sibolga": (1.7455, 98.7875),
    "tanjung mulia": (3.7558, 98.6742),
    "belawan port": (3.7944, 98.6913),
    "pelabuhan belawan": (3.7944, 98.6913),
    "jalan lintas sumatera": (3.7000, 98.6500),
    "tol belawan": (3.7800, 98.6800),
    "simalungun": (2.9500, 99.1000),
    "toba": (2.4000, 99.0000),
}

async def geocode(location_name: str) -> Optional[Tuple[float, float]]:
    """
    Geocode a location name in Indonesia.
    Checks Redis cache first, then pre-seeded POIs, then falls back to OpenStreetMap Nominatim.
    """
    slug = location_name.lower().strip()
    if not slug:
        return None

    r = get_redis()
    cache_key = f"lrip:geocode:{slug}"

    # 1. Check Redis Cache
    try:
        cached = r.get(cache_key)
        if cached:
            coords = json.loads(cached)
            logger.debug(f"Geocoding cache hit for '{slug}': {coords}")
            return tuple(coords)
    except Exception as e:
        logger.error(f"Failed to check Redis geocode cache for '{slug}': {e}")

    # 2. Check Pre-seeded POIs
    if slug in KNOWN_POIS:
        coords = KNOWN_POIS[slug]
        logger.debug(f"Geocoding pre-seeded hit for '{slug}': {coords}")
        try:
            r.set(cache_key, json.dumps(coords), ex=GEOCODE_CACHE_TTL)
        except Exception as e:
            logger.error(f"Failed to write pre-seeded geocode to Redis: {e}")
        return coords

    # 3. Fall back to Nominatim API
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": location_name,
        "format": "jsonv2",
        "countrycodes": "id",
        "limit": 1
    }
    headers = {
        "User-Agent": "PetaNadi/1.0 (lrip-project@example.com)"
    }

    try:
        logger.info(f"Geocoding '{location_name}' via Nominatim API...")
        # Enforce OpenStreetMap rate limit (1 request per second)
        await asyncio.sleep(1.1)
        
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, headers=headers, timeout=10)
            
            if resp.status_code == 200:
                data = resp.json()
                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    coords = (lat, lon)
                    logger.info(f"Nominatim geocode success for '{location_name}': {coords}")
                    
                    # Store in Redis cache
                    try:
                        r.set(cache_key, json.dumps(coords), ex=GEOCODE_CACHE_TTL)
                    except Exception as e:
                        logger.error(f"Failed to cache geocode result in Redis: {e}")
                    return coords
                else:
                    logger.warning(f"No Nominatim results found for '{location_name}'")
            else:
                logger.error(f"Nominatim API error for '{location_name}': status {resp.status_code}")
    except Exception as e:
        logger.error(f"Error querying Nominatim API for '{location_name}': {e}")

    return None
