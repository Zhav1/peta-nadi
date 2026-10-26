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
    return os.getenv("TOMTOM_INCIDENTS_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")


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


def read_cached_flow_items(redis_client=None, max_age_seconds: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Read fresh lrip:tomtom:segment:* payloads written by the main poller.

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
                flow_items.append({
                    "flowSegmentData": {
                        "currentSpeed": float(payload.get("currentSpeed", 0)),
                        "freeFlowSpeed": float(payload.get("freeFlowSpeed", 60)),
                        "currentTravelTime": payload.get("currentTravelTime", 0),
                    },
                    "_checkpoint_name": name,
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

    # Strategic Checkpoints across Trans-Sumatra Highway Corridors
    CHECKPOINTS = [
        # North Sumatra (Sumut)
        {"name": "Belawan Toll Gate", "lat": 3.8012, "lon": 98.6890},
        {"name": "Tanjung Mulia Interchange", "lat": 3.7558, "lon": 98.6742},
        {"name": "Binjai Km 18", "lat": 3.6789, "lon": 98.5123},
        {"name": "Tebing Tinggi Toll Gate", "lat": 3.3251, "lon": 99.1621},
        {"name": "Pematangsiantar Km 128", "lat": 2.9595, "lon": 99.0687},
        # Riau
        {"name": "Pekanbaru Toll Gate", "lat": 0.5071, "lon": 101.4478},
        {"name": "Dumai Port Corridor", "lat": 1.6811, "lon": 101.4533},
        # West Sumatra (Sumbar)
        {"name": "Padang By Pass Km 12", "lat": -0.9492, "lon": 100.3543},
        {"name": "Bukittinggi Aur Kuning", "lat": -0.3056, "lon": 100.3692},
        # South Sumatra & Lampung
        {"name": "Palembang Kramasan Interchange", "lat": -2.9909, "lon": 104.7565},
        {"name": "Terbanggi Besar Toll Gate", "lat": -4.8500, "lon": 105.1800},
        {"name": "Bakauheni Toll Terminal", "lat": -5.8711, "lon": 105.7533},
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
    async def _get_with_key_fallback(cls, client, url: str, params: Dict[str, Any], endpoint: str):
        """GET trying keys in order. Returns (response, key_index, all_exhausted).

        On a credit-classified 403 the used key is marked exhausted and the
        next key is tried once. Non-credit statuses return immediately.
        """
        keys = tomtom_api_keys()
        last_res = None
        for i, key in enumerate(keys):
            if i in cls._exhausted_key_indexes:
                continue
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
                    client, self.FLOW_URL, params, endpoint=f"health:{checkpoint['name']}"
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

    async def fetch(self) -> Dict[str, Any]:
        """
        Fetch segment flow data for all checkpoints plus traffic incidents across
        corridor-anchored tiles (each <= 10,000 km2), deduplicated by incident ID.

        Flow is fetched every cycle. Incident tiles are fetched only when
        TOMTOM_INCIDENTS_ENABLED=true and cycle % TOMTOM_INCIDENTS_EVERY_N == 0;
        otherwise tiles_total is set but tiles_queried stays 0 with an
        incidents_skipped_cadence note in degraded_reason.
        """
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
                        client, self.FLOW_URL, params, endpoint=f"flow:{cp['name']}"
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
                        flow_json["_checkpoint_name"] = cp["name"]
                        flow_json["_lat"] = cp["lat"]
                        flow_json["_lon"] = cp["lon"]
                        data["flow"].append(flow_json)
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
                            client, self.INCIDENT_URL, params, endpoint=f"incidents:{tile['bbox']}"
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
            data["degraded_reason"] = "; ".join(degraded_reasons) or None

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
