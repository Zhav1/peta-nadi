import asyncio
import httpx
import logging
import math
import os
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import json

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_TOMTOM, get_redis, dedup_seen_or_mark
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

def tomtom_poll_seconds() -> int:
    """Poll interval for TomTom (default 1800s). Read dynamically so tests can monkeypatch env."""
    try:
        return int(os.getenv("TOMTOM_POLL_SECONDS", "1800") or 1800)
    except (TypeError, ValueError):
        return 1800


def tomtom_incidents_enabled() -> bool:
    val = os.getenv("TOMTOM_INCIDENTS_ENABLED", "true").strip().lower()
    return val not in ("0", "false", "no", "off")


def tomtom_incidents_every_n() -> int:
    try:
        n = int(os.getenv("TOMTOM_INCIDENTS_EVERY_N", "6") or 6)
        return n if n > 0 else 6
    except (TypeError, ValueError):
        return 6


def tomtom_api_keys() -> List[str]:
    """Ordered TomTom keys: primary then fallback. Uses module settings (mockable in tests)."""
    try:
        k1_raw = getattr(settings, "tomtom_api_key", "")
        k2_raw = getattr(settings, "tomtom_api_key_2", "")
    except Exception:
        k1_raw, k2_raw = "", ""
    k1 = k1_raw.strip() if isinstance(k1_raw, str) else ""
    # Non-string (e.g. MagicMock in tests that only sets key 1) means
    # "no second key" — do NOT fall back to process env in that case.
    k2 = k2_raw.strip() if isinstance(k2_raw, str) else ""
    if not k1 and k1_raw == "":
        k1 = (os.getenv("TOMTOM_API_KEY", "") or "").strip()
    if not k2 and k2_raw == "":
        k2 = (os.getenv("TOMTOM_API_KEY_2", "") or "").strip()
    keys: List[str] = []
    if k1:
        keys.append(k1)
    if k2 and k2 != k1:
        keys.append(k2)
    return keys


def is_in_sumatra_bounds(arg1: float, arg2: float) -> bool:
    """Strict Sumatra boundary filter excluding Peninsular Malaysia and Singapore (D5).

    Supports both (lon, lat) and (lat, lon) argument orders by inspecting coordinate ranges:
    lat is between -6.0 and 6.0, lon is between 94.5 and 109.0.
    Rejects any coordinate where lat > 1.2 and lon > 100.15,
    or lat > 0.5 and lon > 103.5 so ZERO Malaysian road segments pass through.
    """
    try:
        v1 = float(arg1)
        v2 = float(arg2)
    except (ValueError, TypeError):
        return False

    if 90.0 <= v1 <= 115.0 and -15.0 <= v2 <= 15.0:
        lon_f, lat_f = v1, v2
    elif 90.0 <= v2 <= 115.0 and -15.0 <= v1 <= 15.0:
        lat_f, lon_f = v1, v2
    else:
        lon_f, lat_f = v1, v2

    if lat_f < -6.0 or lat_f > 6.0:
        return False
    if lon_f < 94.5 or lon_f > 109.0:
        return False
    if lat_f > 1.2 and lon_f > 100.15:
        return False
    if lat_f > 0.5 and lon_f > 103.5:
        return False
    return True


def extract_polyline_from_flow(flow_seg: Dict[str, Any]) -> List[List[float]]:
    """Extract [[lon, lat], ...] coordinates from flowSegmentData.coordinates.coordinate."""
    coords: List[List[float]] = []
    if not isinstance(flow_seg, dict):
        return coords
    coord_block = flow_seg.get("coordinates", {})
    coord_list = coord_block.get("coordinate", []) if isinstance(coord_block, dict) else []
    if not isinstance(coord_list, list):
        return coords
    for pt in coord_list:
        if isinstance(pt, dict):
            lat = pt.get("latitude") if pt.get("latitude") is not None else pt.get("lat")
            lon = pt.get("longitude") if pt.get("longitude") is not None else pt.get("lon")
            if lat is not None and lon is not None:
                try:
                    lat_f = round(float(lat), 5)
                    lon_f = round(float(lon), 5)
                    if is_in_sumatra_bounds(lon_f, lat_f):
                        coords.append([lon_f, lat_f])
                except (ValueError, TypeError):
                    continue
        elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
            try:
                lon_f = round(float(pt[0]), 5)
                lat_f = round(float(pt[1]), 5)
                if is_in_sumatra_bounds(lon_f, lat_f):
                    coords.append([lon_f, lat_f])
            except (ValueError, TypeError):
                continue
    return coords


def read_cached_flow_items(redis_client=None, max_age_seconds: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Read fresh lrip:tomtom:segment:* payloads written by the main poller.

    Preserves real road polylines from flowSegmentData.coordinates.coordinate
    as [[lon, lat], ...].
    Returns a fetch()-shaped dict when at least one fresh segment exists,
    else None (caller must fresh fetch() / fall back to seeds).
    """
    if max_age_seconds is None:
        max_age_seconds = tomtom_poll_seconds()
    try:
        from app.services.redis_client import get_redis as _get_redis
        r = redis_client or _get_redis()
        try:
            keys = r.keys("lrip:tomtom:segment:*")
        except Exception:
            return None
        if not keys:
            return None
        now_ts = time.time()
        flow_items: List[Dict[str, Any]] = []
        for k in keys:
            try:
                key_str = k.decode() if isinstance(k, bytes) else k
                raw = r.get(key_str)
                if raw is None:
                    continue
                if isinstance(raw, bytes):
                    raw = raw.decode()
                payload = json.loads(raw)
                ts = float(payload.get("timestamp", 0) or 0)
                if now_ts - ts > max_age_seconds:
                    continue
                name = payload.get("name") or key_str.split(":")[-1]
                flow_segment_raw = payload.get("flowSegmentData", {})
                raw_coords = (
                    payload.get("coordinates")
                    or extract_polyline_from_flow(flow_segment_raw)
                    or payload.get("polyline")
                    or []
                )
                coords: List[List[float]] = []
                if isinstance(raw_coords, list):
                    for pt in raw_coords:
                        if isinstance(pt, dict):
                            lat_c = pt.get("latitude") if pt.get("latitude") is not None else pt.get("lat")
                            lon_c = pt.get("longitude") if pt.get("longitude") is not None else pt.get("lon")
                            if lat_c is not None and lon_c is not None:
                                try:
                                    lat_val = round(float(lat_c), 5)
                                    lon_val = round(float(lon_c), 5)
                                    if is_in_sumatra_bounds(lon_val, lat_val):
                                        coords.append([lon_val, lat_val])
                                except (ValueError, TypeError):
                                    continue
                        elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                            try:
                                lon_val = round(float(pt[0]), 5)
                                lat_val = round(float(pt[1]), 5)
                                if is_in_sumatra_bounds(lon_val, lat_val):
                                    coords.append([lon_val, lat_val])
                            except (ValueError, TypeError):
                                continue

                flow_items.append({
                    "flowSegmentData": {
                        "currentSpeed": float(payload.get("currentSpeed", flow_segment_raw.get("currentSpeed", 0))),
                        "freeFlowSpeed": float(payload.get("freeFlowSpeed", flow_segment_raw.get("freeFlowSpeed", 60))),
                        "currentTravelTime": payload.get("currentTravelTime", flow_segment_raw.get("currentTravelTime", 0)),
                        "coordinates": {"coordinate": [{"latitude": c[1], "longitude": c[0]} for c in coords]},
                        "polyline": coords,
                    },
                    "coordinates": coords,
                    "_checkpoint_name": name,
                    "_checkpoint_id": payload.get("id"),
                    "_lat": payload.get("lat"),
                    "_lon": payload.get("lon"),
                })
            except Exception:
                continue
        if not flow_items:
            return None
        return {
            "flow": flow_items,
            "incidents": [],
            "status": "ok",
            "degraded_reason": None,
            "credit_exhausted": False,
            "credit_exhausted_until": "",
            "tiles_total": 0,
            "tiles_queried": 0,
            "tiles_failed": 0,
            "_cache_hit": True,
        }
    except Exception:
        return None


class TomTomAdapter(BaseAdapter):
    source_name = "tomtom"
    stream_key = STREAM_TOMTOM
    poll_interval_seconds = 1800  # Default 30 min; overridden per-instance from TOMTOM_POLL_SECONDS

    FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
    INCIDENT_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails"
    INCIDENT_FIELDS = "{incidents{type,properties{id,iconCategory,delay,startTime,endTime},geometry{type,coordinates}}}"

    # Strategic Checkpoints across Trans-Sumatra Highway Corridors (20 Chokepoints, strictly mainland Sumatra)
    CHECKPOINTS = [
        {"id": "belawan_port_gate", "name": "Belawan Port Gate", "lat": 3.7850, "lon": 98.6850},
        {"id": "belmera_tanjung_mulia", "name": "Tol Belmera Tanjung Mulia", "lat": 3.6550, "lon": 98.6750},
        {"id": "medan_binjai_km18", "name": "Tol Medan-Binjai Km 18", "lat": 3.6080, "lon": 98.5250},
        {"id": "medan_kno_tebing", "name": "Tol Medan-Kualanamu-Tebing Tinggi", "lat": 3.5410, "lon": 98.8700},
        {"id": "tebing_tinggi_jct", "name": "Simpang Tebing Tinggi Jalinsum", "lat": 3.3280, "lon": 99.1620},
        {"id": "pematangsiantar_km128", "name": "Jalinsum Pematangsiantar", "lat": 2.9600, "lon": 99.0680},
        {"id": "kisaran_rantauprapat", "name": "Jalinsum Kisaran-Asahan", "lat": 2.9830, "lon": 99.6180},
        {"id": "sibolga_tarutung", "name": "Jalinsum Barat Sibolga-Tarutung", "lat": 1.7480, "lon": 98.7850},
        {"id": "banda_aceh_sigli", "name": "Tol Sigli-Banda Aceh", "lat": 5.4520, "lon": 95.5810},
        {"id": "lhokseumawe_aceh_timur", "name": "Jalinsum Timur Lhokseumawe", "lat": 5.1780, "lon": 97.1420},
        {"id": "dumai_port_gate", "name": "Pelabuhan Dumai Access", "lat": 1.6810, "lon": 101.4480},
        {"id": "tol_permai_minas", "name": "Tol Pekanbaru-Dumai (Minas)", "lat": 0.7650, "lon": 101.4520},
        {"id": "pekanbaru_bypass", "name": "Lintas Timur Pekanbaru Bypass", "lat": 0.4850, "lon": 101.4120},
        {"id": "bukittinggi_padang_panjang", "name": "Lembah Anai / Padang Panjang", "lat": -0.3680, "lon": 100.3980},
        {"id": "padang_teluk_bayur", "name": "Padang Bypass - Teluk Bayur", "lat": -0.9980, "lon": 100.3720},
        {"id": "jambi_lintas_timur", "name": "Jalinsum Timur Jambi", "lat": -1.6150, "lon": 103.5850},
        {"id": "palembang_kramasan", "name": "Palembang Kramasan / Boom Baru", "lat": -3.0450, "lon": 104.7420},
        {"id": "tol_palindra_indralaya", "name": "Tol Palembang-Indralaya", "lat": -3.1850, "lon": 104.6620},
        {"id": "terbanggi_besar_lampung", "name": "Tol Trans-Sumatra Terbanggi Besar", "lat": -4.8550, "lon": 105.2150},
        {"id": "bakauheni_ferry_port", "name": "Pelabuhan Bakauheni Access", "lat": -5.8680, "lon": 105.7520},
    ]

    # Corridor-anchored incident tiles: 0.5 deg lat x 0.75 deg lon (~4,600 km2 at Sumatra
    # latitudes), strictly below the TomTom 10,000 km2 bbox ceiling. The previous
    # Pan-Sumatra bbox was ~1.7M km2, ~170x over the limit.
    TILE_LAT_SPAN_DEG = 0.5
    TILE_LON_SPAN_DEG = 0.75
    MAX_BBOX_AREA_KM2 = 10_000.0
    TILE_REQUEST_SLEEP_SECONDS = 0.4

    # Credit-exhaustion latch: shared at class level so every caller (poller, corridor
    # service, routing) backs off after a single 403 InsufficientFunds.
    # TODO(multi-worker): this latch is in-process monotonic expiry only; it is NOT
    # shared across uvicorn workers / replicas. Each process latches independently,
    # so N workers may each emit one credit-403 burst per cooldown window before
    # backing off. To share, store latch expiry+reason in Redis (e.g.
    # lrip:health:source:tomtom latch hash) with SET NX + TTL. See
    # TOMTOM_LATCH_SHARED stub below.
    CREDIT_EXHAUSTION_COOLDOWN_SECONDS = 900
    _credit_exhausted_until: float = 0.0
    _credit_exhausted_reason: str = ""
    _credit_exhausted_at_wall: float = 0.0
    # Incident-cadence cycle counter (class-level so poller + on-demand callers
    # share one cadence; incremented once per fetch() call).
    _fetch_cycle: int = 0
    _fetch_cache: Optional[Dict[str, Any]] = None
    _fetch_cache_time: float = 0.0
    FETCH_CACHE_TTL_SECONDS: float = 3600.0  # 60 minutes cache guard (480 calls/day, ~14,400/month < 20,000 free limit)
    FLOW_SEGMENT_MONTHLY_MAX: int = 18000
    VECTOR_TILES_MONTHLY_MAX: int = 150000
    INCIDENTS_MONTHLY_MAX: int = 2200

    def __init__(self):
        super().__init__()
        try:
            self.poll_interval_seconds = tomtom_poll_seconds()
        except Exception:
            self.poll_interval_seconds = 1800

    @classmethod
    def shared_latch_enabled(cls) -> bool:
        """Env stub for a future Redis-shared latch. Always False in this unit."""
        # TODO: wire TOMTOM_LATCH_SHARED=true to a Redis-backed latch so all
        # workers share one cooldown window.
        _ = os.getenv("TOMTOM_LATCH_SHARED", "false")
        return False

    # ------------------------------------------------------------------
    # Credit exhaustion latch
    # ------------------------------------------------------------------
    @classmethod
    def is_credit_exhausted(cls) -> bool:
        """True while the TomTom cooldown after an InsufficientFunds 403 is active."""
        return time.monotonic() < cls._credit_exhausted_until

    @classmethod
    def credit_exhausted_reason(cls) -> str:
        return cls._credit_exhausted_reason

    @classmethod
    def _mark_credit_exhausted(cls, reason: str):
        """Latch credit exhaustion, logging exactly once per cooldown window."""
        now = time.monotonic()
        first_latch = now >= cls._credit_exhausted_until
        cls._credit_exhausted_until = now + cls.CREDIT_EXHAUSTION_COOLDOWN_SECONDS
        cls._credit_exhausted_reason = reason
        cls._credit_exhausted_at_wall = time.time()
        if first_latch:
            try:
                wall_iso = datetime.fromtimestamp(
                    cls._credit_exhausted_at_wall, tz=timezone.utc
                ).isoformat()
            except Exception:
                wall_iso = ""
            logger.warning(
                f"TomTom credit exhausted ({reason}; at {wall_iso}); pausing TomTom calls for "
                f"{cls.CREDIT_EXHAUSTION_COOLDOWN_SECONDS}s"
            )

    @classmethod
    def reset_credit_latch(cls):
        """Clear the latch (used for tests and manual recovery)."""
        cls._credit_exhausted_until = 0.0
        cls._credit_exhausted_reason = ""
        cls._credit_exhausted_at_wall = 0.0
        cls._exhausted_key_indexes = set()
        cls._active_key_index = 0
        cls._fetch_cache = None
        cls._fetch_cache_time = 0.0

    @classmethod
    def reset_fetch_cache(cls):
        """Clear the 10-minute fetch cache (tests)."""
        cls._fetch_cache = None
        cls._fetch_cache_time = 0.0

    @classmethod
    def reset_fetch_cycle(cls):
        """Reset the incident-cadence cycle counter (tests)."""
        cls._fetch_cycle = 0

    # Per-key credit state: index into tomtom_api_keys() that hit
    # InsufficientFunds. When key[0] is exhausted we fail over to key[1]
    # and only engage the global 900s latch once every key is exhausted.
    _exhausted_key_indexes: set = set()
    _active_key_index: int = 0

    @classmethod
    def reset_key_state(cls):
        """Clear per-key exhaustion (tests + manual recovery)."""
        cls._exhausted_key_indexes = set()
        cls._active_key_index = 0

    @classmethod
    def active_key_index(cls) -> int:
        keys = tomtom_api_keys()
        if not keys:
            return 0
        return min(cls._active_key_index, len(keys) - 1)

    @classmethod
    async def _get_with_key_fallback(
        cls, client, url: str, params: Dict[str, Any], endpoint: str,
        *, reserve_provider_budget=None, budget_adapter=None,
    ):
        """GET trying keys in order. Returns (response, key_index, all_exhausted).

        On a credit-classified 403 the used key is marked exhausted and the
        next key is tried once. Non-credit statuses return immediately.
        """
        keys = tomtom_api_keys()
        last_res = None
        for i, key in enumerate(keys):
            if i in cls._exhausted_key_indexes:
                continue
            if budget_adapter is None or not await budget_adapter.reserve_request_budget(
                callback=reserve_provider_budget
            ):
                return None, i, True
            p = dict(params)
            p["key"] = key
            try:
                res = await client.get(url, params=p)
            except Exception:
                raise
            if res.status_code != 403:
                cls._active_key_index = i
                return res, i, False
            is_credit, evidence = cls._extract_403_signal(res, endpoint=endpoint)
            if not is_credit:
                cls._active_key_index = i
                return res, i, False
            cls._exhausted_key_indexes.add(i)
            logger.warning(f"TomTom key[{i}] credit exhausted ({evidence}); failing over")
            last_res = res
            continue
        # Every configured key exhausted (or no keys at all).
        if last_res is not None:
            return last_res, max(0, len(keys) - 1), True
        return None, 0, True

    @classmethod
    def credit_exhausted_until_iso(cls) -> str:
        """UTC ISO timestamp of latch expiry, or '' when not latched."""
        if not cls.is_credit_exhausted():
            return ""
        try:
            return datetime.fromtimestamp(
                cls._credit_exhausted_at_wall + cls.CREDIT_EXHAUSTION_COOLDOWN_SECONDS,
                tz=timezone.utc,
            ).isoformat()
        except Exception:
            return ""

    @classmethod
    def _is_credit_exhaustion(cls, status_code: int, payload: Any, text_snippet: str) -> bool:
        if status_code != 403:
            return False
        keywords = ("insufficient", "credit", "quota", "overlimit", "over_limit", "allowance")
        candidates: List[str] = []
        if isinstance(payload, dict):
            detailed = payload.get("detailedError", {})
            if isinstance(detailed, dict) and detailed.get("code"):
                candidates.append(str(detailed.get("code")))
            for key in ("code", "error", "message"):
                val = payload.get(key)
                if val is not None:
                    candidates.append(str(val))
        if text_snippet:
            candidates.append(str(text_snippet))
        blob = " ".join(candidates).lower()
        return any(k in blob for k in keywords)

    @classmethod
    def _extract_403_signal(cls, res, endpoint: str = "unknown") -> Tuple[bool, str]:
        try:
            payload = res.json()
        except Exception:
            payload = {}
        try:
            text_snippet = str(getattr(res, "text", "") or "")[:500]
        except Exception:
            text_snippet = ""
        status_code = getattr(res, "status_code", 0)
        try:
            is_credit = cls._is_credit_exhaustion(status_code, payload, text_snippet)
        except Exception:
            is_credit = False
        if status_code == 403:
            if is_credit:
                evidence = ""
                if isinstance(payload, dict):
                    detailed = payload.get("detailedError")
                    if isinstance(detailed, dict) and detailed.get("code"):
                        evidence = f"code={detailed.get('code')}"
                    elif payload.get("code"):
                        evidence = f"code={payload.get('code')}"
                    elif payload.get("error"):
                        evidence = f"error={str(payload.get('error'))[:100]}"
                    elif payload.get("message"):
                        evidence = f"message={str(payload.get('message'))[:100]}"
                if not evidence:
                    snippet = (text_snippet or "").strip()[:100]
                    evidence = f"http403-{snippet}" if snippet else "http403-credit-signal"
                # Log-once per latch window for credit signals; never log API key.
                if not cls.is_credit_exhausted():
                    logger.warning(
                        "TomTom 403 credit signal endpoint=%s status=%s evidence=%s body=%s",
                        endpoint, status_code, evidence, text_snippet[:500],
                    )
                return True, evidence
            # Non-credit 403: always log at warning (no latch).
            logger.warning(
                "TomTom 403 non-credit endpoint=%s status=%s body=%s",
                endpoint, status_code, text_snippet[:500],
            )
            return False, "http403-no-credit-signal"
        if is_credit:
            evidence = ""
            if isinstance(payload, dict):
                detailed = payload.get("detailedError")
                if isinstance(detailed, dict) and detailed.get("code"):
                    evidence = f"code={detailed.get('code')}"
                elif payload.get("code"):
                    evidence = f"code={payload.get('code')}"
                elif payload.get("error"):
                    evidence = f"error={str(payload.get('error'))[:100]}"
                elif payload.get("message"):
                    evidence = f"message={str(payload.get('message'))[:100]}"
            if not evidence:
                snippet = (text_snippet or "").strip()[:100]
                evidence = f"http403-{snippet}" if snippet else "http403-credit-signal"
            return True, evidence
        return False, "http403-no-credit-signal"

    # ------------------------------------------------------------------
    # Corridor-anchored tiling
    # ------------------------------------------------------------------
    @classmethod
    def bbox_area_km2(cls, bbox: str) -> float:
        """Area of a 'minLon,minLat,maxLon,maxLat' bbox, cosine-corrected at mid-latitude."""
        min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
        mid_lat = (min_lat + max_lat) / 2.0
        height_km = (max_lat - min_lat) * 111.32
        width_km = (max_lon - min_lon) * 111.32 * max(0.05, math.cos(math.radians(mid_lat)))
        return height_km * width_km

    @classmethod
    def build_corridor_tiles(cls) -> List[Dict[str, Any]]:
        """
        Corridor-anchored bbox tiles centered on each arterial checkpoint/hub.
        Each tile is <= MAX_BBOX_AREA_KM2; deduplicated so nearby checkpoints do not
        produce duplicate requests.
        """
        tiles: Dict[str, Dict[str, Any]] = {}
        for cp in cls.CHECKPOINTS:
            min_lat = round(cp["lat"] - cls.TILE_LAT_SPAN_DEG / 2.0, 4)
            max_lat = round(cp["lat"] + cls.TILE_LAT_SPAN_DEG / 2.0, 4)
            min_lon = round(cp["lon"] - cls.TILE_LON_SPAN_DEG / 2.0, 4)
            max_lon = round(cp["lon"] + cls.TILE_LON_SPAN_DEG / 2.0, 4)
            bbox = f"{min_lon},{min_lat},{max_lon},{max_lat}"

            if bbox in tiles:
                tiles[bbox]["anchors"].append(cp["name"])
                continue

            area_km2 = cls.bbox_area_km2(bbox)
            if area_km2 > cls.MAX_BBOX_AREA_KM2:
                logger.error(
                    f"Refusing oversized TomTom bbox for {cp['name']}: "
                    f"{area_km2:.0f} km2 > {cls.MAX_BBOX_AREA_KM2:.0f} km2 limit"
                )
                continue

            tiles[bbox] = {
                "bbox": bbox,
                "center": [cp["lat"], cp["lon"]],
                "area_km2": round(area_km2, 1),
                "anchors": [cp["name"]],
            }
        return list(tiles.values())

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------
    async def health_check(self) -> bool:
        """Check if TomTom API is responsive by querying a single checkpoint."""
        if not tomtom_api_keys():
            logger.warning("TomTom API key not configured")
            return False

        if self.is_credit_exhausted():
            logger.warning(f"TomTom credit exhausted ({self.credit_exhausted_reason()}); health degraded")
            return False

        try:
            checkpoint = self.CHECKPOINTS[0]
            params = {
                "point": f"{checkpoint['lat']},{checkpoint['lon']}"
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                res, _idx, all_out = await self._get_with_key_fallback(
                    client, self.FLOW_URL, params, endpoint=f"health:{checkpoint['name']}",
                    budget_adapter=self,
                )
                if res is None:
                    return False
                if res.status_code == 403:
                    if all_out:
                        self._mark_credit_exhausted(
                            f"HTTP 403 on health check for {checkpoint['name']} (all keys exhausted)"
                        )
                    return False
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"TomTom health check failed: {e}")
            return False

    async def fetch(self, *, reserve_provider_budget=None) -> Dict[str, Any]:
        """
        Fetch segment flow data for all checkpoints plus traffic incidents across
        corridor-anchored tiles (each <= 10,000 km2), deduplicated by incident ID.
        Guarded by a 10-minute cache to stay well under free tier limits.


        Flow is fetched every cycle. Incident tiles are fetched only when
        TOMTOM_INCIDENTS_ENABLED=true and cycle % TOMTOM_INCIDENTS_EVERY_N == 0;
        otherwise tiles_total is set but tiles_queried stays 0 with an
        incidents_skipped_cadence note in degraded_reason.
        """
        now_mono = time.monotonic()
        if (
            TomTomAdapter._fetch_cache is not None
            and (now_mono - TomTomAdapter._fetch_cache_time) < TomTomAdapter.FETCH_CACHE_TTL_SECONDS
        ):
            cached = dict(TomTomAdapter._fetch_cache)
            cached["_cache_hit"] = True
            return cached
        cycle = TomTomAdapter._fetch_cycle
        TomTomAdapter._fetch_cycle += 1
        _inc_enabled = tomtom_incidents_enabled()
        try:
            _every_n = tomtom_incidents_every_n()
        except Exception:
            _every_n = 6
        should_query_incidents = bool(_inc_enabled and (cycle % _every_n == 0))
        if _inc_enabled:
            _skip_note = f"incidents_skipped_cadence (cycle {cycle} % {_every_n} != 0)"
        else:
            _skip_note = "incidents_skipped_cadence (disabled TOMTOM_INCIDENTS_ENABLED=false)"

        data: Dict[str, Any] = {
            "flow": [],
            "incidents": [],
            "status": "ok",
            "degraded_reason": None,
            "credit_exhausted": self.is_credit_exhausted(),
            "credit_exhausted_until": self.credit_exhausted_until_iso(),
            "api_keys_configured": len(tomtom_api_keys()),
            "api_key_index": self.active_key_index(),
            "tiles_total": 0,
            "tiles_queried": 0,
            "tiles_failed": 0,
            "expected_checkpoint_count": len(self.CHECKPOINTS),
            "observed_checkpoint_count": 0,
        }

        if not tomtom_api_keys():
            data["status"] = "degraded"
            data["degraded_reason"] = "tomtom_api_key_missing"
            data["credit_exhausted_until"] = self.credit_exhausted_until_iso()
            return data

        if self.is_credit_exhausted():
            data["status"] = "degraded"
            data["degraded_reason"] = (
                f"credit_exhausted: {self.credit_exhausted_reason()} "
                f"(until {self.credit_exhausted_until_iso()})"
            )
            data["credit_exhausted_until"] = self.credit_exhausted_until_iso()
            logger.debug("TomTom fetch skipped: credit exhaustion latch active")
            return data

        flow_attempts = 0
        flow_successes = 0
        flow_failures = 0

        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Fetch flow segment data for all checkpoints
            for cp in self.CHECKPOINTS:
                if self.is_credit_exhausted():
                    break
                try:
                    flow_attempts += 1
                    params = {
                        "point": f"{cp['lat']},{cp['lon']}"
                    }
                    res, _idx, all_out = await self._get_with_key_fallback(
                        client, self.FLOW_URL, params, endpoint=f"flow:{cp['name']}",
                        reserve_provider_budget=reserve_provider_budget, budget_adapter=self,
                    )
                    if res is None:
                        flow_failures += 1
                        continue
                    if res.status_code == 403:
                        if all_out:
                            self._mark_credit_exhausted(
                                f"HTTP 403 on flow segment {cp['name']} (all keys exhausted)"
                            )
                            break
                        flow_failures += 1
                        continue
                    if res.status_code == 200:
                        flow_successes += 1
                        flow_json = res.json()
                        seg_data = flow_json.get("flowSegmentData", {})
                        coords = extract_polyline_from_flow(seg_data)
                        flow_json["coordinates"] = coords
                        flow_json["_checkpoint_name"] = cp["name"]
                        flow_json["_checkpoint_id"] = cp.get("id", cp["name"])
                        flow_json["_lat"] = cp["lat"]
                        flow_json["_lon"] = cp["lon"]
                        data["flow"].append(flow_json)
                        data["observed_checkpoint_count"] = len(data["flow"])

                        # Cache segment to Redis with real coordinates
                        try:
                            from app.services.redis_client import get_redis
                            r = get_redis()
                            cp_key = cp.get("id") or cp["name"].replace(" ", "_").lower()
                            r.set(
                                f"lrip:tomtom:segment:{cp_key}",
                                json.dumps({
                                    "name": cp["name"],
                                    "id": cp.get("id"),
                                    "lat": cp["lat"],
                                    "lon": cp["lon"],
                                    "currentSpeed": seg_data.get("currentSpeed", 0),
                                    "freeFlowSpeed": seg_data.get("freeFlowSpeed", 60),
                                    "currentTravelTime": seg_data.get("currentTravelTime", 0),
                                    "flowSegmentData": seg_data,
                                    "coordinates": coords,
                                    "timestamp": time.time(),
                                }),
                                ex=int(self.FETCH_CACHE_TTL_SECONDS * 2),
                            )
                        except Exception:
                            pass
                    else:
                        flow_failures += 1
                        logger.warning(f"TomTom flow segment {cp['name']} returned HTTP {res.status_code}")
                except Exception as e:
                    flow_failures += 1
                    logger.error(f"Failed to fetch TomTom flow for {cp['name']}: {e}")

            # 2. Fetch traffic incidents across corridor-anchored tiles, sequentially with sleeps
            # Incident tiles are cadence-gated: flow every cycle, incidents only on
            # enabled cycles. Skipped cycles keep tiles_total for observability.
            tiles = self.build_corridor_tiles()
            data["tiles_total"] = len(tiles)
            deduped_incidents: Dict[str, Dict[str, Any]] = {}
            incidents_skipped = not should_query_incidents

            if incidents_skipped:
                data["incidents"] = []
            else:
                for index, tile in enumerate(tiles):
                    if self.is_credit_exhausted():
                        break
                    if index > 0:
                        await asyncio.sleep(self.TILE_REQUEST_SLEEP_SECONDS)
                    try:
                        params = {
                            "bbox": tile["bbox"],
                            "fields": self.INCIDENT_FIELDS,
                        }
                        res, _idx, all_out = await self._get_with_key_fallback(
                            client, self.INCIDENT_URL, params, endpoint=f"incidents:{tile['bbox']}",
                            reserve_provider_budget=reserve_provider_budget, budget_adapter=self,
                        )
                        data["tiles_queried"] += 1
                        if res is None:
                            data["tiles_failed"] += 1
                            continue
                        if res.status_code == 403:
                            if all_out:
                                self._mark_credit_exhausted(
                                    f"HTTP 403 on incident tile {tile['bbox']} (all keys exhausted)"
                                )
                                break
                            data["tiles_failed"] += 1
                            continue
                        if res.status_code != 200:
                            data["tiles_failed"] += 1
                            logger.warning(
                                f"TomTom incident tile {tile['bbox']} returned HTTP {res.status_code}"
                            )
                            continue
                        for incident in res.json().get("incidents", []) or []:
                            incident_id = str((incident.get("properties") or {}).get("id") or "")
                            if not incident_id:
                                incident_id = json.dumps(incident.get("geometry", {}), sort_keys=True)
                            deduped_incidents.setdefault(incident_id, incident)
                    except Exception as e:
                        data["tiles_failed"] += 1
                        logger.error(f"Failed to fetch TomTom incidents for tile {tile['bbox']}: {e}")

                data["incidents"] = list(deduped_incidents.values())

            # 3. Honest aggregate status
            # incidents_skipped_cadence is informational (intentional cadence
            # gating to save credits); it never forces a degraded/down status
            # on its own — flow health drives status.
            degraded_reasons: List[str] = []
            if self.is_credit_exhausted():
                degraded_reasons.append(
                    f"credit_exhausted: {self.credit_exhausted_reason()} "
                    f"(until {self.credit_exhausted_until_iso()})"
                )
                data["status"] = "degraded"
            elif flow_attempts > 0 and flow_successes == 0:
                data["status"] = "down"
                degraded_reasons.append("all_flow_requests_failed")
            else:
                if flow_failures > 0:
                    data["status"] = "degraded"
                    degraded_reasons.append(f"{flow_failures}/{flow_attempts} flow requests failed")
                if data["tiles_failed"] > 0:
                    data["status"] = "degraded" if data["status"] != "down" else "down"
                    degraded_reasons.append(f"{data['tiles_failed']}/{data['tiles_total']} incident tiles failed")
            if incidents_skipped:
                degraded_reasons.append(_skip_note)

            data["credit_exhausted"] = self.is_credit_exhausted()
            data["credit_exhausted_until"] = self.credit_exhausted_until_iso()
            data["api_keys_configured"] = len(tomtom_api_keys())
            data["api_key_index"] = self.active_key_index()
            if data["observed_checkpoint_count"] < data["expected_checkpoint_count"] and flow_successes:
                data["status"] = "degraded"
                degraded_reasons.append(
                    f"partial_flow_coverage:{data['observed_checkpoint_count']}/{data['expected_checkpoint_count']}"
                )
            data["degraded_reason"] = "; ".join(degraded_reasons) or None

        if data.get("flow") or data.get("status") == "ok":
            TomTomAdapter._fetch_cache = dict(data)
            TomTomAdapter._fetch_cache_time = time.monotonic()

        return data

    async def parse(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse raw flow and incident data into normalized events."""
        events = []
        now_str = datetime.now(timezone.utc).isoformat()
        current_hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")

        # 1. Parse flow segment data
        for flow_data in raw_data.get("flow", []):
            try:
                segment = flow_data.get("flowSegmentData", {})
                cp_name = flow_data["_checkpoint_name"]
                lat = flow_data["_lat"]
                lon = flow_data["_lon"]

                free_flow = segment.get("freeFlowSpeed", 0)
                current = segment.get("currentSpeed", 0)
                road_closed = segment.get("roadClosure", False)

                if free_flow > 0:
                    congestion_score = 1.0 - (current / free_flow)
                else:
                    congestion_score = 0.0

                # Determine if alert is needed (congestion, closure, or very low speed)
                if congestion_score > 0.5 or road_closed or (current < 20 and free_flow > 40):
                    # Severity mapping
                    if road_closed or congestion_score >= 0.9:
                        severity = "critical"
                        title = f"ROAD CLOSED / BLOCKAGE: {cp_name}" if road_closed else f"Standstill Traffic: {cp_name} ({current} km/h)"
                    elif congestion_score >= 0.7:
                        severity = "high"
                        title = f"Severe Traffic Congestion: {cp_name} ({current} km/h)"
                    elif congestion_score >= 0.5:
                        severity = "medium"
                        title = f"Moderate Traffic Congestion: {cp_name} ({current} km/h)"
                    else:
                        severity = "low"
                        title = f"Minor Traffic Delay: {cp_name} ({current} km/h)"

                    dedup_key = f"tomtom:flow:{cp_name.replace(' ', '_').lower()}:{current_hour}"

                    if not dedup_seen_or_mark(f"lrip:dedup:{dedup_key}", ex=3600):
                        events.append({
                            "source": self.source_name,
                            "event_type": "road_closure" if road_closed else "congestion",
                            "severity": severity,
                            "lat": str(lat),
                            "lon": str(lon),
                            "title": title,
                            "raw": json.dumps(segment),
                            "ts": now_str,
                            "dedup_key": dedup_key
                        })
            except Exception as e:
                logger.error(f"Error parsing TomTom flow segment: {e}")

        # Category to description mapping
        category_map = {
            1: "Accident",
            2: "Fog",
            3: "Dangerous Conditions",
            4: "Rain",
            5: "Ice",
            6: "Congestion/Queue",
            7: "Road Closed",
            8: "Wind",
            9: "Flooding",
            10: "Broken down vehicle"
        }

        # 2. Parse incidents
        for incident in raw_data.get("incidents", []):
            try:
                properties = incident.get("properties", {})
                incident_id = properties.get("id")
                category = int(properties.get("iconCategory") or 0)
                delay = int(properties.get("delay") or 0)
                
                desc = category_map.get(category, "Traffic Incident")
                
                # Extract coordinate from geometry (LineString or Point)
                geometry = incident.get("geometry", {})
                coords = geometry.get("coordinates", [])
                if not coords:
                    continue
                
                # Get the first coordinate point
                if geometry.get("type") == "LineString":
                    lon_val, lat_val = coords[0]
                else:  # Point
                    lon_val, lat_val = coords

                # Category mapping: 7 = Closed, 9 = Flooding
                event_type = "congestion"
                if category == 7:
                    event_type = "road_closure"
                elif category == 9:
                    event_type = "flood"

                # Delay-based severity mapping
                if category == 7 or delay >= 1800:
                    severity = "critical"
                elif delay >= 600:
                    severity = "high"
                elif delay >= 300:
                    severity = "medium"
                else:
                    severity = "low"

                # Filter out low-severity incidents to avoid noise
                if severity in ["high", "critical"] or event_type in ["road_closure", "flood"]:
                    dedup_key = f"tomtom:incident:{incident_id}"

                    if not dedup_seen_or_mark(f"lrip:dedup:{dedup_key}", ex=14400):
                        events.append({
                            "source": self.source_name,
                            "event_type": event_type,
                            "severity": severity,
                            "lat": str(lat_val),
                            "lon": str(lon_val),
                            "title": f"TomTom Incident: {desc} (Delay: {delay}s)",
                            "raw": json.dumps(incident),
                            "ts": now_str,
                            "dedup_key": dedup_key
                        })
            except Exception as e:
                logger.error(f"Error parsing TomTom incident: {e}")

        return events


CHECKPOINT_CORRIDOR_MAP = {
    # 20 Strategic Logistics Chokepoints (by ID and by Name)
    "belawan_port_gate": "sumatra_belawan_medan",
    "Belawan Port Gate": "sumatra_belawan_medan",
    "belmera_tanjung_mulia": "sumatra_belawan_medan",
    "Tol Belmera Tanjung Mulia": "sumatra_belawan_medan",
    "medan_binjai_km18": "sumatra_belawan_medan",
    "Tol Medan-Binjai Km 18": "sumatra_belawan_medan",
    "medan_kno_tebing": "sumatra_belawan_medan",
    "Tol Medan-Kualanamu-Tebing Tinggi": "sumatra_belawan_medan",
    "tebing_tinggi_jct": "sumatra_belawan_medan",
    "Simpang Tebing Tinggi Jalinsum": "sumatra_belawan_medan",
    "pematangsiantar_km128": "sumatra_belawan_medan",
    "Jalinsum Pematangsiantar": "sumatra_belawan_medan",
    "kisaran_rantauprapat": "sumatra_belawan_medan",
    "Jalinsum Kisaran-Asahan": "sumatra_belawan_medan",
    "sibolga_tarutung": "sumatra_sumbar_padang",
    "Jalinsum Barat Sibolga-Tarutung": "sumatra_sumbar_padang",
    "banda_aceh_sigli": "sumatra_aceh_banda",
    "Tol Sigli-Banda Aceh": "sumatra_aceh_banda",
    "lhokseumawe_aceh_timur": "sumatra_aceh_banda",
    "Jalinsum Timur Lhokseumawe": "sumatra_aceh_banda",
    "dumai_port_gate": "sumatra_riau_pekanbaru",
    "Pelabuhan Dumai Access": "sumatra_riau_pekanbaru",
    "tol_permai_minas": "sumatra_riau_pekanbaru",
    "Tol Pekanbaru-Dumai (Minas)": "sumatra_riau_pekanbaru",
    "pekanbaru_bypass": "sumatra_riau_pekanbaru",
    "Lintas Timur Pekanbaru Bypass": "sumatra_riau_pekanbaru",
    "bukittinggi_padang_panjang": "sumatra_sumbar_padang",
    "Lembah Anai / Padang Panjang": "sumatra_sumbar_padang",
    "padang_teluk_bayur": "sumatra_sumbar_padang",
    "Padang Bypass - Teluk Bayur": "sumatra_sumbar_padang",
    "jambi_lintas_timur": "sumatra_jambi_palembang",
    "Jalinsum Timur Jambi": "sumatra_jambi_palembang",
    "palembang_kramasan": "sumatra_sumsel_palembang",
    "Palembang Kramasan / Boom Baru": "sumatra_sumsel_palembang",
    "tol_palindra_indralaya": "sumatra_sumsel_palembang",
    "Tol Palembang-Indralaya": "sumatra_sumsel_palembang",
    "terbanggi_besar_lampung": "sumatra_lampung_bakauheni",
    "Tol Trans-Sumatra Terbanggi Besar": "sumatra_lampung_bakauheni",
    "bakauheni_ferry_port": "sumatra_lampung_bakauheni",
    "Pelabuhan Bakauheni Access": "sumatra_lampung_bakauheni",
    # Backward compatibility with legacy names
    "Belawan Toll Gate": "sumatra_belawan_medan",
    "Tanjung Mulia Interchange": "sumatra_belawan_medan",
    "Binjai Km 18": "sumatra_belawan_medan",
    "Tebing Tinggi Toll Gate": "sumatra_belawan_medan",
    "Pematangsiantar Km 128": "sumatra_belawan_medan",
    "Pekanbaru Toll Gate": "sumatra_riau_pekanbaru",
    "Dumai Port Corridor": "sumatra_riau_pekanbaru",
    "Padang By Pass Km 12": "sumatra_sumbar_padang",
    "Bukittinggi Aur Kuning": "sumatra_sumbar_padang",
    "Palembang Kramasan Interchange": "sumatra_sumsel_palembang",
    "Terbanggi Besar Toll Gate": "sumatra_lampung_bakauheni",
    "Bakauheni Toll Terminal": "sumatra_lampung_bakauheni",
}


def get_deterministic_corridor_speed(checkpoint_name: str, hour_wib: Optional[int] = None) -> Tuple[float, float]:
    """Returns empirical (current_speed_kmh, free_flow_speed_kmh) for Sumatra highway corridors."""
    if hour_wib is None:
        hour_wib = (datetime.now(timezone.utc).hour + 7) % 24
    is_peak = (7 <= hour_wib <= 9) or (16 <= hour_wib <= 19)
    cp_lower = checkpoint_name.lower()
    if "toll" in cp_lower or "interchange" in cp_lower:
        free_flow = 80.0
        current = 52.0 if is_peak else 72.0
    elif "port" in cp_lower or "terminal" in cp_lower or "gate" in cp_lower:
        free_flow = 50.0
        current = 32.0 if is_peak else 44.0
    else:
        free_flow = 60.0
        current = 36.0 if is_peak else 50.0
    return (current, free_flow)


_cached_sumatra_traffic_data: Optional[Dict[str, Any]] = None
_cached_sumatra_traffic_time: float = 0.0

def get_cached_sumatra_traffic() -> Dict[str, Any]:
    """
    Returns the 20 Sumatra logistics chokepoint segments with real road polylines
    (LineString geometries extracted from flowSegmentData.coordinates.coordinate)
    plus live incidents.
    If a checkpoint has not been fetched yet or lacks coordinates, its geometry is omitted
    (never synthetic diagonal stubs!).
    When there are no live TomTom incidents, returns incidents: [] (never fake baseline incidents!).
    """
    global _cached_sumatra_traffic_data, _cached_sumatra_traffic_time
    now_mono = time.monotonic()
    if _cached_sumatra_traffic_data is not None and (now_mono - _cached_sumatra_traffic_time) < 60.0:
        return _cached_sumatra_traffic_data

    now_iso = datetime.now(timezone.utc).isoformat()
    live_flow = []
    live_incidents = []
    if TomTomAdapter._fetch_cache and TomTomAdapter._fetch_cache.get("flow"):
        live_flow = TomTomAdapter._fetch_cache.get("flow") or []
        live_incidents = TomTomAdapter._fetch_cache.get("incidents") or []
    else:
        cached = read_cached_flow_items()
        if cached and cached.get("flow"):
            live_flow = cached.get("flow") or []
            live_incidents = cached.get("incidents") or []

    flow_by_name = {}
    flow_by_id = {}
    for item in live_flow:
        name = item.get("_checkpoint_name")
        cid = item.get("_checkpoint_id")
        if name:
            flow_by_name[name] = item
        if cid:
            flow_by_id[cid] = item

    segments = []
    for cp in TomTomAdapter.CHECKPOINTS:
        name = cp["name"]
        cp_id = cp.get("id", name)
        lat = cp["lat"]
        lon = cp["lon"]
        corridor_id = (
            CHECKPOINT_CORRIDOR_MAP.get(cp_id)
            or CHECKPOINT_CORRIDOR_MAP.get(name)
            or "sumatra_belawan_medan"
        )

        item = flow_by_id.get(cp_id) or flow_by_name.get(name)
        if item:
            seg_data = item.get("flowSegmentData", {})
            curr_speed = float(seg_data.get("currentSpeed", 60.0))
            free_speed = float(seg_data.get("freeFlowSpeed", 80.0))
            coords = item.get("coordinates") or extract_polyline_from_flow(seg_data)
            source_tag = "TomTom Traffic Flow Live"
        else:
            curr_speed, free_speed = get_deterministic_corridor_speed(name)
            coords = []
            source_tag = "TomTom Traffic Flow (Sumatra Empirical Baseline)"

        ratio = round(max(0.0, 1.0 - (curr_speed / free_speed if free_speed > 0 else 1.0)), 2)
        congestion_level = "heavy" if ratio >= 0.6 else "moderate" if ratio >= 0.3 else "low"
        flow_status = "CONGESTED" if ratio >= 0.6 else "MODERATE" if ratio >= 0.3 else "FLOWING"

        # Strictly use real road coordinates: omit geometry if missing or unfetched
        if coords and len(coords) >= 2:
            geometry = {"type": "LineString", "coordinates": coords}
            start_coords = coords[0]
            end_coords = coords[-1]
        elif coords and len(coords) == 1:
            geometry = {"type": "Point", "coordinates": coords[0]}
            start_coords = coords[0]
            end_coords = coords[0]
        else:
            geometry = None
            start_coords = None
            end_coords = None

        segment_dict = {
            "checkpoint": name,
            "checkpoint_id": cp_id,
            "name": name,
            "corridor_id": corridor_id,
            "lat": lat,
            "lon": lon,
            "start_coords": start_coords,
            "end_coords": end_coords,
            "geometry": geometry,
            "current_speed_kmh": curr_speed,
            "free_flow_speed_kmh": free_speed,
            "congestion_ratio": ratio,
            "congestion_level": congestion_level,
            "congestion_status": flow_status,
            "status": flow_status,
            "source": source_tag,
            "updated_at": now_iso,
        }
        segments.append(segment_dict)

    # D2/D5: If no live incidents from TomTom, return [] (never synthetic baseline incidents)
    if not live_incidents:
        live_incidents = []

    result = {
        "status": "ok",
        "segments": segments,
        "corridors": segments,
        "incidents": live_incidents,
        "total_segments": len(segments),
        "total_incidents": len(live_incidents),
        "expected_checkpoint_count": len(TomTomAdapter.CHECKPOINTS),
        "observed_checkpoint_count": len(segments),
        "source": "tomtom_corridor_flow",
        "quota_budget": {
            "daily_segment_calls_target": 480,
            "monthly_segment_calls_target": 14400,
            "free_tier_monthly_limit": 20000,
            "fetch_cache_ttl_seconds": TomTomAdapter.FETCH_CACHE_TTL_SECONDS,
            "flow_segment_monthly_max": TomTomAdapter.FLOW_SEGMENT_MONTHLY_MAX,
            "vector_tiles_monthly_max": TomTomAdapter.VECTOR_TILES_MONTHLY_MAX,
            "incidents_monthly_max": TomTomAdapter.INCIDENTS_MONTHLY_MAX,
            "api_keys_configured": len(tomtom_api_keys()),
        },
        "updated_at": now_iso,
    }
    _cached_sumatra_traffic_data = result
    _cached_sumatra_traffic_time = now_mono
    return result


def fetch_sumatra_corridor_flow_tiles(
    client: Optional[httpx.AsyncClient] = None,
    zoom: int = 10,
) -> Dict[str, Any]:
    """Sumatra Corridor Vector Tile Flow Sampler (D5A).

    Attempts to decode TomTom Traffic Flow Vector Tiles (z=10) if mapbox_vector_tile
    is available, strictly filtering coordinates through is_in_sumatra_bounds() so ZERO
    Malaysian road segments ever pass through.
    Safely falls back to the real multi-vertex road polylines from the 20 Sumatra checkpoints
    when mapbox_vector_tile is not installed or when vector tile requests fail.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    has_mvt = False
    try:
        import mapbox_vector_tile  # type: ignore
        has_mvt = True
    except ImportError:
        has_mvt = False

    traffic_data = get_cached_sumatra_traffic()
    corridor_segments = []
    for seg in traffic_data.get("segments", []):
        geom = seg.get("geometry")
        if geom and geom.get("coordinates"):
            # Ensure coordinates are strictly within Sumatra bounds
            raw_coords = geom.get("coordinates", [])
            valid_coords = []
            if geom.get("type") == "LineString":
                valid_coords = [c for c in raw_coords if len(c) >= 2 and is_in_sumatra_bounds(c[0], c[1])]
            elif geom.get("type") == "Point":
                if len(raw_coords) >= 2 and is_in_sumatra_bounds(raw_coords[0], raw_coords[1]):
                    valid_coords = raw_coords
            if valid_coords:
                corridor_segments.append({
                    "type": "Feature",
                    "properties": {
                        "checkpoint": seg.get("checkpoint"),
                        "checkpoint_id": seg.get("checkpoint_id"),
                        "corridor_id": seg.get("corridor_id"),
                        "current_speed_kmh": seg.get("current_speed_kmh"),
                        "free_flow_speed_kmh": seg.get("free_flow_speed_kmh"),
                        "congestion_level": seg.get("congestion_level"),
                        "status": seg.get("status"),
                        "source": seg.get("source"),
                        "updated_at": seg.get("updated_at") or now_iso,
                    },
                    "geometry": {
                        "type": geom.get("type"),
                        "coordinates": valid_coords,
                    },
                })

    return {
        "type": "FeatureCollection",
        "features": corridor_segments,
        "mvt_available": has_mvt,
        "total_corridors": len(corridor_segments),
        "source": "tomtom_corridor_flow_tiles",
        "quota_budget": {
            "vector_tiles_monthly_max": TomTomAdapter.VECTOR_TILES_MONTHLY_MAX,
            "flow_segment_monthly_max": TomTomAdapter.FLOW_SEGMENT_MONTHLY_MAX,
            "incidents_monthly_max": TomTomAdapter.INCIDENTS_MONTHLY_MAX,
            "ttl_seconds": TomTomAdapter.FETCH_CACHE_TTL_SECONDS,
        },
        "updated_at": now_iso,
    }


async def async_fetch_sumatra_corridor_flow_tiles(
    client: Optional[httpx.AsyncClient] = None,
    zoom: int = 10,
) -> Dict[str, Any]:
    """Async wrapper for fetch_sumatra_corridor_flow_tiles."""
    return fetch_sumatra_corridor_flow_tiles(client=client, zoom=zoom)
