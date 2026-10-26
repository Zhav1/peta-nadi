# LEARNINGS — Phase 131: Ledger Math + Freeze + Backfill Reprice

## User conditions (applies)

- Supabase-first; no fixed 3.5 (golongan map + override, legacy only for
  unknown golongan); ESDM SK not TomTom; freeze-at-created_at; backfill is the
  only sanctioned reprice; fuel math lives in Laporan only (Phase 132);
  null-honest economy.

## Env context (verified)

- Live Supabase creds in `.env` (names SET); hermetic SQLite has no
  `fuel_prices` rows → `PERTAMINA_FALLBACK`, remote carries 018 SK rows →
  `ESDM_SK`, same 6800 rate (`test_travels_erp.py:437-449`). Both modes must
  agree on rate; provenance branches. This is the test-hermeticity contract
  (Phase 133).

## Concerns / issues (verified facts only)

1. **Toll silent-zero (verified `:450-456` + prior LEARNINGS):** when
   `actual_recorded` is true and no actual toll segments are supplied, actual
   toll = 0, overstating toll savings. Wizard has no actual-toll control
   (prior concern, still open).
2. **Haversine vs road (verified `:415-423`):** fallback distance is
   great-circle, labelled `haversine_gazetteer` — an estimator, never a
   road-network claim. Declared distances win when > 0.
3. **Manual actuals preserved (verified backfill `:74-78` + `:443-447`):**
   recorded `actual_fuel_liters` are observations; backfill and ledger never
   overwrite them.
4. **40k-vs-50k labor (partially verified):** `DRIVER_OVERTIME_HOURLY_IDR =
   50000.0` verified (`spoilage_hedging_service.py:109`); depot fee 35000
   (`:110`); cold-chain genset tariff 45000 (`:147`). A 40000 figure was
   claimed in the window brief but no 40000 literal was found in the files read
   — excluded as unverified, not asserted.
5. **1 km/L bug (excluded):** no locus found in the files read; no claim made.
   If it refers to a degenerate `eff_adj<=0` path, the only verified guard is
   `_eff_div = eff_adj if eff_adj > 0 else 3.5` (`:430`) plus solver fallback
   (`:612`) — recorded as guards, not as bug confirmation.
6. **Degraded flags (verified `:737-772`):** `fuel_is_fallback` derives from
   source; `None` stays `None` when neither source nor flag is present.
