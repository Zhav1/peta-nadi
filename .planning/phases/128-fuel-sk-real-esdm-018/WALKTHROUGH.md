# WALKTHROUGH — Phase 128: Real ESDM SK Fuel Rows (018)

Docs-only window. No app files edited, no tests run, no commits.

## What was read (file:line)

1. `infra/supabase/migrations/018_fuel_sk_real.sql` (full, 74 lines)
   - `:1-18` verified-values header + scope guard (no per-province dex).
   - `:20-23` idempotent unique-index guard (safe standalone apply).
   - `:26-37` biosolar SK row (SK 218, 2022-09-03, JDIH URL, FALSE).
   - `:39-51` biosolar freeze re-confirm (2026-10-05, same SK basis, FALSE).
   - `:54-68` dex NASIONAL rows (SK 245 formula basis, FALSE, provenance notes
     instead of invented article URLs).
   - `:69-74` conflict-update clause (price/sk/url/fallback refreshed).
2. Cross-checks (reference only):
   - `spoilage_hedging_service.py:238-274` — resolver prefers newest
     non-fallback row per region candidate, returns `source ESDM_SK`.
   - `test_travels_erp.py:437-449` — hermetic comment + branch assertions.

## Fixes tried

None in this window (docs-only). The known follow-up this migration caused is
owned by Phase 130: the 016 `CURRENT_DATE` biosolar artifact (newer than the
2026-10-05 SK freeze) shadowed these SK rows until migration 020 backdated it
plus the resolver learned to prefer non-fallback rows.

## Test evidence

No tests executed here. Provenance agreement (6800 in both modes) is asserted
by `test_erp_trip_row_exposes_fuel_provenance`
(`test_travels_erp.py:431-461`); hermetic-vs-SK branching is documented, not
re-run, in this window.
