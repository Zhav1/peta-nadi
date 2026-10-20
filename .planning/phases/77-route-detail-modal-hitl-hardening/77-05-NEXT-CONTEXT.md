# Phase 77 — Next-Context Handoff (Facts Only)

Source window: Phase 77 route-detail-modal HITL hardening.
Evidence: `.planning/phases/77-route-detail-modal-hitl-hardening/77-01-PLAN.md`, `77-02-PLAN.md`, `git log --oneline -15`, `infra/supabase/migrations/013_hil_hardening.sql`, live tree reads 2026-10-20.

## 1. Goal Recap

- Introduce full 5-section `RouteDetailModal` rendering only real `RouteRecommendation`/`CrisisState` fields, zero mocked numbers (`77-01-PLAN.md:41-45`).
- Unify every route-select surface (sidebar card, map polyline popover `Pilih Koridor Ini`, map ETA-badge) through single `DashboardClient.handleSelectRoute` that opens modal + creates HITL pending (`77-01-PLAN.md:36-38`).
- Enforce role-gated commits: Dispatcher full APPROVE/REJECT/HOLD + TMS ping on 2xx only; Regulator HOLD-only + export; Guest sandbox-preview only with zero POST (`77-02-PLAN.md:47-51`).
- Fix optimistic `DISETUJUI`-on-403 bypass: 403 never paints approved/committed state, never calls `onCommitOperationalRoute`, never fires TMS ping (`77-02-PLAN.md:76`).
- Converge backend payload/schema gaps via migration 013 + prove with Playwright `phase57-pilot-hardening.spec.ts` (5 mocked-network cases) (`77-02-PLAN.md:90-94`, `013_hil_hardening.sql:1-13`).

## 2. Decisions Locked (7)

1. **5-section order locked** — (1) Dasar Risiko, (2) Dampak + Uncertainty, (3) Manfaat vs Konsekuensi, (4) Keterbatasan Data, (5) Verifikasi Operator Checklist. Missing hedging/news fields render `Data tidak tersedia`, never fabricated (`77-01-PLAN.md:69`).
2. **Every select opens modal, no silent corridor switch** — sidebar `onSelectRoute(idx)` (`MitigationTab.tsx:1053`), map popover delegate (`CrisisMap.tsx:2311-2315`), ETA-badge delegate (`CrisisMap.tsx:886-891`) all converge on `DashboardClient.handleSelectRoute` (`DashboardClient.tsx:1533-1537,2335,2579`).
3. **Select-side HITL pending creation (non-guest)** — `handleSelectRoute` posts `api.approvals.create({incident_id, route_id:String(idx), route_name, origin, destination})` then `refreshHitlCount()`; failure toasts but never blocks modal open (`DashboardClient.tsx:1554-1576`).
4. **Guest sandbox = zero mutation** — `role==='GUEST'` early-return in `handleSelectRoute` (`DashboardClient.tsx:1547-1552`), in `handleModalAction` (`DashboardClient.tsx:1652-1658`), in `MitigationTab.handleApprove` (`MitigationTab.tsx:702-710`); watermark `SANDBOX PREVIEW` (`RouteDetailModal.tsx:156`); banner copy states no POST/no ping (`GuestEvaluationBanner.tsx:52`).
5. **Dispatcher-only commit + ping on 2xx** — `MitigationTab.handleApprove` success path sets `approvedRouteId` + `onCommitOperationalRoute` + toast only after `api.approvals.create` 2xx (`MitigationTab.tsx:720-754`); TMS `simulatePing` gated `role==='DISPATCHER'` (`DashboardClient.tsx:1602-1618`); HITL drawer requires `approvals:write` (`news_router.py:499-508`, `approvals.py:38-45`).
6. **Regulator HOLD-only, no `approvals:write`** — `ROLE_REGULATOR` has heatmap/prices/reports/audit/scenarios only, never `approvals:write` (`supabase_auth.py:58-65`); frontend blocks `REGULATOR && tacticalAction!=='HOLD'` (`MitigationTab.tsx:711-716`, `DashboardClient.tsx:1659-1665`, `HitlDecisionDrawer.tsx:124-127`).
7. **403 = sandbox, queue retained** — 403 branch sets `sandboxNote` only, no `setApprovedRouteId`, no commit, no ping (`MitigationTab.tsx:761-767`, `DashboardClient.tsx:1684-1688`); drawer keeps item in queue on 403 (`HitlDecisionDrawer.tsx:146-154`); `approved_by` precedence is `current_user.id` over client alias (`news_router.py:518`).

## 3. What Changed Per File

Frontend (`db2577a feat(77-02): 779 insertions, 53 deletions`):
- `frontend/components/sidebar/RouteDetailModal.tsx` — NEW 464 lines. Controlled modal props `route, crisis, open, onClose, role, mode, onAction, isActing` (`types.ts:147-161`); 4-checkbox gate; `SANDBOX PREVIEW` ribbon when `mode==='sandbox'` (`RouteDetailModal.tsx:156`).
- `frontend/lib/types.ts` — +28 lines. Added `RouteDetailModalProps` (`types.ts:147-161`) + `HitlPendingCreatePayload {incident_id, route_id, route_name?, origin?, destination?}` (`types.ts:163-169`).
- `frontend/components/dashboard/DashboardClient.tsx` — +161 lines. Added `handleSelectRoute(idx, source)` (`DashboardClient.tsx:1533-1577`); `handleCommitOperationalRoute` Dispatcher ping gate (`DashboardClient.tsx:1579-1636`); `handleModalAction` role branches (`DashboardClient.tsx:1640-1698`); wired `onSelectRoute={(idx)=>handleSelectRoute(idx,'map-popover'|'sidebar')}` (`DashboardClient.tsx:2335,2579`).
- `frontend/components/dashboard/HitlDecisionDrawer.tsx` — +56 lines. `handleDecision` role gates (`HitlDecisionDrawer.tsx:119-127`); 403 retains queue (`HitlDecisionDrawer.tsx:146-154`).
- `frontend/components/dashboard/GuestEvaluationBanner.tsx` — copy updated to explicit sandbox contract (`GuestEvaluationBanner.tsx:52`); `sessionStorage` dismiss, `z-[45] bottom-24` unchanged (`GuestEvaluationBanner.tsx:7,42`).
- `frontend/components/sidebar/MitigationTab.tsx` — +116 lines. Role branches (`MitigationTab.tsx:701-716`); 403-safe catch (`MitigationTab.tsx:755-775`); `sandboxNote` banner (`MitigationTab.tsx:782-787`); card selects call `onSelectRoute(idx)` (`MitigationTab.tsx:997-998,1019-1027,1053`).
- `frontend/components/map/CrisisMap.tsx` — +5 lines. ETA-badge delegates (`CrisisMap.tsx:886-891`); popover `Pilih Koridor Ini` delegates + closes popover (`CrisisMap.tsx:2309-2316`); `Koridor Utama Aktif` reads `activeRouteIdx` prop only (`CrisisMap.tsx:2303-2307`).

Backend (`621e346 feat(77-01-backend): 502 insertions, 25 deletions`):
- `backend/app/schemas/routing_proof_schemas.py` — NEW 76 lines. `RiskEvidenceItem, DasarRisiko, DampakUncertainty, KeterbatasanData, RouteProof`.
- `backend/app/adapters/cpu_routing_adapter.py` — +208 lines. `enrich_route_with_proof + solve_shortest_path(congestion_segments, news_context, include_proof, is_fallback)`; proof at all emission sites; `risk_score` stays float.
- `agents/nodes/route_optimization.py` — +39 lines. Same proof helper post-loop.
- `backend/app/routers/routing_router.py` — +135 lines. `include_proof` field; 8s-timeout weather/TomTom/news fetch with `seed_fallback`; `get_optional_user` on reads.
- `backend/app/routers/news_router.py` — +41 lines. `get_current_user` on `hitl-pending` (all roles read) + `hitl-action` (`news_router.py:402,483`); `approvals:write`-only gate 403 GUEST/REGULATOR (`news_router.py:498-508`); `approved_by` precedence `current_user` (`news_router.py:518`); action normalize APPROVE→ACCEPT / REJECT→DISMISS / else HOLD (`news_router.py:516`).
- `backend/app/routers/approvals.py` — +23 lines. `approvals:write` gate 403 with role message (`approvals.py:36-45`); operator identity from `current_user.id + committed_by_role`, no anonymous fallback.
- `backend/app/schemas/decision_schemas.py` — +5 lines. Operator identity fields.

Supabase (`71ade5e`):
- `infra/supabase/migrations/013_hil_hardening.sql` — NEW 66 lines. `route_approvals.route_id TEXT NULLABLE + index` (`013:40-44`); `incidents.incident_id TEXT + backfill id::text + unique + index` (`013:47-66`); RLS untouched; deliberately NOT added: `committed_by_role`, `dasar_risiko/dampak_uncertainty`, `route_name/origin/destination` (`013:22-32`).

Tests/scripts (`31cd17a`):
- `scripts/audit_backend_apis.py` — +215 lines. `expect_status` asserts, retry-once wakeup, authed RBAC matrix 7 checks; live vs localhost:8000 all 11 Wave-3 rows PASS; total 36/39 (3 fails pre-existing stale: 2 retired incident 404, fleet/register anon-now-403).
- `scripts/probe_parity.sh` — +30 lines. anon 401 guards, guest-session mint legs (me 200, switch-role 200, approvals GUEST 403 / DISP 201, hitl-pending 200, hitl bad-UUID 422, hitl GUEST 403); cold-start warmup kept.

Planning (`a47b35e feat(77): 263 insertions`):
- `.planning/phases/77-route-detail-modal-hitl-hardening/77-01-PLAN.md` — 128 lines.
- `.planning/phases/77-route-detail-modal-hitl-hardening/77-02-PLAN.md` — 135 lines.

## 4. Fixes Tried + Outcome

- **Removed catch-all optimistic approval** in `MitigationTab.handleApprove` (`MitigationTab.tsx:755-775`). Before: catch set approved + commit + success toast on any error. After: 403 → `sandboxNote` only; non-403 → error toast, unapproved. Outcome: 403 no longer paints `DISETUJUI`.
- **Added frontend role branches** — Guest early-return zero POST (`DashboardClient.tsx:1547`, `MitigationTab.tsx:702`); Regulator HOLD-only (`DashboardClient.tsx:1659`, `MitigationTab.tsx:711`, `HitlDecisionDrawer.tsx:124`). Outcome: client no longer crosses mutation boundary for unauthorized roles.
- **Gated TMS ping** to `role==='DISPATCHER'` + inside try/catch with warning-only failure (`DashboardClient.tsx:1602-1618`). Outcome: guest/regulator never ping; ping failure does not roll back approval.
- **Hardened backend RBAC** — `news_router hitl-action` + `approvals.create` require `approvals:write` (`news_router.py:499`, `approvals.py:38`); `hitl-pending` kept readable via `get_current_user`; `switch-role` kept behind `get_current_user` (never `get_optional_user`) (`auth_router.py:119-125`); `ROLE_PERMISSIONS` sandbox contract pinned (`supabase_auth.py:34-49`). Outcome: server is authoritative; client role is UX-only.
- **Fixed payload/schema mismatch** via 013 — added missing `route_approvals.route_id` and `incidents.incident_id` (backfilled, unique, indexed). Outcome: PostgREST inserts from `approvals.py` + `unified_news_ingestor` no longer fail; RLS unchanged.
- **Verified Wave-3 RBAC matrix** — `probe_parity.sh` + `audit_backend_apis.py` mocked + live runs. Outcome: 11/11 Wave-3 rows PASS; 3 residual fails are pre-existing stale entries, not Phase-77 regressions.

## 5. Constraints (Next Window Must Obey)

- Use subagents only, no direct tool call (orchestrator dispatches workers).
- DeepSeek / GLM subagents for execution (cost control; keep Sonnet for review only).
- `git add .` + `git commit -m "<type>(77): <subject>"` per completed unit; push to `origin main` at handoff.
- Envs span Vercel + Render + Supabase — verify all three: Vercel frontend env, Render backend env (`backend/.env.example`), Supabase project env/migrations applied.
- No new packages without Package Legitimacy Audit + blocking human checkpoint for `[ASSUMED]/[SUS]` (per `77-01-PLAN.md:T-77-SC`, `77-02-PLAN.md:T-77-SC`).

## 6. Concerns (Open Risks, Grounded)

- **Auth forgery** — client `role` from `useAuth` server-verified session only; `AuthModal isSandboxAccount` gate is UX-only (`auth_router.py:124-125`); server `get_current_user` + `approvals:write` gate is authoritative (`approvals.py:38`, `news_router.py:499`). Any new endpoint must not trust client-supplied role.
- **Guest confusion** — GuestEvaluationBanner is `sessionStorage`-dismissed, `pointer-events-none` wrapper (`GuestEvaluationBanner.tsx:7-12,42`); modal watermark is CSS-only (`RouteDetailModal.tsx:156`). Copy must keep stating local-only / no POST / no ping (`GuestEvaluationBanner.tsx:52`, `DashboardClient.tsx:1549`).
- **Cold-start** — `routing_router` uses 8s-timeout fetch with `seed_fallback`; `probe_parity.sh` keeps warmup; `audit_backend_apis.py` has retry-once wakeup. Render cold-start can still inflate first-leg latency; keep mocked-network Playwright under 60s.
- **RLS gap** — 010 grants `route_approvals FOR ALL TO authenticated` (anon excluded, no public SELECT) + `service_role` full access; 013 explicitly untouched RLS (`013_hil_hardening.sql:34-36`). Any tightening (e.g. `service_role` restriction) is still open — see §9.
- **HOLD semantics** — HOLD is HITL advisory flag, not `approvals:write` commit (`supabase_auth.py:42-45`); normalized in `news_router.py:516` (`sync_status=action_committed` for HOLD vs `synced` for ACCEPT/DISMISS, `news_router.py:525`); Regulator HOLD path has no SLA defined — see §9.

## 7. Issues To Avoid Repeating (file:line)

- `frontend/components/sidebar/MitigationTab.tsx:730-745` — do NOT call `setApprovedRouteId` / `onCommitOperationalRoute` outside 2xx success. `MitigationTab.tsx:756-772` is the only allowed error handling (403→sandbox, else error toast).
- `frontend/components/dashboard/DashboardClient.tsx:1602` — do NOT call `api.fleet.simulatePing` unless `role==='DISPATCHER'` and post-2xx. Ping failure must only `console.debug`, never roll back (`DashboardClient.tsx:1615-1617`).
- `frontend/components/dashboard/DashboardClient.tsx:1546-1553` — do NOT insert any `api.approvals.create` / `api.news.hitlAction` before the Guest early-return.
- `frontend/components/dashboard/HitlDecisionDrawer.tsx:119-127` — do NOT call `api.news.hitlAction` for GUEST or for REGULATOR non-HOLD. Error path must retain queue item (`HitlDecisionDrawer.tsx:146-154`).
- `backend/app/routers/news_router.py:499` — do NOT downgrade `hitl-action` to `get_optional_user`; must stay `get_current_user` + `approvals:write` check.
- `backend/app/routers/auth_router.py:119-125` — do NOT move `switch-role` off `get_current_user`.
- `backend/app/auth/supabase_auth.py:34-70` — do NOT add `approvals:write`/`fleet:write`/`routes:plan`/`manifests:upload` to GUEST or REGULATOR; pinned by `test_auth_rbac` (`evaluation_router.py:192`).
- `frontend/components/map/CrisisMap.tsx:886-891` — do NOT add `setData` / active-route styling mutation on ETA-badge click; delegate only via `onSelectRouteRef.current(rIdx)`.
- `frontend/components/map/CrisisMap.tsx:2311-2315` — do NOT bypass parent modal; popover button must delegate then `setSelectedRoutePopover(null)`.
- `infra/supabase/migrations/013_hil_hardening.sql:40-41,47-48` — do NOT write `route_approvals.route_id` / query `incidents.incident_id` on projects without 013 applied; inserts will fail on pre-013 schemas (000_init has PK `id` only).
- `frontend/components/sidebar/RouteDetailModal.tsx` checklist gate — do NOT enable APPROVE/REJECT/HOLD commit buttons before all 4 verifikasi-operator checkboxes are checked (Guest preview never enables commit).

## 8. Verification Checklist (Next Window)

- [ ] `npm --prefix frontend exec tsc --noEmit -p tsconfig.json` — zero errors (both plans).
- [ ] `npx playwright test tests/e2e/phase57-pilot-hardening.spec.ts --reporter=line` — 5/5 pass: (1) select opens modal 5 sections + checklist gate, (2) one POST with incident_id+route_id + badge increment, (3) guest watermark + zero `/approvals` + zero `/fleet/telemetry/*`, (4) 403 no `DISETUJUI` + queue retained, (5) regulator APPROVE locked + HOLD enabled.
- [ ] `pytest backend/tests -q` (esp. `test_auth_rbac.py::test_create_and_decode_guest_token`, `::test_rbac_approval_rejected_for_regulator`) — RBAC invariants hold.
- [ ] `bash scripts/probe_parity.sh` against `localhost:8000` and live Render — anon 401 guards + Wave-3 RBAC matrix 11 rows PASS.
- [ ] `python scripts/audit_backend_apis.py` — confirm 36/39 baseline; only 3 known stale fails (2 retired incident 404, fleet/register anon-now-403).
- [ ] `curl` Render: `GET /api/v1/news/hitl-pending` (authed 200), `POST /api/v1/approvals` as GUEST → 403, as DISPATCHER → 201; `POST /api/v1/news/hitl-action` bad-UUID → 422.
- [ ] Vercel click test (manual): sidebar RouteCard, map polyline `Pilih Koridor Ini`, map ETA badge — each opens same `RouteDetailModal` with correct route data; non-guest increments HITL REVIEW badge (`TopNavTelemetry.tsx:400-414`) within one 15s poll; Guest shows watermark + banner, network tab shows zero mutation POSTs.

## 9. Open Items (Carried, No Resolution In This Window)

- **ETA-badge UX** — badge delegates correctly (`CrisisMap.tsx:887`) but badge density/overlap at high zoom and mobile tap-target size not tuned.
- **HOLD SLA** — Regulator/Dispatcher HOLD advisory flag persists (`sync_status=action_committed`) with no expiry/escalation SLA or re-review timer defined.
- **WhatsApp scope** — outbound notification scope for APPROVE/HOLD decisions (e.g. WA gateway to fleet/company) not scoped; no endpoint wired in Phase 77.
- **RLS `service_role` restriction** — 013 left RLS untouched (authenticated FOR ALL + service_role full); least-privilege tightening of `service_role` vs authenticated writes not designed.
- **`episodes`/`risks` cleanup** — stale/episodic tables referenced in audit fails (2 retired incident endpoints 404); `episodes`/`risks` retention/cleanup migration not written.
