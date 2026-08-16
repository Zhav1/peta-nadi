import logging
import httpx
from datetime import datetime, timezone
from typing import Any, List, Dict

from app.adapters.base import BaseAdapter
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

class Earth2Adapter(BaseAdapter):
    source_name = "earth2"
    stream_key = "lrip:events:earth2"
    poll_interval_seconds = 21600  # 6 hours

    async def health_check(self) -> bool:
        """Checks if the weather forecast endpoint is accessible."""
        if settings.demo_offline:
            return True
            
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(
                    OPEN_METEO_URL,
                    params={"latitude": 3.59, "longitude": 98.67, "hourly": "precipitation", "forecast_days": 1}
                )
                return res.status_code == 200
        except Exception:
            return False

    async def fetch(self) -> Any:
        """Fetch real atmospheric weather prediction from Open-Meteo or use high-fidelity simulation."""
        if settings.demo_offline:
            logger.info("Earth2/Weather Adapter: Running in offline mode.")
            return self._generate_sim_forecast()

        params = {
            "latitude": 3.59,
            "longitude": 98.67,
            "hourly": "precipitation,windspeed_10m,weathercode,temperature_2m",
            "forecast_days": 2,
            "timezone": "Asia/Jakarta"
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(OPEN_METEO_URL, params=params)
                if response.status_code == 200:
                    logger.info("Earth2/Weather Adapter: Successfully fetched live weather data from Open-Meteo.")
                    return self._parse_open_meteo(response.json())
                else:
                    logger.warning(f"Open-Meteo returned status {response.status_code}. Using simulation fallback.")
                    return self._generate_sim_forecast()
        except Exception as e:
            logger.error(f"Error calling weather API: {e}. Falling back to simulation.")
            return self._generate_sim_forecast()

    def _parse_open_meteo(self, data: dict) -> dict:
        hourly = data.get("hourly", {})
        precip = hourly.get("precipitation", [0.0])
        wind = hourly.get("windspeed_10m", [0.0])
        temp = hourly.get("temperature_2m", [27.5])
        
        # Sum next 24h precipitation
        precip_24h = float(sum(precip[:24])) if precip else 0.0
        max_wind = float(max(wind[:24])) if wind else 0.0
        avg_temp = float(sum(temp[:24]) / len(temp[:24])) if temp else 27.5
        flood_risk = min(100.0, max(10.0, precip_24h * 1.5))

        return {
            "model": "open-meteo",
            "source": "open-meteo",
            "predictions": {
                "precipitation_mm_24h": round(precip_24h, 1),
                "wind_speed_kmh": round(max_wind, 1),
                "flood_risk_pct": round(flood_risk, 1),
                "temperature_c": round(avg_temp, 1)
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    async def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        """Parse weather predictions into normalized events."""
        events = []
        if not raw_data:
            return events

        predictions = raw_data.get("predictions", {})
        precip_24h = predictions.get("precipitation_mm_24h", 0.0)
        flood_risk = predictions.get("flood_risk_pct", 0.0)
        
        severity = "low"
        if flood_risk >= 80.0 or precip_24h > 50.0:
            severity = "high"
        elif flood_risk >= 50.0 or precip_24h > 20.0:
            severity = "medium"

        if severity in ["medium", "high"]:
            events.append({
                "crisis_id": f"earth2_{int(datetime.now(timezone.utc).timestamp())}",
                "source": raw_data.get("source", "earth2"),
                "event_type": "weather_prediction",
                "title": f"PreHub Atmospheric Risk ({raw_data.get('model', 'open-meteo')})",
                "severity": severity,
                "region": "North Sumatra",
                "lat": 3.59,
                "lon": 98.67,
                "raw_payload": raw_data,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
        return events

    def _generate_sim_forecast(self) -> Dict[str, Any]:
        """Generates a synthetic weather forecast representing Sumatra monsoon flood conditions."""
        return {
            "model": "open-meteo-sim",
            "source": "open-meteo-sim",
            "predictions": {
                "precipitation_mm_24h": 65.5,
                "wind_speed_kmh": 42.0,
                "flood_risk_pct": 87.5,
                "temperature_c": 27.5
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
