# Phase 98 - Walkthrough (what actually changed)

**Scope:** WP3 + WP4 + WP5.
**Code state:** implemented in the working tree; this pass only adds `.planning/` documentation.
**Verified by:** targeted pytest re-runs during this docs pass, plus the manager's window log.

---

## 1. Changed files and line evidence

### 1.1 WP3 - fallbacks

| File:line | Change |
|---|---|
| `backend/app/scrapers/pihps_scraper.py:114` | Per-cycle snapshot accumulator. |
| `backend/app/scrapers/pihps_scraper.py:195-215` | 7-point `current/mean/std/z_score` per commodity. |
| `backend/app/scrapers/pihps_scraper.py:274-287` | Publishes `lrip:pihps:latest` (`ex=86400`); publish failure is contained. |
| `agents/nodes/economic_intelligence.py:19` | 14-day Supabase recomputation of PIHPS stats. |
| `agents/nodes/economic_intelligence.py:88-116` | Redis -> Supabase -> `unavailable`; `pihps_source` recorded. |
| `agents/nodes/economic_intelligence.py:233` | `pihps_source` in the finding. |
| `agents/memory/stm.py:23-67` | Bounded process-local STM/seen stores with TTL. |
| `agents/memory/stm.py:106,137,160,180` | Save/load/mark/check degrade only on Redis connection/timeout errors. |
| `agents/nodes/osint_hazard.py:45,232,269,365-383` | 12 h / 30-row Supabase news fallback, async, server-side filter then Python filter. |
| `agents/nodes/prediction.py:146-154` | `SCAN` instead of `KEYS`; `KEYS` only for clients lacking `scan_iter`. |
| `agents/nodes/prediction.py:28,79-117,292-320` | 25 km corridor anchor; severity-derived delay; 1.3x observed-weather escalation. |
| `agents/nodes/prediction.py:498` | `corridor_fallback_used` telemetry. |

### 1.2 WP4 - news loop

| File:line | Change |
|---|---|
| `backend/app/routers/news_router.py:55-60` | Redis lock key, 240 s TTL, worker token, monotonic completion stamp. |
| `backend/app/routers/news_router.py:63-89` | `SET NX EX`; Redis failure returns `True` (degrade open). |
| `backend/app/routers/news_router.py:101-146` | Double-checked lock, queued-trigger skip, owner-only release. |
| `backend/app/services/unified_news_ingestor.py:648-658` | Deterministic UUIDv5 incident id; missing canonical key aborts. |
| `backend/app/services/unified_news_ingestor.py:687-689,715` | Provenance evidence + `upsert(on_conflict="id")`. |
| `backend/app/services/unified_news_ingestor.py:769-772,794-798` | Deterministic approval id + `ignore_duplicates=True`. |
| `agents/tools/supabase_tools.py:581-610,684-692` | News-ingestor polygons excluded from `get_hazard_polygons`. |

### 1.3 WP5 - alert bridge

| File:line | Change |
|---|---|
| `backend/app/services/alert_fanout.py:44` | Stream name constant. |
| `backend/app/services/alert_fanout.py:85-135` | Dedup identity + bounded seen set. |
| `backend/app/services/alert_fanout.py:186-221` | Stream payload parser; does not invent confidence. |
| `backend/app/services/alert_fanout.py:223-292` | Consumer with `$`, 3 s block, batch 20, 1-30 s backoff. |
| `backend/app/main.py:307-314` | Consumer started in lifespan. |
| `backend/app/main.py:321-329` | Cancelled on shutdown. |

No change was made to `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example`, or the BMKG warning-code mapping.

---

## 2. Verification results

### 2.1 Window-reported counts (manager log)

| WP | Reported result |
|---|---|
| WP3 | 22 passed + 114 passed |
| WP4 | 22 passed + 104 passed |
| WP5 | 36 passed |

### 2.2 Re-run during this docs pass

| Command | Result |
|---|---|
| `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_scrapers.py -q` | **22 passed** in 6.52 s |
| `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_news_pipeline.py backend/tests/test_osint_leak_hardening.py backend/tests/test_phase76_news_spatial_consensus.py -q` | **84 passed** in 7.63 s |
| `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_pilot_e2e.py -q` | **9 passed** in 72.77 s |

The larger WP3/WP4 batches reported in the window were not re-run as a single command in this pass; the counts above are the subsets that were re-executed.

---

## 3. Observed failure and resolution (WP4)

**First re-run:** `test_news_pipeline.py::test_news_stampede_guard_prevents_duplicate_runs` failed with `calls == 0` (not `2`). Both triggers returned before invoking `run_ingestion_cycle`.

**Evidence:** a live `lrip:lock:news_ingestor` key existed in the local Redis with TTL `99` s. The test shares the real Redis client; `_acquire_cross_process_ingestion_lock()` correctly returned `False`, so both tasks skipped. This is the intended production behavior (another worker owns the cycle), but it makes the test environment-dependent.

**Resolution:** after the stale key was gone from the local test Redis, the same test passed (`1 passed in 1.62 s`), and the full news subset passed `84/84`.

**Learning:** a stale/live ingestion lock is a silent skip for up to 240 s. The API does not currently expose "skipped because lock held" to the caller. Do not debug this as a code regression before checking the key.

---

## 4. Behavior deltas an operator will see

1. `economic_intelligence_finding.data.pihps_source` now distinguishes Redis from the Supabase recomputation and from `unavailable`.
2. When Redis is down, the process keeps STM/dedup in memory and logs a warning per operation; restarting the process loses that state.
3. When the OSINT stream is empty, hazard detection still runs on the last 12 h of gatekeeper-approved articles and reports a `supabase_news` degradation on failure.
4. A repeated news cycle updates the same incident/approval rows instead of duplicating them; a previously ACCEPTED/DISMISSED approval keeps its decision.
5. News-derived incident polygons no longer appear as independent hazard geometry.
6. Alerts produced by another worker now reach this worker's WebSocket clients, once.

## 5. Demo integrity

- No demo fixture was edited.
- Dedup exemptions from Phase 97 remain; the demo source spellings still bypass dedup.
- The news fallback does not replace the fixture; it only runs when the Redis stream is empty.

## 6. Residual risks

1. **No direct alert-bridge test.** No test file references `alert_fanout`, `validated_alert`, or `consume_validated_alerts_stream` (`grep` over `backend/tests` returned no matches). The 9 pilot E2E tests pass, but they are not proof of the cross-worker bridge.
2. **STM fallback is per process.** Two workers during a Redis outage can both accept the same event.
3. **The OSINT fallback can overlap the stream.** It does not itself deduplicate against stream entries; it relies on downstream dedup.
4. **Lock observability gap.** A lock-held skip is logged but not surfaced in the HTTP response.
5. **`ignore_duplicates=True` is first-write-wins.** It protects an operator decision, but it also means a corrected approval payload cannot overwrite the first one.
