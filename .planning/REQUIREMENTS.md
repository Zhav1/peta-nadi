# REQUIREMENTS: PreHub Logistics Resilience Intelligence Platform

**Active Milestone:** M2 - PreHub Final Defense: Empirical Evaluation, Tactical HUD & Multi-Source Maturity
**Previous Milestone:** M1 - Hackathon MVP (Pan-Sumatra Logistics & Swarm Intelligence) [COMPLETED]

---

## Milestone M1: Core Functional Requirements (Completed Baseline)

### FR-1: Data Ingestion Pipeline
- **FR-1.1** Ingest live BMKG weather alerts and earthquake notifications via API polling (Ground Truth / Seismic Baseline)
- **FR-1.2** Ingest TomTom Traffic API data for congestion detection on monitored corridors
- **FR-1.3** Ingest AISstream.io data for maritime vessel positions and Belawan port congestion
- **FR-1.4** Ingest NASA FIRMS active fire polygon data for wildfire hazard detection
- **FR-1.5** All ingested events must be published to Redis Streams (the central event bus)
- **FR-1.6** Each data source adapter must implement a last-known-good cache (configurable TTL: 15min traffic, 1hr weather) and flag degraded sources

### FR-2: OSINT & Headless Scraping
- **FR-2.1** Scrape PIHPS (government commodity price database) for baseline and spike detection
- **FR-2.2** Scrape Tokopedia/Shopee for real-time market price comparison (via Lightpanda)
- **FR-2.3** In Crisis Mode: shift scraping frequency from daily to 15-minute intervals
- **FR-2.4** Social OSINT: scrape TikTok iFrame embeds and Twitter/X for citizen-reported ground-truth

### FR-3: The 6-Agent Cognitive Swarm (LangGraph)
- **FR-3.1** Agent 1 - Data Collection Agent: normalize, validate, and route ingested data
- **FR-3.2** Agent 2 - OSINT & Hazard Agent: NER-based location extraction from unstructured text, geocode, and map to PostGIS
- **FR-3.3** Agent 3 - Prediction Agent: multi-horizon macro-forecast (6h / 12h / 24h / 48h) via Open-Meteo numerical weather models (ECMWF/GFS) and BMKG warnings
- **FR-3.4** Agent 4 - Route Optimization Agent: generate alternative routes. Compute cost matrix using NetworkX Dijkstra / A* and solve multi-agent VRP constraints using Google OR-Tools (CPU-based)
- **FR-3.5** Agent 5 - Economic Intelligence Agent: detect PIHPS anomalies, generate inflation forecasts with LTM historical multipliers
- **FR-3.6** Agent 6 - Decision Support Copilot: synthesize all agent outputs into executive summaries and actionable recommendations
- **FR-3.7** All agents share state via LangGraph `MemorySaver` (Redis STM); validated crises published to PostgreSQL
- **FR-3.8** Consensus Gate: alert promoted to "Validated" only when weighted confidence > 85%
- **FR-3.9** High Availability Engine: LLM invocations wrap behind a try/except router with Gemini 1.5 Flash primary and DeepSeek/OpenRouter secondary with deterministic local fallbacks

### FR-4: GraphRAG Knowledge Graph
- **FR-4.1** Seed knowledge graph with Sumatra corridor entities: ports, arterial highways, toll networks, warehouses, commodity flows
- **FR-4.2** Entity types: Ports, Routes, Warehouses, Suppliers, Commodities; relationships: Depends On, Ships Via, Located In
- **FR-4.3** Graph traversal: given a disruption event, find all downstream dependency chains
- **FR-4.4** Combine graph traversal with pgvector semantic search (SOPs, historical playbooks)
- **FR-4.5** Explainability output: structured causal chain (disruption -> delayed supply -> affected warehouses -> price impact estimate)

### FR-5: Dual-Mode Engine
- **FR-5.1 (Passive Mode):** Continuous 24/7 monitoring; polling at normal API rates; anomaly detection and flagging
- **FR-5.2 (Crisis Simulation Mode):** User can inject a synthetic disaster polygon onto the map; system enters Crisis Mode immediately
- **FR-5.3** Crisis Mode triggers: Lightpanda scraping shifts to 15-minute intervals; swarm runs full analysis pipeline
- **FR-5.4** `run_demo.py`: deterministic script that injects synthetic anomalies into Redis Streams for demo reliability

### FR-6: Real-Time Map UI (3D Dashboard)
- **FR-6.1** Mapbox GL JS + Deck.gl rendering: flight paths, maritime vectors, TomTom congestion overlays, NASA fire heatmaps, and administrative boundaries at 60 FPS
- **FR-6.2** Crisis pins on map; click to expand Tri-Panel Sidebar
- **FR-6.3 Sidebar Tab 1 - Evidence:** Raw data used by swarm (ANTARA news dispatch, TomTom delay graph, BMKG warning)
- **FR-6.4 Sidebar Tab 2 - Mitigation Detour:** Alternative route polyline on map with travel time comparison
- **FR-6.5 Sidebar Tab 3 - Economic Fallout:** PIHPS/market price graphs + inflation arc forecast
- **FR-6.6** Timeline Scrubber: playback bar to rewind and replay how a crisis unfolded hour-by-hour
- **FR-6.7** "Simulate Disaster" UI: polygon drawing tool to trigger Crisis Mode
- **FR-6.8** Data freshness badges: "Last Updated: X min ago" and source health indicators for every data layer
- **FR-6.9** Glassmorphism design: dark mode, high contrast, smooth animated state transitions

### FR-7: Alert & Notification Delivery
- **FR-7.1** Validated alerts (> 85% consensus) trigger WhatsApp Business API push notifications
- **FR-7.2** Only "Validated" alerts generate notifications; "Unconfirmed" anomalies are dashboard-only
- **FR-7.3** Notification content: disruption summary, recommended action, and dashboard deep-link

### FR-8: Human-in-the-Loop Logging
- **FR-8.1** When operator clicks "Approve" on a route recommendation, log: timestamp, recommended route, operator ID
- **FR-8.2** Approval log is queryable for KPI measurement (route acceptance rate metric)

### FR-9: Demo Script & Guided Walkthrough
- **FR-9.1** `run_demo.py` and `GuidedDemoPanel` runnable with a single click, executing full 5-stage pipeline in < 3 minutes
- **FR-9.2** Synthetic dataset: North Sumatra corridor, Belawan Port closure scenario + Trans-Sumatra flooding + cooking oil supply shock

---

## Milestone M2: Final Defense & Empirical Evaluation Requirements

### FR-10: Ground-Truth Benchmark Dataset & Automated Test Coverage Engine (Phase 36)
- **FR-10.1 Ground-Truth Benchmark Dataset:** Build a standardized benchmark dataset containing $N=60$ labeled disruption scenarios across Sumatra corridors (`data/benchmark/sumatra_disruptions_ground_truth.json`). Each scenario records multi-sensor parameters (BMKG weather radar, Open-Meteo precipitation, TomTom speed ratio/delay, OSINT text claims) paired with empirical ground-truth labels: binary disruption ($y \in \{0, 1\}$), actual delay duration (hours), and observed market price deviation (%).
- **FR-10.2 Empirical Metric Evaluation Engine:** Create `scripts/evaluate_metrics.py` to evaluate backend anomaly detection against the ground-truth benchmark, calculating Precision, Recall, F1-Score, False-Positive Rate (FPR), and Detection Latency deterministically.
- **FR-10.3 Test Coverage Engine:** Integrate `pytest-cov` and formalize backend `.coveragerc` to enforce and document line and branch coverage across core packages (`backend/app` and `agents`).
- **FR-10.4 Test Suite Matrix Documentation:** Produce a structured test inventory documenting all 39+ unit and integration tests (test ID, target module, scenario description, pass/fail status, execution duration).

### FR-11: Mathematical Consensus Formulation, Probability Calibration & CPU Routing Consolidation (Phase 37)
- **FR-11.1 Probabilistic Consensus Independence Formula:** Refactor `agents/tools/consensus_gate.py` to replace linear sum heuristics with the proposal's formal probabilistic independence equation:
  $$P_{\text{disruption}}(s) = 1 - \prod_{k} (1 - w_k \cdot p_k(s))$$
  incorporating exponential time decay ($\lambda = 0.05/\text{hour}$) and inverse distance spatial decay ($w_k(d) = e^{-d / d_0}$).
- **FR-11.2 Independent Sensor Decoupling:** Strictly decouple external sensor evidence from internal agent outputs. Derived routing recommendations must not be counted as independent sensor votes in the consensus gate.
- **FR-11.3 Probability Calibration Service:** Implement `backend/app/services/probability_calibration.py` calculating empirical Brier Score ($BS = \frac{1}{N}\sum (f_i - o_i)^2$) and Expected Calibration Error (ECE). Provide Platt Scaling and Isotonic Regression transforms to calibrate raw model scores into statistically sound probabilities.
- **FR-11.4 CPU Routing Engine Consolidation:** Replace mock cuOpt GPU calls with a deterministic CPU solver uniting NetworkX Dijkstra / A* and Google OR-Tools VRP, backed by local road network cache (`data/road_network_sumatra.json`). Solves 50-node routing problems in <150 ms without GPU or cloud API dependency.
- **FR-11.5 Weather Fusion Service Standardization:** Formalize `backend/app/services/weather_fusion_service.py` to consume Open-Meteo API numerical weather models (ECMWF/GFS) and BMKG warnings with zero GPU dependency.

### FR-12: Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine (Phase 38)
- **FR-12.1 Extended Operator Decision Audit Log:** Expand `backend/app/routers/approvals.py` to record multi-action operator responses: action type (`ACCEPT`, `REJECT`, `OVERRIDE`), mitigation option (`CONTINUE`, `REROUTE`, `HOLD`), operator identity, reason notes, and customized route constraints.
- **FR-12.2 Post-Incident Outcome Engine:** Implement `POST /api/v1/outcomes` and `GET /api/v1/outcomes` to log verified ground-truth conditions at $T+12\text{h}$ and $T+24\text{h}$ post-incident (actual road clearance time, observed delay, actual commodity price shift).
- **FR-12.3 Closed-Loop Validation & Recalibration:** Provide comparison analytics matching predicted impact vs observed field outcome to compute prediction accuracy and supply feedback for dynamic consensus weight recalibration.
- **FR-12.4 Resilient Local Persistence:** Implement local storage fallback (SQLite / JSON) ensuring decision traces and field outcomes persist even when Supabase cloud connectivity is offline.

### FR-13: Tactical Multi-Modal Telemetry & God's-Eye HUD Console (Phase 39)
- **FR-13.1 Real Multi-Modal Telemetry Ingestion:** Connect `backend/app/routers/vehicles_router.py` to live data streams: maritime AISstream from Redis cache, cargo aviation ADS-B transponders, and dynamic truck GPS coordinate streams.
- **FR-13.2 God's-Eye Tactical HUD (`FleetVehicleLayer.tsx`):**
  - Crosshair target-locking reticle on selected vehicle or vessel with dynamic focus bracket.
  - Bearing vectors projecting forward velocity and azimuth heading angle ($0^\circ\text{--}360^\circ$).
  - Target Follow Camera mode locking the viewport to track moving assets across the terrain.
  - Monospaced tactical telemetry cards displaying callsign, MMSI/ICAO24, speed (knots / km/h), heading, cargo commodity, cold chain status, and ingestion latency.
  - Historical breadcrumb trail polylines visualizing traveled route segments.
- **FR-13.3 Native WebGL Rendering Optimization:** Eliminate all DOM element markers on vehicle layer; render 100% via Mapbox GL JS WebGL layers at stable 60 FPS without layout thrashing.

### FR-14: Dedicated Evaluation & Benchmark Dashboard (Phase 40)
- **FR-14.1 Full Navigation Access:** Activate navigation tabs (`ANALYTICS`, `SIMULATION`, `REPORTS`) ensuring seamless routing without component regressions.
- **FR-14.2 Dedicated Evaluation Tab (`EvaluationSection.tsx`):**
  - Empirical Performance Cards: Live display of Precision (>85%), Recall (>80%), F1 (>82%), Brier Score (<=0.10), and Detection Latency (<15 min).
  - Reliability Diagram: Interactive chart plotting predicted probability bins against observed empirical event frequencies.
  - Test Suite Matrix & Coverage: Visual summary of 39+ unit and integration tests passing with per-module line/branch coverage percentages.
  - Route Efficiency Benchmark: Cost and time savings comparison showing CPU solver performance vs congested baseline routes.
  - Closed-Loop Decision Audit: Log table tracking operator decisions, predicted outcomes, and verified field reality.

### FR-15: UI/UX Minimalist Sanitization & Technical Report Finalization (Phase 41)
- **FR-15.1 Non-AI Minimalist UI Sanitization:** Remove all emoji characters from UI code and buttons; replace with clean, monochrome Lucide SVG icons.
- **FR-15.2 Boasting & GPU Slop Elimination:** Strip all exaggerated text, buzzwords, and fictional GPU/cuOpt badges from dashboard cards and headers (e.g., replace "NVIDIA FourCastNet DGX AI Forecast" with "Model Cuaca Open-Meteo & BMKG").
- **FR-15.3 Technical Document Finalization:** Update `docs/Dokumen_Pendukung_PreHub.md` and docx generator script to incorporate complete test case inventory, coverage tables, empirical benchmark evaluation metrics, and the honest CPU/Open-Meteo/OR-Tools architecture.

---

## Non-Functional Requirements

| ID | Requirement | Metric / Target |
|----|-------------|-----------------|
| NFR-1 | Alert Detection Latency | < 15 minutes from physical event to validated dashboard alert |
| NFR-2 | Alert Precision | > 85% false alarm suppression verified against benchmark dataset |
| NFR-3 | Alert Recall | > 80% disruption recall on ground-truth benchmark |
| NFR-4 | Probability Calibration | Brier Score <= 0.10 on labeled benchmark evaluation |
| NFR-5 | CPU Routing Latency | < 150 ms for 50-node VRP / detour calculation on standard CPU |
| NFR-6 | Map UI Rendering Performance | Stable 60 FPS WebGL rendering with zero marker DOM thrashing |
| NFR-7 | Zero GPU Cost | 100% operational on CPU compute; zero requirement for NVIDIA H100 GPU |
| NFR-8 | High Availability & Offline Resilience | Redis STM preserves crisis state; local fallback for decision logs when cloud is offline |
| NFR-9 | Test Suite Rigor | 39+ tests passing with automated line/branch coverage engine |
| NFR-10 | Operator UI Usability | Strict minimalist operator-first design (no emojis, monochrome Lucide SVG, monospaced data) |

---

## Out of Scope (Milestone M2)
- Driver mobile application native build (WatermelonDB + CRDT offline sync) -> Deferred to v2
- Self-serve commercial logistics company GPS onboarding portal -> Deferred to v2
- Hardware GPU acceleration clusters (NVIDIA H100 / DGX Cloud) -> Excluded by design (zero GPU cost architecture)
- Automated drone delivery dispatch -> Deferred to v2

---

## Traceability

Which phases cover which Milestone M2 requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FR-10.1 (Ground-Truth Benchmark Dataset N=60) | Phase 36 | Pending |
| FR-10.2 (Empirical Metric Evaluation Engine) | Phase 36 | Pending |
| FR-10.3 (Test Coverage Engine pytest-cov) | Phase 36 | Pending |
| FR-10.4 (Test Suite Matrix Documentation) | Phase 36 | Pending |
| FR-11.1 (Probabilistic Consensus Independence Formula) | Phase 37 | Pending |
| FR-11.2 (Independent Sensor Decoupling) | Phase 37 | Pending |
| FR-11.3 (Probability Calibration Service & Brier Score) | Phase 37 | Pending |
| FR-11.4 (CPU Routing Engine Consolidation NetworkX / OR-Tools) | Phase 37 | Pending |
| FR-11.5 (Weather Fusion Service Standardization Open-Meteo / BMKG) | Phase 37 | Pending |
| FR-12.1 (Extended Operator Decision Audit Log) | Phase 38 | Pending |
| FR-12.2 (Post-Incident Outcome Engine T+12h/T+24h) | Phase 38 | Pending |
| FR-12.3 (Closed-Loop Validation & Recalibration) | Phase 38 | Pending |
| FR-12.4 (Resilient Local Persistence Fallback) | Phase 38 | Pending |
| FR-13.1 (Real Multi-Modal Telemetry Ingestion) | Phase 39 | Pending |
| FR-13.2 (God's-Eye Tactical HUD Console) | Phase 39 | Pending |
| FR-13.3 (Native WebGL Rendering Optimization) | Phase 39 | Pending |
| FR-14.1 (Full Navigation Access Activation) | Phase 40 | Pending |
| FR-14.2 (Dedicated Evaluation Tab EvaluationSection) | Phase 40 | Pending |
| FR-15.1 (Non-AI Minimalist UI Sanitization) | Phase 41 | Pending |
| FR-15.2 (Boasting & GPU Slop Elimination) | Phase 41 | Pending |
| FR-15.3 (Technical Document Finalization) | Phase 41 | Pending |
| NFR-1 (Alert Detection Latency < 15 min) | Phase 40 | Pending |
| NFR-2 (Alert Precision > 85%) | Phase 36 | Pending |
| NFR-3 (Alert Recall > 80%) | Phase 36 | Pending |
| NFR-4 (Probability Calibration Brier <= 0.10) | Phase 37 | Pending |
| NFR-5 (CPU Routing Latency < 150 ms) | Phase 37 | Pending |
| NFR-6 (Map UI WebGL 60 FPS) | Phase 39 | Pending |
| NFR-7 (Zero GPU Cost Architecture) | Phase 37 | Pending |
| NFR-8 (High Availability & Offline Resilience) | Phase 38 | Pending |
| NFR-9 (Test Suite Rigor 39+ Tests & Coverage) | Phase 36 | Pending |
| NFR-10 (Operator UI Usability & Zero Slop) | Phase 41 | Pending |

**Coverage:**
- Milestone M2 requirements: 21 functional, 10 non-functional (31 total)
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-09-22*
*Last updated: 2026-09-22 after Milestone M2 initialization*
