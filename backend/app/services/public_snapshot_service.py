"""Curated public Sumatra snapshot built only by scheduled refresh workers.

Public requests call :func:`read_public_snapshot` only. Refreshes read durable
source caches and persisted operational rows; this module never calls providers.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.services.refresh_coordinator import (
    CoordinationUnavailable,
    RefreshLease,
    publish_public_snapshot,
    read_public_snapshot_sections,
)

logger = logging.getLogger(__name__)

SNAPSHOT_KEY = "sumatra_mainland"
SCHEMA_VERSION = 1
STALE_AFTER_SECONDS = 600
READ_TIMEOUT_SECONDS = 1.5
BUILD_TIMEOUT_SECONDS = 20.0
SECTION_NAMES = (
    "incidents",
    "news",
    "news_market_regime",
    "fire_hotspots",
    "weather_summary",
    "weather_spatial_polygons",
    "weather_advisory_polygons",
    "corridor_context",
    "corridor_contexts",
    "traffic_flow_segments",
    "disaster_reports",
    "official_warnings",
)
CORRIDOR_IDS = (
    "sumatra_belawan_medan",
    "sumatra_riau_pekanbaru",
    "sumatra_sumbar_padang",
    "sumatra_sumsel_palembang",
    "sumatra_lampung_bakauheni",
    "sumatra_aceh_malahayati",
)
MAINLAND_SUMATRA_PROVINCES = (
    "Aceh",
    "North Sumatra",
    "West Sumatra",
    "Riau",
    "Jambi",
    "South Sumatra",
    "Bengkulu",
    "Lampung",
)
PROVINCE_ALIASES = {
    "aceh": "Aceh",
    "north sumatra": "North Sumatra",
    "sumatera utara": "North Sumatra",
    "sumatra utara": "North Sumatra",
    "west sumatra": "West Sumatra",
    "sumatera barat": "West Sumatra",
    "sumatra barat": "West Sumatra",
    "riau": "Riau",
    "jambi": "Jambi",
    "south sumatra": "South Sumatra",
    "sumatera selatan": "South Sumatra",
    "sumatra selatan": "South Sumatra",
    "bengkulu": "Bengkulu",
    "lampung": "Lampung",
}

# The projection is intentionally allow-listed. In particular, identifiers and
# fields used by fleet, ERP, profiles, trips, or tenant authorization are absent.
PUBLIC_FIELDS = frozenset(
    {
        "status", "data", "error", "cached", "observed_at", "valid_until",
        "source", "source_name", "source_status", "name", "title", "summary",
        "description", "content", "link", "url", "published_at", "issued_at",
        "updated_at", "created_at", "timestamp", "severity", "priority", "type",
        "event_type", "warning_type", "incident_type", "relevance_tier", "confidence",
        "latitude", "longitude", "lat", "lon", "coordinates", "geometry", "geojson",
        "features", "properties", "polygon", "polygons", "province", "provinces",
        "regency", "city", "district", "location", "region", "scope", "corridor_id",
        "corridor_name", "corridor_context", "corridor_contexts", "direction",
        "items", "reports", "warnings", "segments", "weather", "cuaca", "waspada",
        "temperature", "temperature_c", "rainfall_mm", "precipitation_mm", "wind_speed",
        "wind_speed_kmh", "humidity", "weather_code", "current_speed", "current_speed_kmh",
        "free_flow_speed", "free_flow_speed_kmh", "flow_speed_kmh", "delay_minutes",
        "congestion_level_pct", "count", "total", "value", "unit", "status_text",
        "display_name", "source_url", "event_id", "id", "valid_from", "valid_to",
        "area", "affected_area", "impact", "impact_level", "recommendation",
    }
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _curate(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _curate(item)
            for key, item in value.items()
            if str(key).lower() in PUBLIC_FIELDS or str(key) in CORRIDOR_IDS
        }
    if isinstance(value, (list, tuple)):
        return [_curate(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat() if value.tzinfo else value.replace(tzinfo=timezone.utc).isoformat()
    return str(value)


def _response_rows(table_name: str, limit: int) -> tuple[list[dict], Optional[str]]:
    """Read persisted public-operational rows; never initiate source refreshes."""
    try:
        from app.db.supabase_client import get_service_client

        result = get_service_client().table(table_name).select("*").limit(limit).execute()
        rows = getattr(result, "data", None) or []
        return [row for row in rows if isinstance(row, dict)], None
    except Exception as exc:
        return [], f"{type(exc).__name__}: {exc}"


async def _await_if_needed(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


async def _read_owner_caches() -> tuple[dict, Any, dict[str, str]]:
    """Use source-owner read exports only; imports are optional during rollout."""
    operational: dict = {}
    observed: Any = None
    errors: dict[str, str] = {}
    try:
        from app.services.public_operational_cache import read_public_operational_cache

        value = await _await_if_needed(read_public_operational_cache())
        if isinstance(value, dict):
            operational = value
        else:
            errors["operational_cache"] = "invalid cache response"
    except Exception as exc:
        errors["operational_cache"] = f"{type(exc).__name__}: {exc}"
    try:
        from app.services.observed_disaster_service import read_observed_disasters

        observed = await _await_if_needed(read_observed_disasters())
    except Exception as exc:
        errors["observed_disasters"] = f"{type(exc).__name__}: {exc}"
    return operational, observed, errors


def _cache_sections(cache: dict) -> dict:
    sections = cache.get("sections") if isinstance(cache.get("sections"), dict) else cache
    return sections if isinstance(sections, dict) else {}


def _source_entry(source_sections: dict, names: tuple[str, ...]) -> Optional[dict]:
    for name in names:
        value = source_sections.get(name)
        if isinstance(value, dict):
            return value
    return None


def _normalize_entry(entry: Any, *, observed_default: Optional[str] = None) -> dict:
    if not isinstance(entry, dict):
        return {"status": "unknown", "data": None}
    status = str(entry.get("status") or "unknown").strip().lower()
    if status in {"healthy", "success", "live", "fresh", "empty"}:
        # A successful empty observation (for example, no FIRMS hotspots) is
        # healthy evidence, not the same as a cache miss or unknown source.
        status = "ok"
    if status == "partial":
        status = "degraded"
    if status in {"disabled", "not_configured"}:
        status = "unknown"
    if status == "budget_unavailable":
        status = "degraded"
    if status not in {"ok", "stale", "degraded", "timeout", "unknown", "unavailable"}:
        status = "unknown"
    data = entry.get("data") if "data" in entry else None
    observed = _iso(entry.get("observed_at") or entry.get("last_observed_at") or entry.get("updated_at"))
    valid_until = _iso(entry.get("valid_until"))
    result = {
        "status": status,
        "data": _curate(data),
        "observed_at": observed or observed_default,
        "valid_until": valid_until,
    }
    if entry.get("error"):
        result["error"] = str(entry["error"])[:240]
    return result


def _entry_from_source(cache: dict, observed: Any, section: str) -> dict:
    source_sections = _cache_sections(cache)
    aliases = {
        "fire_hotspots": ("fire_hotspots", "firms", "nasa_firms"),
        "weather_summary": ("weather_summary", "weather", "bmkg", "open_meteo"),
        "weather_spatial_polygons": ("weather_spatial_polygons", "weather_polygons"),
        "weather_advisory_polygons": ("weather_advisory_polygons", "advisory_polygons"),
        "traffic_flow_segments": ("traffic_flow_segments", "tomtom_segments", "tomtom"),
        "corridor_context": ("corridor_context", "default_corridor"),
        "corridor_contexts": ("corridor_contexts", "corridors"),
        "news_market_regime": ("news_market_regime", "market_regime"),
        "official_warnings": ("official_warnings", "bmkg_cap_warnings", "bmkg_cap"),
    }
    entry = _source_entry(source_sections, aliases.get(section, (section,)))
    if section in {"disaster_reports", "official_warnings"}:
        if isinstance(observed, dict):
            data_key = "disaster_reports" if section == "disaster_reports" else "official_warnings"
            raw_data = observed.get(data_key)
            source_meta = observed.get("sources")
            if not isinstance(source_meta, dict):
                source_meta = {}
            successful = [
                source for source in source_meta.values()
                if isinstance(source, dict) and source.get("status") == "ok"
            ]
            latest_observed = max(
                (str(source.get("last_success_at")) for source in successful if source.get("last_success_at")),
                default=None,
            )
            if successful and isinstance(raw_data, list):
                entry = {
                    "status": "ok",
                    "data": raw_data,
                    "observed_at": latest_observed,
                }
            elif isinstance(raw_data, list) and raw_data:
                entry = {"status": "stale", "data": raw_data, "observed_at": latest_observed}
            else:
                entry = {"status": "unknown", "data": None}
        else:
            entry = {"status": "unknown", "data": None}
    if section == "corridor_contexts" and entry:
        raw = entry.get("data") if "data" in entry else entry
        if isinstance(raw, dict) and not ("status" in raw or "data" in raw):
            entry = {"status": entry.get("status", "unknown"), "data": {k: raw[k] for k in CORRIDOR_IDS if k in raw}, "observed_at": entry.get("observed_at"), "valid_until": entry.get("valid_until")}
    if section == "corridor_context" and entry is None:
        contexts = _source_entry(source_sections, aliases["corridor_contexts"])
        contexts_data = contexts.get("data") if isinstance(contexts, dict) else None
        if isinstance(contexts_data, dict):
            entry = contexts_data.get(CORRIDOR_IDS[0])
    return _normalize_entry(entry)


def _db_entry(rows: list[dict], error: Optional[str]) -> dict:
    if error:
        return {"status": "unavailable", "data": None, "error": error[:240]}
    observed = None
    for row in rows:
        observed = _iso(row.get("observed_at") or row.get("published_at") or row.get("updated_at") or row.get("created_at")) or observed
    return {
        "status": "ok",
        "data": _curate(rows),
        "observed_at": observed or _now().isoformat(),
        "valid_until": (_now() + timedelta(minutes=10)).isoformat(),
    }


def _merge_last_good(section: str, current: dict, previous: dict) -> dict:
    if current.get("status") in {"ok", "stale"} and current.get("data") is not None:
        return current
    last = previous.get(section)
    if not isinstance(last, dict) or last.get("data") is None:
        result = {"status": current.get("status", "unknown"), "data": None}
        if current.get("error"):
            result["error"] = current["error"]
        return result
    return {
        "status": "stale",
        "data": _curate(last.get("data")),
        "error": current.get("error") or "source refresh unavailable; retaining durable last-good data",
        "cached": True,
        # Carry the original clocks forward verbatim; a failed refresh must not
        # make old source data appear newly observed.
        "observed_at": last.get("observed_at"),
        "valid_until": last.get("valid_until"),
    }


async def build_public_snapshot() -> dict:
    """Compose the fixed public contract from cache reads and DB-only sections."""
    previous = await read_public_snapshot_sections()
    (operational, observed, owner_errors), (incident_rows, incident_error), (news_rows, news_error) = await asyncio.gather(
        _read_owner_caches(),
        asyncio.to_thread(_response_rows, "incidents", 50),
        asyncio.to_thread(_response_rows, "news_articles", 60),
    )
    built_at = _now().isoformat()

    sections: dict[str, dict] = {}
    for name in SECTION_NAMES:
        if name == "incidents":
            current = _db_entry(incident_rows, incident_error)
        elif name == "news":
            current = _db_entry(news_rows, news_error)
        else:
            current = _entry_from_source(operational, observed, name)
            if current.get("status") == "unknown" and name in owner_errors:
                current["error"] = owner_errors[name]
            elif current.get("status") == "unknown" and name in {"weather_summary", "fire_hotspots", "traffic_flow_segments", "weather_spatial_polygons", "weather_advisory_polygons", "corridor_context", "corridor_contexts", "news_market_regime", "official_warnings"} and owner_errors.get("operational_cache"):
                current["error"] = owner_errors["operational_cache"]
            if name == "disaster_reports" and owner_errors.get("observed_disasters") and current.get("status") == "unknown":
                current["error"] = owner_errors["observed_disasters"]
        sections[name] = _merge_last_good(name, current, previous)

    freshness = {
        name: {
            key: section[key]
            for key in ("status", "observed_at", "valid_until", "error", "cached")
            if key in section
        }
        for name, section in sections.items()
    }
    snapshot = {
        "schema_version": SCHEMA_VERSION,
        "snapshot_key": SNAPSHOT_KEY,
        "computed_at": built_at,
        "stale": any(section.get("status") != "ok" for section in sections.values()),
        "sections": sections,
        "source_freshness": freshness,
        "shadow_mode": True,
        "coverage": {
            "scope": "mainland_sumatra",
            "provinces": list(MAINLAND_SUMATRA_PROVINCES),
            "expected_province_count": len(MAINLAND_SUMATRA_PROVINCES),
            "covered_provinces": sorted(_covered_provinces(sections)),
        },
    }
    return snapshot


def _covered_provinces(sections: dict[str, dict]) -> set[str]:
    covered: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, nested in value.items():
                if str(key).lower() in {"province", "provinces"}:
                    names = nested if isinstance(nested, list) else [nested]
                    for name in names:
                        normalized = " ".join(str(name).strip().lower().split())
                        canonical = PROVINCE_ALIASES.get(normalized)
                        if canonical:
                            covered.add(canonical)
                else:
                    visit(nested)
        elif isinstance(value, (list, tuple)):
            for nested in value:
                visit(nested)

    visit(sections)
    return covered


def _read_public_snapshot_sync() -> Optional[dict]:
    from app.db.supabase_client import get_service_client

    result = (
        get_service_client()
        .table("public_dashboard_snapshots")
        .select("snapshot_key,schema_version,computed_at,payload")
        .eq("snapshot_key", SNAPSHOT_KEY)
        .limit(1)
        .execute()
    )
    rows = getattr(result, "data", None) or []
    if not rows or not isinstance(rows[0], dict):
        return None
    row = rows[0]
    try:
        version = int(row.get("schema_version"))
    except (TypeError, ValueError):
        return None
    payload = row.get("payload")
    if version != SCHEMA_VERSION or not isinstance(payload, dict):
        return None
    if payload.get("snapshot_key") != SNAPSHOT_KEY or payload.get("schema_version") != SCHEMA_VERSION:
        return None
    return payload


async def read_public_snapshot() -> Optional[dict]:
    """Bounded read of the persisted public singleton; never builds or refreshes."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_read_public_snapshot_sync), timeout=READ_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        logger.warning("public dashboard snapshot read exceeded %.1fs", READ_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.warning("public dashboard snapshot read unavailable: %s", exc)
    return None


def empty_public_snapshot(*, error: Optional[str] = None) -> dict:
    sections = {
        name: {
            "status": "unknown",
            "data": None,
            **({"error": error[:240]} if error else {}),
        }
        for name in SECTION_NAMES
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "snapshot_key": SNAPSHOT_KEY,
        "computed_at": None,
        "stale": True,
        "sections": sections,
        "source_freshness": {name: {"status": "unknown"} for name in SECTION_NAMES},
        "shadow_mode": True,
        "coverage": {
            "scope": "mainland_sumatra",
            "provinces": list(MAINLAND_SUMATRA_PROVINCES),
            "expected_province_count": len(MAINLAND_SUMATRA_PROVINCES),
            "covered_provinces": [],
        },
    }


async def refresh_public_snapshot(*, lease: RefreshLease) -> dict:
    """Build and atomically publish under an active fenced tick lease."""
    started = time.perf_counter()
    try:
        snapshot = await asyncio.wait_for(build_public_snapshot(), timeout=BUILD_TIMEOUT_SECONDS)
        published = await publish_public_snapshot(lease, snapshot)
        if not published:
            return {"status": "fenced", "snapshot_key": SNAPSHOT_KEY}
        return {
            "status": "ok",
            "snapshot_key": SNAPSHOT_KEY,
            "computed_at": snapshot["computed_at"],
            "sections": len(snapshot["sections"]),
            "stale": snapshot["stale"],
            "ms": int((time.perf_counter() - started) * 1000),
        }
    except asyncio.CancelledError:
        raise
    except (asyncio.TimeoutError, CoordinationUnavailable, Exception) as exc:
        logger.warning("public snapshot refresh failed: %s", exc)
        return {"status": "error", "error": f"{type(exc).__name__}: {exc}"}


def snapshot_is_stale(snapshot: Optional[dict], *, now: Optional[datetime] = None) -> bool:
    if not isinstance(snapshot, dict):
        return True
    computed = _iso(snapshot.get("computed_at"))
    if computed is None:
        return True
    try:
        age = ((now or _now()) - datetime.fromisoformat(computed)).total_seconds()
    except (TypeError, ValueError):
        return True
    return age > STALE_AFTER_SECONDS or bool(snapshot.get("stale"))
