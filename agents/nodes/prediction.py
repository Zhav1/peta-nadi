import logging
import json
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from agents.state import CrisisState, AgentFinding
from agents.memory.stm import get_async_redis
from app.db.supabase_client import get_client
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Deterministic horizon decay. The observed delay of the *nearest* TomTom
# segment is the anchor; far horizons regress toward baseline instead of
# extrapolating a regression fitted across unrelated corridor segments.
HORIZON_DECAY = {"6h": 1.0, "12h": 0.85, "24h": 0.65, "48h": 0.45}
MIN_DELAY_MIN = 5.0
MAX_DELAY_MIN = 300.0
DEFAULT_BASE_DELAY_MIN = 30.0
HISTORY_BBOX_DEG = 0.5


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km; returns 9999.0 when coordinates are unusable."""
    try:
        r = 6371.0
        phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
        dphi = math.radians(float(lat2) - float(lat1))
        dlambda = math.radians(float(lon2) - float(lon1))
        a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return round(r * c, 2)
    except Exception:
        return 9999.0


def _as_float(value: Any) -> Optional[float]:
    """Coerce to float, returning None for absent/invalid values (0.0 stays 0.0)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_region(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", " ")


def _row_region(row: Dict[str, Any]) -> str:
    """Region evidence lives in the incidents.evidence JSONB (no region column)."""
    evidence = row.get("evidence")
    if isinstance(evidence, dict):
        for key in ("region", "province", "area"):
            if evidence.get(key):
                return str(evidence[key])
    return str(row.get("region") or "")


def _clamp_delay(value: float) -> float:
    return float(max(MIN_DELAY_MIN, min(MAX_DELAY_MIN, value)))


async def prediction_agent(state: CrisisState) -> dict:
    """Agent 3: Multi-horizon congestion forecast (6h/12h/24h/48h) incorporating Open-Meteo predictions."""
    logger.info("Agent 3 [PredictionAgent] running...")

    norm_event = state.get("normalized_event") or {}
    event_type = norm_event.get("event_type", "unknown")
    state_lat = _as_float(state.get("lat"))
    state_lon = _as_float(state.get("lon"))
    is_simulated_run = bool(state.get("is_simulated"))
    # Degradation ledger: "no segments" can mean a quiet network or a dead
    # ingestion path. Only named degraded sources let the dashboard tell them apart.
    degraded_sources: List[str] = []
    errors: Dict[str, str] = {}

    def _degrade(source_name: str, exc: Any) -> None:
        if source_name not in degraded_sources:
            degraded_sources.append(source_name)
        errors[source_name] = str(exc)

    # 1. Pull last 24h TomTom segments from Redis
    r = get_async_redis()
    segments: List[Dict[str, Any]] = []

    try:
        # Scan for TomTom segments keys (sorted for deterministic selection).
        keys = await r.keys("lrip:tomtom:segment:*")
        for k in sorted(keys or []):
            val = await r.get(k)
            if not val:
                continue
            try:
                data = json.loads(val)
                if not isinstance(data, dict):
                    continue
                raw_delay = data.get("delay_min")
                if raw_delay is None:
                    raw_delay = float(data.get("currentTravelTime", 0) or 0) / 60.0
                segments.append({
                    "name": data.get("name") or str(k).rsplit(":", 1)[-1],
                    "delay_min": float(raw_delay),
                    "lat": _as_float(data.get("lat", data.get("latitude"))),
                    "lon": _as_float(data.get("lon", data.get("longitude"))),
                })
            except Exception as se:
                logger.warning(
                    "PredictionAgent: unreadable TomTom segment %s skipped: %s",
                    k,
                    se,
                )
                _degrade("tomtom_empty", f"unreadable segment {k}: {se}")
    except Exception as re:
        logger.error(f"Failed to scan TomTom data from Redis: {re}")
        _degrade("tomtom_redis", re)

    if not segments:
        # Distinguish "quiet corridor" (fresh segments, low delay) from "dead path"
        # (no readable segments at all): the latter must surface as degraded.
        logger.warning(
            "PredictionAgent: no readable TomTom segments; "
            "degraded_sources=tomtom_empty"
        )
        _degrade("tomtom_empty", "no readable TomTom segments in cache")

    delays = [seg["delay_min"] for seg in segments]

    # Nearest segment to the event coordinates (never a cross-segment regression).
    nearest_segment: Optional[Dict[str, Any]] = None
    nearest_segment_distance_km: Optional[float] = None
    if state_lat is not None and state_lon is not None and segments:
        best_key = None
        for seg in segments:
            if seg["lat"] is None or seg["lon"] is None:
                continue
            dist = _haversine_km(state_lat, state_lon, seg["lat"], seg["lon"])
            if dist >= 9999.0:
                continue
            candidate = (dist, seg["name"])
            if best_key is None or candidate < best_key:
                best_key = candidate
                nearest_segment = seg
        if best_key is not None:
            nearest_segment_distance_km = round(best_key[0], 2)

    # 2. Select the nearest Open-Meteo grid point (never events[-1])
    open_meteo_precip = 0.0
    open_meteo_flood_risk = 0.0
    weather_station_name = None
    weather_distance_km = None
    weather_provenance = "unavailable"
    evidence_region = _normalize_region(norm_event.get("region") or state.get("region"))

    try:
        val = await r.get("lrip:cache:open_meteo")
        cached = json.loads(val) if val else None
    except Exception as e_err:
        logger.warning(f"PredictionAgent: failed to fetch Open-Meteo data from Redis: {e_err}")
        cached = None
        _degrade("weather_unavailable", e_err)

    if isinstance(cached, list):
        cached_events = cached
    elif isinstance(cached, dict):
        cached_events = [cached]
    else:
        cached_events = []

    candidates: List[Dict[str, Any]] = []
    for idx, ev in enumerate(cached_events):
        if not isinstance(ev, dict):
            continue
        raw_payload = ev.get("raw_payload") if isinstance(ev.get("raw_payload"), dict) else {}
        predictions = raw_payload.get("predictions")
        if not isinstance(predictions, dict):
            predictions = ev.get("predictions") if isinstance(ev.get("predictions"), dict) else {}
        candidates.append({
            "index": idx,
            "name": raw_payload.get("region") or ev.get("region") or ev.get("name"),
            "lat": _as_float(raw_payload.get("latitude", ev.get("lat"))),
            "lon": _as_float(raw_payload.get("longitude", ev.get("lon"))),
            "predictions": predictions,
            "source": raw_payload.get("source") or ev.get("source"),
        })

    selected = None
    if candidates:
        if state_lat is not None and state_lon is not None:
            located = [c for c in candidates if c["lat"] is not None and c["lon"] is not None]
            if located:
                selected = min(
                    located,
                    key=lambda c: (_haversine_km(state_lat, state_lon, c["lat"], c["lon"]), c["index"]),
                )
        if selected is None and evidence_region:
            selected = next(
                (c for c in candidates if _normalize_region(c["name"]) == evidence_region),
                None,
            )
        if selected is None:
            selected = candidates[0]

    if selected is not None:
        preds = selected["predictions"] or {}
        open_meteo_precip = _as_float(preds.get("precipitation_mm_24h")) or 0.0
        open_meteo_flood_risk = _as_float(preds.get("flood_risk_pct")) or 0.0
        weather_station_name = selected["name"]
        source = str(selected["source"] or "")
        weather_provenance = "simulated" if source.startswith("open-meteo-sim") else "observed"
        if weather_provenance == "simulated":
            # Synthetic grid: usable for rehearsal, never presented as observation.
            _degrade("weather_simulated", "Open-Meteo grid marked simulated")
        if state_lat is not None and state_lon is not None and selected["lat"] is not None and selected["lon"] is not None:
            weather_distance_km = _haversine_km(state_lat, state_lon, selected["lat"], selected["lon"])
    else:
        logger.warning(
            "PredictionAgent: no Open-Meteo cache entries; "
            "degraded_sources=weather_unavailable"
        )
        _degrade("weather_unavailable", "no Open-Meteo cache entries")

    # 3. Query incidents table for historical events near the event.
    # Preferred: lat/lon bbox +-0.5 deg. Fallback: filter region evidence in Python
    # (incidents has no `region` column; region lives in evidence JSONB).
    has_history = False
    try:
        supabase = get_client()
        rows: List[Dict[str, Any]] = []
        used_bbox = False

        if state_lat is not None and state_lon is not None:
            try:
                res = (
                    supabase.table("incidents").select("*")
                    .gte("lat", state_lat - HISTORY_BBOX_DEG)
                    .lte("lat", state_lat + HISTORY_BBOX_DEG)
                    .gte("lon", state_lon - HISTORY_BBOX_DEG)
                    .lte("lon", state_lon + HISTORY_BBOX_DEG)
                    .execute()
                )
                rows = list(res.data or [])
                used_bbox = True
            except Exception as bbox_err:
                logger.warning(
                    f"PredictionAgent: incident bbox query failed ({bbox_err}); "
                    "falling back to region-evidence filter"
                )
                degraded_sources.append("incidents_bbox")

        if not used_bbox:
            try:
                res = supabase.table("incidents").select("*").execute()
                rows = list(res.data or [])
            except Exception as fb_err:
                logger.warning(f"PredictionAgent: incident region fallback query failed: {fb_err}")
                degraded_sources.append("incidents_history")
                rows = []

        hist_rows = [
            row for row in rows
            if (row.get("incident_id") or row.get("id"))
            and (not evidence_region or _normalize_region(_row_region(row)) == evidence_region)
        ]
        has_history = len(hist_rows) >= 5
    except Exception as dbe:
        logger.warning(f"PredictionAgent: failed to query historical incidents: {dbe}")
        degraded_sources.append("incidents_db")

    # 4. Deterministic horizon decay bounded to [5.0, 300.0] minutes.
    baseline_delay = (
        nearest_segment["delay_min"] if nearest_segment is not None
        else (round(sum(delays) / len(delays), 1) if delays else DEFAULT_BASE_DELAY_MIN)
    )
    base_delays = {h: _clamp_delay(baseline_delay * factor) for h, factor in HORIZON_DECAY.items()}

    # Hazard adjustments
    is_wildfire = event_type == "wildfire" or event_type == "fire"
    if is_wildfire:
        # Increase delay prediction due to wildfire spread risk
        for h in base_delays:
            base_delays[h] = _clamp_delay(base_delays[h] * 1.3)

    # Open-Meteo weather adjustments: escalate only on observed (non-simulated) data.
    weather_multiplier = 1.0
    weather_alert = open_meteo_flood_risk > 50.0 or open_meteo_precip > 20.0
    if weather_alert:
        if weather_provenance == "simulated" and not is_simulated_run:
            logger.info(
                "PredictionAgent: Open-Meteo grid is simulated; neutral weather multiplier "
                "(no escalation) for a non-simulated crisis run."
            )
        else:
            logger.info(
                f"Open-Meteo weather alert active (Flood risk: {open_meteo_flood_risk}%, "
                f"Precip: {open_meteo_precip}mm). Escalating congestion forecasts."
            )
            weather_multiplier = 1.0 + (open_meteo_flood_risk / 100.0)
            for h in base_delays:
                base_delays[h] = _clamp_delay(base_delays[h] * weather_multiplier)

    # Build forecast dict with confidence intervals
    congestion_forecast = {}
    for h in base_delays:
        val = base_delays[h]
        congestion_forecast[h] = {
            "delay_min": round(val, 1),
            "confidence_interval": [round(val * 0.8, 1), round(val * 1.2, 1)]
        }

    # 5. Compute confidence score
    confidence = 0.5  # Base
    if has_history:
        confidence += 0.15
    if len(delays) >= 5:
        confidence += 0.15
    if is_wildfire:
        confidence += 0.1
    if open_meteo_flood_risk > 50.0 and (weather_provenance != "simulated" or is_simulated_run):
        confidence += 0.1
    if state.get("severity") in ["critical", "high"]:
        confidence += 0.1
    if is_simulated_run:
        # Simulated input is a weaker evidence class: discount, never a bonus.
        confidence -= 0.05

    confidence = min(1.0, max(0.0, round(confidence, 4)))

    summary_text = f"Generated 48h multi-horizon forecast. Max predicted delay: {congestion_forecast['12h']['delay_min']} minutes in 12h. Integrated Open-Meteo weather risk analysis."

    # 5b. Phase 58 expansion (A): opencode-driver prose narrative over computed horizons.
    # Numbers are injected as ground truth; the model must not invent figures.
    # On LLMGatewayUnavailable, the deterministic summary above stands (honest fallback).
    narrative = None
    try:
        from agents.llm_gateway import LLMGateway
        horizons_txt = ", ".join(
            f"{h}: {v['delay_min']} menit (CI {v['confidence_interval'][0]}-{v['confidence_interval'][1]})"
            for h, v in congestion_forecast.items()
        )
        prompt = (
            "Jelaskan prakiraan kemacetan berikut dalam 1-2 kalimat Bahasa Indonesia. "
            "Jangan mengarang angka; kutip hanya horizon yang diberikan.\n\n"
            f"Horizon (ground truth): {horizons_txt}"
        )
        resp = await LLMGateway.generate_content(
            prompt=prompt,
            model_name=settings.opencode_driver_model,
            temperature=0.2
        )
        if resp and len(resp.strip()) > 10:
            narrative = resp.strip()
    except Exception as le:
        logger.warning(
            "PredictionAgent: narrative expansion unavailable, "
            "keeping deterministic summary: %s",
            le,
        )

    estimated_delay_hours = round(congestion_forecast["6h"]["delay_min"] / 60.0, 2)

    # Agent-status telemetry is a write path too; a rejected write must surface.
    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("PredictionAgent", "complete", confidence, summary_text)
    except Exception as write_err:
        logger.warning(
            "PredictionAgent: agent status write rejected; "
            "degraded_sources=write_rejected error=%s",
            write_err,
        )
        _degrade("write_rejected", write_err)

    # Dashboard contract: "quiet" means every path answered with no usable
    # evidence; "degraded" names exactly which path died.
    if degraded_sources:
        evidence_health = "degraded"
    elif not segments and not candidates and not has_history:
        evidence_health = "quiet"
    else:
        evidence_health = "nominal"

    finding: AgentFinding = {
        "agent": "PredictionAgent",
        "confidence": confidence,
        "summary": summary_text,
        # Distance is evidence, not decoration: None means "unknown", never 0.0 km.
        "distance_km": nearest_segment_distance_km,
        "data": {
            "forecast": congestion_forecast,
            "data_points_used": len(delays),
            "has_historical_precedents": has_history,
            "distance_km": nearest_segment_distance_km,
            "nearest_segment_name": nearest_segment["name"] if nearest_segment is not None else None,
            "nearest_segment_distance_km": nearest_segment_distance_km,
            "estimated_delay_hours": estimated_delay_hours,
            "open_meteo_flood_risk_pct": open_meteo_flood_risk,
            "open_meteo_precipitation_mm_24h": open_meteo_precip,
            "weather_station_name": weather_station_name,
            "weather_distance_km": weather_distance_km,
            "weather_provenance": weather_provenance,
            # Degradation ledger (quiet day vs dead path).
            "degraded_sources": degraded_sources,
            "errors": errors,
            "evidence_health": evidence_health,
            **({"narrative": narrative} if narrative else {})
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    logger.info(f"Agent 3 finished. Confidence: {confidence}")
    return {
        "congestion_forecast": congestion_forecast,
        "prediction_finding": finding,
        "messages": state.get("messages", []) + ["PredictionAgent: Generated traffic and incident forecasts incorporating Open-Meteo."]
    }
