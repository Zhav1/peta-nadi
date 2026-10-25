# Phase 109 — Learnings

**Rule:** only evidenced decisions/observations. The 97% figure is labelled as a window observation, not a code constant.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| Parse EWKB before WKT | `incidents.py:53-108` | PostgREST geometry rows now yield coordinates. |
| Reject non-4326 SRID | `incidents.py:87-92` | No silently wrong projected coordinates. |
| Prefer concrete `lat`/`lon` | `incidents.py:211-218` | Migration 010 columns are authoritative; `location` is fallback. |
| Keep legacy projection fallback | `incidents.py:121-141` | Older schemas still serve rows. |
| Normalize polygon WKB/EWKB to GeoJSON | `agents/tools/supabase_tools.py:257-295` | Map layers never receive raw hex. |
| Round-robin the 60-item extraction budget | `unified_news_ingestor.py:39-84,153` | Late-finishing feeds get representation. |
| Read 150 rows | `news_router.py:304-307` | DROPPED rows are less likely to hide valid rows. |
| Use a TTL + owner token for the ingest lock | `news_router.py:169-212` | Crashes self-heal; a slow worker cannot delete another owner's key. |

---

## 2. Fixes tried and why they changed

1. **WKT regex only.** It was the sole parser and returned `(None, None)` for every PostgREST geometry. **Replaced by** an EWKB reader with WKT fallback.
2. **Trust `location`.** It is a legacy column; migration 010 added concrete `lat`/`lon`. **Replaced by** concrete-first precedence.
3. **Ignore SRID.** A non-4326 row would be plotted as if degrees. **Replaced by** an explicit 4326 check.
4. **Flat `[:60]` intake.** It gave the whole budget to the fastest feeds. **Replaced by** source-bucketed round-robin.
5. **Reported 15-per-feed / 30-total caps.** They starved low-volume outlets; no such constants survive in the current tree. **Replaced by** the 60-item fair budget.
6. **60-row read.** Filtering happened after the limit. **Replaced by** 150-row over-fetch.
6. **Permanent lock on crash.** **Replaced by** a 240 s TTL; release is token-checked.

---

## 3. Concerns (open, evidenced)

1. **`round_robin_by_source` has no test.** Fairness is documented at `unified_news_ingestor.py:45-55` but not asserted.
2. **The WKB polygon reader has no test.** Point parsing is covered; polygon/collection parsing is not.
3. **No lock renewal.** A cycle >240 s can overlap another worker.
4. **Redis failure means no cross-process exclusion.** `_acquire...` returns `True` (`news_router.py:183-200`).
5. **Bucket key is `source`.** Two feeds with the same source string are merged; a missing source becomes `unknown`.
6. **150 is still finite.** A province with very few articles can still be absent from a given response.
7. **DROPPED rows are intentionally persisted.** This is a token-saving decision; it makes the read filter permanent.
8. **The Point parser is deliberately narrow.** MultiPoint/GeometryCollection `location` values are unsupported.

---

## 4. Mistakes not to repeat

- **Do not assume PostGIS is WKT on the wire.** PostgREST sends EWKB hex; test with the actual string.
- **Do not plot a geometry without checking SRID.** A projected CRS looks like a plausible but wrong coordinate.
- **Do not trust a legacy `location` column over explicit coordinates.** Migration 010 exists for a reason.
- **Do not cap before filtering.** The cap must anticipate rows that will be dropped.
- **Do not use a flat gather-order slice across many feeds.** It is not a budget; it is a race.
- **Do not use a lock without a TTL or owner check.** A crash or a slow cycle breaks it.
- **Do not assume a single worker forever.** Render free is single-worker today; the lock still has to be correct.

---

## 5. Constraints carried into this phase

- Muse Spark orchestrator/planner; subagents DeepSeek/GLM high; no default subagent; always use subagents.
- Playwright auto-check mandatory; free-model limit → paid high fallback.
- Windows PowerShell; `D:\College\Pidi.id`.
- Render free Singapore single worker; Vercel `pre-hub.vercel.app`; Supabase PostGIS.
- No Redis by default; `NEXT_PUBLIC_API_URL` inlined at build.
- Docs under `.planning/phases/`; no temp final docs.
