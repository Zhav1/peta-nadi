# Phase 41: UI/UX Minimalist Sanitization & Technical Report Finalization — Research

## 1. Domain Background & Technical Objectives

Milestone M2 addresses competition feedback regarding scientific rigor, development process, and software conformance.
Phase 41 delivers the final polish across two major deliverables:
1. **Frontend Codebase Sanitization**:
   - Zero emoji characters in code and UI elements (replace with Lucide SVG).
   - Eradication of fictional GPU claims (cuOpt, FourCastNet, H100) and marketing hype (COMMAND CENTER 4D).
   - Standardize terminology to honest CPU implementations: NetworkX Dijkstra, Google OR-Tools VRP, Open-Meteo API, and BMKG radar.
2. **Technical Documentation Finalization**:
   - Update `docs/Dokumen_Pendukung_PreHub.md` and `scripts/generate_docx_technical_doc.py` to reflect complete M2 architecture.
   - Embed complete 88-test inventory from `docs/test_matrix.md` with pass rates and branch coverage.
   - Embed empirical benchmark results ($N=60$ scenarios: Precision 100%, Recall 94.3%, F1 0.971, Brier Score 0.0782, Latency 0.024ms).
   - Generate official DOCX technical report artifact.

---

## 2. Codebase Audit Summary

### A. Emoji Locations Identified
- `frontend/components/ui/Toast.tsx`: Unicode `✕`
- `frontend/components/ui/SimulateButton.tsx`: Unicode `✏`, `⚡`
- `frontend/components/demo/GuidedDemoPanel.tsx`: Unicode `🟢`, `🟡`, `📌`, `📱`, `✕`
- `frontend/app/demo-remote/page.tsx`: Unicode `✓`
- `frontend/components/dashboard/DashboardClient.tsx`: Unicode `📍`

### B. Buzzwords / Exaggeration Locations Identified
- `frontend/components/dashboard/DashboardClient.tsx`: `MAP 4D` tab name, `cuOpt` telemetry props
- `frontend/components/dashboard/ReportsSection.tsx`: "Solved NVIDIA cuOpt GPU matrix"
- `frontend/components/dashboard/SimulationSection.tsx`: "Rekomendasi Rute GPU NVIDIA cuOpt"
- `frontend/components/dashboard/TopNavTelemetry.tsx`: `cuOptInfo` props & labels
- `frontend/components/demo/GuidedDemoPanel.tsx`: "FourCastNet Earth-2", "NVIDIA cuOpt GPU"
- `frontend/components/onboard/ImageSequenceCanvas.tsx`: "PHASE 03: NVIDIA CUOPT GPU ROUTE OPTIMIZATION"
- `frontend/components/onboard/InteractiveDemoShowcase.tsx`: "NVIDIA cuOpt GPU Rerouting"
- `frontend/components/onboard/KineticFeatureGrid.tsx`: "NVIDIA cuOpt Avoidance Rerouting", "GPU ACCELERATION"
- `frontend/components/onboard/OnboardHero.tsx`: "Launch Command Center 4D", "NVIDIA cuOpt"
- `frontend/components/onboard/OnboardFooter.tsx`: "NVIDIA cuOpt"
- `frontend/lib/api.ts`: `optimizeCuOpt` method alias

### C. Documentation Audit
- `docs/Dokumen_Pendukung_PreHub.md` currently lists Phase 35, references GPU cuOpt in Chapter 2/7, lacks the 88-test verification matrix, lacks Brier Score calibration chapter, and lacks empirical benchmark results table.
- `scripts/generate_docx_technical_doc.py` needs structural expansion to generate these chapters and tables with rich formatting.

---

## 3. Plan Decomposition

- **Plan 41-01**: Frontend Minimalist UI/UX Sanitization & Anti-Pattern Elimination
- **Plan 41-02**: Technical Documentation & DOCX Generation Finalization
