# PLAN — Phase 152: P3 Zone Evidence-Only + Causal

**Window:** 2026-10-26/27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `fc67632` (preview; gate verified live in tree)

## Objective

Record the P3 zone slice: zone clicks are evidence-only (Mitigation /
Economic tabs locked until a real route exists), `hold_staging` never
counts as a route, and the GraphRAG causal chain stays always-visible.

## Scope IN

- Evidence-only gate (`CrisisSidebar.tsx:25,56-68`): `visibleTabs =
  hasRoute ? ['Evidence','Mitigation','Economic'] : ['Evidence']`;
  `effectiveTab` forced to Evidence without a route.
- `hold_staging` exclusion: filter `(r) => r.corridor_type !==
  'hold_staging'` (`:60`) + `activeFallbackRoute?.corridor_type !==
  'hold_staging'` (`:66`) — HOLD placeholders never unlock action tabs.
- Causal chain: always-visible Why-this-alert section with collapse
  (`:183-206`, `CausalChainPanel.tsx`).

## Scope OUT

- No consensus/impact math change; no commit/push.
- Corridor preservation on zone click lives in Phase 158.

## Decisions locked (from diffs + code reads)

1. A highlighted zone with no route shows Evidence only — no stale or
   placeholder action tabs.
2. Forecast HOLD placeholders are display-only; they are not routes.
3. Causal timeline stays readable in every zone state.
