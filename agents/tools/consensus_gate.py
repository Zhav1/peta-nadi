"""
PetaNadi / PreHub — Probabilistic Consensus Gate
Implements the formal probabilistic independence formulation from the technical proposal:
P_disruption(s) = 1 - prod_{k in {W, T, I, E}} (1 - w_k(t, d) * p_k(s))

Features:
- Exponential temporal decay: e^(-lambda * delta_t) with lambda = 0.05 / hour.
- Spatial distance decay: e^(-d / d_0) with d_0 = 25.0 km.
- Strict sensor decoupling (FR-11.2): internal route optimization findings (Agent 4)
  do not vote in the consensus gate.
"""
import math
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from agents.state import CrisisState

logger = logging.getLogger(__name__)

# Default baseline sensor weights (proposal section 4.3)
DEFAULT_SENSOR_WEIGHTS = {
    "weather": 0.35,      # BMKG radar, severe weather warnings (w_W)
    "traffic": 0.35,      # TomTom traffic flow, congestion, obstruction (w_T)
    "osint": 0.30,        # ANTARA news, verified OSINT dispatch (w_I)
    "economics": 0.20,    # PIHPS staple price anomaly (auxiliary validation)
}

LAMBDA_TEMPORAL_DECAY = 0.05  # Decay per hour (e^(-0.05 * hours))
D0_SPATIAL_DECAY_KM = 25.0    # Characteristic distance in km (e^(-d / 25))


def compute_temporal_decay(timestamp_str: Optional[str], ref_time: Optional[datetime] = None) -> float:
    """Calculates exponential temporal decay factor e^(-lambda * delta_t)."""
    if not timestamp_str:
        return 1.0
    try:
        if isinstance(timestamp_str, (int, float)):
            age_hours = max(0.0, float(timestamp_str))
        else:
            # Parse ISO timestamp
            dt_str = timestamp_str.replace("Z", "+00:00")
            ts = datetime.fromisoformat(dt_str)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            now = ref_time or datetime.now(timezone.utc)
            age_seconds = max(0.0, (now - ts).total_seconds())
            age_hours = age_seconds / 3600.0

        return math.exp(-LAMBDA_TEMPORAL_DECAY * age_hours)
    except Exception as e:
        logger.debug(f"Failed to calculate temporal decay for '{timestamp_str}': {e}")
        return 1.0


def compute_spatial_decay(distance_km: Optional[float]) -> float:
    """Calculates spatial distance decay factor e^(-d / d_0)."""
    if distance_km is None or distance_km <= 0.0:
        return 1.0
    try:
        return math.exp(-float(distance_km) / D0_SPATIAL_DECAY_KM)
    except Exception:
        return 1.0


def calibrate_confidence_scale(p_raw: float, active_sources: int, weights: Optional[Dict[str, float]] = None) -> float:
    """
    Calibrates raw probabilistic independence value into normalized [0.0, 1.0] operational scale.
    Normalizes by theoretical maximum P_max = 1 - prod(1 - w_k) so that complete multi-sensor
    confirmation reaches 1.0.
    """
    if p_raw <= 0.0:
        return 0.0
    if p_raw >= 1.0:
        return 1.0

    w_dict = weights or DEFAULT_SENSOR_WEIGHTS
    p_max = 1.0 - math.prod(1.0 - min(1.0, max(0.0, w)) for w in w_dict.values())
    if p_max <= 0.0:
        p_max = 0.7634

    norm_p = min(1.0, max(0.0, p_raw / p_max))
    return round(norm_p, 4)


def compute_consensus(state: CrisisState) -> Dict[str, Any]:
    """
    Computes formal probabilistic consensus score across independent sensory observation channels.
    Strictly decouples external sensor evidence from internal agent outputs.
    """
    # 1. Extract sensory channels
    # Channel W: Meteorological / Weather (Data Collection / BMKG / Open-Meteo)
    weather_finding = state.get("data_collection_finding") or {}
    weather_conf = float(weather_finding.get("confidence", 0.5))
    weather_ts = weather_finding.get("timestamp")
    weather_dist = weather_finding.get("distance_km")

    # Channel T: Traffic & Road Telemetry (TomTom flow / delay)
    # Check prediction or dedicated traffic finding
    traffic_finding = state.get("prediction_finding") or state.get("traffic_finding") or {}
    traffic_conf = float(traffic_finding.get("confidence", 0.5))
    traffic_ts = traffic_finding.get("timestamp")
    traffic_dist = traffic_finding.get("distance_km")

    # Channel I: OSINT Verified News Intelligence (ANTARA regional bureaus)
    osint_finding = state.get("osint_hazard_finding") or {}
    osint_conf = float(osint_finding.get("confidence", 0.5))
    osint_ts = osint_finding.get("timestamp")
    osint_dist = osint_finding.get("distance_km")

    # Channel E: Commodity Price Anomaly (PIHPS)
    econ_finding = state.get("economic_intelligence_finding") or {}
    econ_conf = float(econ_finding.get("confidence", 0.5))
    econ_ts = econ_finding.get("timestamp")
    econ_dist = econ_finding.get("distance_km")

    # 2. Compute dynamic weights with spatio-temporal decay
    decay_w = compute_temporal_decay(weather_ts) * compute_spatial_decay(weather_dist)
    decay_t = compute_temporal_decay(traffic_ts) * compute_spatial_decay(traffic_dist)
    decay_i = compute_temporal_decay(osint_ts) * compute_spatial_decay(osint_dist)
    decay_e = compute_temporal_decay(econ_ts) * compute_spatial_decay(econ_dist)

    w_w = DEFAULT_SENSOR_WEIGHTS["weather"] * decay_w
    w_t = DEFAULT_SENSOR_WEIGHTS["traffic"] * decay_t
    w_i = DEFAULT_SENSOR_WEIGHTS["osint"] * decay_i
    w_e = DEFAULT_SENSOR_WEIGHTS["economics"] * decay_e

    decay_applied = any(d < 0.999 for d in [decay_w, decay_t, decay_i, decay_e])

    # 3. Probabilistic Independence Product: P = 1 - prod(1 - w_k * p_k)
    term_w = 1.0 - (w_w * weather_conf)
    term_t = 1.0 - (w_t * traffic_conf)
    term_i = 1.0 - (w_i * osint_conf)
    term_e = 1.0 - (w_e * econ_conf)

    non_detection_prob = term_w * term_t * term_i * term_e
    raw_p_disruption = max(0.0, min(1.0, 1.0 - non_detection_prob))

    # 4. Count active independent observation sensors (FR-11.2: exclude route_optimization)
    active_sources = 0
    if state.get("data_collection_finding") and weather_conf > 0.5:
        active_sources += 1
    if (state.get("prediction_finding") or state.get("traffic_finding")) and traffic_conf > 0.5:
        active_sources += 1
    if state.get("osint_hazard_finding") and osint_conf > 0.5:
        active_sources += 1
    if state.get("economic_intelligence_finding") and econ_conf > 0.5:
        active_sources += 1

    # 5. Calibrated operational confidence
    calibrated_confidence = calibrate_confidence_scale(raw_p_disruption, active_sources)

    # 6. Consensus promotion criteria: confidence >= 0.85 and at least 2 independent sensors
    is_validated = calibrated_confidence >= 0.85 and active_sources >= 2

    breakdown = {
        "weather": round(w_w * weather_conf, 4),
        "traffic": round(w_t * traffic_conf, 4),
        "osint": round(w_i * osint_conf, 4),
        "economics": round(w_e * econ_conf, 4),
    }

    return {
        "overall_confidence": round(calibrated_confidence, 4),
        "raw_probability": round(raw_p_disruption, 4),
        "consensus_breakdown": breakdown,
        "active_sources": active_sources,
        "decay_applied": decay_applied,
        "route": "validated" if is_validated else "unconfirmed",
    }
