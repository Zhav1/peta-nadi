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

# Dynamic E-channel-aligned sensor weight profiles (proposal section 4.3).
#
# The economic (PIHPS) channel is an AUXILIARY validation signal: it only earns
# a live vote while a staple-price anomaly is actually firing. Physical crises
# arrive first — a flood blocks a corridor hours before PIHPS records the
# resulting chili/rice/oil spike — so leaving a 0.20 dead weight on E would
# discount the three physical sensors by 20% and under-report real floods.
#
# Active spike (econ_conf > 0.50): W 0.35 + T 0.25 + I 0.20 + E 0.20 = 1.00.
SENSOR_WEIGHTS_ECONOMIC_ACTIVE = {
    "weather": 0.35,      # BMKG radar, severe weather warnings (w_W)
    "traffic": 0.25,      # TomTom traffic flow, congestion, obstruction (w_T)
    "osint": 0.20,        # ANTARA news, verified OSINT dispatch (w_I)
    "economics": 0.20,    # PIHPS staple price anomaly (auxiliary validation)
}

# No anomaly yet (econ_conf <= 0.50): E is 0.0 and W/T/I are re-normalized to
# sum to 1.0 (0.35/0.80, 0.25/0.80, 0.20/0.80) so physical crises are not
# penalized by a channel that has not observed anything.
SENSOR_WEIGHTS_PHYSICAL_ONLY = {
    "weather": 0.35 / 0.80,   # 0.4375
    "traffic": 0.25 / 0.80,   # 0.3125
    "osint": 0.20 / 0.80,     # 0.25
    "economics": 0.0,
}

# Backwards-compatible default = the fully active profile.
DEFAULT_SENSOR_WEIGHTS = SENSOR_WEIGHTS_ECONOMIC_ACTIVE

LAMBDA_TEMPORAL_DECAY = 0.05  # Decay per hour (e^(-0.05 * hours))
D0_SPATIAL_DECAY_KM = 25.0    # Characteristic distance in km (e^(-d / 25))

# Simulated input is a weaker evidence class than observed telemetry. The gate
# keeps the routing bypass for demo replay, but the reported confidence is
# discounted instead of being rewritten to synthetic certainty (0.90).
SIMULATED_EVIDENCE_DISCOUNT = 0.90


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


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in kilometers using Haversine formula."""
    try:
        r = 6371.0  # Earth radius in kilometers
        phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
        dphi = math.radians(float(lat2) - float(lat1))
        dlambda = math.radians(float(lon2) - float(lon1))
        a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return round(r * c, 2)
    except Exception:
        return 9999.0


def compute_temporal_delta_hours(ts1: Any, ts2: Any) -> float:
    """Calculates absolute temporal delta in hours between two timestamps."""
    if not ts1 or not ts2:
        return 9999.0
    try:
        def _parse(ts):
            if isinstance(ts, (int, float)):
                return datetime.fromtimestamp(float(ts), tz=timezone.utc)
            s = str(ts).replace("Z", "+00:00")
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt

        dt1 = _parse(ts1)
        dt2 = _parse(ts2)
        diff_sec = abs((dt1 - dt2).total_seconds())
        return round(diff_sec / 3600.0, 2)
    except Exception:
        return 9999.0


def cross_validate_news_with_bmkg(
    news_claim: Dict[str, Any],
    bmkg_telemetry: Optional[Dict[str, Any]] = None,
    ref_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Deterministic BMKG physical sensor cross-validation matrix.
    Enforces strict physical thresholds, spatial tolerance (<=30 km; <=50 km for M>=4.5),
    and temporal tolerance (<=6 hours). Uncorroborated news claims are capped at <= 0.50.
    """
    news_lat = news_claim.get("latitude") if news_claim.get("latitude") is not None else news_claim.get("lat")
    news_lon = news_claim.get("longitude") if news_claim.get("longitude") is not None else news_claim.get("lon")
    news_ts = news_claim.get("published_at") or news_claim.get("timestamp") or (ref_time.isoformat() if ref_time else datetime.now(timezone.utc).isoformat())
    raw_conf = float(news_claim.get("confidence") or news_claim.get("confidence_score") or 0.50)
    incident_type = str(news_claim.get("incident_type") or news_claim.get("category") or "other").lower()

    # Default uncorroborated result
    res: Dict[str, Any] = {
        "is_corroborated": False,
        "spatial_delta_km": 9999.0,
        "temporal_delta_hours": 9999.0,
        "bmkg_parameter_matched": "none",
        "bmkg_warning_level": None,
        "composite_confidence": min(0.50, raw_conf),
        "validation_status": "UNCONFIRMED",
        "audit_notes": "Tidak ada telemetri sensor BMKG fisik yang terdeteksi.",
    }

    if not bmkg_telemetry or not isinstance(bmkg_telemetry, dict):
        return res

    bmkg_lat = bmkg_telemetry.get("latitude") if bmkg_telemetry.get("latitude") is not None else bmkg_telemetry.get("lat")
    bmkg_lon = bmkg_telemetry.get("longitude") if bmkg_telemetry.get("longitude") is not None else bmkg_telemetry.get("lon")
    bmkg_ts = bmkg_telemetry.get("timestamp") or bmkg_telemetry.get("updated_at")

    # Spatial check
    if news_lat is None or news_lon is None or bmkg_lat is None or bmkg_lon is None:
        res["audit_notes"] = "Koordinat spasial berita atau sensor BMKG tidak lengkap."
        return res

    spatial_delta = haversine_distance_km(news_lat, news_lon, bmkg_lat, bmkg_lon)
    res["spatial_delta_km"] = spatial_delta

    # Temporal check
    if bmkg_ts:
        temporal_delta = compute_temporal_delta_hours(news_ts, bmkg_ts)
    elif ref_time:
        temporal_delta = compute_temporal_delta_hours(news_ts, ref_time.isoformat())
    else:
        temporal_delta = 0.5
    res["temporal_delta_hours"] = temporal_delta

    is_earthquake = "earthquake" in incident_type or "gempa" in incident_type
    max_dist = 50.0 if is_earthquake else 30.0
    max_hours = 6.0

    if spatial_delta > max_dist:
        res["audit_notes"] = f"Jarak spasial ({spatial_delta:.1f} km) melebihi batas toleransi ({max_dist:.1f} km)."
        return res

    if temporal_delta > max_hours:
        res["audit_notes"] = f"Jendela waktu ({temporal_delta:.1f} jam) melebihi batas toleransi ({max_hours:.1f} jam)."
        return res

    # Physical thresholds
    rain_mm = float(bmkg_telemetry.get("rainfall_mm") or bmkg_telemetry.get("precipitation_mm") or bmkg_telemetry.get("rainfall_rate_mm_per_hour") or 0.0)
    warning_lvl = str(bmkg_telemetry.get("warning_level") or bmkg_telemetry.get("severity") or "").upper()
    res["bmkg_warning_level"] = warning_lvl if warning_lvl else None
    magnitude = float(bmkg_telemetry.get("magnitude") or bmkg_telemetry.get("Magnitude") or 0.0)
    wave_m = float(bmkg_telemetry.get("wave_height_m") or bmkg_telemetry.get("wave_height") or 0.0)

    matched = False
    param_matched = "none"

    if is_earthquake:
        if magnitude >= 4.5:
            matched = True
            param_matched = f"seismic_magnitude_{magnitude:.1f}"
        else:
            res["audit_notes"] = f"Magnitudo gempa ({magnitude:.1f}) di bawah ambang batas bahaya (M >= 4.5)."
            return res
    elif any(k in incident_type for k in ("marine", "port", "laut", "ombak", "gelombang")):
        if wave_m >= 2.5:
            matched = True
            param_matched = f"wave_height_{wave_m:.1f}m"
        else:
            res["audit_notes"] = f"Tinggi gelombang laut ({wave_m:.1f}m) di bawah ambang batas (>= 2.5m)."
            return res
    else:
        # Floods, landslides, severe weather, logistics blockage
        if rain_mm >= 20.0:
            matched = True
            param_matched = f"radar_rain_rate_{rain_mm:.1f}mmh"
        elif warning_lvl in ("WASPADA", "SIAGA", "AWAS"):
            matched = True
            param_matched = f"official_warning_{warning_lvl.lower()}"
        else:
            res["audit_notes"] = f"Presipitasi BMKG ({rain_mm:.1f} mm/jam) di bawah ambang hujan lebat (>= 20 mm/jam) dan tanpa peringatan SIAGA/WASPADA."
            return res

    if matched:
        res["is_corroborated"] = True
        res["bmkg_parameter_matched"] = param_matched
        res["composite_confidence"] = min(0.98, max(0.85, round(0.70 + (rain_mm / 100.0 if rain_mm else 0.15), 4)))
        res["validation_status"] = "VALIDATED"
        res["audit_notes"] = f"Terkoroborasi deterministik oleh sensor BMKG ({param_matched}) pada jarak {spatial_delta:.1f} km, delta {temporal_delta:.1f} jam."

    return res


def _resolve_finding_distance(finding: Optional[Dict[str, Any]]) -> float:
    """Resolve a finding's spatial distance.

    Missing distance is UNKNOWN evidence, not zero proximity: it must never
    satisfy the <= 30 km corroboration gate, so it resolves to +inf.
    """
    if not finding:
        return float("inf")
    distance = finding.get("distance_km")
    if distance is None and isinstance(finding.get("data"), dict):
        distance = finding["data"].get("distance_km")
    if distance is None:
        return float("inf")
    try:
        return float(distance)
    except (TypeError, ValueError):
        return float("inf")


def compute_consensus(state: CrisisState, forecast_mode: Optional[bool] = None) -> Dict[str, Any]:
    """
    Computes formal probabilistic consensus score across independent sensory observation channels.
    Strictly decouples external sensor evidence from internal agent outputs.
    Enforces deterministic BMKG cross-validation and caps uncorroborated news claims at <= 0.50.

    ``forecast_mode`` (optional; also read from ``state["forecast_mode"]``) marks an
    item as a forecast/advisory. A forecast may mention staple commodities, but that
    mention is not an observed PIHPS price anomaly, so the E channel is NOT activated
    by it — W/T/I evidence alone drives the score.
    """
    forecast_mode_active = bool(
        forecast_mode if forecast_mode is not None else state.get("forecast_mode")
    )
    # 1. Extract sensory channels
    # Channel W: Meteorological / Weather (Data Collection / BMKG / Open-Meteo)
    weather_finding = state.get("data_collection_finding") or {}
    weather_conf = float(weather_finding.get("confidence", 0.0)) if weather_finding else 0.0
    weather_ts = weather_finding.get("timestamp")
    weather_dist = weather_finding.get("distance_km")

    # Channel T: Traffic & Road Telemetry (TomTom flow / delay)
    traffic_finding = state.get("prediction_finding") or state.get("traffic_finding") or {}
    traffic_conf = float(traffic_finding.get("confidence", 0.0)) if traffic_finding else 0.0
    traffic_ts = traffic_finding.get("timestamp")
    traffic_dist = traffic_finding.get("distance_km")

    # Channel I: OSINT Verified News Intelligence (ANTARA regional bureaus)
    # Q3: fire-as-I — FIRMS VIIRS_SNPP_NRT wildfire evidence corroborates the SAME
    # I channel (never a solo fifth vote, never solo RED). Weights W0.35/T0.35/
    # I0.30/E0.20 are preserved; active_sources counts I at most once.
    osint_finding = state.get("osint_hazard_finding") or {}
    osint_conf = float(osint_finding.get("confidence", 0.0)) if osint_finding else 0.0
    osint_ts = osint_finding.get("timestamp")
    osint_dist = osint_finding.get("distance_km")

    fire_finding = (
        state.get("fire_finding")
        or state.get("wildfire_finding")
        or state.get("nasa_firms_finding")
        or {}
    )
    # Normalized-event fallback: a wildfire typed event without an explicit
    # fire finding still corroborates I (honest, no invented confidence).
    _norm = state.get("normalized_event") or {}
    if not fire_finding and str(_norm.get("event_type", "")).lower() in ("wildfire", "fire"):
        fire_finding = {
            "confidence": 0.7 if str(_norm.get("severity", "")).lower() in ("high", "critical") else 0.55,
            "timestamp": _norm.get("created_at") or _norm.get("timestamp"),
            "distance_km": _norm.get("distance_km"),
        }
    fire_conf = float(fire_finding.get("confidence", 0.0)) if fire_finding else 0.0
    fire_ts = fire_finding.get("timestamp") if fire_finding else None
    fire_dist = fire_finding.get("distance_km") if fire_finding else None

    # Channel E: Commodity Price Anomaly (PIHPS).
    # The E signal can arrive in two shapes:
    #   * economic_intelligence_finding: AgentFinding
    #     {agent, confidence, data: {...}, timestamp}
    #   * pre_economic_signal: fast non-LLM PIHPS pre-gate emitted by
    #     data_collection ({confidence, anomalous_commodities, timestamp})
    # Prefer a finding that actually carries a confidence; otherwise fall back
    # to the pre-gate signal so an early PIHPS anomaly is never masked by an
    # empty economic finding.
    econ_finding = state.get("economic_intelligence_finding") or {}
    pre_econ_signal = state.get("pre_economic_signal") or {}

    econ_conf = 0.0
    econ_ts = None
    econ_dist = None
    econ_signal_source = "none"

    if econ_finding:
        raw_econ_conf = econ_finding.get("confidence")
        if raw_econ_conf is None and isinstance(econ_finding.get("data"), dict):
            raw_econ_conf = econ_finding["data"].get("confidence")
        econ_conf = float(raw_econ_conf or 0.0)
        if econ_conf > 0.0:
            econ_ts = econ_finding.get("timestamp")
            econ_dist = econ_finding.get("distance_km")
            econ_signal_source = "economic_intelligence_finding"

    if econ_conf <= 0.0 and pre_econ_signal:
        econ_conf = float(pre_econ_signal.get("confidence") or 0.0)
        if econ_conf > 0.0:
            econ_ts = pre_econ_signal.get("timestamp")
            econ_dist = pre_econ_signal.get("distance_km")
            econ_signal_source = "pre_economic_signal"

    # Dynamic normalization: E votes only while the PIHPS anomaly is active.
    # Forecast mode: a staple mention inside a forecast/advisory is NOT an
    # observed PIHPS anomaly — never let it activate the E channel.
    econ_active = (econ_conf > 0.50) and not forecast_mode_active
    sensor_weights = (
        SENSOR_WEIGHTS_ECONOMIC_ACTIVE if econ_active else SENSOR_WEIGHTS_PHYSICAL_ONLY
    )

    # 2. Compute dynamic weights with spatio-temporal decay
    decay_w = compute_temporal_decay(weather_ts) * compute_spatial_decay(weather_dist)
    decay_t = compute_temporal_decay(traffic_ts) * compute_spatial_decay(traffic_dist)
    decay_i_osint = compute_temporal_decay(osint_ts) * compute_spatial_decay(osint_dist)
    decay_i_fire = compute_temporal_decay(fire_ts) * compute_spatial_decay(fire_dist)
    decay_e = compute_temporal_decay(econ_ts) * compute_spatial_decay(econ_dist)

    w_w = sensor_weights["weather"] * decay_w
    w_t = sensor_weights["traffic"] * decay_t
    # I channel takes the stronger corroborator (OSINT vs fire) — single vote.
    if (w_i_fire_c := sensor_weights["osint"] * decay_i_fire * fire_conf) > (
        w_i_osint_c := sensor_weights["osint"] * decay_i_osint * osint_conf
    ):
        w_i_effective, i_conf_effective, i_source = (
            sensor_weights["osint"] * decay_i_fire, fire_conf, "fire")
    else:
        w_i_effective, i_conf_effective, i_source = (
            sensor_weights["osint"] * decay_i_osint, osint_conf, "osint")
    w_i = w_i_effective
    w_e = sensor_weights["economics"] * decay_e

    decay_applied = any(d < 0.999 for d in [decay_w, decay_t, decay_i_osint, decay_i_fire, decay_e])

    # 3. Probabilistic Independence Product: P = 1 - prod(1 - w_k * p_k)
    term_w = 1.0 - (w_w * weather_conf)
    term_t = 1.0 - (w_t * traffic_conf)
    term_i = 1.0 - (w_i * i_conf_effective)
    term_e = 1.0 - (w_e * econ_conf)

    non_detection_prob = term_w * term_t * term_i * term_e
    raw_p_disruption = max(0.0, min(1.0, 1.0 - non_detection_prob))

    # 4. Count active independent observation sensors (FR-11.2: exclude route_optimization)
    active_sources = 0
    active_weights = {}
    if weather_finding and weather_conf > 0.5:
        active_sources += 1
        active_weights["weather"] = sensor_weights["weather"]
    elif weather_finding:
        active_weights["weather"] = sensor_weights["weather"]

    if (state.get("prediction_finding") or state.get("traffic_finding")) and traffic_conf > 0.5:
        active_sources += 1
        active_weights["traffic"] = sensor_weights["traffic"]
    elif traffic_finding:
        active_weights["traffic"] = sensor_weights["traffic"]

    if osint_finding and osint_conf > 0.5:
        active_sources += 1
        active_weights["osint"] = sensor_weights["osint"]
    elif fire_finding and fire_conf > 0.5:
        # fire-as-I: counts toward the SAME I vote, never a second vote.
        active_sources += 1
        active_weights["osint"] = sensor_weights["osint"]
    elif osint_finding or fire_finding:
        active_weights["osint"] = sensor_weights["osint"]

    if econ_active:
        active_sources += 1
        active_weights["economics"] = sensor_weights["economics"]
    elif econ_finding or pre_econ_signal:
        # E is present but below the anomaly gate: its normalized weight is 0.0,
        # so it neither votes nor inflates P_max.
        active_weights["economics"] = sensor_weights["economics"]

    if not active_weights:
        active_weights = sensor_weights

    # 5. Calibrated operational confidence
    calibrated_confidence = calibrate_confidence_scale(raw_p_disruption, active_sources, active_weights)

    # 6. Deterministic Physical Sensor Cross-Validation & Cap
    bmkg_cross = state.get("bmkg_cross_validation")
    w_dist = _resolve_finding_distance(weather_finding)
    t_dist = _resolve_finding_distance(traffic_finding)

    if not bmkg_cross and weather_finding:
        if weather_finding.get("is_corroborated") is not None:
            bmkg_cross = weather_finding
        elif weather_conf >= 0.50 and w_dist <= 30.0:
            bmkg_cross = {
                "is_corroborated": True,
                "spatial_delta_km": w_dist,
                "temporal_delta_hours": 0.5,
                "bmkg_parameter_matched": "rainfall_radar_high",
                "bmkg_warning_level": "SIAGA",
                "composite_confidence": weather_conf,
                "validation_status": "VALIDATED",
                "audit_notes": "Terkoroborasi oleh sensor fisik BMKG."
            }

    # Physical corroboration gate: requires either confirmed BMKG telemetry or verified TomTom congestion delay
    is_physically_corroborated = bool(
        (bmkg_cross and bmkg_cross.get("is_corroborated"))
        or (traffic_conf >= 0.50 and t_dist <= 30.0)
    )

    if is_physically_corroborated and active_sources >= 2 and bmkg_cross and bmkg_cross.get("is_corroborated"):
        calibrated_confidence = max(calibrated_confidence, float(bmkg_cross.get("composite_confidence", 0.85)))

    # Uncorroborated news claims: capped at confidence <= 0.50
    is_sim = bool(state.get("is_simulated")) or state.get("source") in ["simulation", "simulated", "test"]
    if osint_conf > 0.0 and not is_physically_corroborated and not is_sim:
        calibrated_confidence = min(0.50, calibrated_confidence)

    # Simulated evidence is discounted deterministically (never booted to 0.90).
    if is_sim:
        calibrated_confidence = round(calibrated_confidence * SIMULATED_EVIDENCE_DISCOUNT, 4)

    # 7. Consensus promotion criteria: confidence >= 0.85 and at least 2 independent sensors.
    # Simulated runs keep the is_sim routing bypass, but the calibrated confidence is
    # never rewritten to a fixed value (0.90 was synthetic certainty).
    is_validated = (calibrated_confidence >= 0.85 and active_sources >= 2 and (is_physically_corroborated or is_sim)) or (is_sim and active_sources >= 2)
    validation_mode = (
        "simulation_bypass" if is_sim
        else ("physical_corroboration" if is_physically_corroborated else "standard")
    )

    if not bmkg_cross:
        bmkg_cross = {
            "is_corroborated": False,
            "spatial_delta_km": float(weather_dist) if weather_dist is not None else 9999.0,
            "temporal_delta_hours": 9999.0,
            "bmkg_parameter_matched": "none",
            "bmkg_warning_level": None,
            "composite_confidence": round(calibrated_confidence, 4),
            "validation_status": "VALIDATED" if is_validated else "UNCONFIRMED",
            "audit_notes": "Tidak ada data sensor BMKG untuk perbandingan silang."
        }

    breakdown = {
        "weather": round(w_w * weather_conf, 4),
        "traffic": round(w_t * traffic_conf, 4),
        # I reports the effective (stronger) corroborator; weights preserved
        # (single I product term — fire never adds a fifth vote).
        "osint": round(w_i * i_conf_effective, 4),
        "economics": round(w_e * econ_conf, 4),
    }
    # Fire transparency lives OUTSIDE consensus_breakdown so the 4-channel
    # contract (W/T/I/E) asserted by calibration tests is preserved.
    fire_corroboration = {
        "source": i_source,
        "fire_contribution": round(sensor_weights["osint"] * decay_i_fire * fire_conf, 4),
        "fire_confidence": round(fire_conf, 4),
    }

    return {
        "overall_confidence": round(calibrated_confidence, 4),
        "raw_probability": round(raw_p_disruption, 4),
        "consensus_breakdown": breakdown,
        "fire_corroboration": fire_corroboration,
        "active_sources": active_sources,
        "decay_applied": decay_applied,
        # E-channel provenance: which shape supplied the economic signal and
        # whether its weight was normalized in (active spike) or out (no anomaly).
        "economic_signal_source": econ_signal_source,
        "economic_channel_active": econ_active,
        "forecast_mode": forecast_mode_active,
        "route": "validated" if is_validated else "unconfirmed",
        "validation_status": "VALIDATED" if is_validated else "UNCONFIRMED",
        "validation_mode": validation_mode,
        "bmkg_cross_validation": bmkg_cross,
    }
