# Phase 65 Learnings: Remove Simulasi Main Tab and Dead Simulation/Chat Code

## Executive Summary
Phase 65 eliminated the legacy Simulasi main tab and dead chat routes, preserving brand credibility by consolidating all simulation workflows into the verified "Simulasi Bencana" engine.

---

## Decisions with Rationale
1. **Purge of Uncalibrated Client Formulas**:
   - `SimulationSection.tsx` calculated impact metrics using arbitrary linear multipliers (e.g. `closureHours * 0.6 - bulogStockAlloc * 0.05` for price inflation, `~1.400 Unit` hardcoded fleet impact).
   - These numbers had zero validation against the $N=60$ Sumatra benchmark dataset. In an enterprise/government pilot evaluation (Pelindo, BKHIT, BPJT), presenting unverifiable toy sliders severely damages technical credibility.
2. **Single Canonical Simulator**:
   - PreHub's authentic simulation platform is **Simulasi Bencana** (`CrisisSimulatorBar.tsx`), which streams live agent telemetry via SSE (`POST /api/v1/simulate/stream`), computes deterministic CPU OR-Tools/NetworkX detours, evaluates BKHIT quarantine / MST axle-load compliance, and evaluates calibrated exponential spoilage decay ($1 - e^{-\delta \cdot T}$).
   - All entry points (including the Analytics section CTA) now route directly to the map canvas simulator.
3. **Dead Code Purge**:
   - Dropped `/simulation/chat` from `backend/app/routers/agent_router.py` as it was a relic from Phase 11/30 and is no longer called by any client component.

---

## Constraints & Environment
- **Pilot Scope**: PreHub is a **Live Pilot Operations Product** for Sumatra logistics partners (Pelindo Belawan, BKHIT, BPJT tolls, PIHPS food commodities), not an artificial synthetic demo.
- **Backend Deployment**: Like Phase 64, the deleted `/simulation/chat` endpoint on Render will only return 404 after backend redeployment, but the updated frontend no longer calls it.

---

## Issues Hit During Work
- **E2E Test Regression**: The deletion of `SimulationSection.tsx` broke an e2e test in `frontend/e2e/phase57-pilot-hardening.spec.ts` (`guest deploy on 403 shows the sandbox toast and saves locally`) which originally clicked `#deploy-unified-action-plan-btn` inside `SimulationSection`. This required re-architecting the test to target the `MitigationTab` approval flow (handled in Phase 68).

---

## Open Issues for New Context Window
- **Redeploy Backend on Render**: Ensure `agent_router.py` changes are deployed to `peta-nadi.onrender.com`.
