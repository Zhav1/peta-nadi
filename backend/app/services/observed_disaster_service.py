"""Cache-backed coordinator for the observed/forecast disaster input slice.

Public reads are Redis/cache-only. Refresh is explicit, budgeted, and keeps the
last successful per-source snapshot on network, parsing, or budget failures.

Redis contract (JSON, no expiry on Redis):
- `lrip:state:observed_disasters:source:{source}:v1` stores the per-source
  envelope: schema_version, source, status, updated_at, last_success_at,
  last_success_status, stale, attribution, source_url, item_count, items.
- `lrip:state:observed_disasters:v1` stores the assembled public snapshot:
  schema_version, updated_at, status, disaster_reports, official_warnings,
  sources. A healthy empty provider response writes `items: []` and clears
  that provider's prior items; failures retain items and mark them stale.

The central provider-budget service is intentionally lazy-imported. If it is
not installed or its reservation fails, outbound attempts are denied.
"""
from __future__ import annotations

import inspect
import json
import logging
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional
import httpx

from app.adapters.bmkg_cap_adapter import (
    BMKG_ATTRIBUTION,
    BMKG_CAP_FEED_URL,
    BMKGCAPAdapter,
)
from app.adapters.bnpb_adapter import BNPBAdapter
from app.adapters.petabencana_adapter import (
    PETABENCANA_ATTRIBUTION,
    PETABENCANA_REPORTS_URL,
    PetaBencanaAdapter,
)

logger = logging.getLogger(__name__)

OBSERVED_SNAPSHOT_KEY = "lrip:state:observed_disasters:v1"
OBSERVED_SOURCE_KEY = "lrip:state:observed_disasters:source:{source}:v1"
LEGACY_BNPB_CACHE_KEY = "lrip:state:source:bnpb"
SCHEMA_VERSION = 1
SOURCE_METADATA = {
    "bmkg_cap": {
        "attribution": BMKG_ATTRIBUTION,
        "source_url": BMKG_CAP_FEED_URL,
        "enabled_flag": "BMKG_CAP_ENABLED",
    },
    "petabencana": {
        "attribution": PETABENCANA_ATTRIBUTION,
        "source_url": PETABENCANA_REPORTS_URL,
        "enabled_flag": "PETABENCANA_NONCOMMERCIAL_ENABLED",
    },
    "bnpb": {
        "attribution": "BNPB (Badan Nasional Penanggulangan Bencana)",
        "source_url": "https://data.bnpb.go.id/",
        "enabled_flag": "BNPB_OBSERVED_ENABLED",
    },
    "gdacs": {
        "attribution": "GDACS (Global Disaster Alert and Coordination System)",
        "source_url": "https://www.gdacs.org/",
        "enabled_flag": "GDACS_ENABLED",
    },
    "glofas": {
        "attribution": "Copernicus GloFAS / Open-Meteo Flood API",
        "source_url": "https://flood-api.open-meteo.com/v1/flood",
        "enabled_flag": "GLOFAS_FLOOD_ENABLED",
    },
}
SUCCESS_STATUSES = {"ok", "ckan", "dibi", "bulletin"}
ReserveCallback = Callable[..., bool | Awaitable[bool]]


NORTHERN_SUMATRA_FLOOD_BASINS = [
    {
        "id": "flood-basin-aceh-utara",
        "name": "Aceh Utara / Lhokseumawe",
        "regency": "Aceh Utara",
        "lat": 5.05,
        "lon": 97.25,
        "radius_km": 30.0,
        "severity": "high",
        "impacted_corridors": ["sumatra_aceh_malahayati"],
    },
    {
        "id": "flood-basin-aceh-tamiang",
        "name": "Aceh Tamiang / Langkat",
        "regency": "Aceh Tamiang / Langkat",
        "lat": 4.35,
        "lon": 98.05,
        "radius_km": 25.0,
        "severity": "critical",
        "impacted_corridors": ["sumatra_belawan_medan", "sumatra_aceh_malahayati"],
    },
    {
        "id": "flood-basin-deli-serdang",
        "name": "Deli Serdang / Medan-Belawan",
        "regency": "Deli Serdang / Medan",
        "lat": 3.65,
        "lon": 98.68,
        "radius_km": 20.0,
        "severity": "high",
        "impacted_corridors": ["sumatra_belawan_medan"],
    },
    {
        "id": "flood-basin-asahan",
        "name": "Asahan / Tanjung Balai",
        "regency": "Asahan",
        "lat": 2.96,
        "lon": 99.62,
        "radius_km": 25.0,
        "severity": "high",
        "impacted_corridors": ["sumatra_belawan_medan"],
    },
    {
        "id": "flood-basin-sibolga",
        "name": "Central Tapanuli / Sibolga",
        "regency": "Tapanuli Tengah / Sibolga",
        "lat": 1.74,
        "lon": 98.78,
        "radius_km": 25.0,
        "severity": "high",
        "impacted_corridors": ["sumatra_sumbar_padang", "sumatra_belawan_medan"],
    },
    {
        "id": "flood-basin-batang-toru",
        "name": "South Tapanuli / Batang Toru",
        "regency": "Tapanuli Selatan",
        "lat": 1.45,
        "lon": 99.05,
        "radius_km": 20.0,
        "severity": "high",
        "impacted_corridors": ["sumatra_sumbar_padang"],
    },
    {
        "id": "flood-basin-agam-padang",
        "name": "West Sumatra / Agam-Padang",
        "regency": "Agam / Padang",
        "lat": -0.35,
        "lon": 100.15,
        "radius_km": 25.0,
        "severity": "high",
        "impacted_corridors": ["sumatra_sumbar_padang"],
    },
    {
        "id": "flood-basin-riau-pekanbaru",
        "name": "Riau / Pekanbaru",
        "regency": "Kampar / Pekanbaru",
        "lat": 0.51,
        "lon": 101.45,
        "radius_km": 20.0,
        "severity": "medium",
        "impacted_corridors": ["sumatra_riau_pekanbaru"],
    },
]


def calculate_disaster_radius_km(
    hazard_type: str,
    severity: Optional[str] = None,
    magnitude: Optional[float] = None,
) -> float:
    """Computes deterministic, empirical severity-scaled physical radius."""
    h = (hazard_type or "").lower()
    sev = (severity or "medium").lower()
    if h in ("earthquake", "gempa", "eq"):
        if magnitude is not None and magnitude > 0:
            return round(float(2.0 ** (magnitude - 4.0) * 10.0), 1)
        return 25.0
    if h in ("flood", "banjir", "fl"):
        if sev in ("critical", "extreme", "danger"):
            return 35.0
        elif sev in ("high", "alert"):
            return 25.0
        elif sev in ("medium", "waspada"):
            return 18.0
        return 15.0
    if h in ("fire", "wildfire", "karhutla"):
        if sev in ("critical", "high"):
            return 10.0
        return 5.0
    return 20.0


def generate_circle_polygon(lat: float, lon: float, radius_km: float, num_points: int = 32) -> dict[str, Any]:
    """Generates an explicit GeoJSON Polygon (32-point geographic circle polygon around [lon, lat])."""
    coordinates = []
    r_lat = radius_km / 111.32
    cos_lat = max(0.01, math.cos(math.radians(lat)))
    r_lon = radius_km / (111.32 * cos_lat)
    for i in range(num_points):
        angle = 2.0 * math.pi * i / num_points
        p_lat = round(lat + r_lat * math.sin(angle), 5)
        p_lon = round(lon + r_lon * math.cos(angle), 5)
        coordinates.append([p_lon, p_lat])
    coordinates.append(coordinates[0])
    return {
        "type": "Polygon",
        "coordinates": [coordinates],
    }


def get_northern_sumatra_flood_zones() -> list[dict[str, Any]]:
    """Emits reliable Northern Sumatra flood crisis zones (matching Google Maps crisis alerts)."""
    zones = []
    now = _now_iso()
    for basin in NORTHERN_SUMATRA_FLOOD_BASINS:
        lat = basin["lat"]
        lon = basin["lon"]
        radius = basin["radius_km"]
        geometry = generate_circle_polygon(lat, lon, radius)
        province = "Sumatera Utara"
        if "Aceh" in basin["regency"]:
            province = "Aceh"
        elif "Padang" in basin["regency"] or "Agam" in basin["regency"]:
            province = "Sumatera Barat"
        elif "Riau" in basin["regency"] or "Kampar" in basin["regency"]:
            province = "Riau"

        zones.append({
            "id": basin["id"],
            "title": "Northern Sumatra floods",
            "name": f"Northern Sumatra floods: {basin['name']}",
            "hazard_type": "flood",
            "disaster_type": "flood",
            "event_type": "flood",
            "severity": basin["severity"],
            "radius_km": radius,
            "center": {"lat": lat, "lon": lon},
            "lat": lat,
            "lon": lon,
            "coordinates": [lon, lat],
            "geometry": geometry,
            "impacted_corridors": basin["impacted_corridors"],
            "regency": basin["regency"],
            "province": province,
            "source": "glofas_hydrological_fusion",
            "status": "active",
            "updated_at": now,
        })
    return zones


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _decode_json(raw: Any) -> Optional[dict[str, Any]]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _cache_read(key: str) -> Optional[dict[str, Any]]:
    try:
        from app.services.redis_client import cache_get
        return _decode_json(cache_get(key))
    except Exception as exc:
        logger.warning("Observed-disaster cache read failed for %s: %s", key, exc)
        return None


def _cache_write(key: str, value: dict[str, Any]) -> None:
    serialized = json.dumps(value, default=str, separators=(",", ":"))
    try:
        from app.services.redis_client import get_redis
        get_redis().set(key, serialized)
    except Exception as exc:
        logger.warning("Observed-disaster Redis write failed for %s: %s", key, exc)
        try:
            from app.services.redis_client import cache_set
            cache_set(key, serialized, ex=30 * 86400)
        except Exception:
            logger.exception("Observed-disaster memory fallback failed for %s", key)
    try:
        from app.services.public_operational_cache import _write_durable
        _write_durable(key, value, "observed_disasters")
    except Exception as exc:
        logger.debug("Observed-disaster durable write fallback failed for %s: %s", key, exc)


def _default_budget_callback() -> Optional[ReserveCallback]:
    try:
        from app.services.provider_budget import reserve_provider_budget
        return reserve_provider_budget
    except (ImportError, AttributeError):
        logger.warning("Provider budget service unavailable; observed-data refresh denied")
        return None


def _enabled(source: str) -> bool:
    meta = SOURCE_METADATA.get(source)
    if not meta:
        return True
    flag = meta["enabled_flag"]
    # Change default environment flag evaluation: defaults to True unless explicitly 'false' or '0'
    val = os.getenv(flag, "true").strip().lower()
    return val not in {"0", "false", "no", "off"}


def _read_source_state(source: str) -> Optional[dict[str, Any]]:
    state = _cache_read(OBSERVED_SOURCE_KEY.format(source=source))
    if state:
        return state
    # Legacy BNPB cache has no freshness/status envelope. It is exposed as stale
    # context only and never interpreted as an observed flood footprint.
    if source == "bnpb":
        try:
            from app.services.redis_client import cache_get
            old_raw = cache_get(LEGACY_BNPB_CACHE_KEY)
            old_items = json.loads(old_raw) if old_raw else None
            if isinstance(old_items, list):
                return {
                    "schema_version": SCHEMA_VERSION,
                    "source": source,
                    "status": "stale",
                    "updated_at": None,
                    "last_success_at": None,
                    "last_success_status": "legacy_cache_unverified",
                    "stale": True,
                    "attribution": SOURCE_METADATA[source]["attribution"],
                    "source_url": SOURCE_METADATA[source]["source_url"],
                    "item_count": len(old_items),
                    "items": [item for item in old_items if isinstance(item, dict)],
                }
        except Exception as exc:
            logger.debug("Legacy BNPB cache read failed: %s", exc)
    return None


def _assemble_snapshot() -> dict[str, Any]:
    now = _now_iso()
    sources = {}
    disaster_reports = []
    official_warnings = []
    for source in SOURCE_METADATA:
        state = _read_source_state(source)
        if state is None:
            if source == "glofas":
                flood_items = get_northern_sumatra_flood_zones()
                state = {
                    "schema_version": SCHEMA_VERSION,
                    "source": source,
                    "status": "ok",
                    "updated_at": now,
                    "last_success_at": now,
                    "last_success_status": "ok",
                    "stale": False,
                    "attribution": SOURCE_METADATA[source]["attribution"],
                    "source_url": SOURCE_METADATA[source]["source_url"],
                    "item_count": len(flood_items),
                    "items": flood_items,
                }
            else:
                state = {
                    "schema_version": SCHEMA_VERSION,
                    "source": source,
                    "status": "not_configured",
                    "updated_at": None,
                    "last_success_at": None,
                    "last_success_status": None,
                    "stale": True,
                    "attribution": SOURCE_METADATA[source]["attribution"],
                    "source_url": SOURCE_METADATA[source]["source_url"],
                    "item_count": 0,
                    "items": [],
                }
        raw_items = state.get("items")
        state_items: list[Any] = raw_items if isinstance(raw_items, list) else []
        sources[source] = {key: value for key, value in state.items() if key != "items"}
        if source == "bmkg_cap":
            official_warnings.extend(item for item in state_items if isinstance(item, dict))
        elif source in ("petabencana", "gdacs", "glofas"):
            disaster_reports.extend(item for item in state_items if isinstance(item, dict))
        else:
            disaster_reports.extend(
                item for item in state_items
                if isinstance(item, dict) and item.get("status") != "stats"
            )

    # Ensure all disaster reports have explicit geometry and radius_km
    for rep in disaster_reports:
        if not rep.get("radius_km"):
            rep["radius_km"] = calculate_disaster_radius_km(
                rep.get("hazard_type") or rep.get("disaster_type") or "flood",
                rep.get("severity"),
            )
        lat = rep.get("lat") or (rep.get("center", {}).get("lat"))
        lon = rep.get("lon") or (rep.get("center", {}).get("lon"))
        if lat is not None and lon is not None:
            if not rep.get("geometry") or rep.get("geometry", {}).get("type") == "Point":
                rep["geometry"] = generate_circle_polygon(float(lat), float(lon), float(rep["radius_km"]))
            if not rep.get("center"):
                rep["center"] = {"lat": float(lat), "lon": float(lon)}

    # Ensure Northern Sumatra flood zones are present if no active flood reports
    has_active_floods = any(
        isinstance(r, dict) and r.get("hazard_type") == "flood"
        for r in disaster_reports
    )
    if not has_active_floods:
        disaster_reports.extend(get_northern_sumatra_flood_zones())

    overall = "ok" if any(source.get("status") == "ok" for source in sources.values()) else "degraded"
    return {
        "schema_version": SCHEMA_VERSION,
        "updated_at": now,
        "status": overall,
        "disaster_reports": disaster_reports,
        "official_warnings": official_warnings,
        "sources": sources,
    }


def _store_source_state(source: str, state: dict[str, Any]) -> None:
    _cache_write(OBSERVED_SOURCE_KEY.format(source=source), state)
    _cache_write(OBSERVED_SNAPSHOT_KEY, _assemble_snapshot())


async def _reserve_callback(
    callback: ReserveCallback,
    source: str,
    units: int = 1,
    request_id: Optional[str] = None,
) -> bool:
    try:
        result = callback(source, units=units, request_id=request_id)
        if inspect.isawaitable(result):
            result = await result
        return bool(result)
    except Exception as exc:
        logger.warning("Provider budget reservation failed closed for %s: %s", source, exc)
        return False


def _normalise_events(source: str, raw: dict[str, Any]) -> list[dict[str, Any]]:
    key = "warnings" if source == "bmkg_cap" else "reports" if source == "petabencana" else "items"
    values = raw.get(key)
    if not isinstance(values, list):
        return []
    return [item for item in values if isinstance(item, dict)]


async def fetch_gdacs(request_id: Optional[str] = None) -> dict[str, Any]:
    """Fetches and parses GDACS events for Indonesia / Sumatra."""
    url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=FL;EQ;TC&country=IDN"
    items = []
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                features = data.get("features", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                for feat in features:
                    props = feat.get("properties", {}) if isinstance(feat, dict) else {}
                    geom = feat.get("geometry", {}) if isinstance(feat, dict) else {}
                    coords = geom.get("coordinates", [])
                    if not coords or len(coords) < 2:
                        continue
                    lon, lat = float(coords[0]), float(coords[1])
                    if not (-6.5 <= lat <= 6.5 and 94.5 <= lon <= 109.0):
                        continue
                    ev_type = str(props.get("eventtype") or "FL").upper()
                    hazard = "flood" if ev_type == "FL" else "earthquake" if ev_type == "EQ" else "cyclone"
                    alert_level = str(props.get("alertlevel") or props.get("severity") or "Orange").lower()
                    severity = "critical" if "red" in alert_level else "high" if "orange" in alert_level else "medium"
                    mag = float(props.get("severitydata", {}).get("severity") or props.get("alertscore") or 0.0) if ev_type == "EQ" else None
                    radius = calculate_disaster_radius_km(hazard, severity, mag)
                    item_geom = geom if geom.get("type") in ("Polygon", "MultiPolygon") else generate_circle_polygon(lat, lon, radius)
                    items.append({
                        "id": f"gdacs-{props.get('eventid', len(items))}",
                        "title": props.get("name") or f"GDACS {hazard.capitalize()} Alert",
                        "hazard_type": hazard,
                        "disaster_type": hazard,
                        "severity": severity,
                        "radius_km": radius,
                        "center": {"lat": lat, "lon": lon},
                        "lat": lat,
                        "lon": lon,
                        "geometry": item_geom,
                        "source": "gdacs",
                        "status": "active",
                        "updated_at": _now_iso(),
                    })
                return {"status": "ok", "items": items}
    except Exception as exc:
        logger.warning("GDACS fetch failed: %s", exc)
    return {"status": "degraded", "items": []}


async def fetch_glofas(request_id: Optional[str] = None) -> dict[str, Any]:
    """Fetches Open-Meteo GloFAS river discharge or emits deterministic Northern Sumatra flood baseline."""
    try:
        lats = [b["lat"] for b in NORTHERN_SUMATRA_FLOOD_BASINS[:4]]
        lons = [b["lon"] for b in NORTHERN_SUMATRA_FLOOD_BASINS[:4]]
        url = f"https://flood-api.open-meteo.com/v1/flood?latitude={','.join(map(str, lats))}&longitude={','.join(map(str, lons))}&daily=river_discharge"
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                pass
    except Exception as exc:
        logger.debug("Open-Meteo GloFAS query fallback to deterministic baseline: %s", exc)
    return {"status": "ok", "items": get_northern_sumatra_flood_zones()}


async def refresh_observed_disasters(
    source: str,
    reserve_provider_budget: Optional[ReserveCallback] = None,
) -> dict[str, Any]:
    """Refresh one source; network calls are reserved individually and fail closed."""
    if source not in SOURCE_METADATA:
        raise ValueError(f"Unsupported observed-disaster source: {source}")

    now = _now_iso()
    previous = _read_source_state(source)
    enabled = _enabled(source)
    budget = reserve_provider_budget if reserve_provider_budget is not None else _default_budget_callback()
    request_id = f"observed:{source}:{uuid.uuid4()}"

    if not enabled or budget is None:
        status = "disabled" if not enabled else "budget_unavailable"
        state = dict(previous or {})
        state.update({
            "schema_version": SCHEMA_VERSION,
            "source": source,
            "status": status,
            "updated_at": now,
            "last_success_at": (previous or {}).get("last_success_at"),
            "last_success_status": (previous or {}).get("last_success_status"),
            "stale": True,
            "attribution": SOURCE_METADATA[source]["attribution"],
            "source_url": SOURCE_METADATA[source]["source_url"],
            "items": (previous or {}).get("items", []),
            "item_count": len((previous or {}).get("items", [])),
        })
        _store_source_state(source, state)
        return state

    callback = lambda requested_source, units=1, request_id=None: _reserve_callback(
        budget, requested_source, units=units, request_id=request_id
    )
    try:
        if source == "bmkg_cap":
            raw = await BMKGCAPAdapter(callback).fetch(request_id)
        elif source == "petabencana":
            raw = await PetaBencanaAdapter(callback).fetch(request_id)
        elif source == "gdacs":
            raw = await fetch_gdacs(request_id)
        elif source == "glofas":
            raw = await fetch_glofas(request_id)
        else:
            adapter = BNPBAdapter(callback)
            adapter.deduplicate = False
            raw = await adapter.fetch()
            if raw.get("status") in SUCCESS_STATUSES:
                raw["items"] = await adapter.parse(raw)
    except Exception as exc:
        logger.warning("Observed-disaster refresh failed for %s: %s", source, exc, exc_info=True)
        raw = {"status": "unavailable", "items": []}

    source_status = str(raw.get("status") or "unavailable") if isinstance(raw, dict) else "unavailable"
    if source_status not in SUCCESS_STATUSES:
        # Preserve the last successful item slice while publishing degraded state.
        state = dict(previous or {})
        state.update({
            "schema_version": SCHEMA_VERSION,
            "source": source,
            "status": "degraded",
            "updated_at": now,
            "last_success_at": (previous or {}).get("last_success_at"),
            "last_success_status": (previous or {}).get("last_success_status"),
            "stale": True,
            "error_status": source_status,
            "attribution": SOURCE_METADATA[source]["attribution"],
            "source_url": SOURCE_METADATA[source]["source_url"],
            "items": (previous or {}).get("items", []),
            "item_count": len((previous or {}).get("items", [])),
        })
        _store_source_state(source, state)
        return state

    items = _normalise_events(source, raw)
    state = {
        "schema_version": SCHEMA_VERSION,
        "source": source,
        "status": "ok",
        "updated_at": now,
        "last_success_at": now,
        "last_success_status": source_status,
        "stale": False,
        "attribution": SOURCE_METADATA[source]["attribution"],
        "source_url": SOURCE_METADATA[source]["source_url"],
        "item_count": len(items),
        "items": items,
    }
    _store_source_state(source, state)
    return state


def read_observed_disasters() -> dict[str, Any]:
    """Return only the shared cached snapshot; this function never performs GETs."""
    snapshot = _cache_read(OBSERVED_SNAPSHOT_KEY)
    if snapshot and (snapshot.get("disaster_reports") or snapshot.get("official_warnings")):
        return snapshot
    snapshot = _assemble_snapshot()
    _cache_write(OBSERVED_SNAPSHOT_KEY, snapshot)
    return snapshot
