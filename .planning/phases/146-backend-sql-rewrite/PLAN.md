# PLAN — Phase 146: Backend SQL Rewrite

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the backend performance slice: 60 s auth cache, ERP SQL aggregates
+ `LIMIT 500` + Redis 120 s + regulator early-return, select projections,
commodity caps, and migration 022
(`erp_ledger_totals`, `commodity_baseline_means`) — all shapes intact.

## Scope IN (this folder only)

- Auth cache 60 s; ERP aggregates in SQL with limit 500 + Redis 120 s TTL.
- Regulator early-return path; select projections; commodity caps.
- Migration 022: `erp_ledger_totals` + `commodity_baseline_means`.

## Scope OUT

- No response-shape change, no new public endpoints in this slice.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. Aggregates move to SQL (not Python loops); `LIMIT 500` bounds the
   working set; Redis 120 s absorbs repeated panel polls.
2. Regulator read path early-returns cached aggregates (no per-row scan).
3. Migration 022 is additive (two new tables); existing ledger tables untouched.
4. Shapes intact: response keys/field names frozen for E2E.
5. Env notes: Supabase = prod ledger; Render = free single worker;
   Redis TTL is the only invalidation lever (no manual purge tool).
