# PLAN — Phase 116: Gap Shims Scaffold

**Status:** PLANNED ⏳ (scaffold only; no app edits in this docs pass)
**Date:** 2026-10-25
**Parent:** Phase 115 gap inventory (7 missing primitives)

## Goal

Scaffold the 8-file gap-shim layer so the Phase 115 connection pass can land
without `npx shadcn add`, without Portal-over-Mapbox, and without re-triggering
the P1/P3 same-file collision.

## Scope

### C1 — base-ui primitives (hand-rolled, no new deps)
- `frontend/components/base-ui/empty.tsx` — honest-empty block (`role=status` hook preserved).
- `frontend/components/base-ui/skeleton.tsx` — loading skeleton (`motion-safe:` shimmer only).
- `frontend/components/base-ui/tooltip.tsx` — static-title tooltip (CSS group-hover; NO Portal over map).

### C2 — hand-rolled interactive shims (CSS only, motion-safe)
- `frontend/components/base-ui/status-picker.tsx` — native `<select>`-styled status picker (replaces Select primitive need).
- `frontend/components/base-ui/editable-chip.tsx` — chip row with inline edit (replaces Chip primitive need).
- `frontend/components/base-ui/budget-card.tsx` — widget frame card (replaces Card primitive need).

### C3 — chart shims on installed recharts ^3.9.2
- `frontend/components/charts/disparity-bar.tsx` — PIHPS disparity bar (recharts BarChart).
- `frontend/components/charts/trend-line.tsx` — price trend line (recharts LineChart).

### Consumer swap
- `frontend/components/AnalyticsSection.tsx` — import swap only (shims in, no logic change).

## Decisions / constraints (carried)

1. `npx shadcn add` is BANNED.
2. No `motion/react`, no `react-icons`, no `hugeicons`, no `@radix-ui/*` new installs.
3. No `Portal` over the Mapbox canvas (portal-clipping rule, Phase 112).
4. No `hideWhenDetached` dependency (absent in Base-UI 1.9.0) — dismissal via focus/hover CSS.
5. Tooltip uses the render-pattern (trigger renders inside tooltip wrapper), not `asChild`.
6. Dark editorial: 12px min, `tabular-nums`, Lucide icons only, `motion-safe:` on every animation.
7. One writer per file (P1/P3 collision rule) — C1/C2/C3 split across workers by file.
8. Do NOT downgrade recharts (2.15.4 vs 3.9.2): stay on installed ^3.9.2.

## Interfaces

- In: existing Analitik states (`commodity`, `priceRegion`, `corridorFilter`, `days`, spikes/rank payloads).
- Out: drop-in shim swaps; same DOM roles (`role=status` E2E hook in Empty preserved), same `tabular-nums`/`text-xs` chrome.

## Verification (connection pass, not this docs pass)

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run build` → 7/7 routes
- [ ] Playwright auto-check incl. E2E no-interference
