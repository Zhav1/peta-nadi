import asyncio
import json
import logging
import math
import re
from typing import Tuple, Optional, Dict, Any, List
import httpx
from app.services.redis_client import get_redis
from app.config import get_settings
from app.nlp.gazetteer_data import PAN_SUMATRA_GAZETTEER, SUMATRA_BOUNDING_BOX, OUT_OF_SUMATRA_MARKERS

logger = logging.getLogger(__name__)

GEOCODE_CACHE_TTL = 7 * 24 * 3600  # 7 days in seconds

# SPEC-LOCKED M5 Phase A Q1: hard island bbox 94-108E / -6..6N, enforced on
# every resolved coordinate (gazetteer AND Nominatim). Outside => not
# geocoded, never a blind centroid.
STRICT_SUMATRA_BBOX = {
    "min_lon": 94.0,
    "max_lon": 108.0,
    "min_lat": -6.0,
    "max_lat": 6.0,
}


def is_within_strict_sumatra_bbox(lat: float, lon: float) -> bool:
    """SPEC-LOCKED hard bbox: 94<=lon<=108, -6<=lat<=6. Admits uncertainty."""
    try:
        return (
            STRICT_SUMATRA_BBOX["min_lat"] <= float(lat) <= STRICT_SUMATRA_BBOX["max_lat"]
            and STRICT_SUMATRA_BBOX["min_lon"] <= float(lon) <= STRICT_SUMATRA_BBOX["max_lon"]
        )
    except (TypeError, ValueError):
        return False


def contains_out_of_sumatra_marker(text_lower: str) -> bool:
    """True when a Java / out-of-island toponym (e.g. sumbing/jateng) appears."""
    t = text_lower or ""
    return any(m in t for m in OUT_OF_SUMATRA_MARKERS)

KNOWN_POIS = {k: v["coords"] for k, v in PAN_SUMATRA_GAZETTEER.items()}


def is_within_sumatra(lat: float, lon: float) -> bool:
    """Verifies that coordinates fall strictly within Sumatra island boundaries.

    SPEC-LOCKED M5 Phase A Q1: delegates to the hard 94-108E/-6..6N bbox.
    """
    return is_within_strict_sumatra_bbox(lat, lon)


def _tiered_keys() -> List[str]:
    """Tier 1 pinpoint first, Tier 2 kabupaten second, Tier 3 macro last; longer keys win ties."""
    return sorted(PAN_SUMATRA_GAZETTEER.keys(), key=lambda k: (PAN_SUMATRA_GAZETTEER[k].get("tier", 2), -len(k)))


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

    # Check partial / normalized matches in gazetteer (longest keys first with strict word boundaries)
    for key in sorted(PAN_SUMATRA_GAZETTEER.keys(), key=lambda k: (-len(k), PAN_SUMATRA_GAZETTEER[k].get("tier", 2))):
        pattern = rf"\b{re.escape(key)}\b"
        if re.search(pattern, slug, re.IGNORECASE):
            return PAN_SUMATRA_GAZETTEER[key]["coords"]

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
        r'\blkbn\s+antara\s+sumut\b',
        r'\bantara\s+sumut\b',
        r'\bantara\s+berita\s+sumut\b',
        r'\bantara\s+sumbar\b',
        r'\bantara\s+berita\s+sumbar\b',
        r'\bbpbd\s+(sumut|sumbar|riau|aceh|jambi|sumsel|sumsel|bengkulu|lampung|sumsel|sumatera\s+utara|sumatera\s+barat)\b',
        r'\bpolda\s+sumut\b',
        r'\bpemprov\s+sumut\b',
        r'\bpemprov\s+(sumbar|riau|aceh|jambi|sumsel|bengkulu|lampung)\b',
        r'\bpolda\s+(sumbar|riau|aceh|jambi|sumsel|bengkulu|lampung)\b',
        r'\bdetik\s*sumut\b',
        r'\bdetikcom\s*[-–—:]*\s*sumut\b',
        r'\bdetik\s*aceh\b',
        r'\bdetik\s*sumbagsel\b',
        r'\bdetiknews\b',
        r'\bdetik\.com\b',
        r'\bwaspada\s+online\b',
        r'\bwaspada\.co\.id\b',
        r'\bharian\s+waspada\b',
        r'\bwaspada\b',
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

# Specific Tier-1 chokepoint/pass signals used for route-endpoint demotion.
_SPECIFIC_PASS_KEYS = (
    "sitinjau lauik", "sitinjau laut", "sitinjau-lauik", "lembah anai",
    "silaing", "silaing bawah", "kelok 9", "kelok sembilan", "sipirok",
    "batu jomba", "aek latong", "batang toru", "sibolangit", "sembahe",
    "tikungan tirtanadi", "berastagi", "parapat", "tarutung",
)

_ROUTE_PAIR_RE = re.compile(
    r'(?:jalan\s+lintas|jalinsum|jalintim|jalinbar|jalinteng|jalan\s+lintas\s+tengah|jalan\s+lintas\s+timur|jalan\s+lintas\s+barat|jalur|ruas|tol)\s+([a-z]+)\s*[-–—/]\s*([a-z]+)',
    flags=re.IGNORECASE,
)


def _mask_route_endpoint_pairs_when_specific_pass_present(text_lower: str) -> str:
    """Masks `<CityA>-<CityB>` road-name descriptors when a Tier-1 pass is present.

    e.g. "jalan lintas pekanbaru-padang via sitinjau lauik" -> the
    "pekanbaru-padang" road-name substring is blanked so the cities inside the
    road's name are never mistaken for the landslide pinpoint.
    """
    has_pass = any(p in text_lower for p in _SPECIFIC_PASS_KEYS)
    has_via = ("via " in text_lower) or re.search(r'\bdi\s+[a-z]', text_lower) is not None
    if not (has_pass or ("via " in text_lower)):
        # Require either a known pass or an explicit via-connector before masking,
        # to avoid nuking legitimate "A-B" incident mentions.
        if not has_pass:
            return text_lower
    def _repl(m: re.Match) -> str:
        return " "
    masked = _ROUTE_PAIR_RE.sub(_repl, text_lower)
    # Also handle "tol padang-pekanbaru"-style without jalan/jalur prefix
    masked2 = re.sub(r'\btol\s+([a-z]+)\s*[-–—/]\s*([a-z]+)', ' ', masked, flags=re.IGNORECASE)
    return masked2


def _norm_key_pattern(key: str) -> str:
    """Word-boundary regex allowing hyphen or whitespace between words."""
    parts = [re.escape(w) for w in key.split()]
    inner = r'[-\s]+'.join(parts) if parts else re.escape(key)
    return r'\b' + inner + r'\b'


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


ROAD_OR_CHOKEPOINT_MARKERS = (
    "jl.", "jalan ", "jalur ", "km ", "km.", "kilometer", "jembatan",
    "gerbang tol", "ruas tol", "pintu tol", "jalan tol", "pelabuhan",
    "dermaga", "simpang", "flyover", "underpass", "overpass",
)

ROAD_ACCIDENT_MARKERS = (
    "truk terguling", "mobil terguling", "bus terguling",
    "kecelakaan", "tabrakan", "tronton", "trailer mogok",
    "tabrakan beruntun", "terguling",
)

SUBDISTRICT_MARKERS = (
    "kecamatan", "kec.", "kelurahan", "kel.", "desa", "gampong", "nagari", "pekon"
)


def _classify_location_precision(entry_prec_tier: str, tier_val: int, text_lower: str) -> str:
    has_road_marker = any(m in text_lower for m in ROAD_OR_CHOKEPOINT_MARKERS)
    has_accident = any(m in text_lower for m in ROAD_ACCIDENT_MARKERS)
    has_subdistrict_marker = any(m in text_lower for m in SUBDISTRICT_MARKERS)

    # 1. If entry itself is designated corridor point (ports, toll gates, passes, bridges)
    if entry_prec_tier == "corridor_point":
        return "corridor_point"

    # 2. If subdistrict / kecamatan node with accident or road marker -> corridor_point
    if (entry_prec_tier == "kecamatan_kelurahan" or tier_val == 1) and (has_road_marker or has_accident):
        return "corridor_point"

    # 3. Explicit road / corridor marker present with accident / km / toll / bridge
    if has_road_marker and (has_accident or "km" in text_lower or "jembatan" in text_lower or "tol" in text_lower or "pelabuhan" in text_lower):
        return "corridor_point"

    # 4. If subdistrict node or marker
    if entry_prec_tier == "kecamatan_kelurahan" or has_subdistrict_marker:
        return "kecamatan_kelurahan"

    # 5. Otherwise tier 2 regency / city
    if entry_prec_tier == "kabupaten_kota" or tier_val == 2:
        return "kabupaten_kota"

    return "kabupaten_kota"


def resolve_all_sumatra_locations(text: str, fallback_province: str = "Sumatera Utara") -> List[Dict[str, Any]]:
    """Finds ALL distinct matched locations with 3-tier micro-spatial specificity.

    - Tier 1 present  -> Tier 1 location(s) + Tier 2 outside masked road-name
      descriptors (dedupe within 15 km).
    - Else Tier 2     -> ALL matched Tier 2 Kabupaten/Kota (dedupe 15 km).
    - Else Tier 3 only-> single fallback-province centroid entry (province_only).
    - Else            -> [] (bare-province scan may still yield province_only).
    """
    clean_text = strip_bureau_and_dateline_noise(text or "")
    text_lower = clean_text.lower()
    masked_lower = _mask_route_endpoint_pairs_when_specific_pass_present(text_lower)

    tier1_hits: List[Dict[str, Any]] = []
    tier2_hits: List[Dict[str, Any]] = []
    tier3_hit_key: Optional[str] = None

    for key in _tiered_keys():
        data = PAN_SUMATRA_GAZETTEER[key]
        tier = data.get("tier", 2)
        prec_tier = data.get("precision_tier")
        if not prec_tier:
            if tier == 1:
                if any(w in key.lower() or w in data.get("corridor", "").lower() for w in ("pelabuhan", "tol", "jembatan", "dermaga", "bandara", "km", "kelok", "sitinjau", "pass", "flyover", "terminal")):
                    prec_tier = "corridor_point"
                else:
                    prec_tier = "kecamatan_kelurahan"
            elif tier == 2:
                prec_tier = "kabupaten_kota"
            elif tier == 3:
                prec_tier = "corridor_point"
            else:
                prec_tier = "kabupaten_kota"

        if key in BARE_PROVINCE_KEYS:
            continue
        pat = _norm_key_pattern(key)
        # For specificity filtering, Tier-2 membership is tested against the
        # masked text so road-name endpoints (pekanbaru/padang) don't count.
        haystack = text_lower if tier == 1 else masked_lower
        # Tier 3 macro-corridors also tested on masked text.
        if tier == 3:
            haystack = masked_lower
        try:
            if not re.search(pat, haystack):
                continue
        except re.error:
            if key not in haystack:
                continue
        lat, lon = data["coords"]
        loc_prec = _classify_location_precision(prec_tier, tier, text_lower)
        entry = {
            "name": key.title(),
            "key": key,
            "latitude": lat,
            "longitude": lon,
            "province": data["province"],
            "corridor_segment": data["corridor"],
            "location_precision": loc_prec,
            "location_precision_legacy": "exact_node" if loc_prec != "province_only" else "province_only",
            "tier": tier,
        }
        if tier == 1:
            tier1_hits.append(entry)
        elif tier == 2:
            tier2_hits.append(entry)
        elif tier == 3 and tier3_hit_key is None:
            tier3_hit_key = key

    def _dedupe(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for e in entries:
            dup = False
            for o in out:
                if _haversine_km(e["latitude"], e["longitude"], o["latitude"], o["longitude"]) < 15.0:
                    dup = True
                    break
            if not dup:
                out.append(e)
        return out

    if tier1_hits:
        combined = _dedupe(tier1_hits + tier2_hits)
        result = []
        for e in combined:
            # SPEC-LOCKED Q1: hard bbox — gazetteer typos can never leak Java.
            if not is_within_strict_sumatra_bbox(e["latitude"], e["longitude"]):
                continue
            result.append({
                "name": e["name"],
                "latitude": e["latitude"],
                "longitude": e["longitude"],
                "province": e["province"],
                "corridor_segment": e["corridor_segment"],
                "location_precision": e.get("location_precision", "corridor_point"),
                "location_precision_legacy": e.get("location_precision_legacy", "exact_node"),
                "tier": e.get("tier", 1),
            })
        # SPEC-LOCKED Q1: Java-marker guard. A Tier-1 pinpoint (port/pass/road
        # node matched verbatim) is specific enough to keep even when a
        # Java toponym is mentioned alongside (e.g. "Bakauheni-Merak").
        # Tier-1 hits are therefore always kept; Tier-2 companions of a
        # Java-marker article are kept only with explicit Sumatra context
        # (checked below for the Tier-2-only path).
        if result:
            return result
        # All Tier-1 hits were out-of-bbox (should never happen) → fall through
        # to ungeocoded rather than a blind centroid.

    if tier2_hits:
        deduped = _dedupe(tier2_hits)
        # Drop bureau-HQ "Medan" when 2+ other specific kabupaten matched and
        # the raw text carries bureau/agency attribution context.
        names_lower = {e["name"].lower() for e in deduped}
        if len(deduped) >= 3 or (len(deduped) >= 2 and "medan" in names_lower):
            raw_lower = (text or "").lower()
            if any(tok in raw_lower for tok in ("antara", "bpbd", "pemprov", "polda", "dateline", "medan (antara", "(antara)")):
                filtered = [e for e in deduped if e["name"].lower() != "medan"]
                # Only drop Medan if at least 2 specific non-Medan locations remain.
                if len(filtered) >= 2:
                    deduped = filtered
        # Also handle case: medan matched but text title is multi-area summary
        # naming other kabupaten — medan is HQ noise, drop it when 2+ others exist.
        if len(deduped) >= 3:
            non_medan = [e for e in deduped if e["name"].lower() != "medan"]
            if len(non_medan) >= 2:
                deduped = non_medan
        # SPEC-LOCKED Q1 hard bbox: drop any Tier-2 hit outside 94-108/-6..6.
        deduped = [e for e in deduped
                   if is_within_strict_sumatra_bbox(e["latitude"], e["longitude"])]
        # SPEC-LOCKED Q1 Java-marker guard (Sumbing Jateng must NOT resolve
        # to Medan): a Tier-2-only result alongside a Java/out-of-island
        # toponym is admitted uncertainty — drop it unless the text carries
        # explicit Sumatra province context (sumut/sumbar/riau/aceh/jambi/
        # sumsel/bengkulu/lampung/babel/kepri/sumatera...). Tier-1 pinpoints
        # are exempt (handled above) since a verbatim port/pass node is
        # specific enough.
        if deduped and contains_out_of_sumatra_marker(text_lower):
            _sumatra_ctx = (
                "sumatera", "sumatra", "sumut", "sumbar", "sumsel", "babel",
                "kepri", "bengkulu", "lampung", "jambi", "riau", "aceh",
                "jalinsum", "jalintim", "jalinbar", "jalinteng", "jtts",
            )
            if not any(_c in text_lower for _c in _sumatra_ctx):
                return []
        if not deduped:
            # Fell through bbox/marker filtering → ungeocoded, never centroid.
            return []
        return [
            {
                "name": e["name"],
                "latitude": e["latitude"],
                "longitude": e["longitude"],
                "province": e["province"],
                "corridor_segment": e["corridor_segment"],
                "location_precision": e.get("location_precision", "kabupaten_kota"),
                "location_precision_legacy": e.get("location_precision_legacy", "exact_node"),
                "tier": e.get("tier", 2),
            }
            for e in deduped
        ]

    if tier3_hit_key is not None:
        # SPEC-LOCKED Q1: a Java/out-of-island marker without explicit Sumatra
        # context vetoes even macro-corridor fallbacks (admit uncertainty).
        if contains_out_of_sumatra_marker(text_lower):
            _ctx3 = ("sumatera", "sumatra", "sumut", "sumbar", "sumsel", "babel",
                     "kepri", "bengkulu", "lampung", "jambi", "riau", "aceh")
            if not any(_c in text_lower for _c in _ctx3):
                return []
        lat, lon = PROVINCE_CENTROIDS.get(fallback_province, (None, None))
        if lat is None:
            lat, lon = -1.0, 102.0
        if not is_within_strict_sumatra_bbox(lat, lon):
            return []
        return [{
            "name": tier3_hit_key.title(),
            "latitude": lat,
            "longitude": lon,
            "province": fallback_province,
            "corridor_segment": PAN_SUMATRA_GAZETTEER[tier3_hit_key]["corridor"],
            "location_precision": "province_only",
            "location_precision_legacy": "province_only",
            "tier": 3,
        }]

    # Bare-province scan → province_only.
    for needle, canon in sorted(BARE_PROVINCE_ALIASES.items(), key=lambda kv: len(kv[0]), reverse=True):
        if re.search(r'\b' + re.escape(needle) + r'\b', text_lower):
            lat, lon = PROVINCE_CENTROIDS.get(canon, (None, None))
            if lat is None:
                continue
            return [{
                "name": canon,
                "latitude": lat,
                "longitude": lon,
                "province": canon,
                "corridor_segment": "Jalur Arteri Logistik Sumatera",
                "location_precision": "province_only",
                "location_precision_legacy": "province_only",
                "tier": 4,
            }]
    return []


def resolve_sumatra_location_and_corridor(text: str, fallback_province: str = "Sumatera Utara") -> Dict[str, Any]:
    """
    Resolves the best matching location, coordinates, province, and corridor segment
    from article text using the pan-Sumatra gazetteer.

    - Strips bureau/dateline noise before matching.
    - Uses Tier-1-first specificity hierarchy with route-endpoint demotion.
    - Classifies location_precision into 3-tier hierarchy:
      * "corridor_point": pinpoint road/bridge/toll/port node
      * "kecamatan_kelurahan": sub-district area hazard
      * "kabupaten_kota": regency/city broad mention
      * "province_only": bare province mention
    - CRITICAL: when nothing matches, NO blind fallback-centroid assignment is
      performed; returns is_geocoded=False with None coordinates.
    """
    locations = resolve_all_sumatra_locations(text, fallback_province=fallback_province)
    if locations:
        top = locations[0]
        return {
            "matched_node": top["name"],
            "latitude": top["latitude"],
            "longitude": top["longitude"],
            "province": top["province"],
            "corridor_segment": top["corridor_segment"],
            "is_geocoded": True,
            "location_precision": top.get("location_precision", "corridor_point"),
            "location_precision_legacy": top.get("location_precision_legacy", "exact_node"),
            "affected_locations": locations,
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
        "location_precision_legacy": "none",
        "affected_locations": [],
    }
