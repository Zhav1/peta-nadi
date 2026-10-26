# LEARNINGS — Phase 128: Real ESDM SK Fuel Rows (018)

## User conditions (applies)

- ESDM SK is the fuel authority, never TomTom. TomTom stays traffic-only.
- Same-rate flip is provenance-only (6800 → 6800); no savings figure moves.
- Provenance notes over invented links: dex rows cite reports + SK 245 formula
  basis because exact article URLs were not in the verified set (`018:10-13`).

## Env context (verified)

- `.env` Supabase keys SET (names only); SK rows live in shared Supabase
  `fuel_prices`, so every environment (local dev + Render) resolves the same
  authority once migrated. Hermetic SQLite (no `fuel_prices` rows) keeps
  `PERTAMINA_FALLBACK` — the test at `test_travels_erp.py:437-449` branches on
  exactly this.

## Concerns / issues (verified facts only)

1. **3.5/6800 duplicates:** 6800 now exists in three provenances (code constant,
   016 fallback seed, 018 SK rows) at the same value. Not a math bug; the fix is
   provenance resolution (`fuel_sk_id/sk_number/source`), owned by Phase 131.
2. **Dex per-province gap (verified `018:14-15`):** 016 per-province dex rows
   remain fallback history; NASIONAL formula rows are the SK authority. Any
   region-specific dex claim without a new SK row would be fabrication — none made.
3. **Ordering hazard preview (verified, fixed in Phase 130):** newest-date-wins
   ordering let the 016 `CURRENT_DATE` artifact shadow the SK freeze; 018 alone
   did not fix ordering. Recorded here, resolved in Phase 130.
4. **Excluded:** 1 km/L bug, 40k-vs-50k, toll silent-zero, 23502, bridge wiring —
   not evidenced by this migration; no claims made.
