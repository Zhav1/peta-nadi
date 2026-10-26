# WALKTHROUGH — Phase 130: Fallback Backdate + CURRENT_DATE Shadowing Fix (020)

Docs-only window. No app files edited, no tests run, no commits.

## What was read (file:line)

1. `infra/supabase/migrations/020_fuel_fallback_backdate.sql` (full, 32 lines)
   - `:3-8` shadowing diagnosis with concrete dates (artifact 2026-10-26 vs SK
     freeze 2026-10-05, same 6800 price, wrong `source`).
   - `:10-15` backdate to 2022-09-02 rationale; `:17-32` idempotent guarded
     `UPDATE ... WHERE id='FP-BIOSOLAR-NASIONAL'`.
2. `backend/app/services/spoilage_hedging_service.py:194-277`
   - `:232-236` region candidates `[region, NASIONAL]`; `:245-255` latest-`<=`
     query `limit 5`; `:257-265` non-fallback preference with artifact-vs-freeze
     comment; `:266-274` `ESDM_SK` vs `PERTAMINA_FALLBACK` return shape.

## Fixes tried

None in this window (docs-only). Recorded layering from reading:
- Layer 1 (data, 020): artifact can no longer win by date.
- Layer 2 (code, resolver tie-break): even where 020 is not yet applied, the
  SK row wins the tie. Either layer suffices; both are kept.

## Test evidence

No tests executed here. The shadowing scenario (identical 6800, different
`source`) is exactly what `test_erp_trip_row_exposes_fuel_provenance`
branches on (`test_travels_erp.py:441-449`: `PERTAMINA_FALLBACK` vs `ESDM_SK`
with `fuel_is_fallback` TRUE/FALSE); re-run belongs to Phase 131's suite, not
this window.
