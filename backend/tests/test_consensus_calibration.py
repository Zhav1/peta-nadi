"""
Unit and Integration Tests for Probabilistic Consensus Gate and Probability Calibration Service
Requirements Covered: FR-11.1, FR-11.2, FR-11.3, NFR-4
"""
import pytest
import math
import numpy as np
from datetime import datetime, timezone, timedelta

from agents.tools.consensus_gate import (
    compute_consensus,
    compute_temporal_decay,
    compute_spatial_decay,
    calibrate_confidence_scale,
    DEFAULT_SENSOR_WEIGHTS
)
from app.services.probability_calibration import (
    brier_score,
    expected_calibration_error,
    PlattScalingCalibrator,
    IsotonicRegressionCalibrator,
    calibrate_disruption_probability
)
from scripts.evaluate_metrics import evaluate_benchmark_dataset


def test_consensus_formula_independence():
    """Verify that consensus gate follows P = 1 - prod(1 - w_k * p_k)."""
    state = {
        "data_collection_finding": {"confidence": 0.8},
        "prediction_finding": {"confidence": 0.8},
        "osint_hazard_finding": {"confidence": 0.9},
        "economic_intelligence_finding": {"confidence": 0.4}
    }
    res = compute_consensus(state)
    
    # Hand calculation:
    w_w = DEFAULT_SENSOR_WEIGHTS["weather"]  # 0.35
    w_t = DEFAULT_SENSOR_WEIGHTS["traffic"]  # 0.35
    w_i = DEFAULT_SENSOR_WEIGHTS["osint"]    # 0.30
    w_e = DEFAULT_SENSOR_WEIGHTS["economics"]# 0.20

    term_w = 1.0 - (w_w * 0.8) # 1 - 0.28 = 0.72
    term_t = 1.0 - (w_t * 0.8) # 1 - 0.28 = 0.72
    term_i = 1.0 - (w_i * 0.9) # 1 - 0.27 = 0.73
    term_e = 1.0 - (w_e * 0.4) # 1 - 0.08 = 0.92

    expected_p = 1.0 - (term_w * term_t * term_i * term_e) # 1.0 - 0.3483 = 0.6517
    assert pytest.approx(res["raw_probability"], 0.001) == round(expected_p, 4)
    assert res["active_sources"] == 3  # weather(0.8), traffic(0.8), osint(0.9) > 0.5; econ(0.4) <= 0.5
    assert res["route"] == "validated"


def test_consensus_temporal_decay():
    """Verify that temporal decay e^(-lambda * delta_t) discounts stale findings."""
    now = datetime.now(timezone.utc)
    ts_fresh = now.isoformat()
    ts_10h_old = (now - timedelta(hours=10)).isoformat()
    ts_24h_old = (now - timedelta(hours=24)).isoformat()

    factor_fresh = compute_temporal_decay(ts_fresh, ref_time=now)
    factor_10h = compute_temporal_decay(ts_10h_old, ref_time=now)
    factor_24h = compute_temporal_decay(ts_24h_old, ref_time=now)

    assert pytest.approx(factor_fresh, 0.01) == 1.0
    assert pytest.approx(factor_10h, 0.01) == math.exp(-0.05 * 10)  # ~0.606
    assert pytest.approx(factor_24h, 0.01) == math.exp(-0.05 * 24)  # ~0.301

    # End-to-end consensus with decayed finding
    state_stale = {
        "data_collection_finding": {"confidence": 0.9, "timestamp": ts_24h_old},
        "osint_hazard_finding": {"confidence": 0.9, "timestamp": ts_24h_old}
    }
    res_stale = compute_consensus(state_stale)
    assert res_stale["decay_applied"] is True


def test_consensus_spatial_decay():
    """Verify that spatial distance decay e^(-d / d_0) discounts distant events."""
    factor_0km = compute_spatial_decay(0.0)
    factor_25km = compute_spatial_decay(25.0)
    factor_50km = compute_spatial_decay(50.0)

    assert pytest.approx(factor_0km, 0.01) == 1.0
    assert pytest.approx(factor_25km, 0.01) == math.exp(-1.0)  # ~0.368
    assert pytest.approx(factor_50km, 0.01) == math.exp(-2.0)  # ~0.135


def test_strict_sensor_decoupling_fr11_2():
    """FR-11.2: Verify derived route_optimization findings DO NOT vote or inflate consensus."""
    base_state = {
        "data_collection_finding": {"confidence": 0.6},
        "osint_hazard_finding": {"confidence": 0.4}
    }
    res_before = compute_consensus(base_state)

    state_with_routing = {
        **base_state,
        "route_optimization_finding": {
            "confidence": 0.99,
            "summary": "Detour route computed via Belmera Bypass",
            "data": {"routes": [{"eta": 45}]}
        }
    }
    res_after = compute_consensus(state_with_routing)

    # Route optimization should not alter raw probability, confidence, or active sources
    assert res_before["raw_probability"] == res_after["raw_probability"]
    assert res_before["overall_confidence"] == res_after["overall_confidence"]
    assert res_before["active_sources"] == res_after["active_sources"]


def test_brier_score_metric():
    """Validates Brier score mathematical correctness and edge cases."""
    # Perfect forecast
    assert brier_score([1, 0, 1, 0], [1.0, 0.0, 1.0, 0.0]) == 0.0
    # Worst forecast
    assert brier_score([1, 0], [0.0, 1.0]) == 1.0
    # Moderate calibrated forecast
    y_t = [1, 1, 0, 0]
    y_p = [0.9, 0.8, 0.1, 0.2]
    expected_bs = ((0.9-1)**2 + (0.8-1)**2 + (0.1-0)**2 + (0.2-0)**2) / 4.0 # (0.01+0.04+0.01+0.04)/4 = 0.025
    assert pytest.approx(brier_score(y_t, y_p), 0.0001) == expected_bs


def test_expected_calibration_error():
    """Validates Expected Calibration Error (ECE) and decile binning."""
    y_t = [1, 1, 1, 1, 0, 0, 0, 0]
    y_p = [0.95, 0.92, 0.88, 0.85, 0.12, 0.08, 0.05, 0.02]
    ece, bins = expected_calibration_error(y_t, y_p, n_bins=10)
    assert len(bins) == 10
    assert ece < 0.10


def test_platt_scaling_calibrator():
    """Verifies Platt scaling training and monotonic predictions."""
    calibrator = PlattScalingCalibrator()
    scores = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
    labels = np.array([0, 0, 0, 1, 1, 1])
    calibrator.fit(scores, labels)

    preds = calibrator.predict_proba(scores)
    # Check monotonicity
    assert all(preds[i] <= preds[i+1] for i in range(len(preds) - 1))
    assert preds[0] < 0.3
    assert preds[-1] > 0.7


def test_isotonic_regression_calibrator():
    """Verifies non-parametric Isotonic regression using PAVA."""
    calibrator = IsotonicRegressionCalibrator()
    scores = np.array([0.1, 0.3, 0.4, 0.6, 0.8, 0.95])
    labels = np.array([0, 0, 1, 0, 1, 1])
    calibrator.fit(scores, labels)

    test_scores = np.linspace(0.0, 1.0, 11)
    preds = calibrator.predict_proba(test_scores)
    assert all(preds[i] <= preds[i+1] for i in range(len(preds) - 1))


def test_benchmark_brier_score_threshold_nfr4():
    """NFR-4: Validates Brier Score <= 0.10 on N=60 ground-truth Sumatra benchmark."""
    report = evaluate_benchmark_dataset("data/benchmark/sumatra_disruptions_ground_truth.json")
    bs = report["calibration"]["brier_score"]
    assert bs <= 0.10, f"Brier score {bs} exceeded NFR-4 target of 0.10"
    assert report["gating_passed"] is True
