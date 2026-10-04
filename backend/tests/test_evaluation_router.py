"""
Unit and Integration Tests for Evaluation & Benchmark Router (FR-14, NFR-1).
Verifies empirical benchmark scorecards, 10-bin calibration distribution,
exhaustive 81-test matrix filtering, and corridor reroute efficiency metrics.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_benchmark_report():
    """Verify GET /api/v1/evaluation/benchmark returns empirical metrics & calibration."""
    response = client.get("/api/v1/evaluation/benchmark")
    assert response.status_code == 200, f"Failed: {response.text}"
    data = response.json()

    assert data["status"] == "success"
    assert data["total_scenarios"] == 60

    # Verify confusion matrix
    cm = data["confusion_matrix"]
    assert cm["true_positives"] + cm["false_positives"] + cm["true_negatives"] + cm["false_negatives"] == 60
    assert cm["true_positives"] == 34
    assert cm["false_positives"] == 0

    # Verify empirical metrics meet threshold invariants
    metrics = data["metrics"]
    assert metrics["precision"] >= 0.85, f"Precision {metrics['precision']} < 0.85"
    assert metrics["recall"] >= 0.80, f"Recall {metrics['recall']} < 0.80"
    assert metrics["f1_score"] >= 0.82, f"F1 score {metrics['f1_score']} < 0.82"
    assert metrics["mean_latency_ms"] < 100.0  # sub-second latency requirement

    # Verify calibration & Brier score honesty (BS <= 0.10)
    calib = data["calibration"]
    assert calib["brier_score"] <= 0.10, f"Brier score {calib['brier_score']} > 0.10"
    assert len(calib["reliability_bins"]) == 10, f"Expected 10 bins, got {len(calib['reliability_bins'])}"

    # Check bin coverage
    total_bin_samples = sum(b["sample_count"] for b in calib["reliability_bins"])
    assert total_bin_samples == 60, f"Total bin samples {total_bin_samples} != 60"

    assert data["gating_passed"] is True


def test_get_test_matrix_full():
    """Verify GET /api/v1/evaluation/test-matrix returns the exhaustive 81-test inventory."""
    response = client.get("/api/v1/evaluation/test-matrix")
    assert response.status_code == 200, f"Failed: {response.text}"
    data = response.json()

    assert data["status"] == "success"
    assert data["total_tests"] == 137
    assert data["passed_tests"] == 137
    assert data["failed_tests"] == 0

    # Verify FR domains are properly tracked
    domains = data["fr_domain_counts"]
    assert "FR-1" in domains and domains["FR-1"] == 5
    assert "FR-2" in domains and domains["FR-2"] == 4
    assert "FR-3" in domains and domains["FR-3"] == 2
    assert "FR-4" in domains and domains["FR-4"] == 15
    assert "FR-5" in domains and domains["FR-5"] == 11
    assert "FR-6" in domains and domains["FR-6"] == 3
    assert "FR-7" in domains and domains["FR-7"] == 3
    assert "FR-8" in domains and domains["FR-8"] == 4
    assert "FR-9" in domains and domains["FR-9"] == 3
    assert "FR-10" in domains and domains["FR-10"] == 3
    assert "FR-11" in domains and domains["FR-11"] == 17
    assert "FR-12" in domains and domains["FR-12"] == 8
    assert "FR-13" in domains and domains["FR-13"] == 4
    assert "FR-14" in domains and domains["FR-14"] == 5
    assert "FR-15" in domains and domains["FR-15"] == 15
    assert "FR-16" in domains and domains["FR-16"] == 9
    assert "FR-17" in domains and domains["FR-17"] == 5
    assert "FR-18" in domains and domains["FR-18"] == 6
    assert "FR-19" in domains and domains["FR-19"] == 6
    assert "FR-20" in domains and domains["FR-20"] == 9

    assert len(data["tests"]) == 137
    first_test = data["tests"][0]
    assert "test_id" in first_test
    assert "category" in first_test
    assert "module" in first_test
    assert "expected_invariant" in first_test
    assert first_test["result"] == "Passed"


def test_get_test_matrix_filtered_by_fr():
    """Verify GET /api/v1/evaluation/test-matrix?fr_id=FR-11 returns only FR-11 test cases."""
    response = client.get("/api/v1/evaluation/test-matrix?fr_id=FR-11")
    assert response.status_code == 200
    data = response.json()

    assert data["total_tests"] == 17
    for t in data["tests"]:
        assert t["fr_id"] == "FR-11"


def test_get_test_matrix_search_query():
    """Verify GET /api/v1/evaluation/test-matrix?search=Dijkstra filters accurately."""
    response = client.get("/api/v1/evaluation/test-matrix?search=Dijkstra")
    assert response.status_code == 200
    data = response.json()

    assert data["total_tests"] >= 1
    for t in data["tests"]:
        match = (
            "dijkstra" in t["test_id"].lower() or
            "dijkstra" in t["scenario"].lower() or
            "dijkstra" in t["module"].lower() or
            "dijkstra" in t["category"].lower()
        )
        assert match


def test_get_corridor_efficiency():
    """Verify GET /api/v1/evaluation/corridor-efficiency returns deterministic savings."""
    response = client.get("/api/v1/evaluation/corridor-efficiency")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "success"
    assert len(data["corridors"]) >= 3
    assert data["total_cost_saved_idr"] > 0
    assert data["avg_time_saved_hours"] > 0

    for corridor in data["corridors"]:
        assert corridor["time_saved_hours"] > 0
        assert corridor["cost_saved_idr"] > 0
        assert corridor["fuel_saved_liters"] > 0
        assert corridor["solver_latency_ms"] < 10.0  # CPU Dijkstra is sub-10ms
