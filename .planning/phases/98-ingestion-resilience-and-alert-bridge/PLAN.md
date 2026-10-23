# Phase 98 - Ingestion Resilience and Alert Bridge (WP3 + WP4 + WP5)

**Status:** IMPLEMENTED in working tree; documented in this pass.
**Work packages:** WP3 (PIHPS / STM / OSINT and prediction fallbacks), WP4 (idempotent news loop + self-corroboration filter + ingestion lock), WP5 (validated-alert fan-out bridge).
**Depends on:** Phase 97 (graph topology and E pre-gate), Phase 90 (news leak hardening).

---

## 1. Goal

Make the pilot behave honestly when Redis, PIHPS, or the news stream is degraded, and close two integrity gaps:

1. A Redis outage must not become a single point of failure for short-term memory or dedup, and a cold OSINT stream must not silently disable hazard detection.
2. Replaying a news ingestion cycle must not create duplicate incidents or duplicate HITL reviews, and a news-derived incident must not corroborate the article that created it.
3. An alert validated in one API worker must reach WebSocket clients attached to another worker exactly once.

---

## 2. Guardrails

- **DO NOT TOUCH** `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example`.
- Demo fixture and demo replay path stay intact; no dedup exemption may be removed to make a test pass.
- CPU routing only.
- No final docs in `%TEMP%` or `/tmp`.
- Manager coordinates; subagents write. No direct manager edits.
- Do not change the BMKG warning-code mapping while touching fallbacks.
- A fallback must be observable (source/provenance field or warning log); a silent fallback is a bug.

---

## 3. WP3 - PIHPS, STM, OSINT and prediction fallbacks

### 3.1 PIHPS snapshot publication

| File:line | Change |
|---|---|
| `backend/app/scrapers/pihps_scraper.py:114` | Per-cycle `latest_snapshot` accumulator. |
| `backend/app/scrapers/pihps_scraper.py:195-215` | Per-commodity `current/mean/std/z_score` over the bounded 7-point window. |
| `backend/app/scrapers/pihps_scraper.py:274-287` | Publishes one key `lrip:pihps:latest` with `ex=86400`; publish failure never loses parsed events. |

### 3.2 Economic fallback

| File:line | Change |
|---|---|
| `agents/nodes/economic_intelligence.py:19` | `_pihps_stats_from_supabase()` recomputes current/mean/std/z from the last 14 days of `commodity_prices`. |
| `agents/nodes/economic_intelligence.py:88-116` | Redis snapshot first; Supabase recompute when Redis is down or empty; `pihps_source` becomes `redis`, `supabase_commodity_prices`, or `unavailable`. |
| `agents/nodes/economic_intelligence.py:233` | `pihps_source` is emitted in the finding for audit. |

### 3.3 STM / dedup process-local fallback

| File:line | Change |
|---|---|
| `agents/memory/stm.py:23-33` | Bounded local stores (500 entries, FIFO) for STM and seen events. |
| `agents/memory/stm.py:36-67` | `_local_set` / `_local_get` with optional TTL. |
| `agents/memory/stm.py:106` | `save_crisis_state` degrades to local store on connection/timeout errors. |
| `agents/memory/stm.py:137` | `load_crisis_state` reads the local store when Redis is unavailable. |
| `agents/memory/stm.py:160,180` | `mark_seen` / `is_seen` use the local dedup store during an outage. |

Only Redis `ConnectionError`/`TimeoutError` (and the built-in equivalents) select the degraded path. Other exceptions still surface.

### 3.4 OSINT Supabase fallback

| File:line | Change |
|---|---|
| `agents/nodes/osint_hazard.py:45` | Fallback window 12 h, limit 30, tiers `RED_CONFIRMED`/`YELLOW_CLARIFY`. |
| `agents/nodes/osint_hazard.py:232` | `_query_recent_news_articles()` prefers a `gatekeeper_tier` column, then retries unfiltered and filters in Python. |
| `agents/nodes/osint_hazard.py:269` | Async wrapper via `asyncio.to_thread`. |
| `agents/nodes/osint_hazard.py:365-383` | When the Redis stream is empty, load recent Supabase rows through the same parse/spatial loop; failure degrades `supabase_news`. |

### 3.5 Prediction key scan and corridor fallback

| File:line | Change |
|---|---|
| `agents/nodes/prediction.py:146-154` | `scan_iter(match=..., count=100)` replaces `KEYS`; `KEYS` remains only for clients without `scan_iter`. |
| `agents/nodes/prediction.py:28,79-117` | `_nearest_corridor_anchor` finds a TomTom checkpoint within 25 km, using adapter-owned geometry. |
| `agents/nodes/prediction.py:292-320` | With no cached segment, delay comes from incident severity (critical 120 / high 90 / medium 60 / low 30), multiplied by 1.3 only for observed weather alerts. |
| `agents/nodes/prediction.py:498` | `corridor_fallback_used` is emitted. |

---

## 4. WP4 - Idempotent news loop, anti-self-corroboration, ingestion lock

### 4.1 Cross-process ingestion lock

| File:line | Change |
|---|---|
| `backend/app/routers/news_router.py:55-60` | Redis key `lrip:lock:news_ingestor`, TTL 240 s, per-process token, monotonic completion timestamp. |
| `backend/app/routers/news_router.py:63-89` | Non-blocking `SET NX EX`; any Redis exception degrades to `True` so ingestion is never stalled by a cache outage. |
| `backend/app/routers/news_router.py:101-146` | Double-checked in-process lock, skip if a cycle completed while this trigger waited, skip if another worker holds the Redis lock, release only when this worker owns the token. |

### 4.2 Deterministic writes

| File:line | Change |
|---|---|
| `backend/app/services/unified_news_ingestor.py:36` | Provenance constants (`news_ingestor`, `[News Alert]`). |
| `backend/app/services/unified_news_ingestor.py:648-658` | Deterministic `uuid5` incident id from URL/id; no canonical key means no incident. |
| `backend/app/services/unified_news_ingestor.py:687-689` | `evidence.source_type` / `ingestion_origin` / `ingested_by` mark the polygon as news-derived. |
| `backend/app/services/unified_news_ingestor.py:715` | `upsert(..., on_conflict="id")` instead of `insert`. |
| `backend/app/services/unified_news_ingestor.py:769-772` | Deterministic approval id from the incident id. |
| `backend/app/services/unified_news_ingestor.py:794-798` | `upsert(..., ignore_duplicates=True)` so an operator's ACCEPT/DISMISS is never reset to PENDING_REVIEW. |

### 4.3 Anti-self-corroboration

| File:line | Change |
|---|---|
| `agents/tools/supabase_tools.py:581-610` | `_is_news_ingestor_incident` detects provenance from `evidence` JSONB, top-level source columns, or the `[News Alert]` title prefix. |
| `agents/tools/supabase_tools.py:684-692` | `get_hazard_polygons` skips news-ingestor rows. |

Why: the hazard-fusion `+0.20` boost treated the incident polygon created from an article as independent physical corroboration of that same article. One uncorroborated story could thus validate itself.

---

## 5. WP5 - Validated-alert fan-out bridge

| File:line | Change |
|---|---|
| `backend/app/services/alert_fanout.py:44` | `VALIDATED_ALERTS_STREAM = "lrip:stream:validated_alerts"`. |
| `backend/app/services/alert_fanout.py:85-115` | Dedup identity `(crisis_id, timestamp)` or a SHA-1 over stable fields. |
| `backend/app/services/alert_fanout.py:117-135` | Bounded 256-entry seen deque + mirror set; oldest evicted first. |
| `backend/app/services/alert_fanout.py:186-221` | Stream fields mapped to the canonical payload; numeric confidence only when parseable, never invented. |
| `backend/app/services/alert_fanout.py:223-292` | Consumer tails with `$`, blocking 3 s, batch 20, backoff 1 s -> 30 s; malformed entries skipped; cancellation safe. |
| `backend/app/main.py:307-314` | Lifespan starts the consumer regardless of `POLLERS_ENABLED` (WS fan-out is per process). |
| `backend/app/main.py:321-329` | Shutdown cancels and awaits the task. |

Delivery contract: the in-process producer and the stream consumer both call `broadcast_validated_alert`, which suppresses the second copy. The replay cache keeps the richer in-process payload rather than downgrading it with the lean stream copy.

---

## 6. Acceptance criteria

- [x] PIHPS publishes one snapshot key per cycle and economic intelligence records a truthful `pihps_source`.
- [x] Redis connection/timeout errors do not lose STM or dedup state inside the process.
- [x] An empty OSINT stream falls back to recent gatekeeper-approved Supabase rows and logs the degradation.
- [x] Prediction never uses `KEYS` on a normal Redis client and never invents a far-away segment; fallback distance is real and bounded.
- [x] Replaying the same article does not create a second incident or a second pending approval.
- [x] A news-derived incident is excluded from hazard polygons.
- [x] Two ingestion triggers produce one cycle, and two workers cannot both ingest.
- [x] An alert is delivered once even when it travels both the in-process and stream paths.

## 7. Verification plan

```powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_scrapers.py -q
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_news_pipeline.py backend/tests/test_osint_leak_hardening.py backend/tests/test_phase76_news_spatial_consensus.py -q
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_pilot_e2e.py -q
```

If `test_news_stampede_guard_prevents_duplicate_runs` sees `calls == 0`, check for a live `lrip:lock:news_ingestor` key before blaming the lock code (see WALKTHROUGH.md section 4).

## 8. Open concerns

- No direct automated test for the alert bridge exists. `alert_fanout.py` is covered only indirectly by pilot/E2E behavior.
- During a Redis outage, STM/dedup is process-local; another worker can still treat the same event as new.
- The OSINT fallback and the Redis stream can both contain the same article; the downstream dedup path, not the fallback, is responsible for collapsing it.
- A stale ingestion lock silently skips a trigger for up to 240 s; this is bounded but not surfaced in the API response.
