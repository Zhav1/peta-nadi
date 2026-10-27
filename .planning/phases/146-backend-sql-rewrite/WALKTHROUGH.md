# WALKTHROUGH — Phase 146: Backend SQL Rewrite

**Mode:** docs-only; no code touched, no tests re-run, no commit.

## What was done

1. Documented 60 s auth cache and ERP SQL aggregates (`LIMIT 500`) +
   Redis 120 s + regulator early-return.
2. Documented select projections + commodity caps (bounded columns/rows).
3. Documented migration 022 (`erp_ledger_totals`, `commodity_baseline_means`).
4. Confirmed response shapes intact for E2E.
5. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by code read this pass)

| Claim | Verification |
|---|---|
| Auth 60 s cache | Auth/session cache TTL 60 s |
| SQL aggregates + limit 500 + Redis 120 s | Aggregate queries capped 500 rows; cache TTL 120 s |
| Regulator early-return | Read path returns cached aggregates |
| Select projections + caps | Explicit column lists; commodity row caps |
| Migration 022 | `erp_ledger_totals` + `commodity_baseline_means` DDL |
| Shapes intact | Response keys unchanged |

## Deliberately NOT done (per scope)

- No endpoint rename, no shape change.
- No commit, no push.
