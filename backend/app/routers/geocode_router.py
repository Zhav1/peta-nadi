"""
PreHub : Pan-Sumatra Universal Geocoding & Village Dispatcher Router
Provides hierarchical geocoding across Pan-Sumatra strategic gazetteer nodes,
high-precision ADM boundaries, and OpenStreetMap Nominatim universal village
(desa/kelurahan/nagari/gampong) & kecamatan search and reverse geocoding.
"""
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
import httpx
from fastapi import APIRouter, Query, HTTPException

from app.nlp.gazetteer_data import (
    PAN_SUMATRA_GAZETTEER,
    SUMATRA_BOUNDING_BOX,
    rank_admin_gazetteer,
)
from app.services.adm_boundary_service import get_adm_boundaries
from app.services.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/geocode",
    tags=["Universal Geocoding & Gazetteers"],
)

# In-memory LRU-ish cache to avoid excessive external HTTP calls.
# Bounded so a long-running Render instance cannot grow without limit.
_IN_MEMORY_SEARCH_CACHE: Dict[str, List[Dict[str, Any]]] = {}
_IN_MEMORY_REVERSE_CACHE: Dict[str, Dict[str, Any]] = {}
_IN_MEMORY_CACHE_LIMIT = 512

# Administrative prefixes users type but gazetteer slugs usually omit.
_ADMIN_PREFIXES = (
    "kecamatan ",
    "kec. ",
    "kec ",
    "kelurahan ",
    "kel. ",
    "kel ",
    "desa ",
    "gampong ",
    "nagari ",
    "pekon ",
    "kabupaten ",
    "kab. ",
    "kab ",
    "kota ",
    "kotamadya ",
    "kodya ",
)

NOMINATIM_HEADERS = {
    "User-Agent": "PreHubSumatraLogistics/1.0 (Live Fleet Pilot Sumatra; contact@pidi.id)"
}


def _remember(cache: Dict[str, Any], cache_key: str, value: Any) -> None:
    """Insert into a bounded in-memory cache, evicting the oldest entry."""
    cache[cache_key] = value
    while len(cache) > _IN_MEMORY_CACHE_LIMIT:
        cache.pop(next(iter(cache)))


def _normalize_query(text: str) -> str:
    """Lowercase + collapse whitespace + strip `kecamatan/kota/desa` prefixes."""
    value = " ".join((text or "").lower().split())
    changed = True
    while changed:
        changed = False
        for prefix in _ADMIN_PREFIXES:
            if value.startswith(prefix) and len(value.strip()) > len(prefix):
                value = value[len(prefix):].strip()
                changed = True
    return value


def _match_score(slug: str, query: str) -> Optional[int]:
    """Rank a legacy hub slug against the normalized query (lower is better).

    Legacy hub nodes (ports, passes, corridors) have no aliases/parent data, so
    they only ever score exact/prefix/word/substring. The admin gazetteer's
    alias/typo matcher lives in ``app.nlp.gazetteer_data``.
    """
    if not query:
        return None
    s = slug.lower()
    if s == query:
        return 0
    if s.startswith(query):
        return 1
    if f" {query}" in s:
        return 2
    if query in s:
        return 3
    return None


# Rank per result type used only as a tie-breaker (kota/kabupaten above kecamatan).
_RESULT_TYPE_RANK = {
    "city": 0,
    "kota": 0,
    "regency": 1,
    "kabupaten": 1,
    "kecamatan": 2,
    "subdistrict": 2,
    "hub": 3,
    "strategic_hub": 3,
    "corridor_point": 3,
}


def _normalized_name(value: str) -> str:
    return " ".join((value or "").lower().split())


def _is_same_place(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """Same display name AND within 5 km → one place, not two."""
    if _normalized_name(a.get("name")) != _normalized_name(b.get("name")):
        return False
    try:
        return haversine_km(float(a["lat"]), float(a["lon"]), float(b["lat"]), float(b["lon"])) < 5.0
    except (KeyError, TypeError, ValueError):
        return False


def _merge_ranked(rows: List[Tuple[int, int, int, Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Merge ranked rows (tier, type_rank, name_len, result), de-duping places."""
    rows.sort(key=lambda row: (row[0], row[1], row[2], _normalized_name(row[3].get("name"))))
    merged: List[Dict[str, Any]] = []
    for _tier, _type_rank, _name_len, result in rows:
        if any(_is_same_place(existing, result) for existing in merged):
            continue
        merged.append(result)
    return merged


def _gazetteer_result_type(data: Dict[str, Any]) -> str:
    """Honest structural type for a gazetteer hit (used for UI badges)."""
    precision = data.get("precision_tier")
    if precision == "corridor_point":
        return "hub"
    if precision == "kecamatan_kelurahan":
        return "kecamatan"
    tier = data.get("tier", 2)
    if tier == 1:
        return "kecamatan"
    if tier == 2:
        return "regency"
    return "hub"


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
            # Never fabricate a Medan centroid for a node without coordinates.
            coords = data.get("coords")
            if not coords or len(coords) != 2:
                logger.warning("Gazetteer node '%s' missing coords; skipping", slug)
                continue
            nodes.append({
                "id": slug,
                "name": slug.title(),
                "lat": coords[0],
                "lon": coords[1],
                "province": data.get("province", "Sumatera"),
                "corridor": data.get("corridor", "Jalinsum Arteri"),
                "tier": "regency",
                "precision_tier": data.get("precision_tier"),
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
    Searches the offline kabupaten/kota + kecamatan gazetteer first (aliases,
    province/parent, diacritics, typos), then strategic hub nodes, then queries
    OpenStreetMap Nominatim bounded to Sumatra (95.0, -6.2 to 109.0, 6.0) for
    desa/kelurahan/nagari/gampong. `nominatim` in the response is
    ``ok|unavailable|skipped|cached`` so the UI can say when a desa lookup
    needs a connection instead of implying the place does not exist.
    """
    query_clean = q.strip()
    cache_key = f"{query_clean.lower()}:{limit}"

    # 1. Check in-memory cache
    if cache_key in _IN_MEMORY_SEARCH_CACHE:
        cached_results = _IN_MEMORY_SEARCH_CACHE[cache_key]
        return {
            "status": "success",
            "query": query_clean,
            "cached": True,
            "count": len(cached_results),
            "nominatim": "cached",
            "offline": sum(1 for row in cached_results if row.get("source") == "gazetteer"),
            "results": cached_results
        }

    # 2. Check Redis cache
    r = get_redis()
    if r is not None:
        try:
            cached_val = r.get(f"lrip:geocode:search:v2:{cache_key}")
            if cached_val:
                import json
                parsed = json.loads(cached_val)
                _remember(_IN_MEMORY_SEARCH_CACHE, cache_key, parsed)
                return {
                    "status": "success",
                    "query": query_clean,
                    "cached": True,
                    "count": len(parsed),
                    "nominatim": "cached",
                    "offline": sum(1 for row in parsed if row.get("source") == "gazetteer"),
                    "results": parsed
                }
        except Exception as e:
            logger.debug(f"Redis search cache lookup error: {e}")

    results: List[Dict[str, Any]] = []

    # 3. Offline gazetteer: kabupaten/kota + kecamatan (alias/province/parent/
    # slug matching with diacritic + typo tolerance) followed by the legacy
    # strategic-hub nodes (ports, passes, corridors).
    query_norm = _normalize_query(query_clean) or query_clean.lower()
    rows: List[Tuple[int, int, int, Dict[str, Any]]] = []

    admin_hits = rank_admin_gazetteer(query_clean, limit=max(limit * 2, 10))
    for tier, result in admin_hits:
        rows.append((tier, _RESULT_TYPE_RANK.get(result["type"], 9), len(result["name"]), result))

    admin_exact_hit = bool(admin_hits) and admin_hits[0][0] == 0

    for slug, data in PAN_SUMATRA_GAZETTEER.items():
        score = _match_score(slug, query_norm)
        if score is None:
            continue
        coords = data["coords"]
        result_type = _gazetteer_result_type(data)
        rows.append((
            score,
            _RESULT_TYPE_RANK.get(result_type, 9),
            len(slug),
            {
                "name": slug.title(),
                "display_name": f"{slug.title()}, {data['province']}, Indonesia",
                "lat": coords[0],
                "lon": coords[1],
                "type": result_type,
                "province": data.get("province"),
                "parent": data.get("province"),
                "kabupaten": slug.title(),
                "kecamatan": None,
                "source": "gazetteer",
            },
        ))

    exact_gazetteer_hit = admin_exact_hit or any(row[0] == 0 for row in rows)
    results = _merge_ranked(rows)[:limit]
    offline_count = len(results)

    # 4. Query OpenStreetMap Nominatim for villages, gampong, nagari, subdistricts.
    # Skip the external round-trip when the gazetteer already has an exact match
    # (kota/hub queries): SPEC is gazetteer-first, and Nominatim adds seconds of
    # latency to every keystroke search for no extra precision on an exact node.
    nominatim_state = "skipped"
    if len(results) < limit and not exact_gazetteer_hit:
        nominatim_state = "unavailable"
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
                    nominatim_state = "ok"
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

                        addr = item.get("address", {})
                        prov = addr.get("state") or addr.get("province") or "Sumatera"
                        kab = addr.get("county") or addr.get("city") or addr.get("regency") or ""
                        kec = addr.get("municipality") or addr.get("subdistrict") or addr.get("district") or addr.get("town") or ""
                        village = addr.get("village") or addr.get("hamlet") or addr.get("suburb") or addr.get("neighbourhood") or ""

                        place_name = village or kec or item.get("name") or query_clean.title()
                        p_type = item.get("type") or item.get("addresstype") or "village"

                        candidate = {
                            "name": place_name,
                            "display_name": item.get("display_name", f"{place_name}, {kab}, {prov}"),
                            "lat": round(lat, 6),
                            "lon": round(lon, 6),
                            "type": p_type,
                            "province": prov,
                            "parent": kec or kab or prov,
                            "kabupaten": kab,
                            "kecamatan": kec,
                            "village": village,
                            "source": "nominatim"
                        }
                        # Same name + within 5 km of an offline hit → one place.
                        if any(_is_same_place(existing, candidate) for existing in results):
                            continue
                        results.append(candidate)
                        if len(results) >= limit:
                            break
        except Exception as e:
            logger.warning(f"Nominatim search query exception: {e}")
            nominatim_state = "unavailable"

    # Cache only non-empty hits: caching an empty list after a transient
    # Nominatim failure would pin "no results" for the process lifetime.
    if results:
        _remember(_IN_MEMORY_SEARCH_CACHE, cache_key, results)
        if r is not None:
            try:
                import json
                r.set(f"lrip:geocode:search:v2:{cache_key}", json.dumps(results), ex=86400)
            except Exception:
                pass

    # NOTE: on a total miss we return an honest empty list — never a Medan or
    # province centroid as a fabricated "best guess".
    return {
        "status": "success",
        "query": query_clean,
        "cached": False,
        "count": len(results),
        "nominatim": nominatim_state,
        "offline": offline_count,
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
                _remember(_IN_MEMORY_REVERSE_CACHE, cache_key, parsed)
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
            _remember(_IN_MEMORY_REVERSE_CACHE, cache_key, info)
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

    _remember(_IN_MEMORY_REVERSE_CACHE, cache_key, info)
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
