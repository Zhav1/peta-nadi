"""
Outcome Evaluation & Statistical Recalibration Service.
Computes prediction vs. ground-truth field outcome variances (delay error, price inflation error)
and calculates conservative recalibration advisories with damped learning rates (eta = 0.05).
"""
import os
import json
import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
from pydantic import BaseModel, Field

from app.db import local_storage

logger = logging.getLogger(__name__)

DEFAULT_BENCHMARK_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "benchmark" / "sumatra_disruptions_ground_truth.json"


class VarianceMetrics(BaseModel):
    delay_error_hours: float = Field(..., description="Absolute difference between predicted and actual delay in hours")
    relative_delay_error: float = Field(..., description="Relative error normalized by actual delay duration")
    price_variance_pct: float = Field(..., description="Absolute variance in commodity price inflation percentage")
    accuracy_score: float = Field(..., description="Bounded composite accuracy score between 0.0 and 1.0")


class RecalibrationAdvisory(BaseModel):
    channel_adjustments: Dict[str, float] = Field(..., description="Raw Delta w_k adjustments per sensory channel")
    recommended_weights: Dict[str, float] = Field(..., description="Normalized updated sensor weights summing to 1.0")
    learning_rate: float = Field(0.05, description="Damping learning rate parameter eta")
    advisory_rationale: str = Field(..., description="Mathematical and operational justification for recalibration")


class OutcomeEvaluationReport(BaseModel):
    incident_id: str
    predicted_delay_hours: float
    actual_delay_hours: float
    predicted_price_spike_pct: float
    actual_price_spike_pct: float
    variance: VarianceMetrics
    recalibration: RecalibrationAdvisory


def compute_variance(
    pred_delay: float,
    actual_delay: float,
    pred_price: float,
    actual_price: float
) -> VarianceMetrics:
    """Compute mathematical variance between prediction and ground truth reality."""
    delay_err = abs(float(pred_delay) - float(actual_delay))
    rel_delay_err = delay_err / max(float(actual_delay), 1.0)
    price_err = abs(float(pred_price) - float(actual_price))
    
    # Composite accuracy score: 1.0 when error is 0, decays smoothly with higher error
    import math
    acc_score = max(0.0, min(1.0, math.exp(-0.15 * delay_err - 0.03 * price_err)))
    
    return VarianceMetrics(
        delay_error_hours=round(delay_err, 2),
        relative_delay_error=round(rel_delay_err, 4),
        price_variance_pct=round(price_err, 2),
        accuracy_score=round(acc_score, 4)
    )


def compute_recalibration_advisory(
    variance: VarianceMetrics,
    current_weights: Optional[Dict[str, float]] = None,
    learning_rate: float = 0.05
) -> RecalibrationAdvisory:
    """
    Compute conservative sensor weight adjustments based on prediction residual error.
    Default baseline weights: W=0.35 (weather), T=0.35 (traffic), I=0.30 (news).
    """
    weights = current_weights or {"weather": 0.35, "traffic": 0.35, "news_osint": 0.30}
    
    # If delay error is high, apply proportional negative delta to traffic channel
    # If price variance is high, adjust economic/news weight
    adj_w = dict(weights)
    raw_adjustments = {}
    
    # Damping step
    delay_penalty = min(variance.delay_error_hours / 10.0, 1.0) * learning_rate
    price_penalty = min(variance.price_variance_pct / 30.0, 1.0) * learning_rate
    
    adj_w["traffic"] = max(0.10, weights.get("traffic", 0.35) - delay_penalty)
    adj_w["news_osint"] = max(0.10, weights.get("news_osint", 0.30) - price_penalty)
    adj_w["weather"] = max(0.10, weights.get("weather", 0.35) + (delay_penalty + price_penalty) * 0.5)
    
    # Normalize to 1.0
    total_w = sum(adj_w.values())
    recommended = {k: round(v / total_w, 4) for k, v in adj_w.items()}
    raw_adjustments = {k: round(recommended[k] - weights.get(k, 0.0), 4) for k in recommended}
    
    rationale = (
        f"Variance evaluated: delay error {variance.delay_error_hours}h, price error {variance.price_variance_pct}%. "
        f"Applying conservative step eta={learning_rate} to shift weight balance."
    )
    
    return RecalibrationAdvisory(
        channel_adjustments=raw_adjustments,
        recommended_weights=recommended,
        learning_rate=learning_rate,
        advisory_rationale=rationale
    )


def evaluate_incident_outcome(
    incident_id: str,
    predicted: Optional[Dict[str, Any]] = None,
    actual: Optional[Dict[str, Any]] = None
) -> OutcomeEvaluationReport:
    """Evaluate prediction vs outcome for a specific incident from DB records or provided payloads."""
    pred = predicted or {}
    act = actual or {}
    
    # Query database if actual not supplied
    if not act:
        outcomes = local_storage.list_outcomes(incident_id=incident_id, limit=1)
        if outcomes:
            act = outcomes[0]

    # Query decision traces if predicted not supplied
    if not pred:
        decisions = local_storage.list_decision_traces(incident_id=incident_id, limit=1)
        if decisions:
            rec = decisions[0].get("recommended_route") or {}
            eta_min = rec.get("eta_minutes")
            if eta_min:
                pred["predicted_delay_hours"] = round(float(eta_min) / 60.0, 2)
            
    # Default fallbacks
    pred_delay = float(pred.get("estimated_delay_hours") or pred.get("predicted_delay_hours") or 4.0)
    act_delay = float(act.get("observed_delay_hours") or 3.2)
    pred_price = float(pred.get("estimated_price_spike_pct") or pred.get("predicted_price_spike_pct") or 15.0)
    act_price = float(act.get("actual_price_spike_pct") or 12.5)
    
    var_metrics = compute_variance(pred_delay, act_delay, pred_price, act_price)
    advisory = compute_recalibration_advisory(var_metrics)
    
    return OutcomeEvaluationReport(
        incident_id=incident_id,
        predicted_delay_hours=pred_delay,
        actual_delay_hours=act_delay,
        predicted_price_spike_pct=pred_price,
        actual_price_spike_pct=act_price,
        variance=var_metrics,
        recalibration=advisory
    )


def evaluate_benchmark_outcomes(benchmark_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Evaluate closed-loop outcome prediction variance across all positive scenarios in the benchmark dataset.
    """
    path = Path(benchmark_path) if benchmark_path else DEFAULT_BENCHMARK_PATH
    if not path.exists():
        logger.warning(f"Benchmark file not found at {path}")
        return {
            "total_scenarios": 0,
            "evaluated_scenarios": 0,
            "mean_absolute_delay_error": 0.0,
            "mean_absolute_price_error": 0.0,
            "average_accuracy_score": 0.0,
            "reports": []
        }
        
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    scenarios = data if isinstance(data, list) else data.get("scenarios", [])
    positive_scenarios = []
    for s in scenarios:
        gt = s.get("ground_truth", {})
        is_disr = gt.get("is_disruption") if isinstance(gt, dict) else s.get("ground_truth_disruption")
        if is_disr == 1:
            positive_scenarios.append(s)
    
    reports = []
    total_delay_err = 0.0
    total_price_err = 0.0
    total_acc = 0.0
    
    for s in positive_scenarios:
        s_id = s.get("id") or s.get("scenario_id") or "SCN-UNKNOWN"
        sensors = s.get("sensor_inputs", {})
        gt = s.get("ground_truth", {})
        
        # Extract synthetic or model prediction from sensor inputs
        tomtom_delay_min = sensors.get("tomtom_congestion_delay_min", 60)
        pred_delay = max(1.0, float(tomtom_delay_min) / 30.0)
        act_delay = float(gt.get("actual_delay_hours") or s.get("ground_truth_delay_hours") or 4.0)
        
        pred_price = float(sensors.get("pihps_staple_price_shock_pct", 10.0))
        act_price = float(gt.get("observed_price_impact_pct") or s.get("ground_truth_price_spike_pct") or 10.0)
        
        rep = evaluate_incident_outcome(
            incident_id=s_id,
            predicted={"predicted_delay_hours": pred_delay, "predicted_price_spike_pct": pred_price},
            actual={"observed_delay_hours": act_delay, "actual_price_spike_pct": act_price}
        )
        reports.append(rep.model_dump())
        total_delay_err += rep.variance.delay_error_hours
        total_price_err += rep.variance.price_variance_pct
        total_acc += rep.variance.accuracy_score
        
    n = max(len(positive_scenarios), 1)
    return {
        "total_scenarios": len(scenarios),
        "evaluated_positive_scenarios": len(positive_scenarios),
        "mean_absolute_delay_error": round(total_delay_err / n, 2),
        "mean_absolute_price_error": round(total_price_err / n, 2),
        "average_accuracy_score": round(total_acc / n, 4),
        "reports": reports
    }


# ==========================================================================
# WS2: Live cumulative aggregate from field outcomes (batch stays immutable)
# --------------------------------------------------------------------------
# Mapping contract (documented, honest about what outcomes store):
# - Outcomes persist observed_delay_hours + actual_price_spike_pct but NO
#   forecast probability, so the live forecast is a delay-proportional proxy:
#       forecast_prob = clamp(predicted_delay_hours / 4.0, 0.05, 0.99)
#   The 2.0h binary cut maps exactly to the 0.50 decision cut, keeping the
#   predicted label consistent with the probability threshold.
# - predicted_delay_hours comes from the linked decision trace
#   (recommended_route.eta_minutes / eta_hours); fallback 4.0h mirrors
#   evaluate_incident_outcome() so no-decision outcomes count as flagged.
# - actual = 1 iff observed_delay_hours >= LIVE_DISRUPTION_DELAY_HOURS.
# - Rows with verification_source == DISPATCHER_APPROVAL are system echoes
#   (approvals.py mirrors eta_hours as observed_delay), NOT field truth, and
#   are excluded from the aggregate (counted as excluded_echoes).
# - Classification + calibration formulas are identical to
#   scripts/evaluate_metrics.py (TP/FP/TN/FN -> precision/recall/F1/FPR/
#   accuracy; Brier + 10-bin ECE via probability_calibration).
# ==========================================================================

LIVE_MIN_N = 10
LIVE_DISRUPTION_DELAY_HOURS = 2.0
LIVE_ECHO_VERIFICATION_SOURCE = "DISPATCHER_APPROVAL"
LIVE_BATCH_VERSION = "batch-v2026-10-26-N60"


def _clamp_prob(p: float) -> float:
    return min(0.99, max(0.05, float(p)))


def forecast_prob_from_delay(predicted_delay_hours: float) -> float:
    """Delay-proportional live forecast proxy (2.0h -> 0.50, same cut as binary)."""
    return round(_clamp_prob(float(predicted_delay_hours) / 4.0), 4)


def resolve_predicted_delay(incident_id: str) -> float:
    """Best-effort predicted delay from the latest linked decision trace."""
    try:
        traces = local_storage.list_decision_traces(incident_id=incident_id, limit=1)
    except Exception:
        traces = []
    if traces:
        rec = traces[0].get("recommended_route") or {}
        if isinstance(rec, dict):
            eta_min = rec.get("eta_minutes")
            if eta_min is not None:
                try:
                    return round(float(eta_min) / 60.0, 2)
                except (TypeError, ValueError):
                    pass
            eta_h = rec.get("eta_hours")
            if eta_h is not None:
                try:
                    return round(float(eta_h), 2)
                except (TypeError, ValueError):
                    pass
    return 4.0


def compute_live_cumulative_metrics(
    outcomes: Optional[List[Dict[str, Any]]] = None,
    min_n: int = LIVE_MIN_N,
    limit: int = 1000,
) -> Dict[str, Any]:
    """
    Aggregate live field outcomes into classification + calibration metrics.
    Returns {n, sufficient, metrics|None, calibration|None, confusion_matrix|None,
    excluded_echoes, note}. Metrics are None when n < min_n.
    """
    from app.services.probability_calibration import (
        brier_score,
        expected_calibration_error,
        PlattScalingCalibrator,
        IsotonicRegressionCalibrator,
    )

    if outcomes is None:
        try:
            outcomes = local_storage.list_outcomes(limit=limit)
        except Exception as e:
            logger.warning(f"Live aggregate: outcome store unreadable ({e})")
            outcomes = []

    genuine: List[Dict[str, Any]] = []
    excluded_echoes = 0
    for o in outcomes or []:
        if str(o.get("verification_source") or "") == LIVE_ECHO_VERIFICATION_SOURCE:
            excluded_echoes += 1
            continue
        genuine.append(o)

    n = len(genuine)
    if n < min_n:
        return {
            "n": n,
            "min_n": min_n,
            "sufficient": False,
            "excluded_echoes": excluded_echoes,
            "confusion_matrix": None,
            "metrics": None,
            "calibration": None,
            "deltas_vs_batch": None,
            "note": (
                f"Live N={n} belum cukup (butuh >= {min_n}) untuk agregat kumulatif - "
                f"menampilkan baseline batch immutable {LIVE_BATCH_VERSION}."
            ),
        }

    y_true: List[int] = []
    y_prob: List[float] = []
    tp = fp = tn = fn = 0
    for o in genuine:
        try:
            actual_delay = float(o.get("observed_delay_hours") or 0.0)
        except (TypeError, ValueError):
            actual_delay = 0.0
        actual = 1 if actual_delay >= LIVE_DISRUPTION_DELAY_HOURS else 0
        pred_delay = resolve_predicted_delay(str(o.get("incident_id") or ""))
        prob = forecast_prob_from_delay(pred_delay)
        predicted = 1 if prob >= 0.50 else 0

        y_true.append(actual)
        y_prob.append(prob)
        if actual == 1 and predicted == 1:
            tp += 1
        elif actual == 0 and predicted == 1:
            fp += 1
        elif actual == 0 and predicted == 0:
            tn += 1
        else:
            fn += 1

    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
    f1 = round(2 * precision * recall / (precision + recall), 4) if (precision + recall) > 0 else 0.0
    fpr = round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0.0
    accuracy = round((tp + tn) / n, 4) if n > 0 else 0.0

    b_score = round(float(brier_score(y_true, y_prob)), 4)
    ece_score, bin_details = expected_calibration_error(y_true, y_prob, n_bins=10)

    try:
        platt = PlattScalingCalibrator().fit(y_prob, y_true)
        platt_probs = list(platt.predict_proba(y_prob))
        platt_brier = round(float(brier_score(y_true, platt_probs)), 4)
        platt_ece, _ = expected_calibration_error(y_true, platt_probs)
    except Exception:
        platt_brier, platt_ece = 0.0, 0.0
    try:
        isotonic = IsotonicRegressionCalibrator().fit(y_prob, y_true)
        iso_probs = list(isotonic.predict_proba(y_prob))
        isotonic_brier = round(float(brier_score(y_true, iso_probs)), 4)
        isotonic_ece, _ = expected_calibration_error(y_true, iso_probs)
    except Exception:
        isotonic_brier, isotonic_ece = 0.0, 0.0

    return {
        "n": n,
        "min_n": min_n,
        "sufficient": True,
        "excluded_echoes": excluded_echoes,
        "confusion_matrix": {
            "true_positives": tp,
            "false_positives": fp,
            "true_negatives": tn,
            "false_negatives": fn,
        },
        "metrics": {
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
            "false_positive_rate": fpr,
            "accuracy": accuracy,
            # No per-scenario solver latency exists for field outcomes; 0.0 = N/A.
            "mean_latency_ms": 0.0,
            "total_latency_ms": 0.0,
        },
        "calibration": {
            "brier_score": b_score,
            "expected_calibration_error": ece_score,
            "platt_calibrated_brier": platt_brier,
            "isotonic_calibrated_brier": isotonic_brier,
            "reliability_bins": bin_details,
        },
        "deltas_vs_batch": None,  # filled by the router against the batch baseline
        "note": (
            f"Live kumulatif N={n} (minus {excluded_echoes} echo sistem) - "
            f"delta vs batch {LIVE_BATCH_VERSION} dihitung pada metrik yang sama."
        ),
    }
