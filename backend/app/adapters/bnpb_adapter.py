"""BNPB disaster adapter (CKAN Action API Tier-0 + DIBI + bnpb.go.id fallback, 1h cadence).

Poll pattern follows BaseAdapter.run(): health -> fetch -> parse -> publish -> cache.
Tier-0 source: BNPB CKAN Action API at https://data.bnpb.go.id/api/3/action/
(no auth, polite <=1 req/s): package_show for the kompilasi-2025 and
data-bencana-indonesia datasets -> datastore_active resources ->
datastore_search limit+offset paging. Rows carry per-province/per-kab
Latitude/Longitude plus per-hazard count columns; each nonzero hazard cell
becomes one aggregate-labeled event (severity low, status stats — never a
live alert).

Then DIBI guesses, then a formalized bnpb.go.id bulletin-listing fallback.

Poll pattern follows BaseAdapter.run(): health -> fetch -> parse -> publish -> cache.
Source: BNPB Data Informasi Bencana Indonesia (DIBI) with a formalized
bnpb.go.id bulletin-listing fallback that reuses the Q8 Tier-1 query pattern
from services/news_aggregator.py TARGETED_PRESS_QUERIES[7]
(site:bnpb.go.id ... banjir/longor/gempa ... Sumatra ... when:2d).

Honesty contract: never fabricates events. When DIBI and the bulletin
listing are both unreachable, fetch() returns {"status": "unavailable",
"items": []} and parse() returns [] so GET /api/v1/bnpb/events serves an
honest [] with status=unavailable.

Emitted event shape:
    {source: bnpb, event_type: flood|landslide|earthquake|wildfire|storm|
     drought|tsunami|coastal|other, severity, lat, lon, radius_km,
     title, raw, ts, dedup_key: bnpb:dibi:{id}}
Severity derives from korban/mengungsi counts in the bulletin text:
  meninggal >= 1 or mengungsi >= 1000 -> critical
  mengungsi >= 100 or luka >= 10 or terdampak >= 500 -> high
  else medium.
Coordinates resolve gazetteer-first (PAN_SUMATRA_GAZETTEER longest-key
match), then the shared geocode_router/gazetteer Nominatim path via
app.nlp.geocoding_service.geocode; unresolvable or out-of-Sumatra
(94-108E / -6.5..6.5N) items are dropped, never centroid-fabricated.
"""
import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_BNPB, get_redis

logger = logging.getLogger(__name__)

# Q8 Tier-1 recall pattern (news_aggregator.py TARGETED_PRESS_QUERIES[7]):
# official BNPB/BMKG bulletins for pan-Sumatra flood/landslide/quake alerts.
Q8_BNPB_QUERY = (
    "(site:bnpb.go.id OR site:bmkg.go.id) (banjir OR longsor OR gempa "
    "OR peringatan dini OR cuaca ekstrem) (Sumatera OR Sumut OR Sumbar "
    "OR Riau OR Lampung OR Aceh OR Jambi) when:2d"
)
Q8_KEYWORDS = ("banjir", "longsor", "gempa", "peringatan dini", "cuaca ekstrem")
Q8_REGIONS = (
    "sumatera", "sumut", "sumbar", "riau", "lampung", "aceh", "jambi",
    "sumatera utara", "sumatera barat", "sumatera selatan", "bengkulu",
    "kepri", "bangka", "belitung",
)

# Candidate DIBI/API endpoints (best-effort; schema varies, all optional).
DIBI_CANDIDATES = [
    "https://dibi.bnpb.go.id/api/kejadian",
    "https://dibi.bnpb.go.id/api/v1/kejadian",
    "https://data.bnpb.go.id/api/kejadian",
]

# --- Tier 0: BNPB CKAN Action API (data.bnpb.go.id, CKAN 2.9.11, no auth) ---
# Base is openly reachable (HTTP 200 JSON, no key, no Cloudflare bypass).
# Datasets (resolved dynamically via package_show so future years keep working):
CKAN_BASE = "https://data.bnpb.go.id/api/3/action"
CKAN_DATASETS = [
    "kompilasi-data-kejadian-dan-dampak-bencana-2025",
    "data-bencana-indonesia",
]
# Bootstrap: confirmed datastore resource (prov-2025-by-hazard, total 39).
# The 2010-2024 prov and 2024 kab resources were confirmed reachable via
# datastore_search during research but only by ID prefix, so they are NOT
# hardcoded here — they resolve dynamically via package_show (primary path).
CKAN_BOOTSTRAP_RESOURCES = [
    {"id": "df39e8c3-117e-40fa-b518-ff1037743955", "level": "prov"},
]
CKAN_PAGE_LIMIT = 500          # datastore_search limit per request
CKAN_MAX_PAGES_PER_RESOURCE = 12
CKAN_MAX_ROWS_TOTAL = 5000
CKAN_POLITE_DELAY_SECONDS = 1.0  # <=1 req/s politeness (tests patch to 0)
# Formalized bulletin listing fallback.
BNPB_BULLETIN_URLS = [
    "https://bnpb.go.id/berita",
    "https://bnpb.go.id/press-release",
    "https://bnpb.go.id/",
]

EVENT_KEYWORDS: List[Tuple[str, Tuple[str, ...]]] = [
    ("flood", ("banjir", "rob", "luapan")),
    ("landslide", ("longsor", "tanah bergerak", "tebing runtuh", "amblas")),
    ("earthquake", ("gempa", "gempabumi")),
    ("tsunami", ("tsunami",)),
    ("wildfire", ("karhutla", "kebakaran hutan", "kebakaran lahan", "titik api")),
    ("storm", ("puting beliung", "angin kencang", "badai", "angin puting")),
    ("drought", ("kekeringan",)),
    ("coastal", ("abrasi", "gelombang tinggi", "gelombang pasang")),
]

SEVERITY_RADIUS_KM = {"critical": 10.0, "high": 5.0, "medium": 2.5, "low": 1.0}

# CKAN datastore hazard-column -> event_type mapping (substring match on the
# UPPERCASED column name; each column is claimed by the first matching type).
# NOTE: schema event types are flood|landslide|earthquake|wildfire|storm|
# drought|tsunami|coastal|other, so GELOMBANG* maps to "coastal".
CKAN_HAZARD_COLUMNS: List[Tuple[str, Tuple[str, ...]]] = [
    ("tsunami", ("TSUNAMI",)),
    ("earthquake", ("GEMPABUMI", "GEMPA")),
    ("landslide", ("LONGSOR", "TANAH BERGERAK", "TEBING RUNTUH")),
    ("wildfire", ("KARHUTLA", "KEBAKARAN")),
    ("flood", ("BANJIR",)),
    ("storm", ("CUACA EKSTREM", "PUTING BELIUNG", "ANGIN KENCANG", "ANGIN PUTING", "BADAI")),
    ("drought", ("KEKERINGAN",)),
    ("coastal", ("GELOMBANG", "ABRASI")),
]

CKAN_GEO_KEYS = ("latitude", "longitude", "lat", "lon", "lintang", "bujur")
CKAN_ID_KEYS = ("_id", "id", "id_kejadian")
CKAN_LEVEL_RADIUS_KM = {"kab": 10.0, "prov": 25.0}

# Sumatra-only province tokens (incl. Babel + Kepri variants).
SUMATRA_PROVINCE_TOKENS = (
    "aceh",
    "sumatera utara", "sumut",
    "sumatera barat", "sumbar",
    "riau",
    "kepulauan riau", "kepri",
    "jambi",
    "sumatera selatan", "sumsel",
    "kepulauan bangka belitung", "bangka", "belitung", "babel",
    "bengkulu",
    "lampung",
    "sumatera",
)

_NUM = r"(\d[\d\.]*)"


def _to_int(raw: Optional[str]) -> int:
    try:
        return int(str(raw or "").replace(".", "").replace(",", "").strip() or 0)
    except (ValueError, TypeError):
        return 0


def detect_event_type(text: str) -> str:
    t = (text or "").lower()
    for event_type, keywords in EVENT_KEYWORDS:
        if any(k in t for k in keywords):
            return event_type
    return "other"


def severity_from_impact(text: str) -> Tuple[str, Dict[str, int]]:
    """Map korban/mengungsi counts to severity + parsed impact counters.

    Nearest-number attribution: each korban keyword claims the closest
    integer within a ±28-char window (e.g. "2 meninggal, 150 mengungsi"
    gives meninggal=2, mengungsi=150 — never cross-attributes the 150).
    """
    t = (text or "").lower()
    numbers = [(m.start(), _to_int(m.group(1))) for m in re.finditer(r"(\d[\d\.]*)", t)]

    def nearest(keyword_alts: Tuple[str, ...]) -> int:
        best = 0
        for alt in keyword_alts:
            for km in re.finditer(re.escape(alt), t):
                kp = km.start()
                close = [(abs(pos - kp), val) for pos, val in numbers if abs(pos - kp) <= 28]
                if close:
                    close.sort()
                    best = max(best, close[0][1])
        return best

    meninggal = nearest(("meninggal", "korban jiwa", "tewas", "korban meninggal"))
    luka = nearest(("luka-luka", "luka", "terluka"))
    mengungsi = nearest(("mengungsi", "pengungsi", "dievakuasi", "di evakuasi", "evakuasi"))
    terdampak = nearest(("terdampak", "terimbas"))
    if terdampak == 0:
        for m in re.finditer(rf"{_NUM}\s*(jiwa|orang|kk|kepala keluarga|rumah|unit rumah)", t):
            terdampak = max(terdampak, _to_int(m.group(1)))
    if meninggal >= 1 or mengungsi >= 1000:
        severity = "critical"
    elif mengungsi >= 100 or luka >= 10 or terdampak >= 500:
        severity = "high"
    else:
        severity = "medium"
    return severity, {
        "meninggal": meninggal,
        "luka": luka,
        "mengungsi": mengungsi,
        "terdampak": terdampak,
    }


def gazetteer_coords(text: str) -> Optional[Tuple[float, float, str]]:
    """Longest-key PAN_SUMATRA_GAZETTEER match with strict word boundaries."""
    try:
        from app.nlp.gazetteer_data import PAN_SUMATRA_GAZETTEER
    except Exception as e:
        logger.debug(f"BNPB gazetteer import unavailable: {e}")
        return None
    slug = (text or "").lower()
    if not slug:
        return None
    for key in sorted(PAN_SUMATRA_GAZETTEER.keys(), key=lambda k: -len(k)):
        try:
            if re.search(rf"\b{re.escape(key)}\b", slug):
                coords = PAN_SUMATRA_GAZETTEER[key]["coords"]
                return float(coords[0]), float(coords[1]), key
        except Exception:
            continue
    return None


def within_sumatra(lat: float, lon: float) -> bool:
    try:
        return -6.5 <= float(lat) <= 6.5 and 94.0 <= float(lon) <= 108.0
    except (TypeError, ValueError):
        return False


async def resolve_coords(text: str) -> Optional[Tuple[float, float, str]]:
    """Gazetteer-first, then shared geocode service; None when unresolvable."""
    hit = gazetteer_coords(text)
    if hit and within_sumatra(hit[0], hit[1]):
        return hit
    try:
        from app.nlp.geocoding_service import geocode as shared_geocode
        from app.nlp.gazetteer_data import OUT_OF_SUMATRA_MARKERS
        lowered = (text or "").lower()
        if any(m in lowered for m in OUT_OF_SUMATRA_MARKERS):
            return None
        # Geocode the matched region token only (avoids full-bulletin noise).
        candidate = (hit[2] if hit else (text or "")[:80]).strip()
        if not candidate:
            return None
        coords = await shared_geocode(candidate)
        if coords and within_sumatra(coords[0], coords[1]):
            return float(coords[0]), float(coords[1]), candidate
    except Exception as e:
        logger.debug(f"BNPB shared-geocode fallback skipped: {e}")
    return None


# --- CKAN datastore helpers (Tier 0) ---

def _ckan_count(value: Any) -> int:
    """Parse a CKAN hazard count cell (int, numeric string, float) to int."""
    if value is None or isinstance(value, bool):
        return 0
    try:
        text = str(value).strip().replace(",", "")
        if not text:
            return 0
        return max(0, int(float(text)))
    except (ValueError, TypeError):
        return 0


def _ckan_float(value: Any) -> Optional[float]:
    try:
        if value is None or isinstance(value, bool):
            return None
        text = str(value).strip().replace(",", "")
        if not text:
            return None
        return float(text)
    except (ValueError, TypeError):
        return None


def ckan_row_hazards(row: Dict[str, Any]) -> Dict[str, int]:
    """Map a CKAN datastore row's hazard columns to {event_type: count}.

    Each column is claimed by the first matching CKAN_HAZARD_COLUMNS entry
    (prevents double counting); geo/name/id columns are never hazards.
    """
    hazards: Dict[str, int] = {}
    skip = set(CKAN_GEO_KEYS) | {"_id", "id", "id_kejadian", "provinsi",
                                 "province", "nama provinsi", "kabupaten",
                                 "kabupaten/kota", "kota", "nama kabupaten",
                                 "daerah", "wilayah", "tahun", "year",
                                 "rank", "_full_text"}
    for key, value in row.items():
        if not isinstance(key, str):
            continue
        upper = key.strip().upper()
        if key.strip().lower() in skip or upper in ("LATITUDE", "LONGITUDE", "LAT", "LON"):
            continue
        for event_type, aliases in CKAN_HAZARD_COLUMNS:
            if any(alias in upper for alias in aliases):
                count = _ckan_count(value)
                if count > 0:
                    hazards[event_type] = hazards.get(event_type, 0) + count
                break
    return hazards


def ckan_row_geo(row: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """Extract (lat, lon) from a CKAN row; None when missing/unparsable."""
    lowered = {str(k).strip().lower(): v for k, v in row.items() if isinstance(k, str)}
    lat = _ckan_float(lowered.get("latitude", lowered.get("lat", lowered.get("lintang"))))
    lon = _ckan_float(lowered.get("longitude", lowered.get("lon", lowered.get("bujur"))))
    if lat is None or lon is None:
        return None
    return lat, lon


def ckan_row_region(row: Dict[str, Any]) -> str:
    """Best-effort region label (province, else kabupaten/kota, else '')."""
    lowered = {str(k).strip().lower(): str(v or "").strip()
               for k, v in row.items() if isinstance(k, str)}
    for key in ("provinsi", "province", "nama provinsi"):
        if lowered.get(key):
            return lowered[key]
    for key in ("kabupaten/kota", "kabupaten", "nama kabupaten", "kota", "daerah", "wilayah"):
        if lowered.get(key):
            return lowered[key]
    return ""


def ckan_row_in_sumatra(row: Dict[str, Any], lat: float, lon: float) -> bool:
    """Sumatra-only gate: coords inside bbox AND a Sumatra province token
    (or PAN_SUMATRA_GAZETTEER hit for kab rows lacking a province token)
    in the row's combined text."""
    if not within_sumatra(lat, lon):
        return False
    combined = " ".join(str(v or "") for v in row.values()).lower()
    if any(tok in combined for tok in SUMATRA_PROVINCE_TOKENS):
        return True
    try:
        if gazetteer_coords(combined) is not None:
            return True
    except Exception:
        pass
    return False


def ckan_row_level(row: Dict[str, Any]) -> str:
    """'kab' for kabupaten/kota-level rows, else 'prov' (drives radius_km)."""
    if isinstance(row.get("_ckan_level"), str) and row["_ckan_level"] in ("kab", "prov"):
        return str(row["_ckan_level"])
    lowered_keys = {str(k).strip().lower() for k in row.keys() if isinstance(k, str)}
    if lowered_keys & {"kabupaten", "kabupaten/kota", "nama kabupaten", "kota"}:
        # A row carrying both province + kabupaten columns is kab-level.
        return "kab"
    name = f"{row.get('_ckan_resource_name') or ''}".lower()
    if "kab" in name or "kota" in name:
        return "kab"
    return "prov"


class BNPBAdapter(BaseAdapter):
    source_name = "bnpb"
    stream_key = STREAM_BNPB
    poll_interval_seconds = 3600  # 1h async cadence

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                res = await client.head("https://bnpb.go.id/", headers={"User-Agent": "PreHubSumatraLogistics/1.0"})
                if res.status_code == 200:
                    return True
                # CKAN Action API counts as healthy too (Tier-0 feed).
                try:
                    cres = await client.get(
                        f"{CKAN_BASE}/status_show",
                        headers={"User-Agent": "PreHubSumatraLogistics/1.0"},
                    )
                    if cres.status_code == 200:
                        return True
                except Exception as ce:
                    logger.debug(f"BNPB CKAN health probe failed: {ce}")
                res = await client.get("https://bnpb.go.id/", headers={"User-Agent": "PreHubSumatraLogistics/1.0"})
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"BNPB health check failed: {e}")
            return False

    async def fetch(self) -> Dict[str, Any]:
        """Tier-0 CKAN Action API first; then DIBI guesses; then bulletin; else honest empty."""
        headers = {"User-Agent": "PreHubSumatraLogistics/1.0 (Live Fleet Pilot Sumatra; contact@pidi.id)"}
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
            try:
                ckan_items = await self._fetch_ckan(client)
                if ckan_items:
                    logger.info(f"BNPB adapter: CKAN hit ({len(ckan_items)} rows)")
                    return {"status": "ckan", "endpoint": CKAN_BASE, "items": ckan_items}
            except Exception as e:
                logger.debug(f"BNPB CKAN tier failed, falling through: {e}")
            for url in DIBI_CANDIDATES:
                try:
                    res = await client.get(url)
                    if res.status_code != 200:
                        continue
                    try:
                        payload = res.json()
                    except Exception:
                        continue
                    items = payload if isinstance(payload, list) else payload.get("data") or payload.get("items") or []
                    if isinstance(items, list) and items:
                        logger.info(f"BNPB adapter: DIBI hit {url} ({len(items)} rows)")
                        return {"status": "dibi", "endpoint": url, "items": items}
                except Exception as e:
                    logger.debug(f"BNPB DIBI candidate {url} failed: {e}")
                    continue
            for url in BNPB_BULLETIN_URLS:
                try:
                    res = await client.get(url)
                    if res.status_code == 200 and res.text:
                        items = self._bulletin_items(res.text, url)
                        if items:
                            logger.info(f"BNPB adapter: bulletin hit {url} ({len(items)} items)")
                            return {"status": "bulletin", "endpoint": url, "items": items}
                except Exception as e:
                    logger.debug(f"BNPB bulletin fallback {url} failed: {e}")
                    continue
        logger.warning("BNPB adapter: DIBI + bulletin unreachable — honest empty")
        return {"status": "unavailable", "endpoint": None, "items": []}

    async def _ckan_get(self, client: httpx.AsyncClient, action: str,
                        params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """GET one CKAN Action API call; None on any failure (never raises)."""
        try:
            res = await client.get(f"{CKAN_BASE}/{action}", params=params)
            if res.status_code != 200:
                return None
            payload = res.json()
            if not isinstance(payload, dict) or not payload.get("success"):
                return None
            result = payload.get("result")
            return result if isinstance(result, dict) else None
        except Exception as e:
            logger.debug(f"BNPB CKAN {action} failed: {e}")
            return None

    async def _fetch_ckan(self, client: httpx.AsyncClient) -> List[Dict[str, Any]]:
        """package_show (both datasets) -> datastore_active resources ->
        datastore_search limit+offset paging. Bootstrap IDs cover the case
        where package_show itself is unreachable. Never raises."""
        resources: List[Dict[str, Any]] = []
        seen_ids = set()
        first_call = True
        for dataset in CKAN_DATASETS:
            if not first_call:
                await asyncio.sleep(CKAN_POLITE_DELAY_SECONDS)
            first_call = False
            result = await self._ckan_get(client, "package_show", {"id": dataset})
            if not result:
                continue
            pkg_updated = str(result.get("metadata_modified") or "")
            for res in result.get("resources") or []:
                if not isinstance(res, dict):
                    continue
                rid = str(res.get("id") or "")
                if not rid or rid in seen_ids:
                    continue
                if res.get("datastore_active") is not True:
                    continue
                seen_ids.add(rid)
                name = str(res.get("name") or "")
                level = "kab" if "kab" in name.lower() or "kota" in name.lower() else "prov"
                resources.append({
                    "id": rid,
                    "level": level,
                    "name": name,
                    "dataset": dataset,
                    "updated_at": str(res.get("last_modified") or res.get("metadata_modified") or pkg_updated),
                })
        if not resources:
            # Bootstrap fallback: confirmed datastore resources only.
            for boot in CKAN_BOOTSTRAP_RESOURCES:
                if boot["id"] not in seen_ids:
                    seen_ids.add(boot["id"])
                    resources.append({
                        "id": boot["id"],
                        "level": boot.get("level", "prov"),
                        "name": "",
                        "dataset": CKAN_DATASETS[0],
                        "updated_at": "",
                    })
        items: List[Dict[str, Any]] = []
        for res in resources:
            if len(items) >= CKAN_MAX_ROWS_TOTAL:
                break
            await asyncio.sleep(CKAN_POLITE_DELAY_SECONDS)
            rows = await self._datastore_search_all(client, res)
            for row in rows:
                if len(items) >= CKAN_MAX_ROWS_TOTAL:
                    break
                if isinstance(row, dict):
                    row["_ckan_resource_id"] = res["id"]
                    row["_ckan_resource_name"] = res.get("name", "")
                    row["_ckan_level"] = res.get("level", "prov")
                    row["_ckan_dataset"] = res.get("dataset", "")
                    row["_ckan_updated_at"] = res.get("updated_at", "")
                    items.append(row)
        return items

    async def _datastore_search_all(self, client: httpx.AsyncClient,
                                    res: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Page datastore_search (limit 500 + offset) for one resource."""
        out: List[Dict[str, Any]] = []
        offset = 0
        for _ in range(CKAN_MAX_PAGES_PER_RESOURCE):
            result = await self._ckan_get(client, "datastore_search", {
                "resource_id": res["id"],
                "limit": CKAN_PAGE_LIMIT,
                "offset": offset,
            })
            if not result:
                break
            records = result.get("records") or []
            if not isinstance(records, list) or not records:
                break
            out.extend(r for r in records if isinstance(r, dict))
            try:
                total = int(result.get("total") or 0)
            except (ValueError, TypeError):
                total = 0
            offset += len(records)
            if len(records) < CKAN_PAGE_LIMIT or (total and offset >= total):
                break
            await asyncio.sleep(CKAN_POLITE_DELAY_SECONDS)
        return out

    def _bulletin_items(self, html: str, base_url: str) -> List[Dict[str, Any]]:
        """Formalized bulletin parse: anchor titles matching Q8 keywords+regions."""
        items: List[Dict[str, Any]] = []
        seen_titles = set()
        for m in re.finditer(
            r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL
        ):
            href, inner = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
            title = re.sub(r"\s+", " ", inner).strip()
            if len(title) < 24:
                continue
            lowered = title.lower()
            if not any(k in lowered for k in Q8_KEYWORDS):
                continue
            if not any(r in lowered for r in Q8_REGIONS):
                continue
            if lowered in seen_titles:
                continue
            seen_titles.add(lowered)
            link = href if href.startswith("http") else f"https://bnpb.go.id{href}" if href.startswith("/") else f"{base_url.rstrip('/')}/{href}"
            digest = hashlib.md5(f"{title}|{link}".encode("utf-8")).hexdigest()[:12]
            items.append({"id": digest, "title": title, "link": link, "description": title})
            if len(items) >= 30:
                break
        return items

    async def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        if not isinstance(raw_data, dict):
            return events
        items = raw_data.get("items") or []
        if not items:
            return events
        if raw_data.get("status") == "ckan" or any(
            isinstance(r, dict) and ("_ckan_resource_id" in r or "Latitude" in r or "latitude" in r)
            for r in items
        ):
            return await self._parse_ckan_items(items)
        try:
            r = get_redis()
        except Exception:
            r = None
        now_iso = datetime.now(timezone.utc).isoformat()
        for row in items:
            try:
                if not isinstance(row, dict):
                    continue
                title = str(row.get("title") or row.get("nama_kejadian") or row.get("kejadian") or "").strip()
                body = str(row.get("description") or row.get("keterangan") or row.get("deskripsi") or title)
                if not title:
                    continue
                text = f"{title} {body}"
                lowered = text.lower()
                # Sumatra-only: require a Q8 region token or gazetteer hit.
                if not any(reg in lowered for reg in Q8_REGIONS) and not gazetteer_coords(text):
                    continue
                event_type = detect_event_type(text)
                severity, impact = severity_from_impact(text)
                geo = await resolve_coords(text)
                if not geo:
                    continue
                lat, lon, matched = geo
                raw_id = str(row.get("id") or row.get("id_kejadian") or hashlib.md5(title.encode("utf-8")).hexdigest()[:12])
                dedup_key = f"bnpb:dibi:{raw_id}"
                if r is not None:
                    try:
                        if r.get(f"lrip:dedup:{dedup_key}"):
                            continue
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=7 * 86400)
                    except Exception as de:
                        logger.debug(f"BNPB dedup skipped: {de}")
                events.append({
                    "source": self.source_name,
                    "event_type": event_type,
                    "severity": severity,
                    "lat": str(lat),
                    "lon": str(lon),
                    "radius_km": SEVERITY_RADIUS_KM.get(severity, 2.5),
                    "title": title[:220],
                    "link": row.get("link"),
                    "matched_region": matched,
                    "impact": json.dumps(impact),
                    "raw": json.dumps(row, default=str)[:4000],
                    "ts": now_iso,
                    "dedup_key": dedup_key,
                })
            except Exception as e:
                logger.debug(f"BNPB parse row skipped: {e}")
                continue
        return events

    async def _parse_ckan_items(self, items: List[Any]) -> List[Dict[str, Any]]:
        """Row->event mapper for CKAN datastore rows.

        One event per (row, nonzero hazard column). Aggregates are labeled
        honestly: severity is always "low" with status "stats" — never
        presented as live alerts. Rows without lat/lon, outside the Sumatra
        gate, or with zero counts in every hazard column are dropped.
        """
        events: List[Dict[str, Any]] = []
        try:
            r = get_redis()
        except Exception:
            r = None
        now_iso = datetime.now(timezone.utc).isoformat()
        for row in items:
            try:
                if not isinstance(row, dict):
                    continue
                geo = ckan_row_geo(row)
                if not geo:
                    continue
                lat, lon = geo
                if not ckan_row_in_sumatra(row, lat, lon):
                    continue
                hazards = ckan_row_hazards(row)
                if not hazards:
                    continue
                region = ckan_row_region(row) or "Sumatera"
                level = ckan_row_level(row)
                radius = CKAN_LEVEL_RADIUS_KM.get(level, 25.0)
                resource_id = str(row.get("_ckan_resource_id") or "bootstrap")
                dataset = str(row.get("_ckan_dataset") or "")
                ts = str(row.get("_ckan_updated_at") or now_iso) or now_iso
                record_id = row.get("_id", row.get("id", ""))
                if record_id in (None, ""):
                    record_id = hashlib.md5(
                        json.dumps(row, default=str, sort_keys=True).encode("utf-8")
                    ).hexdigest()[:12]
                record_id = str(record_id)
                link = f"https://data.bnpb.go.id/dataset/{dataset}" if dataset else None
                for event_type in sorted(hazards):
                    count = hazards[event_type]
                    dedup_key = f"bnpb:ckan:{resource_id}:{record_id}:{event_type}"
                    if r is not None:
                        try:
                            if r.get(f"lrip:dedup:{dedup_key}"):
                                continue
                            r.set(f"lrip:dedup:{dedup_key}", "1", ex=7 * 86400)
                        except Exception as de:
                            logger.debug(f"BNPB CKAN dedup skipped: {de}")
                    level_label = "kabupaten/kota" if level == "kab" else "provinsi"
                    title = (
                        f"[BNPB aggregate stats] {event_type} {level_label} "
                        f"{region}: {count} kejadian"
                    )
                    events.append({
                        "source": self.source_name,
                        "event_type": event_type,
                        "severity": "low",
                        "status": "stats",
                        "lat": str(lat),
                        "lon": str(lon),
                        "radius_km": radius,
                        "title": title[:220],
                        "link": link,
                        "matched_region": region[:80],
                        "impact": json.dumps({"aggregate_count": count, "hazard": event_type}),
                        "raw": json.dumps(row, default=str)[:4000],
                        "ts": ts,
                        "dedup_key": dedup_key,
                    })
            except Exception as e:
                logger.debug(f"BNPB CKAN parse row skipped: {e}")
                continue
        return events
