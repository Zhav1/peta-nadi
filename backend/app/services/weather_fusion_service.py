"""
PetaNadi / PreHub : Standardized Weather Fusion Service
Combines live BMKG Radar / Station Warnings + Open-Meteo Global Numerical Weather Predictions (ECMWF/GFS)
into organic GeoJSON coverage polygons for Sumatra corridors.
Zero GPU overhead.
"""
import logging
from typing import Dict, Any, List
from datetime import datetime, timezone

from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.open_meteo_adapter import OpenMeteoAdapter
from app.services.incident_geometry_service import generate_flood_geometry

logger = logging.getLogger(__name__)


async def get_fused_spatial_weather() -> Dict[str, Any]:
    """
    Fuses BMKG station data and Open-Meteo global numerical weather model forecasts.
    Returns organic GeoJSON FeatureCollection of active weather coverage polygons.
    """
    logger.info("Fusing BMKG weather alerts + Open-Meteo atmospheric forecasts...")

    bmkg_events = []
    openmeteo_events = []

    try:
        bmkg = BMKGAdapter()
        raw_bmkg = await bmkg.fetch()
        bmkg_events = await bmkg.parse(raw_bmkg)
    except Exception as e:
        logger.warning(f"Failed to fetch BMKG for weather fusion: {e}")

    try:
        openmeteo = OpenMeteoAdapter()
        raw_om = await openmeteo.fetch()
        openmeteo_events = await openmeteo.parse(raw_om)
    except Exception as e:
        logger.warning(f"Failed to fetch Open-Meteo data for weather fusion: {e}")

    features = []

    # Combined active weather warnings (canonical OpenMeteoAdapter emits
    # event_type "weather_prediction" / source "open_meteo"; BMKG emits
    # "weather_warning" — accept both so fusion keeps producing features)
    weather_warnings = [ev for ev in (bmkg_events + openmeteo_events) if ev.get("event_type") in ("weather_warning", "weather_prediction")]

    for ev in weather_warnings:
        lat = float(ev.get("lat", 3.58))
        lon = float(ev.get("lon", 98.67))
        severity = ev.get("severity", "medium")
        is_om = ev.get("source") in ("openmeteo", "open_meteo", "open-meteo", "open-meteo-sim")
        now = datetime.now(timezone.utc)
        # Q3(A): blue/purple advisory palette (never RED semantics — corroborator only).
        # Blue = high/critical advisory, purple = medium/low advisory.
        if severity in ("critical", "high"):
            fill_color = "rgba(59, 130, 246, 0.35)"
            stroke_color = "#3b82f6"
        else:
            fill_color = "rgba(168, 85, 247, 0.30)"
            stroke_color = "#a855f7"

        geom_feature = generate_flood_geometry(lon, lat, water_depth_m=1.2 if severity == "high" else 0.6)

        features.append({
            "type": "Feature",
            "geometry": geom_feature["geometry"],
            "properties": {
                "name": ev.get("title", "Peringatan Cuaca Ekstrem BMKG / Open-Meteo"),
                "severity": severity,
                "status_label": "PROYEKSI PRESIPITASI EKSTREM OPEN-METEO" if is_om else "PERINGATAN CUACA EKSTREM BMKG",
                "fill_color": fill_color,
                "stroke_color": stroke_color,
                # Q3(A) provenance click contract: source + valid_until always present.
                "source": "Open-Meteo NWP (ECMWF/GFS)" if is_om else "BMKG Stasiun Klimatologi & Geofisika",
                "valid_until": datetime.fromtimestamp(now.timestamp() + 6 * 3600, tz=timezone.utc).isoformat(),
                "bmkg_source": "BMKG Stasiun Klimatologi & Geofisika",
                "nwp_source": "Open-Meteo Global NWP (ECMWF/GFS)",
                "updated_at": now.isoformat()
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "fusion_engine": "BMKG Radar Observation + Open-Meteo NWP Forecast",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_regions": len(features)
        }
    }
