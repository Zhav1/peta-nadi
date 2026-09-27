"""
Pydantic v2 Schemas for Evaluation & Benchmark Dashboard.
Provides models for empirical benchmark reports, reliability diagram calibration bins,
exhaustive automated test matrix inventory, and corridor routing efficiency metrics.
"""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class ConfusionMatrix(BaseModel):
    true_positives: int = Field(..., description="Count of correctly detected real disruptions")
    false_positives: int = Field(..., description="Count of false alarms on benign scenarios")
    true_negatives: int = Field(..., description="Count of correctly ignored benign conditions")
    false_negatives: int = Field(..., description="Count of missed real disruptions")


class EvaluationMetrics(BaseModel):
    precision: float = Field(..., description="Precision score TP / (TP + FP)")
    recall: float = Field(..., description="Recall / sensitivity score TP / (TP + FN)")
    f1_score: float = Field(..., description="Harmonic mean of precision and recall")
    false_positive_rate: float = Field(..., description="False positive rate FP / (FP + TN)")
    accuracy: float = Field(..., description="Overall classification accuracy")
    mean_latency_ms: float = Field(..., description="Average inference latency per scenario in ms")
    total_latency_ms: float = Field(..., description="Total execution time for full benchmark suite in ms")


class ReliabilityBinItem(BaseModel):
    bin_index: int = Field(..., description="0-indexed partition interval")
    range: List[float] = Field(..., description="[lower_bound, upper_bound] probability range")
    sample_count: int = Field(..., description="Number of scenarios falling into this bin")
    mean_confidence: float = Field(..., description="Average predicted probability in this bin")
    empirical_accuracy: float = Field(..., description="Observed positive rate in this bin")
    calibration_error: float = Field(..., description="Absolute difference |empirical_acc - mean_conf|")


class CalibrationReport(BaseModel):
    brier_score: float = Field(..., description="Mean squared difference between predicted prob and outcome (BS <= 0.10)")
    expected_calibration_error: float = Field(..., description="Weighted average calibration error across bins")
    platt_calibrated_brier: float = Field(..., description="Brier score after parametric Platt scaling")
    isotonic_calibrated_brier: float = Field(..., description="Brier score after non-parametric Isotonic regression")
    reliability_bins: List[ReliabilityBinItem] = Field(..., description="10 partitioned calibration bins")


class BenchmarkThresholds(BaseModel):
    min_precision: float = Field(0.85, description="Required minimum precision")
    min_recall: float = Field(0.80, description="Required minimum recall")
    min_f1: float = Field(0.82, description="Required minimum composite F1 score")
    max_brier_score: float = Field(0.10, description="Maximum allowable Brier score for honesty calibration")


class BenchmarkReportResponse(BaseModel):
    status: str = Field("success", description="Response status")
    timestamp: str = Field(..., description="Evaluation execution timestamp ISO string")
    total_scenarios: int = Field(60, description="Total benchmark evaluation scenarios")
    confusion_matrix: ConfusionMatrix
    metrics: EvaluationMetrics
    calibration: CalibrationReport
    thresholds: BenchmarkThresholds
    gating_passed: bool = Field(True, description="Whether all benchmark thresholds were satisfied")


class TestCaseItem(BaseModel):
    test_id: str = Field(..., description="Unique test identifier, e.g. TEST-FR01-01")
    fr_id: str = Field(..., description="Functional Requirement ID, e.g. FR-1")
    category: str = Field(..., description="Requirement domain category")
    module: str = Field(..., description="Test module or component path")
    test_type: str = Field("Unit", description="Test type: Unit, Integration, Schema, Audit, WebGL")
    scenario: str = Field(..., description="Test scenario description and input vectors")
    expected_invariant: str = Field(..., description="Expected assertion invariant")
    result: str = Field("Passed", description="Execution result")
    execution_time_ms: Optional[float] = Field(None, description="Test execution duration in milliseconds")


class TestMatrixResponse(BaseModel):
    status: str = Field("success", description="Response status")
    total_tests: int = Field(..., description="Total automated and architectural tests")
    passed_tests: int = Field(..., description="Count of passing tests")
    failed_tests: int = Field(0, description="Count of failing tests")
    fr_domain_counts: Dict[str, int] = Field(..., description="Test counts broken down by FR domain")
    tests: List[TestCaseItem] = Field(..., description="List of individual test cases")


class CorridorEfficiencyItem(BaseModel):
    corridor_name: str = Field(..., description="Human readable corridor name")
    origin: str = Field(..., description="Origin hub name")
    destination: str = Field(..., description="Destination hub name")
    modality: str = Field("truck", description="Transport modality: truck, maritime, air")
    baseline_distance_km: float = Field(..., description="Normal distance along standard route in km")
    blocked_delay_hours: float = Field(..., description="Expected delay if trapped in blockage (hours)")
    reroute_distance_km: float = Field(..., description="Total distance along dynamic detour (km)")
    reroute_delay_minutes: float = Field(..., description="Detour time overhead compared to freeflow (minutes)")
    time_saved_hours: float = Field(..., description="Net hours saved by taking the detour")
    fuel_saved_liters: float = Field(..., description="Estimated fuel saved by avoiding idling/congestion")
    cost_saved_idr: int = Field(..., description="Operational cost savings in IDR")
    solver_latency_ms: float = Field(..., description="CPU solver computation time in ms")


class CorridorEfficiencyResponse(BaseModel):
    status: str = Field("success", description="Response status")
    corridors: List[CorridorEfficiencyItem] = Field(..., description="List of analyzed corridor reroutes")
    total_cost_saved_idr: int = Field(..., description="Aggregate cost savings across representative corridors")
    avg_time_saved_hours: float = Field(..., description="Average travel time saved per rerouted unit in hours")
