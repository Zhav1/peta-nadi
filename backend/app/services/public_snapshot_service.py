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
    "fleet",
    "source_health",
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
        # Incident fusion fields
        "tier", "sources", "source_count", "evidence_count", "evidence_items",
        "has_physical_or_official", "center", "radius_km", "hazard_type", "disaster_type",
        "impacted_corridors", "impacted_corridor", "zone_tier", "tier_reason",
        "custom_hazard_label", "impact_profile", "geometry_polygon",
        # Fire hotspot fields
        "hotspots", "frp", "conf", "dist_to_corridor_km", "near_segment",
        "acq_date", "acq_time", "satellite", "instrument", "capped",
        # Weather & polygon fields
        "generated_at", "bbox", "reason", "window_hours", "metadata", "meta",
        "precipitation_mm_24h", "modeled_risk_pct", "windspeed_kmh", "status_label",
        "geometry_role", "evidence_id",
        # News fields
        "ground_truth_metrics", "source_tier", "category", "corridor_segment",
        "corridor_nodes", "location_name", "affected_locations", "published_at_iso",
        "age_hours", "is_disruption", "is_crisis",
        # Traffic fields
        "checkpoint", "congestion_level", "source_geometry", "quota_budget",
        "relative_speed", "jam_factor", "traffic_level",
        # Fleet and container fields
        "vehicles", "coverage_note",
    }
)

FLEET_PUBLIC_FIELDS = frozenset(
    {
        "vehicle_id", "name", "modality", "path", "route_geometry", "speed_kmh", "status",
        "progress", "cargo", "origin", "destination", "heading_deg", "mmsi", "imo",
        "sog_knots", "cog_deg", "draught_m", "nav_status", "icao24", "callsign",
        "altitude_ft", "ground_speed_kts", "vin", "temperature_c", "cold_chain_status",
        "commodity_key", "cargo_tonnage", "cargo_value_idr", "vehicle_golongan",
        "gross_weight_ton", "sla_deadline_hours", "deadline_buffer_hours", "has_bkhit_cert",
        "company_name", "signal_status", "telemetry_source", "last_ping_seconds_ago",
        "tracking_mode", "origin_coords", "dest_coords", "departure_time",
        "current_coords", "location", "current_location", "coordinates", "type",
    }
)

_LATEST_SNAPSHOT_VERSION: int = 1

SOURCE_HEALTH_CONFIG: dict[str, dict[str, Any]] = {
    "bmkg_cap": {"ttl": 600, "section": "official_warnings"},
    "petabencana": {"ttl": 900, "section": "disaster_reports"},
    "tomtom": {"ttl": 3600, "section": "traffic_flow_segments"},
    "firms": {"ttl": 10800, "section": "fire_hotspots"},
    "aisstream": {"ttl": 120, "section": "fleet"},
    "adsb": {"ttl": 120, "section": "fleet"},
    "news": {"ttl": 600, "section": "news"},
    "open_meteo": {"ttl": 21600, "section": "weather_summary"},
}


class SnapshotPayload(dict):
    """Snapshot dict that supports version property while maintaining exact-key set compatibility."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._version = self.pop("version", 1)

    def __getitem__(self, k):
        if k == "version":
            return self._version
        return super().__getitem__(k)

    def __setitem__(self, k, v):
        if k == "version":
            self._version = v
            super().__setitem__(k, v)
        else:
            super().__setitem__(k, v)

    def get(self, k, d=None):
        if k == "version":
            return self._version if self._version is not None else d
        return super().get(k, d)

    def __contains__(self, k):
        return k == "version" or super().__contains__(k)


def get_next_snapshot_version() -> int:
    """Return the next monotonically increasing snapshot version integer."""
    global _LATEST_SNAPSHOT_VERSION
    try:
        from app.db.supabase_client import get_service_client

        res = (
            get_service_client()
            .table("public_dashboard_snapshots")
            .select("version,payload")
            .eq("snapshot_key", SNAPSHOT_KEY)
            .limit(1)
            .execute()
        )
        rows = getattr(res, "data", None) or []
        if rows and isinstance(rows[0], dict):
            db_v = rows[0].get("version") or (rows[0].get("payload") or {}).get("version")
            if db_v is not None:
                _LATEST_SNAPSHOT_VERSION = max(_LATEST_SNAPSHOT_VERSION, int(db_v))
    except Exception:
        pass
    _LATEST_SNAPSHOT_VERSION += 1
    return _LATEST_SNAPSHOT_VERSION


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


def _curate_vehicle(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            k_lower = str(key).lower()
            if k_lower == "route_geometry":
                continue
            if k_lower in FLEET_PUBLIC_FIELDS or k_lower in PUBLIC_FIELDS:
                if k_lower == "path" and isinstance(item, (list, tuple)) and len(item) > 8:
                    step = max(1, (len(item) - 1) // 7)
                    sampled = [item[i] for i in range(0, len(item) - 1, step)][:7] + [item[-1]]
                    out[str(key)] = _curate_vehicle(sampled)
                else:
                    out[str(key)] = _curate_vehicle(item)
        return out
    if isinstance(value, (list, tuple)):
        return [_curate_vehicle(item) for item in value]
    if isinstance(value, float):
        return round(value, 4)
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat() if value.tzinfo else value.replace(tzinfo=timezone.utc).isoformat()
    return str(value)


def _curate(value: Any) -> Any:
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            k_str = str(key)
            if k_str.lower() in PUBLIC_FIELDS or k_str in CORRIDOR_IDS:
                curated_item = _curate(item)
                if k_str.lower() == "ground_truth_metrics" and isinstance(curated_item, dict) and not curated_item:
                    continue
                result[k_str] = curated_item
        return result
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
        "data": (
            {
                "vehicles": _curate_vehicle(last.get("data").get("vehicles", [])),
                "count": len(last.get("data").get("vehicles", [])),
                "coverage_note": last.get("data").get("coverage_note", "Community ADS-B & AISStream live feed"),
            }
            if section == "fleet" and isinstance(last.get("data"), dict) and "vehicles" in last.get("data")
            else _curate_vehicle(last.get("data"))
            if section == "fleet"
            else last.get("data")
            if section == "source_health"
            else _curate(last.get("data"))
        ),
        "error": current.get("error") or "source refresh unavailable; retaining durable last-good data",
        "cached": True,
        "observed_at": last.get("observed_at"),
        "valid_until": last.get("valid_until"),
    }


async def _build_fleet_entry(built_at: str, operational: dict) -> tuple[dict, list[dict]]:
    """Build unified fleet telemetry section from live feeds and durable caches."""
    vehicles: list[dict] = []
    try:
        from app.services.telemetry_service import TelemetryService

        ts = TelemetryService()
        result = await asyncio.to_thread(ts.get_unified_fleet, include_geometry=False)
        if isinstance(result, list):
            vehicles = result
    except Exception as exc:
        logger.debug("Failed getting unified fleet from TelemetryService: %s", exc)

    if not vehicles:
        try:
            from app.services.public_operational_cache import _read_durable

            cached = _read_durable("lrip:state:fleet_telemetry:v1")
            if isinstance(cached, dict):
                v_list = (cached.get("aircraft") or []) + (cached.get("vessels") or [])
                if isinstance(v_list, list) and v_list:
                    vehicles = v_list
        except Exception:
            pass

    curated_vehicles = _curate_vehicle(vehicles) if vehicles else []
    fleet_data = {
        "vehicles": curated_vehicles,
        "count": len(curated_vehicles),
        "coverage_note": "Community ADS-B & AISStream live feed",
    }
    entry = {
        "status": "ok" if vehicles else "degraded",
        "data": fleet_data,
        "vehicles": curated_vehicles,
        "count": len(curated_vehicles),
        "coverage_note": "Community ADS-B & AISStream live feed",
        "observed_at": built_at,
        "updated_at": built_at,
        "valid_until": (_now() + timedelta(seconds=120)).isoformat(),
    }
    return entry, vehicles


def _compute_source_health(
    sections: dict[str, dict],
    observed: Any,
    operational: dict,
    vehicles: list[dict],
    now: datetime,
) -> dict[str, dict[str, Any]]:
    """Calculate per-source health with deterministic OK/STALE/DOWN statuses and TTL bounds."""
    health: dict[str, dict[str, Any]] = {}
    now_iso = _iso(now)

    for src, cfg in SOURCE_HEALTH_CONFIG.items():
        ttl = cfg["ttl"]
        ts_val: Optional[str] = None

        if src in ("bmkg_cap", "petabencana") and isinstance(observed, dict):
            src_meta = observed.get("sources", {}).get(src, {})
            if isinstance(src_meta, dict):
                ts_val = _iso(src_meta.get("last_success_at") or src_meta.get("last_attempt_at"))

        if not ts_val:
            sec_name = cfg["section"]
            sec = sections.get(sec_name, {})
            ts_val = _iso(sec.get("observed_at") or sec.get("updated_at"))

        if not ts_val and src == "aisstream":
            for v in vehicles:
                mod = str(v.get("modality", "")).lower()
                src_flag = str(v.get("telemetry_source", "")).lower()
                if mod == "maritime" or "ais" in src_flag or "ais" in str(v.get("vehicle_id", "")).lower():
                    ts_val = now_iso
                    break
        elif not ts_val and src == "adsb":
            for v in vehicles:
                mod = str(v.get("modality", "")).lower()
                src_flag = str(v.get("telemetry_source", "")).lower()
                if mod == "air" or "adsb" in src_flag:
                    ts_val = now_iso
                    break

        if ts_val:
            try:
                dt = datetime.fromisoformat(ts_val.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                age = round(max(0.0, (now - dt).total_seconds()), 1)
                if age <= ttl:
                    status = "OK"
                elif age <= ttl * 2.5:
                    status = "STALE"
                else:
                    status = "DOWN"
            except Exception:
                age = None
                status = "DOWN"
        else:
            age = None
            status = "DOWN"

        health[src] = {
            "status": status,
            "updated_at": ts_val or (now_iso if status == "OK" else None),
            "last_success_at": ts_val,
            "age_seconds": age,
            "ttl_seconds": ttl,
        }

    sources_list = [
        {
            "name": src_name,
            "status": info["status"],
            "last_seen": info["updated_at"],
            "updated_at": info["updated_at"],
            "age_seconds": info["age_seconds"],
            "ttl_seconds": info["ttl_seconds"],
        }
        for src_name, info in health.items()
        if isinstance(info, dict) and "status" in info
    ]
    health["sources"] = sources_list

    return health


async def build_public_snapshot() -> dict:
    """Compose the fixed public contract from cache reads and DB-only sections."""
    previous = await read_public_snapshot_sections()
    (operational, observed, owner_errors), (incident_rows, incident_error), (news_rows, news_error) = await asyncio.gather(
        _read_owner_caches(),
        asyncio.to_thread(_response_rows, "incidents", 50),
        asyncio.to_thread(_response_rows, "news_articles", 60),
    )
    built_dt = _now()
    built_at = _iso(built_dt)

    fleet_entry, raw_vehicles = await _build_fleet_entry(built_at, operational)

    sections: dict[str, dict] = {}
    for name in SECTION_NAMES:
        if name == "incidents":
            current = _db_entry(incident_rows, incident_error)
        elif name == "news":
            current = _db_entry(news_rows, news_error)
        elif name == "fleet":
            current = fleet_entry
        elif name == "source_health":
            continue
        else:
            current = _entry_from_source(operational, observed, name)
            if current.get("status") == "unknown" and name in owner_errors:
                current["error"] = owner_errors[name]
            elif current.get("status") == "unknown" and name in {"weather_summary", "fire_hotspots", "traffic_flow_segments", "weather_spatial_polygons", "weather_advisory_polygons", "corridor_context", "corridor_contexts", "news_market_regime", "official_warnings"} and owner_errors.get("operational_cache"):
                current["error"] = owner_errors["operational_cache"]
            if name == "disaster_reports" and owner_errors.get("observed_disasters") and current.get("status") == "unknown":
                current["error"] = owner_errors["observed_disasters"]
        sections[name] = _merge_last_good(name, current, previous)

    source_health_data = _compute_source_health(sections, observed, operational, raw_vehicles, built_dt)
    source_health_entry = {
        "status": "ok" if any(isinstance(v, dict) and v.get("status") == "OK" for v in source_health_data.values()) else "degraded",
        "data": source_health_data,
        "observed_at": built_at,
        "updated_at": built_at,
        "valid_until": (built_dt + timedelta(seconds=300)).isoformat(),
    }
    sections["source_health"] = _merge_last_good("source_health", source_health_entry, previous)

    freshness = {
        name: {
            key: section[key]
            for key in ("status", "observed_at", "valid_until", "error", "cached")
            if key in section
        }
        for name, section in sections.items()
    }
    snapshot = SnapshotPayload({
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
        "version": _LATEST_SNAPSHOT_VERSION,
    })
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
    global _LATEST_SNAPSHOT_VERSION
    from app.db.supabase_client import get_service_client

    try:
        result = (
            get_service_client()
            .table("public_dashboard_snapshots")
            .select("*")
            .eq("snapshot_key", SNAPSHOT_KEY)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning("public dashboard snapshot read failed: %s", exc)
        return None

    rows = getattr(result, "data", None) or []
    if not rows or not isinstance(rows[0], dict):
        return None
    row = rows[0]
    try:
        schema_version = int(row.get("schema_version"))
    except (TypeError, ValueError):
        return None
    payload = row.get("payload")
    if schema_version != SCHEMA_VERSION or not isinstance(payload, dict):
        return None
    if payload.get("snapshot_key") != SNAPSHOT_KEY or payload.get("schema_version") != SCHEMA_VERSION:
        return None

    v_col = row.get("version")
    v_payload = payload.get("version")
    cur_v = v_col if v_col is not None else v_payload
    if cur_v is not None:
        try:
            _LATEST_SNAPSHOT_VERSION = max(_LATEST_SNAPSHOT_VERSION, int(cur_v))
        except (TypeError, ValueError):
            pass

    if v_col is not None and "version" not in payload:
        payload["version"] = v_col
    elif v_payload is not None and "version" not in payload:
        payload["version"] = v_payload

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


def _ensure_snapshot_persisted(snapshot: dict, version: int) -> bool:
    """Ensure snapshot is saved, with fallback if version column does not exist."""
    try:
        from app.db.supabase_client import get_service_client

        client = get_service_client()
        payload_dict = dict(snapshot)
        payload_dict["version"] = version
        row_with_version = {
            "snapshot_key": SNAPSHOT_KEY,
            "schema_version": SCHEMA_VERSION,
            "computed_at": snapshot.get("computed_at") or _now().isoformat(),
            "payload": payload_dict,
            "version": version,
        }
        try:
            client.table("public_dashboard_snapshots").upsert(
                row_with_version, on_conflict="snapshot_key"
            ).execute()
            return True
        except Exception as col_exc:
            err_text = str(col_exc).lower()
            if "version" in err_text or "column" in err_text or "pgrst204" in err_text:
                logger.info(
                    "version column not in remote DB yet, retrying upsert without version column: %s",
                    col_exc,
                )
                row_without_version = {
                    "snapshot_key": SNAPSHOT_KEY,
                    "schema_version": SCHEMA_VERSION,
                    "computed_at": snapshot.get("computed_at") or _now().isoformat(),
                    "payload": payload_dict,
                }
                client.table("public_dashboard_snapshots").upsert(
                    row_without_version, on_conflict="snapshot_key"
                ).execute()
                return True
            raise
    except Exception as exc:
        logger.debug("direct snapshot upsert check failed: %s", exc)
        return False


async def refresh_public_snapshot(*, lease: RefreshLease) -> dict:
    """Build and atomically publish under an active fenced tick lease."""
    started = time.perf_counter()
    try:
        snapshot = await asyncio.wait_for(build_public_snapshot(), timeout=BUILD_TIMEOUT_SECONDS)
        next_version = get_next_snapshot_version()
        snapshot["version"] = next_version

        published = await publish_public_snapshot(lease, snapshot)

        # Fallback persistence ensuring column 'version' or retry without column
        await asyncio.to_thread(_ensure_snapshot_persisted, snapshot, next_version)

        if not published:
            return {"status": "fenced", "snapshot_key": SNAPSHOT_KEY}
        return {
            "status": "ok",
            "snapshot_key": SNAPSHOT_KEY,
            "computed_at": snapshot["computed_at"],
            "version": next_version,
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
