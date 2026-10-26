# WALKTHROUGH — Phase 131: Ledger Math + Freeze + Backfill Reprice

Docs-only window. No app files edited, no tests run, no commits.

## What was read (file:line)

1. `travel_ledger_service.py` (891 lines, full read)
   - `:50-64,150-168` Supabase-first routing + backend label; `:191-202`
     haversine; `:287-373` fuel context; `:376-528` ledger; `:604-657`
     hedging; `:725-779` trip row; `:782-838` ERP summary
     (`DISPATCHER_DETAIL` vs `REGULATOR_AGGREGATE`).
2. `spoilage_hedging_service.py` (targeted reads)
   - `:100-130` constants; `:194-277` SK resolver; `:280-309`
     `resolve_fuel_efficiency_kmpl` + `payload_adjusted_kmpl`; `:367-451+`
     solver with per-trip efficiency + reefer branches.
3. `backfill_fuel_golongan.py:1-143` (full read) — dry-run/apply, reprice key,
   measured-actual preservation, audit log.
4. `test_travels_erp.py` (targeted reads)
   - `:160-197` ledger uses real BPJT/fuel/spoilage; `:204-228` planned-vs-actual;
     `:425-461` provenance + economy; `:464-482` null economy; `:485-530`
     override + reefer + GOL_V default.

## Fixes tried

None in this window (docs-only). Behavioural fixes recorded from reading code:
- Unrecorded trips mirror baseline → zero savings by construction
  (`:436-447,519-526`), closing "phantom savings" without a flag.
- Actual toll with no segments → `[]` → 0 (`:450-453`); known overstatement of
  toll savings when actuals recorded without toll segments (carried concern).
- Economy gated on `actual_recorded AND d>0 AND f>0` (`:734`); planned rits
  yield `None`, never 0 (`:464-482` test).

## Test evidence

No tests executed in this docs window. Claimed suite (from file reads, not
re-run): `backend/tests/test_travels_erp.py` — ledger BPJT/fuel assertions
(`:160-197`), hermetic-vs-SK provenance branch (`:437-449`), golongan math
(`:450-453`), null economy (`:464-482`), override/reefer (`:485-530`),
GOL_V-never-flat-3.5 (`:512-530`). Re-run not performed here; Phase 133 notes
hermeticity implications.
