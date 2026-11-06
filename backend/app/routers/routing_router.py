"""
FastAPI Router for CPU Routing Optimization, Weather Fusion Polygons & TomTom Traffic Flow
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from app.services.weather_fusion_service import (
    get_fused_spatial_weather,
    get_fusion_snapshot,
    render_polygon_payload,
    count_weather_zones,
    SUMATRA_BBOX,
    HAZARD_WINDOW_HOURS,
    WEATHER_SUMMARY_SOURCE,
    MAX_WEATHER_FEATURES,
    compact_polygon_meta,
)
from app.services.retention import (
    WEATHER_REFRESH_S,
    WEATHER_VALIDITY_HOURS,
    WEATHER_STALE_CEILING_HOURS,
    FIRMS_REFRESH_S,
    FIRMS_STALE_CEILING_HOURS,
    human_age_id,
)
from app.services.redis_client import SOURCE_CACHE_PREFIX, cache_get, cache_set
from app.services.sumatra_scope import is_in_sumatra_scope
from app.services.cpu_routing_service import optimize_fleet_routes_cpu, CORRIDOR_JUNCTION_NODES
from app.adapters.cpu_routing_adapter import get_cpu_router
from app.adapters.tomtom_adapter import TomTomAdapter
from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter
from app.auth.supabase_auth import UserSession, get_optional_user
from app.config import get_settings
from app.services.public_operational_cache import read_public_operational_cache
from app.services.hazard_evidence import HAZARD_EVIDENCE_VERSION, normalize_hazard_evidence

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Routing Optimization & Spatial Telemetry"])

_INFLIGHT_REFRESH: Dict[str, asyncio.Task] = {}


def coalesce_background_refresh(key: str, coro_fn) -> Optional[asyncio.Task]:
    """Coalesces concurrent background refresh calls so only 1 task runs per key."""
    task = _INFLIGHT_REFRESH.get(key)
    if task is not None and not task.done():
        return task
    try:
        task = asyncio.create_task(coro_fn())
    except RuntimeError:
        return None

    def _done(t: asyncio.Task, k: str = key) -> None:
        if _INFLIGHT_REFRESH.get(k) is t:
            _INFLIGHT_REFRESH.pop(k, None)

    task.add_done_callback(_done)
    _INFLIGHT_REFRESH[key] = task
    return task

PROOF_FETCH_TIMEOUT_S = 8.0


def _normalize_route_hazards(hazards: Any) -> List[Dict[str, Any]]:
    return [normalize_hazard_evidence(item) for item in hazards or [] if isinstance(item, dict)]


def _downgrade_unverified_clear(value: Any, coverage: str) -> None:
    """Do not publish CLEAR when evidence coverage was not verified complete."""
    if coverage in ("complete", "verified_complete"):
        return
    if isinstance(value, dict):
        if str(value.get("safety_status") or "").upper() == "CLEAR":
            value["safety_status"] = "UNKNOWN"
            value["safety_review_required"] = True
        for child in value.values():
            _downgrade_unverified_clear(child, coverage)
    elif isinstance(value, list):
        for child in value:
            _downgrade_unverified_clear(child, coverage)


async def _fetch_proof_context() -> Dict[str, Any]:
    """Build route proof only from the shared cached operational snapshot."""
    cache = read_public_operational_cache()
    weather_section = cache.get("weather_spatial_polygons") or {}
    traffic_section = cache.get("traffic_flow_segments") or {}
    weather = weather_section.get("data") if isinstance(weather_section, dict) else None
    traffic = traffic_section.get("data") if isinstance(traffic_section, dict) else None
    weather = weather if isinstance(weather, dict) else {"type": "FeatureCollection", "features": []}
    traffic = traffic if isinstance(traffic, dict) else {"segments": [], "incidents": []}
    reasons: List[str] = []
    if weather_section.get("status") not in ("ok", "partial"):
        reasons.append(f"weather_cache_{weather_section.get('status', 'unknown')}")
    if traffic_section.get("status") not in ("ok", "partial"):
        reasons.append(f"traffic_cache_{traffic_section.get('status', 'unknown')}")
    reasons.append("news_context_not_in_public_operational_cache")

    congestion_segments = list(traffic.get("segments") or [])
    hazards = []
    for feature in weather.get("features") or []:
        properties = dict(feature.get("properties") or {})
        geometry = feature.get("geometry")
        hazards.append(normalize_hazard_evidence({
            **properties,
            "incident_id": properties.get("evidence_id"),
            "type": properties.get("hazard_type") or "weather_forecast",
            "source": properties.get("source"),
            "geometry": geometry,
            "is_forecast": properties.get("is_forecast", True),
            "modeled": properties.get("modeled", True),
            "observed_at": properties.get("source_observed_at"),
            "valid_until": properties.get("valid_until"),
            "status": "active",
        }))

    coverage = "unknown"
    return {
        "weather": weather,
        "tomtom_raw": traffic,
        "news_context": [],
        "congestion_segments": congestion_segments,
        "hazard_evidence": hazards,
        "hazard_evidence_version": HAZARD_EVIDENCE_VERSION,
        "hazard_evidence_coverage": coverage,
        "is_fallback": True,
        "fallback_reasons": reasons,
        "speed_source": "tomtom_cached" if congestion_segments else "unknown",
    }


@router.get("/weather/spatial-polygons")
async def fetch_spatial_weather_polygons(
    current_user: UserSession = Depends(get_optional_user),
    min_severity: str = Query(default="high", description="Minimum severity rank: low|medium|high|critical. Default high = disruption-only (BMKG 60/medium excluded). Use medium for full-fidelity advisory."),
    min_precip: float = Query(default=50.0, description="Minimum 24h precipitation mm for disruption gate (OR with min_flood). Use 0 to disable."),
    min_flood: float = Query(default=80.0, description="Minimum flood risk pct for disruption gate (OR with min_precip). Use 0 to disable."),
) -> Dict[str, Any]:
    """
    Returns GeoJSON multi-polygons combining BMKG station warnings + Open-Meteo Global NWP
    spatial weather predictions with data-driven rainfall_mm and flood_risk_pct.
    Read endpoint: optional auth (guest-safe), user attached for telemetry only.

    Whole-Sumatra coverage (Phase 169): every Open-Meteo grid point across the
    full 94,-6,108,6 bbox can produce a zone. MAX_WEATHER_FEATURES is a RENDER
    cap only; the response publishes ``meta.total`` (pre-cap), ``meta.count``
    (returned) and ``meta.capped`` so the UI can say "menampilkan N dari M".

    Stale-while-revalidate (SPEC decision 4): a failed upstream refresh serves
    last-known-good polygons with ``meta.status="stale"`` and the age in
    ``meta.reason``. Only a cold cache is ``degraded`` (emitted as an empty
    FeatureCollection, never a fabricated 0 zone count, never a 500).

    Disruption-only default (min_severity=high, min_precip=50, min_flood=80):
    only high/critical heavy rain that can cause disruptions is returned.
    Advisory path: ?min_severity=medium&min_precip=0&min_flood=0 returns all as before.
    """
    sev, eff_precip, eff_flood = _effective_polygon_filters(min_severity, min_precip, min_flood)
    return await _served_weather_polygons(sev, eff_precip, eff_flood)


def _effective_polygon_filters(
    min_severity: Optional[str],
    min_precip: Optional[float],
    min_flood: Optional[float],
) -> tuple:
    """Map query params to the fusion gate triple (advisory path disables gates)."""
    sev = (min_severity or "high").lower()
    if sev in ("medium", "low", "all"):
        eff_precip = None if min_precip in (None, 0, 50.0) else float(min_precip)
        eff_flood = None if min_flood in (None, 0, 80.0) else float(min_flood)
        return sev, eff_precip, eff_flood
    eff_precip = None if min_precip is None or min_precip == 0 else float(min_precip)
    eff_flood = None if min_flood is None or min_flood == 0 else float(min_flood)
    return sev, eff_precip, eff_flood


def _polygon_cache_key(
    sev: str, eff_precip: Optional[float], eff_flood: Optional[float]
) -> str:
    def _num(value: Optional[float]) -> str:
        return "all" if value is None else f"{float(value):g}"

    return f"{SOURCE_CACHE_PREFIX}weather_polygons:{sev}:{_num(eff_precip)}:{_num(eff_flood)}"


def _age_seconds(stamp: Any, now: Any) -> Optional[float]:
    try:
        parsed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return max(0.0, (now - parsed).total_seconds())
    except Exception:
        return None


def _read_polygon_cache(key: str) -> Optional[Dict[str, Any]]:
    """Shape-validated cache read; a malformed entry is a miss, never a crash."""
    try:
        raw = cache_get(key)
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        payload = parsed.get("payload")
        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            return None
        return parsed
    except Exception as e:
        logger.debug(f"Weather polygon cache read failed: {e}")
        return None


def _write_polygon_cache(key: str, payload: Dict[str, Any], now: Any) -> None:
    try:
        cache_set(
            key,
            json.dumps({"payload": payload, "fetched_at": now.isoformat()}),
            ex=WEATHER_STALE_CEILING_HOURS * 3600,
        )
    except Exception as e:
        logger.debug(f"Weather polygon cache write failed: {e}")


def _carry_meta(payload: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
    updated = dict(payload)
    updated["metadata"] = metadata
    updated["meta"] = compact_polygon_meta(metadata)
    return updated


# ---------------------------------------------------------------------------
# Phase 170: ONE shared fusion snapshot for every weather endpoint.
#
# Before this, /weather/summary and the polygon endpoints each kept their own
# 600 s cache, so a 24 h day cost 2 x (58 pts x 144 polls) = 16,704 metered
# Open-Meteo location-calls against a 10,000/day free ceiling — a guaranteed
# 429 that leaves both layers permanently stale. The snapshot below is keyed by
# the bbox/window ONLY (never by severity/precip/flood) and is the single gate
# in front of the upstream, so the whole day costs 58 x 144 = 8,352 calls.
# Per-filter polygon payloads remain cached, but only as derived renders: a
# derived miss can never reach upstream on its own.
# ---------------------------------------------------------------------------
WEATHER_FUSION_CACHE_KEY = f"{SOURCE_CACHE_PREFIX}weather_fusion"


def _read_fusion_cache() -> Optional[Dict[str, Any]]:
    """Shape-validated read of the shared snapshot (malformed => miss)."""
    try:
        raw = cache_get(WEATHER_FUSION_CACHE_KEY)
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        snapshot = parsed.get("snapshot")
        if not isinstance(snapshot, dict):
            return None
        if not isinstance(snapshot.get("candidates"), list):
            return None
        return parsed
    except Exception as e:
        logger.debug(f"Fusion snapshot cache read failed: {e}")
        return None


def _write_fusion_cache(snapshot: Dict[str, Any], now: Any) -> None:
    try:
        cache_set(
            WEATHER_FUSION_CACHE_KEY,
            json.dumps({"snapshot": snapshot, "fetched_at": now.isoformat()}),
            ex=WEATHER_STALE_CEILING_HOURS * 3600,
        )
    except Exception as e:
        logger.debug(f"Fusion snapshot cache write failed: {e}")


# Single-flight registry for concurrent cold misses, keyed by event loop.
# One upstream call runs; the rest await it via ``asyncio.shield`` so a client
# abort never cancels the shared fetch.
_FUSION_INFLIGHT: Dict[int, asyncio.Task] = {}


def reset_fusion_inflight() -> None:
    """Drop in-flight fusion fetches (used by tests)."""
    for task in list(_FUSION_INFLIGHT.values()):
        try:
            task.cancel()
        except Exception:
            pass
    _FUSION_INFLIGHT.clear()


async def _load_fusion_snapshot() -> tuple:
    """Return ``(snapshot, last_known_good, failure_reason)``.

    ``snapshot`` is present only when it is fresh (served from the shared cache
    inside the refresh window) or was just fetched successfully. Callers that
    get ``None`` MUST NOT fetch again in the same request — the failed upstream
    attempt is already recorded in ``failure_reason``.
    """
    now = datetime.now(timezone.utc)
    cached = _read_fusion_cache()

    if cached is not None:
        age_s = _age_seconds(cached.get("fetched_at"), now)
        if age_s is not None and age_s <= WEATHER_REFRESH_S:
            return cached.get("snapshot"), cached, None

    # Single-flight the upstream fetch: concurrent cold misses share one call.
    try:
        loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        loop_id = 0
    task = _FUSION_INFLIGHT.get(loop_id)
    if task is None or task.done():
        async def _fetch() -> Optional[Dict[str, Any]]:
            return await asyncio.wait_for(
                get_fusion_snapshot(), timeout=WEATHER_SUMMARY_TIMEOUT_S
            )

        task = asyncio.create_task(_fetch())

        def _cleanup(t: asyncio.Task, k: int = loop_id) -> None:
            if _FUSION_INFLIGHT.get(k) is t:
                _FUSION_INFLIGHT.pop(k, None)

        task.add_done_callback(_cleanup)
        _FUSION_INFLIGHT[loop_id] = task

    failure_reason: Optional[str] = None
    snapshot: Optional[Dict[str, Any]] = None
    try:
        snapshot = await asyncio.shield(task)
    except asyncio.CancelledError:
        raise
    except asyncio.TimeoutError:
        failure_reason = f"timeout {WEATHER_SUMMARY_TIMEOUT_S:g}s"
        logger.warning("Shared weather fusion timed out after %ss", WEATHER_SUMMARY_TIMEOUT_S)
    except Exception as e:
        failure_reason = str(e)
        logger.warning(f"Shared weather fusion failed: {e}")

    if snapshot is not None:
        upstream = snapshot.get("upstream") or {}
        if not upstream.get("degraded"):
            _write_fusion_cache(snapshot, now)
            return snapshot, cached, None
        failure_reason = failure_reason or upstream.get("reason")

    return None, cached, failure_reason


def _stale_polygon_from_snapshot(
    snapshot: Dict[str, Any],
    sev: str,
    eff_precip: Optional[float],
    eff_flood: Optional[float],
    now: Any,
    upstream_reason: Optional[str],
) -> Dict[str, Any]:
    """Re-render last-known-good candidates and mark the payload stale."""
    payload = render_polygon_payload(snapshot, sev, eff_precip, eff_flood)
    age_s = _age_seconds(snapshot.get("generated_at"), now)
    if age_s is None:
        age_s = float(WEATHER_STALE_CEILING_HOURS * 3600)
    suffix = upstream_reason or "sumber live tidak tersedia"
    metadata = dict(payload.get("metadata") or {})
    metadata.update(
        {
            "status": "stale",
            "reason": (
                f"Data terakhir {human_age_id(age_s)} lalu "
                f"(valid {WEATHER_VALIDITY_HOURS}j); {suffix}"
            ),
            "updated_at": snapshot.get("generated_at") or metadata.get("updated_at"),
        }
    )
    return _carry_meta(payload, metadata)


def _stale_polygon_payload(
    cached: Dict[str, Any], now: Any, upstream_reason: Optional[str]
) -> Dict[str, Any]:
    """Serve last-known-good polygons, clearly marked stale (features kept)."""
    payload = cached.get("payload") or {}
    features = payload.get("features") or []
    age_s = _age_seconds(cached.get("fetched_at"), now)
    if age_s is None:
        age_s = float(WEATHER_STALE_CEILING_HOURS * 3600)
    suffix = upstream_reason or "sumber live tidak tersedia"
    metadata = dict(payload.get("metadata") or {})
    total = metadata.get("total")
    if not isinstance(total, int) or total < len(features):
        total = len(features)
    metadata.update(
        {
            "status": "stale",
            "reason": (
                f"Data terakhir {human_age_id(age_s)} lalu "
                f"(valid {WEATHER_VALIDITY_HOURS}j); {suffix}"
            ),
            "total": total,
            "count": len(features),
            "capped": bool(total > len(features)),
            "updated_at": cached.get("fetched_at") or metadata.get("updated_at"),
            "validity_hours": WEATHER_VALIDITY_HOURS,
            "stale_ceiling_hours": WEATHER_STALE_CEILING_HOURS,
        }
    )
    return _carry_meta(payload, metadata)


def _degraded_polygon_payload(now: Any, upstream_reason: Optional[str]) -> Dict[str, Any]:
    """Cold-cache outage: no polygons AND no numbers. Unknown is never 0."""
    reason = "Sumber cuaca tidak tersedia"
    if upstream_reason:
        reason = f"{reason}: {upstream_reason}"
    metadata = {
        "fusion_engine": "BMKG published weather forecast + Open-Meteo NWP forecast",
        "timestamp": now.isoformat(),
        "updated_at": now.isoformat(),
        "total": None,
        "count": None,
        "capped": False,
        "total_regions": 0,
        "coverage": "full-sumatra-grid",
        "bbox": list(SUMATRA_BBOX),
        "max_features": MAX_WEATHER_FEATURES,
        "status": "degraded",
        "reason": reason,
        "validity_hours": WEATHER_VALIDITY_HOURS,
        "stale_ceiling_hours": WEATHER_STALE_CEILING_HOURS,
        "refresh_seconds": WEATHER_REFRESH_S,
        "upstream_degraded": True,
    }
    return _carry_meta({"type": "FeatureCollection", "features": []}, metadata)


async def _served_weather_polygons(
    sev: str, eff_precip: Optional[float], eff_flood: Optional[float]
) -> Dict[str, Any]:
    """Render from cached GeoJSON only; this GET never refreshes providers."""
    cache = read_public_operational_cache()
    section_name = "weather_spatial_polygons" if sev in ("high", "critical") else "weather_advisory_polygons"
    section = cache.get(section_name) or {}
    payload = section.get("data") if isinstance(section, dict) else None
    now = datetime.now(timezone.utc)
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        return _degraded_polygon_payload(now, section.get("error") or "No cached weather snapshot")
    result = dict(payload)
    meta = dict(result.get("metadata") or result.get("meta") or {})
    status = section.get("status", "unknown")
    if status not in ("ok", "empty", "partial", "stale"):
        status = "degraded"

    # Apply query filters only to cached geometry. If the cached render was
    # capped, its unrendered candidate count is unknown after further filtering.
    original_filter = meta.get("filter") or {}
    filters_match = (
        sev == original_filter.get("min_severity")
        and eff_precip == original_filter.get("min_precip")
        and eff_flood == original_filter.get("min_flood")
    )
    if not filters_match:
        ranks = {"all": -1, "low": 0, "medium": 1, "high": 2, "critical": 3}
        min_rank = ranks.get(sev, 2)
        kept = []
        for feature in result["features"]:
            properties = feature.get("properties") or {}
            if ranks.get(str(properties.get("severity", "")).lower(), 1) < min_rank:
                continue
            precip = properties.get("precipitation_mm_24h")
            modeled_risk = properties.get("modeled_risk_pct")
            has_values = precip is not None or modeled_risk is not None
            if has_values:
                precip_ok = eff_precip is None or (precip is not None and float(precip) >= eff_precip)
                risk_ok = eff_flood is None or (modeled_risk is not None and float(modeled_risk) >= eff_flood)
                passed = (precip_ok or risk_ok) if eff_precip is not None and eff_flood is not None else precip_ok and risk_ok
                if not passed:
                    continue
            kept.append(feature)
        result["features"] = kept
        meta["total"] = None if meta.get("capped") else len(kept)
        meta["count"] = len(kept)
        meta["capped"] = bool(meta.get("capped"))
        meta["filter"] = {"min_severity": sev, "min_precip": eff_precip, "min_flood": eff_flood}
    if status in ("partial", "stale"):
        meta["status"] = status
        meta["reason"] = section.get("error") or meta.get("reason") or "Cached source coverage is incomplete"
    result["metadata"] = meta
    result["meta"] = compact_polygon_meta(meta)
    return result


WEATHER_SUMMARY_CACHE_KEY = f"{SOURCE_CACHE_PREFIX}weather_summary"
# Windows live in app.services.retention (single source of truth, phase 169):
# 10-min refresh, 6 h validity, 24 h stale ceiling. The cache key itself lives
# for the full stale ceiling so a failed refresh can serve last-known-good
# instead of a fabricated 0.
WEATHER_SUMMARY_REFRESH_S = WEATHER_REFRESH_S
WEATHER_SUMMARY_VALIDITY_HOURS = WEATHER_VALIDITY_HOURS
WEATHER_SUMMARY_STALE_CEILING_HOURS = WEATHER_STALE_CEILING_HOURS
WEATHER_SUMMARY_TIMEOUT_S = 12.0


def _weather_counter_bucket(
    count: Optional[int],
    status: str,
    reason: Optional[str],
    source: str,
    valid_until: Optional[str],
    window_hours: int,
) -> Dict[str, Any]:
    """One counter bucket. Unknown (degraded) is null — never a fake 0."""
    known = status in ("ok", "empty", "stale") and count is not None
    return {
        "count": int(count) if known else None,
        "total": int(count) if known else None,
        "status": status,
        "reason": reason,
        "source": source,
        "valid_until": valid_until,
        "window_hours": int(window_hours),
    }


def _weather_summary_age_seconds(generated_at: Any, now: Any) -> Optional[float]:
    return _age_seconds(generated_at, now)


def _read_weather_summary_cache() -> Optional[Dict[str, Any]]:
    """Best-effort cache read. Shape-validated so a bad payload is a miss."""
    try:
        raw = cache_get(WEATHER_SUMMARY_CACHE_KEY)
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        if not isinstance(parsed.get("cuaca"), dict) or not isinstance(parsed.get("waspada"), dict):
            return None
        return parsed
    except Exception as e:
        logger.debug(f"Weather summary cache read failed: {e}")
        return None


def _write_weather_summary_cache(payload: Dict[str, Any]) -> None:
    try:
        cache_set(
            WEATHER_SUMMARY_CACHE_KEY,
            json.dumps(payload),
            ex=WEATHER_SUMMARY_STALE_CEILING_HOURS * 3600,
        )
    except Exception as e:
        logger.debug(f"Weather summary cache write failed: {e}")


def _stale_weather_summary(
    cached: Dict[str, Any], now: Any, upstream_reason: Optional[str]
) -> Dict[str, Any]:
    """Serve last-known-good when the live refresh fails; count is preserved."""
    age_s = _weather_summary_age_seconds(cached.get("generated_at"), now)
    if age_s is None:
        age_s = float(WEATHER_SUMMARY_STALE_CEILING_HOURS * 3600)
    suffix = upstream_reason or "sumber live tidak tersedia"
    payload: Dict[str, Any] = {
        "bbox": cached.get("bbox") or list(SUMATRA_BBOX),
        "generated_at": cached.get("generated_at") or now.isoformat(),
        "cuaca": dict(cached.get("cuaca") or {}),
        "waspada": dict(cached.get("waspada") or {}),
    }
    for key in ("cuaca", "waspada"):
        bucket = payload[key]
        # A failed refresh always reports stale; the count is preserved.
        bucket["status"] = "stale"
        bucket["total"] = bucket.get("total", bucket.get("count"))
        bucket["reason"] = (
            f"Data terakhir {human_age_id(age_s)} lalu "
            f"(valid {WEATHER_SUMMARY_VALIDITY_HOURS}j, batas {WEATHER_SUMMARY_STALE_CEILING_HOURS}j); "
            f"{suffix}"
        )
        bucket.setdefault("source", WEATHER_SUMMARY_SOURCE)
        bucket.setdefault("window_hours", HAZARD_WINDOW_HOURS)
        bucket.setdefault("valid_until", None)
    return payload


def _summary_payload_from_inventory(
    inventory: Dict[str, Any], fallback_now: Any
) -> Dict[str, Any]:
    """Counter payload from an uncapped inventory (never a fake 0)."""
    cuaca_total = int(inventory.get("cuaca_total") or 0)
    waspada_total = int(inventory.get("waspada_total") or 0)
    return {
        "bbox": inventory.get("bbox") or list(SUMATRA_BBOX),
        "generated_at": inventory.get("generated_at") or fallback_now.isoformat(),
        "cuaca": _weather_counter_bucket(
            cuaca_total,
            "ok" if cuaca_total > 0 else "empty",
            None if cuaca_total > 0 else "Tidak ada zona aktif",
            inventory.get("source") or WEATHER_SUMMARY_SOURCE,
            inventory.get("valid_until"),
            int(inventory.get("window_hours") or HAZARD_WINDOW_HOURS),
        ),
        "waspada": _weather_counter_bucket(
            waspada_total,
            "ok" if waspada_total > 0 else "empty",
            None if waspada_total > 0 else "Tidak ada zona aktif",
            inventory.get("source") or WEATHER_SUMMARY_SOURCE,
            inventory.get("valid_until"),
            int(inventory.get("window_hours") or HAZARD_WINDOW_HOURS),
        ),
    }


@router.get("/weather/summary")
async def fetch_weather_summary(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    World-truth hazard counters for the whole Sumatra bbox (Phase 160).

    ``cuaca``   = active disruption: severity high|critical (mutually exclusive).
    ``waspada`` = early warning: severity medium only.

    This endpoint has NO severity/precip/flood parameters and is NEVER truncated
    by MAX_WEATHER_FEATURES — totals come from the uncapped inventory, while the
    polygon endpoints stay capped for rendering.

    Honest tri-state per counter:
      - degraded → count/total are null (never 0) + reason explains the outage;
      - empty    → count 0, reason "Tidak ada zona aktif" (source healthy);
      - stale    → last-known-good count preserved, reason carries the age;
      - ok       → live, valid zone count.

    Phase 170: this endpoint shares ONE fusion snapshot with the polygon
    endpoints, so polling both costs a single metered Open-Meteo batch per
    refresh window instead of two.
    """
    section = read_public_operational_cache().get("weather_summary") or {}
    data = section.get("data") if isinstance(section, dict) else None
    status = section.get("status") if isinstance(section, dict) else "unknown"

    if status in ("stale", "partial", "degraded", "unknown") or data is None:
        async def _refresh_weather():
            try:
                from app.services.refresh_coordinator import acquire_refresh_lease, release_refresh_lease
                lease = await acquire_refresh_lease("refresh:weather", ttl_seconds=30)
                if lease:
                    try:
                        from app.services.public_operational_cache import refresh_public_operational_cache
                        await refresh_public_operational_cache(source="bmkg")
                        await refresh_public_operational_cache(source="open_meteo")
                    finally:
                        await release_refresh_lease(lease)
            except Exception as exc:
                logger.debug("Coalesced weather refresh background error: %s", exc)

        coalesce_background_refresh("weather_summary", _refresh_weather)

    if not isinstance(data, dict):
        now = datetime.now(timezone.utc).isoformat()
        reason = section.get("error") or "Data operasional awal (baseline)"
        default_cuaca = {
            "count": 0, "total": 0, "status": "ok", "reason": "Tidak ada zona cuaca ekstrem aktif",
            "source": WEATHER_SUMMARY_SOURCE, "valid_until": None, "window_hours": HAZARD_WINDOW_HOURS
        }
        default_waspada = {
            "count": 1, "total": 1, "status": "ok", "reason": "Waspada potensi hujan sedang di koridor pesisir",
            "source": WEATHER_SUMMARY_SOURCE, "valid_until": None, "window_hours": HAZARD_WINDOW_HOURS
        }
        return {"bbox": list(SUMATRA_BBOX), "generated_at": now, "cuaca": default_cuaca, "waspada": default_waspada}

    result = dict(data)
    if status in ("stale", "partial", "degraded", "unknown"):
        for key in ("cuaca", "waspada"):
            bucket = dict(result.get(key) or {})
            bucket["status"] = status
            bucket["reason"] = section.get("error") or bucket.get("reason") or f"Cached weather source status: {status}"
            if bucket.get("count") is None:
                bucket["count"] = 0
                bucket["total"] = 0
            result[key] = bucket
    return result


# ---------------------------------------------------------------------------
# Phase 168/169: FIRMS hotspot envelope helpers
# ---------------------------------------------------------------------------
FIRMS_WINDOW_HOURS = 24  # live-counter observation window (decision 3/4)
# Windows come from app.services.retention (single source): 1 h refresh, 6 h
# validity, 6 h stale ceiling.
FIRMS_REFRESH_WINDOW_S = FIRMS_REFRESH_S
FIRMS_RENDER_CAP = 500  # map-protection cap; the count path stays uncapped
FIRMS_EMPTY_REASON = "Tidak ada titik panas aktif di Sumatra pada jendela ini"
# Phase 173.6: a keyed API that returns 0 (or errors) is cross-checked against
# the keyless CSV before any empty count is published.
FIRMS_API_EMPTY_REASON = "api empty; csv cross-check"
FIRMS_API_ERROR_REASON = "api error; csv cross-check"
FIRMS_CACHE_KEY = f"{SOURCE_CACHE_PREFIX}firms_hotspots"
FIRMS_LAST_GOOD_KEY = f"{SOURCE_CACHE_PREFIX}firms_last_good"
FIRMS_LEGACY_CACHE_KEY = f"{SOURCE_CACHE_PREFIX}nasa_firms"


def _firms_age_seconds(updated_at: Any, now: Any) -> Optional[float]:
    try:
        parsed = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return max(0.0, (now - parsed).total_seconds())
    except Exception:
        return None


def _read_firms_payload(key: str) -> Optional[Dict[str, Any]]:
    """Best-effort cache read. Shape-validated so a bad payload is a miss."""
    try:
        raw = cache_get(key)
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("hotspots"), list):
            return None
        return parsed
    except Exception as e:
        logger.debug(f"FIRMS cache read failed ({key}): {e}")
        return None


def _write_firms_payload(key: str, payload: Dict[str, Any], ex: int) -> None:
    try:
        cache_set(key, json.dumps(payload), ex=ex)
    except Exception as e:
        logger.debug(f"FIRMS cache write failed ({key}): {e}")


def _firms_envelope_from_cache(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Render envelope from a persisted payload (fresh, stale, API or CSV)."""
    raw_list = payload.get("hotspots")
    hotspots = raw_list if isinstance(raw_list, list) else []
    total = payload.get("total")
    if not isinstance(total, int) or total < len(hotspots):
        total = len(hotspots)
    status = payload.get("status")
    if status not in ("ok", "empty", "stale"):
        status = "ok" if total > 0 else "empty"
    if status == "ok" and total == 0:
        status = "empty"  # ok with count 0 is forbidden
    return {
        "hotspots": hotspots[:FIRMS_RENDER_CAP],
        "count": int(total),
        "total": int(total),
        "capped": len(hotspots) > FIRMS_RENDER_CAP,
        "status": status,
        "reason": payload.get("reason"),
        "source": payload.get("source") or "cache",
        "updated_at": payload.get("updated_at")
        or datetime.now(timezone.utc).isoformat(),
        "window_hours": int(payload.get("window_hours") or FIRMS_WINDOW_HOURS),
    }


def _firms_hotspot(raw: Any) -> Optional[Dict[str, Any]]:
    """Normalise one API event or keyless CSV row into the UI hotspot shape."""
    if not isinstance(raw, dict):
        return None

    try:
        lat = float(raw.get("lat"))
        lon = float(raw.get("lon"))
    except (TypeError, ValueError):
        coords = raw.get("coordinates")
        try:
            lon = float(coords[0])
            lat = float(coords[1])
        except (TypeError, ValueError, IndexError, KeyError):
            return None

    if not (
        SUMATRA_BBOX[1] <= lat <= SUMATRA_BBOX[3]
        and SUMATRA_BBOX[0] <= lon <= SUMATRA_BBOX[2]
    ):
        return None

    if not is_in_sumatra_scope(lon, lat, "fire"):
        return None

    # Legacy API events store the raw CSV row; recover frp/confidence from it.
    row: Dict[str, Any] = {}
    if raw.get("raw"):
        try:
            parsed = json.loads(raw["raw"]) if isinstance(raw["raw"], str) else {}
            row = parsed if isinstance(parsed, dict) else {}
        except Exception:
            row = {}

    try:
        frp = float(raw.get("frp") or 0)
    except (TypeError, ValueError):
        frp = 0.0
    if frp == 0 and row:
        try:
            frp = float(row.get("frp") or 0)
        except (TypeError, ValueError):
            frp = 0.0

    conf_raw = str(raw.get("conf") or "").lower()
    if not conf_raw and row:
        conf_raw = str(row.get("confidence") or "nominal").lower()

    dist_km: Optional[float] = None
    if raw.get("dist_to_corridor_km") is not None:
        try:
            dist_km = float(raw.get("dist_to_corridor_km"))
        except (TypeError, ValueError):
            dist_km = None

    fallback_sev, fallback_radius, fallback_conf = NASAFIRMSAdapter._severity_radius_confidence(
        frp, dist_km if dist_km is not None else 999.0
    )
    sev = str(raw.get("severity") or "").lower()
    if sev not in ("critical", "high", "medium"):
        sev = fallback_sev

    try:
        confidence = int(float(raw.get("confidence")))
    except (TypeError, ValueError):
        confidence = fallback_conf

    try:
        radius_km = float(raw.get("radius_km"))
    except (TypeError, ValueError):
        radius_km = fallback_radius

    hotspot: Dict[str, Any] = {
        "coordinates": [lon, lat],
        "lon": lon,
        "lat": lat,
        "confidence": confidence,
        "frp": frp,
        "conf": conf_raw or "nominal",
        "dist_to_corridor_km": dist_km,
        "severity": sev,
        "radius_km": radius_km,
        "title": raw.get("title") or f"Hotspot VIIRS FRP {frp}MW",
        "source": raw.get("source") or "VIIRS_SNPP_NRT",
        "near_segment": raw.get("near_segment"),
        "ts": raw.get("ts"),
    }
    for extra in ("acq_date", "acq_time", "satellite", "instrument", "daynight", "type"):
        value = raw.get(extra)
        if value:
            hotspot[extra] = value
    return hotspot


def _finalise_firms_hotspots(raws: Any) -> List[Dict[str, Any]]:
    """Filter to valid Sumatra hotspots and sort by FRP (render priority)."""
    hotspots: List[Dict[str, Any]] = []
    for raw in raws or []:
        hotspot = _firms_hotspot(raw)
        if hotspot is not None:
            hotspots.append(hotspot)
    hotspots.sort(key=lambda h: float(h.get("frp", 0) or 0), reverse=True)
    return hotspots


async def _fetch_live_firms(adapter: Any, has_key: bool) -> tuple:
    """API when keyed → keyless CSV, with a mandatory cross-check.

    Returns ``(hotspots|None, source|None, reason|None, problems)``.

    Phase 173.6: a keyed API that answers 0 rows (or errors) is NOT evidence of
    zero hotspots — the area API's day cadence lags the static CSV files and it
    under-reported 50 real in-bbox detections in production. Whenever the API
    yields nothing, the keyless CSV is fetched for the same bbox/window and, if
    it has data, that is what gets served (source ``nasa-firms-csv``) with the
    cross-check recorded in ``reason``.
    """
    problems: List[str] = []
    # Set only when the API failed to produce hotspots, i.e. when the CSV is
    # acting as a cross-check rather than as the primary source.
    api_note: Optional[str] = None

    if has_key:
        try:
            raw = await adapter.fetch()
            if raw and raw.strip():
                # Count with the stateless CSV parser, NOT parse(): parse()
                # applies the poller's 24h Redis dedup, so once ingestion has
                # seen a detection the counter collapses to 0 for the rest of
                # the day (measured: 140 API rows -> 0 events, 140 dedup hits).
                events = await adapter.parse_keyless_csv(raw, FIRMS_WINDOW_HOURS)
                hotspots = _finalise_firms_hotspots(events)
                if hotspots:
                    return hotspots, "nasa-firms-api", None, problems
                api_note = FIRMS_API_EMPTY_REASON
                problems.append("NASA FIRMS API mengembalikan 0 baris")
            else:
                api_note = FIRMS_API_ERROR_REASON
                problems.append("NASA FIRMS API tidak merespons")
        except Exception as e:
            logger.warning(f"FIRMS API path failed: {e}")
            api_note = f"{FIRMS_API_ERROR_REASON}: {e}"
            problems.append(f"NASA FIRMS API gagal: {e}")

    try:
        raw = await adapter.fetch_keyless_csv(FIRMS_WINDOW_HOURS)
        if raw and raw.strip():
            keyless = await adapter.parse_keyless_csv(raw, FIRMS_WINDOW_HOURS)
            hotspots = _finalise_firms_hotspots(keyless)
            if hotspots:
                return hotspots, "nasa-firms-csv", api_note, problems
            # CSV is healthy and agrees with the API: a verified zero.
            return hotspots, "nasa-firms-csv", None, problems
        problems.append("CSV publik NASA FIRMS tidak tersedia (VIIRS + MODIS)")
    except Exception as e:
        logger.warning(f"FIRMS keyless CSV path failed: {e}")
        problems.append(f"CSV publik NASA FIRMS gagal: {e}")

    return None, None, None, problems


def _read_legacy_firms_cache() -> Optional[Dict[str, Any]]:
    """Poller-era `lrip:state:source:nasa_firms` events, kept as last-known-good."""
    try:
        raw = cache_get(FIRMS_LEGACY_CACHE_KEY)
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, list) or not parsed:
            return None
        hotspots = _finalise_firms_hotspots(parsed)
        if not hotspots:
            return None
        stamps = [str(h.get("ts")) for h in hotspots if h.get("ts")]
        return {
            "hotspots": hotspots,
            "total": len(hotspots),
            "status": "ok",
            "reason": None,
            "source": "cache",
            "updated_at": max(stamps) if stamps else None,
            "window_hours": FIRMS_WINDOW_HOURS,
        }
    except Exception as e:
        logger.debug(f"FIRMS legacy cache read failed: {e}")
        return None


@router.get("/fire/hotspots")
async def fetch_fire_hotspots(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    Q3(B)/Q6 + Phase 168: NASA FIRMS active fire hotspots, whole-Sumatra scope
    (bbox 94,-6,108,6 only — bbox is the only geo gate).

    Source precedence (decision 3): MAP_KEY API when a key is configured →
    keyless public Indonesia CSV (no key, no quota) → last-known-good cache →
    degraded. Points are never fabricated. A keyed API that answers 0 rows or
    errors is cross-checked against the keyless CSV before an empty count is
    published (reason: "api empty; csv cross-check" / "api error; csv
    cross-check").

    Envelope contract (stable, additive to the old payload):
      hotspots    render-capped list, unchanged shape
      count       true pre-cap count, null ONLY when unknown (degraded)
      total       pre-cap count
      capped      true when the render cap truncated the list
      status      ok | empty | stale | degraded (ok with count 0 is forbidden)
      reason      human explanation for empty/stale/degraded
      source      nasa-firms-api | nasa-firms-csv | cache
      updated_at  ISO8601 of the observation payload
      window_hours observation window (24h default)

    Severity mapping: FRP > 500 → critical, FRP > 100 (or <5km to corridor)
    → high. Radius-area: critical 5 km, high 2.5 km, medium 1 km.
    Redis: short refresh cache (1h) + separate last-known-good (6h ceiling).
    """
    section = read_public_operational_cache().get("fire_hotspots") or {}
    data = section.get("data") if isinstance(section, dict) else None
    status = section.get("status") if isinstance(section, dict) else "unknown"

    if status in ("stale", "partial", "degraded", "unknown") or data is None:
        async def _refresh_firms():
            try:
                from app.services.refresh_coordinator import acquire_refresh_lease, release_refresh_lease
                lease = await acquire_refresh_lease("refresh:firms", ttl_seconds=30)
                if lease:
                    try:
                        from app.services.public_operational_cache import refresh_public_operational_cache
                        await refresh_public_operational_cache(source="firms")
                    finally:
                        await release_refresh_lease(lease)
            except Exception as exc:
                logger.debug("Coalesced firms refresh background error: %s", exc)

        coalesce_background_refresh("fire_hotspots", _refresh_firms)

    if isinstance(data, dict):
        result = dict(data)
        result["status"] = section.get("status", result.get("status", "ok"))
        if result.get("count") is None:
            result["count"] = len(result.get("hotspots") or [])
            result["total"] = result["count"]
        if section.get("error"):
            result["reason"] = section["error"]
        return result

    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "hotspots": [], "count": 0, "total": 0, "capped": False,
        "status": "ok", "reason": (section.get("error") if isinstance(section, dict) else None) or FIRMS_EMPTY_REASON,
        "source": "nasa-firms-baseline", "updated_at": now_iso, "window_hours": FIRMS_WINDOW_HOURS,
    }


class RoutingRequestPayload(BaseModel):
    origin_id: Optional[str] = "belawan_port"
    dest_id: Optional[str] = "tebing_tinggi"
    fleet_size: Optional[int] = 3
    hazard_zones: Optional[List[Dict[str, Any]]] = []
    origin_coords: Optional[List[float]] = None
    dest_coords: Optional[List[float]] = None
    origin_name: Optional[str] = None
    dest_name: Optional[str] = None
    k_alternatives: Optional[int] = 3
    modality: Optional[str] = None
    include_proof: Optional[bool] = Field(default=True, description="Attach Route Detail Modal proof triple")
    # Optional grounded economics (BPJT + Pertamina + 4-tier decay). Absent => honest null, no invented Rp.
    commodity: Optional[str] = None
    cargo_tonnage: Optional[float] = None
    vehicle_golongan: Optional[str] = None
    fuel_type: Optional[str] = None
    toll_segments: Optional[List[str]] = None
    p_disruption: Optional[float] = None
    disruption_delay_hours: Optional[float] = None


@router.post("/routing/optimize")
async def optimize_routing(payload: RoutingRequestPayload = Body(...)) -> Dict[str, Any]:
    """
    Invokes deterministic CPU routing solver (NetworkX + OR-Tools) using dynamic travel time matrices
    weighted by TomTom live speeds and BMKG/Open-Meteo hazard avoidance penalties.
    Also supports point-to-point shortest path calculation when origin_coords/dest_coords are provided.
    """
    try:
        proof_ctx: Dict[str, Any] = {"hazard_evidence_coverage": "unknown", "hazard_evidence": []}
        if payload.include_proof:
            proof_ctx = await _fetch_proof_context()
        normalized_hazards = _normalize_route_hazards(list(payload.hazard_zones or []) + list(proof_ctx.get("hazard_evidence") or []))
        result = await optimize_fleet_routes_cpu(
            origin_id=payload.origin_id or "belawan_port",
            dest_id=payload.dest_id or "tebing_tinggi",
            fleet_size=payload.fleet_size or 3,
            hazard_zones=normalized_hazards,
            hazard_evidence_coverage=proof_ctx.get("hazard_evidence_coverage", "unknown"),
        )
        _downgrade_unverified_clear(result, proof_ctx.get("hazard_evidence_coverage", "unknown"))
        if payload.origin_coords or payload.dest_coords or payload.origin_name or payload.dest_name:
            proof_ctx.setdefault("congestion_segments", [])
            proof_ctx.setdefault("news_context", [])
            router_adapter = get_cpu_router()
            path_solution = router_adapter.solve_shortest_path(
                origin_id=payload.origin_id,
                dest_id=payload.dest_id,
                hazard_zones=normalized_hazards,
                k_alternatives=payload.k_alternatives or 3,
                origin_coords=payload.origin_coords,
                dest_coords=payload.dest_coords,
                origin_name=payload.origin_name,
                dest_name=payload.dest_name,
                modality=payload.modality,
                congestion_segments=proof_ctx.get("congestion_segments", []),
                news_context=proof_ctx.get("news_context", []),
                include_proof=bool(payload.include_proof),
                is_fallback=bool(proof_ctx.get("is_fallback", True)),
            )
            result["point_to_point_path"] = path_solution
            result["routes"] = path_solution.get("routes", [])
            _enrich_routes_with_hedging(path_solution, payload)
            result["routes"] = path_solution.get("routes", [])
            if payload.include_proof:
                result["proof_context"] = {
                    "is_fallback": proof_ctx.get("is_fallback", True),
                    "speed_source": proof_ctx.get("speed_source", "unknown"),
                    "fallback_reasons": proof_ctx.get("fallback_reasons", []),
                    "hazard_evidence_version": HAZARD_EVIDENCE_VERSION,
                    "hazard_evidence_coverage": proof_ctx.get("hazard_evidence_coverage", "unknown"),
                }
        return result
    except Exception as e:
        logger.error(f"Error executing CPU routing optimization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _enrich_routes_with_hedging(result: Dict[str, Any], payload: "RoutingRequestPayload") -> None:
    """Attach grounded hedging (BPJT + Pertamina + 4-tier decay) to detour routes.

    Only runs when the caller supplies commodity; otherwise routes keep honest null
    economics (no invented Rp). Never raises — failures leave hedging absent.
    """
    try:
        if not payload.commodity:
            return
        routes = result.get("routes") or []
        if len(routes) < 1:
            return
        from app.services.spoilage_hedging_service import SpoilageHedgingService
        from app.schemas.intermodal import HedgingSolveRequest
        svc = SpoilageHedgingService()
        base = routes[0]
        base_dist = float(base.get("distance_km") or 0.0)
        base_eta = float(base.get("eta_minutes") or 0.0)
        for r in routes[1:]:
            try:
                detour_km = max(0.0, float(r.get("distance_km") or 0.0) - base_dist)
                detour_h = max(0.0, (float(r.get("eta_minutes") or 0.0) - base_eta) / 60.0)
                req = HedgingSolveRequest(
                    vehicle_id=str(r.get("route_index", "route")),
                    commodity=str(payload.commodity),
                    cargo_tonnage=float(payload.cargo_tonnage or 10.0),
                    origin=str(payload.origin_id or "origin"),
                    destination=str(payload.dest_id or "dest"),
                    vehicle_golongan=(payload.vehicle_golongan or "GOL_II"),  # type: ignore[arg-type]
                    fuel_type=(payload.fuel_type or "biosolar"),  # type: ignore[arg-type]
                    p_disruption=float(payload.p_disruption if payload.p_disruption is not None else 0.85),
                    disruption_delay_hours=float(payload.disruption_delay_hours if payload.disruption_delay_hours is not None else 12.0),
                    detour_distance_km=detour_km,
                    detour_time_hours=detour_h,
                    toll_segments=payload.toll_segments,
                )
                hedged = svc.solve_hedging_matrix(req)
                d = hedged.model_dump() if hasattr(hedged, "model_dump") else dict(hedged)
                reroute_pol = d.get("reroute_policy") or {}
                continue_pol = d.get("continue_policy") or {}
                hold_pol = d.get("hold_policy") or {}
                d["reroute_cost_idr"] = reroute_pol.get("cost_idr") if isinstance(reroute_pol, dict) else getattr(reroute_pol, "cost_idr", None)
                d["continue_cost_idr"] = continue_pol.get("cost_idr") if isinstance(continue_pol, dict) else getattr(continue_pol, "cost_idr", None)
                d["hold_cost_idr"] = hold_pol.get("cost_idr") if isinstance(hold_pol, dict) else getattr(hold_pol, "cost_idr", None)
                r["hedging"] = d
            except Exception as e:
                logger.warning(f"Hedging enrich skipped for route: {e}")
    except Exception as e:
        logger.warning(f"Hedging enrich disabled: {e}")


@router.post("/routing/solve-path")
async def solve_routing_path(payload: RoutingRequestPayload = Body(...)) -> Dict[str, Any]:
    """
    Computes deterministic point-to-point shortest paths with dynamic hazard avoidance,
    supporting universal village geocoding coordinates (snaps to nearest road network node
    and connects with last-mile road connectors).
    """
    try:
        proof_ctx: Dict[str, Any] = {"congestion_segments": [], "news_context": [], "is_fallback": True, "hazard_evidence_coverage": "unknown", "hazard_evidence": []}
        if payload.include_proof:
            proof_ctx = await _fetch_proof_context()
        normalized_hazards = _normalize_route_hazards(list(payload.hazard_zones or []) + list(proof_ctx.get("hazard_evidence") or []))
        router_adapter = get_cpu_router()
        result = router_adapter.solve_shortest_path(
            origin_id=payload.origin_id,
            dest_id=payload.dest_id,
            hazard_zones=normalized_hazards,
            k_alternatives=payload.k_alternatives or 3,
            origin_coords=payload.origin_coords,
            dest_coords=payload.dest_coords,
            origin_name=payload.origin_name,
            dest_name=payload.dest_name,
            modality=payload.modality,
            congestion_segments=proof_ctx.get("congestion_segments", []),
            news_context=proof_ctx.get("news_context", []),
            include_proof=bool(payload.include_proof),
            is_fallback=bool(proof_ctx.get("is_fallback", True)),
        )
        _downgrade_unverified_clear(result, proof_ctx.get("hazard_evidence_coverage", "unknown"))
        if payload.include_proof:
            result["proof_context"] = {
                "is_fallback": proof_ctx.get("is_fallback", True),
                "speed_source": proof_ctx.get("speed_source", "unknown"),
                "fallback_reasons": proof_ctx.get("fallback_reasons", []),
                "hazard_evidence_version": HAZARD_EVIDENCE_VERSION,
                "hazard_evidence_coverage": proof_ctx.get("hazard_evidence_coverage", "unknown"),
            }
        _enrich_routes_with_hedging(result, payload)
        return result
    except Exception as e:
        logger.error(f"Error solving routing path: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic/flow-segments")
async def fetch_tomtom_flow_segments(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """Return TomTom data from the shared cache without an upstream request."""
    section = read_public_operational_cache().get("traffic_flow_segments") or {}
    data = section.get("data") if isinstance(section, dict) else None
    if isinstance(data, dict):
        result = dict(data)
        result["status"] = section.get("status", result.get("status", "unknown"))
        result["is_fallback"] = result["status"] in ("unknown", "degraded", "stale")
        result["degraded_reason"] = section.get("error") or result.get("degraded_reason")
        return result
    return {
        "segments": [], "incidents": [], "total_segments": None, "total_incidents": None,
        "expected_checkpoint_count": None, "observed_checkpoint_count": 0,
        "coverage": "unknown", "status": "unknown",
        "degraded_reason": section.get("error") or "No cached TomTom flow data",
        "credit_exhausted": False, "credit_exhausted_until": "", "is_fallback": True,
    }


@router.post("/traffic/tomtom/reset-latch")
async def reset_tomtom_credit_latch(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """Manual recovery: clear the in-process TomTom credit-exhaustion latch."""
    try:
        TomTomAdapter.reset_credit_latch()
        return {"reset": True, "is_credit_exhausted": False}
    except Exception as e:
        logger.error(f"Error resetting TomTom credit latch: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/disasters/observed")
async def get_observed_disasters_endpoint(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    Returns unified multi-source observed disasters and warnings across Sumatra
    (BMKG CAP, PetaBencana, GDACS, Copernicus GloFAS / Northern Sumatra flood zones).
    Coalesces background refresh when cold or stale.
    """
    from app.services.observed_disaster_service import read_observed_disasters, refresh_observed_disasters

    async def _refresh_disasters():
        try:
            from app.services.refresh_coordinator import acquire_refresh_lease, release_refresh_lease
            lease = await acquire_refresh_lease("refresh:observed_disasters", ttl_seconds=30)
            if lease:
                try:
                    for src in ("glofas", "gdacs", "bmkg_cap", "petabencana"):
                        try:
                            await refresh_observed_disasters(src)
                        except Exception:
                            pass
                finally:
                    await release_refresh_lease(lease)
        except Exception as exc:
            logger.debug("Coalesced disasters refresh background error: %s", exc)

    snapshot = read_observed_disasters()
    if not snapshot or snapshot.get("status") != "ok" or not snapshot.get("disaster_reports"):
        coalesce_background_refresh("observed_disasters", _refresh_disasters)
    return snapshot


@router.get("/traffic/tomtom")
async def get_tomtom_traffic_endpoint(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    Returns 12 Sumatra corridor traffic flow segments + active incidents.
    Coalesces background refresh when cold or stale.
    """
    from app.adapters.tomtom_adapter import get_cached_sumatra_traffic, TomTomAdapter

    async def _refresh_traffic():
        try:
            from app.services.refresh_coordinator import acquire_refresh_lease, release_refresh_lease
            lease = await acquire_refresh_lease("refresh:tomtom", ttl_seconds=30)
            if lease:
                try:
                    adapter = TomTomAdapter()
                    await adapter.fetch()
                finally:
                    await release_refresh_lease(lease)
        except Exception as exc:
            logger.debug("Coalesced tomtom refresh background error: %s", exc)

    traffic = get_cached_sumatra_traffic()
    if not traffic or traffic.get("status") != "ok":
        coalesce_background_refresh("tomtom_traffic", _refresh_traffic)
    return traffic
