# REQUIREMENTS: PreHub Logistics Resilience Intelligence Platform

**Active Milestone:** M8 - Fast & Durable (phases 160–166)
**Previous Milestone:** M7 - Live News Trust, Source Breadth & Forecast Waspada Integrity [COMPLETED]

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

## Milestone M3: MVP Pilot Operations & Multi-Persona Dispatcher Platform (Active Scoped Requirements)

### FR-15: Supabase Multi-Role Authentication & Workspace Access Control (Phase 42)
- **FR-15.1 Supabase Auth & JWT Verification:** Implement Supabase Auth integration (Sign Up, Sign In, Magic Link / Passwordless) with FastAPI JWT token verification middleware (`backend/app/auth/supabase_auth.py`).
- **FR-15.2 Role-Based Access Control (RBAC):** Provide 3 distinct operational roles with customized permissions and data access:
  - `DISPATCHER`: Full route planning, fleet management, custom manifest upload, and mitigation approval authority.
  - `REGULATOR`: Read-only macro corridor vulnerability heatmaps, PIHPS staple price analytics, and 1-click exportable B2G executive briefing reports.
  - `GUEST / EVALUATOR`: Full interactive demo mode, guided scenario runner, and empirical benchmark audit inspection.
- **FR-15.3 Offline Session Fallback:** Implement local guest session fallback mode allowing full dashboard functionality when cloud auth is offline.
- **FR-15.4 Role-Adaptive Top Navigation:** Top navigation and action buttons dynamically adapt based on active user role without full page reload.

### FR-16: Self-Serve Fleet Onboarding & Live GPS Ingestion Engine (Phase 43)
- **FR-16.1 Single Vehicle Registration Modal:** Interactive operator form allowing dispatchers to register ad-hoc trucks (Plate number, driver phone, vehicle class: Tronton/Fuso/CDD, cargo commodity, origin/destination hubs, cold-chain temperature thresholds).
- **FR-16.2 Drag-and-Drop Bulk CSV/Excel Manifest Parser:** Upload and validate bulk vehicle delivery manifests with downloadable standard templates and instant row-level error reporting (`POST /api/v1/fleet/upload-manifest`).
- **FR-16.3 Standardized TMS GPS Telematics Webhook:** REST endpoint (`POST /api/v1/fleet/telemetry/ingest`) for external telematics providers (Traccar, EasyGo, McEasy) streaming live GPS coordinates into the system.
- **FR-16.4 Dynamic WebGL Asset Binding:** User-uploaded fleet units instantly bind to Mapbox WebGL symbol layers at 60 FPS, with dynamic bearing vectors and tactical target locking reticles.

### FR-17: Intermodal Sea-Land Terminal Synchronization & Gate Choke-Point Monitoring (Phase 44)
- **FR-17.1 Port & Ferry Gate Queue Synchronizer:** Compute combined terminal dwelling time at Belawan Port and Bakauheni Ferry Gateway by fusing AIS vessel roadstead queues with incoming Trans-Sumatra highway truck volumes (`GET /api/v1/intermodal/terminal-status`).
- **FR-17.2 Automated Intermodal Delay Multiplier:** Apply dynamic multiplier formula ($M_{\text{intermodal}} = 1.0 + 0.15 \times N_{\text{anchored vessels}}$) to corridor transit ETAs when maritime bottlenecks occur.

### FR-18: Operational Spoilage Hedging & Economic Cost-Benefit Calculator (Phase 44)
- **FR-18.1 Financial Cost Matrix Solver:** Evaluate the monetary exposure of mitigation alternatives:
  - $\text{Cost}(\text{Continue}) = P(\text{Stuck}) \times \text{Cargo Value} + \text{Driver Downtime Cost}$
  - $\text{Cost}(\text{Reroute}) = \Delta \text{Distance} \times \text{Fuel Rate} + \text{Trans-Sumatra Toll Tariff} + \Delta \text{Time} \times \text{Driver Overtime}$
  - $\text{Cost}(\text{Hold}) = \text{Wait Hours} \times (\text{Cold-Chain Genset Fuel} + \text{Depot Storage Fee})$
- **FR-18.2 Financial Policy Recommendation Card:** Highlight the optimal financial mitigation policy in `CrisisSidebar.tsx` factoring commodity perishability half-life ($T_{\text{spoil}}$).

### FR-19: Digital Cargo Manifest & Agricultural Quarantine Compliance Inspector (Phase 44)
- **FR-19.1 Digital Compliance Inspector:** Automatically check *Surat Jalan* (Cargo Delivery Order), *Sertifikat Karantina Pertanian (BKHIT)*, and axle-load limits (*Muatan Sumbu Terberat / MST*) for alternative detour corridors.
- **FR-19.2 Evidence Panel Compliance Clearance:** Display real-time compliance clearance badges in the Evidence panel before route approval.

### FR-20: Pilot Verification, Scenario Drills & Production Deployment Packaging (Phase 45)
- **FR-20.1 Automated End-to-End Pilot Test Suite:** Comprehensive test suite (`backend/tests/test_pilot_e2e.py`) validating the full lifecycle: Auth $\to$ CSV Fleet Ingestion $\to$ Hazard Detection $\to$ Consensus Gate $\to$ Intermodal Sync $\to$ Spoilage Hedging $\to$ Detour Approval $\to$ WhatsApp Link $\to$ Outcome Verification.
- **FR-20.2 Production Docker Compose Hardening:** Multi-container configuration for FastAPI, Next.js, Redis, and Supabase with container health checks and persistent volumes.
- **FR-20.3 Official Pilot Onboarding & User Manual:** Complete operator onboarding guide (`docs/PreHub_Pilot_Onboarding_Manual.md`) for dispatchers and government regulators.

### NFR-11: Strict Minimalist Operator-First UI Ergonomics (Cross-Cutting across M3)
- **NFR-11.1 Zero Emojis:** Zero emoji characters in any UI component; 100% monochrome SVG icons from `lucide-react`.
- **NFR-11.2 Zero Boasting & Zero Clutter:** Elimination of buzzwords (e.g. no "4D COMMAND CENTER", "NVIDIA H100 GPU", "SUPER QUANTUM"). Only functional, operator-relevant labels and numbers.
- **NFR-11.3 High-Contrast Glassmorphic Design:** Standardized dark theme (`backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10`) with sub-100ms interaction response and `cursor-pointer` on all interactive triggers.

---

## Traceability (Milestone M3)

| Requirement | Phase | Status |
|-------------|-------|--------|
| FR-15.1 (Supabase Auth & JWT Verification) | Phase 42 | Planned |
| FR-15.2 (Role-Based Access Control RBAC) | Phase 42 | Planned |
| FR-15.3 (Offline Session Fallback) | Phase 42 | Planned |
| FR-15.4 (Role-Adaptive Top Navigation) | Phase 42 | Planned |
| FR-16.1 (Single Vehicle Registration Modal) | Phase 43 | Planned |
| FR-16.2 (Drag-and-Drop Bulk CSV/Excel Manifest Parser) | Phase 43 | Planned |
| FR-16.3 (Standardized TMS GPS Telematics Webhook) | Phase 43 | Planned |
| FR-16.4 (Dynamic WebGL Asset Binding) | Phase 43 | Planned |
| FR-17.1 (Port & Ferry Gate Queue Synchronizer) | Phase 44 | Planned |
| FR-17.2 (Automated Intermodal Delay Multiplier) | Phase 44 | Planned |
| FR-18.1 (Financial Cost Matrix Solver) | Phase 44 | Planned |
| FR-18.2 (Financial Policy Recommendation Card) | Phase 44 | Planned |
| FR-19.1 (Digital Compliance Inspector Surat Jalan & BKHIT) | Phase 44 | Planned |
| FR-19.2 (Evidence Panel Compliance Clearance) | Phase 44 | Planned |
| FR-20.1 (Automated End-to-End Pilot Test Suite) | Phase 45 | Planned |
| FR-20.2 (Production Docker Compose Hardening) | Phase 45 | Planned |
| FR-20.3 (Official Pilot Onboarding & User Manual) | Phase 45 | Planned |
| NFR-11.1 (Zero Emojis Policy) | Phase 42-45 | Planned |
| NFR-11.2 (Zero Boasting & Zero Clutter) | Phase 42-45 | Planned |
| NFR-11.3 (High-Contrast Glassmorphic Design) | Phase 42-45 | Planned |

---

## Milestone M8: Fast & Durable (Active Scoped Requirements)

Performance + reliability only; no visual redesign. Requirement IDs use the M8 category prefixes; no `AUTH`/`BOOT`/`DATA`/`PERF`/`OPS`/`VERIFY` IDs existed before this milestone, so each series starts at `01` (the numeric `FR-1..20` / `NFR-1..11` series stays closed at its last number).

### AUTH — Session Durability (Phases 161, 164)

- **AUTH-01 Refresh-token sync:** every Supabase `TOKEN_REFRESHED` / `SIGNED_IN` event writes the new access token into `prehub_auth_token` and local storage; the stored token is never allowed to outlive its own `exp`.
- **AUTH-02 Magic-link session:** the redirect landing handled via `detectSessionInUrl` + `SIGNED_IN` establishes a session without a manual reload.
- **AUTH-03 Seven-day sliding cookie:** `Max-Age=604800`, `Path=/`, `SameSite=Lax`, `Secure` in production; renewed on refresh and cleared on logout.
- **AUTH-04 `exp` required:** middleware rejects any token without an `exp` claim; the backend stays authoritative.
- **AUTH-05 Fail-closed 401:** a supplied-but-invalid token returns 401; guest access is granted only when no token was sent.
- **AUTH-06 Cross-tab sync:** login and logout propagate across tabs via `storage` event or `BroadcastChannel`.
- **AUTH-07 Logout race:** a logout during an in-flight login is not resurrected by the resolving login (auth-generation counter).

### BOOT — Thin Web Process (Phase 162)

- **BOOT-01 No batch pollers at boot:** zero batch ingestion pollers start in the first 60s of process life.
- **BOOT-02 Lazy imports:** numpy/scipy/langgraph/adapters load lazily; no `init_db()` at import in production; JWKS pre-warmed after startup.
- **BOOT-03 `/internal/tick`:** protected by `X-Internal-Token` (constant-time compare), returns `202 { accepted, due, run_id }` immediately, never waits for jobs.
- **BOOT-04 Tick single-flight:** a Postgres advisory lock or `job_runs.locked_until` allows one tick at a time; an overlapping tick returns `202 skipped`.
- **BOOT-05 Last-run cadence:** jobs run on `last_run_at` + cadence with a per-tick CPU budget; missed ticks catch up and a completed cycle never re-runs.
- **BOOT-06 Deferred continuous consumers:** AIS WebSocket and Redis alert fanout start 60–90s after boot, supervised with backoff.

### DATA — Bootstrap Snapshot & Read Path (Phase 163)

- **DATA-01 `dashboard_snapshots` table:** DB-backed read model with per-section payload and `computed_at`.
- **DATA-02 Bootstrap endpoint:** `GET /api/v1/dashboard/bootstrap?modality=truck|vessel|air` is auth-aware (guest → public, dispatcher → `company_id`-scoped) and returns `computed_at`, `stale`, per-section freshness.
- **DATA-03 Lazy-mounted sections:** hidden dashboard sections do not fetch on mount; only visible sections poll.
- **DATA-04 Weather/incidents cache:** weather (BMKG + Open-Meteo fusion) and incidents are cache-served, not recomputed live per request.
- **DATA-05 Snapshot staleness:** missing/corrupt snapshot falls back to a 10s-capped live compute with an async snapshot write and renders a stale badge; no silent empty dashboard.
- **DATA-06 Snapshot cache policy:** bootstrap responses are `private, no-store` and never shared across users or tenants.

### PERF — Client Transport (Phases 163, 164)

- **PERF-01 Timeouts/abort:** `fetchWithTimeout` at 15s default and 30s for bootstrap, one retry with backoff, no proxy fallback on timeout, abort on unmount.
- **PERF-02 No overlapping polls:** a section never has two in-flight polls; navigation/render does not stack requests.
- **PERF-03 No CORS preflight on GET:** no `Content-Type` header on GET requests.
- **PERF-04 First-data SLO:** dashboard first data < 5s on throttled Fast 4G, with a request count materially below the Phase 160 baseline.

### OPS — Proxy, Probe, Soak (Phases 160, 164, 165, 166)

- **OPS-01 Proxy cache boundary:** authenticated GET → `Cache-Control: private, no-store`; only an explicit anonymous allowlist may use `public, s-maxage=60, stale-while-revalidate=120`; `Idempotency-Key` preserved; SSE never cached.
- **OPS-02 GH probe artifact:** keep-alive workflow uses `--fail-with-body`, `max-time 120`, one retry, a 15-minute job timeout, a `concurrency` guard, and publishes a JSON artifact plus daily summary.
- **OPS-03 Seven-day soak:** 10-minute probe cadence over 7 days with 0 failures; delayed runs recorded as delayed, not failed; a deploy resets the window and records a new start time.

### VERIFY — Evidence (Phases 160, 165)

- **VERIFY-01 Playwright local + production smoke:** local suite gates the branch; production smoke runs against `pre-hub.vercel.app` + `peta-nadi.onrender.com`.
- **VERIFY-02 Two-user cache isolation:** two distinct authenticated users never receive each other's cached payload.
- **VERIFY-03 SLO table:** measured cold first response, warm `/health`, warm login, first data, session survival, and request count recorded against the baseline.
- **VERIFY-04 Audit artifact:** `BACKEND-AUDIT.md` covers all 81 routes, the 23 auth-dependent handlers, cache status, sync I/O, and persistence, with ranked findings.

### Traceability (Milestone M8)

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01..07 (session durability) | Phase 161 | Planned |
| BOOT-01..06 (thin web + tick) | Phase 162 | Planned |
| DATA-01..06 (bootstrap + read path) | Phase 163 | Planned |
| PERF-01..03 (client transport) | Phases 163–164 | Planned |
| PERF-04 (first-data SLO) | Phase 165 | Planned |
| OPS-01 (proxy boundary) | Phase 164 | Planned |
| OPS-02 (probe artifact) | Phase 160 | Planned |
| OPS-03 (7-day soak) | Phase 166 | Planned |
| VERIFY-01 (smoke suites) | Phases 160, 165 | Planned |
| VERIFY-02 (cache isolation) | Phase 165 | Planned |
| VERIFY-03 (SLO table) | Phase 165 | Planned |
| VERIFY-04 (backend audit) | Phase 160 | Planned |

### Out of Scope (Milestone M8)

- No visual redesign; the landing page and its 121-frame sequence are untouched.
- No `@supabase/ssr` HttpOnly migration and no backend-owned session table.
- No paid infrastructure; free-host migration is a fallback gate only.
- No full async rewrite of all 81 backend routes.
- No new product features; no route-result persistence across refresh.
- HTTPOnly/RLS verification and classification of the 51 unauthenticated routes.
- Landing-page media optimization, and BMKG freshness tightening below the 5-minute tick.
- Soak verdict itself (follow-up session).

---
*Requirements defined: 2026-09-28*
*Active Milestone: M8 - Fast & Durable (requirements appended 2026-10-27)*
