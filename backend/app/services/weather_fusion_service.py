"""
PetaNadi / PreHub — Standardized Weather Fusion Service
Combines live BMKG Radar / Station Warnings + Open-Meteo Global Numerical Weather Predictions (ECMWF/GFS)
into organic GeoJSON coverage polygons for Sumatra corridors.
Zero GPU overhead.
"""
import logging
from typing import Dict, Any, List
from datetime import datetime, timezone

from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.openmeteo_adapter import OpenMeteoAdapter
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

    # Combined active weather warnings
    weather_warnings = [ev for ev in (bmkg_events + openmeteo_events) if ev.get("event_type") == "weather_warning"]

    for ev in weather_warnings:
        lat = float(ev.get("lat", 3.58))
        lon = float(ev.get("lon", 98.67))
        severity = ev.get("severity", "medium")
        is_om = ev.get("source") == "openmeteo"

        geom_feature = generate_flood_geometry(lon, lat, water_depth_m=1.2 if severity == "high" else 0.6)

        features.append({
            "type": "Feature",
            "geometry": geom_feature["geometry"],
            "properties": {
                "name": ev.get("title", "Peringatan Cuaca Ekstrem BMKG / Open-Meteo"),
                "severity": severity,
                "status_label": "PROYEKSI PRESIPITASI EKSTREM OPEN-METEO" if is_om else "PERINGATAN CUACA EKSTREM BMKG",
                "fill_color": "rgba(239, 68, 68, 0.35)" if severity in ["critical", "high"] else "rgba(245, 158, 11, 0.30)",
                "stroke_color": "#ef4444" if severity in ["critical", "high"] else "#f59e0b",
                "bmkg_source": "BMKG Stasiun Klimatologi & Geofisika",
                "nwp_source": "Open-Meteo Global NWP (ECMWF/GFS)",
                "updated_at": datetime.now(timezone.utc).isoformat()
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
