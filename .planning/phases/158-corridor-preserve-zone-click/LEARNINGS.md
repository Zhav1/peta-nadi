# LEARNINGS — Phase 158: Corridor-Preserve on Zone Click

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Corridor-preserve lesson** — deleting two `setCurrentMapRoutes([])`
   wipes ended ships/planes disappearing on every zone click; inspection
   and map state are now decoupled.
2. **Honest-empty audit payload** — zero `route_recommendations` for a
   zone is correct data; wiping the map to match was the bug.

## 2. Concerns (open, evidenced)

1. Preserved corridors can go stale relative to a newly inspected zone;
   the Reset Rute pill is the operator's explicit escape hatch.
2. `preservedExtras` merge (`:2110-2118`) must keep sea/air legs across
   future land-recalc refactors.

## 3. Constraints (observed this window)

- Zone click never mutates corridor state; only O-D recalc or explicit
  reset may.
- E2E route→HITL→commit unaffected (display-layer only).

## 4. Conditions (user-stated this window)

- Ships/planes stay on zone click (explicit operator ask).

## 5. Issues found (do not repeat)

1. Syncing the map to the audit payload (empty zone → empty map) reads
   as data loss — decouple display state from inspection payload.
