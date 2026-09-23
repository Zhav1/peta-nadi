"""
PreHub — Probability Calibration & Statistical Honesty Service
Provides empirical calibration evaluation (Brier Score, Expected Calibration Error)
and post-hoc calibration transforms (Platt Scaling, Isotonic Regression via PAVA).
"""
import math
import logging
from typing import List, Tuple, Dict, Any, Union, Optional
import numpy as np
from scipy.optimize import minimize

logger = logging.getLogger(__name__)


def brier_score(y_true: Union[List[int], np.ndarray], y_prob: Union[List[float], np.ndarray]) -> float:
    """
    Computes the empirical Brier Score:
    BS = (1 / N) * sum_{i=1}^N (f_i - o_i)^2
    where f_i in [0, 1] is the forecast probability and o_i in {0, 1} is the binary ground-truth outcome.
    A score <= 0.10 indicates high probabilistic calibration.
    """
    y_t = np.asarray(y_true, dtype=np.float64)
    y_p = np.asarray(y_prob, dtype=np.float64)
    
    if len(y_t) == 0:
        return 0.0
    if len(y_t) != len(y_p):
        raise ValueError(f"Length mismatch: y_true ({len(y_t)}) vs y_prob ({len(y_p)})")
    
    return float(np.mean((y_p - y_t) ** 2))


def expected_calibration_error(
    y_true: Union[List[int], np.ndarray], 
    y_prob: Union[List[float], np.ndarray], 
    n_bins: int = 10
) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Calculates Expected Calibration Error (ECE) and reliability diagram bin details.
    Partitions predictions into n_bins uniform intervals [0, 1/M), ..., [ (M-1)/M, 1].
    ECE = sum_{m=1}^M (|B_m| / N) * |acc(B_m) - conf(B_m)|
    """
    y_t = np.asarray(y_true, dtype=np.float64)
    y_p = np.asarray(y_prob, dtype=np.float64)
    N = len(y_t)

    if N == 0:
        return 0.0, []

    bin_boundaries = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    bin_details = []

    for i in range(n_bins):
        bin_lower = bin_boundaries[i]
        bin_upper = bin_boundaries[i + 1]

        # Handle inclusive upper edge on final bin
        if i == n_bins - 1:
            in_bin = (y_p >= bin_lower) & (y_p <= bin_upper)
        else:
            in_bin = (y_p >= bin_lower) & (y_p < bin_upper)

        sample_count = int(np.sum(in_bin))
        if sample_count > 0:
            bin_conf = float(np.mean(y_p[in_bin]))
            bin_acc = float(np.mean(y_t[in_bin]))
            bin_error = abs(bin_acc - bin_conf)
            ece += (sample_count / N) * bin_error
        else:
            bin_conf = float((bin_lower + bin_upper) / 2.0)
            bin_acc = 0.0
            bin_error = 0.0

        bin_details.append({
            "bin_index": i,
            "range": [round(float(bin_lower), 2), round(float(bin_upper), 2)],
            "sample_count": sample_count,
            "mean_confidence": round(bin_conf, 4),
            "empirical_accuracy": round(bin_acc, 4),
            "calibration_error": round(bin_error, 4),
        })

    return round(float(ece), 4), bin_details


class PlattScalingCalibrator:
    """
    Parametric logistic calibration (Platt Scaling):
    P_cal(f) = 1 / (1 + exp(-(A * f + B)))
    Fits scalar parameters A and B via maximum likelihood (cross-entropy minimization).
    """

    def __init__(self, A: float = 6.0, B: float = -3.2):
        self.A = float(A)
        self.B = float(B)
        self.is_fitted = False

    def fit(self, scores: Union[List[float], np.ndarray], labels: Union[List[int], np.ndarray]) -> "PlattScalingCalibrator":
        """Fits parameters A and B using logistic cross-entropy loss."""
        x = np.asarray(scores, dtype=np.float64)
        y = np.asarray(labels, dtype=np.float64)

        if len(x) < 2:
            self.is_fitted = True
            return self

        def loss_fn(params):
            a, b = params
            logits = a * x + b
            # Numerically stable log-loss
            log_p = -np.log1p(np.exp(-logits))
            log_1_minus_p = -logits - np.log1p(np.exp(-logits))
            loss = -np.mean(y * log_p + (1.0 - y) * log_1_minus_p)
            return loss

        init_params = [self.A, self.B]
        res = minimize(loss_fn, init_params, method="L-BFGS-B")
        if res.success:
            self.A = float(res.x[0])
            self.B = float(res.x[1])
        self.is_fitted = True
        return self

    def predict_proba(self, scores: Union[List[float], np.ndarray, float]) -> Union[np.ndarray, float]:
        """Maps raw score to calibrated probability."""
        is_scalar = isinstance(scores, (int, float))
        x = np.asarray([scores] if is_scalar else scores, dtype=np.float64)
        logits = self.A * x + self.B
        probs = 1.0 / (1.0 + np.exp(-logits))
        return float(probs[0]) if is_scalar else probs


class IsotonicRegressionCalibrator:
    """
    Non-parametric isotonic regression using the Pool Adjacent Violators Algorithm (PAVA).
    Guarantees monotonic non-decreasing probability calibration.
    """

    def __init__(self):
        self.x_thresholds: np.ndarray = np.array([0.0, 1.0])
        self.y_calibrated: np.ndarray = np.array([0.0, 1.0])
        self.is_fitted = False

    def fit(self, scores: Union[List[float], np.ndarray], labels: Union[List[int], np.ndarray]) -> "IsotonicRegressionCalibrator":
        """Fits monotonic step function using PAVA on training pairs."""
        x = np.asarray(scores, dtype=np.float64)
        y = np.asarray(labels, dtype=np.float64)

        if len(x) < 2:
            self.is_fitted = True
            return self

        # Sort by input score
        order = np.argsort(x)
        x_sorted = x[order]
        y_sorted = y[order]

        # PAVA implementation
        weights = np.ones_like(y_sorted, dtype=np.float64)
        values = y_sorted.copy()

        blocks = [[x_sorted[i], values[i], weights[i]] for i in range(len(x_sorted))]

        i = 0
        while i < len(blocks) - 1:
            if blocks[i][1] > blocks[i + 1][1]:
                # Pool adjacent violators
                w_comb = blocks[i][2] + blocks[i + 1][2]
                v_comb = (blocks[i][1] * blocks[i][2] + blocks[i + 1][1] * blocks[i + 1][2]) / w_comb
                blocks[i][1] = v_comb
                blocks[i][2] = w_comb
                blocks[i][0] = blocks[i + 1][0]  # Take right boundary
                del blocks[i + 1]
                if i > 0:
                    i -= 1
            else:
                i += 1

        self.x_thresholds = np.array([b[0] for b in blocks], dtype=np.float64)
        self.y_calibrated = np.array([b[1] for b in blocks], dtype=np.float64)
        self.is_fitted = True
        return self

    def predict_proba(self, scores: Union[List[float], np.ndarray, float]) -> Union[np.ndarray, float]:
        """Interpolates calibrated probability from piecewise constant step curve."""
        is_scalar = isinstance(scores, (int, float))
        x = np.asarray([scores] if is_scalar else scores, dtype=np.float64)

        # Monotonic piecewise linear interpolation with clamping
        probs = np.interp(x, self.x_thresholds, self.y_calibrated, left=0.0, right=1.0)
        return float(probs[0]) if is_scalar else probs


# Global pre-calibrated default calibrator instance
_DEFAULT_PLATT = PlattScalingCalibrator(A=7.2, B=-3.6)


def calibrate_disruption_probability(raw_prob: float, method: str = "platt") -> float:
    """Quick helper to calibrate a raw disruption probability."""
    if raw_prob <= 0.0:
        return 0.0
    if raw_prob >= 1.0:
        return 1.0
    return float(_DEFAULT_PLATT.predict_proba(raw_prob))
