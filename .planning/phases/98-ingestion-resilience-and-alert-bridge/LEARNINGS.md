# Phase 98 - Learnings

**Rule:** only decisions and observations evidenced by the diff, the test run, or the window log.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| Publish one PIHPS snapshot key per cycle | `backend/app/scrapers/pihps_scraper.py:114,274` | Consumers read `lrip:pihps:latest` instead of scanning rolling keys; a publish failure does not lose the cycle. |
| Recompute PIHPS stats from 14 days of `commodity_prices` when Redis is empty | `agents/nodes/economic_intelligence.py:19,88-116` | The anomaly channel still answers during a cache outage, and `pihps_source` makes the fallback visible. |
| Degrade STM/dedup to a bounded in-process store | `agents/memory/stm.py:23-67,106-183` | Redis is no longer a hard SPOF for a running process; state is lost on restart and not shared. |
| Fall back to recent Supabase news rows when the OSINT stream is empty | `agents/nodes/osint_hazard.py:45,232,365` | Hazard detection does not silently stop on a cold stream; the fallback is logged and tier-limited. |
| Replace `KEYS` with `SCAN` | `agents/nodes/prediction.py:146-154` | A large Redis keyspace no longer blocks the event loop for the duration of a full key scan. |
| Anchor prediction to the nearest corridor checkpoint when no segment is cached | `agents/nodes/prediction.py:28,79,292` | Delay is severity-derived and distance is real (<=25 km), not an invented far segment. |
| Redis NX lock + in-process double-check | `backend/app/routers/news_router.py:55-146` | One ingestion cycle per interval across workers; Redis outage degrades open rather than stalling news. |
| Deterministic UUIDv5 incident/approval ids | `backend/app/services/unified_news_ingestor.py:648-658,769-772` | Replay upserts the same rows; HITL decisions are not duplicated or reset. |
| Exclude news-derived polygons from hazard fusion | `agents/tools/supabase_tools.py:581-610,684-692` | A news article cannot use its own incident polygon as independent corroboration. |
| Tail `lrip:stream:validated_alerts` in every process | `backend/app/services/alert_fanout.py:44,223`; `backend/app/main.py:307-314` | A WebSocket client receives alerts produced by another worker. |
| Dedup alerts by `(crisis_id, timestamp)` or stable hash | `backend/app/services/alert_fanout.py:85-135` | The in-process and stream copies collapse to one delivery. |

## 2. Fixes tried and why they changed

1. **First approach:** a single `_is_ingesting` flag. **Problem:** it only serialized one process; multiple uvicorn workers each had their own lock. **Added:** Redis `SET NX EX` plus a token-owner release.
2. **First approach:** a caller that waited on the in-process lock always ran another cycle. **Problem:** duplicate RSS/LLM work for a cycle that had just completed. **Added:** `_last_cycle_completed_at` and the `entered_at` comparison.
3. **First approach:** `insert` for incidents and approvals. **Problem:** a replayed cycle created duplicates and a fresh PENDING review, resetting an operator decision. **Replaced by:** deterministic ids + `upsert` (`ignore_duplicates=True` for approvals).
4. **First approach:** provenance only in the title prefix. **Problem:** pre-tag rows and deployments with a `source_type` column were not detected. **Replaced by:** evidence JSONB keys, top-level source columns, then title prefix (`agents/tools/supabase_tools.py:586-610`).
5. **Test failure observed:** stampede guard returned `calls == 0` while a stale `lrip:lock:news_ingestor` existed (TTL 99 s). This was not a logic failure; the lock correctly blocked both triggers. The test is only reliable when no live lock exists.

## 3. Concerns (open, evidenced)

1. **Alert bridge has no direct test.** `grep` over `backend/tests` found no reference to `alert_fanout`, `validated_alert`, or `consume_validated_alerts_stream`.
2. **STM fallback is process-local and bounded at 500.** Eviction is FIFO; a long outage can evict a still-relevant crisis state before its TTL.
3. **The local fallback masks a Redis outage from the user.** It logs warnings but API responses do not carry a degraded flag for STM/dedup.
4. **A held ingestion lock is invisible in the response.** The trigger returns normally; only the log records the skip.
5. **The OSINT fallback does not deduplicate against the Redis stream.** If both sources carry the same article, downstream logic must collapse it.
6. **Corridor fallback delay is a lookup table, not a measurement.** It is bounded and provenance-tagged (`corridor_fallback_used`), but it is still an estimate.
7. **`upsert(ignore_duplicates=True)` cannot correct a bad first payload.** This is the price of protecting an operator decision.

## 4. Mistakes not to repeat

- **Do not use `KEYS` on a shared Redis event loop.** It is O(N) and stalls every coroutine. Use `SCAN` with a count.
- **Do not let Redis be a single point of failure for STM/dedup.** A cache outage must not disable the pipeline; degrade to a bounded local store and say so.
- **Do not let a news article corroborate itself.** The incident polygon created from an article is a restatement, not a second sensor. Tag provenance and filter it out.
- **Do not `insert` replayable rows.** Deterministic ids + upsert, and never reset an operator's decision on replay.
- **Do not treat a lock-held skip as success.** Log it with the owner/interval and surface it where an operator can see it.
- **Do not debug a stampede test without checking the live Redis lock.** `calls == 0` is the signature of a held lock, not a broken guard.
- **Do not hide a fallback.** Every fallback path in this phase emits a source/provenance field or a warning; keep that property.

## 5. Constraints carried into this phase

- DeepSeek subagents only, to keep the manager context uncluttered.
- Manager-only coordination; no direct manager edits.
- `git add .` then a single conventional commit, then push to the current branch (`main`) for Vercel visibility.
- Final docs under `.planning/phases/`; no `%TEMP%`/`/tmp` artefacts.
- Keep the BMKG mapping and the demo fixture intact.
- CPU routing only.
- `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example` are off-limits.
