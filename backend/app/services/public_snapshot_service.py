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
from app.services.retention import TOMTOM_VALIDITY_S

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
        # Corridor context blocks (public operational evidence, no tenant data)
        "traffic", "data_integrity", "verified_sources", "is_fallback", "fallback_reasons",
        "temperature", "temperature_c", "rainfall_mm", "precipitation_mm", "wind_speed",
        "wind_speed_kmh", "humidity", "weather_code", "current_speed", "current_speed_kmh",
        "free_flow_speed", "free_flow_speed_kmh", "flow_speed_kmh", "delay_minutes",
        "congestion_level_pct", "count", "total", "value", "unit", "status_text",
        "display_name", "source_url", "event_id", "id", "incident_id", "valid_from", "valid_to",
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
        "precipitation_mm_24h", "modeled_risk_pct", "flood_risk_pct", "windspeed_kmh", "status_label",
        "geometry_role", "evidence_id", "delay_hours", "estimated_delay_hours", "advisory_action",
        "affected_modalities", "bmkg_code", "is_forecast", "modeled", "source_clock", "source_observed_at",
        "forecast_valid_at", "source_fields", "fill_color", "stroke_color", "bmkg_source", "nwp_source",
        "corridor_intersect", "observed_vs_forecast", "cuaca_total", "waspada_total", "below_advisory_total",
        "total_regions", "fusion_engine",
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
        "vehicle_id", "name", "modality", "path", "route_geometry", "speed_kmh", "current_speed_kmh", "status",
        "progress", "cargo", "origin", "destination", "heading_deg", "mmsi", "imo",
        "sog_knots", "cog_deg", "draught_m", "nav_status", "icao24", "callsign",
        "altitude_ft", "ground_speed_kts", "vin", "temperature_c", "cold_chain_status",
        "commodity_key", "cargo_tonnage", "cargo_value_idr", "vehicle_golongan",
        "gross_weight_ton", "sla_deadline_hours", "deadline_buffer_hours", "has_bkhit_cert",
        "company_name", "signal_status", "telemetry_source", "last_ping_seconds_ago",
        "tracking_mode", "origin_coords", "dest_coords", "departure_time",
        "current_coords", "location", "current_location", "coordinates", "type",
        "lat", "lon",
    }
)

_LATEST_SNAPSHOT_VERSION: int = 1

SOURCE_HEALTH_CONFIG: dict[str, dict[str, Any]] = {
    "bmkg_cap": {"ttl": 600, "section": "official_warnings"},
    "petabencana": {"ttl": 900, "section": "disaster_reports"},
    "tomtom": {"ttl": TOMTOM_VALIDITY_S, "section": "traffic_flow_segments"},
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
        modality = str(value.get("modality", "")).lower()
        is_vessel = (
            modality == "maritime"
            or "ais" in str(value.get("telemetry_source", "")).lower()
            or str(value.get("vehicle_id", "")).startswith("AIS-")
        )
        if is_vessel:
            # Compact vessel representation: retain only essential situational fields
            # and prune bulky path arrays / ERP metadata to keep fleet payload under ~150 KB.
            lat = value.get("lat")
            lon = value.get("lon")
            if lat is None or lon is None:
                coords = value.get("current_coords")
                if not coords and isinstance(value.get("location"), dict):
                    coords = value.get("location", {}).get("coordinates")
                if not coords and isinstance(value.get("current_location"), dict):
                    coords = value.get("current_location", {}).get("coordinates")
                if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                    lon, lat = coords[0], coords[1]

            speed = value.get("speed_kmh")
            if speed is None and value.get("current_speed_kmh") is not None:
                speed = value.get("current_speed_kmh")
            elif speed is None and value.get("sog_knots") is not None:
                try:
                    speed = round(float(value["sog_knots"]) * 1.852, 1)
                except (ValueError, TypeError):
                    speed = 0.0
            elif speed is not None:
                try:
                    speed = round(float(speed), 1)
                except (ValueError, TypeError):
                    speed = 0.0
            else:
                speed = 0.0

            curr_speed = value.get("current_speed_kmh")
            if curr_speed is None:
                curr_speed = speed
            else:
                try:
                    curr_speed = round(float(curr_speed), 1)
                except (ValueError, TypeError):
                    curr_speed = speed

            heading = value.get("heading_deg")
            if heading is None:
                heading = value.get("cog_deg", value.get("heading", 0.0))
            try:
                heading = round(float(heading), 1)
            except (ValueError, TypeError):
                heading = 0.0

            try:
                lat_val = round(float(lat), 4) if lat is not None else None
            except (ValueError, TypeError):
                lat_val = None
            try:
                lon_val = round(float(lon), 4) if lon is not None else None
            except (ValueError, TypeError):
                lon_val = None

            vid = str(value.get("vehicle_id") or (f"AIS-{value.get('mmsi')}" if value.get("mmsi") else ""))
            name = str(value.get("name") or value.get("ship_name") or vid)
            status = str(value.get("status") or ("anchored" if speed < 1.0 else "moving"))
            tracking_mode = str(value.get("tracking_mode") or "LIVE_GPS")
            signal_status = str(value.get("signal_status") or "AIS_LIVE")
            telemetry_source = str(value.get("telemetry_source") or "AISSTREAM_WS")

            return {
                "vehicle_id": vid,
                "name": name,
                "modality": "maritime",
                "lat": lat_val,
                "lon": lon_val,
                "current_coords": [lon_val, lat_val] if lon_val is not None and lat_val is not None else None,
                "speed_kmh": speed,
                "current_speed_kmh": curr_speed,
                "heading_deg": heading,
                "status": status,
                "tracking_mode": tracking_mode,
                "signal_status": signal_status,
                "telemetry_source": telemetry_source,
            }

        # Non-vessel vehicles: standard curation
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


def _filter_disruption_db_rows(rows: list[dict]) -> list[dict]:
    """Filter out legacy pre-Phase-179 DB rows that fail the logistics disruption prefilter."""
    try:
        from app.nlp.news_extractor import passes_logistics_disruption_prefilter
    except Exception:
        return rows

    filtered: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or row.get("headline") or "").strip()
        summary = str(row.get("summary") or row.get("description") or "").strip()
        if title and not passes_logistics_disruption_prefilter(title, summary):
            continue
        filtered.append(row)
    return filtered


def _normalize_incident_rows(rows: list[dict]) -> list[dict]:
    """Normalize incident rows: ensure 'id' is populated from 'incident_id' (or vice versa),
    and decode PostGIS EWKB hex 'location' into 'lat' and 'lon' if they are None/empty."""
    try:
        from app.routers.incidents import _parse_location_coords, _coerce_coord
    except Exception:
        _parse_location_coords = None
        _coerce_coord = None

    normalized: list[dict] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        item = dict(raw)

        raw_id = item.get("id") or item.get("incident_id")
        if raw_id is not None:
            id_str = str(raw_id)
            if not item.get("id"):
                item["id"] = id_str
            if not item.get("incident_id"):
                item["incident_id"] = id_str

        lat = item.get("lat")
        lon = item.get("lon")
        if _coerce_coord is not None:
            lat = _coerce_coord(lat)
            lon = _coerce_coord(lon)

        if (lat is None or lon is None) and item.get("location") and _parse_location_coords is not None:
            loc_lat, loc_lon = _parse_location_coords(item.get("location"))
            if lat is None and loc_lat is not None:
                lat = loc_lat
            if lon is None and loc_lon is not None:
                lon = loc_lon

        if lat is not None:
            item["lat"] = lat
        if lon is not None:
            item["lon"] = lon

        normalized.append(item)
    return normalized


def _db_entry(rows: list[dict], error: Optional[str]) -> dict:
    if error:
        return {"status": "unavailable", "data": None, "error": error[:240]}
    clean_rows = _filter_disruption_db_rows(rows)
    observed = None
    for row in clean_rows:
        observed = _iso(row.get("observed_at") or row.get("published_at") or row.get("updated_at") or row.get("created_at")) or observed
    return {
        "status": "ok",
        "data": _curate(clean_rows),
        "observed_at": observed or _now().isoformat(),
        "valid_until": (_now() + timedelta(minutes=10)).isoformat(),
    }


def _freshness_stamp(entry: dict) -> Optional[datetime]:
    """Latest moment an entry's data can still be trusted (valid_until, else observed_at)."""
    for key in ("valid_until", "observed_at"):
        normalized = _iso(entry.get(key))
        if normalized:
            try:
                return datetime.fromisoformat(normalized)
            except ValueError:
                continue
    return None


def _merge_last_good(section: str, current: dict, previous: dict) -> dict:
    if current.get("status") in {"ok", "stale"} and current.get("data") is not None:
        return current
    last = previous.get(section)
    if not isinstance(last, dict) or last.get("data") is None:
        result = {"status": current.get("status", "unknown"), "data": None}
        if current.get("error"):
            result["error"] = current["error"]
        return result
    # A degraded/partial refresh that still carries data is FRESHER evidence than
    # the durable row. Preferring the durable row here is what froze sections at
    # their last fully-ok timestamp: every tick merged the days-old row back in,
    # restamping the section with its old observed_at/valid_until forever.
    if current.get("data") is not None:
        current_stamp, last_stamp = _freshness_stamp(current), _freshness_stamp(last)
        if current_stamp is not None and (last_stamp is None or current_stamp > last_stamp):
            return current
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
            else _normalize_incident_rows(_curate(last.get("data")))
            if section == "incidents" and isinstance(last.get("data"), list)
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
        from app.services.telemetry_service import telemetry_service as ts

        if not getattr(ts, "_aircraft_cache", None):
            try:
                await ts.fetch_live_sumatra_aircraft()
            except Exception as air_exc:
                logger.debug("Live ADS-B refresh in snapshot builder skipped: %s", air_exc)

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
            current = _db_entry(_normalize_incident_rows(incident_rows), incident_error)
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


async def refresh_public_snapshot(*, lease: RefreshLease) -> dict:
    """Build and atomically publish under an active fenced tick lease."""
    started = time.perf_counter()
    try:
        snapshot = await asyncio.wait_for(build_public_snapshot(), timeout=BUILD_TIMEOUT_SECONDS)
        next_version = get_next_snapshot_version()
        snapshot["version"] = next_version

        published = await publish_public_snapshot(lease, snapshot)

        # Single writer: the fenced RPC is the only path allowed to persist the
        # snapshot. A direct table upsert would bypass both the lease fence and
        # the per-section freshness guard, letting a worker holding an older
        # observation overwrite fresher section data and the served payload.
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
