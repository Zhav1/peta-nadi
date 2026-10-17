# Phase 65 Plan: Remove Simulasi Main Tab and Dead Simulation/Chat Code

## 1. Executive Summary & Goals

Following the architectural audit:
- The **Simulasi** main tab (`SimulationSection.tsx`, 495 lines) was a legacy artifact from Phase 11/30.
- It calculated ungrounded toy metrics using arbitrary linear formulas (e.g., `closureHours * 0.6 - bulogStockAlloc * 0.05` for commodity price deviation) and hardcoded strings (`"~1.400 Unit"`).
- It made zero backend API calls, had zero empirical validation against the standardized $N=60$ Sumatra benchmark, and contradicted PreHub's core architectural tenets of honest, grounded operations.
- The true, calibrated simulator is **Simulasi Bencana** on the map canvas (`CrisisSimulatorBar.tsx` -> `POST /api/v1/simulate/stream`), which streams live multi-agent execution, runs deterministic CPU OR-Tools detour solvers, checks BKHIT regulatory compliance, and calculates exponential spoilage decay ($1 - e^{-\delta \cdot T}$).

**Goal**: Delete `SimulationSection.tsx` and all references, redirect the Analytics tab deep link to the map's Simulasi Bencana, and purge dead `/simulation/chat` endpoints from the backend.

---

## 2. Deliverables & Blast Radius

### Frontend Changes:
1. `frontend/components/dashboard/SimulationSection.tsx`:
   - Delete entire file.
2. `frontend/components/dashboard/DashboardClient.tsx`:
   - Remove import of `SimulationSection` and associated types (`ActionPlanParams`).
   - Remove `'simulation'` from `activeSection` union type (`'map' | 'analytics' | 'reports' | 'evaluation'`).
   - Remove query param parsing for `section === 'simulation'`.
   - Remove the `{ id: 'simulation', label: 'Simulasi' }` tab from the top navigation bar.
   - Remove `handleDeployUnifiedActionPlan` callback.
   - Remove conditional rendering container `<SimulationSection />`.
3. `frontend/components/dashboard/AnalyticsSection.tsx`:
   - Update `onSwitchTab` prop type to exclude `'simulation'`.
   - Re-route the "Simulasi Skenario Dampak" button to switch to `'map'` and open the Simulasi Bencana bar.
4. `frontend/lib/api.ts`:
   - Remove `api.simulation` object and methods.
5. `frontend/e2e/capture-screenshots.spec.ts`:
   - Remove screenshot capture for `section=simulation`.

### Backend Changes:
1. `backend/app/routers/agent_router.py`:
   - Remove dead `/simulation/chat` route handlers.

---

## 3. Verification & Acceptance Criteria
- [x] `rtk npx tsc --noEmit` compiles cleanly with 0 type errors.
- [x] `rtk npm run build` completes production bundle generation (7/7 static pages).
- [x] `git grep` for `SimulationSection` and `simulation/chat` in frontend and backend yields 0 matches.
- [x] Top navigation displays exactly 4 tabs: Peta Operasi, Analitik, Laporan, Evaluasi.
- [x] Clicking "Simulasi Bencana (Peta)" in Analytics switches directly to the Map tab with the crisis simulator active.
