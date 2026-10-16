# Plan: Phase 59 - E2E Audit Remediation & Visual Lockdowns

**Source Documents:** [PILOT_BUGS_AND_E2E_AUDIT_REPORT.md](file:///c:/Farras/DIGDAYA/peta-nadi/PILOT_BUGS_AND_E2E_AUDIT_REPORT.md), [59-CONTEXT.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/phases/59-e2e-audit-remediation-and-visual-lockdowns/59-CONTEXT.md), [59-RESEARCH.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/phases/59-e2e-audit-remediation-and-visual-lockdowns/59-RESEARCH.md)  
**Parent Milestone:** M4 - PreHub Pilot Hardening, E2E Audit Remediation & Multi-Tenant Operational Stability  
**Status:** COMPLETE ✅  

---

## 1. Objectives

Execute all 9 remediations required to eliminate pointer-event HUD collisions, deliver an enterprise Authenticated User Profile Card, restrict 1-Click Persona switching strictly to sandbox evaluation, visually display locked states for non-dispatcher roles, restore realistic arterial coastal highway routing geometry, bind econometric intelligence data into guided demo state, filter simulation fleet units honestly, stop aggressive 404 remote polling, and unify toast notifications.

---

## 2. Guardrails & Compliance

* Strictly **ZERO em dashes** (Unicode U+2014) anywhere across code, documentation, and chat outputs (use colons, hyphens, or parentheses).
* Maintain all existing comments, docstrings, and architectural invariants.
* Use `rtk` for terminal command execution and refresh `$env:PATH`.
* Never reintroduce GPU dependencies (CPU routing solver only).
* Zero hardcoded synthetic slop (economic models and route coordinates must adhere to calibrated benchmarks).

---

## 3. Wave-Based Implementation Plan

### Wave 1: Authentication, Profile Card, Persona Lockdown, Visual Lock Badges & Banner Pointer-Events (Bugs 1, 2, 3, 4)

* **Task 1.1: Fix `GuestEvaluationBanner.tsx` Pointer-Events & Positioning**
  - Files: `frontend/components/dashboard/GuestEvaluationBanner.tsx`
  - Actions:
    1. Update outer wrapper from `pointer-events-auto` to `pointer-events-none`.
    2. Add `pointer-events-auto` explicitly to the inner card.
    3. Ensure banner does not occlude the top telemetry HUD strip (`TopNavTelemetry`).

* **Task 1.2: Implement Authenticated User Profile Card in `AuthModal.tsx`**
  - Files: `frontend/components/auth/AuthModal.tsx`
  - Actions:
    1. If `isAuthenticated === true`, default `activeTab` to `'account'` (Profil Akun).
    2. Render complete User Profile Card with Avatar, Full Name, Email, Organization/Company, Role badge (DISPATCHER: Cyan, REGULATOR: Amber, GUEST: Emerald), and active RBAC permissions.
    3. Add a dedicated "Keluar dari Sesi (Logout)" button calling `logout()`.
    4. If unauthenticated, render the standard login/signup form.

* **Task 1.3: Restrict 1-Click Persona Switcher to Sandbox Evaluator Accounts**
  - Files: `frontend/components/auth/AuthModal.tsx`
  - Actions:
    1. In `handlePersonaSelect`, check `isSandboxAccount = Boolean(user?.is_offline_guest || user?.email?.endsWith('@kompetisi-lrip.id') || user?.company_id === 'demo_sandbox')`.
    2. For corporate accounts, disable persona switching and display an informative notice: `Peran Anda dikelola secara terpusat oleh instansi/perusahaan resmi.`

* **Task 1.4: Add Visual Lock Badges and Role-Aware Action Controls**
  - Files:
    - `frontend/components/dashboard/DashboardClient.tsx`
    - `frontend/components/fleet/FleetOnboardingModal.tsx`
    - `frontend/components/sidebar/MitigationTab.tsx`
  - Actions:
    1. In `DashboardClient.tsx`: When `role !== 'DISPATCHER'`, display a `Lock` icon and `[Khusus Dispatcher]` badge next to `Onboard Armada`. Clicking it triggers an informative warning toast instead of opening the form.
    2. In `FleetOnboardingModal.tsx`: Enforce check `if (userRole !== 'DISPATCHER')` and return clear feedback.
    3. In `MitigationTab.tsx`: Adjust action button label dynamically:
       - GUEST: `Simpan Rencana (Sandbox Lokal)`
       - REGULATOR: `Tinjau Rencana (Otoritas Regulasi)` (read-only)
       - DISPATCHER: `Terapkan Rute Koridor` (full operational commit)

---

### Wave 2: Fleet Simulation Mode Filtering Hardening (Bug 7)

* **Task 2.1: Implement Honest Fleet Filtering in `useFleetVehicles.ts`**
  - Files: `frontend/hooks/useFleetVehicles.ts`
  - Actions:
    1. Inside `fetchFleet()`, when `res.vehicles && res.vehicles.length > 0`:
       - If `!isSimulationMode`: filter out baseline units, retaining only custom onboarded vehicles (`is_custom === true` or telemetry source `CUSTOM_DISPATCHER` / `TMS_GPS_WEBHOOK`).
       - If `isSimulationMode`: display all units.
    2. Ensure toggling `isSimulationMode` from ON to OFF cleanly removes the 45 baseline synthetic vehicles from the map.

---

### Wave 3: Run Demo Arterial Coastal Routing Geometry, Destination Simpul Fix & Econometric Data Piping (Bugs 5, 6)

* **Task 3.1: Curated Pan-Sumatra Coastal Highway Routing Geometry**
  - Files:
    - `frontend/components/dashboard/DashboardClient.tsx`
    - `frontend/hooks/useDemoState.ts`
    - `data/fixtures/mock_crisis_state.json`
  - Actions:
    1. Replace the crude 4-point straight lines in `buildHazardBypassRoute` with verified Pantai Cermin coastal arterial highway coordinates (Belawan -> Marelan -> Percut Sei Tuan -> Pantai Cermin -> Sei Rampah -> Tebing Tinggi).
    2. Remove the erroneous Lake Toba / Parapat waypoints (`[3.1600, 99.1150]` and `[2.9595, 99.0687]`) from `useDemoState.ts` and `mock_crisis_state.json`, ensuring the detour stops at Simpang Susun Tol Tebing Tinggi (`3.3285, 99.1625`).

* **Task 3.2: Dynamic Origin and Destination in Backend Demo Router**
  - Files: `backend/app/routers/demo_router.py`
  - Actions:
    1. Add `origin: Optional[str] = None` and `destination: Optional[str] = None` to `StartDemoPayload`.
    2. Pass these parameters into the demo scenario generator so custom corridor endpoints are respected.

* **Task 3.3: Pipe Econometric Intelligence Models into Demo State**
  - Files: `frontend/hooks/useDemoState.ts`
  - Actions:
    1. Populate `inflation_forecast` with calibrated price projections (+15% Minyak Goreng, +12.5% Cabai Merah) and Spoilage Hedging monetary evaluation (Rp 1,045,284 net savings from holding).
    2. Label the output clearly as `[Simulasi Model Ekonometrika]` so the EconomicTab renders informative metrics during the demo.

---

### Wave 4: Demo Remote 404 Polling Guard & Toast Unification (Bugs 8, 9)

* **Task 4.1: Fix `/demo-remote` Polling Loop on 404**
  - Files: `frontend/app/demo-remote/page.tsx`
  - Actions:
    1. If the status response returns 404, stop polling and display a clean notice: `Sesi demonstrasi belum aktif. Silakan jalankan 'Run Demo' dari dashboard utama.`

* **Task 4.2: Unify Toast Notifications in `SimulationSection.tsx`**
  - Files: `frontend/components/dashboard/SimulationSection.tsx`
  - Actions:
    1. Remove the local toast call in `SimulationSection.tsx` so `onDeployActionPlan` in `DashboardClient.tsx` acts as the single source of truth for notification toasts.

---

## 4. Mandatory Verification Gate

1. **Syntax & Type Safety:**
   - Execute `npx tsc --noEmit` in `frontend/` (0 errors required).
2. **Backend Unit Testing:**
   - Execute `python -m pytest backend/tests` (183+ tests passing required).
3. **Automated E2E Playwright Run:**
   - Run `node scratch/extended_e2e_audit.js` to verify:
     - 0 element click timeouts.
     - Banner does not block top HUD controls.
     - Auth profile card renders for authenticated sessions.
     - Fleet simulation toggle accurately clears 45 synthetic vehicles.
     - Demo bypass polyline follows the coastal road and terminates at Tebing Tinggi.
4. **Zero Em Dashes Compliance:**
   - Execute `git diff | Select-String [char]0x2014` to ensure zero em dashes across all touched files.
