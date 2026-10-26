# LEARNINGS — Phase 130: Fallback Backdate + CURRENT_DATE Shadowing Fix (020)

## User conditions (applies)

- Freeze-at-created_at is the clock: lookup keys on `at_date` (row
  `created_at`), never "latest row in table".
- Backfill reprice is explicit and one-time (Phase 131); 020 itself reprices
  nothing — frozen rows carry their own rate.

## Env context (verified)

- `CURRENT_DATE` seeds bake the migration-run date into the artifact, so every
  database seeded after the Oct 2026 freeze inherited the shadowing. 020 is
  date-absolute (2022-09-02), so re-running it anywhere converges.

## Concerns / issues (verified facts only)

1. **CURRENT_DATE shadowing (verified `020:3-8` + resolver `:258-263`):**
   `FP-BIOSOLAR-NASIONAL` with `effective_date=CURRENT_DATE` beat the SK freeze
   row by recency at identical price. Fixed by backdate + non-fallback
   preference. Not a rate bug — `source` was wrong, rate was right.
2. **Frozen-row safety (verified `020:12-15`):** travels rows store their own
   `fuel_effective_date / fuel_rate_used_idr` and are never recomputed unless
   `_reprice_at_date` is passed — so 020 cannot rewrite history.
3. **Excluded:** 1 km/L bug, 40k-vs-50k, toll silent-zero, manual-actuals policy,
   23502, bridge wiring, test hermeticity — not evidenced here; no claims made.
