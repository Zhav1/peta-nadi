# Phase 97 - Pilot-to-Real Interference Core (WP1 + WP2)

**Status:** IMPLEMENTED in working tree; documented in this pass.
**Code commit:** included in the Phase 97-99 docs commit (see WALKTHROUGH.md).
**Work packages:** WP1 (dedup / topology / weather confidence / pre-economic signal), WP2 (consensus E-channel alignment).
**Depends on:** Phase 90 (OSINT leak hardening), Phase 96 (P4 release-gate plan only).

---

## 1. Goal

Remove the interference between three realities that the pilot demo used to blur:

1. A repeated event must not be re-ingested, but an operator-triggered map simulation must never be swallowed by the 300 s dedup TTL.
2. DataCollection confidence must describe the weather/hazard evidence, not the health of a Supabase `data_sources` row.
3. The economic (PIHPS) channel must stop acting as a permanently-on 20% weight when no staple-price anomaly exists.

The output is a graph that terminates duplicates at Stage 1, confidence numbers that can be explained line-by-line, and a consensus formula whose weights sum to 1.0 in both the physical-only and economic-active states.

---

## 2. Guardrails (binding for this phase and every follow-up)

- **DO NOT TOUCH** `agents/llm_gateway.py`.
- **DO NOT TOUCH** `backend/tests/test_llm_gateway.py`.
- **DO NOT TOUCH** `.env.example`.
- Demo fixture and demo replay path must remain intact (`run_demo.py`, simulation spellings in `DEDUP_EXEMPT_SOURCES`).
- CPU routing only: no GPU/NIM dependency may be introduced by this work.
- No final documentation in `%TEMP%` or `/tmp`; all artefacts live under `.planning/phases/`.
- Manager coordinates; implementation/docs are produced by subagents. The manager does not edit code directly.
- Keep the BMKG warning-code mapping unchanged (`60 -> 25 / 55`, `95/97 -> 65.5 / 87.5`); it is not part of this phase.

---

## 3. WP1 - Dedup, topology, weather-grounded confidence, pre-economic signal

### 3.1 Duplicate-aware graph topology

| File | Change |
|---|---|
| `agents/graph.py:32` | `route_after_collection(state)` returns `END` when `status == "duplicate"`, otherwise fans out to `["osint_hazard", "prediction"]`. |
| `agents/graph.py:69` | `data_collection` now uses `add_conditional_edges(...)` instead of two unconditional edges. |

Why: previously a duplicate still fanned out to OSINT and prediction. The duplicate payload was re-read as fresh evidence, so the same article/event could corroborate itself and burn LLM budget.

### 3.2 Normalize before dedup; exempt intentional replays

| File | Change |
|---|---|
| `agents/nodes/data_collection.py:19` | `DEDUP_EXEMPT_SOURCES = {interactive_ui, manual_trigger, simulator, simulation, simulated, internal_simulator, test}`. |
| `agents/nodes/data_collection.py:780-812` | The normalized event is built **before** the dedup check, so a duplicate still returns a usable payload. The effective source prefers `raw_event["source"]` over the top-level source. |
| `agents/nodes/data_collection.py:808` | `dedup_enforced = not is_sim and effective_source not in DEDUP_EXEMPT_SOURCES`. |
| `agents/nodes/data_collection.py:813-838` | A duplicate returns `normalized_event`, a `DataCollectionAgent` finding with `confidence=0.0` and `data.duplicate=true`, `status="duplicate"`, and the updated fields. |

Why: a 300 s TTL must not suppress a deliberate interactive re-run. The demo source spellings are retained, so the fixture keeps working.

### 3.3 Weather-grounded confidence

| File | Change |
|---|---|
| `agents/nodes/data_collection.py:246` | `_weather_confidence(state, normalized_event, source, severity)` replaces the `data_sources` health map. |
| `agents/nodes/data_collection.py:25-27` | Baseline `0.65`, warning `0.85`, hard ceiling `0.95`. |
| `agents/nodes/data_collection.py:246-360` | Escalation by `warning_level` (AWAS/SIAGA/WASPADA), precipitation (10/20/50 mm), flood risk (50/70/85%), wind (30/40/60 km/h), BMKG codes 95/97, weather-fusion confidence, payload severity, and BMKG source severity. Every branch appends a `weather_basis` string. |
| `agents/nodes/data_collection.py:857-865` | `source_health` remains in `finding.data` for diagnostics only, with `source_health_ratio`; it no longer feeds `confidence`. |

Why: `data_sources.green` is an ingestion-health fact, not a meteorological fact. Confidence now has a reproducible basis.

### 3.4 Fast non-LLM PIHPS pre-gate

| File | Change |
|---|---|
| `agents/nodes/data_collection.py:417` | `_pre_economic_signal()` reads `lrip:pihps:latest` first, then falls back to a 14-day `commodity_prices` recomputation. |
| `agents/nodes/data_collection.py:417-470` | Anomaly gate `|z| > 1.5`; confidence `min(0.95, 0.60 + 0.10 * max_z)`; returns anomalous commodities and timestamp. |
| `agents/nodes/data_collection.py:851,884-885` | Signal is attached to the node result only when non-empty. |
| `agents/state.py:144-148` | Adds `raw_event`, `weather_fusion`, `pre_economic_signal` to `CrisisState`. |

Why: physical disruption reaches a corridor before PIHPS records the price response. The pre-gate lets an early anomaly reach the gate without spending an LLM call, and without forcing the economic channel to vote when it has nothing.

---

## 4. WP2 - Consensus E-channel alignment

| File | Change |
|---|---|
| `agents/tools/consensus_gate.py:29-34` | `SENSOR_WEIGHTS_ECONOMIC_ACTIVE = {weather 0.35, traffic 0.25, osint 0.20, economics 0.20}`. |
| `agents/tools/consensus_gate.py:39-44` | `SENSOR_WEIGHTS_PHYSICAL_ONLY = {weather 0.4375, traffic 0.3125, osint 0.25, economics 0.0}` (W/T/I renormalized by 0.80). |
| `agents/tools/consensus_gate.py:47` | `DEFAULT_SENSOR_WEIGHTS` is kept as an alias of the active profile for backward compatibility. |
| `agents/tools/consensus_gate.py:328-360` | E can arrive as `economic_intelligence_finding` **or** `pre_economic_signal`; provenance is recorded. |
| `agents/tools/consensus_gate.py:358-361` | `econ_active = econ_conf > 0.50`; selects the active or physical-only profile. |
| `agents/tools/consensus_gate.py:516-519` | Emits `economic_signal_source` and `economic_channel_active` for auditability. |

Why: with E fixed at 0.20 and no anomaly, the three physical sensors summed to 0.80 and a fully certain flood still capped below 1.0. That "dead weight" systematically under-reported physical crises. E now votes only while it has an observation.

---

## 5. Acceptance criteria

- [x] A duplicate event reaches `END`, not `osint_hazard`/`prediction`.
- [x] `interactive_ui`/`simulation`/`test` events bypass dedup.
- [x] Confidence is reproducible from `weather_basis`; `source_health` is diagnostic only.
- [x] `pre_economic_signal` is present when a PIHPS anomaly exists and absent otherwise.
- [x] Consensus weights sum to 1.0 in both profiles; `economic_channel_active` is exposed.
- [x] Demo/simulation sources still execute.

## 6. Verification plan

```powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_agents.py backend/tests/test_adapters.py backend/tests/test_bmkg_consensus_validation.py -q
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_consensus_calibration.py -q
```

## 7. Open concerns

- The E-channel activation threshold (`0.50`) is a policy choice; it is now visible in the result, but no calibration study has been run against real PIHPS series.
- Process-local STM fallback (Phase 98) means a duplicate observed by another worker during a Redis outage is not shared cluster-wide.
