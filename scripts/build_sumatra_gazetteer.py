#!/usr/bin/env python
"""Build the offline Sumatra administrative gazetteer (kabupaten/kota + kecamatan).

Reproducible, one-shot generator. The committed output is consumed read-only by
``app.nlp.gazetteer_data`` at runtime; nothing is fetched while serving requests.

Provenance, measured on 2026-10-27 (SPEC M9 decision 6)
------------------------------------------------------
1. **Hierarchy** — ``https://wilayah.id/api``: the 10 Sumatra provinces,
   152 kabupaten/kota and 1,966 kecamatan with BPS codes and parent regency.
   This is the authoritative name list; no name is invented downstream.
2. **Coordinates from OSM Overpass** — boundary relations at admin_level 5/6/7
   per province area, plus (for names OSM spells differently) a
   space-insensitive name match over the same cached relations and a place-node
   pass. Every match must be structurally the right level: a desa (4-segment
   BPS ref) can never stand in for a kecamatan.
3. **Coordinates from Wikidata** — one item per Indonesian kecamatan
   (P31 = Q3700011) with P625 and P131 parent. Used only for kecamatan that OSM
   has never mapped (Kepulauan Bangka Belitung has 47 kecamatan and zero
   boundaries; Lampung 229 and 15). Matched on (compacted name + parent
   regency), then (compacted name + province) only when unique.
4. **Coordinates from Nominatim** — for whatever is left (1 req/s, timeboxed;
   results must carry a matching province/regency address).

Anything still unresolved is DROPPED and counted. No record gets an
interpolated, averaged or "nearest big city" centroid, and nothing is padded to
reach a target count.

Why Overpass admin_level 6/7 is not used as the type source
-----------------------------------------------------------
Measured on 2026-10-27: OSM Indonesia uses **two** incompatible schemes.
Newer imports put kabupaten/kota at ``admin_level=5``, kecamatan at 6 and
desa/kelurahan at 7 ("Kota Medan" = 5, ref 12.71; "Medan Kota" = 6, ref
12.71.01). Older imports put kecamatan at 7 and sometimes kabupaten at 6.
Querying only 6 and 7 therefore returns kecamatan labelled as kabupaten and
desa/kelurahan labelled as kecamatan — 1,298 elements for the first five
provinces with zero kabupaten for Sumbar/Sumut. The generator reads 5, 6 and 7
and classifies by BPS ``ref`` depth (2 segments = kabupaten/kota, 3 =
kecamatan) plus the ``Kabupaten``/``Kota`` name prefix, so the type field is
structural, not assumed.

Usage
-----
    python scripts/build_sumatra_gazetteer.py             # build + write
    python scripts/build_sumatra_gazetteer.py --refresh    # ignore HTTP cache
    python scripts/build_sumatra_gazetteer.py --dry-run    # stats only
    python scripts/build_sumatra_gazetteer.py --no-nominatim  # skip the geocoder tier
    python scripts/build_sumatra_gazetteer.py --no-place-nodes  # skip the OSM node tier
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = REPO_ROOT / "backend" / "app" / "nlp" / "data" / "sumatra_admin_gazetteer.json"

# Sumatra bbox (lon_min, lat_min, lon_max, lat_max) — SPEC decision 6.
BBOX_LON_MIN, BBOX_LAT_MIN, BBOX_LON_MAX, BBOX_LAT_MAX = 94.0, -6.0, 108.0, 6.0

OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
WILAYAH_API = "https://wilayah.id/api"
USER_AGENT = "PreHubSumatraGazetteerBuilder/1.0 (contact@pidi.id)"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

CACHE_DIR = Path(tempfile.gettempdir()) / "prehub_sumatra_gazetteer"

PROVINCES = (
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Jambi",
    "Sumatera Selatan",
    "Bengkulu",
    "Lampung",
    "Kepulauan Bangka Belitung",
    "Kepulauan Riau",
)

PROVINCE_CODES = {
    "11": "Aceh",
    "12": "Sumatera Utara",
    "13": "Sumatera Barat",
    "14": "Riau",
    "15": "Jambi",
    "16": "Sumatera Selatan",
    "17": "Bengkulu",
    "18": "Lampung",
    "19": "Kepulauan Bangka Belitung",
    "21": "Kepulauan Riau",
}

_ADMIN_NAME_PREFIXES = ("Kecamatan ", "Kec. ", "Kec ", "Kabupaten ", "Kab. ", "Kab ", "Kota ", "Kotamadya ")
_ALIAS_TAGS = ("name", "name:id", "alt_name", "official_name", "old_name", "short_name", "int_name", "loc_name")

# Phase 176.7: the committed dataset must use exactly one `type` vocabulary so
# an API consumer never sees `regency`/`city`/`district` for a kabupaten/kota/
# kecamatan. The generator only emits the three canonical values; this alias map
# keeps a future source that speaks OSM/Nominatim English from leaking them.
GAZETTEER_TYPES = ("kabupaten", "kota", "kecamatan")
_TYPE_ALIASES = {
    "regency": "kabupaten",
    "kabupaten": "kabupaten",
    "county": "kabupaten",
    "city": "kota",
    "kota": "kota",
    "district": "kecamatan",
    "subdistrict": "kecamatan",
    "sub_district": "kecamatan",
    "kecamatan": "kecamatan",
}


def normalize_gazetteer_type(value) -> Optional[str]:
    """Canonical `type` for the committed dataset, or None when unrecognised."""
    if value is None:
        return None
    return _TYPE_ALIASES.get(str(value).strip().lower())


# --------------------------------------------------------------------------- #
# text helpers (mirrored by backend/app/nlp/gazetteer_data.py)
# --------------------------------------------------------------------------- #
def normalize_text(value: str) -> str:
    """Casefold, strip diacritics/punctuation, collapse whitespace."""
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value))
    asciiish = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    asciiish = asciiish.replace("&", " dan ").replace("/", " ")
    asciiish = re.sub(r"[^0-9A-Za-z]+", " ", asciiish)
    return " ".join(asciiish.casefold().split())


def slugify(value: str) -> str:
    return normalize_text(value).replace(" ", "-")


def _clean_name(raw: str) -> str:
    """Strip administrative prefixes and trailing parentheticals for display."""
    name = re.sub(r"\s*\([^)]*\)\s*$", "", (raw or "").strip())
    changed = True
    while changed:
        changed = False
        for prefix in _ADMIN_NAME_PREFIXES:
            if name.startswith(prefix) and len(name) > len(prefix):
                name = name[len(prefix):].strip()
                changed = True
    return name.strip()


def _in_bbox(lat: float, lon: float) -> bool:
    return BBOX_LAT_MIN <= lat <= BBOX_LAT_MAX and BBOX_LON_MIN <= lon <= BBOX_LON_MAX


def _ref_parts(raw: Optional[str]) -> List[str]:
    digits = re.sub(r"[^0-9.]", "", raw or "").strip(".")
    return [p for p in digits.split(".") if p]


# --------------------------------------------------------------------------- #
# HTTP with cache + backoff
# --------------------------------------------------------------------------- #
class FetchError(RuntimeError):
    pass


def _cached_json(name: str, refresh: bool) -> Optional[dict]:
    path = CACHE_DIR / f"{name}.json"
    if refresh or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _store_json(name: str, payload: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / f"{name}.json").write_text(json.dumps(payload), encoding="utf-8")


def _http_json(url: str, *, params: Optional[dict] = None, attempts: int = 3, timeout: float = 60.0) -> dict:
    last_error = ""
    for attempt in range(attempts):
        try:
            resp = httpx.get(url, params=params, headers=HEADERS, timeout=timeout)
            if resp.status_code == 200:
                return resp.json()
            last_error = f"{url} -> HTTP {resp.status_code}: {resp.text[:140]}"
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            last_error = f"{url} -> {exc.__class__.__name__}: {exc}"
        print(f"  [retry] {last_error}")
        time.sleep(2.0 * (attempt + 1))
    raise FetchError(last_error)


def wilayah_get(path: str, refresh: bool = False) -> dict:
    cache_name = "wilayah_" + path.replace("/", "_").replace(".json", "")
    cached = _cached_json(cache_name, refresh)
    if cached is not None:
        return cached
    payload = _http_json(f"{WILAYAH_API}/{path}", timeout=45.0)
    _store_json(cache_name, payload)
    return payload


def overpass_query(query: str, cache_name: str, refresh: bool = False, attempts: int = 3) -> dict:
    """POST an Overpass QL query, walking mirrors with exponential backoff."""
    cached = _cached_json(cache_name, refresh)
    if cached is not None:
        print(f"  [cache] {cache_name} ({len(cached.get('elements', []))} elements)")
        return cached

    delay = 5.0
    last_error = ""
    for attempt in range(attempts):
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                resp = httpx.post(endpoint, data={"data": query}, headers=HEADERS, timeout=300.0)
                if resp.status_code == 200:
                    payload = resp.json()
                    _store_json(cache_name, payload)
                    print(f"  [http ] {cache_name} via {endpoint} ({len(payload.get('elements', []))} elements)")
                    return payload
                last_error = f"{endpoint} -> HTTP {resp.status_code}: {resp.text[:140]}"
            except (httpx.HTTPError, json.JSONDecodeError) as exc:
                last_error = f"{endpoint} -> {exc.__class__.__name__}: {exc}"
            print(f"  [retry] {last_error}")
            time.sleep(2.0)
        if attempt < attempts - 1:
            print(f"  [backoff] sleeping {delay:.0f}s before attempt {attempt + 2}")
            time.sleep(delay)
            delay *= 2
    raise FetchError(last_error or "Overpass unavailable")


# --------------------------------------------------------------------------- #
# Source: wilayah.id hierarchy (names, parents, BPS codes)
# --------------------------------------------------------------------------- #
def fetch_hierarchy(refresh: bool) -> List[dict]:
    provinces = [
        pump for pump in wilayah_get("provinces.json", refresh).get("data", [])
        if str(pump.get("code")) in PROVINCE_CODES
    ]
    if len(provinces) != len(PROVINCE_CODES):
        found = {str(p.get("code")) for p in provinces}
        missing = sorted(set(PROVINCE_CODES) - found)
        raise FetchError(f"wilayah.id missing Sumatra provinces: {missing}")

    hierarchy: List[dict] = []
    for province in provinces:
        code = str(province["code"])
        province_name = PROVINCE_CODES[code]
        regencies = wilayah_get(f"regencies/{code}.json", refresh).get("data", [])
        if not regencies:
            raise FetchError(f"wilayah.id returned no regencies for {province_name}")
        entry = {"code": code, "name": province_name, "regencies": []}
        for regency in regencies:
            reg_code = str(regency["code"])
            raw_name = regency.get("name", "")
            districts = wilayah_get(f"districts/{reg_code}.json", refresh).get("data", [])
            entry["regencies"].append(
                {
                    "code": reg_code,
                    "raw_name": raw_name,
                    "name": _clean_name(raw_name),
                    "type": "kota" if raw_name.strip().lower().startswith(("kota ", "kotamadya")) else "kabupaten",
                    "districts": [
                        {"code": str(d["code"]), "name": _clean_name(d.get("name", ""))}
                        for d in districts
                        if d.get("name")
                    ],
                }
            )
        print(f"  {province_name}: {len(entry['regencies'])} kab/kota, "
              f"{sum(len(r['districts']) for r in entry['regencies'])} kecamatan")
        hierarchy.append(entry)
    return hierarchy


# --------------------------------------------------------------------------- #
# Source: OSM Overpass boundary centroids (levels 5/6/7, classified by ref depth)
# --------------------------------------------------------------------------- #
def fetch_boundaries(refresh: bool) -> Dict[str, List[dict]]:
    """Return boundary relations per province, with a structural type guess."""
    # Province areas need the real relation ids; fetch them first.
    province_query = (
        '[out:json][timeout:180];'
        'rel["boundary"="administrative"]["admin_level"="4"]'
        f"({BBOX_LAT_MIN},{BBOX_LON_MIN},{BBOX_LAT_MAX},{BBOX_LON_MAX});"
        "out center tags;"
    )
    provinces = overpass_query(province_query, "province_level4", refresh=refresh)

    selected: List[dict] = []
    for element in provinces.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name") or ""
        if name in PROVINCES or _province_by_osm_name(tags):
            selected.append({"id": element["id"], "name": _province_by_osm_name(tags) or name})

    by_province: Dict[str, List[dict]] = {}
    for province in selected:
        area_id = 3_600_000_000 + int(province["id"])
        child_query = (
            '[out:json][timeout:900];'
            f"area({area_id})->.a;"
            'rel["boundary"="administrative"]["admin_level"~"^(5|6|7)$"](area.a);'
            "out center tags;"
        )
        payload = overpass_query(child_query, f"boundaries_{area_id}", refresh=refresh)
        elements = payload.get("elements", [])
        by_province[province["name"]] = elements
        print(f"  {province['name']}: {len(elements)} OSM boundary relations (level 5/6/7)")
    return by_province


def _province_by_osm_name(tags: Dict[str, str]) -> Optional[str]:
    for key in ("name:id", "name"):
        value = normalize_text(tags.get(key) or "")
        for canonical in PROVINCES:
            if normalize_text(canonical) == value:
                return canonical
        if value in ("nanggroe aceh darussalam", "daerah istimewa aceh"):
            return "Aceh"
        if value in ("sumatra utara",):
            return "Sumatera Utara"
        if value in ("sumatra barat",):
            return "Sumatera Barat"
        if value in ("sumatra selatan",):
            return "Sumatera Selatan"
        if value in ("bangka belitung",):
            return "Kepulauan Bangka Belitung"
        if value in ("riau islands", "kepulauan riau"):
            return "Kepulauan Riau"
    return None


def index_boundaries(elements: Iterable[dict]) -> Tuple[Dict[str, dict], Dict[str, List[dict]]]:
    """Build ref and name indexes over the raw OSM relations."""
    by_ref: Dict[str, dict] = {}
    by_name: Dict[str, List[dict]] = {}
    for element in elements:
        tags = element.get("tags", {})
        center = element.get("center") or {}
        name = tags.get("name") or ""
        try:
            lat, lon = float(center["lat"]), float(center["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not _in_bbox(lat, lon) or not name:
            continue
        ref = _ref_parts(tags.get("ref"))
        record = {"id": element["id"], "name": name, "ref": ref, "lat": lat, "lon": lon, "tags": tags}
        if len(ref) >= 2:
            by_ref.setdefault(".".join(ref), record)
        by_name.setdefault(normalize_text(_clean_name(name)), []).append(record)
    return by_ref, by_name


def _looks_like(kind: str, record: dict) -> bool:
    """Type guard so a desa named like a kecamatan can never supply a centroid."""
    ref = record["ref"]
    tags = record["tags"]
    name = (record["name"] or "").strip().lower()
    if kind == "regency":
        return (
            len(ref) == 2
            or str(tags.get("admin_level")) == "5"
            or name.startswith(("kabupaten ", "kota ", "kotamadya "))
        )
    return (
        len(ref) == 3
        or str(tags.get("admin_level")) == "6"
        or name.startswith(("kecamatan ", "kec. "))
    )


def resolve_coords(
    *,
    raw_name: str,
    clean_name: str,
    code: str,
    kind: str,
    by_ref: Dict[str, dict],
    by_name: Dict[str, List[dict]],
    parent_ref: Optional[str] = None,
) -> Tuple[Optional[dict], str]:
    """Resolve one wilayah row to an OSM relation. Returns (record, match_kind).

    Only relations whose structure matches the expected level are accepted:
    a 4-segment `ref` (desa/kelurahan) can never stand in for a kecamatan.
    """
    hit = by_ref.get(code)
    if hit and _looks_like(kind, hit):
        return hit, "ref"

    ref2 = ".".join(code.split(".")[:2])
    candidates = [
        candidate
        for candidate in by_name.get(normalize_text(clean_name), []) + by_name.get(normalize_text(raw_name), [])
        if _looks_like(kind, candidate)
    ]

    def ref_matches(candidate: dict) -> bool:
        target = parent_ref or ref2
        return ".".join(candidate["ref"][:2]) == target

    scoped = [candidate for candidate in candidates if ref_matches(candidate)]
    if len(scoped) == 1:
        return scoped[0], "name+parent"
    if len(candidates) == 1:
        return candidates[0], "name-unique"
    return None, "unmatched"


# --------------------------------------------------------------------------- #
# Source: Nominatim (coordinates only, 1 req/s, disk-cached, timeboxed)
# --------------------------------------------------------------------------- #
NOMINATIM_CACHE_PATH = CACHE_DIR / "nominatim_cache.json"
_NOMINATIM_CACHE: Optional[Dict[str, Optional[List[float]]]] = None


def _nominatim_cache() -> Dict[str, Optional[List[float]]]:
    global _NOMINATIM_CACHE
    if _NOMINATIM_CACHE is None:
        try:
            _NOMINATIM_CACHE = json.loads(NOMINATIM_CACHE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            _NOMINATIM_CACHE = {}
    return _NOMINATIM_CACHE


def _save_nominatim_cache() -> None:
    cache = _nominatim_cache()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    NOMINATIM_CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")


def _nominatim_priority(item: dict, province: str, parent: Optional[str]) -> Optional[int]:
    """Trust + preference check. Returns a priority (lower wins) or None.

    A hit is only accepted when it sits in the expected province (and, when the
    address exposes one, the expected regency). Administrative areas outrank
    same-named settlements; streets and POIs are never accepted.
    """
    if not item.get("lat") or not item.get("lon"):
        return None
    try:
        lat, lon = float(item["lat"]), float(item["lon"])
    except (TypeError, ValueError):
        return None
    if not _in_bbox(lat, lon):
        return None

    item_type = (item.get("type") or item.get("addresstype") or "").lower()
    priority = {
        "administrative": 0,
        "city_district": 1,
        "municipality": 1,
        "county": 2,
        "city": 2,
        "town": 3,
        "village": 3,
        "suburb": 4,
    }.get(item_type)
    if priority is None:
        return None

    address = item.get("address") or {}
    state = normalize_text(address.get("state") or address.get("province") or "")
    province_norm = normalize_text(province)
    if state and province_norm not in state and state not in province_norm:
        return None
    if parent:
        parent_norm = normalize_text(parent)
        county = normalize_text(
            address.get("county")
            or address.get("city")
            or address.get("municipality")
            or address.get("regency")
            or ""
        )
        if county and parent_norm not in county and county not in parent_norm:
            return None
    return priority


async def _nominatim_batch(entries: List[dict], deadline: float, stats: Dict[str, Any]) -> None:
    """Geocode unresolved entries, at most 1 request/second, stopping at deadline."""
    import asyncio

    cache = _nominatim_cache()
    async with httpx.AsyncClient(timeout=30.0) as client:
        for entry in entries:
            if time.monotonic() > deadline:
                stats["timebox_hit"] = True
                return
            queries = entry["nominatim_queries"]
            for query in queries:
                if query in cache:
                    cached = cache[query]
                    if cached:
                        entry["coords"] = (cached[0], cached[1])
                        stats["match"]["nominatim"] += 1
                        break
                    continue

                started = time.monotonic()
                params = {
                    "q": query,
                    "format": "jsonv2",
                    "viewbox": f"{BBOX_LON_MIN},{BBOX_LAT_MAX},{BBOX_LON_MAX},{BBOX_LAT_MIN}",
                    "bounded": "1",
                    "countrycodes": "id",
                    "addressdetails": "1",
                    "limit": 3,
                }
                payload: Optional[list] = None
                try:
                    resp = await client.get(NOMINATIM_URL, params=params, headers=HEADERS)
                    if resp.status_code == 200:
                        payload = resp.json()
                    else:
                        print(f"  [nominatim] HTTP {resp.status_code} for {query}")
                except (httpx.HTTPError, json.JSONDecodeError) as exc:
                    print(f"  [nominatim] {query}: {exc.__class__.__name__}")

                accepted: Optional[Tuple[float, float]] = None
                if payload:
                    best: Optional[Tuple[int, dict]] = None
                    for item in payload:
                        priority = _nominatim_priority(item, entry["province"], entry.get("nom_parent"))
                        if priority is None:
                            continue
                        if best is None or priority < best[0]:
                            best = (priority, item)
                    if best is not None:
                        accepted = (float(best[1]["lat"]), float(best[1]["lon"]))
                cache[query] = [accepted[0], accepted[1]] if accepted else None
                stats["nominatim_attempted"] += 1

                # Nominatim policy: max 1 request/second, measured start-to-start.
                await asyncio.sleep(max(0.0, 1.0 - (time.monotonic() - started)))

                if accepted:
                    entry["coords"] = accepted
                    stats["match"]["nominatim"] += 1
                    break

                if stats["nominatim_attempted"] % 25 == 0:
                    _save_nominatim_cache()

            if entry.get("coords"):
                continue
            stats["unmatched"].append(entry["label"])

        _save_nominatim_cache()


# --------------------------------------------------------------------------- #
# join + validation
# --------------------------------------------------------------------------- #
def build_records(
    hierarchy: List[dict],
    boundaries: Dict[str, List[dict]],
    *,
    use_nominatim: bool,
    timebox_seconds: int,
    refresh: bool = False,
    skip_place_nodes: bool = False,
    use_photon: bool = False,
) -> Tuple[List[dict], Dict[str, Any]]:
    started = time.monotonic()
    stats: Dict[str, Any] = {
        "match": {"ref": 0, "name+parent": 0, "name-unique": 0, "osm-node": 0, "wikidata": 0, "photon": 0, "nominatim": 0},
        "unmatched": [],
        "nominatim_attempted": 0,
        "timebox_hit": False,
    }
    entries: List[dict] = []

    # Pass 1 — every kabupaten/kota across all provinces, then every kecamatan.
    for pass_kind in ("regency", "district"):
        for province in hierarchy:
            province_name = province["name"]
            by_ref, by_name = index_boundaries(boundaries.get(province_name, []))

            for regency in province["regencies"]:
                reg_code = regency["code"]
                reg_name = regency["name"]
                reg_ref2 = ".".join(reg_code.split(".")[:2])

                if pass_kind == "regency":
                    hit, kind = resolve_coords(
                        raw_name=regency["raw_name"],
                        clean_name=reg_name,
                        code=reg_code,
                        kind="regency",
                        by_ref=by_ref,
                        by_name=by_name,
                    )
                    entry = {
                        "kind": regency["type"],
                        "name": reg_name,
                        "raw_name": regency["raw_name"],
                        "province": province_name,
                        "parent": province_name,
                        "code": reg_code,
                        "tags": hit["tags"] if hit else {},
                        "coords": (hit["lat"], hit["lon"]) if hit else None,
                        "label": f"{regency['type']}:{province_name}:{reg_name}",
                        "nom_parent": None,
                        "nominatim_queries": [
                            f"{regency['raw_name']}, {province_name}, Indonesia",
                            f"{reg_name}, {province_name}, Indonesia",
                        ],
                    }
                    if hit:
                        stats["match"][kind] += 1
                    entries.append(entry)
                    continue

                for district in regency["districts"]:
                    dist_code = district["code"]
                    dist_name = district["name"]
                    hit, kind = resolve_coords(
                        raw_name=dist_name,
                        clean_name=dist_name,
                        code=dist_code,
                        kind="district",
                        by_ref=by_ref,
                        by_name=by_name,
                        parent_ref=reg_ref2,
                    )
                    entry = {
                        "kind": "kecamatan",
                        "name": dist_name,
                        "raw_name": dist_name,
                        "province": province_name,
                        "parent": reg_name,
                        "code": dist_code,
                        "tags": hit["tags"] if hit else {},
                        "coords": (hit["lat"], hit["lon"]) if hit else None,
                        "label": f"kecamatan:{province_name}:{reg_name}:{dist_name}",
                        "nom_parent": reg_name,
                        "nominatim_queries": [
                            f"{dist_name}, {regency['raw_name']}, {province_name}, Indonesia",
                            f"{dist_name}, {province_name}, Indonesia",
                        ],
                    }
                    if hit:
                        stats["match"][kind] += 1
                    entries.append(entry)

    unresolved = [entry for entry in entries if not entry["coords"]]
    print(
        f"  OSM relations resolved {len(entries) - len(unresolved)}/{len(entries)}; "
        f"{len(unresolved)} still unmatched"
    )

    # Pass 2b — same cached relations, space-insensitive name match.
    apply_compact_relation_matches(entries, boundaries, stats)

    unresolved = [entry for entry in entries if not entry["coords"]]
    print(f"  {len(unresolved)} still unmatched after compact matching")

    # Pass 3 — OSM place nodes for kecamatan whose relation is missing or whose
    # BPS spelling differs from the OSM name (space-insensitive exact match,
    # accepted only when the name occurs exactly once in the province).
    wanted: Dict[str, List[str]] = {}
    for entry in unresolved:
        if entry["kind"] != "kecamatan":
            continue
        wanted.setdefault(entry["province"], []).append(entry["name"])
    if wanted and not skip_place_nodes:
        try:
            nodes = fetch_place_nodes(
                {province: sorted(set(names)) for province, names in wanted.items()},
                refresh=refresh,
            )
            apply_place_nodes(entries, nodes, stats)
        except FetchError as exc:
            print(f"  [place-nodes] FAILED: {exc}")
            stats["place_node_failed"] = str(exc)

    unresolved = [entry for entry in entries if not entry["coords"]]
    print(f"  {len(unresolved)} still need a geocoder")

    # Pass 3b — Wikidata P625 for kecamatan whose boundary OSM never mapped.
    unresolved = [entry for entry in entries if not entry["coords"] and entry["kind"] == "kecamatan"]
    if unresolved:
        try:
            rows = fetch_wikidata_kecamatan(refresh=refresh)
            apply_wikidata_kecamatan(entries, rows, stats)
        except FetchError as exc:
            print(f"  [wikidata] FAILED: {exc}")
            stats["wikidata_failed"] = str(exc)
        unresolved = [entry for entry in entries if not entry["coords"]]
        print(f"  {len(unresolved)} still need Nominatim after Wikidata")

    # Pass 4 — Photon (OSM-backed), validated by province + regency + name.
    # Opt-in: the public instance is not dependable under bulk load.
    if unresolved and use_photon:
        try:
            import asyncio

            asyncio.run(_photon_batch(unresolved, stats))
        except Exception as exc:  # network tier is best-effort, never fatal
            print(f"  [photon] FAILED: {exc.__class__.__name__}: {exc}")
            stats["photon_failed"] = str(exc)
        unresolved = [entry for entry in entries if not entry["coords"]]
        print(f"  {len(unresolved)} still need Nominatim")

    if unresolved and use_nominatim:
        deadline = started + timebox_seconds
        import asyncio

        asyncio.run(_nominatim_batch(unresolved, deadline, stats))
        # Entries left unresolved because the timebox expired are reported below.
        for entry in unresolved:
            if not entry["coords"] and entry["label"] not in stats["unmatched"] and stats["timebox_hit"]:
                stats.setdefault("timebox_shortfall", []).append(entry["label"])
    elif unresolved:
        for entry in unresolved:
            stats["unmatched"].append(entry["label"])

    records: List[dict] = []
    for entry in entries:
        coords = entry.get("coords")
        if not coords:
            continue
        aliases = _collect_aliases(entry["tags"], entry["name"], entry["kind"])
        prefix = {"kabupaten": "kab", "kota": "kota", "kecamatan": "kec"}[entry["kind"]]
        records.append(
            {
                "id": f"{prefix}-{slugify(entry['name'])}",
                "name": entry["name"],
                "type": entry["kind"],
                "province": entry["province"],
                "parent": entry["parent"],
                "aliases": aliases,
                "lat": round(coords[0], 5),
                "lon": round(coords[1], 5),
            }
        )

    return records, stats


# --------------------------------------------------------------------------- #
# Source: OSM place nodes (space-insensitive name match, unique-in-province)
# --------------------------------------------------------------------------- #
def _name_regex(raw: str) -> Optional[str]:
    """`Labuhanhaji` -> `L\\s*a\\s*b...` (optional whitespace between characters).

    BPS spells many kecamatan without the space OSM uses ("Labuhanhaji" vs
    "Labuhan Haji"). Allowing optional whitespace between every alphanumeric
    character makes the exact-name match spelling-insensitive without ever
    matching a different place.
    """
    chars = [ch for ch in unicodedata.normalize("NFKD", raw) if ch.isascii() and ch.isalnum()]
    if len(chars) < 3:
        return None
    return "^" + r"\s*".join(re.escape(ch) for ch in chars) + "$"


def _province_relation(province: str, refresh: bool) -> Optional[int]:
    cached = _cached_json("province_level4", refresh)
    if cached is None:
        province_query = (
            '[out:json][timeout:180];'
            'rel["boundary"="administrative"]["admin_level"="4"]'
            f"({BBOX_LAT_MIN},{BBOX_LON_MIN},{BBOX_LAT_MAX},{BBOX_LON_MAX});"
            "out center tags;"
        )
        cached = overpass_query(province_query, "province_level4", refresh=refresh)
    for element in cached.get("elements", []):
        if _province_by_osm_name(element.get("tags", {})) == province:
            return int(element["id"])
    return None


def fetch_place_nodes(wanted_by_province: Dict[str, List[str]], refresh: bool = False) -> List[dict]:
    """Fetch OSM place nodes whose name compacts to one of the wanted names."""
    nodes: List[dict] = []
    for province, names in wanted_by_province.items():
        patterns = [pattern for pattern in (_name_regex(name) for name in names) if pattern]
        if not patterns:
            continue
        relation_id = _province_relation(province, refresh)
        if relation_id is None:
            print(f"  [place-nodes] no province relation for {province}; skipping")
            continue
        area_id = 3_600_000_000 + relation_id
        for offset in range(0, len(patterns), 50):
            chunk = patterns[offset: offset + 50]
            regex = "|".join(chunk)
            query = (
                '[out:json][timeout:300];'
                f"area({area_id})->.a;"
                'node["place"]["name"~"' + regex + '"](area.a);'
                "out tags center;"
            )
            payload = overpass_query(query, f"placenodes_{area_id}_{offset}", refresh=refresh)
            elements = payload.get("elements", [])
            for element in elements:
                element["_province"] = province
            nodes.extend(elements)
            print(f"  [place-nodes] {province} chunk {offset // 50 + 1}: {len(elements)} nodes")
    return nodes


def apply_place_nodes(entries: List[dict], nodes: List[dict], stats: Dict[str, Any]) -> int:
    """Attach coordinates from unique-in-province same-name place nodes."""
    by_province_compact: Dict[str, Dict[str, List[dict]]] = {}
    for node in nodes:
        name = node.get("tags", {}).get("name") or ""
        province = node.get("_province")
        if not name or not province:
            continue
        compact = normalize_text(name).replace(" ", "")
        by_province_compact.setdefault(province, {}).setdefault(compact, []).append(node)

    filled = 0
    ambiguous = 0
    for entry in entries:
        if entry["coords"] or entry["kind"] != "kecamatan":
            continue
        compact = normalize_text(entry["name"]).replace(" ", "")
        candidates = by_province_compact.get(entry["province"], {}).get(compact, [])
        if not candidates:
            continue
        if len(candidates) != 1:
            ambiguous += 1
            continue
        center = candidates[0].get("center") or candidates[0]
        try:
            lat, lon = float(center["lat"]), float(center["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not _in_bbox(lat, lon):
            continue
        entry["coords"] = (lat, lon)
        entry["tags"] = {**candidates[0].get("tags", {}), **entry.get("tags", {})}
        filled += 1

    stats["match"]["osm-node"] = filled
    stats["place_node_ambiguous"] = ambiguous
    print(f"  [place-nodes] filled {filled} unique-in-province kecamatan (ambiguous skipped: {ambiguous})")
    return filled


# --------------------------------------------------------------------------- #
# Source: Photon (OSM-backed geocoder) — final coordinate tier
# --------------------------------------------------------------------------- #
# Measured need: OSM relations miss whole regencies (Sumbar, Lampung, Babel) and
# Nominatim's text index returns literally zero hits for many rural kecamatan
# (e.g. "Labuhanhaji, Kabupaten Aceh Selatan"). Photon indexes the same OSM
# data but with a forgiving search, so it resolves boundaries under spelling
# variants ("Deleng Pokhkisen" -> "Deleng Phokisen"). It is a geocoder, never a
# coordinate generator: hits are accepted only when Photon reports a boundary or
# place feature inside the expected province + regency with >= 0.85 name
# similarity. Anything else is dropped and counted.
PHOTON_URL = "https://photon.komoot.io/api/"
PHOTON_CACHE_PATH = CACHE_DIR / "photon_cache.json"
_PHOTON_CACHE: Optional[Dict[str, Optional[List[float]]]] = None


def _photon_cache() -> Dict[str, Optional[List[float]]]:
    global _PHOTON_CACHE
    if _PHOTON_CACHE is None:
        try:
            _PHOTON_CACHE = json.loads(PHOTON_CACHE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            _PHOTON_CACHE = {}
    return _PHOTON_CACHE


def _save_photon_cache() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    PHOTON_CACHE_PATH.write_text(json.dumps(_photon_cache()), encoding="utf-8")


def _loose_match(expected: str, actual: str) -> bool:
    expected_norm, actual_norm = normalize_text(expected), normalize_text(actual)
    if not expected_norm or not actual_norm:
        return True
    return expected_norm in actual_norm or actual_norm in expected_norm


def _photon_hit(feature: dict, entry: dict) -> Optional[Tuple[int, float, Tuple[float, float]]]:
    from difflib import SequenceMatcher

    props = feature.get("properties") or {}
    coords = (feature.get("geometry") or {}).get("coordinates")
    if not coords or len(coords) < 2:
        return None
    lon, lat = float(coords[0]), float(coords[1])
    if not _in_bbox(lat, lon):
        return None

    osm_key = (props.get("osm_key") or "").lower()
    osm_value = (props.get("osm_value") or "").lower()
    if osm_key not in ("boundary", "place"):
        return None
    if osm_value not in ("administrative", "city", "town", "village", "municipality", "suburb", "county"):
        return None

    state = props.get("state") or props.get("province") or ""
    if state and not _loose_match(entry["province"], state):
        return None
    county = props.get("county") or props.get("city") or ""
    if entry.get("nom_parent") and county and not _loose_match(entry["nom_parent"], county):
        return None

    name = props.get("name") or ""
    if not name:
        return None
    ratio = SequenceMatcher(
        None,
        normalize_text(entry["name"]).replace(" ", ""),
        normalize_text(name).replace(" ", ""),
    ).ratio()
    if ratio < 0.85:
        return None

    kind_rank = 0 if osm_value in ("administrative", "county", "municipality") else 1
    return kind_rank, ratio, (lat, lon)


async def _photon_batch(entries: List[dict], stats: Dict[str, Any]) -> None:
    import asyncio

    cache = _photon_cache()
    async with httpx.AsyncClient(timeout=25.0) as client:
        for index, entry in enumerate(entries):
            if entry["coords"]:
                continue
            query = " ".join(
                part for part in (entry["name"], entry.get("nom_parent") or "", entry["province"], "Indonesia") if part
            )
            if query in cache:
                cached = cache[query]
                if cached:
                    entry["coords"] = (cached[0], cached[1])
                    stats["match"]["photon"] += 1
                continue

            payload: Optional[dict] = None
            try:
                response = await client.get(
                    PHOTON_URL,
                    params={"q": query, "limit": 5, "lang": "en", "bbox": "94,-6,108,6"},
                    headers=HEADERS,
                )
                if response.status_code == 200:
                    payload = response.json()
                else:
                    print(f"  [photon] HTTP {response.status_code} for {query}")
            except (httpx.HTTPError, json.JSONDecodeError) as exc:
                print(f"  [photon] {query}: {exc.__class__.__name__}")

            best: Optional[Tuple[int, float, Tuple[float, float]]] = None
            for feature in (payload or {}).get("features", []):
                hit = _photon_hit(feature, entry)
                if hit is None:
                    continue
                if best is None or (hit[0], -hit[1]) < (best[0], -best[1]):
                    best = hit

            cache[query] = [best[2][0], best[2][1]] if best else None
            if best:
                entry["coords"] = best[2]
                stats["match"]["photon"] += 1
            stats["photon_attempted"] = stats.get("photon_attempted", 0) + 1

            if index % 50 == 0:
                _save_photon_cache()
            await asyncio.sleep(0.25)  # polite: <= 4 req/s

        _save_photon_cache()


def apply_compact_relation_matches(
    entries: List[dict], boundaries: Dict[str, List[dict]], stats: Dict[str, Any]
) -> int:
    """Second local pass over cached relations using space-insensitive names.

    BPS and OSM disagree on spacing ("Labuhanhaji" / "Labuhan Haji"). Relations
    are matched on a compacted name, accepted only when the match is unique in
    the province and structurally the right level (kecamatan ref depth 3, or a
    "Kecamatan " prefixed relation).
    """
    filled = 0
    ambiguous = 0
    for province, elements in boundaries.items():
        index: Dict[str, List[dict]] = {}
        for element in elements:
            tags = element.get("tags", {})
            name = tags.get("name") or ""
            center = element.get("center") or {}
            try:
                lat, lon = float(center["lat"]), float(center["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            if not name or not _in_bbox(lat, lon):
                continue
            record = {
                "id": element["id"],
                "name": name,
                "ref": _ref_parts(tags.get("ref")),
                "lat": lat,
                "lon": lon,
                "tags": tags,
            }
            names = {normalize_text(_clean_name(name))}
            for tag in ("alt_name", "official_name", "old_name", "name:id"):
                for piece in str(tags.get(tag) or "").split(";"):
                    cleaned = normalize_text(_clean_name(piece))
                    if cleaned:
                        names.add(cleaned)
            for key in names:
                index.setdefault(key.replace(" ", ""), []).append(record)

        for entry in entries:
            if entry["coords"] or entry["province"] != province:
                continue
            key = normalize_text(entry["name"]).replace(" ", "")
            candidates = [c for c in index.get(key, []) if _looks_like(entry["kind"], c)]
            if not candidates:
                continue
            if entry["kind"] == "kecamatan":
                reg_ref2 = ".".join(entry["code"].split(".")[:2])
                scoped = [c for c in candidates if ".".join(c["ref"][:2]) == reg_ref2]
                if len(scoped) == 1:
                    candidates = scoped
            if len(candidates) != 1:
                ambiguous += 1
                continue
            entry["coords"] = (candidates[0]["lat"], candidates[0]["lon"])
            entry["tags"] = {**candidates[0]["tags"], **entry.get("tags", {})}
            filled += 1

    stats["match"]["osm-name-compact"] = filled
    stats["compact_ambiguous"] = ambiguous
    print(f"  [compact] filled {filled} via space-insensitive relation names (ambiguous: {ambiguous})")
    return filled


# --------------------------------------------------------------------------- #
# Source: Wikidata kecamatan coordinates (P625) — final validated tier
# --------------------------------------------------------------------------- #
# OSM has never mapped every kecamatan boundary: Kepulauan Bangka Belitung has
# 47 kecamatan and zero boundary relations, Lampung has 229 and 15. Nominatim
# returns literally zero hits for many rural names. Wikidata carries one item
# per Indonesian kecamatan (P31 = Q3700011) with a P625 coordinate and its
# parent regency (P131), so it can fill exactly those holes with a citable
# coordinate instead of a guess. Matched on (compacted name + parent regency),
# then (compacted name + province) only when unique; nothing is interpolated.
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_CACHE_PATH = CACHE_DIR / "wikidata_kecamatan.json"

WIKIDATA_KECAMATAN_QUERY = """
SELECT ?item ?itemLabel ?coord ?parentLabel ?provinceLabel WHERE {
  ?item wdt:P31 wd:Q3700011 .
  ?item wdt:P625 ?coord .
  ?item wdt:P131 ?parent .
  ?parent wdt:P131 ?province .
  ?province wdt:P31 wd:Q5098 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
}
LIMIT 12000
"""


def fetch_wikidata_kecamatan(refresh: bool = False) -> List[dict]:
    cached = _cached_json("wikidata_kecamatan", refresh)
    if cached is None:
        payload = _http_json(
            WIKIDATA_SPARQL_URL,
            params={"query": WIKIDATA_KECAMATAN_QUERY, "format": "json"},
            attempts=3,
            timeout=180.0,
        )
        _store_json("wikidata_kecamatan", payload)
        cached = payload
    return cached.get("results", {}).get("bindings", [])


def _wkt_point(value: str) -> Optional[Tuple[float, float]]:
    match = re.match(r"Point\(([-0-9.]+)\s+([-0-9.]+)\)", value or "")
    if not match:
        return None
    return float(match.group(2)), float(match.group(1))  # (lat, lon)


def apply_wikidata_kecamatan(entries: List[dict], rows: List[dict], stats: Dict[str, Any]) -> int:
    by_name_parent: Dict[Tuple[str, str], Tuple[float, float]] = {}
    by_name_province: Dict[Tuple[str, str], List[Tuple[float, float]]] = {}

    for row in rows:
        province = _province_by_osm_name({"name": row.get("provinceLabel", {}).get("value", "")})
        if province is None:
            continue
        coords = _wkt_point(row.get("coord", {}).get("value", ""))
        if coords is None or not _in_bbox(*coords):
            continue
        name = normalize_text(row.get("itemLabel", {}).get("value", "")).replace(" ", "")
        parent = normalize_text(row.get("parentLabel", {}).get("value", "")).replace(" ", "")
        if not name:
            continue
        if parent:
            by_name_parent.setdefault((name, parent), coords)
        by_name_province.setdefault((name, province), []).append(coords)

    filled = 0
    for entry in entries:
        if entry["coords"] or entry["kind"] != "kecamatan":
            continue
        name = normalize_text(entry["name"]).replace(" ", "")
        parent = normalize_text(entry["parent"]).replace(" ", "")
        coords = by_name_parent.get((name, parent))
        if coords is None:
            candidates = by_name_province.get((name, entry["province"]), [])
            if len(candidates) == 1:
                coords = candidates[0]
        if coords is None:
            continue
        entry["coords"] = coords
        filled += 1

    stats["match"]["wikidata"] = filled
    print(f"  [wikidata] filled {filled} kecamatan from P625 + parent regency")
    return filled


def _collect_aliases(tags: Dict[str, str], display: str, kind: str) -> List[str]:
    aliases: List[str] = []
    display_key = normalize_text(display)

    def add(candidate: Optional[str]) -> None:
        if not candidate:
            return
        for piece in str(candidate).split(";"):
            cleaned = re.sub(r"\s*\([^)]*\)\s*$", "", piece).strip()
            for variant in (cleaned, _clean_name(cleaned)):
                variant = variant.strip()
                if variant and normalize_text(variant) != display_key and normalize_text(variant) not in {
                    normalize_text(a) for a in aliases
                }:
                    aliases.append(variant)

    for tag in _ALIAS_TAGS:
        add(tags.get(tag))
    if kind == "kota":
        add(f"Kota {display}")
        add(f"Kotamadya {display}")
    elif kind == "kabupaten":
        add(f"Kabupaten {display}")
        add(f"Kab. {display}")
    else:
        add(f"Kecamatan {display}")
        add(f"Kec. {display}")
    return aliases


def dedupe_and_validate(records: Iterable[dict]) -> List[dict]:
    kept: List[dict] = []
    seen_names: set[Tuple[str, str, str]] = set()
    seen_ids: set[str] = set()
    dropped_province = dropped_bbox = dropped_type = duplicates = 0

    for record in records:
        # Phase 176.7: normalise `type` (regency->kabupaten, city->kota,
        # district->kecamatan) BEFORE the dedupe/validate pass, so the committed
        # JSON can only ever contain kota|kabupaten|kecamatan.
        kind = normalize_gazetteer_type(record.get("type"))
        if kind is None:
            dropped_type += 1
            continue
        record["type"] = kind
        if record.get("province") not in PROVINCES:
            dropped_province += 1
            continue
        try:
            lat = float(record["lat"])
            lon = float(record["lon"])
        except (KeyError, TypeError, ValueError):
            dropped_bbox += 1
            continue
        if not _in_bbox(lat, lon):
            dropped_bbox += 1
            continue
        record["lat"], record["lon"] = round(lat, 5), round(lon, 5)

        key = (record["type"], normalize_text(record["name"]), record["province"], normalize_text(record.get("parent") or ""))
        if key in seen_names:
            duplicates += 1
            continue
        base_id = record["id"]
        suffix = 2
        while record["id"] in seen_ids:
            record["id"] = f"{base_id}-{suffix}"
            suffix += 1
        seen_names.add(key)
        seen_ids.add(record["id"])
        kept.append(record)

    if dropped_province or dropped_bbox or dropped_type or duplicates:
        print(
            f"[validate] dropped province={dropped_province} bbox={dropped_bbox} "
            f"type={dropped_type} duplicate-name={duplicates}"
        )
    kept.sort(key=lambda r: (PROVINCES.index(r["province"]), r["type"], normalize_text(r["name"])))
    return kept


def summarize(records: List[dict], stats: Dict[str, Any]) -> None:
    print("\n=== dataset summary ===")
    print(f"records: {len(records)}")
    by_type: Dict[str, int] = {}
    by_province: Dict[str, Dict[str, int]] = {}
    missing_parent = 0
    for record in records:
        by_type[record["type"]] = by_type.get(record["type"], 0) + 1
        bucket = by_province.setdefault(record["province"], {})
        bucket[record["type"]] = bucket.get(record["type"], 0) + 1
        if record["type"] == "kecamatan" and not record.get("parent"):
            missing_parent += 1
    for kind in ("kabupaten", "kota", "kecamatan"):
        print(f"  {kind}: {by_type.get(kind, 0)}")
    for province in PROVINCES:
        bucket = by_province.get(province, {})
        print(
            f"  {province}: {sum(bucket.values())} "
            f"(kab={bucket.get('kabupaten', 0)}, kota={bucket.get('kota', 0)}, kec={bucket.get('kecamatan', 0)})"
        )
    print(f"  kecamatan without parent: {missing_parent}")
    print(f"  coordinate source: {stats['match']}")
    print(f"  photon attempts: {stats.get('photon_attempted', 0)}")
    print(f"  nominatim attempts: {stats['nominatim_attempted']}")
    shortfall = stats.get("timebox_shortfall") or []
    if shortfall:
        by_type_short: Dict[str, int] = {}
        for label in shortfall:
            key = label.split(":", 1)[0]
            by_type_short[key] = by_type_short.get(key, 0) + 1
        print(f"  TIMEOUT SHORTFALL (never fabricated): {len(shortfall)} {by_type_short}")
    print(f"  unmatched (dropped, not fabricated): {len(stats['unmatched'])}")
    for label in stats["unmatched"][:20]:
        print(f"    - {label}")
    if len(stats["unmatched"]) > 20:
        print(f"    ... and {len(stats['unmatched']) - 20} more")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="ignore the HTTP cache")
    parser.add_argument("--dry-run", action="store_true", help="build but do not write the JSON")
    parser.add_argument("--no-nominatim", action="store_true", help="OSM-only coverage check")
    parser.add_argument("--timebox", type=int, default=1800, help="Nominatim timebox seconds")
    parser.add_argument("--no-place-nodes", action="store_true", help="skip the OSM place-node pass")
    parser.add_argument("--photon", action="store_true", help="enable the Photon geocoder tier (opt-in)")
    args = parser.parse_args(argv)

    print("[1/3] wilayah.id: province -> regency -> district hierarchy")
    try:
        hierarchy = fetch_hierarchy(refresh=args.refresh)
    except FetchError as exc:
        print(f"HIERARCHY SOURCE FAILED: {exc}")
        print("Refusing to write a synthetic dataset.")
        return 2

    print("[2/3] Overpass: boundary relations (admin_level 5/6/7)")
    try:
        boundaries = fetch_boundaries(refresh=args.refresh)
    except FetchError as exc:
        print(f"OVERPASS FAILED: {exc}")
        if args.no_nominatim:
            return 2
        print("Continuing with Nominatim-only geocoding (timeboxed).")
        boundaries = {}

    print("[3/3] join hierarchy to real coordinates")
    records, stats = build_records(
        hierarchy,
        boundaries,
        use_nominatim=not args.no_nominatim,
        timebox_seconds=args.timebox,
        refresh=args.refresh,
        skip_place_nodes=args.no_place_nodes,
        use_photon=args.photon,
    )

    records = dedupe_and_validate(records)
    summarize(records, stats)

    if len(records) < 1800:
        print(f"WARNING: only {len(records)} records (< 1,800) — shortfall reported, nothing padded.")

    if args.dry_run:
        print("dry-run: file not written")
        return 0

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {len(records)} records -> {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
