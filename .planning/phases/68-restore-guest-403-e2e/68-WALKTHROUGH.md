# Phase 68 Walkthrough: Restore Guest-403 E2E Test Against MitigationTab

## Executive Overview
Phase 68 restored automated E2E test coverage for guest RBAC handling (`403 Forbidden`) during the route approval workflow. The test was rewritten from the deleted legacy Simulasi tab to the active `MitigationTab` approval pipeline, confirming that guests receive an informative sandbox toast and optimistic UI update.

---

## Detailed Changes

### 1. `frontend/e2e/phase57-pilot-hardening.spec.ts`
- **Reconstructed E2E Test**:
  - Implemented `test('guest deploy on 403 shows the sandbox toast and saves locally')`:
    - Intercepts Mapbox directions route requests with static polyline responses to prevent network latency.
    - Routes demo start, status, and advance endpoints to cleanly position the dashboard in Stage 4 (Dispatch & Mitigasi).
    - Injects a mock crisis state with a safe detour recommendation (`detour-bypass-0`).
    - Intercepts `POST /api/v1/approvals` with HTTP 403 Forbidden.
    - Intercepts `GET /api/v1/approvals` with an empty approval ledger.
    - Asserts presence of `Mode Sandbox: Tindakan disimpan lokal untuk simulasi evaluasi.`.
    - Triggers the approval action via `SIMPAN RENCANA`.
    - Asserts appearance of toast notification containing `tersimpan secara lokal`.
    - Verifies card state updates optimistically to `DISETUJUI & DIKIRIM` with active driver dispatch actions.
    - Asserts that `localStorage` is not written to, confirming the current React-only state behavior.

### 2. Defensive Code Adjustments
- **[MitigationTab.tsx](file:///d:/College/Pidi.id/frontend/components/sidebar/MitigationTab.tsx)**:
  - Added null guards to route metric formatters:
    `{(route.distance_km ?? 0).toFixed(0)} km`
    `{route.eta_minutes ?? 0} min`
    `+{(route.fuel_increase_pct ?? 0).toFixed(0)}%`
- **[DashboardClient.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx)**:
  - Updated `handleCrisisReadyFromDemo`:
    - Default fallback to `'belawan'` -> `'tebingtinggi'` if no nodes are explicitly selected.
    - Coordinates resolved via `resolveNodeInfo()` before falling back to `HUB_NODES`.
    - Reuses `crisis.route_recommendations` directly when already present in the crisis state to bypass redundant Mapbox recalculations.
    - Sets selected origin and destination nodes during demo startup and dock button click.

---

## Verification & Checks Run
- **TypeScript**: `rtk npx tsc --noEmit` passed with 0 errors.
- **Playwright Test Execution**:
  ```powershell
  rtk npx playwright test e2e/phase57-pilot-hardening.spec.ts -g "guest deploy on 403"
  # Output: 1 passed (Time: ~23s)
  ```
