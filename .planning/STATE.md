# STATE — LRIP / PetaNadi Project Memory

**Last Updated:** 2026-07-23
**Active Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)
**Current Phase:** Phase 24 COMPLETE ✅

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
| 9 | Responsive Layout & Stitch Screens Integration | **COMPLETE** ✅ | Desktop scaling fix, ported all remaining Stitch spec UI screens |
| 10 | Dockerization & Repository Cleanup | **COMPLETE** ✅ | Added multi-stage Dockerfiles and compose orchestration, cleaned root directory |
| 11 | Proposal Migration & Dynamic UI Integration | **COMPLETE** ✅ | Connected all static frontend views (Analytics, Simulation, Reports) and updated consensus gate validation |
| 12 | Backend Demo Engine & AI Advisor Localization | **COMPLETE** ✅ | Fixed API 500/404 demo runner, Indonesian prompt for Gemini Advisor, and PDF report generator |
| 13 | Mapbox/Deck.gl Spatiotemporal Layers & Drawing Tool | **COMPLETE** ✅ | Fixed 3D globe node anchor, Drawing Mode event listener & pen cursor, and smooth corridor route polylines |
| 14 | Pure Agentic Hazard Avoidance Router & Clean Slate Node Selection | **COMPLETE** ✅ | Forced-waypoint Mapbox engine (not hint), 18 real OSM road nodes replacing math offsets, segment-aware intersection detection with 2 km danger buffer, clean slate node selection |
| 15 | Google Maps-Grade Multi-Alternative AI Routing, On-Map Interactivity & Modality Intelligence | **COMPLETE** ✅ | 3 Mapbox alternative routes, on-map clickable route selection, `(Best)` auto modality tab, traffic congestion colors, dynamic incident-click routing, multi-leg intermodal chain display |
| 16 | Live API Ingestion, Corridor Context Aggregator & AI CoT Prompt Injection | **COMPLETE** ✅ | BMKG, TomTom, PIHPS multi-source aggregator `get_corridor_context()`, Supabase data_sources sync, AI CoT 3-part prompt engineering, left sidebar live inflation binding, live Mapbox weather & traffic overlay badges |
| 17 | TomTom Segment Traffic Colors, NVIDIA FourCastNet Regional Weather Coverage & NVIDIA cuOpt Routing Synchronization | **COMPLETE** ✅ | TomTom segment-level flow lines (Google Maps style: red/yellow/green) + live incident markers, BMKG + NVIDIA FourCastNet (Earth-2) spatial weather multi-polygons, NVIDIA cuOpt GPU dynamic cost matrix synchronization |
| 18 | Map UI/UX Refactoring, Unified Telemetry HUD & Localized Weather Animations | **COMPLETE** ✅ | WebGL canvas delay repaint fix, full-bleed GPU transform overlays, pointer event pass-through, contextual spatial node offsets |
| 19 | Differentiated Multi-Hazard Map Layers, Time Horizon Engine & Lightpanda OSINT Integration | **COMPLETE** ✅ | Flood water inundation, earthquake concentric shockwaves & fault lines, past/present/future/predict time engine, OSINT bridge |
| 20 | Real District Logistics Boundaries, Non-Colliding Spatial GIS Layout & UI UX Pro Max Refactor | **COMPLETE** ✅ | Real district GeoJSON polygons, interactive boundary hover highlight, HUD repositioning, compact glassmorphic badges |
| 21 | Full Integration Audit, Organic Hazard Geometries & Live BMKG/OSINT Incident Spatiotemporal Engine | **COMPLETE** ✅ | Algorithmic organic geometries (`incident_geometry_service.py`), BMKG startup poller in `lifespan()`, `GET /osint/live` endpoint, zero hardcoded rectangular boxes |
| 22 | Google Maps-Grade Administrative Boundary Integration & Clean UI Refactor | **COMPLETE** ✅ | Google Maps style dashed ADM stroke (`line-dasharray: [4, 3]`), top nav telemetry flyout popovers, off-canvas incident detail, unified epicenter-boundary entity |
| 23 | Run Demo Engine Overhaul — Interactive Stepper & Hook Lift | **COMPLETE** ✅ | Fixed CSS pointer-events inheritance, lifted `useDemoState` hook to `DashboardClient`, stage-wired map & sidebar effects, Lucide SVG icons |
| 24 | Google Flow-Style Onboarding Landing Page & High-Performance Routing | **COMPLETE** ✅ | Video background, 121-frame scroll sequence canvas, kinetic typography, feature cards, Next.js routing migration |

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
| 2026-07-18 | Port remaining Stitch screens as local overlay components in DashboardClient | Avoids full router navigation, keeps state and WebSocket connection alive in memory |
| 2026-07-18 | Use absolute coordinate constraints on main viewport | Resolves desktop layout cropping across variable monitor resolutions |
| 2026-07-18 | Dockerize services and organize root repository files | Simplifies local staging/deployment and removes clutter |
| 2026-07-19 | Establish Phase 11 for Proposal 2 Migration | Aligns project requirements with the Stage 2 Submission specifications, resolving static components |
| 2026-07-21 | Phase 14: Pure Agentic Tangential Avoidance Router & Clean Slate Node Selection | Eliminate hardcoded detour coordinates, implement dynamic tangential vector clearance ($R+2\text{km}$), clean-slate node selection, XAI CoT blocks |
| 2026-07-22 | Phase 14 Iteration 2: Forced Waypoint Engine | Mapbox silently ignores waypoints passed as hints; fix by encoding mandatory 3-stop URL (`origin;waypoint;dest`) — Mapbox must route through all three |
| 2026-07-22 | Phase 14 Iteration 3: Real OSM Road Node Database | Perpendicular math offsets produce coordinates in fields/water; replace with 18 verified OSM arterial intersection nodes scored by detour cost `dist(O→node) + dist(node→D)` |
| 2026-07-22 | Phase 14 Iteration 4: Segment-Aware Hazard Detection with Danger Buffer | Point-only check misses sparse Mapbox polylines that skip over a hazard; fix with segment closest-point projection + 2 km danger buffer to match visual circle |
| 2026-07-23 | Phase 18: Map UI/UX Refactoring & Spatial Pass-Through | Full-bleed map canvas + pointer-events-none overlay wrappers + contextual node coordinate offsets prevent element overlap |
| 2026-07-23 | Phase 19: Time Horizon Engine & Differentiated Hazard Styling | Dynamic API dataset switching per mode (`PAST | PRESENT | FUTURE | PREDICT`) + custom spatiotemporal Mapbox layer paint properties |
| 2026-07-23 | Phase 20: Operations HUD Repositioning & Glassmorphism 2.0 | Reposition HUD to top-right corner to clear Belawan & Medan Hub nodes; replace multi-line text boxes with Lucide SVG compact badges |
| 2026-07-23 | Phase 21: Organic GeoJSON Geometry Service & Startup Poller | Replace hardcoded 4 rectangular boxes with `incident_geometry_service.py` mathematical generators; poll BMKG inside FastAPI `lifespan()` |
| 2026-07-23 | Phase 22: Google Maps ADM Dashed Stroke & Clean Off-Canvas UI | Google Maps style dashed line stroke (`line-dasharray: [4, 3]`), top nav telemetry flyout popovers, off-canvas incident detail panel, unified pin-boundary entity |

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
