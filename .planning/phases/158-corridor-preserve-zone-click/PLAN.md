# PLAN — Phase 158: Corridor-Preserve on Zone Click

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `af0f60d`

## Objective

Record the corridor-preserve fix: zone clicks (incl. forecast zones and
evidence-only highlighted zones) never wipe the operator's active
corridors — `currentMapRoutes` incl. sea/air intermodal legs is preserved.

## Scope IN

- Forecast path: `setCurrentMapRoutes([])` / `setActiveRouteIdx(null)`
  wipe removed; replaced with preserve (`DashboardClient.tsx:2272-2281`).
- No-O-D path: `setCurrentMapRoutes([])` wipe for highlighted zones
  removed; audit crisis honestly carries zero `route_recommendations`
  while the map keeps drawing active corridors (`:2302-2314`).
- Intermodal note: land detours merge with preserved
  `intermodalAndHoldCorridors` extras (`:2109-2118`).

## Scope OUT

- No routing-math change; no commit/push.

## Decisions locked (from diff + code reads)

1. Zone click = inspect, never clear: map state and audit payload are
   decoupled (payload may be empty; map keeps corridors).
2. Sea/air intermodal legs are operator corridors too — same preserve
   rule, no modality exception.
3. Corridor reset stays an explicit operator action
   (`handleResetCorridors`, corridor-visibility toggles).
