# LEARNINGS — Phase 170: Small-Town Routing

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**No silent early returns on failure paths.** `routing_router.py` returned
`status: "no_route"` and the dashboard simply rendered nothing. The
backend had done the honest thing — it reported failure — and the UI
converted that report into a blank screen. A failure that is not shown is
indistinguishable from a crash.

The second lesson is a design rule with teeth: **provenance must be
visible when geometry is approximated.** Widening snapping to
`MAX_SNAP_KM = 75.0` buys small-town coverage, but a 75 km snap is not a
road. Without the `geometri jalan` / `koridor hub` / `simulasi offline`
badges, the coverage win would have been a truth regression.

## 2. Fixes tried (what worked, with file evidence)

1. **Bounded snapping** — `MAX_SNAP_KM = 75.0` (`cpu_routing_adapter.py:68`),
   justified against a measured 38.6 km median hub spacing rather than a
   round number.
2. **Second-nearest retry with a floor** — retried only when the
   alternative node is ≥ 15 km away, which prevents a cosmetic "retry"
   that lands on a neighbouring node of the same junction.
3. **Distinct-node guard** — origin and destination can no longer
   collapse to one node, which previously produced a zero-length route.
4. **Reason-coded failures** — `no_route` now carries a human reason plus
   `reason_code`, and `DashboardClient.tsx` renders it.
5. **Provenance module** — `frontend/lib/routeProvenance.ts` (+70, new)
   classifies geometry as `geometri jalan`, `koridor hub`, or
   `simulasi offline`, surfaced in `RouteDetailModal.tsx`.
6. **Alternatives** — `k_alternatives: 3`, so one bad snap no longer
   means no answer.

## 3. Concerns (open)

1. 75 km is generous by design; it admits coarse geometry. The badge is
   the only thing keeping that honest.
2. Towns whose two nearest nodes are < 15 km apart still fail the
   distinct-node test and must return `no_route` — correct, but it will
   look like a regression to a user in that town.
3. `simulasi offline` routes exist as a fallback; they are labelled, but
   nothing prevents a future caller from discarding the label.

## 4. Conditions (observed this window)

- The product serves small towns, not just provincial capitals; a router
  that only works on the corridor is not the product.
- Operators need to know whether a line on the map is a road or an
  approximation before they commit a trip to it.

## 5. Issues found (do not repeat)

1. An unbounded "nearest node" lookup will always eventually return a
   node in another province; a snap without a maximum is not a snap.
2. A retry without a distance floor is theatre — it can return the same
   junction with a different id.
3. A frontend that ignores a status field turns a correct backend into a
   black screen. Audit every `status` the API can emit.

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
