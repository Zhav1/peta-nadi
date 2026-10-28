# LEARNINGS — Phase 176.12: Fleet Regression & Waspada Dots

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Never nest `['zoom']`.** Mapbox accepts it only at the top level of a
`step`/`interpolate`; `FleetVehicleLayer.tsx` placed one inside a `case`
branch for `circle-stroke-opacity`, `addLayer` threw, and the layer never
existed.

**And never let a `try/catch` around `addLayer` be silent.** The throw was
caught — no error, no failing test — while the counters, reading the same
array, still reported vehicles and the map stayed empty.

## 2. Fixes tried (what worked, with file evidence)

1. **Paint extracted to `frontend/lib/mapDataPaint.ts`** — top-level
   `['zoom']` only, constraint stated beside the code.
2. **Style-spec validation** — `test_fleet_paint.ts` requires
   `mapbox-gl/dist/style-spec/index.cjs`, calls `validate`, and includes a
   deliberately broken control expression so the validator can fail.
3. **Scope test against live field names** — `test_fleet_scope.ts` matches
   the payload the API actually returns, so a rename is caught.
4. **Loud failure expectation** — log `addLayer` failures, never swallow
   them; a missing layer must be visible.
5. **Waspada visual language** — violet `#a855f7` centroid points (r 4/5/6)
   with halo, 10% area fill, dashed `#c084fc` outline; aircraft `#e2e8f0`
   and vessel `#2dd4bf` moved off violet.

## 3. Concerns (open)

1. Style-spec is imported by a node script via a deep path
   (`dist/style-spec/index.cjs`); a dependency layout change breaks the
   validator, not the app, and looks like "tests are broken".
2. Silent `try/catch` is a pattern: other `addLayer` sites should be
   audited for the same shape (**not verified in this phase**).
3. Counters and map share an array but not a render path; agreement is
   coincidence unless asserted. Modality colour stays single-channel, and
   violet is now reserved for Waspada.

## 4. Conditions (observed this window)

- Users noticed the absence, not an error: telemetry stopped being drawn
  while numbers kept moving.
- Captures at 1920×1080 and 390×844 with Waspada ON recorded in `f00bffc`;
  live guest payload 379 vehicles (302 maritime, 33 truck, 45 air), 0 null
  coordinates.

## 5. Issues found (do not repeat)

1. Nested `['zoom']` throws at `addLayer` time, not at build or type check
   — TypeScript cannot catch it.
2. A `try/catch` around layer creation turns a hard failure into an
   invisible one; log and surface it.
3. A validator never seen red may validate nothing, and counters reading
   the data do not prove a layer was drawn — assert the layer, not the count.

## 6. Environment constraints (this checkout)

- Windows + PowerShell; backend interpreter is
  `backend/.venv/Scripts/python.exe` (Python 3.13.7), not bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; build before e2e, and
  `reuseExistingServer` can serve a stale build.
- Concurrent sessions share this checkout: never `git add -A` without
  authorisation; branch switches can carry another session's edits;
  port 3000 collisions poison a run.
- `DEEPSEEK_API_KEY` in `.env` is the placeholder
  `your-deepseek-api-key`; `OPENCODE_API_KEY` is real.
- Production: Vercel `pre-hub.vercel.app`, Render
  `peta-nadi.onrender.com`; `/health` reports
  `environment:"development"` because the Render blueprint is unsynced.
- Baseline backend failures: `test_impact_assessment`,
  `test_travel_fuel_guard` (×2),
  `test_cpu_routing_weather::…seed_fallback`.
- Cache TTLs can mask a deploy (FIRMS 1h, geocode 24h) — the Waspada
  layer depends on FIRMS; a one-hour cache can make a paint change look
  undelivered. Verify with a cache-busting key or after expiry.
