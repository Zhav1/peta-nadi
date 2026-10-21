"""
PetaNadi / PreHub : Standardized Weather Fusion Service
Combines live BMKG Radar / Station Warnings + Open-Meteo Global Numerical Weather Predictions (ECMWF/GFS)
into organic GeoJSON coverage polygons for Sumatra corridors.
Zero GPU overhead.
"""
import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.open_meteo_adapter import OpenMeteoAdapter
from app.services.incident_geometry_service import generate_flood_geometry

logger = logging.getLogger(__name__)

_SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}

# Disruption-worthy defaults: heavy rain that can cause disruptions.
# precip > 50mm/24h or flood >= 80%  <=> severity high/critical.
DEFAULT_MIN_SEVERITY = "high"
DEFAULT_MIN_PRECIP_MM = 50.0
DEFAULT_MIN_FLOOD_PCT = 80.0


def _extract_openmeteo_numbers(ev: Dict[str, Any]):
    """Parse numeric precip/flood/wind from an Open-Meteo normalized event."""
    raw = ev.get("raw_payload") or {}
    preds = raw.get("predictions") or {}
    precip = preds.get("precipitation_mm_24h", ev.get("precipitation_mm_24h"))
    flood = preds.get("flood_risk_pct", ev.get("flood_risk_pct"))
    wind = preds.get("wind_speed_kmh", preds.get("windspeed_kmh", ev.get("windspeed_kmh", ev.get("wind_speed_kmh"))))
    try:
        precip_f = float(precip) if precip is not None else None
    except (TypeError, ValueError):
        precip_f = None
    try:
        flood_f = float(flood) if flood is not None else None
    except (TypeError, ValueError):
        flood_f = None
    try:
        wind_f = float(wind) if wind is not None else None
    except (TypeError, ValueError):
        wind_f = None
    return precip_f, flood_f, wind_f


def _extract_bmkg_numbers(ev: Dict[str, Any]):
    """Parse BMKG weather code + mapped disruption numerics.

    Code 60 = medium drizzle (non-disruption, filtered by default).
    Codes 95/97 = thunderstorm/severe (disruption, mapped to sim-grade numerics).
    """
    code: Optional[int] = None
    raw = ev.get("raw")
    warning: Dict[str, Any] = {}
    try:
        if isinstance(raw, str):
            warning = json.loads(raw) if raw else {}
        elif isinstance(raw, dict):
            warning = raw
    except Exception:
        warning = {}
    raw_code = warning.get("code", ev.get("bmkg_code", ev.get("code")))
    try:
        code = int(raw_code) if raw_code is not None else None
    except (TypeError, ValueError):
        code = None
    precip = warning.get("precipitation_mm_24h", ev.get("precipitation_mm_24h"))
    flood = warning.get("flood_risk_pct", ev.get("flood_risk_pct"))
    wind = warning.get("windspeed_kmh", warning.get("wind_speed_kmh", ev.get("windspeed_kmh", ev.get("wind_speed_kmh"))))
    try:
        precip_f = float(precip) if precip is not None else None
    except (TypeError, ValueError):
        precip_f = None
    try:
        flood_f = float(flood) if flood is not None else None
    except (TypeError, ValueError):
        flood_f = None
    try:
        wind_f = float(wind) if wind is not None else None
    except (TypeError, ValueError):
        wind_f = None
    # Fallback mapping when BMKG carries no numerics (current API: desc+code only).
    if precip_f is None and flood_f is None:
        if code == 60:
            precip_f, flood_f = 25.0, 55.0
            if wind_f is None:
                wind_f = 20.0
        elif code in (95, 97):
            precip_f, flood_f = 65.5, 87.5
            if wind_f is None:
                wind_f = 42.0
        elif ev.get("severity") in ("high", "critical"):
            precip_f, flood_f = 65.5, 87.5
            if wind_f is None:
                wind_f = 42.0
    return code, precip_f, flood_f, wind_f


async def get_fused_spatial_weather(
    min_severity: str = DEFAULT_MIN_SEVERITY,
    min_precip: Optional[float] = None,
    min_flood: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Fuses BMKG station data and Open-Meteo global numerical weather model forecasts.
    Returns organic GeoJSON FeatureCollection of active weather coverage polygons.

    Disruption-only default: min_severity="high" keeps high/critical only,
    excluding BMKG code 60 / medium drizzle unless explicitly requested via
    min_severity="medium" (full-fidelity advisory path, returns all as before).
    Optional numeric gates min_precip (mm/24h) / min_flood (pct) apply as an OR
    disruption check when provided and when numeric props are present.
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

    min_rank = _SEVERITY_RANK.get(str(min_severity).lower(), 2)

    for ev in weather_warnings:
        lat = float(ev.get("lat", 3.58))
        lon = float(ev.get("lon", 98.67))
        severity = str(ev.get("severity", "medium")).lower()
        is_om = ev.get("source") in ("openmeteo", "open_meteo", "open-meteo", "open-meteo-sim")
        # Carry numeric disruption props from each source (fallback sim 65.5/87.5 keeps high).
        if is_om:
            precip_mm, flood_pct, wind_kmh = _extract_openmeteo_numbers(ev)
            bmkg_code: Optional[int] = None
        else:
            bmkg_code, precip_mm, flood_pct, wind_kmh = _extract_bmkg_numbers(ev)

        # Disruption-only gate: severity rank first (BMKG 60/medium excluded by default).
        if _SEVERITY_RANK.get(severity, 1) < min_rank:
            continue
        # Optional numeric disruption gates (OR semantics: heavy precip OR high flood).
        if min_precip is not None or min_flood is not None:
            has_numeric = precip_mm is not None or flood_pct is not None
            if has_numeric:
                precip_ok = min_precip is None or (precip_mm is not None and precip_mm >= min_precip)
                flood_ok = min_flood is None or (flood_pct is not None and flood_pct >= min_flood)
                if min_precip is not None and min_flood is not None:
                    if not (precip_ok or flood_ok):
                        continue
                elif not (precip_ok and flood_ok):
                    continue

        now = datetime.now(timezone.utc)
        # Q3(A): blue/purple advisory palette (never RED semantics — corroborator only).
        # Blue = high/critical disruption (Gangguan), purple = medium/low advisory.
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
                "updated_at": now.isoformat(),
                # Disruption numerics: parsed from BMKG/Open-Meteo sources.
                "precipitation_mm_24h": precip_mm,
                "flood_risk_pct": flood_pct,
                "windspeed_kmh": wind_kmh,
                "wind_speed_kmh": wind_kmh,
                "bmkg_code": bmkg_code,
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "fusion_engine": "BMKG Radar Observation + Open-Meteo NWP Forecast",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_regions": len(features),
            "filter": {
                "min_severity": min_severity,
                "min_precip": min_precip,
                "min_flood": min_flood,
            },
        }
    }
