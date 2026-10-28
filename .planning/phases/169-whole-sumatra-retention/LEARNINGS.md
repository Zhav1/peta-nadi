# LEARNINGS — Phase 169: Whole-Sumatra Retention

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**A "priority" list must never become a filter.** `_CORRIDOR_SPINE` was
written to decide *what to ask first*. Somewhere along the way it became
the predicate for *what exists*, and every zone off the corridor silently
stopped existing. Nothing failed; the map just got emptier.

The companion lesson is arithmetic, not architecture: **always compute
the daily upstream call budget.** At 23 points the Open-Meteo bill was
16,704 metered calls/day; at 58 points it would have been far worse if
each consumer fetched independently. Sharing one snapshot brought it to
**8,352/day** — more coverage for half the calls. That number only
exists because someone wrote it down.

## 2. Fixes tried (what worked, with file evidence)

1. **Spine demoted to ordering** — `_CORRIDOR_SPINE` now sequences
   requests and excludes nothing.
2. **Radius mask deleted, grid grown** — `GRID_KEEP_RADIUS_KM = 60`
   removed; grid 23 → 58 points, sized at ≥ 4 points per province
   (`open_meteo_adapter.py:94` documents the removal).
3. **Stale-while-revalidate** — `retention.py:16-18` sets 600 s refresh /
   6 h validity / 24 h ceiling. A stale snapshot is served with an age
   instead of a hole.
4. **Shared snapshot** — one fetch feeds polygons and summary;
   16,704 → 8,352 calls/day.
5. **Freshness made visible** — `FreshnessBadge.tsx` (new) plus a capped
   notice, so the 24-feature render cap is disclosed rather than
   discovered.

## 3. Concerns (open)

1. Coverage is now asserted by a test, but the ≥ 4-points-per-province
   invariant depends on the curated grid staying curated; a future
   "optimisation" can break it again.
2. 58 points per poll is a larger payload than 23. The saving is
   structural (one snapshot), so removing the snapshot re-multiplies
   cost.
3. The 24-feature cap still truncates rendering; the user now sees a
   notice, which is honest but not a fix.

## 4. Conditions (observed this window)

- Operators judge credibility by map coverage: an empty province reads
  as "no weather", not "no data point".
- Weather must survive a slow upstream — a 10-minute poll with a
  10-minute TTL guarantees visible gaps.

## 5. Issues found (do not repeat)

1. TTL equal to poll interval is a self-inflicted outage window.
2. A land-mask constant (`GRID_KEEP_RADIUS_KM`) tuned for one corridor
   silently deleted nine provinces' worth of points.
3. Three independent filters each looked reasonable in review; only the
   combined map revealed the loss. Review coverage end-to-end, not
   filter-by-filter.

## 6. Environment constraints (this checkout)

- Windows + PowerShell. Backend interpreter is
  `backend/.venv/Scripts/python.exe`, not a bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; a build must run before e2e.
- Concurrent sessions share this checkout: never `git add -A` without
  authorisation; never kill port 3000 blindly.
- Free subagent model quota can be exhausted mid-run; keep a fallback
  model configured.
- Four backend tests fail at baseline: `test_impact_assessment`,
  `test_travel_fuel_guard` (×2), and
  `test_cpu_routing_weather::…seed_fallback`. Treat them as pre-existing.
