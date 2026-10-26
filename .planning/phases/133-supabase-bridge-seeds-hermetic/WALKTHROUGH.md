# WALKTHROUGH — Phase 133: Supabase-Primary Bridge + Seeds + Hermetic Tests

Docs-only window. No app files edited, no tests run, no commits.

## What was read (file:line)

1. `backend/app/db/travel_supabase.py` — `:20` gate, `:65-135` asset path,
   `:138-166` get/list/delete, `:173-329` travel mappers (spot-read).
2. `travel_ledger_service.py:50-173` — routing, persist/fetch, storage label.
3. Git history (verified by command):
   - `git show --stat cb0667a`: `travel_supabase.py` (322, new) +
     `travels_router.py` (+11) + `travel_ledger_service.py` (+197) +
     `seed_laporan_supabase.py` (210, new); +724/-16.
   - `git log --oneline -12 -- travels/fleet/vehicles routers`: cb0667a present
     with Phase 119/102/82 neighbours.
   - `.env` check: `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` all SET (names +
     lengths only).
4. Seeds — `backfill_fuel_golongan.py` full read (Phase 131); Supabase/demo/
   render/HITL seeders verified via Phase 125 docs + head-reads referenced
   therein (not re-read here).
5. `test_travels_erp.py:431-482` (read) — provenance branch + null economy.

## Fixes tried

None in this window (docs-only). Carried fixes from history:
- Render SQLite wipes → Supabase-primary adapter (cb0667a).
- Render seeder flipped to dry-run default (explicit `SEED_LIVE=1` opt-in).
- HITL seed rewritten trigger-only (no client-sent rupiah/%).

## Test evidence

No tests executed here. Hermeticity contract cited from reads (not re-run):
hermetic SQLite asserts `PERTAMINA_FALLBACK` + `is_fallback True`, SK remotes
assert `ESDM_SK` + `False`, both assert 6800 (`:441-449`); suite neighbours
(49 + 12 + 22 + 84 + 9 re-runs) documented in `.planning/LEARNINGS.md:279-292`.
