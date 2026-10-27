# LEARNINGS — Phase 146: Backend SQL Rewrite

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Auth 60 s cache** — session/claim lookups cached 60 s; cuts
   per-request auth round-trips on the single Render worker.
2. **ERP SQL aggregates + `LIMIT 500` + Redis 120 s** — aggregation in
   SQL over a bounded 500-row window; panel re-polls hit Redis 120 s
   instead of Supabase.
3. **Regulator early-return** — read-only aggregate path returns cached
   totals without per-row scans.
4. **Select projections + commodity caps** — explicit column lists and
   row caps bound payload size.
5. **Migration 022** — new `erp_ledger_totals` +
   `commodity_baseline_means` tables; existing ledger tables untouched;
   response shapes intact.

## 2. Concerns (open, evidenced)

1. `LIMIT 500` truncates the aggregate window — ledgers past 500 rows
   need a documented rollup strategy or totals silently exclude tail rows.
2. Redis 120 s is the only invalidation lever (no purge tool); a bad
   aggregate persists up to 120 s with no manual clear.

## 3. Constraints (observed this window)

- Never break E2E/API shapes: keys and field names frozen.
- Subagents-only to protect main context; no default subagent — High only.
- Env: Supabase prod ledger; Render free single worker; Redis TTL-based.
- Additive DDL only (migration 022 adds tables, alters none).

## 4. Conditions (environment this window)

- Roles: Dispatcher writes ledger; Regulator reads cached aggregates;
  Guest sandbox, no ledger writes.
- Honest-empty: empty aggregates render empty state, never zero-filled totals.
- Graceful fallback: Redis miss falls through to SQL; SQL failure
  surfaces degraded copy, never a 500 panel.

## 5. Issues found (do not repeat)

1. Duplicate double-submit: aggregate endpoints need idempotency on
   write paths even when reads are cached.
2. Placeholder drift: capped queries must keep example values realistic.
3. Stale `.next/standalone` can pin old aggregate polling intervals.
4. Render cold start (30–77 s observed pattern) exceeds client
   deadlines — first aggregate poll after idle fails retryably.
5. Redis has no invalidation tool — version cache keys; never hand-edit.
6. 5 pre-existing `system_audit` fails unrelated to this slice.
