# Phase 93 — P1: Prediction Core

**Workstream:** P1 (forecast math, calibration honesty, causal chain)
**Status:** IMPLEMENTED in commit `20c7fa5`. Documentation uncommitted.
**Pre-fix revision:** `20c7fa5^`

---

## 1. Why this phase exists

Agent 3 answered "what happens in 6/12/24/48 h" from a regression fitted over
every TomTom segment in Redis and from the *last* Open-Meteo cache entry. The
consensus gate then treated an unknown sensor distance as `0.0 km` (passing its
own 30 km proximity check) and rewrote simulated runs to a fixed `0.90`
certainty. Downstream, the causal chain was always empty because GraphRAG read
tables that do not exist in the current schema.

**Evidence**

| Pre-fix fact | File:line at `20c7fa5^` |
|---|---|
| `np.polyfit(x, y, 1)` fitted over unrelated segment timestamps | `agents/nodes/prediction.py:86` |
| Weather came from `latest_ev = events[-1]` | `agents/nodes/prediction.py:51` |
| Unknown distance defaulted to `0.0` for both weather and traffic | `agents/tools/consensus_gate.py:355-356` |
| Simulated confidence rewritten to `0.90` | `agents/tools/consensus_gate.py:390` |
| Prediction added `+0.10` when `is_simulated` | `agents/nodes/prediction.py:131` |
| GraphRAG read only `entities` / `entity_relations` | `agents/tools/graphrag.py:61` |

---

## 2. Defect register (PRED-D*)

| ID | Defect | Pre-fix evidence | Fixed at |
|---|---|---|---|
| PRED-D1 | Forecast extrapolated a global linear fit across segments with no spatial relation to the event | `prediction.py:86` (pre) | `prediction.py:18` (`HORIZON_DECAY = {6h:1.0, 12h:0.85, 24h:0.65, 48h:0.45}`), `:137-150` (nearest segment by Haversine), `:274-278` (baseline = nearest segment delay), `:63` (`_clamp_delay`, bounds at `:19-20`) |
| PRED-D2 | Weather came from the last cache write, not the nearest station; no provenance | `prediction.py:51` (pre) | `prediction.py:160-225`: candidate extraction, `min(haversine)` selection (`:195-200`), region fallback, `weather_station_name`, `weather_distance_km`, `weather_provenance` (`:210-214`) |
| PRED-D3 | Missing sensor distance = `0.0`, satisfying the `<=30 km` corroboration gate | `consensus_gate.py:355-356` (pre) | `consensus_gate.py:236-253` (`_resolve_finding_distance` → `+inf` for `None`/unparseable), used at `:377-378` |
| PRED-D4 | Simulated evidence was rewritten to synthetic certainty (`0.90`) and prediction added a simulation bonus | `consensus_gate.py:390`, `prediction.py:131` (pre) | `consensus_gate.py:34` (`SIMULATED_EVIDENCE_DISCOUNT = 0.90`), `:413-414` (multiply), `:419-423` (`validation_mode`); `prediction.py:326-328` (simulation subtracts `0.05`) |
| PRED-D5 | `causal_chain` was always empty: legacy tables only, and `kg_relationships` was unseeded | `graphrag.py:61` (pre) | `graphrag.py:16-17` (`ENTITY_TABLES`, `RELATION_TABLES` with `kg_*` first), `:19` (versioned cache `lrip:graph:entity:v2`), `:111-172` (best-effort cache, canonical rebuild); `infra/supabase/migrations/015_kg_relationship_seed.sql:12-34` |
| PRED-D6 | Benchmark "detection" was scored on `route`, which requires physical proximity the fixture does not carry — conflating gate telemetry with calibrated probability | `scripts/evaluate_metrics.py:143` (pre) | `scripts/evaluate_metrics.py:33` (`PROBABILISTIC_DECISION_THRESHOLD = 0.50`), `:153` (threshold on `raw_probability`), `:259` (threshold recorded in report) |

---

## 3. Contract changes

1. **Forecast contract** (`prediction_finding.data`):
   `forecast[horizon] = {delay_min, confidence_interval}`,
   `nearest_segment_name`, `nearest_segment_distance_km`,
   `weather_station_name`, `weather_distance_km`, `weather_provenance`
   (`observed` | `simulated` | `unavailable`),
   `degraded_sources`, `errors`, `evidence_health`
   (`nominal` | `quiet` | `degraded`) — `prediction.py:388-410`.
2. **Missing distance is not zero.** `_resolve_finding_distance` returns
   `float("inf")`; findings carry `distance_km = None` when unknown
   (`consensus_gate.py:236-253`, `prediction.py:405-406`).
3. **Simulation is discounted, not promoted.** Routing bypass is preserved
   (`is_validated = … or (is_sim and active_sources >= 2)`), confidence is
   multiplied by `0.90`, and `validation_mode` is one of
   `simulation_bypass` / `physical_corroboration` / `standard`
   (`consensus_gate.py:416-423`, `:458-463`).
4. **Synthetic weather never escalates a non-simulated run.**
   `weather_provenance == "simulated" and not is_simulated` → neutral
   multiplier (`prediction.py:311-317`).
5. **Causal chain reads `kg_*` first.** Entity/relation normalizers accept both
   schemas; cache key bumped so a previously cached empty graph is discarded
   (`graphrag.py:16-19`, `:47-103`).
6. **Benchmark scoring contract:** detection/Brier/ECE use `raw_probability`;
   `gate_route` is reported as telemetry (`evaluate_metrics.py:147-160`,
   `:177-186`, `:255-265`).

---

## 4. Fail-today / pass-after tests

| Test | Fail today (static, pre-fix code path) | Pass after | Evidence |
|---|---|---|---|
| `backend/tests/test_consensus_calibration.py:79` `test_consensus_missing_distance_blocks_corroboration` | Pre-fix `w_dist`/`t_dist` default to `0.0`, which satisfies `<=30 km`; `is_corroborated` becomes True and confidence is not capped at 0.50 | `raw_probability ≈ 0.6518`, `is_corroborated is False`, `route == "unconfirmed"`, `overall_confidence <= 0.50` | pre: `consensus_gate.py:355-356`; post: `:236-253`, `:377-378`; test `:79-93` |
| `backend/tests/test_consensus_calibration.py:96` `test_consensus_simulated_run_is_discounted` | Pre-fix rewrites confidence to `0.90` when below 0.85 and emits no `validation_mode` key → assertion/KeyError fails | `simulated.route == "validated"`, `validation_mode == "simulation_bypass"`, `simulated.confidence == round(observed * 0.90, 4)` | pre: `consensus_gate.py:390`; post: `:413-423`; test `:96-113` |
| `scripts/evaluate_metrics.py` (harness, not pytest) | Pre-fix `predicted_disruption = 1 if route == "validated"` → every scenario is `route="unconfirmed"` (no proximity metadata) and recall collapses | Detection threshold 0.50 on `raw_probability`; gating PASS | pre: `evaluate_metrics.py:143`; post: `:33`, `:153` |

**Executed proof (this session)**

```powershell
cd D:\College\Pidi.id
.\backend\.venv\Scripts\python.exe scripts\evaluate_metrics.py
```

Result (`gating_passed = true`):

| Metric | Value | Target |
|---|---|---|
| Precision | 97.2% | ≥ 85.0% |
| Recall | 100.0% | ≥ 80.0% |
| F1 | 0.986 | ≥ 0.820 |
| False positive rate | 4.0% | ≤ 15.0% |
| Accuracy | 98.3% | ≥ 85.0% |
| Mean latency | 0.017 ms/scenario | < 50 ms |
| Raw Brier | 0.0846 | ≤ 0.1000 |
| Platt / Isotonic Brier | 0.0000 / 0.0000 | ≤ 0.0800 |
| Platt / Isotonic ECE | 0.0001 / 0.0000 | ≤ 0.1000 |

Confusion matrix: 35 TP, 1 FP, 0 FN, 24 TN (N=60).

---

## 5. Acceptance gate

```powershell
cd D:\College\Pidi.id
.\backend\.venv\Scripts\python.exe scripts\evaluate_metrics.py   # must print GATING PASSED
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_consensus_calibration.py tests/test_agents.py -q -p no:cacheprovider
```

- `GATING PASSED: All empirical evaluation and calibration thresholds satisfied.`
- `test_consensus_missing_distance_blocks_corroboration` and
  `test_consensus_simulated_run_is_discounted` green.
- No `np.polyfit` remains in `agents/nodes/prediction.py`.
- `causal_chain` non-empty requires migration `015` to have been applied in the
  target Supabase project (not verifiable from the repo).

---

## 6. Out of scope / open

- `weather_provenance` is naming-based (`source.startswith("open-meteo-sim")`);
  other synthetic feeds are classified `observed`.
- The 100 km OSINT gate is P2; this phase only fixes the sensor-distance gate.
- GraphRAG correctness is not covered by a test; only the code path and seed
  migration exist.
- Benchmark `N=60` remains synthetic/curated; the numbers above are not field
  validation.
