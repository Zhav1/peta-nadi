"""
PetaNadi / PreHub : Standardized Weather Fusion Service
Combines live BMKG Radar / Station Warnings + Open-Meteo Global Numerical Weather Predictions (ECMWF/GFS)
into organic GeoJSON coverage polygons for Sumatra corridors.
Zero GPU overhead.
"""
import logging
import json
import math
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta, timezone

from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.open_meteo_adapter import OpenMeteoAdapter
from app.services.incident_geometry_service import (
    generate_flood_geometry,
    generate_landslide_geometry,
    generate_incident_geometry,
)
from app.services.retention import (
    WEATHER_REFRESH_S,
    WEATHER_STALE_CEILING_HOURS,
    WEATHER_VALIDITY_HOURS,
)

logger = logging.getLogger(__name__)

_SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}

# Feature cap: whole-Sumatra grid yields far more qualifying points than the
# map can draw legibly. This is a RENDER cap only — it never filters the
# candidate list and never truncates a counter (see get_weather_zone_inventory).
MAX_WEATHER_FEATURES = 24

# Corridor spine (lon, lat) used to PRIORITISE corridor-adjacent polygons when
# the render cap has to choose which zones to draw. It is ordering only: a zone
# outside the spine is still built, still counted and still returned while it
# fits under MAX_WEATHER_FEATURES. (Phase 169 removed corridor *filtering*.)
_CORRIDOR_SPINE: List[Tuple[float, float]] = [
    (95.32, 5.55), (97.15, 5.18), (98.67, 3.59), (99.27, 1.38),
    (101.45, 0.51), (100.42, -0.95), (103.61, -1.61),
    (104.77, -2.98), (104.17, -4.10), (105.26, -5.43), (105.75, -5.87),
]


def _dist_to_spine_km(lat: float, lon: float) -> float:
    r = 6371.0
    best = float("inf")
    for slon, slat in _CORRIDOR_SPINE:
        dlat = math.radians(slat - lat)
        dlon = math.radians(slon - lon)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(slat)) * math.sin(dlon / 2) ** 2
        best = min(best, 2 * r * math.asin(math.sqrt(a)))
    return best


# Hill-spine nodes prone to landslide under heavy precip (lon, lat, label).
_HILL_SPINE_NODES: List[Tuple[float, float, str]] = [
    (100.37, -0.30, "Bukittinggi"),
    (100.48, -0.48, "Sitinjau Lauik"),
    (100.35, -0.95, "Padang"),
    (100.66, -0.79, "Solok"),
    (101.30, -2.00, "Kerinci"),
]

# Per-segment corridor mapping for the 10 spine legs (11 spine points).
_SPINE_SEGMENT_CORRIDORS: List[Tuple[str, str]] = [
    ("sumatra_aceh_malahayati", "Banda Aceh–Medan"),
    ("sumatra_belawan_medan", "Medan–Tebing Tinggi"),
    ("sumatra_riau_pekanbaru", "Tebing Tinggi–Pekanbaru"),
    ("sumatra_riau_pekanbaru", "Pekanbaru–Rengat"),
    ("sumatra_sumbar_padang", "Rengat–Padang"),
    ("sumatra_sumbar_padang", "Padang–Bukittinggi"),
    ("sumatra_sumsel_palembang", "Bukittinggi–Palembang"),
    ("sumatra_sumsel_palembang", "Palembang–Lahat"),
    ("sumatra_lampung_bakauheni", "Lahat–Bakauheni"),
    ("sumatra_lampung_bakauheni", "Bakauheni–Panjang"),
]

_SEVERITY_MULT = {"critical": 1.2, "high": 1.0, "medium": 0.7, "low": 0.4}
_HAZARD_BASE_DELAY = {"flood": 14.0, "landslide": 10.0, "marine_wave": 18.0, "severe_storm": 14.0}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _dist_to_hill_spine_km(lat: float, lon: float) -> Tuple[float, str]:
    best = float("inf")
    label = ""
    for slon, slat, name in _HILL_SPINE_NODES:
        d = _haversine_km(lat, lon, slat, slon)
        if d < best:
            best, label = d, name
    return best, label


def _is_coastal(lon: float, lat: float) -> bool:
    # West Indian-Ocean coast (lon < 98.5) or east Malacca/Sunda coast (lon > 104.0),
    # plus Sunda strait southern tip (lat < -4.5).
    return lon < 98.5 or lon > 104.0 or lat < -4.5


def _nearest_spine_segment(lat: float, lon: float) -> Tuple[int, float]:
    # Point-to-segment distance in degree space converted to km (deterministic,
    # no new deps). Returns (segment_index, dist_km).
    best_idx, best_d = 0, float("inf")
    for i in range(len(_CORRIDOR_SPINE) - 1):
        ax, ay = _CORRIDOR_SPINE[i][0], _CORRIDOR_SPINE[i][1]  # lon, lat
        bx, by = _CORRIDOR_SPINE[i + 1][0], _CORRIDOR_SPINE[i + 1][1]
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        t = ((lon - ax) * dx + (lat - ay) * dy) / denom if denom else 0.0
        t = max(0.0, min(1.0, t))
        px, py = ax + t * dx, ay + t * dy
        d = _haversine_km(lat, lon, py, px)
        if d < best_d:
            best_d, best_idx = d, i
    return best_idx, best_d


def _classify_hazard_type(
    precip_mm: Optional[float],
    flood_pct: Optional[float],
    wind_kmh: Optional[float],
    bmkg_code: Optional[int],
    lat: float,
    lon: float,
) -> str:
    coastal = _is_coastal(lon, lat)
    wind = wind_kmh or 0.0
    precip = precip_mm or 0.0
    if coastal and wind >= 30.0:
        return "marine_wave"
    if (bmkg_code in (95, 97)) or wind >= 40.0:
        return "severe_storm"
    if precip >= 50.0:
        hill_dist, _ = _dist_to_hill_spine_km(lat, lon)
        if hill_dist < 75.0:
            return "landslide"
    return "flood"


def _advisory_action(hazard_type: str, severity: str) -> str:
    sev = (severity or "").lower()
    if sev == "critical":
        return "HOLD_DEPARTURE"
    if sev == "high":
        if hazard_type in ("marine_wave", "severe_storm"):
            return "REROUTE_RECOMMENDED"
        return "CONSIDER_DELAY"
    return "PROCEED_WITH_CAUTION"


def _affected_modalities(hazard_type: str, wind_kmh: Optional[float], lon: float, lat: float) -> List[str]:
    mods = ["truck"]
    wind = wind_kmh or 0.0
    if hazard_type == "marine_wave" or _is_coastal(lon, lat):
        mods.append("sea")
    if wind >= 50.0 or hazard_type == "severe_storm":
        mods.append("air")
    return mods


def _weather_geometry(hazard_type: str, lon: float, lat: float, severity: str) -> Dict[str, Any]:
    try:
        if hazard_type == "landslide":
            return generate_landslide_geometry(lon, lat)
        if hazard_type == "marine_wave":
            feat = generate_incident_geometry("marine_wave", lat, lon)
            # generate_incident_geometry fallback returns a Feature for unknown types.
            if isinstance(feat, dict) and feat.get("type") == "Feature":
                return feat
            return generate_flood_geometry(lon, lat, water_depth_m=_water_depth_for_severity(severity))
        # flood + severe_storm share the flood ellipse (storm scaled up slightly).
        depth = _water_depth_for_severity(severity)
        if hazard_type == "severe_storm":
            depth = round(depth * 1.25, 2)
        return generate_flood_geometry(lon, lat, water_depth_m=depth)
    except Exception:
        return generate_flood_geometry(lon, lat, water_depth_m=_water_depth_for_severity(severity))


def _water_depth_for_severity(severity: str) -> float:
    # Scale flood ellipse by severity: critical 1.8 / high 1.2 / medium 0.6 / low 0.4.
    return {"critical": 1.8, "high": 1.2, "medium": 0.6}.get(severity, 0.4)

# Disruption-worthy defaults: heavy rain that can cause disruptions.
# precip > 50mm/24h or flood >= 80%  <=> severity high/critical.
DEFAULT_MIN_SEVERITY = "high"
DEFAULT_MIN_PRECIP_MM = 50.0
DEFAULT_MIN_FLOOD_PCT = 80.0

# Fields every polygon response publishes (both ``metadata`` and the compact
# ``meta`` block) so freshness/cap notices read from one contract.
POLYGON_META_FIELDS: Tuple[str, ...] = (
    "status",
    "reason",
    "total",
    "count",
    "capped",
    "updated_at",
    "validity_hours",
    "stale_ceiling_hours",
    "refresh_seconds",
    "max_features",
)


def compact_polygon_meta(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Compact, additive render contract for a polygon FeatureCollection."""
    return {key: metadata.get(key) for key in POLYGON_META_FIELDS}



def _extract_openmeteo_numbers(ev: Dict[str, Any]):
    """Parse numeric precip/flood/wind from an Open-Meteo normalized event."""
    raw = ev.get("raw_payload") or {}
    preds = raw.get("predictions") or {}
    precip = preds.get("precipitation_mm_24h", ev.get("precipitation_mm_24h"))
    flood = preds.get("modeled_risk_pct", preds.get("flood_risk_pct", ev.get("modeled_risk_pct", ev.get("flood_risk_pct"))))
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
    """Parse provider-published BMKG forecast values without numeric synthesis."""
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
    # BMKG codes/description remain source evidence. Do not invent rainfall,
    # wind, or flood-probability numbers when the provider did not publish them.
    return code, precip_f, flood_f, wind_f


async def _collect_weather_events() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """Collect normalized observations from the shared cache only."""
    from app.services.public_operational_cache import read_cached_source_observations

    records = read_cached_source_observations()
    bmkg = records.get("bmkg")
    openmeteo = records.get("open_meteo")
    bmkg_events = list((bmkg or {}).get("events") or [])
    openmeteo_events = list((openmeteo or {}).get("events") or [])
    errors = []
    for name, record in (("bmkg", bmkg), ("open_meteo", openmeteo)):
        if not isinstance(record, dict):
            errors.append(f"{name}: no cached source data")
        elif record.get("error"):
            errors.append(f"{name}: {record['error']}")
    upstream = {
        "bmkg_ok": isinstance(bmkg, dict) and bmkg.get("status") not in ("degraded", "down"),
        "open_meteo_ok": isinstance(openmeteo, dict) and openmeteo.get("status") not in ("degraded", "down"),
        "degraded": not isinstance(bmkg, dict) and not isinstance(openmeteo, dict),
        "errors": errors,
        "reason": "; ".join(errors) if errors else None,
        "source_records": {
            key: {k: value.get(k) for k in ("fetched_at", "observed_at", "valid_until", "status")}
            for key, value in (("bmkg", bmkg), ("open_meteo", openmeteo)) if isinstance(value, dict)
        },
    }
    return bmkg_events, openmeteo_events, upstream


def _passes_numeric_gate(
    precip_mm: Optional[float],
    flood_pct: Optional[float],
    min_precip: Optional[float],
    min_flood: Optional[float],
) -> bool:
    """Disruption gate on the numerics (OR semantics when both gates are set).

    A zone with no numerics at all is kept: absence of measurement is not
    evidence of calm. Shared by the candidate builder and the in-memory filter
    so a cached snapshot can never be re-gated differently.
    """
    if min_precip is None and min_flood is None:
        return True
    has_numeric = precip_mm is not None or flood_pct is not None
    if not has_numeric:
        return True
    precip_ok = min_precip is None or (precip_mm is not None and precip_mm >= min_precip)
    flood_ok = min_flood is None or (flood_pct is not None and flood_pct >= min_flood)
    if min_precip is not None and min_flood is not None:
        return bool(precip_ok or flood_ok)
    return bool(precip_ok and flood_ok)


def _build_weather_candidates(
    bmkg_events: List[Dict[str, Any]],
    openmeteo_events: List[Dict[str, Any]],
    min_severity: str = DEFAULT_MIN_SEVERITY,
    min_precip: Optional[float] = None,
    min_flood: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Build the full UNCAPPED candidate list for one fusion snapshot.

    ``get_fused_spatial_weather`` slices this list for rendering; the summary
    endpoint counts it before slicing so the 24-feature render cap can never
    truncate a counter.
    """
    candidates: List[Dict[str, Any]] = []

    # Combined active weather warnings (canonical OpenMeteoAdapter emits
    # event_type "weather_prediction" / source "open_meteo"; BMKG emits
    # "weather_warning" — accept both so fusion keeps producing features)
    weather_warnings = [ev for ev in (bmkg_events + openmeteo_events) if ev.get("event_type") in ("weather_warning", "weather_prediction")]

    min_rank = _SEVERITY_RANK.get(str(min_severity).lower(), 2)

    # Precompute opposite-source positions for deterministic BMKG+OM agreement check.
    def _ev_latlon(e: Dict[str, Any]) -> Tuple[float, float]:
        try:
            return float(e.get("lat", 3.58)), float(e.get("lon", 98.67))
        except Exception:
            return 3.58, 98.67

    bmkg_pts = [_ev_latlon(e) for e in bmkg_events if e.get("event_type") in ("weather_warning", "weather_prediction")]
    om_pts = [_ev_latlon(e) for e in openmeteo_events if e.get("event_type") in ("weather_warning", "weather_prediction")]

    def _has_cross_agreement(lat: float, lon: float, is_om: bool) -> bool:
        others = bmkg_pts if is_om else om_pts
        for ola, olo in others:
            if _haversine_km(lat, lon, ola, olo) <= 55.0:
                return True
        return False

    for ev in weather_warnings:
        try:
            lat = float(ev["lat"])
            lon = float(ev["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
            continue
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
        if not _passes_numeric_gate(precip_mm, flood_pct, min_precip, min_flood):
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

        geom_feature = _weather_geometry(
            _classify_hazard_type(precip_mm, flood_pct, wind_kmh, bmkg_code, lat, lon),
            lon, lat, severity,
        )
        region_name = ev.get("region") or ev.get("title", "Sumatra")

        # ---- Additive dispatch enrichment (deterministic, no new APIs) ----
        hazard_type = _classify_hazard_type(precip_mm, flood_pct, wind_kmh, bmkg_code, lat, lon)
        try:
            seg_idx, seg_dist = _nearest_spine_segment(lat, lon)
        except Exception:
            seg_idx, seg_dist = 0, 0.0
        seg_idx = max(0, min(seg_idx, len(_SPINE_SEGMENT_CORRIDORS) - 1))
        corridor_id, segment = _SPINE_SEGMENT_CORRIDORS[seg_idx]
        corridor_intersect = {
            "corridor_id": corridor_id,
            "segment": segment,
            "dist_km": round(float(seg_dist), 1),
        }
        base_delay = _HAZARD_BASE_DELAY.get(hazard_type, 8.0)
        delay_hours = round(base_delay * _SEVERITY_MULT.get(severity, 1.0), 1)
        advisory_action = _advisory_action(hazard_type, severity)
        affected_modalities = _affected_modalities(hazard_type, wind_kmh, lon, lat)
        agree = _has_cross_agreement(lat, lon, is_om)
        if agree:
            confidence = 0.9 if severity == "critical" else 0.85
        elif is_om:
            confidence = 0.75 if severity == "critical" else 0.65
        else:
            confidence = 0.8 if bmkg_code in (95, 97) else 0.5
        is_forecast = bool(is_om or ev.get("is_forecast") or ev.get("modeled"))
        observed_vs_forecast = "forecast" if is_forecast else "observation"

        # Priority score for the MAX_WEATHER_FEATURES cap: severity rank first,
        # then flood/precip magnitude, then corridor proximity (nearer = kept).
        rank = _SEVERITY_RANK.get(severity, 1)
        mag = (flood_pct or 0.0) + (precip_mm or 0.0)
        try:
            dist_km = _dist_to_spine_km(lat, lon)
        except Exception:
            dist_km = 0.0

        candidates.append({
            "rank": rank,
            "mag": mag,
            "dist_km": dist_km,
            "feature": {
                "type": "Feature",
                "geometry": geom_feature["geometry"],
                "properties": {
                    "name": ev.get("title", "Peringatan Cuaca Ekstrem BMKG / Open-Meteo"),
                    "region": region_name,
                    "lat": lat,
                    "lon": lon,
                    "severity": severity,
                    "status_label": "MODELLED OPEN-METEO FORECAST RISK" if is_om else "BMKG PUBLISHED WEATHER FORECAST",
                    "geometry_role": "forecast_area" if is_forecast else "risk_zone",
                    "is_forecast": is_forecast,
                    "modeled": bool(is_om or ev.get("modeled")),
                    "evidence_id": ev.get("crisis_id") or ev.get("dedup_key"),
                    "source_clock": ev.get("source_clock") or ("forecast_valid_time" if is_forecast else "observation_time"),
                    "source_observed_at": ev.get("forecast_issued_at") or ev.get("observed_at") or ev.get("created_at"),
                    "forecast_valid_at": ev.get("forecast_valid_at"),
                    "source_fields": (ev.get("raw_payload") or {}).get("source_fields") if is_om else ev.get("raw"),
                    "fill_color": fill_color,
                    "stroke_color": stroke_color,
                    # Q3(A) provenance click contract: source + valid_until always present.
                    "source": "Open-Meteo NWP (ECMWF/GFS)" if is_om else "BMKG Stasiun Klimatologi & Geofisika",
                    "valid_until": ev.get("valid_until") or (datetime.fromtimestamp(now.timestamp() + 6 * 3600, tz=timezone.utc).isoformat() if is_om else None),
                    "bmkg_source": "BMKG Stasiun Klimatologi & Geofisika",
                    "nwp_source": "Open-Meteo Global NWP (ECMWF/GFS)",
                    "updated_at": now.isoformat(),
                    # Disruption numerics: parsed from BMKG/Open-Meteo sources.
                    "precipitation_mm_24h": precip_mm,
                    "modeled_risk_pct": flood_pct if is_om else None,
                    "windspeed_kmh": wind_kmh,
                    "wind_speed_kmh": wind_kmh,
                    "bmkg_code": bmkg_code,
                    # Dispatch enrichment: weather-caused logistics impacts.
                    "hazard_type": hazard_type,
                    "corridor_intersect": corridor_intersect,
                    "corridor_id": corridor_intersect["corridor_id"],
                    "corridor_segment": corridor_intersect["segment"],
                    "dist_to_corridor_km": corridor_intersect["dist_km"],
                    "delay_hours": delay_hours,
                    "estimated_delay_hours": delay_hours,
                    "advisory_action": advisory_action,
                    "affected_modalities": affected_modalities,
                    "confidence": confidence,
                    "observed_vs_forecast": observed_vs_forecast,
                },
            },
        })

    return candidates


def get_cached_fusion_snapshot(*, records=None) -> Dict[str, Any] | None:
    """Synchronously build fusion from already-persisted source observations."""
    if records is None:
        from app.services.public_operational_cache import read_cached_source_observations
        records = read_cached_source_observations()
    if not records or not any(isinstance(records.get(name), dict) for name in ("bmkg", "open_meteo")):
        return None
    bmkg = records.get("bmkg") or {}
    openmeteo = records.get("open_meteo") or {}
    bmkg_events = list(bmkg.get("events") or [])
    openmeteo_events = list(openmeteo.get("events") or [])
    errors = [f"{name}: {record['error']}" for name, record in (("bmkg", bmkg), ("open_meteo", openmeteo)) if record.get("error")]
    bmkg_ok = bool(bmkg) and bmkg.get("status") not in ("degraded", "down")
    om_ok = bool(openmeteo) and openmeteo.get("status") not in ("degraded", "down")
    upstream = {
        "bmkg_ok": bmkg_ok,
        "open_meteo_ok": om_ok,
        "degraded": not bmkg_ok and not om_ok,
        "errors": errors,
        "reason": "; ".join(errors) if errors else None,
        "source_records": {
            name: {key: record.get(key) for key in ("fetched_at", "observed_at", "valid_until", "status")}
            for name, record in (("bmkg", bmkg), ("open_meteo", openmeteo)) if record
        },
    }
    candidates = _build_weather_candidates(
        bmkg_events, openmeteo_events, min_severity="low", min_precip=None, min_flood=None
    )
    now = datetime.now(timezone.utc)
    expiries = [
        datetime.fromisoformat(record["valid_until"].replace("Z", "+00:00"))
        for record in (bmkg, openmeteo) if record.get("valid_until")
    ]
    valid_until = min(expiries).isoformat() if expiries else (now + timedelta(hours=WEATHER_VALIDITY_HOURS)).isoformat()
    return {
        "bbox": list(SUMATRA_BBOX),
        "generated_at": max((r.get("fetched_at", "") for r in (bmkg, openmeteo)), default="") or now.isoformat(),
        "valid_until": valid_until,
        "window_hours": HAZARD_WINDOW_HOURS,
        "source": WEATHER_SUMMARY_SOURCE,
        "candidates": candidates,
        "upstream": upstream,
    }


async def get_fusion_snapshot(
    *, refresh: bool = False, source: str | None = None, reserve_provider_budget=None
) -> Dict[str, Any]:
    """Fuse cached source records; refresh, when explicit, is source-scoped.

    Source jobs own independent cadences. An unscoped call never refreshes
    either provider, even when ``refresh=True`` is accidentally passed.
    """
    if refresh and source:
        from app.services.public_operational_cache import refresh_public_operational_cache
        await refresh_public_operational_cache(source=source, reserve_provider_budget=reserve_provider_budget)
    snapshot = get_cached_fusion_snapshot()
    if snapshot is not None:
        return snapshot
    now = datetime.now(timezone.utc)
    return {
        "bbox": list(SUMATRA_BBOX), "generated_at": now.isoformat(), "valid_until": None,
        "window_hours": HAZARD_WINDOW_HOURS, "source": WEATHER_SUMMARY_SOURCE,
        "candidates": [], "upstream": {"degraded": True, "errors": ["No cached source data"], "reason": "No cached source data"},
    }


def filter_candidates(
    candidates: Optional[List[Dict[str, Any]]],
    min_severity: str = DEFAULT_MIN_SEVERITY,
    min_precip: Optional[float] = None,
    min_flood: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Apply the request's render gates to a cached snapshot's candidates.

    Identical semantics to the gates applied inside ``_build_weather_candidates``
    (severity rank first, then the numeric OR gate) — re-implemented as a filter
    so the shared snapshot serves every filter combination without refetching.
    """
    min_rank = _SEVERITY_RANK.get(str(min_severity).lower(), 2)
    kept: List[Dict[str, Any]] = []
    for cand in candidates or []:
        props = ((cand or {}).get("feature") or {}).get("properties") or {}
        severity = str(props.get("severity", "")).lower()
        if _SEVERITY_RANK.get(severity, 1) < min_rank:
            continue
        if not _passes_numeric_gate(
            props.get("precipitation_mm_24h"), props.get("modeled_risk_pct", props.get("flood_risk_pct")),
            min_precip, min_flood,
        ):
            continue
        kept.append(cand)
    return kept


def render_polygon_payload(
    snapshot: Dict[str, Any],
    min_severity: str = DEFAULT_MIN_SEVERITY,
    min_precip: Optional[float] = None,
    min_flood: Optional[float] = None,
) -> Dict[str, Any]:
    """Render-capped GeoJSON FeatureCollection from a fusion snapshot.

    The cap is a RENDER cap only: ``total`` publishes the pre-cap count for the
    requested filter, ``count`` what is drawn, ``capped`` whether they differ.
    """
    candidates = filter_candidates(
        snapshot.get("candidates"), min_severity, min_precip, min_flood
    )

    # Render cap only: sort for drawing priority (severity, magnitude, then
    # corridor proximity) and slice. No zone is ever dropped for being far from
    # _CORRIDOR_SPINE — the spine is ordering, not a filter.
    candidates.sort(key=lambda c: (-c["rank"], -c["mag"], c["dist_km"]))
    total = len(candidates)
    features = [c["feature"] for c in candidates[:MAX_WEATHER_FEATURES]]
    count = len(features)
    capped = total > count

    upstream = snapshot.get("upstream") or {}
    degraded = bool(upstream.get("degraded"))
    generated_at = snapshot.get("generated_at")

    if degraded and count == 0:
        # Unknown, not zero: a total outage publishes null counts.
        status, reason = "degraded", upstream.get("reason") or "Sumber cuaca tidak tersedia"
        published_total: Optional[int] = None
        published_count: Optional[int] = None
    else:
        status = "ok" if count > 0 else "empty"
        reason = upstream.get("reason") if degraded else (None if count else "Tidak ada zona aktif")
        published_total = total
        published_count = count

    metadata = {
        "fusion_engine": "BMKG published weather forecast + Open-Meteo NWP forecast",
        "timestamp": generated_at,
        "updated_at": generated_at,
        # total = qualifying zones BEFORE the render cap. count = polygons
        # returned. capped = the render cap truncated the draw list.
        "total": published_total,
        "count": published_count,
        "capped": capped,
        # Legacy alias kept frozen (decision 14): it always meant "returned".
        "total_regions": count,
        "coverage": "full-sumatra-grid",
        "bbox": list(snapshot.get("bbox") or SUMATRA_BBOX),
        "max_features": MAX_WEATHER_FEATURES,
        "status": status,
        "reason": reason,
        "validity_hours": WEATHER_VALIDITY_HOURS,
        "stale_ceiling_hours": WEATHER_STALE_CEILING_HOURS,
        "refresh_seconds": WEATHER_REFRESH_S,
        "upstream_degraded": degraded,
        "filter": {
            "min_severity": min_severity,
            "min_precip": min_precip,
            "min_flood": min_flood,
        },
    }
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": metadata,
        # Compact render contract (same values) so clients do not need to parse
        # the whole fusion metadata block to draw "menampilkan N dari M".
        "meta": compact_polygon_meta(metadata),
    }


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

    The GeoJSON stays capped at MAX_WEATHER_FEATURES for rendering. Counting is
    NOT done here — use get_weather_zone_inventory() for world-truth totals.
    """
    snapshot = await get_fusion_snapshot()
    return render_polygon_payload(snapshot, min_severity, min_precip, min_flood)


    now_iso = datetime.now(timezone.utc).isoformat()
    metadata = {
        "fusion_engine": "BMKG published weather forecast + Open-Meteo NWP forecast",
        "timestamp": now_iso,
        "updated_at": now_iso,
        # total = qualifying zones BEFORE the render cap. count = polygons
        # returned. capped = the render cap truncated the draw list.
        "total": published_total,
        "count": published_count,
        "capped": capped,
        # Legacy alias kept frozen (decision 14): it always meant "returned".
        "total_regions": count,
        "coverage": "full-sumatra-grid",
        "bbox": list(SUMATRA_BBOX),
        "max_features": MAX_WEATHER_FEATURES,
        "status": status,
        "reason": reason,
        "validity_hours": WEATHER_VALIDITY_HOURS,
        "stale_ceiling_hours": WEATHER_STALE_CEILING_HOURS,
        "refresh_seconds": WEATHER_REFRESH_S,
        "upstream_degraded": degraded,
        "filter": {
            "min_severity": min_severity,
            "min_precip": min_precip,
            "min_flood": min_flood,
        },
    }
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": metadata,
        # Compact render contract (same values) so clients do not need to parse
        # the whole fusion metadata block to draw "menampilkan N dari M".
        "meta": compact_polygon_meta(metadata),
    }


# World-truth hazard summary contract (Phase 160).
# bbox = whole-Sumatra (minlon, minlat, maxlon, maxlat).
SUMATRA_BBOX: List[float] = [94.0, -6.0, 108.0, 6.0]
# cuaca = active disruption; waspada = early warning (forecast watch tier).
# Mutually exclusive by construction — a zone is counted in exactly one bucket.
DISRUPTION_SEVERITIES = ("high", "critical")
ADVISORY_SEVERITIES = ("medium",)
# Hazard window the fusion numerics describe (mm/24h precipitation gate).
HAZARD_WINDOW_HOURS = 24
_ZONE_VALIDITY_HOURS = WEATHER_VALIDITY_HOURS
WEATHER_SUMMARY_SOURCE = "BMKG Stasiun Klimatologi & Geofisika + Open-Meteo NWP (ECMWF/GFS)"


def count_weather_zones(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Uncapped, severity-partitioned zone inventory for the counters.

    Never truncated by MAX_WEATHER_FEATURES: the render cap is applied only by
    render_polygon_payload(). ``upstream.degraded`` tells the caller that no
    count may be published (degraded must not become 0).
    """
    candidates = snapshot.get("candidates") or []

    disruption = 0
    advisory = 0
    below_advisory = 0
    for cand in candidates:
        severity = str(cand["feature"]["properties"].get("severity", "")).lower()
        if severity in DISRUPTION_SEVERITIES:
            disruption += 1
        elif severity in ADVISORY_SEVERITIES:
            advisory += 1
        else:
            below_advisory += 1

    return {
        "bbox": list(snapshot.get("bbox") or SUMATRA_BBOX),
        "generated_at": snapshot.get("generated_at"),
        "valid_until": snapshot.get("valid_until"),
        "window_hours": int(snapshot.get("window_hours") or HAZARD_WINDOW_HOURS),
        "source": snapshot.get("source") or WEATHER_SUMMARY_SOURCE,
        # total = full fused inventory before any render cap.
        "total": len(candidates),
        "cuaca_total": disruption,
        "waspada_total": advisory,
        "below_advisory_total": below_advisory,
        "upstream": snapshot.get("upstream") or {},
    }


async def get_weather_zone_inventory() -> Dict[str, Any]:
    """Uncapped zone inventory from a fresh fusion snapshot (one upstream pass)."""
    snapshot = await get_fusion_snapshot()
    return count_weather_zones(snapshot)

