# LEARNINGS — Phase 132: Frontend Laporan Fuel Surface

## User conditions (applies)

- Fuel only in Laporan: no fuel figures on map/popover/hedging surfaces.
- No fixed 3.5 in UI; null asset efficiency → golongan map.
- Null-honest: missing economy renders absent, never 0 or a fake average.

## Env context (verified)

- Vercel frontend → Render backend (`peta-nadi.onrender.com`); ERP numbers are
  backend-computed (trigger-only inputs), so the UI never invents rupiah.

## Concerns / issues (verified facts only)

1. **Null-honest economy (verified `:734-736` + test `:464-482`):** economy
   requires `actual_recorded AND distance>0 AND fuel>0` with non-null actual
   fuel; otherwise `None`. L/100km is the strict inverse or `None`.
2. **Provenance inspectability (verified `:767-776`):** dispatcher rows carry
   rate, SK id/number, source, fallback flag, efficiency used/source,
   load factor, reefer lph — so a user can distinguish `ESDM_SK` 6800 from
   `PERTAMINA_FALLBACK` 6800.
3. **Refresh wiring (verified in Phase 83-01 docs, referenced):** prior concern
   "ERP panel does not refresh after onboarding" closed via `erpRefreshKey`.
4. **Excluded:** 1 km/L bug rendering impact, 40k-vs-50k display text,
   telemetry bridge behavior — not evidenced in the files read here; no claims
   made. `tripCostCalculator.ts` line cites are grep-verified only.
