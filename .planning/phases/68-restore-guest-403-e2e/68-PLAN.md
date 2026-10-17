# Phase 68 Plan: Restore Guest-403 E2E Test Against MitigationTab

## 1. Executive Summary & Goals

Following the removal of `SimulationSection.tsx` in Phase 65:
- The E2E test `guest deploy on 403 shows the sandbox toast and saves locally` in `frontend/e2e/phase57-pilot-hardening.spec.ts` was deleted because it targeted `#deploy-unified-action-plan-btn` inside the now-removed Simulasi tab.
- This created a coverage gap for guest sandbox evaluation: when guest users (unauthenticated or unprivileged evaluators) attempt to approve or deploy an operational reroute, the backend returns HTTP 403 Forbidden (RBAC gate enforced in `approvals.py`).
- The UI must catch this 403 gracefully, prevent application crashes, display a sandbox notification toast, and allow the guest to evaluate the optimistic state transition.

**Goal**: Restore equivalent E2E test coverage in `frontend/e2e/phase57-pilot-hardening.spec.ts` targeting the active `MitigationTab` approval flow (`handleApprove` -> `POST /api/v1/approvals`), validating the 403 interception and optimistic UI response without inventing unverified product behavior.

---

## 2. Deliverables & Blast Radius

### Test Suite Changes:
1. `frontend/e2e/phase57-pilot-hardening.spec.ts`:
   - Restore `guest deploy on 403 shows the sandbox toast and saves locally` test:
     - Mock Mapbox directions API to avoid external network stalls.
     - Mock `/api/demo/start`, `/api/demo/status`, and `/api/demo/advance` to smoothly drive the guided demo to Stage 4 (Dispatch & Mitigasi).
     - Mock `POST /api/v1/approvals` returning `403 Forbidden` (`{ detail: { error: 'FORBIDDEN' } }`).
     - Assert that the `MitigationTab` sandbox mode indicator is rendered.
     - Click `SIMPAN RENCANA` on the active route recommendation card.
     - Assert that the local save toast appears: `Keputusan rute #1 (ACCEPT/REROUTE) tersimpan secara lokal!`.
     - Assert that the route card transitions optimistically to `DISETUJUI & DIKIRIM`.
     - Document that `localStorage.getItem('prehub_sandbox_approvals')` is currently empty (React state only).

### Defensive Code Hardening:
1. `frontend/components/sidebar/MitigationTab.tsx`:
   - Guard `(route.distance_km ?? 0).toFixed(0)`, `route.eta_minutes ?? 0`, and `(route.fuel_increase_pct ?? 0).toFixed(0)` with nullish coalescing to prevent runtime exceptions when rendering partial route objects.
2. `frontend/components/dashboard/DashboardClient.tsx`:
   - Update `handleCrisisReadyFromDemo` to reuse `crisis.route_recommendations` when already calculated, resolve node coordinates via `resolveNodeInfo()`, and fallback to default demo corridor nodes (`belawan` -> `tebingtinggi`), ensuring demo progression to Stage 4 reliably opens the `CrisisSidebar`.

---

## 3. Verification & Acceptance Criteria
- [x] `rtk npx tsc --noEmit` compiles cleanly with 0 type errors.
- [x] `rtk npx playwright test e2e/phase57-pilot-hardening.spec.ts -g "guest deploy on 403"` passes 1/1.
- [x] Guest 403 handling verified in `MitigationTab` without regressions.
