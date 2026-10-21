import logging
import math
import httpx
from datetime import datetime, timezone
from typing import Any, List, Dict

from app.adapters.base import BaseAdapter
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Full-Sumatra bbox coverage grid (95-106E / -6..6N, coarse step ~1.5-2 deg).
# Each lattice center is snapped to the nearest PAN_SUMATRA_GAZETTEER corridor
# node (land mask via gazetteer proximity: 0 km by construction, well within
# the ~50-60 km keep rule) so sea cells are skipped and every point carries a
# corridor-meaningful name. 23 land points spanning Banda Aceh (5.55N) to
# Bakauheni (-5.87N) — whole-island overlay, not hub-only.
SUMATRA_GRID: List[Dict[str, Any]] = [
    {"name": "Banda Aceh", "lat": 5.55, "lon": 95.32},
    {"name": "Lhokseumawe", "lat": 5.18, "lon": 97.15},
    {"name": "Takengon", "lat": 4.62, "lon": 96.82},
    {"name": "Kutacane", "lat": 3.48, "lon": 97.82},
    {"name": "Medan", "lat": 3.59, "lon": 98.67},
    {"name": "Sibolga", "lat": 1.74, "lon": 98.78},
    {"name": "Padangsidimpuan", "lat": 1.38, "lon": 99.27},
    {"name": "Dumai", "lat": 1.68, "lon": 101.45},
    {"name": "Pasir Pengaraian", "lat": 0.90, "lon": 100.53},
    {"name": "Pekanbaru", "lat": 0.51, "lon": 101.45},
    {"name": "Payakumbuh", "lat": -0.22, "lon": 100.63},
    {"name": "Padang", "lat": -0.95, "lon": 100.42},
    {"name": "Rengat", "lat": -0.55, "lon": 102.32},
    {"name": "Batam", "lat": 1.13, "lon": 104.05},
    {"name": "Tembilahan", "lat": -0.33, "lon": 103.15},
    {"name": "Jambi", "lat": -1.61, "lon": 103.61},
    {"name": "Kerinci", "lat": -2.08, "lon": 101.48},
    {"name": "Bengkulu", "lat": -3.80, "lon": 102.26},
    {"name": "Curup", "lat": -3.47, "lon": 102.53},
    {"name": "Palembang", "lat": -2.98, "lon": 104.77},
    {"name": "Baturaja", "lat": -4.10, "lon": 104.17},
    {"name": "Bandar Lampung", "lat": -5.43, "lon": 105.26},
    {"name": "Bakauheni", "lat": -5.87, "lon": 105.75},
]

GRID_KEEP_RADIUS_KM = 60.0  # land mask: keep lattice pts within ~50-60 km of a gazetteer node


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _grid_points() -> List[Dict[str, Any]]:
    """Return land grid points (gazetteer-proximity mask, <= GRID_KEEP_RADIUS_KM).

    Grid entries are pre-snapped to gazetteer nodes (0 km), so this is a
    defense-in-depth re-check: if the gazetteer import is available, verify
    proximity; otherwise trust the curated list.
    """
    try:
        from app.nlp.gazetteer_data import PAN_SUMATRA_GAZETTEER
        gaz_coords = [v["coords"] for v in PAN_SUMATRA_GAZETTEER.values()]
        kept = []
        for p in SUMATRA_GRID:
            dmin = min(_haversine_km(p["lat"], p["lon"], glat, glon) for glat, glon in gaz_coords)
            if dmin <= GRID_KEEP_RADIUS_KM:
                kept.append(p)
            else:
                logger.debug(f"Open-Meteo grid: dropping sea point {p['name']} (nearest node {dmin:.0f} km)")
        return kept or SUMATRA_GRID
    except Exception:
        return SUMATRA_GRID


class OpenMeteoAdapter(BaseAdapter):
    source_name = "open_meteo"
    stream_key = "lrip:events:open_meteo"
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
        """Fetch per-point NWP predictions for the full-Sumatra grid in ONE bulk HTTP call."""
        points = _grid_points()
        if settings.demo_offline:
            logger.info("Open-Meteo Adapter: Running in offline mode.")
            return self._generate_sim_grid(points)

        # Open-Meteo bulk API: comma-separated latitudes/longitudes in a single request.
        params = {
            "latitude": ",".join(str(p["lat"]) for p in points),
            "longitude": ",".join(str(p["lon"]) for p in points),
            "hourly": "precipitation,windspeed_10m,weathercode,temperature_2m",
            "forecast_days": 2,
            "timezone": "Asia/Jakarta",
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                response = await client.get(OPEN_METEO_URL, params=params)
                if response.status_code == 200:
                    logger.info("Open-Meteo Adapter: Successfully fetched live bulk grid (%d pts).", len(points))
                    return self._parse_bulk_open_meteo(response.json(), points)
                else:
                    logger.warning(f"Open-Meteo returned status {response.status_code}. Using simulation fallback.")
                    return self._generate_sim_grid(points)
        except Exception as e:
            logger.error(f"Error calling weather API: {e}. Falling back to simulation.")
            return self._generate_sim_grid(points)

    def _point_predictions(self, hourly: dict) -> Dict[str, float]:
        precip = hourly.get("precipitation", [0.0]) or [0.0]
        wind = hourly.get("windspeed_10m", [0.0]) or [0.0]
        temp = hourly.get("temperature_2m", [27.5]) or [27.5]
        precip_24h = float(sum(precip[:24]))
        max_wind = float(max(wind[:24]))
        avg_temp = float(sum(temp[:24]) / len(temp[:24]))
        flood_risk = min(100.0, max(10.0, precip_24h * 1.5))
        return {
            "precipitation_mm_24h": round(precip_24h, 1),
            "wind_speed_kmh": round(max_wind, 1),
            "flood_risk_pct": round(flood_risk, 1),
            "temperature_c": round(avg_temp, 1),
        }

    def _parse_bulk_open_meteo(self, data: Any, points: List[Dict[str, Any]]) -> dict:
        """Parse bulk (list) or single (dict) Open-Meteo responses into per-point predictions."""
        # Multi-location responses come back as a JSON list aligned with request order.
        payloads: List[dict]
        if isinstance(data, list):
            payloads = data
        elif isinstance(data, dict):
            payloads = [data]
        else:
            return self._generate_sim_grid(points)

        out_points = []
        for i, p in enumerate(points):
            hourly = {}
            if i < len(payloads) and isinstance(payloads[i], dict):
                hourly = payloads[i].get("hourly", {}) or {}
            preds = self._point_predictions(hourly)
            out_points.append({
                "name": p["name"],
                "latitude": p["lat"],
                "longitude": p["lon"],
                "predictions": preds,
            })
        result = {
            "model": "open-meteo",
            "source": "open-meteo",
            "points": out_points,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        # Backward compat: legacy single-point consumers read top-level predictions.
        if out_points:
            medan = next((q for q in out_points if q["name"] == "Medan"), out_points[0])
            result["predictions"] = medan["predictions"]
            result["latitude"] = medan["latitude"]
            result["longitude"] = medan["longitude"]
            result["region"] = "Sumatra Logistics Corridor"
        return result

    def _parse_open_meteo(self, data: dict) -> dict:
        # Legacy single-point parse kept for unit-test/back-compat paths.
        preds = self._point_predictions(data.get("hourly", {}))
        return {
            "model": "open-meteo",
            "source": "open-meteo",
            "predictions": preds,
            "latitude": 3.59,
            "longitude": 98.67,
            "region": "Sumatra Logistics Corridor",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        """Parse per-point predictions into normalized events (low severity suppressed)."""
        events = []
        if not raw_data:
            return events

        points = raw_data.get("points")
        if not points:
            # Legacy single-point payload fallback.
            predictions = raw_data.get("predictions", {})
            points = [{
                "name": raw_data.get("region", "Sumatra Logistics Corridor"),
                "latitude": raw_data.get("latitude", 3.59),
                "longitude": raw_data.get("longitude", 98.67),
                "predictions": predictions,
            }]

        for pt in points:
            predictions = pt.get("predictions", {})
            precip_24h = predictions.get("precipitation_mm_24h", 0.0)
            flood_risk = predictions.get("flood_risk_pct", 0.0)

            severity = "low"
            if flood_risk >= 80.0 or precip_24h > 50.0:
                severity = "high"
            elif flood_risk >= 50.0 or precip_24h > 20.0:
                severity = "medium"

            if severity in ["medium", "high"]:
                name = pt.get("name", "Sumatra")
                events.append({
                    "crisis_id": f"open_meteo_{name.lower().replace(' ', '_')}_{int(datetime.now(timezone.utc).timestamp())}",
                    "source": raw_data.get("source", "open_meteo"),
                    "event_type": "weather_prediction",
                    "title": f"PreHub Atmospheric Risk {name} ({raw_data.get('model', 'open-meteo')})",
                    "severity": severity,
                    "region": name,
                    "lat": float(pt.get("latitude", 3.59)),
                    "lon": float(pt.get("longitude", 98.67)),
                    "raw_payload": {
                        "model": raw_data.get("model"),
                        "source": raw_data.get("source"),
                        "predictions": predictions,
                        "latitude": pt.get("latitude"),
                        "longitude": pt.get("longitude"),
                        "region": name,
                    },
                    "created_at": datetime.now(timezone.utc).isoformat()
                })

        return events

    def _generate_sim_grid(self, points: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Per-point synthetic monsoon fallback (deterministic high/medium mix).

        Two-thirds of points exceed the disruption gate (high) so the default
        overlay still renders whole-island coverage offline; the remainder are
        medium advisories visible via the opt-in path.
        """
        out_points = []
        for i, p in enumerate(points):
            step = i % 3
            precip = 65.5 - step * 12.0
            flood = 87.5 - step * 10.0
            out_points.append({
                "name": p["name"],
                "latitude": p["lat"],
                "longitude": p["lon"],
                "predictions": {
                    "precipitation_mm_24h": round(precip, 1),
                    "wind_speed_kmh": 42.0 - step * 5.0,
                    "flood_risk_pct": round(flood, 1),
                    "temperature_c": 27.5,
                },
            })
        result = {
            "model": "open-meteo-sim",
            "source": "open-meteo-sim",
            "points": out_points,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if out_points:
            result["predictions"] = out_points[0]["predictions"]
            result["latitude"] = out_points[0]["latitude"]
            result["longitude"] = out_points[0]["longitude"]
            result["region"] = "Sumatra Logistics Corridor"
        return result

    def _generate_sim_forecast(self) -> Dict[str, Any]:
        """Legacy single-point sim kept for back-compat; delegates to the grid."""
        grid = self._generate_sim_grid(_grid_points())
        medan = next((q for q in grid["points"] if q["name"] == "Medan"), grid["points"][0])
        return {
            "model": "open-meteo-sim",
            "source": "open-meteo-sim",
            "predictions": medan["predictions"],
            "latitude": medan["latitude"],
            "longitude": medan["longitude"],
            "region": "Sumatra Logistics Corridor",
            "timestamp": grid["timestamp"],
        }
