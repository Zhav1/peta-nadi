import asyncio
import httpx
import logging
import math
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import json

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_TOMTOM, get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class TomTomAdapter(BaseAdapter):
    source_name = "tomtom"
    stream_key = STREAM_TOMTOM
    poll_interval_seconds = 300  # Poll every 5 minutes

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
    CREDIT_EXHAUSTION_COOLDOWN_SECONDS = 900
    _credit_exhausted_until: float = 0.0
    _credit_exhausted_reason: str = ""

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
        if first_latch:
            logger.warning(
                f"TomTom credit exhausted ({reason}); pausing TomTom calls for "
                f"{cls.CREDIT_EXHAUSTION_COOLDOWN_SECONDS}s"
            )

    @classmethod
    def reset_credit_latch(cls):
        """Clear the latch (used for tests and manual recovery)."""
        cls._credit_exhausted_until = 0.0
        cls._credit_exhausted_reason = ""

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
        if not settings.tomtom_api_key:
            logger.warning("TomTom API key not configured")
            return False

        if self.is_credit_exhausted():
            logger.warning(f"TomTom credit exhausted ({self.credit_exhausted_reason()}); health degraded")
            return False

        try:
            checkpoint = self.CHECKPOINTS[0]
            params = {
                "key": settings.tomtom_api_key,
                "point": f"{checkpoint['lat']},{checkpoint['lon']}"
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(self.FLOW_URL, params=params)
                if res.status_code == 403:
                    self._mark_credit_exhausted(f"HTTP 403 on health check for {checkpoint['name']}")
                    return False
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"TomTom health check failed: {e}")
            return False

    async def fetch(self) -> Dict[str, Any]:
        """
        Fetch segment flow data for all checkpoints plus traffic incidents across
        corridor-anchored tiles (each <= 10,000 km2), deduplicated by incident ID.
        """
        data: Dict[str, Any] = {
            "flow": [],
            "incidents": [],
            "status": "ok",
            "degraded_reason": None,
            "credit_exhausted": self.is_credit_exhausted(),
            "tiles_total": 0,
            "tiles_queried": 0,
            "tiles_failed": 0,
        }

        if not settings.tomtom_api_key:
            data["status"] = "degraded"
            data["degraded_reason"] = "tomtom_api_key_missing"
            return data

        if self.is_credit_exhausted():
            data["status"] = "degraded"
            data["degraded_reason"] = f"credit_exhausted: {self.credit_exhausted_reason()}"
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
                        "key": settings.tomtom_api_key,
                        "point": f"{cp['lat']},{cp['lon']}"
                    }
                    res = await client.get(self.FLOW_URL, params=params)
                    if res.status_code == 403:
                        self._mark_credit_exhausted(f"HTTP 403 on flow segment {cp['name']}")
                        break
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
            tiles = self.build_corridor_tiles()
            data["tiles_total"] = len(tiles)
            deduped_incidents: Dict[str, Dict[str, Any]] = {}

            for index, tile in enumerate(tiles):
                if self.is_credit_exhausted():
                    break
                if index > 0:
                    await asyncio.sleep(self.TILE_REQUEST_SLEEP_SECONDS)
                try:
                    params = {
                        "key": settings.tomtom_api_key,
                        "bbox": tile["bbox"],
                        "fields": self.INCIDENT_FIELDS,
                    }
                    res = await client.get(self.INCIDENT_URL, params=params)
                    data["tiles_queried"] += 1
                    if res.status_code == 403:
                        self._mark_credit_exhausted(f"HTTP 403 on incident tile {tile['bbox']}")
                        break
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
            degraded_reasons: List[str] = []
            if self.is_credit_exhausted():
                degraded_reasons.append(f"credit_exhausted: {self.credit_exhausted_reason()}")
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

            data["credit_exhausted"] = self.is_credit_exhausted()
            data["degraded_reason"] = "; ".join(degraded_reasons) or None

        return data

    async def parse(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse raw flow and incident data into normalized events."""
        events = []
        r = get_redis()
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
                    
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=3600)  # 1 hour dedup
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
                    
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=14400)  # 4 hours dedup
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
