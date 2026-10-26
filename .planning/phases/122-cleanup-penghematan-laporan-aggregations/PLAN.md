# PLAN — Phase 122: Cleanup Penghematan + laporanAggregations

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26
**Window:** Xhigh orchestrator + High subagents only (never temp files, no commit)

## Goal

Replace the legacy monolithic `ERPSavingsPanel.tsx` savings rendering with pure,
unit-tested frontend aggregation helpers (`frontend/lib/laporanAggregations.ts`)
so the Laporan tab shows honest per-tier / per-period breakdowns derived from
ledger rows — no hardcoded percentages.

## Files changed (verified by reading)

- `frontend/lib/laporanAggregations.ts` (149 lines, verified): `resolveCommodityTier`,
  `groupByCommodityTier` (always 5 tiers, stable order), `groupByPeriod`
  (weekly `YYYY-Www` Monday-UTC / monthly `YYYY-MM`, `tanpa-tanggal` fallback),
  `formatJtM` (≥1Miliar `X M`, ≥1jt `X jt`, else `Rp N` id-ID), `applyLaporanFilters`
  (tier/status/date/search, all optional).
- `frontend/components/dashboard/__tests__/laporanAggregations.test.ts` (95 lines per
  merge stat 1de382e): unit coverage for the helpers above.
- `frontend/components/dashboard/ERPSavingsPanel.tsx` (verified head 60 lines):
  thinned to state wrapper (ERP summary state + global filters + aktual modal);
  rendering delegated to `LaporanHybridPanel`.
- `frontend/lib/types.ts` (+29 lines in merge 1de382e): `CommodityTierGroup`,
  `LaporanFilters`, `LaporanTierKey`, `PeriodBucket`, `ERPTripRow` shapes consumed
  by the helpers.

## Fixes tried

1. Tier mapping first cut missed `cabai`/`sayur` substring variants → added
   `key.includes('cabai')/('tomat')/('sayur')` fallback in `resolveCommodityTier`.
2. `groupByPeriod` initially keyed on local dates → moved to UTC (`getUTCFullYear/
   getUTCMonth/getUTCDate`) so Render (UTC) and dev (WIB) bucket identically.
3. `formatJtM` NaN path returned `Rp NaN` → now guards `!Number.isFinite` → `Rp 0`.
4. Filter date parse: `new Date('')` is Invalid Date → explicit
   `Number.isNaN(start/end)` guards so empty filters = no-op.

## Constraints (carried)

- Muse Spark High executors only; Supabase-only persistence for ledger truth;
  trigger-only backend-computed numbers (BPJT tariffs, Pertamina rates, 4-tier
  spoilage decay) — never accept `%` or rupiah from client.
- No e2e breakage: existing `laporan-*` specs keep passing; honest-empty states
  (`role=status`) preserved.

## Environment notes

- Local dev: SQLite `backend/data/prehub_local.db` via `local_storage`.
- Shared truth: Supabase `truck_assets` + `travels` (migration 014); Supabase-primary
  with `local_sqlite` fallback only when `SUPABASE_URL` + key missing or call fails.
- Render free plan: filesystem ephemeral (SQLite wipes on redeploy/restart);
  cold-start timeouts on first hit — seed via Supabase/Render-API paths, not local SQLite.
- Frontend Vercel → backend Render (`peta-nadi.onrender.com`); tenant default
  `company_id=pos_logistik` (`PT Samudera Logistik Sumatra`).

## Issues found (evidence, no assumptions)

- Evidence: `seed_laporan_render.py:1-40` docstring states ERP ledger was
  "SQLite-only by design" with `storage="local_sqlite"` hardcoded — superseded by
  `travel_ledger_service._storage_backend()` returning `"supabase"` when configured
  (verified `travel_ledger_service.py:168-169`).
- Evidence: `seed_laporan_demo.py:34` defaults `COMPANY_ID=pos_logistik`; usage line
  still shows stale `org-prehub-pilot` example — docs-only drift, not a bug.
- No `pilot.dispatcher@gmail.com` mapping found in `backend/app/routers/auth_router.py`
  or fleet/ledger code (grep hit only `company_id=pos_logistik` claims); tenant binding
  is via dispatcher JWT `company_id` claim, not email allowlist.
