# Context: Phase 59 - E2E Audit Remediation & Visual Lockdowns

**Source Document:** [PILOT_BUGS_AND_E2E_AUDIT_REPORT.md](file:///c:/Farras/DIGDAYA/peta-nadi/PILOT_BUGS_AND_E2E_AUDIT_REPORT.md)  
**Parent Milestone:** M4 - PreHub Pilot Hardening, E2E Audit Remediation & Multi-Tenant Operational Stability  
**Status:** COMPLETE ✅  

---

## 1. Executive Intent & Problem Statement

Phase 59 resolves the 9 systemic bugs, UX blockers, and routing anomalies discovered during end-to-end audit and user field drills. The goal is to ensure the PreHub platform operates with complete role integrity, zero pointer-event collisions, robust arterial road geometry, honest econometric intelligence data, and clean simulation controls.

---

## 2. Locked Decisions

* **D1 (Banner Non-Blocking Pointer Events):** `GuestEvaluationBanner.tsx` outer container must be `pointer-events-none` with only the inner interactive card having `pointer-events-auto`. The banner position must not occlude the top telemetry HUD strip (`TopNavTelemetry.tsx`).
* **D2 (Authenticated User Profile Card):** When `isAuthenticated === true`, clicking the top right role badge in `DashboardClient.tsx` must open `AuthModal.tsx` in a dedicated "Profile Akun" view displaying user details (Name, Email, Role badge, Organization, Tenant ID, active RBAC permissions) and an explicit "Keluar (Logout)" button. It must not present the login form to an already authenticated session.
* **D3 (Persona Switcher Restricted to Evaluator Sandbox):** The 1-Click Persona switcher in `AuthModal.tsx` is exclusively accessible to unauthenticated guests and sandbox evaluation accounts (`is_offline_guest === true` or email ending with `@kompetisi-lrip.id`). Real corporate or institutional accounts (`@bapanas.go.id`, `@poslog.co.id`, `@pelindo.co.id`) must have the switcher disabled with an informative message indicating their role is managed by their enterprise administrator.
* **D4 (Explicit Visual Lock Badges):** All interactive features requiring dispatcher authority (such as `Onboard Armada` and operational mitigation corridor commitment) must visually display lock icons (`Lock` from Lucide) and badges (e.g. `[Khusus Dispatcher]`) when accessed by non-dispatcher roles. Clicking them as a Guest or Regulator must trigger an informative toast explaining the restriction instead of permitting form submission and failing on backend 403.
* **D5 (Arterial Coastal Highway Bypass Geometry):** The crude 4-point straight-line tangent calculation in `buildHazardBypassRoute` is replaced with verified Pan-Sumatra arterial road geometry along the Pantai Cermin coastal corridor (Belawan -> Marelan -> Percut Sei Tuan -> Pantai Cermin -> Sei Rampah -> Tebing Tinggi).
* **D6 (Correct Destination Simpul):** Fallback waypoints in `useDemoState.ts` and `mock_crisis_state.json` must terminate at Simpang Susun Tol Tebing Tinggi (`3.3285, 99.1625`), stripping the erroneous southern extension to Lake Toba / Parapat.
* **D7 (Dynamic Origin and Destination in Backend Demo Router):** `StartDemoPayload` in `backend/app/routers/demo_router.py` must declare `origin: Optional[str] = None` and `destination: Optional[str] = None` to respect the corridor chosen by the operator.
* **D8 (Econometric Data Piping into Demo State):** The calibrated economic models computed by backend `demo_router.py` (+15% Minyak Goreng, Rp 1,045,284 net savings from holding) must be piped into `inflation_forecast` in client demo state labeled `[Simulasi Model Ekonometrika]`.
* **D9 (Fleet Simulation Toggle Honest Filtering):** In `useFleetVehicles.ts`, when `isSimulationMode === false`, the hook must strictly filter out baseline synthetic units and only return custom onboarded vehicles (or an empty array if none exist).
* **D10 (Demo Remote Polling Backoff & Toast Unification):** `/demo-remote` must cease polling and show an inactive state upon receiving 404. Duplicate toast popups in `SimulationSection.tsx` must be removed in favor of `onDeployActionPlan` feedback.

---

## 3. Scope Fences

* **IN SCOPE:**
  - `frontend/components/dashboard/GuestEvaluationBanner.tsx`
  - `frontend/components/auth/AuthModal.tsx`
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/components/fleet/FleetOnboardingModal.tsx`
  - `frontend/components/sidebar/MitigationTab.tsx`
  - `frontend/hooks/useDemoState.ts`
  - `frontend/hooks/useFleetVehicles.ts`
  - `frontend/app/demo-remote/page.tsx`
  - `frontend/components/dashboard/SimulationSection.tsx`
  - `backend/app/routers/demo_router.py`
  - `data/fixtures/mock_crisis_state.json`
* **OUT OF SCOPE:**
  - Modifying the underlying CPU routing solver algorithms in `backend/app/adapters/cpu_routing_adapter.py`.
  - Reintroducing any GPU or cuOpt dependencies.
  - Modifying Supabase Migration files (covered in Phase 57 Step 0).
