# PLAN — Phase 153: P4 Titik Panas Cluster + Advisory Rename

**Window:** 2026-10-26/27 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `fc67632`, `2de5ff8` (restore), `1668222`

## Objective

Record the P4 slice: FIRMS Titik Panas single-link clustering
(≥3 high-confidence points within 5 km → orange map-only highlight; raw
detections stay small neutral) and the Waspada Dini (Advisory) naming for
medium-drizzle non-disruption weather.

## Scope IN

- Cluster gate (`CrisisMap.tsx:270,288-289,334-370`): confidence ≥80 or
  FRP > 100; single-link 5 km radius; only components with ≥3 points
  become highlight zones (`:947-948,1827-1874`).
- Raw dots neutral slate; cluster circles orange (map-only exception),
  cluster popup reports count (`:1609-1622`).
- Advisory rename: medium drizzle = `Waspada Dini (Advisory)`, default
  OFF toggle, slate/cyan dot (`TopNavTelemetry.tsx:162-177`).
- Legend copy (`DashboardClient.tsx:193,201,1166`).

## Scope OUT

- No FIRMS ingestion change (Phase 157); no advisory-behavior change
  (Phase 156); no commit/push.

## Decisions locked (from diffs + code reads)

1. Orange is reserved for ≥3-cluster highlights only — the single
   map-color exception; everything else stays main+neutral.
2. Raw detections never imply a zone; clusters do.
3. "Waspada Dini" names the advisory tier distinctly from disruption Cuaca.
