# Phase 97 - Walkthrough (what actually changed)

**Scope:** WP1 + WP2.
**Code state:** implemented in the working tree; the docs commit only adds `.planning/` files.
**Verified by:** targeted pytest re-runs during this documentation pass, plus the manager's window log.

---

## 1. Changed files and line evidence

| File:line | What changed |
|---|---|
| `agents/graph.py:32` | New `route_after_collection` returns `END` on `status == "duplicate"`. |
| `agents/graph.py:69` | `data_collection` uses conditional edges instead of two unconditional edges. |
| `agents/nodes/data_collection.py:19` | `DEDUP_EXEMPT_SOURCES` includes `interactive_ui`, `manual_trigger`, `simulator`, `simulation`, `simulated`, `internal_simulator`, `test`. |
| `agents/nodes/data_collection.py:780-812` | Normalized event is built before dedup; source resolution prefers `raw_event["source"]`; dedup enforcement computed once. |
| `agents/nodes/data_collection.py:813-838` | Duplicate returns a normalized payload + `confidence=0.0` finding + `status="duplicate"`. |
| `agents/nodes/data_collection.py:246` | `_weather_confidence` introduced; source-health map removed from confidence. |
| `agents/nodes/data_collection.py:25-27` | `0.65` baseline / `0.85` warning / `0.95` ceiling. |
| `agents/nodes/data_collection.py:857-865` | `source_health` retained as diagnostic, plus `source_health_ratio` and `weather_basis`. |
| `agents/nodes/data_collection.py:417` | `_pre_economic_signal` Redis-first, Supabase 14-day fallback. |
| `agents/nodes/data_collection.py:851,884-885` | `pre_economic_signal` attached to the node result. |
| `agents/state.py:144-148` | `raw_event`, `weather_fusion`, `pre_economic_signal` typed on `CrisisState`. |
| `agents/tools/consensus_gate.py:29` | Active profile W 0.35 / T 0.25 / I 0.20 / E 0.20. |
| `agents/tools/consensus_gate.py:39` | Physical-only profile W 0.4375 / T 0.3125 / I 0.25 / E 0.0. |
| `agents/tools/consensus_gate.py:328-360` | E accepts a finding or `pre_economic_signal`; records `economic_signal_source`. |
| `agents/tools/consensus_gate.py:358-361` | `econ_active = econ_conf > 0.50` selects the profile. |
| `agents/tools/consensus_gate.py:516-519` | `economic_signal_source` + `economic_channel_active` in the consensus output. |

No change was made to `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example`, or the BMKG warning-code mapping.

---

## 2. Verification results

### 2.1 Window-reported counts (manager log)

| WP | Reported result |
|---|---|
| WP1 | 48 passed |
| WP2 | 41 passed, 1 failed (Brier) |

The WP2 Brier failure was the trigger for the dual-scale decision documented in Phase 99: the raw consensus product is structurally capped at `P_max`, so it cannot be scored directly against an NFR-4 Brier target.

### 2.2 Re-run during this docs pass

| Command | Result |
|---|---|
| `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_agents.py backend/tests/test_adapters.py backend/tests/test_bmkg_consensus_validation.py -q` | **49 passed** in 140.12 s |
| `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_consensus_calibration.py -q` | **12 passed** in 12.87 s |

The 49-vs-48 difference is test-collection drift in the current tree, not a behavior change. The consensus suite now includes the new dynamic-E test (`test_consensus_dynamic_e_channel_normalization`, `backend/tests/test_consensus_calibration.py:127`).

### 2.3 What the tests assert

- `test_consensus_formula_independence` recomputes the product with the physical-only profile and asserts `economic_channel_active` semantics (`backend/tests/test_consensus_calibration.py:46-85`).
- `test_consensus_dynamic_e_channel_normalization` covers three shapes: quiet pre-gate, spiking pre-gate, and the `AgentFinding` shape (`backend/tests/test_consensus_calibration.py:127-170`).
- The missing-distance test now expects `raw_probability = 0.6222` (was `0.6518`) because E no longer contributes dead weight when inactive (`backend/tests/test_consensus_calibration.py:99-103`).

---

## 3. Behavior deltas an operator will see

1. A duplicate webhook no longer produces OSINT/prediction findings; the run ends with a duplicate finding and a normalized event.
2. Interactive map simulations re-run even inside the 300 s TTL.
3. `DataCollectionAgent` confidence on a clear-weather event is `0.65`, not a source-health-derived `0.9`. On an AWAS warning it is `0.95`.
4. Consensus output now carries `economic_channel_active` and `economic_signal_source`; a quiet economic channel reports `economics: 0.0` in the breakdown.

## 4. Demo integrity

- `simulation`, `simulated`, `simulator`, and `test` remain dedup-exempt, so the demo fixture and replay path are not suppressed.
- No demo fixture file was edited.

## 5. Residual risks

- A duplicate in another process during a Redis outage is only deduped in the process that saw it (see Phase 98 STM fallback).
- Raising `econ_conf` above `0.50` restores a 0.20 weight on a channel that may still be lagging a physical event; the threshold is visible but not empirically calibrated.
