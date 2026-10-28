# WALKTHROUGH — Phase 176.12: Fleet Regression & Waspada Dots

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** user report — fleet telemetry had disappeared from the map.

## What was done

1. Read the diffstat: `a1b68de` — 15 files, +741/−125; docs `f00bffc` —
   5 files, +211.
2. Traced the disappearance to `FleetVehicleLayer.tsx`: a `['zoom']`
   interpolate nested inside a `case` branch for
   `circle-stroke-opacity`. Mapbox allows `['zoom']` only at the top
   level of `step`/`interpolate`, so `addLayer` threw.
3. Confirmed the blast radius: the throw was caught by a surrounding
   `try/catch`, so the layer was never added, and the counters — reading
   the same array — kept showing vehicles. Screens disagreed with
   themselves.
4. Moved the paint into `frontend/lib/mapDataPaint.ts` as a valid
   top-level expression; verified in-file that `['zoom']` occurs only at
   the top level of an `interpolate`, with the constraint written in a
   comment.
5. Added `frontend/scripts/test_fleet_paint.ts`: validates paint with the
   real style-spec parser and includes a deliberately broken control
   expression, so the test proves it can fail.
6. Extended `test_fleet_scope.ts` against live payload field names.
7. Rebuilt Waspada as a purple FIRMS-style layer: `#a855f7` points at
   polygon centroids, r 4/5/6, halo, faint 10% area, dashed `#c084fc`
   outline.
8. Freed violet by moving aircraft to `#e2e8f0` and vessel to `#2dd4bf`
   (verified in `mapDataPaint.ts`).

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Fix commit exists | `git log -1 a1b68de` → `fix(m9): restore fleet telemetry rendering, waspada purple dot layer` |
| Merge commit exists | `git log -1 c5ea49d` |
| Docs commit exists | `git log -1 f00bffc` → `docs(m9-fleet): production captures 1920x1080, 390x844, waspada advisory ON` |
| Paint module exists | `frontend/lib/mapDataPaint.ts` |
| Top-level zoom enforced in code | file comment + placement: `['zoom']` only at top level of `interpolate` |
| Modality colours | `maritime: '#2dd4bf'`, `air: '#e2e8f0'` present |
| Waspada violet | `circle-color: '#a855f7'` at `mapDataPaint.ts:94` |
| Validator exists | `frontend/scripts/test_fleet_paint.ts` requires `mapbox-gl/dist/style-spec/index.cjs` and calls `validate` |
| `tsc` / build | exit 0 / exit 0 (reported) — **not re-run in this pass** |
| Node tests | 4 (reported) — **not re-run in this pass** |
| Live payload | 379 vehicles (302 maritime, 33 truck, 45 air), 0 null coordinates (reported) |

## Before → after

| Surface | Before | After |
|---|---|---|
| Fleet layer | never added (`addLayer` threw, caught silently) | present; paint validated by style-spec |
| Counters vs map | counters 26, map empty | both derived from a rendering layer that exists |
| Paint location | inline in `FleetVehicleLayer.tsx` | `frontend/lib/mapDataPaint.ts` |
| Paint verification | none | `test_fleet_paint.ts` + control expression + extended scope test |
| Waspada | hazard chrome | purple dot layer, centroids, halo, 10% area, dashed outline |
| Aircraft / vessel | `#a78bfa` / `#e2e8f0` | `#e2e8f0` / `#2dd4bf` |

## Deliberately NOT done (per scope)

- No fleet ingestion, tenancy, or counter-definition change.
- No Playwright run; verification was `tsc`, build, node tests, and a
  live payload check.
- No commit, no push from this documentation pass.
