# PROJECT: PreHub (Logistics Resilience Intelligence Platform)

**Active Milestone:** M2 - PreHub Final Defense: Empirical Evaluation, Tactical HUD & Multi-Source Maturity
**Previous Milestone:** M1 - Hackathon MVP (Pan-Sumatra Logistics & Swarm Intelligence) [COMPLETED]

## Current Milestone: M2 - PreHub Final Defense: Empirical Evaluation, Tactical HUD & Multi-Source Maturity

**Goal:** Address competition judge evaluations (Development Process score 5/10 and Idea Conformance score 3/10) by eliminating theoretical NVIDIA H100 GPU dependencies (cuOpt, FourCastNet), establishing empirical validation with ground-truth benchmark datasets and line/branch test coverage, deploying real transponder telemetry with a Tactical HUD inspired by gods-eye-view, calibrating probability distributions via genuine Brier Score computation, closing the feedback loop with operator decision traces and ground-truth field outcomes, and sanitizing the operator UI.

**Target features:**
- Ground-truth benchmark dataset (N=60 Sumatra scenarios) and automated empirical metric evaluation (Precision, Recall, F1, Latency)
- Pytest-cov automated line and branch coverage engine and test suite matrix documentation
- Mathematical consensus gate using formal probabilistic independence formulation
- Brier Score and Expected Calibration Error (ECE) probability calibration service
- CPU-based corridor routing (NetworkX + Google OR-Tools) with local road network cache
- Fused Open-Meteo numerical forecast and official BMKG warning weather service
- Closed-loop operator decision logging (ACCEPT, REJECT, OVERRIDE) and post-incident outcome engine (T+12h / T+24h)
- Real multi-modal telemetry ingestion (AISstream Redis, ADS-B cargo, dynamic truck GPS)
- Tactical HUD console (target locking reticle, bearing vectors, follow camera, monospaced telemetry cards, WebGL 60 FPS)
- Dedicated Evaluation and Benchmark dashboard tab with interactive reliability diagrams
- UI/UX minimalist operator-first sanitization (zero emojis, monochrome Lucide SVG icons, zero GPU boasting claims)

## Milestones Overview
- **M1 - Pan-Sumatra Logistics & Swarm Intelligence MVP**: Completed (Phases 0 to 35). Shipped multi-agent swarm, 4D Mapbox canvas, live news pipeline across 8 ANTARA bureaus, and 39 passing pytest tests.
- **M2 - PreHub Final Defense: Empirical Evaluation, Tactical HUD & Multi-Source Maturity**: Active (Phases 36 to 41). Establishing empirical rigor, deterministic CPU routing, real transponder telemetry, and closed-loop field outcome verification.

## Vision
An AI-powered decision support platform that shifts logistics and disaster response from **reactive** to **proactive**. PreHub ingests real-time physical hazard data (weather, traffic, maritime, wildfire), detects logistics disruptions, predicts cascading economic impacts (commodity price spikes), and delivers actionable intelligence to field coordinators and government executives, all before the crisis escalates.

The core differentiator is the **"TheoTown" Dual-Mode Engine**: a live sentinel in normal operations, and an interactive crisis simulation sandbox where decision-makers drop synthetic disasters onto a 3D map and watch the AI swarm compute reroutes and inflation forecasts in real time, powered by deterministic CPU-based corridor routing (NetworkX and Google OR-Tools) and open numerical weather fusion (Open-Meteo and BMKG).

## Milestone M2 Strategic Objectives
Milestone M2 directly addresses critical feedback from competition judges (Development Process score 5/10 and Idea/Software Conformance score 3/10):
1. **Zero GPU Cost & Honest Architecture:** Completely eliminate theoretical dependencies on NVIDIA H100 hardware (cuOpt and FourCastNet). Routing is consolidated on CPU-based NetworkX and Google OR-Tools with a local road network cache (`data/road_network_sumatra.json`). Weather prediction is grounded on Open-Meteo (ECMWF/GFS numerical models) fused with official BMKG alerts.
2. **Empirical Verification & Test Coverage:** Provide transparent, verifiable proof of engineering quality. Formalize all 39+ unit and integration tests into documented test matrices, integrate `pytest-cov` for line and branch coverage evidence, and evaluate system performance against a labeled ground-truth benchmark dataset ($N=60$ Sumatra disruption scenarios) for actual Precision, Recall, F1, and Detection Latency.
3. **Mathematical Consensus & Probability Calibration:** Align the Consensus Gate implementation with the formal probabilistic independence formula from the technical document:
   $$P_{\text{disruption}}(s) = 1 - \prod_{k} (1 - w_k \cdot p_k(s))$$
   Build a genuine probability calibration engine calculating Brier Score, Expected Calibration Error (ECE), and Platt Scaling / Isotonic Regression to eliminate arbitrary hardcoded multipliers.
4. **Closed-Loop Feedback & Ground-Truth Outcomes:** Extend operator action tracking (ACCEPT, REJECT, OVERRIDE) and build a field outcome verification endpoint (`POST /api/v1/outcomes`) to record real ground-truth conditions at $T+12\text{h}$ or $T+24\text{h}$, completing the operational feedback loop.
5. **Tactical Telemetry & God's-Eye HUD Console:** Upgrade multi-modal fleet tracking using real transponder data structures (AISstream maritime transponders from Redis cache, ADS-B cargo flight streams, and dynamic truck GPS interpolation). Implement a tactical HUD inspired by `gods-eye-view` with target locking reticles, bearing vectors, follow-camera controls, and monospaced telemetry cards rendered in native WebGL at 60 FPS.
6. **Dedicated Evaluation Dashboard & UI Sanitization:** Add an `EVALUATION` dashboard tab presenting empirical benchmark charts, reliability diagrams, and test suite breakdowns. Sanitize the user interface to adhere strictly to an operator-first aesthetic: zero emojis (monochrome Lucide SVG icons only), zero boasting language, and zero fictional GPU claims.

## Problem Statement
Indonesia's logistics network is uniquely fragile. A single physical shock (a flooded bridge on the Trans-Sumatra Highway, port congestion at Belawan) creates a domino effect: traffic, commodity shortages, and eventually localized inflation. Decision-makers currently have no way to "see the math" behind these failures before prices surge. Monitoring is fragmented across weather apps, GPS tools, and manual social media trawls.

## Target Users
- **Operations Coordinators** (Fleet Managers, NGO Coordinators, Port Ops): Real-time alerts, alternative routing, immediate execution.
- **Strategic Decision Makers** (BPBD/BNPB Leadership, Ministry Executives, Supply Chain Directors): Macro resilience, resource allocation, crisis simulation, inflation mitigation.

## Tech Stack
- **Backend:** FastAPI (Python) - high-throughput webhook and REST API gateway
- **Agent Orchestration:** LangGraph - stateful multi-agent cognitive swarm (6 specialized agents)
- **Frontend:** Next.js 14 + Mapbox GL JS + Deck.gl - 3D crisis map and Tactical HUD
- **Database (Supabase):**
  - PostgreSQL / PostGIS - geospatial intersection calculations and administrative boundaries
  - TimescaleDB - high-frequency time-series (prices, traffic velocity)
  - pgvector - Long-Term Memory (LTM) semantic storage for historical disaster episodes
- **Event Bus:** Redis Streams - zero-loss telemetry ingestion; Redis KV - Short-Term Memory (STM) for active crisis state
- **AI Models & Fallbacks:** Gemini 1.5 Flash (vision and entity extraction) + DeepSeek V3 / OpenRouter (reasoning) with deterministic local fallback algorithms
- **Routing Engine:** NetworkX Dijkstra / A* + Google OR-Tools (CPU VRP Solver) with local road network cache (`data/road_network_sumatra.json`). Sub-second latency (<150 ms) on standard CPU hardware with zero cloud licensing cost.
- **Weather Prediction:** Fused Open-Meteo API (ECMWF/GFS numerical forecast models) + BMKG API (official warnings and radar). Free, high-resolution hourly predictions requiring zero GPU hardware.
- **Telemetry Ingestion:** Redis Streams consumer for live AISstream.io maritime data, ADS-B cargo aviation, and dynamic fleet GPS interpolation.
- **Testing & Coverage:** Pytest + pytest-cov + .coveragerc for line and branch coverage verification.
- **Headless Scraping & OSINT:** Lightpanda and RSS parsers for PIHPS, LKBN ANTARA (8 provincial bureaus), and authoritative news verification.
- **Notifications:** WhatsApp Business API (validated crisis alert delivery)
- **Knowledge Graph:** GraphRAG over entity graph (Ports -> Routes -> Warehouses -> Commodities)

## External API Dependencies
| API | Role | Status |
|-----|------|--------|
| BMKG | Official ground-truth weather and seismic alerts | Integrated |
| Open-Meteo | High-resolution numerical weather forecasts (ECMWF/GFS) | Integrated (replaces FourCastNet, zero GPU cost) |
| Google OR-Tools & NetworkX | CPU-based corridor VRP and detour optimization | Integrated with local road graph cache (replaces cuOpt) |
| Gemini 1.5 Flash / OpenRouter | Swarm NLP and structured entity extraction | Integrated with local deterministic fallbacks |
| TomTom Traffic | Flow and congestion detection on arterial corridors | Integrated |
| AISstream.io | Real-time maritime transponder stream (Redis) | Integrated |
| OpenSky Network | Cargo aviation transponder data | Integrated |
| NASA FIRMS | Wildfire and thermal anomaly polygons | Integrated |
| PIHPS (Bank Indonesia) | Official regional commodity price baseline | Integrated |
| LKBN ANTARA (8 Bureaus) | Authoritative regional press feeds across Sumatra | Integrated |
| Mapbox GL JS | 3D vector map rendering and Directions API | Integrated |

## Operational Scope: Pan-Sumatra Island-Wide Logistics & Early Warning
- **Geographic Scope (Pan-Sumatra):** Full island-wide coverage across all 8 mainland Sumatra provinces:
  - **Sumatera Utara:** Belawan Port, KEK Kuala Tanjung, Sibolga, Kualanamu Cargo, Tol Belmera & Tol MKTT.
  - **Sumatera Barat:** Teluk Bayur Port, Sitinjau Lauik KM 22, Solok, Padang, Bukittinggi.
  - **Riau:** Dumai Port (CPO & Food Terminal), Tol Pekanbaru-Dumai, SSK II Airport.
  - **Aceh:** Malahayati Port (Krueng Raya), Banda Aceh, Lhokseumawe, Langsa.
  - **Sumatera Selatan:** Boom Baru Port (Sungai Musi), Palembang, Tol Kayuagung-Palembang.
  - **Lampung:** Panjang Container Port, Bakauheni Ferry Gateway (Java-Sumatra supply link), Tol Bakauheni-Terbanggi Besar.
  - **Jambi & Bengkulu:** Talang Duku River Port, Pulau Baai Seaport, and trans-provincial connectors.
- **Corridor Networks:**
  - **Arterial Highways:** Jalan Lintas Timur (Jalintim), Jalan Lintas Barat (Jalinbar), Jalan Lintas Tengah (Jalinteng), and Jalinsum.
  - **Toll Road Network:** Jalan Tol Trans Sumatera (JTTS).
  - **Coastal Maritime & Air Cargo:** ALKI fairways along Malacca Strait & Indian Ocean + regional cargo airports.
- **Multi-Outlet News & Early Warning Ingestion:**
  - **Tier 1 Official:** 8 LKBN ANTARA regional bureaus (*Sumut, Sumbar, Riau, Aceh, Sumsel, Lampung, Jambi, Bengkulu*), ANTARA Ekonomi, BMKG, and BNPB.
  - **Tier 2 Authoritative Press:** CNN Indonesia, CNBC Indonesia Market, and targeted regional logistics queries.
  - **Autonomous Early Warning Trigger:** Critical road/port closures automatically dispatch background tasks to the 6-agent swarm with deduplication.
- **Real & Live Data Integration:** Live XML RSS news feeds, Open-Meteo & BMKG weather, TomTom traffic flow, and PIHPS price volatility stream.
- **Deferred to v2:** Driver mobile application (WatermelonDB/CRDT offline sync), self-serve third-party operator onboarding SDK.

## Success Metrics (Empirical M2 Targets)
1. `< 15 minutes` from physical disruption to validated dashboard alert
2. `> 85%` alert precision verified on $N=60$ ground-truth benchmark dataset
3. `> 80%` alert recall verified on $N=60$ ground-truth benchmark dataset
4. `> 82%` F1-Score on disruption detection
5. Brier Score `≤ 0.10` indicating well-calibrated probability distributions
6. `> 15%` travel time savings for CPU-optimized detour routes vs blocked corridors
7. `39+` automated unit and integration tests passing with documented line/branch coverage
8. `0 GPU` hardware requirement: 100% operational on standard CPU compute

## Business Model
- **B2G SaaS:** Dashboard licensing to BNPB, Kemendag, Bappenas, provincial governments
- **B2B API:** Route optimization alert subscriptions for logistics operators (JNE, SiCepat)
- **Tiers:** Freemium (monitoring maps) -> Professional (AI Copilot + routing) -> Enterprise/Government (full GraphRAG + simulation modules)

## Team
- Solo developer, AI-assisted development
- Mode: GSD disciplined agile delivery

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check: still the right priority?
3. Audit Out of Scope: reasons still valid?
4. Update Context with current state

## Context Files
- `C:\Users\VICTUS\.gemini\antigravity\brain\71230b73-0111-4d44-a02a-ff99c549ac69\implementation_plan.md` - M2 Master Implementation Plan
- `docs/Dokumen_Pendukung_PreHub.md` - Official PreHub Technical Document
- `LRIP Master Technical Blueprint (1).md` - Authoritative system design
- `ide-2-v2.md` - TheoTown dual-mode engine spec

---
*Last updated: 2026-09-22 after Milestone M2 initialization*
