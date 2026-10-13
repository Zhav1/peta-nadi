# Plan: Phase 57 — Pilot Hardening (E2E Audit Remediation)

Source: `SYSTEM_AUDIT_AND_ROOT_CAUSE_ANALYSIS.md` re-verified against repo + pilot-lens research. Prior art: Phase 56 (integrity routing + mock purge — DO NOT REGRESS).
Decisions: `57-CONTEXT.md` (D1–D8, user-confirmed 2026-10-13).

## Guardrails (pilot, not demo)
- No mock resurrection: no hardcoded inflation/price/spoilage figures. Economic cards render payload values or honest empty states only (Phase 56 WP3/WP5 rule carries over).
- CPU solver only. Do not touch `cuopt_adapter.py`.
- No secrets in repo/UI/docs. No password cards. No open DISPATCHER self-signup in the final state.
- RBAC stays strict: guests keep 403 on writes; UX explains and saves locally instead of bypassing.
- UI: lucide SVG icons, `cursor-pointer`, glass style, 150–300ms transitions (AGENTS.md carryover).

## Push-first / parallel strategy
1. **Step 0 (contract first, ~30 min, one owner, push immediately):** land `012` migration + `types.ts` tenant fields + fleet API `?company_id` contract. Both tracks rebase onto it. This is the ONLY shared-files commit.
2. **Then 2 parallel tracks with zero file overlap** (see ownership table). Each track commits atomically per WP; pull --rebase before push.
3. Merge order: Step 0 → Track A WPs (any order) → Track B WPs (any order) → joint verification.

## Order and work packages

### STEP 0 (contract, blocks B3/A3-filter): tenant contract
- New `infra/supabase/migrations/012_organizations_profiles_tenancy.sql`: `organizations(id, name)`, `profiles(id FK auth.users, company_id FK, role)`, `handle_new_user()` trigger (reads `raw_user_meta_data.company_id/role`), RLS (users read own profile; service_role full; fleet/allowlists per D3 default), backfill seed orgs (e.g. `pos_logistik`, `bapanas`).
- `frontend/lib/types.ts`: `FleetVehicle.company_id?`, `UserProfile.company_id?`.
- Backend/frontend contract: `GET /api/v1/fleet/vehicles?company_id=` filters custom + baseline; missing claim = honest empty (dispatcher) / full corridor (regulator, macro view).
- Verify: migration applies clean on staging; `tsc --noEmit`.

### TRACK A — owner: YOU (frontend pilot UX + routing honesty)
No backend files. Friend does not touch these files while Track A is active.

#### WP-A1 (S): guest banner dismiss + auth UX honesty
- `frontend/components/dashboard/GuestEvaluationBanner.tsx`: dismiss X → `sessionStorage prehub_guest_banner_dismissed=1`; reappears next session only.
- `frontend/components/dashboard/SimulationSection.tsx`: top explainer card (macro B2G simulator vs tactical map sim) + `handleDeploy` stays local-calc; deploy errors surface role-aware message (wiring change lands in WP-A3).
- Verify: banner dismiss persists per-session; build clean.

#### WP-A2 (S): Stage-0 advance fix + honest economy (NO mock payload per D6)
- `frontend/components/demo/GuidedDemoPanel.tsx:429-432`: `stage===0 ? onStart({origin: selectedOrigin, destination: selectedDestination}) : onAdvance()`.
- `frontend/hooks/useDemoState.ts` offline fallback: do NOT add canned `inflation_forecast/ltm_episodes`. Keep Phase 56 honest empty states; ensure `getFilteredState` still gates economy to stage≥3.
- `frontend/components/sidebar/EconomicTab.tsx`: no change expected except verifying empty states render ("Proyeksi inflasi belum diterbitkan…").
- Verify: cold click Stage 0 starts demo (`crisisId` set); offline run shows honest empty economy, zero hardcoded figures (`grep 17.1 / 210000000` = 0).

#### WP-A3 (M): deploy wiring honesty (keep 403 per D1) + route live-first (per D4)
- `frontend/components/dashboard/DashboardClient.tsx:554-595` `handleDeployUnifiedActionPlan`: on 403 → toast "Mode Sandbox: tersimpan lokal — login Dispatcher untuk commit", `localStorage prehub_sandbox_approvals[]`, still apply map styling + approvals count stays local-only.
- `frontend/lib/mapboxRoutingService.ts` + `frontend/hooks/useDemoState.ts`: route resolution order live → cached-good → honest unavailable (labeled SIMULASI/OFFLINE). `fallbackHighwayRoute` interpolation must never render unlabeled as a real road route; curated Belawan–Tebing polyline (from one real Mapbox response, ~30 pts) is the only checked-in fallback, used with badge.
- Verify: guest deploy shows sandbox toast + local save, no 403 red-crash; offline route carries SIMULASI badge.

### TRACK B — owner: FRIEND (backend resilience + auth/tenancy)
No Track A files. Rebase onto STEP 0 first.

#### WP-B1 (M): news non-blocking ingestion (per D5)
- `backend/app/routers/news_router.py`: `GET /live` returns `fetch_news_from_supabase(limit=60)` immediately; ingestion via `BackgroundTasks` + module `_ingestion_in_progress` guard (avoid stampede); empty-cold response = `status: warming` + `last_updated`, never fake articles.
- `frontend/hooks/useNewsVerification.ts`: honest loading/last-updated states; keep 30s poll; no synthetic fallback articles.
- Verify: cold `GET /live` p95 < 1s with rows present; pytest with mocked ingestor (warming + live paths).

#### WP-B2 (M): pilot auth — invite-only + company at signup (per D2/D3)
- `frontend/components/auth/AuthModal.tsx` + `frontend/lib/authContext.tsx`: close open DISPATCHER self-signup (invite-only or GUEST-default + approval note); signup form gains company/org field passed as `user_metadata.company_id`; keep Magic Link tab as primary pilot login.
- Ops runbook (private, NOT in repo): Supabase Dashboard invite / `auth.admin.inviteUserByEmail` with `{role, company_id}` metadata; credentials in password manager only.
- `backend/app/auth/supabase_auth.py` + `backend/app/routers/auth_router.py`: propagate `company_id` from `app_metadata`→`UserSession`; keep `switch-role` requiring auth (401 otherwise).
- Verify: new signup lands in `profiles` with correct `company_id` via trigger; guest still 403 on writes (existing `test_auth_rbac.py` green).

#### WP-B3 (M): fleet tenancy enforcement (per D3)
- `backend/app/routers/vehicles_router.py` + `backend/app/services/telemetry_service.py`: accept `company_id` (from JWT claim, overridable by query for regulator macro view); tag `MASTER_FLEET_DEFINITIONS` baseline with pilot seed `company_id`s; custom vehicles already carry `organization_id` (`fleet_ingest_router.py:121`) — normalize to `company_id` end-to-end.
- `frontend/hooks/useFleetVehicles.ts`: filter by `user.company_id` for DISPATCHER; REGULATOR sees corridor-wide; GUEST sees baseline only (no writes).
- Migration 010 note: no RLS change needed for fleet (SQLite-local + service paths); Supabase-side fleet tables (if any) get tenant policy in 012.
- Verify: dispatcher `pos_logistik` sees only own trucks; regulator sees all; pytest `test_vehicles_telemetry` + RBAC suite green.

### STRETCH (P3, either owner, only after A+B green)
- Mapbox style-abort: debounce style reload on fast tab switches; cancel in-flight style request before re-request.
- GPU ReadPixels: remove sync canvas reads from animation loop; throttle to idle/event-driven.
- Verify: Playwright network log shows no `ERR_ABORTED` on rapid tab switch; console free of ReadPixels stall on camera change.

## Global verification (joint, before merge to main)
- `pytest backend/tests` (baseline 183) green, incl. RBAC + vehicles + news suites.
- `npx tsc --noEmit` + `npm run build` clean.
- Playwright: guest deploy → sandbox toast; Stage-0 cold start advances; dispatcher login → tenant-filtered fleet; regulator → macro view; cold news → <1s warming response.
- Honesty sweeps: `grep -rn "headline_inflation_pct\|210000000\|+17.1" backend/app frontend/lib frontend/hooks frontend/components data` = 0 (curated fallback polyline + seed org names excepted); no passwords/seeds in repo (`grep -rni "password.*=.*['\"][^'\"]" frontend/components/auth` = only placeholders).
- Migration 012 applies + rolls back clean on staging Supabase.

## Execution delegation
- STEP 0: you, solo, push first (`git add .planning/phases/57-* infra/supabase/migrations/012* frontend/lib/types.ts` → commit → push).
- TRACK A: you, WPs in any order, one atomic commit per WP.
- TRACK B: friend, rebase onto STEP 0, WPs in any order, one atomic commit per WP.
- STRETCH: whoever finishes first.
- No cross-track file edits without a heads-up in chat. Conflict on `types.ts` after STEP 0 → STEP 0 wins, rebase.

## Risks
- Trigger bug blocks signups (Supabase warns): test `handle_new_user` on staging with missing metadata → must default, never throw.
- Baseline fleet tagging changes demo visuals: seed orgs must keep corridor coverage for regulator view.
- Closing open signup may lock out current test accounts: create invites BEFORE flipping the UI.
- News background guard race: double-ingest on cold boot; `_ingestion_in_progress` + TTL cache mitigates.
