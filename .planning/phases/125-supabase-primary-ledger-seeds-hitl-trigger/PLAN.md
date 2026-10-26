# PLAN — Phase 125: Supabase-Primary Ledger + Seeds + HITL Trigger-Only Seed

**Status:** COMPLETE ✅ (app edits landed pre-docs: cb0667a, 1fabc14, e57b431; docs-only here, no commit)
**Date:** 2026-10-26
**Window:** Xhigh orchestrator + High subagents only (never temp files, no commit)

## Goal

Make Supabase the primary store for the truck-asset master + travel/rit ledger
(survives Render ephemeral wipes), provide honest seed paths for local/Supabase/
Render, and land a HITL demo chain where every rupiah/%/policy is backend-computed
from trigger-only inputs.

## Files changed (verified by reading)

- `backend/app/db/travel_supabase.py` (322 lines, fully read): `is_configured()`,
  asset CRUD (`save/get/list/delete_truck_asset`), travel CRUD
  (`save/get/list/delete_travel`), `_travel_to_row`/`_row_to_travel` mappers
  (coords JSONB, hedging dict, `sync_status="synced"`).
- `backend/app/services/travel_ledger_service.py` (717 lines, fully read):
  `_supabase_enabled()`, `_persist/_fetch` routing (Supabase first, SQLite fallback
  with `pending` vs `synced`), `_apply_ledger` (baseline/actual from BPJT + Pertamina
  + 4-tier spoilage, split sums exactly), `build_erp_summary`
  (`DISPATCHER_DETAIL` vs `REGULATOR_AGGREGATE`), router-facing wrappers.
- `backend/app/routers/travels_router.py` (+11 in cb0667a): Supabase-primary reads
  via service; tenant scoping preserved.
- `backend/scripts/seed_laporan_supabase.py` (210 lines; head 50 read): writes via
  honest service layer directly into Supabase; idempotent (`>= SEED_N_TRAVELS` DEMO
  rows skip); `SEED_COMPANY_ID=pos_logistik`, `SEED_N_TRAVELS=18` default.
- `backend/scripts/seed_laporan_demo.py` (266 lines; head 40 read): SQLite path,
  `N_TRAVELS=24`, `RNG_SEED=42`, same gazetteer/commodities/trucks as render seeder.
- `backend/scripts/seed_laporan_render.py` (276 lines; head 40 read): remote REST
  seeder; **dry-run default** (GETs only unless `SEED_LIVE=1`); guest-session mint →
  `POST /fleet/trucks` → `POST /fleet/travels` → `GET /erp/summary` verify.
- `backend/scripts/seed_hitl_demo.py` (644 lines, fully read): 3 trigger-only
  scenarios (flood Tebing Tinggi, road-closure Binjai, flood Kisaran) → real CPU
  routing (`solve_shortest_path`) → real impact assessment → real hedging solve →
  router-identical approval persistence (Supabase `route_approvals` uuid FK +
  local DEMO-key mirror) → realised actuals via `update_travel` → `build_erp_summary`
  verify + cloud-approval assert (`>= 3`).

## Fixes tried

1. Render SQLite wipes killed demo rows → Supabase-primary adapter (cb0667a) +
   direct-Supabase seeder; render-API seeder kept for pre-Supabase fallback.
2. `seed_laporan_render.py` initially live-by-default → flipped to dry-run default,
   explicit `SEED_LIVE=1` opt-in (verified docstring lines 45-60).
3. HITL seed hardcoded savings in first draft → rewritten trigger-only: inputs are
   baselines + hazard descriptors only; CPU/hedging/ledger/outcome services compute
   everything (verified `seed_hitl_demo.py:1-48` contract + `_run_scenario` steps 0-9).
4. Supabase `route_approvals.incident_id` uuid-FK rejected DEMO keys → production
   `write_incident` path mints real uuid; local mirror keeps DEMO key (verified
   `_persist_approval`, `_ensure_incident`).

## Constraints (carried)

- Muse Spark High executors only; Supabase-only production truth (SQLite = dev
  fallback); trigger-only backend-computed numbers (seed scripts never send rupiah/%
  — server derives all); no e2e breakage (seed DEMO- prefix, non-DEMO rows untouched).

## Environment notes

- Local sqlite: `backend/data/prehub_local.db` (`seed_laporan_demo.py`, `RNG_SEED=42`).
- Shared Supabase: `truck_assets` + `travels` (migration 014); both local dev and
  Render read the same tables when `SUPABASE_URL` + anon/service key set.
- Render ephemeral + cold timeouts: free-plan filesystem wipes on redeploy/restart;
  cold start can time out first request — Supabase-primary survives wipes;
  `seed_laporan_render.py` dry-run probes health before live.
- Vercel→Render: frontend calls `https://peta-nadi.onrender.com`; seed scripts take
  `BACKEND_URL` env. Tenant `pos_logistik` / `PT Samudera Logistik Sumatra` is the
  dispatcher JWT `company_id` claim (verified `seed_*` defaults + `test_auth_rbac.py:458-535`,
  `test_fleet_ingest.py:280-309`).

## Issues found (evidence, no assumptions)

- Evidence: `seed_laporan_render.py` docstring still says "ERP/travel ledger is
  SQLite-only by design ... hardcodes storage=local_sqlite" — stale post-cb0667a;
  code now routes Supabase-primary. Docs drift, flagged.
- Evidence: grep across `backend/**/*.py` finds `pos_logistik` in seeds/tests but
  **no** `pilot.dispatcher@gmail.com` mapping anywhere — tenant binding is by JWT
  claim, not email. If pilot login uses that email, owner must confirm which
  `company_id` the auth layer stamps on its session (not verified in this window).
- Evidence: `seed_hitl_demo.py:549-560` renames travel ids to `DEMO-` prefix via
  direct Supabase `update({"id": ...})` — PK rewrite; safe only because FKs point
  at incident uuid, not travel id. Noted as load-bearing assumption, verified by
  reading `_persist_approval` (FK = incident uuid).
