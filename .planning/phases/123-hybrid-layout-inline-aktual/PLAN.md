# PLAN — Phase 123: Hybrid Layout + Inline Aktual

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26
**Window:** Xhigh orchestrator + High subagents only (never temp files, no commit)

## Goal

Compose the Laporan tab as a hybrid panel (KPI strip → savings split → global
filter bar → charts → per-tier/per-periode tables → collapsible rincian per-rit
→ collapsible audit ledger) with inline `Aktual` capture per rit via
`PATCH /api/v1/fleet/travels/{id}` so savings recompute server-side.

## Files changed (verified by reading)

- `frontend/components/dashboard/LaporanHybridPanel.tsx` (577 lines, fully read):
  KPI strip (6 KPIs), savings-split strip (BBM/Tol/Susut/Waktu + avg + generated_at),
  `LaporanFilterBar`, export toolbar, `LaporanCharts`, tier + period tables
  (base-ui `Table`), collapsible rincian (`data-testid="audit-table"`) with
  `Aktual` + `Hitung` (hedging) actions, collapsible audit ledger
  (scope/storage/generated/tenant + business_notes).
- `frontend/components/dashboard/LaporanAktualModal.tsx` (verified head 80 lines):
  `trip/open/canEdit/disabledHint/onClose/onSuccess` props; `>0` client validation
  (`Waktu aktual harus angka > 0 jam.` / `BBM aktual harus angka > 0 liter.`);
  Esc-to-close; `canEdit=false` renders read-only with `disabledHint`.
- `frontend/components/dashboard/LaporanFilterBar.tsx` (148 lines per merge stat):
  global filter state (tier/status/date/search) + `LaporanGranularity`
  (`weekly`/`monthly`).
- `frontend/components/dashboard/LaporanCharts.tsx` (155 lines per merge stat):
  tier + period charts fed by `tierGroups`/`periodBuckets`.
- `frontend/components/dashboard/ERPSavingsPanel.tsx` + `ReportsSection.tsx`
  (721 lines read): `ReportsSection` keeps `Laporan`/`Catatan Audit Mitigasi` view
  tabs; ERP view mounts `ERPSavingsPanel` (refreshKey bump on tab return);
  Regulator scope keeps per-company aggregate table in the wrapper.
- `backend/app/routers/travels_router.py` (verified head 60 lines):
  `POST /fleet/trucks`, `POST /fleet/travels`, `PATCH` actuals path consumed by
  the modal; `_require_fleet_write` (403 unless `fleet:write`); dispatcher tenant
  default via `_effective_company_filter`.

## Fixes tried

1. Modal submitted `0`/empty and ledger zeroed savings → added `>0` guards before
   `api.fleet.updateTravel`.
2. Non-dispatcher could open modal via DOM → `canAct`/`canEdit=false` disables
   `Aktual`/`Hitung` buttons with tooltip + read-only form fallback.
3. Rincian table overwhelmed small tenants → collapsed behind `rincianOpen`
   (default open) + audit ledger collapsed by default (`ledgerOpen=false`).
4. `Hunting` solver double-clicks → `solvingTripId` disables `Hitung` while pending.

## Constraints (carried)

- Muse Spark High executors only; Supabase-only ledger truth; trigger-only
  backend-computed numbers (modal sends only time/fuel/toll segments — never rupiah).
- No e2e breakage: `rincian` and ledger toggles are plain buttons (no Portal),
  `data-testid` anchors stable for Playwright.

## Environment notes

- Local sqlite vs shared Supabase: modal PATCH hits whichever backend the frontend
  points at; on Render the write lands in Supabase-primary (survives restarts).
- Render ephemeral + cold timeouts: first PATCH after cold start can exceed
  default fetch timeout — wrapper surfaces error + `Muat Ulang`, no silent loss.
- Vercel (frontend) → Render (backend) split; tenant `pos_logistik` from
  dispatcher JWT claim (`user.company_id`), not from form input.

## Issues found (evidence, no assumptions)

- Evidence: `LaporanHybridPanel.tsx:489-497` — `Aktual` button calls
  `canAct && onOpenAktual(trip)` but has no `data-testid`; Playwright must target
  by role/text, brittle under i18n. Flagged, not changed here.
- Evidence: `LaporanHybridPanel.tsx:498-513` — `Hunting`/`Hitung` path reads
  `trip.hedging_policy` truthiness to suppress re-solve; a rit solved with policy
  `HOLD` can never re-solve from UI. Flagged for owner.
- No email→tenant mapping found: `pilot.dispatcher@gmail.com` absent from
  auth/fleet/ledger code; tenant is the JWT `company_id` claim.
