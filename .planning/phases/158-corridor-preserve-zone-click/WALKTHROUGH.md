# WALKTHROUGH — Phase 158: Corridor-Preserve on Zone Click

**Mode:** docs-only; no code touched, no commit.

## What was done

1. Read the `af0f60d` diff (single file, +8/−9).
2. Verified both wipe removals + preserve comments in the live tree
   (`DashboardClient.tsx:2282,2314`).
3. Verified explicit reset path intact (`:472-473`, `:337-340`).
4. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by diff + code read this pass)

| Claim | Verification |
|---|---|
| Forecast wipe removed | `routes = []; setCurrentMapRoutes([])` deleted |
| No-O-D wipe removed | `if (!forecastActive && !(originId && destId))` wipe deleted |
| Audit payload honest-empty | "honestly carries zero route_recommendations" |
| Explicit reset kept | `handleResetCorridors` + Reset Rute pill |
| tsc | exit 0 (window tail) |

## Deliberately NOT done (per scope)

- No behavior edits; no commit, no push.
