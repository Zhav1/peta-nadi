# PLAN — Phase 128: Real ESDM SK Fuel Rows (018)

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26

## Goal

Replace/augment the 016 fallback seeds with verified SK-sourced
`fuel_prices` rows so the ledger resolves ESDM authority instead of
`PERTAMINA_FALLBACK` — at the identical biosolar rate (6800), so math is
unchanged and only provenance flips.

## Scope files (read, not edited)

- `infra/supabase/migrations/018_fuel_sk_real.sql:1-74`
  - Header contract (`:1-18`): biosolar NASIONAL 6800 SK `218.K/MG.01/MEM.M/2022`
    effective 2022-09-03 (`https://jdih.esdm.go.id/dokumen/view?id=2299`,
    `is_fallback FALSE`); policy-hold re-confirm effective 2026-10-05 (ANTARA
    freeze reporting, price unchanged, same SK basis); dex rows formula-basis SK
    `245.K/MG.01/MEM.M/2022` (JBU has no per-liter SK); scope guard — no
    per-province dex rows (016 per-province fallback rows left for history).
  - Idempotent upsert on the 016 unique index (`:20-23` guard + `ON CONFLICT
    (fuel_type, region, effective_date) DO UPDATE`, `:32-37,52,69-74`).
  - Rows: `FP-BIOSOLAR-NASIONAL-SK218` (`:26-37`), freeze
    `FP-BIOSOLAR-NASIONAL-FREEZE20261005` (`:39-51`), four dex NASIONAL rows
    13900/14200 (2025-11-01) + 23700/25200 (2026-09-02) (`:54-68`).
- Consumers (reference only, owned by Phase 131):
  `backend/app/services/spoilage_hedging_service.py:194-277`
  (`get_fuel_rate_for_trip` prefers newest non-fallback row);
  `backend/tests/test_travels_erp.py:437-449` (rate agrees 6800 in both
  hermetic-SQLite and SK modes; provenance branches).

## Decisions

1. ESDM SK, not TomTom and not code constants, is the fuel authority.
2. Dex provenance notes cite ANTARA reports + SK 245 formula basis; exact article
   URLs were not in the verified set, so no links were invented (`018:10-13`).
3. Same-rate flip (6800 → 6800) is intentional: zero math change, provenance
   `PERTAMINA_FALLBACK` → `ESDM_SK`, `is_fallback` TRUE → FALSE.
4. History kept: 016 fallback rows stay; newest-effective-date ordering decides
   (plus code-level non-fallback preference as defence-in-depth, Phase 130).
