# PLAN — Phase 143: Selesaikan Trip

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the single-action completion slice: `Aktual` + `Hitung` merged into
one `Selesaikan Trip` PATCH, then auto-POST hedging — with legacy controls
hidden (not deleted) for E2E stability and 403 guards intact.

## Scope IN (this folder only)

- `Selesaikan Trip`: single PATCH (actuals) → auto POST hedging on success.
- Legacy `Aktual`/`Hitung` buttons hidden behind flag, routes kept for E2E.
- 403 guards: Guest/Regulator sandbox path preserved.

## Scope OUT

- No contract change, no new tables, no E2E spec rewrite in this slice.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. One click = PATCH actuals then auto-POST hedging; no intermediate
   committed state visible to the operator.
2. Legacy controls hidden, not removed — E2E selectors still resolve.
3. 403 maps to sandbox toast + optimistic local state (existing behavior kept).
4. Known spec drift: `laporan-aktual` spec text still describes the old
   two-button flow — spec update deferred, code is canonical.
