import json
import os
import pytest
from scripts.evaluate_metrics import evaluate_benchmark_dataset, convert_sensor_inputs_to_state

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATASET_PATH = os.path.join(PROJECT_ROOT, "data", "benchmark", "sumatra_disruptions_ground_truth.json")


def test_benchmark_dataset_integrity():
    """Verify that the benchmark dataset exists, is valid JSON, and has 60 valid scenario schemas."""
    assert os.path.exists(DATASET_PATH), f"Benchmark dataset missing at {DATASET_PATH}"
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert len(data) == 60, f"Expected 60 scenarios, got {len(data)}"

    required_top_keys = ["id", "name", "province", "corridor", "coordinates", "disaster_type", "sensor_inputs", "ground_truth"]
    required_sensor_keys = ["bmkg_alert_level", "openmeteo_rain_rate_mmh", "tomtom_congestion_delay_min", "tomtom_speed_ratio", "osint_verified_headline", "pihps_staple_price_shock_pct"]
    required_ground_truth_keys = ["is_disruption", "actual_delay_hours", "observed_price_impact_pct", "corridor_severed"]

    for scn in data:
        for k in required_top_keys:
            assert k in scn, f"Scenario {scn.get('id')} missing key '{k}'"
        assert len(scn["coordinates"]) == 2, f"Invalid coordinates in {scn['id']}"

        for sk in required_sensor_keys:
            assert sk in scn["sensor_inputs"], f"Scenario {scn['id']} missing sensor input '{sk}'"

        for gk in required_ground_truth_keys:
            assert gk in scn["ground_truth"], f"Scenario {scn['id']} missing ground truth key '{gk}'"
            assert scn["ground_truth"]["is_disruption"] in (0, 1)


def test_benchmark_dataset_distribution():
    """Verify the balanced realism split: exactly 35 disruptions and 25 controls across 8 provinces."""
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    disruptions = [s for s in data if s["ground_truth"]["is_disruption"] == 1]
    controls = [s for s in data if s["ground_truth"]["is_disruption"] == 0]

    assert len(disruptions) == 35, f"Expected 35 disruption scenarios, got {len(disruptions)}"
    assert len(controls) == 25, f"Expected 25 control scenarios, got {len(controls)}"

    provinces = set(s["province"] for s in data)
    assert len(provinces) == 8, f"Expected 8 Sumatra provinces, got {len(provinces)}: {provinces}"

    expected_provinces = {
        "Sumatera Utara", "Sumatera Barat", "Riau", "Jambi",
        "Sumatera Selatan", "Lampung", "Aceh", "Bengkulu"
    }
    assert provinces == expected_provinces


def test_evaluation_engine_execution():
    """Execute evaluation engine programmatically and assert empirical performance thresholds pass."""
    report = evaluate_benchmark_dataset(DATASET_PATH, verbose=False)

    assert report["total_scenarios"] == 60
    assert report["gating_passed"] is True

    m = report["metrics"]
    assert m["precision"] >= 0.85, f"Precision {m['precision']} < 0.85"
    assert m["recall"] >= 0.80, f"Recall {m['recall']} < 0.80"
    assert m["f1_score"] >= 0.82, f"F1 {m['f1_score']} < 0.82"
    assert m["false_positive_rate"] <= 0.15, f"FPR {m['false_positive_rate']} > 0.15"
    assert m["mean_latency_ms"] < 50.0, f"Mean latency {m['mean_latency_ms']}ms exceeds 50ms"