# PLAN — Phase 31: PreHub Rebranding, Proposal MVP Alignment, Error Fixes & Technical Documentation

## Objective
Execute complete rebranding from PetaNadi to PreHub, ensure alignment with the official proposal, verify 100% build and test health, generate automated Playwright screenshots of the running platform, and construct the 30-page Technical Document (Dokumen Pendukung).

## Tasks

### Task 1: Rename PetaNadi & LRIP -> PreHub Across Codebase
- [ ] Update frontend metadata, layout, dashboard client, report templates, onboarding components, and logo labels.
- [ ] Update backend configurations, app metadata, API routers, and agent system prompts.
- [ ] Update agents node prompts (`agents/nodes/decision_support.py`, etc.).

### Task 2: Verify End-to-End System Health
- [ ] Run backend unit and integration test suite (`pytest`).
- [ ] Run Next.js production build (`npm run build`).

### Task 3: Automate Playwright Screenshots of PreHub
- [ ] Launch local backend and frontend instances.
- [ ] Execute Playwright capture script to take crisp 1080p screenshots of:
  - Onboarding Landing Page
  - Command Center 4D Map & Incident Radar
  - Evidence Chain Inspector & Multi-Agent Telemetry
  - Mitigation Sandbox & cuOpt Routing Matrix
  - Spatial Economic Analytics & Inflation Risk Map
  - B2G Executive Cabinet Briefing Center

### Task 4: Author Dokumen Pendukung (Technical Document)
- [ ] Write `docs/Dokumen_Pendukung_PreHub.md` structured per submission guidelines:
  1. Identitas Sistem & Gambaran Umum (PreHub)
  2. Persyaratan Perangkat Keras & Perangkat Lunak (System Requirements)
  3. Panduan Instalasi & Konfigurasi Lingkungan (Deployment & Setup)
  4. Arsitektur Struktural & Diagram Sistem (Structural Features & Pipeline)
  5. Deskripsi Fungsional Modul & Alur Multi-Agent (Functional Specifications)
  6. Panduan Penggunaan Sistem (Step-by-Step Operator User Manual)
  7. Galeri Tangkapan Layar Aplikasi (Playwright Screenshots Gallery)
  8. Penanganan Masalah & Pemeliharaan (Troubleshooting & Maintenance)

### Task 5: Document Completion in GSD Memory
- [ ] Update `STATE.md`, `ROADMAP.md`, and generate `phase-31/SUMMARY.md`.
