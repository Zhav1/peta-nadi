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
    SENSOR_WEIGHTS_ECONOMIC_ACTIVE,
    SENSOR_WEIGHTS_PHYSICAL_ONLY,
)
from app.services.probability_calibration import (
    brier_score,
    expected_calibration_error,
    PlattScalingCalibrator,
    IsotonicRegressionCalibrator,
    calibrate_disruption_probability
)
import os
from pathlib import Path
from scripts.evaluate_metrics import evaluate_benchmark_dataset

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BENCHMARK_PATH = os.path.join(PROJECT_ROOT, "data", "benchmark", "sumatra_disruptions_ground_truth.json")


def _distance_bearing_state():
    """Three strong sensors with explicit, realistic proximity (km)."""
    return {
        # TomTom's nearest corridor segment is 4.2 km away; the BMKG radar
        # station is 12.5 km away. Explicit geometry, never a 0.0 km default.
        "data_collection_finding": {"confidence": 0.8, "distance_km": 12.5},
        "prediction_finding": {"confidence": 0.8, "distance_km": 4.2},
        "osint_hazard_finding": {"confidence": 0.9, "distance_km": 4.2},
        "economic_intelligence_finding": {"confidence": 0.4},
    }


def test_consensus_formula_independence():
    """Verify P = 1 - prod(1 - w_k(t, d) * p_k) including spatial decay.

    econ_conf = 0.4 is below the 0.50 PIHPS activation gate, so the gate uses the
    physically re-normalized W/T/I profile (0.4375/0.3125/0.25) and E = 0.0.
    """
    state = _distance_bearing_state()
    res = compute_consensus(state)

    # Hand calculation with e^(-d / 25) applied per channel.
    w_w = SENSOR_WEIGHTS_PHYSICAL_ONLY["weather"] * math.exp(-12.5 / 25.0)
    w_t = SENSOR_WEIGHTS_PHYSICAL_ONLY["traffic"] * math.exp(-4.2 / 25.0)
    w_i = SENSOR_WEIGHTS_PHYSICAL_ONLY["osint"] * math.exp(-4.2 / 25.0)
    w_e = SENSOR_WEIGHTS_PHYSICAL_ONLY["economics"]

    term_w = 1.0 - (w_w * 0.8)
    term_t = 1.0 - (w_t * 0.8)
    term_i = 1.0 - (w_i * 0.9)
    term_e = 1.0 - (w_e * 0.4)

    expected_p = 1.0 - (term_w * term_t * term_i * term_e)
    assert pytest.approx(res["raw_probability"], 0.001) == round(expected_p, 4)
    assert res["active_sources"] == 3  # weather(0.8), traffic(0.8), osint(0.9) > 0.5; econ(0.4) <= 0.5
    assert set(res["consensus_breakdown"].keys()) == {"weather", "traffic", "osint", "economics"}
    assert res["consensus_breakdown"]["economics"] == 0.0
    assert "RouteOptimizationAgent" not in res["consensus_breakdown"]

    # Real proximity still corroborates physically (both channels are <= 30 km),
    # but the decayed confidence is honestly below the 0.85 promotion bar.
    assert res["bmkg_cross_validation"]["is_corroborated"] is True
    assert res["validation_mode"] == "physical_corroboration"
    assert res["route"] == "unconfirmed"
    assert res["overall_confidence"] < 0.85
    # BMKG corroboration floors confidence at the weather finding's own value
    # (0.80) — still honestly below the 0.85 promotion bar. P_max uses the
    # active physical subset only (E contributes no dead weight).
    p_max = 1.0 - math.prod(
        1.0 - SENSOR_WEIGHTS_PHYSICAL_ONLY[k] for k in ("weather", "traffic", "osint")
    )
    assert res["overall_confidence"] == max(
        round(expected_p / p_max, 4), 0.8
    )


def test_consensus_missing_distance_blocks_corroboration():
    """Unknown sensor distance is unknown evidence: it must never self-corroborate."""
    state = {
        "data_collection_finding": {"confidence": 0.8},
        "prediction_finding": {"confidence": 0.8},
        "osint_hazard_finding": {"confidence": 0.9},
        "economic_intelligence_finding": {"confidence": 0.4},
    }
    res = compute_consensus(state)

    # Probability product is undecayed (re-normalized physical W/T/I; E inactive),
    # but the physical claim is refused.
    assert pytest.approx(res["raw_probability"], 0.001) == 0.6222
    assert res["bmkg_cross_validation"]["is_corroborated"] is False
    assert res["route"] == "unconfirmed"
    assert res["overall_confidence"] <= 0.50


def test_consensus_simulated_run_is_discounted():
    """Simulation keeps its routing bypass but reports lower confidence than observed evidence."""
    evidence = {
        "data_collection_finding": {"confidence": 0.9, "distance_km": 5.0},
        "prediction_finding": {"confidence": 0.8, "distance_km": 5.0},
        "osint_hazard_finding": {"confidence": 0.9},
        "economic_intelligence_finding": {"confidence": 0.8},
    }
    observed = compute_consensus(dict(evidence))
    simulated = compute_consensus({**evidence, "is_simulated": True})

    assert observed["route"] == "validated"
    assert simulated["route"] == "validated"  # demo replay route is preserved
    assert simulated["validation_mode"] == "simulation_bypass"
    assert simulated["overall_confidence"] < observed["overall_confidence"]
    assert simulated["overall_confidence"] == round(
        observed["overall_confidence"] * 0.90, 4
    )


def test_consensus_dynamic_e_channel_normalization():
    """E votes only while PIHPS is anomalous; otherwise W/T/I re-normalize to 1.0."""
    physical = {
        "data_collection_finding": {"confidence": 0.9, "distance_km": 5.0},
        "prediction_finding": {"confidence": 0.8, "distance_km": 5.0},
        "osint_hazard_finding": {"confidence": 0.9, "distance_km": 5.0},
    }

    quiet = compute_consensus(
        {**physical, "pre_economic_signal": {"confidence": 0.30, "anomalous_commodities": []}}
    )
    assert quiet["economic_channel_active"] is False
    assert quiet["economic_signal_source"] == "pre_economic_signal"
    assert quiet["consensus_breakdown"]["economics"] == 0.0
    assert quiet["active_sources"] == 3
    assert quiet["route"] == "validated"

    spiking = compute_consensus(
        {**physical, "pre_economic_signal": {"confidence": 0.90, "anomalous_commodities": ["Cabai Merah"]}}
    )
    assert spiking["economic_channel_active"] is True
    assert spiking["economic_signal_source"] == "pre_economic_signal"
    assert spiking["consensus_breakdown"]["economics"] == round(
        SENSOR_WEIGHTS_ECONOMIC_ACTIVE["economics"] * 0.90, 4
    )
    assert spiking["active_sources"] == 4
    assert spiking["route"] == "validated"

    # AgentFinding shape: confidence lives at top level, payload under data.
    finding = compute_consensus(
        {
            **physical,
            "economic_intelligence_finding": {
                "confidence": 0.80,
                "data": {"inflation_forecast": {"inflation_multiplier": 1.1}},
            },
        }
    )
    assert finding["economic_channel_active"] is True
    assert finding["economic_signal_source"] == "economic_intelligence_finding"
    assert finding["consensus_breakdown"]["economics"] > 0.0


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
    """NFR-4: Brier Score <= 0.10 on the N=60 ground-truth Sumatra benchmark.

    Scored on the probabilistic consensus output. The benchmark fixture carries
    no sensor-proximity metadata, so the physical corroboration gate honestly
    refuses to infer 0 km (see test_consensus_missing_distance_blocks_corroboration)
    and its route is not used as the detection decision here.
    """
    report = evaluate_benchmark_dataset(BENCHMARK_PATH)
    bs = report["calibration"]["brier_score"]
    assert bs <= 0.10, f"Brier score {bs} exceeded NFR-4 target of 0.10"
    assert report["thresholds"]["probabilistic_decision_threshold"] == 0.50
    assert report["gating_passed"] is True
