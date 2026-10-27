import logging
import httpx
from datetime import datetime, timezone
from typing import Any, List, Dict

from app.adapters.base import BaseAdapter
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Full-Sumatra coverage grid (Phase 169): every one of the 10 Sumatra
# provinces carries at least 4 sample points, spaced ~0.4-1.0 deg (~50-110 km,
# i.e. roughly 0.75 deg). Points are curated land/hub locations across the full
# 94,-6,108,6 bbox — no corridor bias and no sea-point dropping, so the whole
# island can produce a polygon. 58 points => one bulk HTTP request per poll.
SUMATRA_GRID: List[Dict[str, Any]] = [
    # --- Aceh (6) ---
    {"name": "Banda Aceh", "lat": 5.55, "lon": 95.32, "province": "Aceh"},
    {"name": "Lhokseumawe", "lat": 5.18, "lon": 97.15, "province": "Aceh"},
    {"name": "Takengon", "lat": 4.60, "lon": 96.85, "province": "Aceh"},
    {"name": "Langsa", "lat": 4.45, "lon": 97.95, "province": "Aceh"},
    {"name": "Kutacane", "lat": 3.45, "lon": 97.80, "province": "Aceh"},
    {"name": "Singkil", "lat": 2.28, "lon": 97.80, "province": "Aceh"},
    # --- Sumatera Utara (6) ---
    {"name": "Medan", "lat": 3.59, "lon": 98.67, "province": "Sumatera Utara"},
    {"name": "Tebing Tinggi", "lat": 3.33, "lon": 99.16, "province": "Sumatera Utara"},
    {"name": "Pematangsiantar", "lat": 2.96, "lon": 99.07, "province": "Sumatera Utara"},
    {"name": "Rantauprapat", "lat": 2.10, "lon": 99.83, "province": "Sumatera Utara"},
    {"name": "Sibolga", "lat": 1.74, "lon": 98.78, "province": "Sumatera Utara"},
    {"name": "Padangsidimpuan", "lat": 1.38, "lon": 99.27, "province": "Sumatera Utara"},
    # --- Sumatera Barat (6) ---
    {"name": "Lubuk Sikaping", "lat": 0.14, "lon": 100.16, "province": "Sumatera Barat"},
    {"name": "Bukittinggi", "lat": -0.30, "lon": 100.37, "province": "Sumatera Barat"},
    {"name": "Sitinjau Lauik", "lat": -0.48, "lon": 100.48, "province": "Sumatera Barat"},
    {"name": "Solok", "lat": -0.79, "lon": 100.66, "province": "Sumatera Barat"},
    {"name": "Padang", "lat": -0.95, "lon": 100.42, "province": "Sumatera Barat"},
    {"name": "Painan", "lat": -1.35, "lon": 100.58, "province": "Sumatera Barat"},
    # --- Riau (6) ---
    {"name": "Dumai", "lat": 1.68, "lon": 101.45, "province": "Riau"},
    {"name": "Pasir Pengaraian", "lat": 0.90, "lon": 100.53, "province": "Riau"},
    {"name": "Pekanbaru", "lat": 0.51, "lon": 101.45, "province": "Riau"},
    {"name": "Siak", "lat": 0.79, "lon": 102.05, "province": "Riau"},
    {"name": "Rengat", "lat": -0.55, "lon": 102.32, "province": "Riau"},
    {"name": "Tembilahan", "lat": -0.33, "lon": 103.15, "province": "Riau"},
    # --- Jambi (6) ---
    {"name": "Kuala Tungkal", "lat": -0.85, "lon": 103.45, "province": "Jambi"},
    {"name": "Muara Bungo", "lat": -1.47, "lon": 101.99, "province": "Jambi"},
    {"name": "Tebo", "lat": -1.49, "lon": 102.35, "province": "Jambi"},
    {"name": "Jambi", "lat": -1.61, "lon": 103.61, "province": "Jambi"},
    {"name": "Kerinci", "lat": -2.08, "lon": 101.48, "province": "Jambi"},
    {"name": "Sarolangun", "lat": -2.30, "lon": 102.70, "province": "Jambi"},
    # --- Bengkulu (6) ---
    {"name": "Mukomuko", "lat": -2.57, "lon": 101.30, "province": "Bengkulu"},
    {"name": "Arga Makmur", "lat": -3.42, "lon": 102.20, "province": "Bengkulu"},
    {"name": "Curup", "lat": -3.47, "lon": 102.53, "province": "Bengkulu"},
    {"name": "Bengkulu", "lat": -3.80, "lon": 102.26, "province": "Bengkulu"},
    {"name": "Manna", "lat": -4.47, "lon": 102.90, "province": "Bengkulu"},
    {"name": "Bintuhan", "lat": -4.55, "lon": 103.35, "province": "Bengkulu"},
    # --- Sumatera Selatan (6) ---
    {"name": "Sekayu", "lat": -2.87, "lon": 103.85, "province": "Sumatera Selatan"},
    {"name": "Palembang", "lat": -2.98, "lon": 104.77, "province": "Sumatera Selatan"},
    {"name": "Lubuklinggau", "lat": -3.30, "lon": 102.86, "province": "Sumatera Selatan"},
    {"name": "Kayuagung", "lat": -3.40, "lon": 104.80, "province": "Sumatera Selatan"},
    {"name": "Muara Enim", "lat": -3.65, "lon": 103.77, "province": "Sumatera Selatan"},
    {"name": "Baturaja", "lat": -4.10, "lon": 104.17, "province": "Sumatera Selatan"},
    # --- Lampung (6) ---
    {"name": "Liwa", "lat": -5.03, "lon": 104.08, "province": "Lampung"},
    {"name": "Kotabumi", "lat": -4.83, "lon": 104.90, "province": "Lampung"},
    {"name": "Terbanggi Besar", "lat": -4.85, "lon": 105.18, "province": "Lampung"},
    {"name": "Bandar Lampung", "lat": -5.43, "lon": 105.26, "province": "Lampung"},
    {"name": "Kalianda", "lat": -5.73, "lon": 105.60, "province": "Lampung"},
    {"name": "Bakauheni", "lat": -5.87, "lon": 105.75, "province": "Lampung"},
    # --- Kepulauan Bangka Belitung (5) ---
    {"name": "Belinyu", "lat": -1.65, "lon": 105.78, "province": "Kepulauan Bangka Belitung"},
    {"name": "Muntok", "lat": -2.07, "lon": 105.16, "province": "Kepulauan Bangka Belitung"},
    {"name": "Pangkalpinang", "lat": -2.13, "lon": 106.10, "province": "Kepulauan Bangka Belitung"},
    {"name": "Toboali", "lat": -2.99, "lon": 106.50, "province": "Kepulauan Bangka Belitung"},
    {"name": "Tanjungpandan", "lat": -2.75, "lon": 107.65, "province": "Kepulauan Bangka Belitung"},
    # --- Kepulauan Riau (5) ---
    {"name": "Karimun", "lat": 1.05, "lon": 103.39, "province": "Kepulauan Riau"},
    {"name": "Batam", "lat": 1.13, "lon": 104.05, "province": "Kepulauan Riau"},
    {"name": "Tanjungpinang", "lat": 0.92, "lon": 104.45, "province": "Kepulauan Riau"},
    {"name": "Daik Lingga", "lat": -0.20, "lon": 104.62, "province": "Kepulauan Riau"},
    {"name": "Tarempa Anambas", "lat": 3.20, "lon": 106.22, "province": "Kepulauan Riau"},
]


def _grid_points() -> List[Dict[str, Any]]:
    """Return the whole-Sumatra grid.

    Phase 169 removed the ``GRID_KEEP_RADIUS_KM`` corridor/land-mask filter: it
    silently dropped every point far from a gazetteer node, which is exactly the
    whole-island coverage this phase restores. The curated grid is already land
    points inside the full bbox, so every fetched point is represented.
    """
    return list(SUMATRA_GRID)


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
