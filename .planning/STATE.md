# STATE — LRIP / PetaNadi Project Memory

**Last Updated:** 2026-07-12
**Active Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)
**Current Phase:** Phase 8: NVIDIA Architecture Integration (COMPLETE)

---

## Workflow Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Foundation & Repo Setup | **COMPLETE** ✅ | Git: `f404517`, `4f48e8e` |
| 1 | Data Ingestion Pipeline & API Adapters | **COMPLETE** ✅ | Git: `a33c94c` |
| 2 | OSINT & Headless Scraping (Lightpanda) | **COMPLETE** ✅ | Direct BI API integration + Playwright fallback |
| 3 | LangGraph Agent Swarm — Core Reasoning | **COMPLETE** ✅ | 6 agents, consensus gate, API routers, and pytest validated |
| 4 | 3D Map Dashboard (Next.js + Mapbox + Deck.gl) | **COMPLETE** ✅ | Next.js 14 + Mapbox v3 + Deck.gl v9.3 dashboard with WebSocket streaming |
| 5 | Notifications & Human-in-the-Loop | **COMPLETE** ✅ | WhatsApp integration, route approvals table + endpoint, source health panel |
| 6 | Demo Polish & run_demo.py Finalization | **COMPLETE** ✅ | Offline fallback, pacing controls, mock DB seeding, and performance audit |
| 7 | Interactive Guided Demo Mode | **COMPLETE** ✅ | Guided stepper panel, mock agent fixture flow, presenter mobile remote, and local replay |
| 8 | NVIDIA Architecture Integration | **COMPLETE** ✅ | NIM gateway, cuOpt dynamic matrix, FourCastNet proactive polling |


---

## Key Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-05 | Pilot scope: North Sumatra corridor (Belawan + Trans-Sumatra Hwy) | Matches blueprint; synthetic data covers demo gap |
| 2026-07-05 | AI models: Gemini Flash (vision) + DeepSeek V3 (reasoning) | Cost-efficient; matches blueprint dual-model design |
| 2026-07-05 | Driver mobile app explicitly deferred to v2 | Engineering cost doesn't improve demo; WhatsApp deep-link is MVP replacement |
| 2026-07-05 | Solo developer, AI-assisted workflow | GSD tooling used throughout |
| 2026-07-05 | Phase 3 requires `/gsd-ai-integration-phase` before planning | 6-agent LangGraph swarm needs formal AI-SPEC design contract |
| 2026-07-12 | Implement `merge_messages` list reducer in `CrisisState` | Solves parallel LangGraph node write conflicts (InvalidUpdateError) |
| 2026-07-12 | Expand offline simulator mock data seeding and filtering | Enables 100% database/LTM coverage without requiring live credentials |
| 2026-07-17 | Fix Mapbox Draw initialization race condition in CrisisMap.tsx | Ensures robust drawing mode switching independently of map load latency |
| 2026-07-17 | Refactor FastAPI sys.path resolution in app/main.py | Ensures local uvicorn execution works seamlessly without PYTHONPATH configuration |

---

## Pre-existing Assets
- `src/01_data_prep.py` — PIHPS food price time-series cleaning + spline interpolation
- `src/02_lag_analysis.py` — lag correlation analysis (disasters → price spikes)
- `src/03_fsvi_pca.py` — feature selection / PCA for economic model
- `src/04_modeling.py` — predictive modeling (likely TFT or baseline regression)
- `src/05_generate_figures.ipynb` — visualization generation

These scripts validate the economic correlation hypotheses that underpin Agent 5 (Economic Intelligence Agent). They are research artifacts, not production code — but their outputs inform the LTM seeding and inflation forecast logic.

---

## Open Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| TomTom / AISstream API access (key provisioning) | HIGH | Request keys immediately in Phase 0 |
| Lightpanda scraping reliability (anti-bot) | MEDIUM | Maintain synthetic fallback dataset; test early in Phase 2 |
| GraphRAG cold start (empty graph on Day 1) | HIGH | Manual seed graph for North Sumatra before any demo |
| Solo dev bandwidth on 4-week timeline | HIGH | Use AI-assisted development aggressively; defer v2 features hard |
| Demo Wi-Fi reliability at hackathon | MEDIUM | `run_demo.py` must work fully offline with pre-loaded data |
