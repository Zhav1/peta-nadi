# PLAN — Phase 135: Laporan Guest Hard-Block + Audit Guided + Demo Seed

**Status:** COMPLETE ✅ (code landed in `8f30522`; docs-only here)
**Date:** 2026-10-26
**Next phase number:** 135 (follows 134)
**Milestone:** Analitik/Laporan 4-fase — Fase B (auth/audit)

## Objective

Guests can never open the Laporan audit ledger (nav + deep-link + live-downgrade
triple lock). Authenticated empty ledger is a guided honest-empty, not a zero
table. Demo seeding is idempotent, local-SQLite only, honestly labeled.

## Scope files (from `8f30522`)

- `frontend/components/dashboard/DashboardClient.tsx` — `useAuth`
  `isAuthenticated`; `?section=reports` deep-link guard; live-downgrade safety
  net; nav `disabled`+`aria-disabled`+lock icon; in-section lock card;
  `ReportsSection onCreateMitigation → map`
- `frontend/components/dashboard/ReportsSection.tsx` — `is_demo` field,
  `isDemoApproval()` (`is_demo===true` OR `DEMO` in id/incident/notes);
  Demo/Real provenance badges; guided empty copy (`POST /approvals`,
  sandbox note); "Buat mitigasi — buka Peta" CTA
- `backend/scripts/seed_laporan_approvals.py` (new, 139 lines) — 6-row
  DEMO plan (3 ACCEPT / 1 REJECT / 2 OVERRIDE), `[DEMO]` notes, `DEMO-INC-*`
  convention, `SEED_N_APPROVALS`/`SEED_APPROVALS_RANDOM_SEED`/`SEED_ACTOR`
- `frontend/components/dashboard/LaporanFilterBar.tsx` — native
  `<select>` → Base-UI `Select` (tier/status), `role=group` granularity pills,
  `aria-pressed`, `aria-label` dates, `[color-scheme:dark]`
- `frontend/e2e/laporan-fixtures.ts` — 4-line change (fixtures support)

## Palette rule

Follows Phase 134 canonical (lock card amber/slate; no new hues).

## Auth rule (canonical)

- `GUEST` OR `!isAuthenticated` → Laporan never mounts: nav button `disabled`,
  `?section=reports` bounces to `map` + login modal + `Mode Sandbox` toast,
  live downgrade while on reports bounces the same way.
- Only `DISPATCHER` commits (`POST /approvals`); `REGULATOR` aggregate view;
  `GUEST` sandbox preview only. No RBAC POST touched.

## Backfill rule

- Demo seed: local SQLite via `local_storage.save_decision_trace` only —
  no Supabase writes, no invented economics.
- Convention: `incident_id LIKE 'DEMO-%'` AND notes `[DEMO]` prefix.
  Idempotent (skip when ≥N DEMO rows), append-only (never touches non-DEMO),
  in-place `[DEMO]` backfill for pre-existing DEMO rows.
- Cleanup: `DELETE FROM route_decision_traces WHERE incident_id LIKE 'DEMO-%'`.
