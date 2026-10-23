# Phase 97 - Learnings

**Rule:** only decisions and observations that are evidenced by the diff, the tests, or the window log. No inferred intent.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| Duplicates terminate at Stage 1 | `agents/graph.py:32,69`; `agents/nodes/data_collection.py:813-838` | A duplicate can no longer be re-read as independent evidence by OSINT/prediction. |
| Build the normalized event before dedup | `agents/nodes/data_collection.py:780-812` | Callers always receive a usable payload, even on a duplicate. |
| Exempt operator/UI and simulation sources from dedup | `agents/nodes/data_collection.py:19,808` | The 300 s TTL cannot swallow a deliberate re-run or the demo fixture. |
| Confidence is weather-grounded, not source-health-grounded | `agents/nodes/data_collection.py:246,857-865` | `green` ingestion health no longer implies `0.9` crisis confidence. |
| Add a non-LLM PIHPS pre-gate | `agents/nodes/data_collection.py:417,851` | An early price anomaly reaches the gate without an LLM call; the signal is optional. |
| E votes only while an anomaly is active | `agents/tools/consensus_gate.py:29,39,358-361` | Physical weights renormalize to 1.0; a fully certain physical event is not capped at 0.80. |
| Keep `DEFAULT_SENSOR_WEIGHTS` as an alias | `agents/tools/consensus_gate.py:47` | Imports that still reference the old name keep working; `compute_consensus` uses the dynamic profile. |

## 2. Fixes tried and why they changed

1. **First approach:** confidence derived from `data_sources` health (`green=0.9`, `yellow=0.6`, `red=0.3`). **Problem:** source health describes ingestion, not hazard severity; it also made confidence move when Supabase was unhealthy. **Replaced by** `_weather_confidence` with an explicit `weather_basis`.
2. **First approach:** E fixed at `0.20` in a single weight set. **Problem:** with no PIHPS anomaly, W/T/I summed to `0.80`; a fully certain physical event could not exceed `P_max = 0.688` after the product formula. **Replaced by** active vs physical-only profiles.
3. **First approach:** read E only from `economic_intelligence_finding`. **Problem:** an early pre-gate anomaly was masked by an empty finding. **Replaced by** a two-shape resolver with `economic_signal_source`.
4. **Test expectation changed:** `raw_probability` in the missing-distance test moved from `0.6518` to `0.6222` (`backend/tests/test_consensus_calibration.py:99-103`). This is a direct arithmetic consequence of renormalization, not a loosened assertion.

## 3. Concerns (open, evidenced)

1. The `0.50` E activation threshold is policy, not calibration. No PIHPS backtest was run in this window.
2. `pre_economic_signal` confidence (`0.60 + 0.10*max_z`) is a designed heuristic; it has no empirical error curve.
3. `_nearest_weather_payload` ranks features by "has numerics" before distance, so a numeric feature farther away can beat a closer non-numeric one. This is deliberate but not user-visible.
4. A duplicate is still normalized and returned; downstream callers must check `status`/`data.duplicate` rather than assuming a finding implies a fresh event.
5. Dedup remains process/Redis-TTL scoped; Phase 98 adds a local fallback but not a cluster-wide truth.

## 4. Mistakes not to repeat

- **Do not leave a dead E weight in the formula.** A 0.20 weight on a channel with no observation is not "conservative"; it discounts every real physical sensor and produces a structural `P_max` below 1.0.
- **Do not use ingestion health as crisis confidence.** It answers a different question and changes when the database is unhealthy.
- **Do not dedup before normalization.** Returning only `status="duplicate"` leaves callers without the payload they need to explain the suppression.
- **Do not add a new source spelling without updating `DEDUP_EXEMPT_SOURCES`.** The demo and benchmark replay depend on the exempt list.
- **Do not assume a conditional edge is enough.** The duplicate path must also return a finding; otherwise observability shows a silent stop.

## 5. Constraints carried into this phase

- DeepSeek subagents only, to keep the manager context uncluttered.
- Manager-only coordination; no direct manager code edits.
- Documentation lives under `.planning/phases/`; no temp-file final docs.
- Keep BMKG warning-code mapping unchanged.
- CPU routing only.
- `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, and `.env.example` are off-limits.
