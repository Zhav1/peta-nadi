# PLAN — Phase 130: Fallback Backdate + CURRENT_DATE Shadowing Fix (020)

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26

## Goal

Stop the 016 biosolar fallback artifact (`effective_date=CURRENT_DATE`,
`is_fallback TRUE`) from shadowing the verified SK freeze row (2026-10-05) in
latest-date-wins resolution. Two-layer defence: data backdate (020) + resolver
prefers non-fallback rows (code).

## Scope files (read, not edited)

- `infra/supabase/migrations/020_fuel_fallback_backdate.sql:1-32`
  - Diagnosis (`:1-8`): artifact date (e.g. 2026-10-26) newer than SK freeze
    2026-10-05 → latest-date resolver returned `PERTAMINA_FALLBACK` instead of
    `ESDM_SK 6800`.
  - Fix (`:10-15`): move artifact to 2022-09-02 (day before SK 218 effective
    2022-09-03); same price, still `is_fallback TRUE`; frozen travel rows
    untouched (they carry their own frozen rate, never recomputed unless
    explicitly repriced).
  - Safety (`:17-32`): idempotent, conflict-safe `NOT EXISTS` guard on the
    `(biosolar, NASIONAL, 2022-09-02)` slot.
- `backend/app/services/spoilage_hedging_service.py:194-277`
  - `get_fuel_rate_for_trip` (`:199-214` contract): per-region candidate,
    latest `effective_date <= at_date`, **preferring non-fallback (ESDM_SK)
    rows** over fallback artifacts when both apply (`:257-274`, with explicit
    comment `:258-263` naming the 016 artifact vs 2026-10-05 freeze shadowing).
  - Date normalisation `_parse_rate_date` (`:175-191`): str/datetime/date/None
    → date, defaults today; freeze-at-created_at keys on `at_date`
    (`travel_ledger_service.py:344-346,388-395`).

## Decisions

1. Data fix first (020 moves the artifact out of the way), code tie-break
   second (non-fallback preference) — either layer alone resolves the observed
   mis-resolution; both together are defence-in-depth.
2. Frozen rows are never silently repriced; only explicit `_reprice_at_date`
   (one-time backfill, Phase 131) changes history.
