"""Shared, cached-only public operational read model.

Provider source jobs call ``refresh_public_operational_cache(source=...)``.
HTTP readers call ``read_public_operational_cache`` and never contact providers.
Raw source records are retained independently so the fusion can be recomputed
without losing upstream provenance.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from app.services.redis_client import cache_get, cache_set
from app.services.retention import TOMTOM_VALIDITY_S

logger = logging.getLogger(__name__)

CACHE_TABLE = "public_operational_source_cache"
CACHE_KEY = "public_operational_snapshot:v1"
RAW_KEY_PREFIX = "public_operational_raw:v1:"
SOURCE_TTL_SECONDS = {
    "bmkg": 300,
    "open_meteo": 6 * 60 * 60,
    "firms": 3 * 60 * 60,
    # Validity == the TomTom job cadence (retention.TOMTOM_REFRESH_S). A shorter
    # TTL than cadence makes the section stale by construction, which is exactly
    # what a 600 s TTL behind a 3600 s job did in production.
    "tomtom": TOMTOM_VALIDITY_S,
    "observed_disasters": 30 * 60,
}
SECTION_NAMES = (
    "weather_summary",
    "weather_spatial_polygons",
    "weather_advisory_polygons",
    "fire_hotspots",
    "corridor_context",
    "corridor_contexts",
    "traffic_flow_segments",
    "observed_disasters",
    "tomtom_traffic",
)
VALID_SOURCES = {"bmkg", "open_meteo", "firms", "tomtom", "observed_disasters"}
BudgetReserver = Callable[..., bool | Awaitable[bool]]

# Phase 174: a provider-budget denial must be retried on the NEXT TICK, not
# blocked until UTC midnight. Denials consume no units (compare-and-set RPC), so
# this is only a short hammer guard between the 5-minute scheduler ticks and the
# dashboard's coalesced stale-read refreshes. Cadences are >= 300s, so a job's
# next scheduled tick is never blocked by this backoff.
DENIAL_RETRY_SECONDS = 120
_denial_retry_after: dict[str, float] = {}


def _is_budget_denial(exc: Exception) -> bool:
    return "provider budget" in str(exc).lower()


def _now_monotonic() -> float:
    return time.monotonic()


def _backoff_active(source: str) -> bool:
    deadline = _denial_retry_after.get(source)
    return bool(deadline and _now_monotonic() < deadline)


def _defer_denial(source: str) -> None:
    """Record a short retry_after window; the next scheduler tick is unaffected."""
    _denial_retry_after[source] = _now_monotonic() + DENIAL_RETRY_SECONDS


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _unknown_section(error: str | None = None) -> dict[str, Any]:
    section: dict[str, Any] = {"status": "unknown", "data": None, "cached": False}
    if error:
        section["error"] = error
    return section


def _envelope(
    status: str,
    data: Any,
    *,
    observed_at: str | None = None,
    valid_until: str | None = None,
    error: str | None = None,
    cached: bool = True,
) -> dict[str, Any]:
    value: dict[str, Any] = {"status": status, "data": data, "cached": cached}
    if observed_at:
        value["observed_at"] = observed_at
    if valid_until:
        value["valid_until"] = valid_until
    if error:
        value["error"] = error
    return value


def _read_durable(cache_key: str) -> dict[str, Any] | None:
    """Best-effort service-role fallback; never falls back to an anon writer."""
    try:
        from app.db.supabase_client import get_service_client

        response = (
            get_service_client()
            .table(CACHE_TABLE)
            .select("cache_key,payload,updated_at")
            .eq("cache_key", cache_key)
            .limit(1)
            .execute()
        )
        rows = getattr(response, "data", None) or []
        if not rows or not isinstance(rows[0].get("payload"), dict):
            return None
        return rows[0]["payload"]
    except Exception as exc:
        logger.debug("Operational cache durable read unavailable (%s): %s", cache_key, exc)
        return None


def _write_durable(cache_key: str, payload: dict[str, Any], source: str) -> bool:
    try:
        from app.db.supabase_client import get_service_client

        get_service_client().table(CACHE_TABLE).upsert(
            {
                "cache_key": cache_key,
                "source": source,
                "payload": payload,
                "updated_at": _iso(_now()),
            },
            on_conflict="cache_key",
        ).execute()
        return True
    except Exception as exc:
        logger.debug("Operational cache durable write unavailable (%s): %s", cache_key, exc)
        return False


# Fields that say WHEN the payload's evidence was observed, most specific first.
# A raw source record is stamped ``fetched_at``; the composed snapshot is stamped
# ``computed_at``; both also carry ``observed_at``.
_STAMP_FIELDS = ("fetched_at", "computed_at", "observed_at", "updated_at")


def _payload_stamp(payload: Any) -> datetime | None:
    """Return the evidence clock of a cached payload, or None when it has none."""
    if not isinstance(payload, dict):
        return None
    for field in _STAMP_FIELDS:
        parsed = _parse_time(payload.get(field))
        if parsed is not None:
            return parsed
    return None


def _read_json(
    key: str, *, durable: bool = False, freshest: bool = False
) -> dict[str, Any] | None:
    """Read a cached payload, optionally resolving Redis against the durable row.

    Each worker has its OWN Redis. Only the worker that wins the job lease writes
    a fresh source record to its local Redis; every other worker keeps whatever
    it last saw there. Returning the Redis copy first therefore let a stale local
    cache shadow a fresher durable record forever: the worker recomposed (and
    republished) hour-old evidence while the shared table already held the fresh
    observation. With ``freshest=True`` the two copies are compared on their own
    evidence clock and the newer one wins; Redis stays the fast path and the
    durable row is the tie-breaker/fallback.
    """
    redis_payload: dict[str, Any] | None = None
    try:
        raw = cache_get(key)
        if raw:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                redis_payload = parsed
    except Exception as exc:
        logger.debug("Operational cache Redis read failed (%s): %s", key, exc)
    if not durable:
        return redis_payload
    record = _read_durable(key)
    if record is None:
        return redis_payload
    if redis_payload is None:
        return record
    if freshest:
        local_stamp, shared_stamp = _payload_stamp(redis_payload), _payload_stamp(record)
        if (
            local_stamp is not None
            and shared_stamp is not None
            and shared_stamp > local_stamp
        ):
            return record
    return redis_payload


def _write_json(key: str, payload: dict[str, Any], source: str, ttl: int) -> None:
    try:
        cache_set(key, json.dumps(payload, default=str), ex=ttl)
    except Exception as exc:
        logger.warning("Operational cache Redis write failed (%s): %s", key, exc)
    _write_durable(key, payload, source)


def _read_source_record(source: str) -> dict[str, Any] | None:
    return _read_json(f"{RAW_KEY_PREFIX}{source}", durable=True, freshest=True)


def read_cached_source_observations() -> dict[str, dict[str, Any]]:
    """Return cached raw observations by provider; this function never fetches."""
    return {source: record for source in VALID_SOURCES if (record := _read_source_record(source))}


def read_public_operational_cache() -> dict[str, Any]:
    """Return the latest public sections, with unknown envelopes on a cold miss.

    Reads Redis and the service-role snapshot table only. It never issues a
    provider request or initiates a refresh.
    """
    now = _now()
    cached = _read_json(CACHE_KEY, durable=True, freshest=True)
    sections = cached.get("sections") if isinstance(cached, dict) else None
    output: dict[str, Any] = {}
    for name in SECTION_NAMES:
        section = sections.get(name) if isinstance(sections, dict) else None
        if not isinstance(section, dict) or "status" not in section:
            output[name] = _unknown_section()
            continue
        result = dict(section)
        result["cached"] = True
        valid_until = _parse_time(result.get("valid_until"))
        if result.get("data") is not None and valid_until and valid_until < now:
            if result.get("status") not in ("degraded", "unknown"):
                result["status"] = "stale"
        if result.get("data") is not None and result.get("status") == "stale":
            from app.services.retention import human_age_id

            section_data = result.get("data") or {}
            metadata = section_data.get("metadata") or section_data.get("meta") or {}
            stamp = (
                result.get("observed_at") or section_data.get("generated_at")
                or metadata.get("updated_at") or result.get("valid_until")
            )
            age_seconds = max(0.0, (now - (_parse_time(stamp) or now)).total_seconds())
            stale_reason = f"Data terakhir {human_age_id(age_seconds)} lalu"
            if result.get("error"):
                stale_reason = f"{stale_reason}; {result['error']}"
            result["error"] = stale_reason
        output[name] = result

    if output.get("observed_disasters", {}).get("status") == "unknown":
        try:
            from app.services.observed_disaster_service import read_observed_disasters
            obs = read_observed_disasters()
            output["observed_disasters"] = _envelope(
                obs.get("status", "ok"),
                obs,
                observed_at=obs.get("updated_at"),
                cached=True,
            )
        except Exception as exc:
            logger.debug("Failed populating fallback observed_disasters: %s", exc)

    if output.get("tomtom_traffic", {}).get("status") == "unknown":
        try:
            from app.adapters.tomtom_adapter import get_cached_sumatra_traffic
            traf = get_cached_sumatra_traffic()
            output["tomtom_traffic"] = _envelope(
                traf.get("status", "ok"),
                traf,
                observed_at=traf.get("updated_at"),
                cached=True,
            )
        except Exception as exc:
            logger.debug("Failed populating fallback tomtom_traffic: %s", exc)

    return output


async def _reserve(
    source: str,
    *,
    units: int = 1,
    callback: BudgetReserver | None = None,
) -> bool:
    reserver = callback
    if reserver is None:
        try:
            from app.services.provider_budget import reserve_provider_budget
            reserver = reserve_provider_budget
        except ImportError:
            logger.warning("Provider budget coordinator unavailable; refusing %s request", source)
            return False
    result = reserver(source, units=units, request_id=f"public-cache:{source}:{_iso(_now())}")
    if hasattr(result, "__await__"):
        result = await result
    return result is True


async def _fetch_source(source: str, reserve_provider_budget: BudgetReserver | None) -> dict[str, Any]:
    fetched_at = _now()
    source_status = "ok"
    if source == "bmkg":
        from app.adapters.bmkg_adapter import BMKGAdapter

        adapter = BMKGAdapter()
        raw = await adapter.fetch(reserve_provider_budget=reserve_provider_budget)
        events = await adapter.parse(raw)
    elif source == "open_meteo":
        from app.adapters.open_meteo_adapter import OpenMeteoAdapter

        adapter = OpenMeteoAdapter()
        raw = await adapter.fetch(reserve_provider_budget=reserve_provider_budget)
        if str((raw or {}).get("source") or "").endswith("-sim"):
            raise RuntimeError("Synthetic offline weather is not publishable to the shared operational cache")
        events = await adapter.parse(raw)
        source_status = "partial" if raw.get("observed_point_count", 0) < raw.get("expected_point_count", 0) else "ok"
    elif source == "firms":
        from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter

        adapter = NASAFIRMSAdapter()
        raw = await adapter.fetch(reserve_provider_budget=reserve_provider_budget)
        selected = "nasa-firms-api"
        cross_check_note: str | None = None
        if not raw or not raw.strip():
            # "" = denied / errored / no key — never evidence of zero hotspots;
            # the keyless CSV is the fallback source here, not a cross-check.
            raw = await adapter.fetch_keyless_csv(reserve_provider_budget=reserve_provider_budget)
            selected = "nasa-firms-csv"
        events = (
            await adapter.parse_keyless_csv(raw, 24) if raw and raw.strip() else []
        )
        if selected == "nasa-firms-api" and not events:
            # Phase 173.6/174: a keyed API answering 0 rows (e.g. a header-only
            # CSV before the current UTC day's NRT pass lands) under-reports
            # (50 real in-bbox detections were published as count 0 in prod).
            # The keyless CSV is a MANDATORY cross-check before count: 0.
            cross_raw = await adapter.fetch_keyless_csv(reserve_provider_budget=reserve_provider_budget)
            cross_events = (
                await adapter.parse_keyless_csv(cross_raw, 24)
                if cross_raw and cross_raw.strip()
                else []
            )
            if cross_events:
                raw, events = cross_raw, cross_events
                selected = "nasa-firms-csv"
                cross_check_note = "api empty; csv cross-check"
            else:
                cross_check_note = "api empty; csv cross-check verified empty"
        if not raw or not raw.strip():
            # Denied or errored upstream with no fallback: raise so the composer
            # keeps last-good data with status stale (see the except branch).
            raise RuntimeError("NASA FIRMS returned no usable CSV")
        return {
            "source": source,
            "provider_source": selected,
            "raw": raw,
            "events": events,
            "fetched_at": _iso(fetched_at),
            "observed_at": max((str(e.get("ts")) for e in events if e.get("ts")), default=None),
            "valid_until": _iso(fetched_at + timedelta(seconds=SOURCE_TTL_SECONDS[source])),
            "status": "ok" if events else "empty",
            "error": cross_check_note,
        }
    elif source == "tomtom":
        from app.adapters.tomtom_adapter import TomTomAdapter

        adapter = TomTomAdapter()
        raw = await adapter.fetch(reserve_provider_budget=reserve_provider_budget)
        flow = raw.get("flow") if isinstance(raw, dict) else None
        source_status = "partial" if flow and raw.get("status") != "ok" else "ok" if flow else "degraded"
        return {
            "source": source,
            "raw": raw,
            "events": [],
            "fetched_at": _iso(fetched_at),
            "observed_at": _iso(fetched_at) if flow else None,
            "valid_until": _iso(fetched_at + timedelta(seconds=SOURCE_TTL_SECONDS[source])),
            "status": source_status,
            "error": raw.get("degraded_reason"),
        }
    elif source == "observed_disasters":
        from app.services.observed_disaster_service import refresh_observed_disasters, read_observed_disasters
        try:
            await refresh_observed_disasters("glofas", reserve_provider_budget=reserve_provider_budget)
        except Exception:
            pass
        obs = read_observed_disasters()
        return {
            "source": source,
            "raw": obs,
            "events": obs.get("disaster_reports", []),
            "fetched_at": _iso(fetched_at),
            "observed_at": obs.get("updated_at"),
            "valid_until": _iso(fetched_at + timedelta(seconds=SOURCE_TTL_SECONDS[source])),
            "status": obs.get("status", "ok"),
            "error": None,
        }
    else:
        raise ValueError(f"Unsupported provider source: {source}")

    return {
        "source": source,
        "raw": raw,
        "events": events,
        "fetched_at": _iso(fetched_at),
        "observed_at": _iso(fetched_at),
        "valid_until": _iso(fetched_at + timedelta(seconds=SOURCE_TTL_SECONDS[source])),
        "status": source_status if events or raw else "empty",
        "error": None,
    }


def _section_status(records: dict[str, dict[str, Any]], sources: tuple[str, ...]) -> tuple[str, str | None, str | None, str | None]:
    available = [records.get(source) for source in sources]
    available = [record for record in available if isinstance(record, dict)]
    if not available:
        return "unknown", None, None, "No cached source data"
    newest = max((record.get("fetched_at") or "" for record in available), default=None) or None
    expiries = [record.get("valid_until") for record in available if record.get("valid_until")]
    expiry = max(expiries) if expiries else None
    errors = [str(record.get("error")) for record in available if record.get("error")]
    expired_count = sum(bool((parsed := _parse_time(record.get("valid_until"))) and parsed < _now()) for record in available)
    if expired_count == len(available):
        return "stale", newest, expiry, "; ".join(errors) or "all source data past validity"
    if expired_count:
        return "partial", newest, expiry, "; ".join(errors) or "one or more sources past validity"
    if len(available) < len(sources):
        return "partial", newest, expiry, "; ".join(errors) or "one or more providers have no cached data"
    if errors:
        return "partial", newest, expiry, "; ".join(errors)
    return "ok", newest, expiry, None


def _build_sections(records: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    from app.services.weather_fusion_service import (
        SUMATRA_BBOX,
        WEATHER_SUMMARY_SOURCE,
        count_weather_zones,
        get_cached_fusion_snapshot,
        render_polygon_payload,
    )

    now = _now()
    sections: dict[str, dict[str, Any]] = {name: _unknown_section() for name in SECTION_NAMES}
    snapshot = get_cached_fusion_snapshot(records=records)
    weather_records = {key: records.get(key) for key in ("bmkg", "open_meteo")}
    if snapshot is not None:
        meta = snapshot.get("upstream") or {}
        inventory = count_weather_zones(snapshot)
        generated_at = snapshot.get("generated_at")
        valid_until = snapshot.get("valid_until")
        weather_status, _, weather_valid, weather_error = _section_status(records, ("bmkg", "open_meteo"))
        if weather_status == "unknown":
            weather_status = "ok"
        if meta.get("degraded"):
            weather_status = "degraded"
        elif meta.get("errors") and weather_status == "ok":
            weather_status = "partial"
        if meta.get("expired_sources"):
            expired_note = "sumber kedaluwarsa: " + ", ".join(meta["expired_sources"])
            weather_error = f"{weather_error}; {expired_note}" if weather_error else expired_note
        summary = {
            "bbox": list(SUMATRA_BBOX),
            "generated_at": generated_at,
            "cuaca": {
                "count": inventory["cuaca_total"], "total": inventory["cuaca_total"],
                "status": "ok" if inventory["cuaca_total"] else "empty",
                "reason": None if inventory["cuaca_total"] else "Tidak ada zona aktif",
                "source": WEATHER_SUMMARY_SOURCE, "valid_until": valid_until, "window_hours": 24,
            },
            "waspada": {
                "count": inventory["waspada_total"], "total": inventory["waspada_total"],
                "status": "ok" if inventory["waspada_total"] else "empty",
                "reason": None if inventory["waspada_total"] else "Tidak ada zona aktif",
                "source": WEATHER_SUMMARY_SOURCE, "valid_until": valid_until, "window_hours": 24,
            },
        }
        if meta.get("degraded"):
            for key in ("cuaca", "waspada"):
                summary[key].update({"count": None, "total": None, "status": "degraded", "reason": meta.get("reason")})
        elif meta.get("incomplete") and not inventory["cuaca_total"] and not inventory["waspada_total"]:
            # One weather source could not be verified (expired/excluded), so an
            # empty inventory is "unknown", never a verified zero.
            note = "Sebagian sumber cuaca tidak dapat diverifikasi"
            for key in ("cuaca", "waspada"):
                summary[key].update({"count": None, "total": None, "status": "degraded", "reason": note})
        # observed_at must describe the same evidence as valid_until: the
        # snapshot's own generated_at (oldest contributing fetch), never the
        # newest source fetch. Restamping it from max(fetched_at) is what made a
        # four-day-old validity window look nine minutes old.
        weather_observed = generated_at or _section_status(records, ("bmkg", "open_meteo"))[1]
        high_payload = render_polygon_payload(snapshot, "high", 50.0, 80.0)
        advisory_payload = render_polygon_payload(snapshot, "low", None, None)
        summary_status = weather_status
        if weather_status == "ok" and not inventory["cuaca_total"] and not inventory["waspada_total"]:
            summary_status = "empty"
        high_status = weather_status
        if weather_status == "ok" and not high_payload.get("features"):
            high_status = "empty"
        advisory_status = weather_status
        if weather_status == "ok" and not advisory_payload.get("features"):
            advisory_status = "empty"
        sections["weather_summary"] = _envelope(summary_status, summary, observed_at=weather_observed, valid_until=valid_until or weather_valid, error=weather_error)
        sections["weather_spatial_polygons"] = _envelope(
            high_status, high_payload,
            observed_at=weather_observed, valid_until=valid_until or weather_valid, error=weather_error,
        )
        sections["weather_advisory_polygons"] = _envelope(
            advisory_status, advisory_payload,
            observed_at=weather_observed, valid_until=valid_until or weather_valid, error=weather_error,
        )
    else:
        status, observed, expiry, error = _section_status(records, ("bmkg", "open_meteo"))
        if status != "unknown":
            for name in ("weather_summary", "weather_spatial_polygons", "weather_advisory_polygons"):
                sections[name] = _envelope("degraded" if status == "degraded" else status, None, observed_at=observed, valid_until=expiry, error=error)

    firms = records.get("firms")
    if isinstance(firms, dict):
        hotspots = firms.get("events") or []
        firm_status = firms.get("status", "unknown")
        if not hotspots and firm_status not in ("ok", "empty"):
            # Denied / errored / degraded upstream with no cached points: the
            # true count is unknown — publish null, never a fabricated 0
            # (production published {"count": 0, source nasa-firms-api} for
            # hours off a denied upstream, Phase 174).
            count = total = None
        else:
            count = total = len(hotspots)
        sections["fire_hotspots"] = _envelope(
            firm_status,
            {"hotspots": hotspots, "count": count, "total": total, "capped": False,
             "source": firms.get("provider_source", "nasa-firms-csv"), "window_hours": 24,
             "updated_at": firms.get("observed_at") or firms.get("fetched_at")},
            observed_at=firms.get("observed_at"), valid_until=firms.get("valid_until"), error=firms.get("error"),
        )

    traffic_record = records.get("tomtom")
    traffic_raw = traffic_record.get("raw") if isinstance(traffic_record, dict) else None
    if isinstance(traffic_raw, dict):
        flow = traffic_raw.get("flow") or []
        expected = int(traffic_raw.get("expected_checkpoint_count") or len(getattr(__import__("app.adapters.tomtom_adapter", fromlist=["TomTomAdapter"]).TomTomAdapter, "CHECKPOINTS", [])))
        observed = len(flow)
        segments = []
        for item in flow:
            seg = item.get("flowSegmentData") or {}
            curr, free = seg.get("currentSpeed"), seg.get("freeFlowSpeed")
            if curr is None or free is None:
                continue
            try:
                score = max(0.0, 1.0 - float(curr) / float(free)) if float(free) > 0 else None
            except (TypeError, ValueError):
                score = None
            source_geometry = seg.get("coordinates") or item.get("geometry")
            geometry = None
            if (
                isinstance(source_geometry, dict)
                and source_geometry.get("type") in ("LineString", "MultiLineString")
                and isinstance(source_geometry.get("coordinates"), list)
            ):
                geometry = source_geometry
            elif isinstance(source_geometry, dict):
                coordinates = source_geometry.get("coordinate") or source_geometry.get("coordinates")
                if isinstance(coordinates, list):
                    line = []
                    for point in coordinates:
                        if isinstance(point, dict) and point.get("longitude") is not None and point.get("latitude") is not None:
                            line.append([point["longitude"], point["latitude"]])
                        elif isinstance(point, (list, tuple)) and len(point) >= 2:
                            line.append([point[0], point[1]])
                    if len(line) >= 2:
                        geometry = {"type": "LineString", "coordinates": line}
            segments.append({
                "checkpoint": item.get("_checkpoint_name"), "lat": item.get("_lat"), "lon": item.get("_lon"),
                "current_speed_kmh": curr, "free_flow_speed_kmh": free,
                "congestion_level": ("heavy" if score is not None and score >= .6 else "moderate" if score is not None and score >= .3 else "low" if score is not None else "unknown"),
                "geometry": geometry, "source_geometry": source_geometry, "source": "TomTom Traffic Flow",
            })
        status = traffic_record.get("status", "unknown")
        if status == "stale":
            pass
        elif observed < expected and observed > 0:
            status = "partial"
        elif observed == 0:
            status = "degraded"
        data = {
            "segments": segments, "incidents": traffic_raw.get("incidents") or [],
            "total_segments": len(segments), "total_incidents": len(traffic_raw.get("incidents") or []),
            "expected_checkpoint_count": expected, "observed_checkpoint_count": observed,
            "coverage": "partial" if observed < expected else "complete",
            "status": status, "degraded_reason": traffic_record.get("error"),
        }
        sections["traffic_flow_segments"] = _envelope(status, data, observed_at=traffic_record.get("observed_at"), valid_until=traffic_record.get("valid_until"), error=traffic_record.get("error"))

    # Corridor membership is evidence-driven: no latest-row reuse, no seeded values.
    from app.services.corridor_service import CORRIDOR_NAMES, corridor_ids

    contexts: dict[str, dict[str, Any]] = {}
    for corridor_id in corridor_ids():
        contexts[corridor_id] = {
            "corridor_id": corridor_id,
            "corridor_name": CORRIDOR_NAMES[corridor_id],
            "weather": {"status": "unknown", "data": None},
            "traffic": {"status": "unknown", "data": None},
            "data_integrity": {"coverage": "unknown", "verified_sources": []},
        }
    if isinstance(traffic_raw, dict):
        # Exact checkpoint-to-corridor assignments only; unknown checkpoints do not
        # inherit the latest corridor's record. The mapping is owned by the adapter
        # (keyed by checkpoint id AND live display name) — a local copy of the
        # *legacy* names silently matched nothing, so every corridor stayed
        # "unknown" and the section could never refresh.
        from app.adapters.tomtom_adapter import CHECKPOINT_CORRIDOR_MAP

        # The adapter still carries two legacy corridor ids that no consumer
        # knows; fold them onto the canonical corridor set served here.
        corridor_alias = {
            "sumatra_aceh_banda": "sumatra_aceh_malahayati",
            "sumatra_jambi_palembang": "sumatra_sumsel_palembang",
        }
        for item in traffic_raw.get("flow") or []:
            mapped = (
                CHECKPOINT_CORRIDOR_MAP.get(item.get("_checkpoint_id"))
                or CHECKPOINT_CORRIDOR_MAP.get(item.get("_checkpoint_name"))
            )
            corridor_id = corridor_alias.get(mapped, mapped)
            if corridor_id and corridor_id in contexts:
                corridor_traffic = contexts[corridor_id]["traffic"]
                if not isinstance(corridor_traffic.get("data"), list):
                    corridor_traffic["data"] = []
                corridor_traffic["data"].append(item)
                corridor_traffic["status"] = "ok"
                contexts[corridor_id]["data_integrity"]["verified_sources"].append("tomtom")
                contexts[corridor_id]["data_integrity"]["coverage"] = "partial"
    for corridor_id, context in contexts.items():
        if context["traffic"].get("data"):
            context["traffic"] = {
                "status": "stale" if isinstance(traffic_record, dict) and traffic_record.get("status") == "stale" else "ok",
                "data": context["traffic"]["data"],
            }
        else:
            context["traffic"] = {"status": "unknown", "data": None}
    corridor_status = "unknown"
    if isinstance(traffic_record, dict):
        covered = sum(1 for c in contexts.values() if c["traffic"].get("status") == "ok")
        if covered == len(contexts):
            corridor_status = "ok"
        elif covered:
            corridor_status = "partial"
        else:
            corridor_status = "degraded"
    sections["corridor_contexts"] = _envelope(corridor_status, contexts, cached=True)
    default_context = contexts.get("sumatra_belawan_medan")
    sections["corridor_context"] = _envelope(
        default_context.get("traffic", {}).get("status", "unknown") if default_context else "unknown",
        default_context,
        observed_at=traffic_record.get("observed_at") if isinstance(traffic_record, dict) else None,
        valid_until=traffic_record.get("valid_until") if isinstance(traffic_record, dict) else None,
    )

    try:
        from app.services.observed_disaster_service import read_observed_disasters
        disasters = read_observed_disasters()
        sections["observed_disasters"] = _envelope(
            disasters.get("status", "ok"),
            disasters,
            observed_at=disasters.get("updated_at"),
            cached=True,
        )
    except Exception as exc:
        logger.debug("Failed populating sections observed_disasters: %s", exc)

    try:
        from app.adapters.tomtom_adapter import get_cached_sumatra_traffic
        traffic_sumatra = get_cached_sumatra_traffic()
        sections["tomtom_traffic"] = _envelope(
            traffic_sumatra.get("status", "ok"),
            traffic_sumatra,
            observed_at=traffic_sumatra.get("updated_at"),
            cached=True,
        )
    except Exception as exc:
        logger.debug("Failed populating sections tomtom_traffic: %s", exc)

    return sections


async def refresh_public_operational_cache(
    *, source: str | None = None, reserve_provider_budget: BudgetReserver | None = None
) -> dict[str, Any]:
    """Refresh one provider, or recompose from cached raw sources when source=None.

    ``source=None`` is intentionally read-only with respect to providers. Source
    jobs should invoke this once per provider at their own configured cadence.
    """
    if source is not None and source not in VALID_SOURCES:
        raise ValueError(f"source must be one of {sorted(VALID_SOURCES)} or None")
    records = read_cached_source_observations()
    if source is not None and _backoff_active(source):
        # Denial backoff (Phase 174): keep the last-good record and recompose;
        # the next scheduler tick (cadence >= 300s) retries the source.
        logger.debug(
            "Public operational refresh for %s deferred (denial backoff %ds)",
            source,
            DENIAL_RETRY_SECONDS,
        )
    elif source is not None:
        try:
            fresh = await _fetch_source(source, reserve_provider_budget)
            records[source] = fresh
            raw_key = f"{RAW_KEY_PREFIX}{source}"
            _write_json(raw_key, fresh, source, max(SOURCE_TTL_SECONDS[source], 24 * 60 * 60))
        except Exception as exc:
            logger.warning("Public operational source refresh failed (%s): %s", source, exc)
            previous = records.get(source)
            if previous is None:
                records[source] = {
                    "source": source, "raw": None, "events": [], "status": "degraded",
                    "error": str(exc), "fetched_at": _iso(_now()), "valid_until": None,
                }
            else:
                # Keep last-good data verbatim; only status/age error change.
                # A denial is retried on the next tick (short backoff above),
                # never blocked until UTC midnight.
                records[source] = dict(previous, status="stale", error=str(exc))
            # Persist the truthful status. Without this the stale/degraded marker
            # only lives in the composed snapshot and the next read of the raw
            # source resurrects status "ok" — the exact "job says ok while the
            # section is empty" symptom this fix exists to remove.
            _write_json(
                f"{RAW_KEY_PREFIX}{source}",
                records[source],
                source,
                max(SOURCE_TTL_SECONDS[source], 24 * 60 * 60),
            )
            if _is_budget_denial(exc):
                _defer_denial(source)
                if previous is None:
                    # Cold start + denial: surface the failure to the scheduler
                    # so the job's last_status is a truthful error with a 120s
                    # retry_after — never a false "ok" next to an empty cache
                    # (production: firms reported ok while fire_hotspots said
                    # count 0 for hours).
                    raise

    sections = _build_sections(records)
    snapshot = {"version": 1, "updated_at": _iso(_now()), "sections": sections}
    _write_json(CACHE_KEY, snapshot, "composed", 24 * 60 * 60)
    return sections
