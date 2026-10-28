# LEARNINGS — Phase 163: Bootstrap snapshot + read path

**Window:** 2026-10-27 → 2026-10-28 · Grounded facts only. Every number below was measured
either in the implementation pass, the 2026-10-28 docs pass, or the phase-165 production run.

---

## 1. The first design was measured, and it was wrong

The 15-section snapshot that shipped in `92e322f` looked reasonable on paper. Production
disagreed on the first tick:

| Measurement | Value |
|---|---|
| Snapshot row | **796 KB** |
| Of which the `news` section | **~785 KB** |
| Sections composed | **15** |
| Build time | **~15 s** |
| First `GET /api/v1/dashboard/bootstrap` | **50 s** |

A 796 KB JSONB row is not a cache; it is a copy of the world written every 5 minutes on a
0.1-CPU box. The lesson is not "news is big" — it is that **a snapshot's cost is dominated by
the widest section you include, not by the number of sections**, and that nobody had priced
the payload before shipping it.

## 2. A per-section timeout cannot preempt a synchronous call

`run_section` wraps each factory in `asyncio.wait_for(..., timeout=5.0)`. That looked like a
5 s budget per section, with sections running in parallel. In reality:

- `list_incidents` called `_fetch_incident_rows(...)`, which called PostgREST's **blocking**
  `.execute()` inside `async def`.
- `fetch_news_from_supabase` did the same with `query.execute()`.

A synchronous call never yields, so the event loop cannot deliver the cancellation. The
"parallel" gather therefore ran sections one behind another, each for the full PostgREST
latency, and several sections blew past their 12–15 s wall time while the 5 s timer sat
unable to fire. **`asyncio.wait_for` bounds awaits, not CPU/IO-bound sync frames.**

Fix: `await asyncio.to_thread(query.execute)` (`news_aggregator.py:1826`) and
`await asyncio.to_thread(_fetch_incident_rows, ...)` (`incidents.py:204`). Only after that
change did the 5 s budget become real. This is the single most transferable finding in the
phase.

## 3. The fix was to include less, not to cache harder

The winning move was deleting eleven sections from the snapshot:

`corridor_context`, `weather_spatial_polygons`, `commodity_prices`, `commodity_spikes`,
`approvals`, `source_health`, `evaluation_benchmark`, `evaluation_test_matrix`,
`evaluation_corridor_efficiency`, `outcomes`, `bnpb_events`.

Reasons, in order of weight:

1. **The frontend already lazy-mounts** Analitik / Laporan / Evaluasi, so those sections were
   written every 5 minutes for a tab that may never be opened in that window.
2. **`evaluation_test_matrix` is a large computed artifact** and the corridor-efficiency
   path runs Dijkstra — real CPU, on the tick, for a lazy tab.
3. **Weather and corridor are now live-fetched** by the frontend, so the snapshot copies were
   pure duplication.

After the trim: **4 sections, 291 KB** — and **249 KB of that is still `news` (bulk)**. News
is the floor of this design; a 40-article direct read is about as small as the map's wire can
get without pagination.

## 4. News needed its own read path, not the router's

`get_live_news` is a *contract*, not a getter: 150-article breadth window, v7 re-tier,
canonical-URL resolution, and it may schedule an ingestion cycle. Calling it from the
snapshot meant the snapshot paid the full read-path cost and could trigger ingestion from a
tick that was already running ingestion.

The snapshot now calls `fetch_news_from_supabase(limit=40, include_regional=True)` directly
and wraps the result as `{status, total, last_updated, articles}`. `get_live_news` stays the
browser's endpoint. **Rule: a read model should call the narrowest function that produces
the display payload, never the endpoint handler.**

## 5. Warm bootstrap is fast; cold fallback is the expensive path

- Production, warm row: **1.9 s** bootstrap, **1.017 s** first data.
- Missing/stale row: bounded live build, `LIVE_BUILD_TIMEOUT_SECONDS = 8.0`, `stale=true`.

The 1.9 s is not the row read — it is mostly the auth dependency plus the network. But the
fallback is where the old 50 s lived, so **applying migration 024 and keeping the tick alive
is load-bearing**. A stopped cron does not degrade the dashboard to "slightly stale"; it
degrades it to the bounded (and slower) live path on every mount.

## 6. Lazy tabs are the request-count win, not the snapshot

The snapshot removed the duplicate mount reads, but the 28 → 8 API-request drop comes mostly
from conditional mounting:

- Analitik (commodities ×N, BNPB), Laporan (approvals, source health) and Evaluasi
  (benchmark, matrix, corridor efficiency, outcomes) now render only while
  `activeSection === 'analytics' | 'reports' | 'evaluation'`.
- `e2e/m8-readpath.spec.ts` asserts **zero** matching requests before each tab click, then
  waits for one after.

Trade accepted: re-opening a tab refetches it. Freshness over cache, deliberately.

## 7. Dead seed paths are a real cost of trimming

`DashboardClient.tsx` still reads `sections.corridor_context` and
`sections.weather_spatial_polygons` as `initialData`. After `60bca8a` those keys never exist,
so both seeds are permanently `undefined` and the owning effects always take their live
fallback — which is correct, but it means the trim silently re-added two mount requests that
the trim's rationale assumed were cached. **When you remove a section, grep for its seed.**

## 8. What would bite again

1. **Anyone adding a section to `section_plan()`** must first check (a) is it lazy, (b) does
   its factory do sync I/O, (c) what does it add to the row. The row is one upsert.
2. **The 5 s per-section budget is only as real as the awaits inside the factory.** A new
   sync call silently disables it again.
3. **`STALE_AFTER_SECONDS = 600` is 2 × the tick cadence.** Changing the cron interval
   without changing this constant makes every mount stale.
4. **The last-good cache is keyed by section name only** and is disabled for tenant sections
   (`cache=False`). Any new tenant-scoped section must pass `cache=False` or it will leak one
   tenant's payload into another's response.
