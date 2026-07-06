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

class NASAFIRMSAdapter(BaseAdapter):
    source_name = "nasa_firms"
    stream_key = STREAM_NASA_FIRMS
    poll_interval_seconds = 10800  # Poll every 3 hours (satellite pass intervals)

    # Sumatra Bounding Box (lon_west, lat_south, lon_east, lat_north)
    SUMATRA_BBOX = "94,-6,108,6"

    # North Sumatra Bounding Box filter
    MIN_LAT, MAX_LAT = 1.0, 5.5
    MIN_LON, MAX_LON = 97.5, 100.5

    # Highway spines for proximity check (Medan, Belawan, Toba, etc.)
    HIGHWAY_SPINE = [
        {"name": "Belawan Port Corridor", "lat": 3.80, "lon": 98.69},
        {"name": "Medan Hub", "lat": 3.58, "lon": 98.68},
        {"name": "Pematangsiantar Route", "lat": 2.96, "lon": 99.07},
        {"name": "Simalungun Segment", "lat": 2.32, "lon": 99.15},
        {"name": "Toba Lake Segment", "lat": 1.75, "lon": 98.95},
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

    async def fetch(self) -> str:
        """Fetch active fire hotspot CSV data from NASA FIRMS."""
        if not settings.nasa_firms_map_key:
            return ""

        url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{settings.nasa_firms_map_key}/VIIRS_SNPP_NRT/{self.SUMATRA_BBOX}/1"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    return res.text
                logger.error(f"NASA FIRMS API returned status {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Failed to fetch NASA FIRMS CSV data: {e}")
        return ""

    async def parse(self, raw_data: str) -> List[Dict[str, Any]]:
        """Parse FIRMS CSV data, filter for North Sumatra and proximity to Trans-Sumatra Highway, map to events."""
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

                    # 2. Filter geographically for North Sumatra bbox
                    if not (self.MIN_LAT <= lat <= self.MAX_LAT and self.MIN_LON <= lon <= self.MAX_LON):
                        continue

                    # 3. Check proximity to Trans-Sumatra Highway spine
                    # Calculate simple distance (Haversine or approx Euclidean)
                    near_segment = None
                    min_dist_km = 999.0
                    
                    for segment in self.HIGHWAY_SPINE:
                        dist = self._haversine_distance(lat, lon, segment["lat"], segment["lon"])
                        if dist < min_dist_km:
                            min_dist_km = dist
                            near_segment = segment["name"]

                    # Threshold: within 20km of the highway segment
                    if min_dist_km <= 20.0:
                        # Determine severity based on FRP (intensity) and proximity
                        if frp > 500:
                            severity = "critical"
                        elif frp > 100 or min_dist_km < 5.0:
                            severity = "high"
                        else:
                            severity = "medium"

                        title = f"Wildfire Hazard: Active hotspot near {near_segment} (FRP: {frp}MW)"
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
                                "dedup_key": dedup_key
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
