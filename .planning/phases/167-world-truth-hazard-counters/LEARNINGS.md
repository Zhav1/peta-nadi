# LEARNINGS — Phase 167: World-Truth Hazard Counters

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**A counter must report world truth, never UI toggle state.** The bug
was not a wrong number; it was a number answering the wrong question.
`advisoryFeatures` described "what is drawn right now" and the badge
used it to answer "how many hazards exist". Any toggle, filter, or
viewport change silently rewrote a factual claim.

Corollary, same phase: **degraded must be `null`/`—`, never `0`.**
Before the tri-state, an unreachable upstream was indistinguishable from
a verified quiet day. Zero is a measurement; unknown is not.

## 2. Fixes tried (what worked, with file evidence)

1. **Separate contract** — added `/api/v1/weather/summary` in
   `routing_router.py` instead of teaching the polygon endpoint a second
   shape. The map keeps `MAX_WEATHER_FEATURES = 24`
   (`weather_fusion_service.py:34`); the header gets uncapped totals.
2. **Demoted the cap** — the constant stayed, its meaning changed from
   "how many hazards exist" to "how many polygons we render". Smaller
   diff than deleting it, and it documents the two-number hazard.
3. **Tri-state instead of a boolean** — `ok` / `stale` / `degraded` /
   `empty` lets the UI distinguish "quiet" from "blind" from "old".
4. **Two buckets, two severities** — `cuaca` (high/critical) and
   `waspada` (medium) never summed, so the header cannot invent a
   severity that no source assigned.

## 3. Concerns (open)

1. `MAX_WEATHER_FEATURES` surviving as a render cap means two numbers
   with the same name-family exist. A future reader can re-merge them.
2. `status` is now load-bearing in `WeatherSummary`; a serializer that
   drops it yields a permanent `—`, which looks like an outage.
3. Severity mapping (`cuaca` → high/critical) lives in the router. If a
   new bucket appears it must be classified explicitly, not defaulted.

## 4. Conditions (observed this window)

- Operational users read the header as a statement of fact and act on
  it; a `0` that means "we did not look" is worse than a blank.
- The map layer must stay toggleable — hiding polygons is a legitimate
  decluttering action.

## 5. Issues found (do not repeat)

1. Deriving a factual count from a display array is the root cause here;
   search for other `.length` on filtered arrays before trusting them.
2. A backend cap applied upstream of a count is invisible in the UI —
   counts and payloads need separate code paths.

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
