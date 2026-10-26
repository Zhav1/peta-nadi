"""
Outcome Evaluation & Statistical Recalibration Service.
Computes prediction vs. ground-truth field outcome variances (delay error, price inflation error)
and calculates conservative recalibration advisories with damped learning rates (eta = 0.05).
"""
import os
import json
import hashlib
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
# Mapping contract:
# - Outcomes carry the STORED forecast (pred_prob + raw_prob + p_max +
#   weights_version + active_sources + forecast_created_at, migration 021 /
#   local_storage WS-A columns) written at decision time. The live aggregate
#   reads that stored pred_prob verbatim — it never recomputes or proxies the
#   probability.
# - Rows WITHOUT a stored pred (legacy rows, DISPATCHER_APPROVAL system
#   echoes, or writers that had no forecast) are EXCLUDED from live N and
#   counted as missing_pred (never silently defaulted, e.g. to 0.99).
# - actual = 1 iff observed_delay_hours >= LIVE_DISRUPTION_DELAY_HOURS.
# - Rows with verification_source == DISPATCHER_APPROVAL are system echoes
#   (approvals.py mirrors eta_hours as observed_delay) and are excluded
#   separately (counted as excluded_echoes), before the missing_pred check.
# - Classification + calibration formulas are identical to
#   scripts/evaluate_metrics.py (TP/FP/TN/FN -> precision/recall/F1/FPR/
#   accuracy; Brier + 10-bin ECE via probability_calibration).
# ==========================================================================

LIVE_MIN_N = 10
LIVE_DISRUPTION_DELAY_HOURS = 2.0
LIVE_ECHO_VERIFICATION_SOURCE = "DISPATCHER_APPROVAL"
LIVE_BATCH_VERSION = "batch-v2026-10-26-N60"

# WS-B: offline ledger-join evidence (additive — batch immutable, LIVE_MIN_N kept).
PER_ROW_CAP = 200
PIHPS_CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "raw" / "pihps_bi" / "api_cache"
PROXY_LABEL = "PROXY"


def _stable_row_hash(
    incident_id: str,
    pred_prob: Any,
    actual: int,
    timestamp: Any,
) -> str:
    """Stable sha256 over incident_id + pred + actual + timestamp."""
    try:
        pred_txt = f"{float(pred_prob):.4f}"
    except (TypeError, ValueError):
        pred_txt = "none"
    basis = f"{incident_id}|{pred_txt}|{int(actual)}|{timestamp or ''}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def _safe_float_or_none(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        result = float(value)
    except (TypeError, ValueError):
        return None
    import math as _math
    return result if _math.isfinite(result) else None


def _binary_metrics_from_counts(
    tp: int, fp: int, tn: int, fn: int, n: int
) -> tuple:
    """Identical formulas to scripts/evaluate_metrics.py (4dp rounding)."""
    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
    f1 = round(2 * precision * recall / (precision + recall), 4) if (precision + recall) > 0 else 0.0
    fpr = round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0.0
    accuracy = round((tp + tn) / n, 4) if n > 0 else 0.0
    return precision, recall, f1, fpr, accuracy


def _load_pihps_price_corroboration(
    cache_dir: Optional[Path] = None,
    cap_files: int = 500,
) -> Dict[str, Any]:
    """Read-only PIHPS file-cache price corroboration (never live HTTP).

    Scans the local api_cache JSON files purely as evidence that the staple-
    price series exists for corroborating outcome actual_price_spike_pct.
    Any read failure degrades to available=False — never an exception.
    """
    summary: Dict[str, Any] = {
        "mode": "file_cache_readonly",
        "cache_dir": "data/raw/pihps_bi/api_cache",
        "files_scanned": 0,
        "files_ok": 0,
        "files_failed": 0,
        "available": False,
        "note": "",
    }
    target = Path(cache_dir) if cache_dir else PIHPS_CACHE_DIR
    try:
        files = sorted(target.glob("*.json"))[:cap_files]
    except Exception as e:
        summary["note"] = f"PIHPS cache unreadable ({e}); price corroboration unavailable."
        return summary
    ok = fail = 0
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                json.load(f)
            ok += 1
        except Exception:
            fail += 1
    summary.update(
        files_scanned=len(files),
        files_ok=ok,
        files_failed=fail,
        available=ok > 0,
        note=(
            f"PIHPS file cache read-only: {ok}/{len(files)} berkas terbaca "
            f"untuk koroborasi harga (tanpa HTTP live)."
            if files else
            "PIHPS file cache kosong/tidak ada; koroborasi harga tidak tersedia."
        ),
    )
    return summary


def _realised_travel_entries(
    travels: Optional[List[Dict[str, Any]]] = None,
    limit: int = 5000,
) -> tuple:
    """Index realised ledger actuals by disruption/travel key.

    Realised actual = actual_time_hours - baseline_time_hours where
    actual_recorded is truthy. Unrecorded rits never enter the index.
    Returns (index, stats); store failures degrade to empty (never raise).
    """
    stats = {"travels_scanned": 0, "realised": 0, "matched_keys": 0}
    index: Dict[str, Dict[str, Any]] = {}
    rows = travels
    if rows is None:
        try:
            rows = local_storage.list_travels(limit=limit)
        except Exception as e:
            logger.warning(f"Offline ledger: travel ledger unreadable ({e})")
            rows = []
    rows = rows or []
    stats["travels_scanned"] = len(rows)
    for t in rows:
        if not t.get("actual_recorded"):
            continue
        try:
            actual_t = float(t.get("actual_time_hours"))
            base_t = float(t.get("baseline_time_hours"))
        except (TypeError, ValueError):
            continue
        entry = {
            "observed_delay_hours": round(actual_t - base_t, 2),
            "travel_id": t.get("id"),
            "disruption_id": t.get("disruption_id"),
        }
        stats["realised"] += 1
        for key in (t.get("disruption_id"), t.get("id")):
            if key and key not in index:
                index[key] = entry
    stats["matched_keys"] = len(index)
    return index, stats


def _assemble_per_row(
    incident_id: str,
    pred_prob: float,
    raw_prob: Optional[float],
    p_max: Optional[float],
    weights_version: Any,
    active_sources: Any,
    forecast_created_at: Any,
    observed_delay_hours: float,
    actual_price_spike_pct: Optional[float],
    verification_source: Any,
    ledger_entry: Optional[Dict[str, Any]] = None,
    created_at: Any = None,
) -> Dict[str, Any]:
    """One auditable per-row record with a stable row_hash."""
    actual = 1 if float(observed_delay_hours) >= LIVE_DISRUPTION_DELAY_HOURS else 0
    ts = forecast_created_at or created_at or ""
    led_delay = ledger_entry.get("observed_delay_hours") if ledger_entry else None
    return {
        "incident_id": incident_id,
        "pred_prob": round(float(pred_prob), 4),
        "raw_prob": round(float(raw_prob), 4) if raw_prob is not None else None,
        "p_max": float(p_max) if p_max is not None else None,
        "weights_version": weights_version,
        "active_sources": active_sources,
        "forecast_created_at": forecast_created_at,
        "observed_delay_hours": round(float(observed_delay_hours), 2),
        "actual": actual,
        "actual_price_spike_pct": float(actual_price_spike_pct) if actual_price_spike_pct is not None else None,
        "verification_source": verification_source,
        "pred_source": "stored",
        "ledger_delay_hours": led_delay,
        "ledger_travel_id": (ledger_entry or {}).get("travel_id"),
        "ledger_corroborated": (
            abs(float(led_delay) - float(observed_delay_hours)) <= 0.5
            if led_delay is not None else None
        ),
        "row_hash": _stable_row_hash(incident_id, pred_prob, actual, ts),
    }


def _ledger_dataset_hash(row_hashes: List[str], n: int) -> str:
    """sha256 ledger query hash over sorted row hashes + N (stable)."""
    basis = "|".join(sorted(row_hashes)) + f"|n={n}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


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


def _load_supabase_outcomes(limit: int = 1000) -> List[Dict[str, Any]]:
    """Best-effort remote read of ground_truth_outcomes (anon SELECT).

    Vercel/Render backends run on an ephemeral filesystem, so the local
    SQLite mirror is empty after every cold start / redeploy. The remote
    Supabase table is the durable store — without this fallback the live
    aggregate would permanently report N=0 in prod and hide behind the
    batch baseline. Any failure (no creds, offline, RLS, missing table)
    degrades to [] — never raises. Rows from projects that have not
    applied migration 021 simply lack pred_* keys and are counted as
    missing_pred downstream (never defaulted).
    """
    try:
        from app.db.supabase_client import get_client

        sb = get_client()
    except Exception as e:
        logger.debug(f"Live aggregate: Supabase client unavailable ({e})")
        return []
    try:
        res = (
            sb.table("ground_truth_outcomes")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = getattr(res, "data", None) or []
        return [dict(r) for r in rows if isinstance(r, dict)]
    except Exception as e:
        logger.warning(f"Live aggregate: Supabase outcome read skipped ({e})")
        return []


def _merge_outcome_rows(
    local_rows: Optional[List[Dict[str, Any]]],
    remote_rows: Optional[List[Dict[str, Any]]],
) -> tuple:
    """Union local + remote outcomes, suppressing dual-write mirrors.

    POST /outcomes dual-writes (Supabase first, then a local mirror), so
    the same field verification normally exists in BOTH stores. A remote
    row whose mirror key (incident_id, verification_source,
    observed_delay_hours) already exists locally is dropped — unless the
    local copy lacks a usable pred_prob and the remote copy has one, in
    which case the remote copy upgrades it in place (this is how pre-021
    slim mirrors regain their forecast after migration 021 is applied).
    Rows novel to either store are always kept verbatim: local row
    identity is untouched, so localhost aggregates are byte-identical to
    the pre-fallback behaviour, and a cold-start host (empty local store)
    sees the full remote union. Echo rows (DISPATCHER_APPROVAL) keep
    their own key and stay countable as excluded_echoes.
    Returns (merged, local_n, remote_n).
    """
    merged: List[Dict[str, Any]] = []
    index: Dict[str, int] = {}

    def _mirror_key(r: Dict[str, Any]) -> str:
        try:
            delay = round(float(r.get("observed_delay_hours") or 0.0), 2)
        except (TypeError, ValueError):
            delay = 0.0
        return (
            f"{r.get('incident_id') or ''}|{r.get('verification_source') or ''}|{delay}"
        )

    def _has_usable_pred(r: Dict[str, Any]) -> bool:
        return _safe_float_or_none(r.get("pred_prob")) is not None

    for r in list(local_rows or []):
        if not isinstance(r, dict):
            continue
        key = _mirror_key(r)
        index.setdefault(key, len(merged))
        merged.append(r)
    for r in list(remote_rows or []):
        if not isinstance(r, dict):
            continue
        # Only local keys are indexed: a remote mirror of a known local
        # verification is dropped (or upgrades a pred-less local copy),
        # while remote rows novel to the local store — and remote-remote
        # repeats — are kept verbatim, exactly as local-local repeats are.
        pos = index.get(_mirror_key(r))
        if pos is None:
            merged.append(r)
        elif not _has_usable_pred(merged[pos]) and _has_usable_pred(r):
            merged[pos] = r
    return merged, len(local_rows or []), len(remote_rows or [])


def compute_live_cumulative_metrics(
    outcomes: Optional[List[Dict[str, Any]]] = None,
    min_n: int = LIVE_MIN_N,
    limit: int = 1000,
) -> Dict[str, Any]:
    """
    Aggregate live field outcomes using their STORED forecast probabilities.
    Returns {n, sufficient, metrics|None, calibration|None, confusion_matrix|None,
    excluded_echoes, missing_pred, note}. Metrics are None when n < min_n.
    Rows without a stored pred_prob are excluded (missing_pred), never proxied.
    """
    from app.services.probability_calibration import (
        brier_score,
        expected_calibration_error,
        PlattScalingCalibrator,
        IsotonicRegressionCalibrator,
    )

    if outcomes is None:
        try:
            local_rows = local_storage.list_outcomes(limit=limit)
        except Exception as e:
            logger.warning(f"Live aggregate: outcome store unreadable ({e})")
            local_rows = []
        # Prod hosts (Vercel/Render) have an ephemeral FS: local SQLite is
        # empty after each deploy, so merge the durable Supabase rows.
        # Explicit `outcomes=` callers (tests, scripts) bypass the merge.
        remote_rows = _load_supabase_outcomes(limit=limit)
        outcomes, local_n, remote_n = _merge_outcome_rows(local_rows, remote_rows)
        live_source = (
            "live_outcomes_merged" if remote_rows else "live_outcomes_offline"
        )
    else:
        local_n, remote_n = len(outcomes or []), 0
        live_source = "live_outcomes_offline"

    genuine: List[Dict[str, Any]] = []
    excluded_echoes = 0
    missing_pred = 0
    proxy_count = 0
    for o in outcomes or []:
        if str(o.get("verification_source") or "") == LIVE_ECHO_VERIFICATION_SOURCE:
            excluded_echoes += 1
            continue
        pred = o.get("pred_prob")
        try:
            pred_f = float(pred) if pred is not None and pred != "" else None
        except (TypeError, ValueError):
            pred_f = None
        if pred_f is None or not (0.0 <= pred_f <= 1.0):
            # Honest exclusion: no stored forecast -> not part of live N.
            missing_pred += 1
            if pred is None or pred == "":
                # No stored forecast at all -> PROXY bucket (counted
                # separately, never merged into live N).
                proxy_count += 1
            continue
        genuine.append(o)

    n = len(genuine)

    # WS-B offline evidence: realised ledger join + read-only PIHPS cache.
    # No live HTTP anywhere on this path (local SQLite + local files only).
    ledger_index, ledger_stats = _realised_travel_entries()
    price_corroboration = _load_pihps_price_corroboration()
    all_rows = [
        _assemble_per_row(
            incident_id=str(o.get("incident_id") or ""),
            pred_prob=float(o.get("pred_prob")),
            raw_prob=_safe_float_or_none(o.get("raw_prob")),
            p_max=_safe_float_or_none(o.get("p_max")),
            weights_version=o.get("weights_version"),
            active_sources=o.get("active_sources"),
            forecast_created_at=o.get("forecast_created_at"),
            observed_delay_hours=_safe_float_or_none(o.get("observed_delay_hours")) or 0.0,
            actual_price_spike_pct=_safe_float_or_none(o.get("actual_price_spike_pct")),
            verification_source=o.get("verification_source"),
            ledger_entry=ledger_index.get(str(o.get("incident_id") or "")),
            created_at=o.get("created_at"),
        )
        for o in genuine
    ]
    all_hashes = [r["row_hash"] for r in all_rows]
    dataset_hash = _ledger_dataset_hash(all_hashes, n)
    per_row_total = len(all_rows)
    per_row = all_rows[:PER_ROW_CAP]
    row_hash_sample = all_hashes[:3]
    ledger_block = {
        **ledger_stats,
        "matched_genuine": sum(1 for r in all_rows if r["ledger_travel_id"] is not None),
    }

    if n < min_n:
        return {
            "n": n,
            "min_n": min_n,
            "sufficient": False,
            "source": live_source,
            "local_n": local_n,
            "remote_n": remote_n,
            "excluded_echoes": excluded_echoes,
            "missing_pred": missing_pred,
            "proxy_count": proxy_count,
            "confusion_matrix": None,
            "metrics": None,
            "calibration": None,
            "deltas_vs_batch": None,
            "per_row": per_row,
            "per_row_total": per_row_total,
            "per_row_truncated": per_row_total > len(per_row),
            "row_hash_sample": row_hash_sample,
            "dataset_hash": dataset_hash,
            "ledger": ledger_block,
            "price_corroboration": price_corroboration,
            "note": (
                f"Live N={n} belum cukup (butuh >= {min_n}) untuk agregat kumulatif - "
                f"menampilkan baseline batch immutable {LIVE_BATCH_VERSION} "
                f"(minus {excluded_echoes} echo sistem, {missing_pred} tanpa pred tersimpan, "
                f"{proxy_count} PROXY tidak digabung ke N)."
            ),
        }

    y_true: List[int] = []
    y_prob: List[float] = []
    y_true_raw: List[int] = []
    y_raw: List[float] = []
    tp = fp = tn = fn = 0
    for o in genuine:
        try:
            actual_delay = float(o.get("observed_delay_hours") or 0.0)
        except (TypeError, ValueError):
            actual_delay = 0.0
        actual = 1 if actual_delay >= LIVE_DISRUPTION_DELAY_HOURS else 0
        # Stored forecast only — the missing_pred filter above guarantees presence.
        prob = float(o.get("pred_prob"))
        predicted = 1 if prob >= 0.50 else 0

        y_true.append(actual)
        y_prob.append(prob)
        raw_f = _safe_float_or_none(o.get("raw_prob"))
        if raw_f is not None and 0.0 <= raw_f <= 1.0:
            # Aligned raw subset: same actual, un-normalized product probability.
            y_true_raw.append(actual)
            y_raw.append(raw_f)
        if actual == 1 and predicted == 1:
            tp += 1
        elif actual == 0 and predicted == 1:
            fp += 1
        elif actual == 0 and predicted == 0:
            tn += 1
        else:
            fn += 1

    precision, recall, f1, fpr, accuracy = _binary_metrics_from_counts(tp, fp, tn, fn, n)

    b_score = round(float(brier_score(y_true, y_prob)), 4)
    raw_brier = round(float(brier_score(y_true_raw, y_raw)), 4) if y_raw else None
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
        "source": live_source,
        "local_n": local_n,
        "remote_n": remote_n,
        "excluded_echoes": excluded_echoes,
        "missing_pred": missing_pred,
        "proxy_count": proxy_count,
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
            "normalized_brier_score": b_score,
            "raw_brier_score": raw_brier,
            "raw_brier_n": len(y_raw),
            "expected_calibration_error": ece_score,
            "platt_calibrated_brier": platt_brier,
            "isotonic_calibrated_brier": isotonic_brier,
            "reliability_bins": bin_details,
        },
        "deltas_vs_batch": None,  # filled by the router against the batch baseline
        "per_row": per_row,
        "per_row_total": per_row_total,
        "per_row_truncated": per_row_total > len(per_row),
        "row_hash_sample": row_hash_sample,
        "dataset_hash": dataset_hash,
        "ledger": ledger_block,
        "price_corroboration": price_corroboration,
        "note": (
            f"Live kumulatif N={n} (minus {excluded_echoes} echo sistem, "
            f"{missing_pred} tanpa pred tersimpan, {proxy_count} PROXY tidak digabung) - "
            f"delta vs batch {LIVE_BATCH_VERSION} dihitung pada metrik yang sama."
        ),
    }


# ==========================================================================
# WS-B: Offline ledger-join aggregate (no live HTTP — local SQLite + files).
# --------------------------------------------------------------------------
# Anchored on REALISED travels-ledger actuals
# (observed = actual_time_hours - baseline_time_hours where actual_recorded),
# joined to the STORED forecast (incidents/outcomes pred_prob written at
# decision time — never recomputed via delay/4.0 when a stored pred exists).
# Realised rits with no stored pred are labelled PROXY, counted in
# proxy_count (+ proxy_sample, cap 10) and NEVER merged into N.
# PIHPS api_cache files under data/raw/pihps_bi/api_cache are read-only price
# corroboration. Formulas identical to scripts/evaluate_metrics.py; Brier is
# reported BOTH raw (on raw_prob) and normalized (forecast P/P_max, i.e. the
# stored pred_prob); ECE is 10-bin via probability_calibration.
# ==========================================================================


def compute_offline_ledger_metrics(
    outcomes: Optional[List[Dict[str, Any]]] = None,
    travels: Optional[List[Dict[str, Any]]] = None,
    min_n: int = LIVE_MIN_N,
    limit: int = 1000,
) -> Dict[str, Any]:
    """Offline join of realised travel actuals to stored forecasts."""
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
            logger.warning(f"Offline ledger: outcome store unreadable ({e})")
            outcomes = []

    # Index stored forecasts (non-echo, usable pred only) by incident_id.
    forecast_index: Dict[str, Dict[str, Any]] = {}
    excluded_echoes = 0
    missing_pred = 0
    for o in outcomes or []:
        if str(o.get("verification_source") or "") == LIVE_ECHO_VERIFICATION_SOURCE:
            excluded_echoes += 1
            continue
        pred_f = _safe_float_or_none(o.get("pred_prob"))
        if pred_f is None or not (0.0 <= pred_f <= 1.0):
            missing_pred += 1
            continue
        key = str(o.get("incident_id") or "")
        if key and key not in forecast_index:
            forecast_index[key] = o

    if travels is None:
        try:
            travels = local_storage.list_travels(limit=5000)
        except Exception as e:
            logger.warning(f"Offline ledger: travel ledger unreadable ({e})")
            travels = []
    ledger_index, ledger_stats = _realised_travel_entries(travels)
    price_corroboration = _load_pihps_price_corroboration()

    realised_entries: List[Dict[str, Any]] = []
    seen_travels = set()
    for t in travels or []:
        if not t.get("actual_recorded"):
            continue
        tid = t.get("id")
        if tid in seen_travels:
            continue
        seen_travels.add(tid)
        try:
            obs = round(float(t.get("actual_time_hours")) - float(t.get("baseline_time_hours")), 2)
        except (TypeError, ValueError):
            continue
        realised_entries.append({
            "observed_delay_hours": obs,
            "travel_id": tid,
            "disruption_id": t.get("disruption_id"),
        })

    all_rows: List[Dict[str, Any]] = []
    proxy_count = 0
    proxy_sample: List[Dict[str, Any]] = []
    for entry in realised_entries:
        matched = None
        for key in (entry.get("disruption_id"), entry.get("travel_id")):
            if key and key in forecast_index:
                matched = forecast_index[key]
                break
        if matched is None:
            # PROXY bucket: no stored pred — labelled, counted, never in N.
            proxy_count += 1
            if len(proxy_sample) < 10:
                proxy_sample.append({
                    "travel_id": entry.get("travel_id"),
                    "disruption_id": entry.get("disruption_id"),
                    "observed_delay_hours": entry.get("observed_delay_hours"),
                    "pred_source": PROXY_LABEL,
                })
            continue
        all_rows.append(_assemble_per_row(
            incident_id=str(matched.get("incident_id") or ""),
            pred_prob=float(matched.get("pred_prob")),
            raw_prob=_safe_float_or_none(matched.get("raw_prob")),
            p_max=_safe_float_or_none(matched.get("p_max")),
            weights_version=matched.get("weights_version"),
            active_sources=matched.get("active_sources"),
            forecast_created_at=matched.get("forecast_created_at"),
            observed_delay_hours=entry["observed_delay_hours"],
            actual_price_spike_pct=_safe_float_or_none(matched.get("actual_price_spike_pct")),
            verification_source=matched.get("verification_source"),
            ledger_entry=entry,
            created_at=matched.get("created_at"),
        ))

    n = len(all_rows)
    all_hashes = [r["row_hash"] for r in all_rows]
    dataset_hash = _ledger_dataset_hash(all_hashes, n)
    per_row_total = len(all_rows)
    per_row = all_rows[:PER_ROW_CAP]
    ledger_block = {
        **ledger_stats,
        "realised_scanned": len(realised_entries),
        "matched_genuine": n,
    }
    base_note = (
        f"Offline ledger N={n} (realised {len(realised_entries)}, "
        f"minus {excluded_echoes} echo, {missing_pred} tanpa pred, "
        f"{proxy_count} PROXY tidak digabung)"
    )

    if n < min_n:
        return {
            "n": n,
            "min_n": min_n,
            "sufficient": False,
            "source": "offline_ledger",
            "excluded_echoes": excluded_echoes,
            "missing_pred": missing_pred,
            "proxy_count": proxy_count,
            "proxy_sample": proxy_sample,
            "confusion_matrix": None,
            "metrics": None,
            "calibration": None,
            "deltas_vs_batch": None,
            "per_row": per_row,
            "per_row_total": per_row_total,
            "per_row_truncated": per_row_total > len(per_row),
            "row_hash_sample": all_hashes[:3],
            "dataset_hash": dataset_hash,
            "ledger": ledger_block,
            "price_corroboration": price_corroboration,
            "note": base_note + f" — belum cukup (butuh >= {min_n}); baseline batch {LIVE_BATCH_VERSION} ditampilkan.",
        }

    y_true = [r["actual"] for r in all_rows]
    y_prob = [r["pred_prob"] for r in all_rows]
    raw_pairs = [(r["actual"], r["raw_prob"]) for r in all_rows
                 if r["raw_prob"] is not None and 0.0 <= r["raw_prob"] <= 1.0]
    y_true_raw = [a for a, _ in raw_pairs]
    y_raw = [p for _, p in raw_pairs]
    tp = sum(1 for r in all_rows if r["actual"] == 1 and r["pred_prob"] >= 0.50)
    fp = sum(1 for r in all_rows if r["actual"] == 0 and r["pred_prob"] >= 0.50)
    tn = sum(1 for r in all_rows if r["actual"] == 0 and r["pred_prob"] < 0.50)
    fn = sum(1 for r in all_rows if r["actual"] == 1 and r["pred_prob"] < 0.50)
    precision, recall, f1, fpr, accuracy = _binary_metrics_from_counts(tp, fp, tn, fn, n)

    b_score = round(float(brier_score(y_true, y_prob)), 4)
    raw_brier = round(float(brier_score(y_true_raw, y_raw)), 4) if y_raw else None
    ece_score, bin_details = expected_calibration_error(y_true, y_prob, n_bins=10)
    try:
        platt = PlattScalingCalibrator().fit(y_prob, y_true)
        platt_brier = round(float(brier_score(y_true, list(platt.predict_proba(y_prob)))), 4)
    except Exception:
        platt_brier = 0.0
    try:
        isotonic = IsotonicRegressionCalibrator().fit(y_prob, y_true)
        iso_brier = round(float(brier_score(y_true, list(isotonic.predict_proba(y_prob)))), 4)
    except Exception:
        iso_brier = 0.0

    return {
        "n": n,
        "min_n": min_n,
        "sufficient": True,
        "source": "offline_ledger",
        "excluded_echoes": excluded_echoes,
        "missing_pred": missing_pred,
        "proxy_count": proxy_count,
        "proxy_sample": proxy_sample,
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
            "mean_latency_ms": 0.0,
            "total_latency_ms": 0.0,
        },
        "calibration": {
            "brier_score": b_score,
            "normalized_brier_score": b_score,
            "raw_brier_score": raw_brier,
            "raw_brier_n": len(y_raw),
            "expected_calibration_error": ece_score,
            "platt_calibrated_brier": platt_brier,
            "isotonic_calibrated_brier": iso_brier,
            "reliability_bins": bin_details,
        },
        "deltas_vs_batch": None,
        "per_row": per_row,
        "per_row_total": per_row_total,
        "per_row_truncated": per_row_total > len(per_row),
        "row_hash_sample": all_hashes[:3],
        "dataset_hash": dataset_hash,
        "ledger": ledger_block,
        "price_corroboration": price_corroboration,
        "note": base_note + f" - delta vs batch {LIVE_BATCH_VERSION} dihitung pada metrik yang sama.",
    }
