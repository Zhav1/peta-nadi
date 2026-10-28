# PLAN — Phase 176.12: Fleet Regression & Waspada Dots

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `a1b68de` — `fix(m9): restore fleet telemetry rendering, waspada purple dot layer`
· merge `c5ea49d` · docs `f00bffc` (production captures 1920×1080, 390×844, Waspada ON)
**Diff size (verified):** `a1b68de` — 15 files, +741/−125; `f00bffc` — 5 files, +211

## Objective

Users reported the fleet telemetry had vanished. Counters still showed
vehicles, the map showed none. Find the cause — it turned out to be a
functional bug, not a styling one — fix it, and make the failure mode
impossible to repeat silently. Then finish the Waspada visual language
as a purple point layer.

## Scope IN — root cause

- `FleetVehicleLayer.tsx` nested a `['zoom']` interpolate **inside a
  `case` branch** for `circle-stroke-opacity`.
- Mapbox permits `['zoom']` only at the **top level** of `step` /
  `interpolate`. `addLayer` threw; a surrounding `try/catch` swallowed
  the error.
- The layer therefore never existed — while the counters, reading the
  same array, still reported vehicles.

## Scope IN — the fix

- Paint extracted to `frontend/lib/mapDataPaint.ts` with a valid
  top-level expression (verified: `['zoom']` appears only at the top
  level of an `interpolate`, and a comment records the constraint).
- `frontend/scripts/test_fleet_paint.ts` — a style-spec validator that
  also runs a deliberately broken control expression, so the validator
  proves it can fail.
- `test_fleet_scope.ts` extended against live payload field names.
- Waspada becomes a purple FIRMS-style dot layer: `#a855f7` points at
  polygon centroids, r 4/5/6, a halo, a faint 10% area fill, and a dashed
  `#c084fc` outline.
- Modality colours shifted to free violet: aircraft `#e2e8f0`, vessel
  `#2dd4bf`.

## Scope OUT

- No change to fleet ingestion or tenancy (Phase 173 boundaries stand).
- No change to counter definitions.
- No Playwright run — verification was `tsc`, build, and node tests.

## Decisions locked

1. **A `try/catch` around `addLayer` must never be silent.** The layer's
   absence was invisible; the catch made it permanent.
2. **Paint is data, and data gets validated.** A style-spec parse of the
   paint object catches nested-zoom and type errors before a browser
   does.
3. **Test the validator too.** A control expression that must fail keeps
   the validator honest.
4. **Violet is Waspada's.** Aircraft and vessel moved off violet so the
   hazard layer owns it unambiguously.

## Risk notes

- A counters-versus-map disagreement is the worst failure class here: the
  number says 26, the map says zero, and neither is marked wrong.
- `mapbox-gl` style-spec is imported in a node script; it is a dev-side
  dependency path, not a bundler alias — moving the file can break the
  validator before it breaks the app.
