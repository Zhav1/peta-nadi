import csv
import httpx
import io
import logging
import math
from typing import List, Dict, Any
from datetime import datetime, timezone
import json

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_NASA_FIRMS, get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Keyless public CSV path (Phase 168)
# ---------------------------------------------------------------------------
# NASA FIRMS publishes the same active-fire detections as static CSV files with
# no MAP_KEY and no quota. This is the default source when the key is absent so
# Titik Panas can never be empty-by-misconfiguration again.
FIRMS_KEYLESS_BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire"

# Default window for the live counter (decision 3/4). Exposed so the router and
# UI read one number: 24h / 48h / 7d (168h) are the published windows.
FIRMS_KEYLESS_WINDOW_HOURS = 24
FIRMS_KEYLESS_WINDOWS = {24: "24h", 48: "48h", 168: "7d"}

VIIRS_KEYLESS_CSV_TEMPLATE = (
    FIRMS_KEYLESS_BASE + "/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Indonesia_{window}.csv"
)
MODIS_KEYLESS_CSV_TEMPLATE = (
    FIRMS_KEYLESS_BASE + "/modis-c6-1/csv/MODIS_C6_1_Indonesia_{window}.csv"
)
# Empirical fallback (2026-10-27): the per-country files above are not published
# for Indonesia (both 404), so the keyless path also tries the Global static
# files — still no key/quota — and keeps only the Sumatra bbox server-side.
VIIRS_GLOBAL_CSV_TEMPLATE = (
    FIRMS_KEYLESS_BASE + "/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_{window}.csv"
)
MODIS_GLOBAL_CSV_TEMPLATE = (
    FIRMS_KEYLESS_BASE + "/modis-c6-1/csv/MODIS_C6_1_Global_{window}.csv"
)

# ---------------------------------------------------------------------------
# Keyed area API (Phase 173.6)
# ---------------------------------------------------------------------------
FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
FIRMS_API_SENSOR = "VIIRS_SNPP_NRT"
# The area API `{day_range}` counts *calendar* days back from today, and the
# newest NRT passes are only published once a UTC day closes. `1` therefore
# means "today only" and answers with a header-only CSV (0 rows) until the
# first pass of the current UTC day lands — measured 2026-10-28T01:56Z:
#   day_range=1 -> 0 rows, day_range=2 -> 140 rows, CSV 24h file -> 190 rows
# A rolling 24h window needs `2` (yesterday + today), not `1`.
FIRMS_API_DAY_RANGE = 2


async def _http_get_text(url: str, timeout: float = 15.0) -> str:
    """Single HTTP text fetch. Module-level so tests can monkeypatch it."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.get(url)
        res.raise_for_status()
        return res.text


class NASAFIRMSAdapter(BaseAdapter):
    source_name = "nasa_firms"
    stream_key = STREAM_NASA_FIRMS
    poll_interval_seconds = 10800  # Poll every 3 hours (satellite pass intervals)

    # Sumatra Bounding Box (lon_west, lat_south, lon_east, lat_north)
    SUMATRA_BBOX = "94,-6,108,6"

    # Pan-Sumatra Bounding Box filter (covering Aceh, Sumut, Sumbar, Riau, Jambi, Bengkulu, Sumsel, Lampung)
    MIN_LAT, MAX_LAT = -6.0, 6.0
    MIN_LON, MAX_LON = 94.0, 108.0

    # Pan-Sumatra Highway Spines (Jalintim, Jalinteng, Jalinbar, Tol Trans-Sumatera)
    HIGHWAY_SPINE = [
        # Aceh
        {"name": "Banda Aceh - Malahayati Corridor", "lat": 5.55, "lon": 95.32},
        {"name": "Lhokseumawe Jalintim Segment", "lat": 5.18, "lon": 97.14},
        {"name": "Langsa Gateway Segment", "lat": 4.47, "lon": 97.96},
        # North Sumatra (Sumut)
        {"name": "Belawan Port Corridor", "lat": 3.80, "lon": 98.69},
        {"name": "Medan Hub", "lat": 3.58, "lon": 98.68},
        {"name": "Tebing Tinggi Interchange", "lat": 3.33, "lon": 99.16},
        {"name": "Pematangsiantar Route", "lat": 2.96, "lon": 99.07},
        {"name": "Rantauprapat Jalintim Segment", "lat": 2.10, "lon": 99.83},
        # West Sumatra (Sumbar)
        {"name": "Bukittinggi Jalinteng Segment", "lat": -0.30, "lon": 100.37},
        {"name": "Padang - Teluk Bayur Corridor", "lat": -0.95, "lon": 100.36},
        # Riau
        {"name": "Dumai Port Corridor", "lat": 1.68, "lon": 101.45},
        {"name": "Pekanbaru Logistics Hub", "lat": 0.51, "lon": 101.45},
        # Jambi
        {"name": "Jambi City Jalintim Segment", "lat": -1.61, "lon": 103.61},
        # Bengkulu
        {"name": "Bengkulu Jalinbar Segment", "lat": -3.80, "lon": 102.26},
        # South Sumatra (Sumsel)
        {"name": "Palembang Boom Baru Corridor", "lat": -2.98, "lon": 104.76},
        # Lampung
        {"name": "Terbanggi Besar Toll Interchange", "lat": -4.85, "lon": 105.18},
        {"name": "Bandar Lampung - Panjang Port", "lat": -5.45, "lon": 105.30},
        {"name": "Bakauheni Port Gateway", "lat": -5.87, "lon": 105.75},
    ]

    async def health_check(self) -> bool:
        """Check connection by querying FIRMS mapkey status (or status of API)."""
        if not settings.nasa_firms_map_key:
            logger.warning("NASA FIRMS API key not configured")
            return False

        try:
            # Check key status endpoint
            url = f"https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY={settings.nasa_firms_map_key}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    status_data = res.json()
                    # Example status JSON: {"transaction_count": 0, "max_limit": 5000, "status": "active"} or similar
                    # Check if mapkey is active
                    return "active" in status_data.get("status", "").lower() or "transaction_limit" in status_data
                return False
        except Exception as e:
            logger.warning(f"NASA FIRMS health check failed: {e}")
            # Fallback to simple status code check if status endpoint fails
            return False

    def api_csv_url(
        self,
        map_key: str | None = None,
        day_range: int = FIRMS_API_DAY_RANGE,
    ) -> str:
        """Keyed area-API CSV URL for the Sumatra bbox (never logged raw)."""
        key = settings.nasa_firms_map_key if map_key is None else map_key
        return f"{FIRMS_API_BASE}/{key}/{FIRMS_API_SENSOR}/{self.SUMATRA_BBOX}/{int(day_range)}"

    async def fetch(self) -> str:
        """Fetch active fire hotspot CSV data from NASA FIRMS (keyed API).

        Returns the CSV text — including a header-only CSV, which is a *real*
        empty answer — and "" only when the upstream is unusable (non-200,
        non-CSV error body, transport failure). Callers must distinguish the
        two: "0 rows" can still under-report, "" cannot be trusted at all.
        """
        if not settings.nasa_firms_map_key:
            return ""

        url = self.api_csv_url()
        redacted = url.replace(settings.nasa_firms_map_key, "***")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    text = res.text or ""
                    if "latitude" in text[:512].lower():
                        return text
                    # 200 with a non-CSV body ("Invalid MAP_KEY" and friends)
                    # must never be parsed as an empty result set.
                    logger.error(
                        f"NASA FIRMS API returned a non-CSV body ({redacted}): {text[:200]}"
                    )
                    return ""
                logger.error(
                    f"NASA FIRMS API returned status {res.status_code} ({redacted}): {res.text[:200]}"
                )
        except Exception as e:
            logger.error(f"Failed to fetch NASA FIRMS CSV data ({redacted}): {e}")
        return ""

    # -- Phase 168: keyless public CSV -------------------------------------

    @staticmethod
    def _keyless_window_tag(window_hours: int = FIRMS_KEYLESS_WINDOW_HOURS) -> str:
        """Map an hour window to the published CSV suffix (24h/48h/7d)."""
        try:
            hours = int(window_hours)
        except (TypeError, ValueError):
            hours = FIRMS_KEYLESS_WINDOW_HOURS
        return FIRMS_KEYLESS_WINDOWS.get(hours, "24h")

    def keyless_csv_urls(
        self, window_hours: int = FIRMS_KEYLESS_WINDOW_HOURS
    ) -> List[str]:
        """Per-country Indonesia CSVs first, then the Global static fallback."""
        tag = self._keyless_window_tag(window_hours)
        return [
            VIIRS_KEYLESS_CSV_TEMPLATE.format(window=tag),
            MODIS_KEYLESS_CSV_TEMPLATE.format(window=tag),
            VIIRS_GLOBAL_CSV_TEMPLATE.format(window=tag),
            MODIS_GLOBAL_CSV_TEMPLATE.format(window=tag),
        ]

    async def fetch_keyless_csv(
        self, window_hours: int = FIRMS_KEYLESS_WINDOW_HOURS
    ) -> str:
        """Fetch the keyless Indonesia CSV (no MAP_KEY, no quota).

        Returns "" when every candidate fails — never a fabricated payload.
        """
        for url in self.keyless_csv_urls(window_hours):
            try:
                text = await _http_get_text(url)
            except Exception as e:
                logger.warning(f"NASA FIRMS keyless CSV unavailable ({url}): {e}")
                continue
            if not text or not text.strip():
                logger.warning(f"NASA FIRMS keyless CSV empty ({url})")
                continue
            if "latitude" not in text[:512].lower():
                logger.warning(f"NASA FIRMS keyless CSV has no header ({url})")
                continue
            logger.info(f"NASA FIRMS keyless CSV loaded: {url}")
            return text
        return ""

    @staticmethod
    def _confidence_class(raw: Any) -> str:
        """Normalise VIIRS (l/n/h) and MODIS (0-100) confidence to a class."""
        text = str(raw or "").strip()
        if not text:
            return "nominal"
        try:
            value = float(text)
        except ValueError:
            lowered = text.lower()
            if lowered in ("l", "low"):
                return "low"
            if lowered in ("h", "high"):
                return "high"
            if lowered in ("n", "nominal"):
                return "nominal"
            return lowered
        if value >= 80:
            return "high"
        if value >= 50:
            return "nominal"
        return "low"

    def _nearest_spine(self, lat: float, lon: float) -> tuple:
        """Nearest Trans-Sumatra spine segment — provenance only, never a filter."""
        near_segment = None
        min_dist_km = 999.0
        for segment in self.HIGHWAY_SPINE:
            dist = self._haversine_distance(lat, lon, segment["lat"], segment["lon"])
            if dist < min_dist_km:
                min_dist_km = dist
                near_segment = segment["name"]
        return near_segment, min_dist_km

    @staticmethod
    def _severity_radius_confidence(frp: float, dist_km: float) -> tuple:
        """Single severity→(radius, heat confidence) mapping for every source."""
        if frp > 500:
            return "critical", 5.0, 95
        if frp > 100 or dist_km < 5.0:
            return "high", 2.5, 80
        return "medium", 1.0, 60

    def _normalise_keyless_row(
        self,
        row: Dict[str, Any],
        now_str: str,
        window_hours: int,
    ) -> Dict[str, Any] | None:
        """One CSV row → hotspot dict, or None when unparseable / out of bbox."""
        try:
            lat = float(row.get("latitude"))
            lon = float(row.get("longitude"))
        except (TypeError, ValueError):
            return None
        if not (self.MIN_LAT <= lat <= self.MAX_LAT and self.MIN_LON <= lon <= self.MAX_LON):
            return None

        try:
            frp = float(row.get("frp") or 0)
        except (TypeError, ValueError):
            frp = 0.0

        conf_class = self._confidence_class(row.get("confidence"))
        near_segment, min_dist_km = self._nearest_spine(lat, lon)
        severity, radius_km, confidence = self._severity_radius_confidence(frp, min_dist_km)
        acq_date = str(row.get("acq_date") or "")
        acq_time = str(row.get("acq_time") or "").zfill(4)
        satellite = str(row.get("satellite") or "")
        instrument = str(row.get("instrument") or "")
        daynight = str(row.get("daynight") or "")
        title = (
            f"Titik Panas (Satelit): FRP {frp}MW, conf {conf_class}"
            f"{f', {satellite}' if satellite else ''}"
            f"{f' {acq_date} {acq_time}' if acq_date else ''}"
            f", nearest {near_segment} {round(min_dist_km, 1)}km"
        )

        return {
            "source": "VIIRS_SNPP_NRT",
            "event_type": "wildfire",
            "type": "wildfire",
            "severity": severity,
            "lat": lat,
            "lon": lon,
            "coordinates": [lon, lat],
            "frp": frp,
            "confidence": confidence,
            "conf": conf_class,
            "acq_date": acq_date,
            "acq_time": acq_time,
            "satellite": satellite,
            "instrument": instrument,
            "daynight": daynight,
            "dist_to_corridor_km": round(min_dist_km, 2),
            "near_segment": near_segment,
            "radius_km": radius_km,
            "title": title,
            "ts": now_str,
            "window_hours": int(window_hours),
        }

    async def parse_keyless_csv(
        self, raw_data: str, window_hours: int = FIRMS_KEYLESS_WINDOW_HOURS
    ) -> List[Dict[str, Any]]:
        """Parse the public CSV into normalised hotspot dicts (bbox-filtered).

        No dedup and no confidence drop here: the CSV is a published snapshot,
        so count == number of in-bbox rows.
        """
        hotspots: List[Dict[str, Any]] = []
        if not raw_data or not raw_data.strip():
            return hotspots
        now_str = datetime.now(timezone.utc).isoformat()
        try:
            reader = csv.DictReader(io.StringIO(raw_data.strip()))
            for row in reader:
                hotspot = self._normalise_keyless_row(row, now_str, int(window_hours))
                if hotspot is not None:
                    hotspots.append(hotspot)
        except Exception as e:
            logger.error(f"Error parsing NASA FIRMS keyless CSV: {e}")
        return hotspots

    async def parse(self, raw_data: str) -> List[Dict[str, Any]]:
        """Parse FIRMS CSV data, filter for whole-Sumatra bbox, map to events.

        Whole-Sumatra scope: bbox 94,-6,108,6 only (no corridor-distance drop).
        HIGHWAY_SPINE is kept purely for nearest-segment provenance
        (dist_to_corridor_km / near_segment click contract), never as a filter.
        Keeps: confidence==low drop, 24h dedup, FRP severity mapping, Redis 3h cache.
        """
        events = []
        if not raw_data or raw_data.strip() == "":
            return events

        r = get_redis()
        now_str = datetime.now(timezone.utc).isoformat()

        try:
            f = io.StringIO(raw_data.strip())
            reader = csv.DictReader(f)
            
            for row in reader:
                try:
                    lat = float(row.get("latitude", 0))
                    lon = float(row.get("longitude", 0))
                    frp = float(row.get("frp", 0))
                    confidence = row.get("confidence", "nominal").lower()
                    acq_date = row.get("acq_date", "")
                    acq_time = row.get("acq_time", "")

                    # 1. Filter out low confidence
                    if confidence == "low":
                        continue

                    # 2. Filter geographically for Pan-Sumatra bbox
                    if not (self.MIN_LAT <= lat <= self.MAX_LAT and self.MIN_LON <= lon <= self.MAX_LON):
                        continue

                    # 3. Nearest Trans-Sumatra Highway spine segment — provenance only
                    # (dist_to_corridor_km / near_segment for the hotspot click contract).
                    # Whole-Sumatra scope: NEVER drop by distance; bbox above is the only geo gate.
                    near_segment = None
                    min_dist_km = 999.0

                    for segment in self.HIGHWAY_SPINE:
                        dist = self._haversine_distance(lat, lon, segment["lat"], segment["lon"])
                        if dist < min_dist_km:
                            min_dist_km = dist
                            near_segment = segment["name"]

                    # Severity from FRP intensity (+ <5km proximity booster, provenance only).
                    if frp > 500:
                        severity = "critical"
                    elif frp > 100 or min_dist_km < 5.0:
                        severity = "high"
                    else:
                        severity = "medium"

                    title = f"Wildfire Hazard: Active hotspot (FRP: {frp}MW, nearest {near_segment} {round(min_dist_km, 1)}km)"
                    dedup_key = f"firms:fire:{acq_date}:{acq_time}:{lat:.2f}:{lon:.2f}"

                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=86400)  # 24h dedup

                        events.append({
                            "source": self.source_name,
                            "event_type": "wildfire",
                            "severity": severity,
                            "lat": str(lat),
                            "lon": str(lon),
                            "title": title,
                            "raw": json.dumps(row),
                            "ts": now_str,
                            "dedup_key": dedup_key,
                            # Q3(B) hotspot click contract: FRP + conf + dist-to-corridor.
                            "frp": frp,
                            "conf": confidence,
                            "dist_to_corridor_km": round(min_dist_km, 2),
                            "near_segment": near_segment,
                        })
                except Exception as e:
                    logger.error(f"Error parsing row in FIRMS CSV: {e}")
                    
        except Exception as e:
            logger.error(f"Error reading FIRMS CSV data: {e}")

        return events

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate geographical distance between two points in km."""
        R = 6371.0  # Earth's radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
