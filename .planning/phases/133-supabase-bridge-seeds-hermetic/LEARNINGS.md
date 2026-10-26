# LEARNINGS — Phase 133: Supabase-Primary Bridge + Seeds + Hermetic Tests

## User conditions (applies)

- Supabase-first end-to-end (store, seeds, ledger reads); SQLite is dev-only.
- Freeze-at-created_at + one-time backfill reprice (Phase 131) is what lets the
  bridge migrate history without rewriting it silently.
- Fuel only in Laporan; null-honest (Phases 131–132).

## Env context (verified)

- `.env`: live Supabase creds SET (names only). SQLite fallback
  `backend/data/prehub_local.db`. Vercel → Render
  (`https://peta-nadi.onrender.com`); Render free plan wipes SQLite on
  redeploy/restart and cold-starts can time out first hits — the reason the
  bridge exists. No secret values recorded.

## Concerns / issues (verified facts only)

1. **`sync_status='pending'` has no drain (verified routing `:120-133` + prior
   concern `.planning/LEARNINGS.md:223`):** SQLite-written rows stay pending
   with no `mark_as_synced` caller; a Render redeploy discards them. Carried
   open — Supabase-primary avoids it only when configured.
2. **Test hermeticity (verified `:437-449`):** hermetic SQLite and SK-backed
   Supabase agree on 6800 and branch on provenance. Do not "fix" hermetic
   runs by seeding SK rows into the test DB — the branch IS the coverage.
3. **Telemetry local-only (boundary, verified by architecture reads):**
   `vehicles_router` telemetry is stateless compute (`include_geometry=false`
   lean polling, on-demand geometry); it never writes fuel/ledger rows. No
   telemetry→Supabase fuel bridge exists; none claimed.
4. **Tenant binding by JWT claim (referenced, Phase 125):** `pos_logistik`
   via dispatcher `company_id` claim; no email allowlist found in fleet/ledger
   code. Unresolved pilot-login mapping carried, not decided here.
5. **Excluded as unverified:** 1 km/L bug locus, 40k-vs-50k history, toll-wizard
   control (open, Phase 131), CURRENT_DATE beyond Phase 130. No assumptions made.
