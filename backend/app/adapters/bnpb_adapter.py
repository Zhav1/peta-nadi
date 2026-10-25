"""BNPB disaster bulletin adapter (DIBI + bnpb.go.id fallback, 1h cadence).

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
                res = await client.get("https://bnpb.go.id/", headers={"User-Agent": "PreHubSumatraLogistics/1.0"})
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"BNPB health check failed: {e}")
            return False

    async def fetch(self) -> Dict[str, Any]:
        """Try DIBI/API scrape first; fall back to bnpb.go.id bulletin listing."""
        headers = {"User-Agent": "PreHubSumatraLogistics/1.0 (Live Fleet Pilot Sumatra; contact@pidi.id)"}
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
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
