# STATE — LRIP / PetaNadi Project Memory

**Last Updated:** 2026-07-05
**Active Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)
**Current Phase:** Phase 1 complete ✅ — run `/gsd-plan-phase 2` to plan OSINT & Scraping

---

## Workflow Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Foundation & Repo Setup | **COMPLETE** ✅ | Git: `f404517`, `4f48e8e` |
| 1 | Data Ingestion Pipeline & API Adapters | **COMPLETE** ✅ | Git: `a33c94c` |
| 2 | OSINT & Headless Scraping (Lightpanda) | TODO | |
| 3 | LangGraph Agent Swarm — Core Reasoning | TODO | **Requires AI-SPEC** — run `/gsd-ai-integration-phase 3` before planning |
| 4 | 3D Map Dashboard (Next.js + Mapbox + Deck.gl) | TODO | |
| 5 | Notifications & Human-in-the-Loop | TODO | |
| 6 | Demo Polish & run_demo.py Finalization | TODO | |

---

## Key Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-05 | Pilot scope: North Sumatra corridor (Belawan + Trans-Sumatra Hwy) | Matches blueprint; synthetic data covers demo gap |
| 2026-07-05 | AI models: Gemini Flash (vision) + DeepSeek V3 (reasoning) | Cost-efficient; matches blueprint dual-model design |
| 2026-07-05 | Driver mobile app explicitly deferred to v2 | Engineering cost doesn't improve demo; WhatsApp deep-link is MVP replacement |
| 2026-07-05 | Solo developer, AI-assisted workflow | GSD tooling used throughout |
| 2026-07-05 | Phase 3 requires `/gsd-ai-integration-phase` before planning | 6-agent LangGraph swarm needs formal AI-SPEC design contract |

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
