# Phase 55: Learnings — Design Principles & Safeguards for Multi-Engine Resilience

These principles are distilled from the four audit passes and generalize the Phase 54 remediation lessons to every engine in the system. They are the acceptance philosophy behind `55-PLAN.md`: **an engine may degrade, but the system must never pretend it hasn't.**

---

## 1. Honest Degradation Flags Instead of Hardcoded "ONLINE" Masks

**Observed anti-pattern:** `corridor_service.py:175-181` hardcodes `bmkg_status/tomtom_status/pihps_status = "ONLINE"` and `consensus_confidence: 0.92` regardless of upstream state. The UI then shows green `LIVE` badges while TomTom has returned 403 for every request.

**Principle:** every engine response carries machine-readable provenance:

```
status:        "LIVE" | "CACHED" | "FALLBACK" | "UNAVAILABLE"
source:        e.g. "tomtom_flow_segment_v5", "hardcoded_seed_v1"
last_success:  timestamp of last live fetch
degraded_reason: e.g. "insufficient_funds", "bbox_limit", "model_not_in_catalog"
```

Phase 54 already established the client contract (`is_fallback: boolean`). Phase 55 extends it server-side so the flag originates at the data boundary, not in the UI.

---

## 2. Fail-Fast vs Silent Fallback — an Explicit Taxonomy

Not all fallbacks are bad. The failure is **unlabeled** fallback. Decision rules:

| Class | Example | Required behavior |
|---|---|---|
| **Operational degradation** (upstream down, cache/model substitute correct by design) | TomTom credits exhausted → corridor uses labeled defaults | Serve fallback + flag + `warning` log + health surface |
| **Contract/configuration error** (invalid model ID, missing key, wrong schema) | `gemini-3.5-flash-lite`, `deepseek-r1` not in catalog, `NASA_FIRMS_MAP_KEY` absent | **Fail loud**: startup preflight error or request-level typed error; never silently substitute |
| **Transient error** | timeout, 429 | Retry with backoff, then degrade with flag |

Corollaries:
- Degraded paths log at `warning`/`error`, never `debug` (`news_extractor.py:205-206` currently hides total LLM failure).
- Fallback content must be structurally distinguishable (typed envelope or sentinel) so downstream agents can reject it — the current canned NIM string leaks into Agent 5 (`economic_intelligence.py:118`), while `decision_support.py:139` shows the correct filter.

---

## 3. Preflight Configuration Validation

A few lines at startup prevent months of silent degradation:

1. **Model catalogs:** for NIM (and Gemini), verify the configured model exists; log available IDs on mismatch.
2. **API keys:** presence check for `TOMTOM_API_KEY`, `AISSTREAM_API_KEY`, `NVIDIA_*`, `NASA_FIRMS_MAP_KEY` with an explicit "feature disabled" warning per missing key (not a crash, not silence).
3. **Environment file resolution:** log which `.env` file was loaded and from which cwd (kills the §1 cwd trap at boot).

**Principle:** configuration errors are found at deploy time, not via fabricated dashboards weeks later.

---

## 4. A `health_check` Nobody Calls Is a Lie

`BMKGAdapter.health_check`, `TomTomAdapter.health_check`, `Earth2Adapter.health_check` all exist — and none of the deployed loops invoke them or write `update_source_health()`. Meanwhile `data_sources` keeps its seeded `'ok'` rows and `/api/v1/health/sources` reports healthy.

**Safeguards:**
- Health checks run on a scheduler (piggyback the polling loops), and their results are written to `data_sources` with a timestamp.
- Health **endpoints derive from runtime state** (last successful fetch, fallback latches), not from seeded rows.
- Seeded `'ok'` values should be replaced with `'unknown'`/`'stale'` semantics so uninitialized ≠ healthy.

---

## 5. Static Constants Must Never Impersonate Measurements

Observed impostors:

| Literal | Where | Presented as |
|---|---|---|
| `18.5%` / `14.2%` | `cuopt_tomtom_service.py:131-132` | "travel time savings / fuel reduction" |
| `1.4 / 1.8 / 1.2 / 1.5 / 1.9 ms` | `evaluation_router.py:253-309`, `RouteEfficiencyCard.tsx` | per-corridor solver latency |
| `(actual: 1.4 ms)` | `evaluation_router.py:151` test matrix | test execution time |
| `87.5%` flood risk | `earth2_adapter._generate_sim_forecast` | simulated weather forecast |
| `"SIMULATION_CACHE"` + `"PELINDO_SUMATRA_RADAR"` | `telemetry_service.py:822-824` | vessel signal source |

**Principle:** every number shown to an operator is either (a) computed and traceable to inputs, or (b) explicitly labeled as a baseline/assumption/simulation. Provenance is part of the payload, not a footnote.

---

## 6. Quota-Aware Engine Design

External APIs fail in billing-shaped ways (403 InsufficientFunds, model-not-entitled 404, keyless 401). **Safeguards:**
- Distinguish quota/billing states from transient faults; latch and back off instead of retrying within the same cycle.
- Budget requests spatially (TomTom tiles) and temporally (poll intervals) *before* deployment, not after the first 400 storm.
- Surface quota state in the ops console so a credit lapse reads as `DEGRADED (billing)` — not as "no traffic today".

---

## 7. Bounded Buffers by Contract

`lrip:stream:osint` reached 43,640 entries because one hand-rolled `XADD` omitted `maxlen` while every adapter stream was capped.

**Rule:** every stream/queue declares a bound in the same commit that creates its producer. The bound is part of the interface (like a timeout). Monitoring asserts `XLEN`/queue depth stays under the bound; trimming strategy is tested (consumers must not rely on unbounded history — the 3h `XRANGE` window makes trimming safe).

---

## 8. Integration Contract Tests Across Module Seams

The AISStream defect (event lacks the `mmsi` the consumer requires) passed CI because the test asserted the event shape, not the cross-module bridge. Similarly, the incidents select list matches a schema that the writer never produces.

**Safeguards:**
- When producer and consumer live in different modules, the test asserts **the consumer's requirements against the producer's output** (a golden payload round-trip).
- Column-level contracts (`SELECT a,b,c` vs writer columns) get a schema smoke test against the live/target database.
- Caller-side fallback rejection (`"FALLBACK" not in text`) is tested with an actual fallback string.

---

## 9. RLS-First Data Layer Checklist

For every new table (and every retrofit):

1. `enable row level security` explicitly — never rely on out-of-band console state.
2. Define the read audience (public/anon vs authenticated vs service-only) and write the policy in the same migration.
3. Writes default to service-role through the backend; user-facing writes go through backend endpoints, not direct anon PostgREST.
4. Remember the silent signature: **200 `[]` means "policy blocked me", not "no data"**. Any endpoint that can return policy-emptied lists should distinguish `empty` from `degraded` (S4's fail-loud fix).

---

## 10. Make Degradation Observable (The Ops Layer)

The system already has the surface: `SystemObservabilitySection.tsx` probes endpoints and shows latencies. Extend it with an **engine status matrix** fed by the health data from §4:

| Engine | Status | Last success | Fallback reason | Quota |
|---|---|---|---|---|
| BMKG | LIVE | 60 s ago | — | — |
| TomTom | DEGRADED | 3 d ago | insufficient_funds | 0 |
| NIM Gateway | LIVE | 2 m ago | — | — |
| NASA FIRMS | UNAVAILABLE | never | missing_key | — |

**Principle:** if an operator cannot see which engines are degraded, the platform's situational awareness is itself degraded.

---

## 11. Idempotency Under Multi-Worker Execution

`docker-compose.yml:26` runs two Uvicorn workers, duplicating every poller. Phase 55 fixes (health writes, credit latches, stream trims, backfills) must be safe when executed twice concurrently. Where "exactly once" matters (e.g., alerting), use Redis-based locks or move scheduling out of the web process.

---

## 12. The Degradation Ladder

A resilient engine descends a known ladder, and **every rung is distinguishable in the payload**:

```
LIVE  →  CACHED (last-known-good, timestamped)  →  MODELED FALLBACK (labeled assumptions)  →  UNAVAILABLE (explicit)
```

The audit's core failure was collapsing rungs 2–4 into rung 1 (or into empty lists and prose). Phase 55's mandate is to make the ladder explicit, tested, and visible from the UI down to the logs.
