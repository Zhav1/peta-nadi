# Phase 65 Walkthrough: Remove Simulasi Main Tab and Dead Simulation/Chat Code

## Executive Overview
Phase 65 removed the legacy "Simulasi" main tab (`SimulationSection.tsx`) and its ungrounded client-side formulas. The system now unifies all simulation capabilities under a single canonical engine: **Simulasi Bencana** on the map canvas (`CrisisSimulatorBar.tsx`), directly powered by deterministic CPU solvers (OR-Tools / NetworkX), BKHIT digital compliance gates, and calibrated spoilage models.

---

## Detailed Changes

### 1. Frontend Deletions & Cleanups
- **Deleted File**:
  - `frontend/components/dashboard/SimulationSection.tsx` (495 lines of legacy toy slider code).
- **[DashboardClient.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx)**:
  - Removed import of `SimulationSection` and type `ActionPlanParams`.
  - Refactored `activeSection` state type from `'map' | 'analytics' | 'simulation' | 'reports' | 'evaluation'` to `'map' | 'analytics' | 'reports' | 'evaluation'`.
  - Purged query param handling for `?section=simulation`.
  - Removed the `{ id: 'simulation', label: 'Simulasi' }` tab from the top nav bar.
  - Deleted `handleDeployUnifiedActionPlan` callback (which previously wrote mock deployments to `localStorage.prehub_sandbox_approvals`).
  - Removed `<SimulationSection />` conditional render tree.
- **[AnalyticsSection.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/AnalyticsSection.tsx)**:
  - Updated `onSwitchTab` prop signature.
  - Replaced the simulation button CTA with `"Simulasi Bencana (Peta)"`, redirecting directly to `'map'` where the interactive hazard simulator resides.
- **[api.ts](file:///d:/College/Pidi.id/frontend/lib/api.ts)**:
  - Removed `api.simulation` client definitions.
- **[capture-screenshots.spec.ts](file:///d:/College/Pidi.id/frontend/e2e/capture-screenshots.spec.ts)**:
  - Removed the `section=simulation` screenshot capture step.

### 2. Backend Deletions
- **[agent_router.py](file:///d:/College/Pidi.id/backend/app/routers/agent_router.py)**:
  - Removed dead `/simulation/chat` route definitions.

---

## Verification & Checks Run
- **TypeScript**: `rtk npx tsc --noEmit` passed with 0 errors.
- **Next.js Production Build**: `rtk npm run build` passed cleanly (7/7 static pages generated).
- **Codebase Grep Verification**:
  - `git grep "SimulationSection"` -> 0 matches in `frontend/` and `backend/`.
  - `git grep "simulation/chat"` -> 0 matches in `frontend/` and `backend/`.
- **Navigation Invariant**: Top navigation cleanly presents:
  1. Peta Operasi
  2. Analitik
  3. Laporan
  4. Evaluasi
