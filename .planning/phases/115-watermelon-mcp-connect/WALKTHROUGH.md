# WALKTHROUGH — Phase 115: Watermelon MCP Connect

## Status

PLANNED — no code changed in this window. This file logs the gap inventory and risk register handoff so the connection pass starts from evidence, not rediscovery.

## Gap inventory (no base-ui primitive exists today)

1. **Select** — filter bars (`commodity`, `priceRegion` L950, `corridorFilter`, `days`) currently use non-primitive controls.
2. **Chip** — filter-chip row (L1022) uses bespoke spans.
3. **Card** — widget frames are hand-rolled panels.
4. **Empty** — `AnalyticsEmpty` (L172) is local to `AnalyticsSection.tsx`, not a shared primitive.
5. **Skeleton** — `LoadingSkeleton` (L221) is local, not shared.
6. **Tooltip** — static titles rely on native `title` (L1196); no primitive for rich tooltips (and none allowed over Mapbox).
7. **Chart** — disparity/spread visuals have no chart primitive (no RED-synthesis charts; honest series only).

## Risk register (from this window)

- `asChild` vs render-prop warning on trigger composition (Phase 112) — gate every new trigger in review.
- `hideWhenDetached` missing in Base-UI 1.9.0 — dismissal behavior must be hand-verified per popover/tooltip.
- Portal-over-Mapbox clipping (L1130 rule) — primitives must never portal onto the WebGL canvas.
- `npx shadcn add` banned — MCP-or-hand-rolled only.
- Concurrent same-file edits overwrote P1/P3 regions — one writer per file (Phase 114 rule).

## Verification logs

- None yet — connection pass must produce: `tsc` 0, `npm run build` 7/7, `pytest` green, Playwright auto-check incl. E2E no-interference (Peta/Laporan/Evaluasi 403 paths).
- Window baseline carried forward: `tsc` 0, build 7/7, pytest 49 passed, Playwright 1 passed (live).
