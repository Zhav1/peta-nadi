import asyncio
import json
import logging
import re
from typing import Tuple, Optional, Dict, Any
import httpx
from app.services.redis_client import get_redis
from app.config import get_settings
from app.nlp.gazetteer_data import PAN_SUMATRA_GAZETTEER, SUMATRA_BOUNDING_BOX

logger = logging.getLogger(__name__)

GEOCODE_CACHE_TTL = 7 * 24 * 3600  # 7 days in seconds

KNOWN_POIS = {k: v["coords"] for k, v in PAN_SUMATRA_GAZETTEER.items()}


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


def strip_bureau_and_dateline_noise(text: str) -> str:
    """
    Strips bureau/outlet names and datelines before location matching so an
    article from `Antara Bengkulu` never matches `"bengkulu"` from its
    outlet/dateline header. Operates case-insensitively.
    """
    if not text or not isinstance(text, str):
        return ""
    cleaned = text
    patterns = [
        r'\blkbn\s+antara[^\n,;]*',
        r'\bantaranews\.com\b',
        r'\bantaranews\b',
        r'\bantara\s+(bengkulu|aceh|sumut|sumbar|riau|jambi|sumsel|lampung|babel|bangka\s+belitung|sumatera\s+utara|sumatera\s+barat|sumatera\s+selatan|kepri|kepulauan\s+riau)\b',
        r'\bdetiksumut\b',
        r'\bdetiknews\b',
        r'\bdetik\.com\b',
        r'\bcnbc\s+indonesia\b',
        r'\bcnn\s+indonesia\b',
        r'\bkompas\.com\b',
        r'\btribunnews\.com\b',
        r'\btribun\w*\b',
        # Dateline anywhere: "Bengkulu (ANTARA) -" / "Medan (Antara):" — remove
        # the city + (ANTARA) + dash entirely so the header city never counts
        # as an incident location.
        r'\b[A-Za-z][A-Za-z\s\.\']{1,40}?\(\s*antara\s*\)\s*[-–—:]*',
        r'\b[A-Za-z][A-Za-z\s]{1,30}?,\s*ANTARA\s*[-–—:]*',
    ]
    for pat in patterns:
        cleaned = re.sub(pat, ' ', cleaned, flags=re.IGNORECASE)
    # Standalone parenthesized (ANTARA) anywhere (dateline remnant)
    cleaned = re.sub(r'\(\s*antara\s*\)', ' ', cleaned, flags=re.IGNORECASE)
    # Common dateline separator: "Bengkulu - " at start followed by capital story
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


BARE_PROVINCE_KEYS = {
    "aceh",
    "sumatera utara",
    "sumatera barat",
    "riau",
    "jambi",
    "sumatera selatan",
    "bengkulu",
    "lampung",
    "bangka belitung",
    "kepulauan riau",
}

# Centroids used ONLY when a bare province name is genuinely mentioned in the
# cleaned body text (province_only). Never used as a blind fallback.
PROVINCE_CENTROIDS: Dict[str, tuple] = {
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

# Bare-province aliases (lowercase needle -> canonical province).
BARE_PROVINCE_ALIASES = {
    "sumatera utara": "Sumatera Utara",
    "sumut": "Sumatera Utara",
    "sumatera barat": "Sumatera Barat",
    "sumbar": "Sumatera Barat",
    "sumatera selatan": "Sumatera Selatan",
    "sumsel": "Sumatera Selatan",
    "bangka belitung": "Bangka Belitung",
    "babel": "Bangka Belitung",
    "kepulauan riau": "Kepulauan Riau",
    "kepri": "Kepulauan Riau",
    "aceh": "Aceh",
    "riau": "Riau",
    "jambi": "Jambi",
    "bengkulu": "Bengkulu",
    "lampung": "Lampung",
}


def resolve_sumatra_location_and_corridor(text: str, fallback_province: str = "Sumatera Utara") -> Dict[str, Any]:
    """
    Resolves the best matching location, coordinates, province, and corridor segment
    from article text using the pan-Sumatra gazetteer.

    - Strips bureau/dateline noise before matching.
    - Specific gazetteer nodes (ports, cities, regencies, corridors, straits)
      yield `location_precision="exact_node"`.
    - Bare province-name mentions only yield `location_precision="province_only"`.
    - CRITICAL: when nothing matches, NO blind fallback-centroid assignment is
      performed; returns `is_geocoded=False` with None coordinates.
    """
    clean_text = strip_bureau_and_dateline_noise(text or "")
    text_lower = clean_text.lower()

    # Priority matching: Check longest key matches first to avoid sub-string shadowing
    sorted_keys = sorted(PAN_SUMATRA_GAZETTEER.keys(), key=lambda k: len(k), reverse=True)

    province_candidate = None
    for key in sorted_keys:
        if key in text_lower:
            if key in BARE_PROVINCE_KEYS:
                # Bare province mention — keep as fallback candidate, keep
                # searching for a more specific exact node.
                if province_candidate is None:
                    data = PAN_SUMATRA_GAZETTEER[key]
                    lat, lon = data["coords"]
                    province_candidate = {
                        "matched_node": key.title(),
                        "latitude": lat,
                        "longitude": lon,
                        "province": data["province"],
                        "corridor_segment": data["corridor"],
                        "is_geocoded": True,
                        "location_precision": "province_only",
                    }
                continue
            data = PAN_SUMATRA_GAZETTEER[key]
            lat, lon = data["coords"]
            return {
                "matched_node": key.title(),
                "latitude": lat,
                "longitude": lon,
                "province": data["province"],
                "corridor_segment": data["corridor"],
                "is_geocoded": True,
                "location_precision": "exact_node",
            }

    if province_candidate is not None:
        return province_candidate

    # Bare province-name scan (province_only): the province name itself may not be
    # a gazetteer key (e.g. "Sumatera Barat"), so check aliases explicitly with
    # word boundaries. Only when genuinely mentioned in the cleaned body.
    import re as _re
    for needle, canon in sorted(BARE_PROVINCE_ALIASES.items(), key=lambda kv: len(kv[0]), reverse=True):
        if _re.search(r'\b' + _re.escape(needle) + r'\b', text_lower):
            lat, lon = PROVINCE_CENTROIDS.get(canon, (None, None))
            if lat is None:
                continue
            return {
                "matched_node": canon,
                "latitude": lat,
                "longitude": lon,
                "province": canon,
                "corridor_segment": "Jalur Arteri Logistik Sumatera",
                "is_geocoded": True,
                "location_precision": "province_only",
            }

    # CRITICAL FIX: No blind fallback-centroid assignment.
    return {
        "matched_node": None,
        "latitude": None,
        "longitude": None,
        "province": fallback_province or "unknown",
        "corridor_segment": "unknown",
        "is_geocoded": False,
        "location_precision": "none",
    }
