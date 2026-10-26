# PLAN — Phase 133: Supabase-Primary Bridge + Seeds + Hermetic Tests

**Status:** COMPLETE ✅ (app edits landed pre-docs: cb0667a et al.; this window is docs-only, no commit)
**Date:** 2026-10-26

## Goal

Wire Supabase as the primary ledger store (surviving Render ephemeral wipes),
keep honest seed paths for local/Supabase/Render, and keep tests hermetic
(SQLite) while agreeing with SK-backed remotes on rates.

## Scope files (read, not edited)

- `backend/app/db/travel_supabase.py` (322 lines; `:1-135,152-184,333-339`
  verified by read): `is_configured()` (`:20`), asset CRUD + omit-id contract
  (`:65-135`), travel mappers (`:173-329`), save with 019-default comment
  (`:333-339`).
- `backend/app/services/travel_ledger_service.py:50-173`
  (`_supabase_enabled`, `_persist/_fetch` routing with `synced` vs `pending`,
  `_storage_backend`).
- `backend/app/routers/travels_router.py` (+11 in cb0667a per git stat):
  Supabase-primary reads via service, tenant scoping preserved (commit-stat
  verified: `git show --stat cb0667a` — 4 files, +724/-16).
- Seeds (existence + contract verified by read/doc-reference):
  `backend/scripts/seed_laporan_supabase.py` (direct-Supabase, idempotent
  `>= SEED_N_TRAVELS`, `SEED_COMPANY_ID=pos_logistik`),
  `seed_laporan_demo.py` (SQLite, `N_TRAVELS=24`, `RNG_SEED=42`),
  `seed_laporan_render.py` (remote REST, dry-run default, `SEED_LIVE=1` opt-in),
  `seed_hitl_demo.py` (trigger-only CPU routing → hedging → approvals →
  realised actuals → ERP verify).
- `backend/tests/test_travels_erp.py:431-482` hermeticity contract (SQLite has
  no `fuel_prices` rows → fallback; Supabase has 018 SK rows → `ESDM_SK`;
  both assert 6800).

## Decisions

1. Supabase-primary, SQLite-fallback (never both, never mock-instead).
2. `sync_status`: Supabase writes `synced`; SQLite writes `pending` — but no
   drain worker exists (carried concern: pending rows die on Render wipe).
3. Seeds are honest: trigger-only inputs, server computes all rupiah/%.
4. Tests stay hermetic: branch on provenance, assert rate agreement (6800).

## Telemetry note (boundary)

Fleet telemetry (`vehicles_router` + `telemetry_service`,
`include_geometry=false` lean polling) is compute-local and stateless — it is
not the ledger and never persists fuel rows. The "bridge" in this phase is the
ledger persistence bridge (Supabase-primary), not a telemetry persistence
bridge; no telemetry-to-Supabase fuel write exists or is claimed.
