import httpx
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone
import json

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_BMKG, get_redis

logger = logging.getLogger(__name__)

class BMKGAdapter(BaseAdapter):
    source_name = "bmkg"
    stream_key = STREAM_BMKG
    poll_interval_seconds = 60  # Poll earthquake endpoint every minute

    # Bounding box for North Sumatra/Sumatra (approximate)
    MIN_LAT, MAX_LAT = -6.0, 6.0
    MIN_LON, MAX_LON = 95.0, 109.0

    def __init__(self):
        super().__init__()
        self.earthquake_url = "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json"
        # Medan weather forecast URL (adm4 for Medan Kota)
        self.weather_url = "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=12.71.01.1001"
        self._last_weather_poll = 0
        self.weather_poll_interval = 1800 # 30 mins

    async def health_check(self) -> bool:
        """Verify BMKG is reachable by hitting the earthquake endpoint."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.head(self.earthquake_url)
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"BMKG health check failed: {e}")
            return False

    async def fetch(self) -> Dict[str, Any]:
        """Fetch earthquake data, and optionally weather data if interval has passed."""
        data = {"earthquake": None, "weather": None}
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.get(self.earthquake_url)
                if res.status_code == 200:
                    data["earthquake"] = res.json()
            except Exception as e:
                logger.error(f"Failed to fetch BMKG earthquake data: {e}")

            # Fetch weather every 30 minutes
            now = datetime.now(timezone.utc).timestamp()
            if now - self._last_weather_poll >= self.weather_poll_interval:
                try:
                    res = await client.get(self.weather_url)
                    if res.status_code == 200:
                        data["weather"] = res.json()
                        self._last_weather_poll = now
                except Exception as e:
                    logger.error(f"Failed to fetch BMKG weather forecast data: {e}")
                    
        return data

    async def parse(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse raw BMKG data into normalized events."""
        events = []
        
        # 1. Parse Earthquake
        eq_raw = raw_data.get("earthquake")
        if eq_raw and "Infogempa" in eq_raw and "gempa" in eq_raw["Infogempa"]:
            eq = eq_raw["Infogempa"]["gempa"]
            try:
                magnitude = float(eq.get("Magnitude", 0))
                wilayah = eq.get("Wilayah", "")
                coords_str = eq.get("Coordinates", "")
                
                # Check magnitude threshold and geographical constraint
                is_sumatra = "Sumatera" in wilayah or "Sumatra" in wilayah
                coords_match = False
                lat, lon = 0.0, 0.0
                
                if coords_str:
                    lat_str, lon_str = coords_str.split(",")
                    lat, lon = float(lat_str), float(lon_str)
                    coords_match = (self.MIN_LAT <= lat <= self.MAX_LAT) and (self.MIN_LON <= lon <= self.MAX_LON)
                
                if magnitude >= 5.0 and (is_sumatra or coords_match):
                    # Check deduplication
                    tanggal = eq.get("Tanggal", "")
                    jam = eq.get("Jam", "")
                    dedup_key = f"bmkg:eq:{tanggal}:{jam}:{magnitude}"
                    
                    r = get_redis()
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        # Mark as seen in Redis
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=86400) # 24h TTL
                        
                        # Determine severity
                        if magnitude < 6.0:
                            severity = "medium"
                        elif magnitude < 7.0:
                            severity = "high"
                        else:
                            severity = "critical"
                            
                        events.append({
                            "source": self.source_name,
                            "event_type": "earthquake",
                            "severity": severity,
                            "lat": str(lat),
                            "lon": str(lon),
                            "title": f"M{magnitude} Earthquake - {wilayah}",
                            "raw": json.dumps(eq),
                            "ts": datetime.now(timezone.utc).isoformat(),
                            "dedup_key": dedup_key
                        })
            except Exception as e:
                logger.error(f"Error parsing BMKG earthquake: {e}")

        # 2. Parse Weather
        weather_raw = raw_data.get("weather")
        if weather_raw and "data" in weather_raw:
            try:
                # The BMKG public forecast JSON has structure:
                # data: [{ cuaca: [[{ datetime, desc, code, ... }], ...] }] or similar.
                # Let's extract heavy rain warnings.
                # Since the response has a list of forecasts, search for 'hujan lebat' (heavy rain) or 'badai' (storm)
                warnings_found = []
                data_list = weather_raw.get("data", [])
                
                for location_data in data_list:
                    cuaca_forecasts = location_data.get("cuaca", [])
                    for time_slice in cuaca_forecasts:
                        for forecast in time_slice:
                            desc = forecast.get("desc", "").lower()
                            # 60 = heavy rain, 95 = thunderstorm, 97 = severe thunderstorm
                            code = int(forecast.get("code", 0))
                            
                            if "lebat" in desc or "petir" in desc or code in [60, 95, 97]:
                                warnings_found.append({
                                    "desc": forecast.get("desc"),
                                    "time": forecast.get("local_datetime"),
                                    "code": code
                                })
                                
                if warnings_found:
                    # Select the most immediate warning
                    warning = warnings_found[0]
                    dedup_key = f"bmkg:weather:medan:{warning['time']}:{warning['code']}"
                    
                    r = get_redis()
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=86400)
                        
                        events.append({
                            "source": self.source_name,
                            "event_type": "weather_warning",
                            "severity": "medium" if warning['code'] == 60 else "high",
                            "lat": "3.5852", # Medan coords
                            "lon": "98.6667",
                            "title": f"Weather Warning: {warning['desc']} expected in Medan",
                            "raw": json.dumps(warning),
                            "ts": datetime.now(timezone.utc).isoformat(),
                            "dedup_key": dedup_key
                        })
            except Exception as e:
                logger.error(f"Error parsing BMKG weather forecast: {e}")
                
        return events
