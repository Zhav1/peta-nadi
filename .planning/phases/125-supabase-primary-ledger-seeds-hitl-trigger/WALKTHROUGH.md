# WALKTHROUGH — Phase 125: Supabase-Primary Ledger + Seeds + HITL Trigger-Only Seed

**Date:** 2026-10-26
**Type:** Docs-only (app edits in cb0667a/1fabc14/e57b431; no edits, no commit here)

## What was documented

1. **Supabase-primary routing** — `travel_supabase.py` (322 lines) + ledger service
   routing (717 lines): Supabase first with `synced`, SQLite fallback with `pending`;
   `_storage_backend()` surfaces which store served the summary.
2. **Honest ledger math** — `_apply_ledger`: baseline/actual from BPJT toll,
   Pertamina fuel, 4-tier spoilage decay, driver overtime; split components sum
   exactly to the total; no client `%` accepted.
3. **Three seed paths** — SQLite demo (24 rows, seed 42), Supabase-direct (18 rows,
   service layer), Render-REST (dry-run default, `SEED_LIVE=1` opt-in).
4. **HITL trigger-only chain** — `seed_hitl_demo.py` (644 lines): 3 scenarios
   (REROUTE/ACCEPT, CONTINUE/REJECT, HOLD/OVERRIDE) through CPU routing → economic
   agent → hedging solve → approval dual-write → realised actuals → ERP verify →
   outcome close-out; asserts `total_trips > 0`, hedging present, `>= 3` cloud approvals.

## Fixes tried (carried from work)

- Supabase-primary to survive Render wipes; dry-run default for render seeder;
  trigger-only rewrite of HITL seed; uuid-FK incident path with DEMO-key local mirror.

## Verification carried

- Merge-scope: `tsc` 0 errors, build 7/7, pytest green (incl. `pos_logistik` RBAC/
  fleet-ingest claims), Playwright hermetic specs unaffected (DEMO- prefix,
  non-DEMO rows untouched).

## Open flags (not fixed here)

- `seed_laporan_render.py` docstring still claims SQLite-only ledger (stale post-cb0667a).
- `pilot.dispatcher@gmail.com` has no code mapping; tenant comes from JWT
  `company_id` — owner to confirm the pilot session's stamped claim.
- Travel-id PK rename (`RIT-*` → `DEMO-RIT-*`) safe only because FKs key on incident
  uuid — load-bearing, verified by reading approval path.
