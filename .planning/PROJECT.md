# PROJECT: PreHub (Logistics Resilience Intelligence Platform)

**Active Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine [ACTIVE 🚀]
**Previous Milestones:** 
- M1 - Hackathon MVP (Pan-Sumatra Logistics & Swarm Intelligence) [COMPLETED ✅]
- M2 - PreHub Final Defense: Empirical Evaluation, Tactical HUD & Multi-Source Maturity [COMPLETED ✅]
- M3 - PreHub MVP Pilot Operations & Multi-Persona Dispatcher Platform [COMPLETED ✅]
- M4 - PreHub Pilot Hardening, E2E Audit Remediation & Multi-Tenant Operational Stability [COMPLETED ✅]

## Current Milestone: M5 - High-Fidelity Intelligence & Isolated Operations Engine

**Goal:** Address and eliminate 4 critical architectural bottlenecks identified in the system diagnostic: (1) Zero-token pre-LLM filtering and headline+lead text clamping for DeepSeek news classification; (2) Deterministic BMKG sensor cross-validation and raw `<think>` trace suppression in the Consensus Gate; (3) Street-snapped turn-by-turn road network routing via Mapbox Directions API (Free Tier) with forced tangential hazard avoidance waypoints; and (4) Strict state decoupling between ambient global hazard alerts and client-isolated routing sessions to permanently eliminate multi-user polyline collisions.

**Target features:**
- **Phase 83 (Zero-Token Pre-LLM Ingestion & DeepSeek Distillation Pipeline):**
  - DOM/HTML boilerplate & ad stripping before NLP processing.
  - Two-factor Sumatra crisis keyword & geographic anchor regex gating (dropping non-disaster news at 0 token cost).
  - Text clamping to headline + first 2 paragraphs ($\le 400$ chars, saving $>80\%$ of LLM prompt tokens).
  - Compact single-turn DeepSeek JSON classification prompt without `<think>` internal reasoning bloat.
- **Phase 84 (Deterministic BMKG Sensor Cross-Validation & Consensus Gate Hardening):**
  - Deterministic parameter cross-check matrix: spatial tolerance ($\Delta d \le 30\text{ km}$), temporal window ($\Delta t \le 6\text{ h}$), and physical sensor thresholds (radar rainfall $\ge 20\text{ mm/h}$, earthquake $M \ge 4.5$, marine waves $\ge 2.5\text{ m}$).
  - Explicit parameter matching ledger and confidence calibration formulation in `consensus_gate.py`.
  - Cap uncorroborated news claims at $\le 0.50$ (UNCONFIRMED) when physical sensor data is absent.
  - Strict suppression and stripping of raw `<think>...</think>` traces across all LLM inference outputs.
- **Phase 85 (Mapbox Directions API Turn-by-Turn Road Network & Tangential Hazard Avoidance):**
  - Mapbox Directions API Free Tier (`mapbox/driving` & `mapbox/driving-traffic`) integration with `geometries=geojson&overview=full&steps=true`.
  - OpenStreetMap one-way street rule compliance and road snapping.
  - Elimination of straight-line `densifyPath` chord distortion on live highway/arterial features.
  - Forced tangential avoidance waypoint engine ($R + 2\text{ km}$) for obstacle avoidance around hazard circles.
  - Ground-truth benchmark verification: Manhattan Times Square Medan -> USU route via Jl. Gatot Subroto -> Jl. Sunggal -> Jl. Setia Budi -> Jl. Dr. Mansyur.
- **Phase 86 (Client-Isolated Routing Session vs. Global Read-Only Environmental State):**
  - Strict two-layer state decoupling in `DashboardClient.tsx`: Global Shared State (read-only broadcast) vs Session-Local State (client-isolated).
  - URL query parameter binding (`?origin=...&dest=...&route=...`) and local React memory encapsulation.
  - WebSocket broadcast decoupling preventing `/ws/crisis/{id}` from overriding active client routes.
  - Multi-tab browser isolation verification preventing User A (Medan -> Belawan) from colliding with User B (Aceh -> Belawan).

## Milestones Overview
- **M1 - Pan-Sumatra Logistics & Swarm Intelligence MVP**: Completed (Phases 0 to 35). Shipped 6-agent swarm, Mapbox canvas, live news pipeline across 8 ANTARA bureaus, and 39 pytest tests.
- **M2 - PreHub Final Defense: Empirical Evaluation, Tactical HUD & Multi-Source Maturity**: Completed (Phases 36 to 41). Delivered ground-truth benchmark ($N=60$), 88-test matrix, mathematical consensus formula, Brier probability calibration, deterministic CPU routing, God's-Eye HUD telemetry, and sanitized UI.
- **M3 - PreHub MVP Pilot Operations & Multi-Persona Dispatcher Platform**: Completed (Phases 42 to 56). Delivered multi-role auth, self-serve fleet/CSV manifest ingestion, spoilage hedging economics, intermodal port synchronization, and anti-collision dock layouts.
- **M4 - PreHub Pilot Hardening, E2E Audit Remediation & Multi-Tenant Operational Stability**: Completed (Phases 57 to 82). Remediated all audit findings, locked corporate RBAC, ported live telemetry to GPU-instanced @deck.gl/mapbox MapboxOverlay (5,000+ units @ 60 FPS), resolved AIS/ADS-B ingestion bottlenecks, established canonical news permalinks, pure [lon, lat] coordinate graph snapping, simultaneous multi-color intermodal routing with Hold-vs-Reroute Spoilage Hedging economics, purged legacy mock Past/Future/Predict and Simulasi tabs, hardened authentic PIHPS analytics and Laporan audit ledger, eliminated telemetry OOM crashes, stabilized AIS vessel MMSI continuity with 96-vessel regional baseline, implemented 100% water-path coastal and estuary routing, delivered gazetteer search ranking and proximity deduplication, enforced token-derived tenant fleet scopes, and delivered master truck asset / travel ERP transaction split with migration 014.
- **M5 - High-Fidelity Intelligence & Isolated Operations Engine**: Active (Phases 83 to 86). Delivers zero-token pre-LLM filtering, deterministic BMKG cross-validation, street-snapped Mapbox turn-by-turn routing, and client-isolated session state.

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

## Success Metrics (Empirical M2/M4 Targets)
1. `< 15 minutes` from physical disruption to validated dashboard alert
2. `> 85%` alert precision verified on $N=60$ ground-truth benchmark dataset
3. `> 80%` alert recall verified on $N=60$ ground-truth benchmark dataset
4. `> 82%` F1-Score on disruption detection
5. Brier Score `≤ 0.10` indicating well-calibrated probability distributions
6. `> 15%` travel time savings for CPU-optimized detour routes vs blocked corridors
7. `216` automated unit, integration, and E2E tests passing with 100% reliability
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
- `.planning/ROADMAP.md` - Canonical phased deliverables and verification criteria
- `.planning/STATE.md` - Live project memory and active execution state
- `docs/README.md` - Architectural and scope invariants ledger
- `docs/Dokumen_Pendukung_PreHub.md` - Official PreHub Technical Document
- `LRIP Master Technical Blueprint (1).md` - Authoritative system design

---
*Last updated: 2026-10-18 after Phase 70 & 71 completion*
