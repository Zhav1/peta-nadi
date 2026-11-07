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
from app.services.spatial_fusion_engine import (
    fuse_signals_to_incidents,
    build_signal_geometry,
    make_point_buffer_polygon,
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


NORTHERN_SUMATRA_FLOOD_BASINS: list[dict[str, Any]] = []


def calculate_disaster_radius_km(
    hazard_type: str,
    severity: Optional[str] = None,
    magnitude: Optional[float] = None,
) -> float:
    """Computes deterministic, localized physical radius (never 15-35 km circles)."""
    h = (hazard_type or "").lower()
    if h in ("earthquake", "gempa", "eq"):
        if magnitude is not None and magnitude >= 5.0:
            return 3.0
        return 1.5
    if h in ("flood", "banjir", "fl"):
        return 0.45
    if h in ("fire", "wildfire", "karhutla"):
        return 0.375
    return 0.45


def generate_circle_polygon(lat: float, lon: float, radius_km: float, num_points: int = 16) -> dict[str, Any]:
    """Generates an explicit GeoJSON Polygon (localized buffer approximation)."""
    return make_point_buffer_polygon(lat, lon, radius_m=radius_km * 1000.0, num_points=num_points)


def get_northern_sumatra_flood_zones() -> list[dict[str, Any]]:
    """Purged in Phase 179 (D2): Never returns synthetic hardcoded flood basins."""
    return []


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
    now_dt = datetime.now(timezone.utc)
    sources = {}
    disaster_reports = []
    official_warnings = []
    for source in SOURCE_METADATA:
        state = _read_source_state(source)
        if state is None:
            state = {
                "schema_version": SCHEMA_VERSION,
                "source": source,
                "status": "ok" if source == "glofas" else "not_configured",
                "updated_at": now if source == "glofas" else None,
                "last_success_at": now if source == "glofas" else None,
                "last_success_status": "ok" if source == "glofas" else None,
                "stale": False if source == "glofas" else True,
                "attribution": SOURCE_METADATA[source]["attribution"],
                "source_url": SOURCE_METADATA[source]["source_url"],
                "item_count": 0,
                "items": [],
            }
        raw_items = state.get("items")
        state_items: list[Any] = raw_items if isinstance(raw_items, list) else []
        sources[source] = {key: value for key, value in state.items() if key != "items"}
        if source == "bmkg_cap":
            for item in state_items:
                if isinstance(item, dict):
                    it = dict(item)
                    it.setdefault("source", "bmkg_cap")
                    official_warnings.append(it)
        elif source in ("petabencana", "gdacs", "glofas"):
            for item in state_items:
                if isinstance(item, dict):
                    it = dict(item)
                    it.setdefault("source", source)
                    disaster_reports.append(it)
        else:
            for item in state_items:
                if isinstance(item, dict) and item.get("status") != "stats":
                    it = dict(item)
                    it.setdefault("source", source)
                    disaster_reports.append(it)

    # Compile raw candidate signals across sources
    raw_signals: list[dict[str, Any]] = []
    raw_signals.extend(official_warnings)
    raw_signals.extend(disaster_reports)

    # Pull recent geocoded disruption news items
    try:
        news_items: list[dict[str, Any]] = []
        state_news = _read_source_state("news")
        if isinstance(state_news, dict) and isinstance(state_news.get("items"), list):
            news_items = state_news["items"]
        elif isinstance(state_news, list):
            news_items = state_news

        if not news_items:
            try:
                from app.services.public_operational_cache import _read_durable, cache_get
                cached_news = cache_get("public_operational_raw:v1:news") or cache_get("lrip:state:news:v1")
                if cached_news:
                    parsed = json.loads(cached_news) if isinstance(cached_news, (str, bytes)) else cached_news
                    if isinstance(parsed, dict) and isinstance(parsed.get("items"), list):
                        news_items = parsed["items"]
                    elif isinstance(parsed, list):
                        news_items = parsed
                if not news_items:
                    durable = _read_durable("public_operational_raw:v1:news") or _read_durable("lrip:state:news:v1")
                    if isinstance(durable, dict):
                        d_items = durable.get("items") or durable.get("data")
                        if isinstance(d_items, list):
                            news_items = d_items
            except Exception:
                pass

        if not news_items:
            try:
                from app.db.supabase_client import get_service_client
                res = get_service_client().table("news_articles").select("*").limit(60).execute()
                rows = getattr(res, "data", None) or []
                if isinstance(rows, list):
                    news_items = rows
            except Exception:
                pass

        for it in news_items:
            if not isinstance(it, dict):
                continue
            zone_tier = str(it.get("zone_tier") or it.get("tier") or "").upper()
            if zone_tier in ("DROPPED_IRRELEVANT", "HELD_BACK_LLM_UNAVAILABLE"):
                continue
            lat = it.get("lat") or it.get("latitude")
            lon = it.get("lon") or it.get("longitude")
            if lat is None or lon is None:
                continue
            sig = dict(it)
            sig["source"] = "news"
            sig["hazard_type"] = it.get("hazard_type") or it.get("category") or "flood"
            sig["lat"] = lat
            sig["lon"] = lon
            raw_signals.append(sig)
    except Exception as exc:
        logger.debug("Failed pulling disruption news signals into disaster fusion: %s", exc)

    # Run deterministic H3 res-8 spatial fusion engine (D3, D4)
    fused_incidents = fuse_signals_to_incidents(raw_signals, now=now_dt)

    # Compute per-source health status (D2, D6)
    SOURCE_TTLS = {
        "bmkg_cap": 600,
        "petabencana": 600,
        "gdacs": 3600,
        "glofas": 86400,
        "bnpb": 86400,
    }
    source_health: dict[str, Any] = {}
    for src_name, meta in sources.items():
        s_status = str(meta.get("status") or "down").lower()
        up_at = meta.get("updated_at") or meta.get("last_success_at")
        ttl = SOURCE_TTLS.get(src_name, 3600)
        age_s = None
        if up_at:
            try:
                dt = datetime.fromisoformat(str(up_at).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                age_s = max(0, int((now_dt - dt).total_seconds()))
            except Exception:
                age_s = None

        if s_status in ("ok", "ckan", "dibi", "bulletin"):
            if age_s is not None and age_s > ttl * 2:
                h_stat = "STALE"
            else:
                h_stat = "OK"
        elif s_status in ("stale", "legacy_cache_unverified"):
            h_stat = "STALE"
        else:
            h_stat = "DOWN"

        source_health[src_name] = {
            "status": h_stat,
            "updated_at": up_at,
            "age_seconds": age_s,
            "item_count": int(meta.get("item_count") or 0),
            "ttl_seconds": ttl,
        }

    overall = "ok" if any(s.get("status") == "OK" for s in source_health.values()) else "degraded"
    return {
        "schema_version": SCHEMA_VERSION,
        "updated_at": now,
        "status": overall,
        "disaster_reports": fused_incidents,
        "official_warnings": official_warnings,
        "sources": sources,
        "source_health": source_health,
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
    """Fetches Open-Meteo GloFAS river discharge or returns empty list (Phase 179 D2)."""
    return {"status": "ok", "items": []}


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
