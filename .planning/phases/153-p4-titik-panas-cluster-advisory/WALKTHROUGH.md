# WALKTHROUGH — Phase 153: P4 Titik Panas Cluster + Advisory

**Mode:** docs-only; no code touched, no commit.

## What was done

1. Verified cluster builder + gate
   (`CrisisMap.tsx:270-370,947-948,1827-1874`).
2. Verified orange-exception styling + cluster popup (`:1609-1622`).
3. Verified advisory pill + default-OFF wiring
   (`TopNavTelemetry.tsx:162-177`; state `DashboardClient.tsx:1002`).
4. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by code read this pass)

| Claim | Verification |
|---|---|
| Cluster rule | conf ≥80 or FRP>100; single-link 5 km; ≥3 pts |
| Raw neutral, cluster orange | `:973` slate dots; cluster orange circles |
| Advisory naming | `Waspada Dini (Advisory)`, default OFF |
| tsc | exit 0 (window tail) |

## Deliberately NOT done (per scope)

- No ingestion or behavior edits; no commit, no push.
