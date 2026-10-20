<!-- generated-by: gsd-doc-writer -->
# Phase 77: Route Detail Modal + HITL Hardening — Technical Walkthrough

**Purpose:** the evidence-grade implementation record for Phase 77 Waves 1–3 (backend proof enrichment, frontend 5-section modal with role-gated commits, verification matrix + schema convergence). Every claim below was verified by direct file reads of the working tree and `git show --stat` on the Wave commits. Covers `77-01-PLAN.md` (Wave 1) and `77-02-PLAN.md` (Wave 2) plus the Wave 3 verification commits.

**Evidence sources:**
- `git show --stat` on `621e346` (Wave 1 backend), `db2577a` (Wave 2 frontend), `0f0812d` (e2e +402), `31cd17a` (probe + audit matrix), `71ade5e` (013 migration).
- Direct reads: `backend/app/schemas/routing_proof_schemas.py`, `backend/app/adapters/cpu_routing_adapter.py`, `agents/nodes/route_optimization.py`, `backend/app/routers/routing_router.py`, `backend/app/routers/news_router.py`, `backend/app/routers/approvals.py`, `backend/app/schemas/decision_schemas.py`, `frontend/components/sidebar/RouteDetailModal.tsx`, `frontend/components/dashboard/DashboardClient.tsx`, `frontend/components/map/CrisisMap.tsx`, `frontend/components/sidebar/MitigationTab.tsx`, `frontend/components/dashboard/HitlDecisionDrawer.tsx`, `frontend/components/dashboard/GuestEvaluationBanner.tsx`, `frontend/e2e/phase57-pilot-hardening.spec.ts` (744 lines), `scripts/probe_parity.sh`, `scripts/audit_backend_apis.py`, `infra/supabase/migrations/013_hil_hardening.sql`, `backend/app/auth/supabase_auth.py`, `backend/app/config.py`.

---

## Wave 1 — Backend: proof schemas + proof-enriched routing + HITL RBAC (`621e346`)

### 1. `backend/app/schemas/routing_proof_schemas.py` (new, 76 lines)

New Pydantic triple backing the modal so it renders real data with zero mocked numbers:

| Class | Fields |
|---|---|
| `RiskEvidenceItem` | `source` (hazard/tomtom/weather/news/hedging/compliance/router), `label`, `value`, `confidence` 0.0–1.0, `detail` |
| `DasarRisiko` | `safety_tag`, `safety_status` (CLEAR/SAFE_DETOUR/COMPROMISED/HOLD_DELAY), `is_compromised`, `passability` (BLOCKED/RESTRICTED/CAUTION/CLEAR), `hazard_type`, `hazard_radius_km`, `evidence[]` |
| `DampakUncertainty` | `time_delta_minutes?`, `congestion_levels[]`, `net_savings_idr?`, `spoilage_loss_idr?` (None renders `Data tidak tersedia`), `eta_confidence`, `evidence[]` |
| `KeterbatasanData` | `is_fallback`, `compliance_status?`, `hedging_available`, `news_links_alive/total`, `missing_fields[]`, `warnings[]`, `evidence[]` |
| `RouteProof` | `dasar_risiko` + `dampak_uncertainty` + `keterbatasan_data` attached as `route['proof']` |

### 2. `backend/app/adapters/cpu_routing_adapter.py` (+208)

- `enrich_route_with_proof(route, congestion_segments, news_context, is_fallback)` (line 33): builds the triple; fallback sets `eta_confidence 0.6` (vs 0.8 live), evidence `detail="seed_fallback"` (line 155), `warnings=["speed_source=seed_fallback: ETA memakai kecepatan asumsi"]` (line 186).
- `solve_shortest_path(..., include_proof=True, is_fallback=False)` (line 551): `if include_proof:` (line 779) attaches `r["proof"] = enrich_route_with_proof(...)` at every emission site (line 800). `risk_score` stays `float` (no string coercion).

### 3. `agents/nodes/route_optimization.py` (+39)

- Post-loop import (line 471) `from app.adapters.cpu_routing_adapter import enrich_route_with_proof` with `_proof = enrich_route_with_proof(...)` (line 492, `is_fallback=False` line 497). Same helper as CPU adapter — single proof implementation shared by agent and router paths.

### 4. `backend/app/routers/routing_router.py` (+135)

- `_fetch_proof_context()` (line 23): weather + TomTom + news in parallel, each `asyncio.wait_for(..., timeout=8.0)` (`PROOF_FETCH_TIMEOUT_S`, line 20). Any failure degrades to `seed_fallback` instead of failing the call (lines 26, 46, 94 `speed_source: tomtom_live | seed_fallback`).
- TomTom flow normalized to `congestion_segments[]` with `level heavy/moderate/low` from `1 - currentSpeed/freeFlowSpeed` (lines 64–81).
- `RoutingRequestPayload.include_proof: bool = True` (line 125); both `POST /routing/optimize` (line 143–164) and the second routing endpoint (lines 184–200) thread `congestion_segments`, `news_context`, `include_proof` through.
- Reads use `get_optional_user` (line 14, line 100): guest-safe telemetry-only attachment.

### 5. `backend/app/routers/news_router.py` (+41)

- `GET /api/v1/news/hitl-pending` (line 401): `Depends(get_current_user)` — any authenticated role may read; formats `route_approvals` rows with `.get()` fallbacks for `route_name/origin/destination` (lines 445–447, read-only degrade, never fails on missing columns).
- `POST /api/v1/news/hitl-action` (line 481): RBAC `if "approvals:write" not in current_user.permissions: 403` (lines 499–508, message names current role + required `approvals:write`). UUID guard 422 before RBAC (lines 491–496). `approved_by` precedence: `op_id = current_user.id or req.approved_by or req.operator_id` (line 518) — server session wins; `committed_by_role = current_user.role` (line 519) returned in response.
- `dispatcher_lead` literal removed; notes embed `committed_by {op} ({role})` (line 526).

### 6. `backend/app/routers/approvals.py` (+23) + `backend/app/schemas/decision_schemas.py` (+5)

- `POST /approvals` (line 28): `get_optional_user` + `approvals:write` gate → 403 for GUEST/REGULATOR (lines 38–47, same FORBIDDEN shape as news_router).
- Identity: `op_id = payload.operator_id or payload.approved_by or current_user.id` (line 51), `committed_by_role = current_user.role` (line 52); `notes` defaults to `committed_by {op} ({role})` (line 64); local SQLite mirror keeps structured `committed_by_role` without a Supabase column migration (lines 62–68).
- `db_payload` always sends `route_id` (line 56, default `"0"` from schema line 26). `decision_schemas.py` validator (lines 44–46) documents identity is resolved server-side, never defaults to `"anonymous"` in the schema.
- Closed-loop fleet reroute + outcome registration unchanged (lines 70–120).

---

## Wave 2 — Frontend: 5-section modal + unified select + role-gated commits (`db2577a`)

### 7. `frontend/components/sidebar/RouteDetailModal.tsx` (new, 464 lines)

Controlled modal (`route, crisis, open, onClose, role, mode, onAction, isActing, corridorIsFallback`). Sections in locked order:

1. **Dasar Risiko** — `safety_status`, `safety_tag`, `is_compromised` TERDAMPAK/BEBAS, `impact_profile.passability`, hazard label + `radius_km`, optional `dasar_risiko` text.
2. **Dampak + Uncertainty** — `tradeoff_analysis.time_delta_minutes` (formatted, None → `Data tidak tersedia`), `congestion_segments[].level`, `hedging.net_savings_idr / spoilage_loss_idr` via `formatIDR` (None → `Data tidak tersedia`).
3. **Manfaat vs Konsekuensi** — `tradeoff_analysis.pros[]` vs `cons[]` side-by-side + `additional_cost_idr` + `cost_breakdown_items[]`; honest empty state when absent.
4. **Keterbatasan Data** — `compliance.status/summary`, hedging availability, `verified_news_citations` alive/dead count, `corridorIsFallback` CACHE/FALLBACK vs Live, `keterbatasan_data[]`.
5. **Verifikasi Operator Checklist** — 4 checkboxes (zona merah visual, tradeoff dibaca, moda/hub dikonfirmasi, catatan untuk HOLD/OVERRIDE); `canCommit = !isSandbox && allChecked && notesOk && !isActing`. Sandbox branch replaces all commit buttons with watermarked local-only notice (`SANDBOX PREVIEW` ribbon `data-testid="sandbox-watermark"`, `Pratinjau lokal — tanpa POST server`); REGULATOR sees `SETUJI/TOLAK [Khusus Dispatcher]` disabled with `Lock` icon, HOLD enabled.

### 8. `frontend/components/dashboard/DashboardClient.tsx` (+161)

- `handleSelectRoute(idx, source)` (line 1533): single entry point — `setActiveRouteIdx` + `setRouteModalIdx` (modal open), GUEST branch returns after sandbox toast with **zero POST** (lines 1546–1553), non-guest `api.approvals.create({incident_id, route_id: String(idx), recommended_route, action ACCEPT, tactical_action REROUTE, operator_id, route_name, origin, destination})` in try/catch (lines 1559–1569) + `refreshHitlCount()`; failure toasts but never blocks the modal (lines 1571–1576).
- `handleCommitOperationalRoute` (line 1579): TMS `api.fleet.simulatePing` only when `role === 'DISPATCHER'` (line 1602); ping failure degrades to `console.debug` without rolling back approval (lines 1615–1617).
- `handleModalAction` (line 1640): role-branched — GUEST sandbox-only; REGULATOR HOLD-only; dispatcher full commit path via `onCommitOperationalRoute`.
- Wiring: `onSelectRoute={(idx) => void handleSelectRoute(idx, 'map-popover')}` (line 2335) and `'sidebar'` (line 2579) converge both surfaces on the same handler.

### 9. `frontend/components/map/CrisisMap.tsx` (+5)

- ETA-badge layer click (lines 886–892): delegates to `onSelectRouteRef.current(rIdx)` with comment `no direct active-route styling mutation happens on badge click`.
- Popover `Pilih Koridor Ini` (lines 2311–2315): delegates to `onSelectRouteRef.current` then closes popover; `Koridor Utama Aktif` indicator (lines 2303–2307) reads `activeRouteIdx` prop only. `Sembunyikan` path (lines 2324–2339) stays independent.

### 10. `frontend/components/sidebar/MitigationTab.tsx` (+116)

- Role branches (lines 701–716): GUEST sets `sandboxNote` local-only + `onApproveSuccess` sandbox toast, returns before any `api.approvals.create`; REGULATOR non-HOLD returns with `[Khusus Dispatcher]` notice.
- Success (lines 719–754): `setApprovedRouteId` + `setLatestApproval` + `onCommitOperationalRoute` + labeled toast — dispatcher 2xx only.
- 403-safe catch (lines 755–772): `msg.includes('403')` → sandbox note `tersimpan lokal, tidak dikirim ke armada (403 memerlukan akun Dispatcher)`, **no `setApprovedRouteId`, no `onCommitOperationalRoute`, no TMS ping**; non-403 errors toast honest failure and leave the card unapproved. `sandboxNote` banner (lines 782–787) renders local-only state.

### 11. `frontend/components/dashboard/HitlDecisionDrawer.tsx` (+56)

- `role = useAuth()` (line 80); `handleDecision` (line 117): GUEST → `Pratinjau sandbox — masuk sebagai Dispatcher untuk mengeksekusi` (lines 120–123, no `api.news.hitlAction` call); REGULATOR non-HOLD → `[Khusus Dispatcher]` (lines 124–127); 403 catch retains the queue item and shows `Mode Sandbox (403): antrean dipertahankan` (lines 146–151).

### 12. `frontend/components/dashboard/GuestEvaluationBanner.tsx` (+2) + `frontend/lib/types.ts` (+28)

- Banner copy (lines 48–53): `Mode Evaluasi Tamu: pilihan rute membuka pratinjau berwatermark lokal; tidak ada POST /approvals dan tidak ada ping TMS. Masuk untuk commit.` Dismiss via `sessionStorage` (lines 19–25), `guest-evaluation-banner` testid (line 41).
- `types.ts`: `RouteDetailModalProps` (route/crisis/open/onClose/role/mode/onAction/isActing/corridorIsFallback) + `HitlPendingCreatePayload {incident_id, route_id, route_name, origin, destination}` reusing `RouteRecommendation`/`ApprovalPayload` shapes; modal prop types consumed by `RouteDetailModal.tsx` lines 13–17.

---

## Wave 3 — Verification matrix + schema convergence

### 13. `frontend/e2e/phase57-pilot-hardening.spec.ts` (+402, now 744 lines, `0f0812d`)

Wave 3 RBAC mocked cases appended to the Phase 57 hermetic + browser spec: dispatcher select opens modal with all 5 section headings and checklist-gated buttons; select asserts exactly one HITL POST carrying `incident_id + route_id` with badge increment; all three surfaces (sidebar hard-asserted, ETA-badge + map popover annotated) converge on the same modal; guest sandbox asserts `SANDBOX PREVIEW` watermark + banner visible with **zero** requests to `/approvals` and zero to `/fleet/telemetry/*`; 403-once mock asserts no `DISETUJUI` text, no `onCommit` side-effect marker, sandbox toast retained with modal open for retry; regulator asserts `SETUJI [Khusus Dispatcher]` locked while HOLD stays enabled.

### 14. `scripts/probe_parity.sh` + `scripts/audit_backend_apis.py` (`31cd17a`)

- `probe_parity.sh`: warm-up `GET /health` cold-start guard retained (line 15); anon 401 legs for `auth/me`, `auth/switch-role`, `hitl-pending`, `hitl-action` (bad-UUID body); authenticated legs via guest-session mint (`approvals` GUEST→403 FORBIDDEN, DISPATCHER→201 `"action"`, `hitl-pending` 200 `pending_approvals`, `hitl-action` bad-UUID→422 `Invalid UUID`, GUEST→403 FORBIDDEN); skip-branch when token mint fails during cold start.
- `audit_backend_apis.py`: `expect_status` asserts + retry-once wakeup; anonymous 4-row guard block (lines 67–70) plus `_run_authenticated_rbac_matrix` 7-row matrix (me 200 GUEST → switch-role 200 → approvals GUEST 403 → approvals DISPATCHER 201 → hitl-pending 200 → hitl bad-UUID 422 → hitl GUEST 403) folding into pass/fail totals with WARN-degrade on outage.

### 15. `infra/supabase/migrations/013_hil_hardening.sql` (`71ade5e`, 66 lines)

Payload-vs-schema convergence: `route_approvals.route_id TEXT NULLABLE` + index (backend `approvals.py` always sends `route_id`, default `"0"`; `news_router` hitl-pending reads it — previously missing from the effective 000+006 schema so PostgREST inserts failed); `incidents.incident_id TEXT NULLABLE` + backfill `incident_id = id::text` + unique constraint + index (ingestor writes/selects/updates by uuid4 `incident_id` while 000_init only created PK `id`). Deliberately NOT added (documented lines 22–32): `committed_by_role` (notes + response + local mirror only), `dasar_risiko/dampak_uncertainty` (members of `recommended_route` JSONB proof triple), `route_name/origin/destination` (read-only `.get()` with defaults). RLS untouched (010 already `FOR ALL TO authenticated`, anon excluded).

### 16. RBAC contract lock (`8e1a4a8`, `ba4028d`)

- `backend/app/auth/supabase_auth.py` ROLE_PERMISSIONS comment block (lines 34–54): GUEST strictly `benchmark:read + reports:read` only, MUST NEVER contain `approvals:write/fleet:write`; REGULATOR read-mostly + HOLD advisory flag, no `approvals:write`; DISPATCHER alone holds `approvals:write + fleet:write + routes:plan`. Verified by `backend/tests/test_auth_rbac.py` (29 passed per commit message).
- `backend/app/routers/auth_router.py` (+3): `switch-role` docstring locks the server-side `get_current_user` check (never `get_optional_user`); frontend `AuthModal isSandboxAccount` stays UX-only.

---

## Commit ledger (Phase 77)

| Hash | Message | Files |
|---|---|---|
| `621e346` | feat(77-01-backend): route proof schemas, proof-enriched routing, HITL RBAC hardening | `agents/nodes/route_optimization.py`, `backend/app/adapters/cpu_routing_adapter.py`, `backend/app/routers/{approvals,news_router,routing_router}.py`, `backend/app/schemas/{decision_schemas,routing_proof_schemas}.py` |
| `db2577a` | feat(77-02): route detail modal with 5-section HITL verification and role-gated commits | `DashboardClient.tsx`, `GuestEvaluationBanner.tsx`, `HitlDecisionDrawer.tsx`, `CrisisMap.tsx`, `MitigationTab.tsx`, `RouteDetailModal.tsx`, `lib/types.ts` |
| `0f0812d` | test(77-03): add Wave 3 RBAC mocked e2e cases to phase57 spec | `frontend/e2e/phase57-pilot-hardening.spec.ts` (+402) |
| `31cd17a` | test(77-03): extend probe parity + backend audit with Wave 3 RBAC matrix | `scripts/probe_parity.sh`, `scripts/audit_backend_apis.py` |
| `a47b35e` | feat(77): finalize route modal HITL (plan artifacts) | `77-01-PLAN.md`, `77-02-PLAN.md` |
| `71ade5e` | supabase: 013_hil_hardening convergence | `infra/supabase/migrations/013_hil_hardening.sql` |

## Verification performed for this walkthrough

- `tsc` contract: plans require `npm --prefix frontend exec tsc --noEmit -p tsconfig.json` zero errors after Wave 1 and Wave 2 changes.
- Playwright gate: `npx playwright test frontend/e2e/phase57-pilot-hardening.spec.ts --reporter=line` (Wave 3 mocked RBAC cases).
- Negative greps: `MitigationTab` catch contains no `setApprovedRouteId` on the 403 path; guest paths contain no `api.approvals.create` / `simulatePing` call (verified by reads above).
- Live parity: `scripts/probe_parity.sh` + `scripts/audit_backend_apis.py` Wave 3 rows against `https://peta-nadi.onrender.com` and `localhost:8000`.
