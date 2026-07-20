# ROADMAP — LRIP / PetaNadi MVP

**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)
**Target Deadline:** ~4 weeks from 2026-07-05
**Development Mode:** Solo, AI-assisted

---

## Phase 0: Foundation & Repo Setup
**Goal:** Working project skeleton, environment configured, all tools wired up.
**Status:** COMPLETE ✅

### Deliverables
- Monorepo structure: `/backend` (FastAPI), `/frontend` (Next.js), `/agents` (LangGraph), `/infra`
- Docker Compose: FastAPI + Redis + Supabase local emulator
- Environment variables scaffold (`.env.example`)
- Supabase project created; PostGIS + TimescaleDB + pgvector extensions enabled
- GitHub repo initialized; CI/CD skeleton (GitHub Actions)
- `run_demo.py` skeleton (injects synthetic events into Redis Streams)

### Verification
- [x] `docker compose up` starts all services cleanly
- [x] FastAPI `/health` endpoint returns 200
- [x] Redis Streams connection verified
- [x] Supabase PostGIS spatial query returns a result

---

## Phase 1: Data Ingestion Pipeline & API Adapters
**Goal:** Real-time data from BMKG, TomTom, AISstream, NASA FIRMS flowing into Redis Streams. Fallback caches implemented.
**Status:** COMPLETE ✅
**AI Spec Needed:** No (deterministic data engineering)

### Deliverables
- `DataCollectionAgent` adapter modules:
  - `bmkg_adapter.py` — weather alerts + earthquake polygons (already partially researched in `src/`)
  - `tomtom_adapter.py` — congestion data for Trans-Sumatra Highway segments
  - `aisstream_adapter.py` — vessel positions + Belawan port queue
  - `nasa_firms_adapter.py` — active fire/hotspot polygons
- Each adapter: publish raw events to Redis Streams
- Each adapter: last-known-good cache with configurable TTL + degraded-source flag
- Redis Streams consumer that normalizes and routes events to agent pipeline
- Database schema: `incidents`, `data_sources`, `source_health` tables (PostGIS + TimescaleDB)

### Verification
- [x] Live BMKG event ingested and stored in Supabase
- [x] TomTom congestion data appears in Redis Streams within polling interval
- [x] Simulated API failure triggers fallback cache; `source_health` table shows "degraded"
- [x] Unit tests for each adapter (mock API responses)

---

## Phase 2: OSINT & Headless Scraping (Lightpanda)
**Goal:** PIHPS commodity prices and social OSINT feeding the agent pipeline.
**Status:** COMPLETE ✅
**AI Spec Needed:** No (data engineering)

### Deliverables
- `OSINTAgent` scraping modules via Lightpanda:
  - `pihps_scraper.py` — daily baseline + spike detection (partially researched in `src/`)
  - `marketplace_scraper.py` — Tokopedia/Shopee price comparison
  - `social_scraper.py` — TikTok iFrame + Twitter/X citizen reports
- NER pipeline for location extraction from scraped text (spaCy or LLM-based)
- Geocoding service: extracted locations → lat/lon → PostGIS point
- Crisis Mode trigger: scraping interval shifts from daily → 15 minutes when Redis receives crisis event
- Synthetic PIHPS JSON dataset for `run_demo.py`

### Verification
- [x] PIHPS scrape returns current commodity prices (rice, cooking oil, chili, etc.)
- [x] NER correctly extracts location entities from sample Indonesian news text
- [x] Crisis Mode trigger switches scraping interval; reverts when crisis ends
- [x] Synthetic PIHPS injection via `run_demo.py` populates Supabase correctly

---

## Phase 3: LangGraph Agent Swarm — Core Reasoning
**Goal:** All 6 agents wired in LangGraph; STM/LTM memory systems working; consensus gate functional.
**Status:** COMPLETE ✅
**AI Spec Needed:** YES → run `/gsd-ai-integration-phase 3` before planning this phase

### Deliverables
- LangGraph state schema: `CrisisState` (active hazards, agent findings, confidence scores, validated alerts)
- Agent 1 — Data Collection Agent: normalize + validate incoming Redis events
- Agent 2 — OSINT & Hazard Agent: fuse NER locations with PostGIS hazard polygons
- Agent 3 — Prediction Agent: 6h/12h/24h/48h congestion + economic impact forecasts
- Agent 4 — Route Optimization Agent: pgRouting / NetworkX alternative routes with dynamic hazard-weighted edges
- Agent 5 — Economic Intelligence Agent: PIHPS anomaly detection + LTM inflation multiplier forecast
- Agent 6 — Decision Support Copilot: synthesize all findings → executive summary + recommendations
- STM: Redis KV via LangGraph `MemorySaver` — live crisis state across all agents
- LTM: pgvector in Supabase — historical disaster-inflation episode embeddings
- Consensus Gate: weighted confidence scoring → promote to "Validated" at > 85%
- GraphRAG: Neo4j or pg-graphql over Supabase — entity graph seeded with North Sumatra corridor data

### Verification
- [ ] Injecting a synthetic flood event into Redis triggers the full agent pipeline
- [ ] All 6 agents execute in correct sequence and pass state correctly
- [ ] Consensus gate correctly suppresses low-confidence alerts (< 85%)
- [ ] Validated alert written to Supabase `incidents` table with full evidence chain
- [ ] LTM query returns a relevant historical episode for "Belawan Port closure" scenario
- [ ] GraphRAG traversal from "Belawan Port" returns correct downstream supply chain nodes
- [ ] `run_demo.py` triggers end-to-end pipeline and produces a validated alert

---

## Phase 4: 3D Map Dashboard (Next.js + Mapbox + Deck.gl)
**Goal:** Stunning 3D real-time map with crisis pins, tri-panel sidebar, timeline scrubber, and TheoTown simulation UI.
**Status:** COMPLETE ✅
**AI Spec Needed:** No (frontend engineering, but see UI-SPEC)

### Deliverables
- Next.js 14 App Router setup
- Mapbox GL JS + Deck.gl canvas: congestion overlays, maritime vectors, NASA fire heatmaps, port markers
- WebSocket connection to FastAPI backend for real-time crisis state updates
- Crisis pin rendering: validated alerts appear as interactive map markers
- Tri-Panel Sidebar (on crisis pin click):
  - Tab 1 — Evidence: raw data sources (TomTom graph, NASA signature, OSINT transcript)
  - Tab 2 — Mitigation Detour: alternative route polyline on map
  - Tab 3 — Economic Fallout: PIHPS price chart + inflation arc
- Timeline Scrubber: hour-by-hour playback of crisis unfolding
- "Simulate Disaster" UI: polygon drawing tool → triggers TheoTown Crisis Mode
- Data freshness badges on each data layer
- "Why this alert?" collapsible GraphRAG causal chain panel
- Glassmorphism dark UI; smooth animated transitions; premium design

### Verification
- [x] Map loads with all data layers within 3 seconds
- [x] Crisis pin click opens tri-panel sidebar with correct data
- [x] WebSocket updates cause map to re-render without full page reload
- [x] TheoTown: drawing a polygon triggers Crisis Mode and updates map within 30 seconds
- [x] Timeline scrubber plays back a stored crisis scenario
- [x] Design review: passes 6-pillar UI audit (run `/gsd-ui-review` after)
- [x] Fixed Mapbox Draw race condition to ensure flawless draw mode toggling

---

## Phase 5: Notifications & Human-in-the-Loop
**Goal:** WhatsApp alert delivery for validated crises; approval logging for KPI measurement.
**Status:** COMPLETE ✅
**AI Spec Needed:** No

### Deliverables
- WhatsApp Business API integration: send formatted alert messages when consensus gate fires
- Notification content: crisis summary + recommended action + dashboard deep-link
- Approval logging: `route_approvals` table (timestamp, route_id, operator_id, recommended_route)
- "Approve" button in dashboard sidebar triggers logging + optional WhatsApp confirmation to driver
- Source health indicator UI (green/yellow/red) for BMKG and TomTom layers (minimum before pilot)

### Verification
- [x] Validated alert triggers WhatsApp message delivery (test number)
- [x] Clicking "Approve" inserts record in `route_approvals` table
- [x] Source health indicator turns red when BMKG adapter is deliberately killed

---

## Phase 6: Demo Polish & `run_demo.py` Finalization
**Goal:** Hackathon-ready demo that runs flawlessly in < 3 minutes without live internet.
**Status:** COMPLETE ✅

### Deliverables
- `run_demo.py` finalized: Belawan Port closure + Trans-Sumatra flooding scenario
  - Synthetic NASA polygons, TomTom delays, PIHPS cooking oil spike, TikTok transcript
  - Full pipeline: event → agent swarm → consensus → validated alert → map update → notification
- Performance audit: map renders at 60 FPS with synthetic dataset
- Presentation walkthrough: scripted 3-minute demo flow documented
- README: setup instructions, one-command demo launch

### Verification
- [x] `python run_demo.py` runs end-to-end in < 3 minutes
- [x] Dashboard shows validated crisis with all three sidebar tabs populated
- [x] WhatsApp notification delivered (or logged if no live network)
- [x] 60 FPS confirmed in browser dev tools during full dataset render
- [x] Team dry-run: judge questions answered from the interface alone
- [x] Ensured flawless local running (uvicorn) by injecting sys.path resolution in main.py

---

## Phase 7: Interactive Guided Demo Mode
**Goal:** An in-game-tutorial-style guided demo experience built directly into the dashboard — a judge or evaluator clicks one button and the system walks them through the entire LRIP platform end-to-end, stage by stage, with explanations, live data, and full presenter control.
**Status:** COMPLETE ✅

### Deliverables
- **`GuidedDemoPanel` component** (`frontend/components/demo/GuidedDemoPanel.tsx`):
  - Floating "▶ Run Demo" trigger button (bottom-right corner of dashboard)
  - 5-stage stepper UI: Injecting Events → Agent Swarm → Consensus Gate → Validated Alert → Notification
  - "Next Step" button for manual stage advancement (presenter can pause for judge Q&A)
  - "Run Automatically" toggle with configurable ~15s pacing between stages
  - Source data badges animating in as each event type fires (BMKG, TomTom, NASA, AISstream, PIHPS, Social)
  - Per-stage explainer cards (in-game tutorial style: "What's happening here?" context for each step)
- **`demo_router.py`** (`backend/app/routers/demo_router.py`):
  - `POST /api/demo/start` — loads `belawan_scenario.json`, invokes agent pipeline directly (no Redis required)
  - `GET /api/demo/status/{crisis_id}` — returns current pipeline stage + per-agent status
  - `--mock-agents` mode: pre-scripted `CrisisState` fixtures bypass LLM calls entirely — 100% deterministic demo
- **Full offline mode**: Supabase writes stubbed with an in-memory store when `DEMO_OFFLINE=true` — no outbound network required
- **Mobile presenter remote** (`/demo-remote` page): phone-optimized one-tap stage advancement so the presenter can walk freely
- **Demo replay**: persist a completed run as a JSON snapshot; replay frame-by-frame without re-running the swarm

### Verification
- [x] Clicking "▶ Run Demo" button drives the full 5-stage pipeline without opening a terminal
- [x] "Next Step" button pauses correctly between each stage
- [x] "Run Automatically" completes end-to-end in < 3 minutes
- [x] Per-stage explainer cards are accurate and readable for non-technical judges
- [x] `DEMO_OFFLINE=true` runs with no Redis, no Supabase, no outbound network
- [x] Mobile remote at `/demo-remote` advances stages correctly from a phone
- [x] Demo replay loads a saved snapshot and plays it back faithfully

---

## Phase 8: NVIDIA Architecture Integration
**Goal:** Integrate NIM fallbacks, cuOpt dynamic routing, and proactive FourCastNet polling into the cognitive swarm.
**Status:** COMPLETE ✅
**AI Spec Needed:** YES

### Deliverables
- `llm_gateway.py`: Centralized LLM gateway for automatic NVIDIA NIM fallback routing.
- Agent 3 (Prediction) update: Proactive CRON polling (every 6 hours) of Earth-2/FourCastNet for the North Sumatra bounding box.
- Agent 4 (Routing) update: Dynamic VRP matrix generation via pgRouting/OSRM fed into cuOpt for multi-agent constraint solving.

---

## Phase 9: Responsive Layout & Stitch Screens Integration
**Goal:** Address desktop layout cropping issues and integrate the remaining high-fidelity screens from the Stitch Unified Design System (Price Tracker, AI Consultant, Executive Summary, and Evidentiary Drill-down).
**Status:** COMPLETE ✅

### Deliverables
- **Desktop Cropping Fix**: Changed `<main>` viewport to absolute positioning (`absolute left-20 top-16 right-0 bottom-0`) to ensure dynamic height scaling.
- **AnalyticsSection Component**: High-fidelity Price Tracker dashboard displaying Archipelago Inflation Heatmap, simulated Price Spike Zones, predictive vs. actual commodity prices, and indicator risk rankings.
- **ReportsSection Component**: Weekly Cabinet Briefing executive summary with pagination controls and report exporting.
- **SimulationSection Component**: Merged Mitigation Sandbox and AI Advisor conversational playground to assign parameters to emergency response agencies (BULOG, DISHUB, BNPB) and view rerouting/stabilization metrics.
- **Evidentiary Drill-Down Integration**: Embedded visual CCTV log feed, crowdsourced OSINT tweet logs, and delay matrix charts directly into the `EvidenceTab` component of the floating `<CrisisSidebar>`.
- **TopNavBar Integration**: Conditionally render sections (Map, Analytics, Simulation, Reports) inside `DashboardClient.tsx` with a smooth Mapbox background blur-fade transition.

### Verification
- [x] Production compilation (`npm run build`) succeeded with zero type or lint errors.
- [x] Verified zero desktop cropping on 1080p display emulation.
- [x] Clicked through all nav tabs and verified smooth page state transitions.

---

## Phase 11: Proposal Migration & Dynamic UI Integration
**Goal:** Align the backend consensus threshold, cross-validation mechanisms, and frontend static pages with the Stage 2 Submission specifications.
**Status:** COMPLETE ✅

### Deliverables
- Swarm Consensus logic updated: threshold >= 85%, cross-validation requiring >= 2 independent sources.
- `AnalyticsSection` dynamically connected to Supabase `commodity_prices` data streams.
- `SimulationSection` dynamically connected to backend agent-chat / advisor endpoint.
- `ReportsSection` connected to live metrics queried from the database.
- `EconomicTab` and map layers (`STUB_MARITIME`, `STUB_FIRE_HOTSPOTS`) bound to live backend sources.
- Security sweep completed to verify UU 27/2022 (PDP) compliance (zero NIK, personal names, or unencrypted PII).
- Left navigation sidebar icons wired to open the sidebar and focus corresponding tab layouts.
- Bottombar time scope filters (PAST, FUTURE, PREDICT) bound to mock data feeds and geocoded locations.

### Verification
- [x] Swarm Consensus logic verified with 34/34 passing agent tests.
- [x] Security sweep successfully validated UU No. 27/2022 compliance.
- [x] Frontend production container built successfully with zero type or lint errors.
- [x] Sidebar navigation tabs and bottombar time filter options verified interactive.

---

## Phase 12 (Prev): UI/UX Refinement & Runtime State Fixes
**Goal:** Eliminate visual widget overlaps between top status bar / header and sidebar panels, add smooth easing transitions to the left navigation menu, and harden "Run Demo" action handlers.
**Status:** COMPLETE ✅

### Deliverables
- Fix `CrisisSidebar` positioning to `top-20` so it sits cleanly below the fixed top header navbar without overlapping header items.
- Constrain `CrisisSidebar` max height to `max-h-[calc(100vh-12rem)]` to avoid vertical overlap with bottombar controls and demo panel.
- Refactor left tactical column & micro-telemetry ticker layout grid/padding in `DashboardClient.tsx` to eliminate gauge card clipping.
- Add `transition-all duration-300 ease-in-out` and text opacity transitions to left sidebar hover expansion.
- Add explicit `type="button"` and event handler guards to all action buttons in `GuidedDemoPanel.tsx`.
- Wrap demo state initialization and API calls in robust try/catch blocks in `useDemoState.ts`.

### Verification
- [x] Verified zero header navbar overlap with `CrisisSidebar`.
- [x] Left navigation sidebar hover transition verified smooth with `ease-in-out` easing.
- [x] Action buttons in `GuidedDemoPanel` verified safe with explicit `type="button"` and event guards.
- [x] Production container build verified with zero errors.

---

## Phase 12: Backend Demo Engine & AI Advisor Localization
**Goal:** Perbaiki API 500/404 demo runner, prompt bahasa Indonesia Gemini Advisor, dan stub PDF report.
**Status:** COMPLETE ✅

### Deliverables
- **Demo Runner API Fixes**:
  - Resolve API `/api/demo/start` returning 500 server error when running demo.
  - Resolve `/api/demo/status/{id}` returning 404 Not Found error during polling.
  - Fix demo runner freezing/hanging on second run by properly resetting runner state.
- **AI Advisor Localization**:
  - Update Gemini / DeepSeek AI Advisor prompts to automatically respond in Indonesian (multilingual adaptation based on user input).
- **PDF Report Generator**:
  - Fix stub PDF report export functionality on the Reports page.

### Verification
- [x] `POST /api/demo/start` and polling `/api/demo/status/...` succeed with 200 OK.
- [x] Consecutive "Run Demo" triggers run smoothly without hanging.
- [x] Simulation AI Advisor responds in Indonesian when user prompts in Indonesian.
- [x] PDF report generation produces downloadable report on the Reports page.

---

## Phase 13: Mapbox/Deck.gl Spatiotemporal Layers & Drawing Tool
**Goal:** Perbaiki 3D globe node anchor agar tidak melayang saat diputar, event-listener Drawing Mode, dan kerapihan rute.
**Status:** COMPLETE ✅

### Deliverables
- **3D Globe Node Anchor Fix**:
  - Fix Mapbox/Deck.gl disruption hotspot nodes drifting and floating off position during 3D globe rotation and zoom.
- **Drawing Mode Event Listener Fix**:
  - Fix "SIMULATE DISRUPTION" button event listener so activating drawing mode enables polygon drawing tool and handles mouse drag events properly.
- **Route Visualization Cleanup**:
  - Refine map logistics route polylines to remove hallucinated/jagged paths and display clean corridor routes.

### Verification
- [x] Disruption nodes stay strictly pinned to map coordinates when rotating/tilting 3D globe.
- [x] Clicking "SIMULATE DISRUPTION" switches cursor to drawing tool and permits drawing polygons on canvas.
- [x] Route polylines follow road and maritime paths accurately without visual glitches.

---

## Phase 14: UI/UX Layout, Toast Notifications & Navigation State
**Goal:** Perbaiki margin/padding overlap, ganti JS alert() ke UI Toast, dan rapikan logika Sidebar vs Bottombar.
**Status:** NOT STARTED ⏳

### Deliverables
- **UI Spacing & Layout Audit**:
  - Fix component overlaps, missing margins, and padding on Analytics, Simulation, and Reports pages.
- **Toast Notifications**:
  - Replace native JavaScript `alert()` popups (e.g. "Assigned cargo routing parameters...") with sleek UI Toast notifications.
- **Sidebar vs Bottombar Navigation Logic**:
  - Harmonize Sidebar and Bottombar state: hide bottombar on non-map pages and ensure sidebar controls operate properly across all pages.

### Verification
- [ ] Zero overlapping UI elements across Analytics, Simulation, and Reports screens.
- [ ] Action buttons trigger Toast notifications instead of browser `alert()`.
- [ ] Navigation transitions correctly synchronize sidebar and bottombar visibility across views.

---

## Phase 15: 4D Logistics Vehicle Animation Layers
**Goal:** Implementasi layer animasi truk, kapal, dan pesawat sesuai dokumen proposal.
**Status:** NOT STARTED ⏳

### Deliverables
- **Animated Logistics Layers**:
  - Add Deck.gl / Mapbox animated vehicle markers for trucks, cargo ships, and planes.
  - Animate vehicles moving along logistics corridors (highway, maritime lanes, air paths) based on proposal specifications in `docs/Submission Tahap 2 (3) - compiled.md`.

### Verification
- [ ] Moving vehicle icons (trucks, ships, planes) are rendered and animated smoothly along simulated logistics routes.
- [ ] Vehicle movement can be toggled or filtered on the 4D Map.

---

## Backlog (Post-Hackathon / v2)
- Driver mobile app (React Native + WatermelonDB + CRDT offline sync)
- Self-serve operator GPS onboarding SDK
- OpenSky aviation layer (full integration)
- Multi-province rollout (Java corridor + others)
- Outcome follow-up system for approved route recommendations
- Enterprise GraphRAG private deployment
- Automated CI/CD pipeline with staging → production promotion
- Backend endpoints for National Logistics Health Index API and KPI metrics (to replace frontend mock calculations).
- Backend data pipelines/tables to serve raw fleet telemetry, live traffic paths, and weather/hotspot layers to the map directly (to replace frontend mock arrays).
- Forecasting and predictive analytics endpoints (to support the Future/Predict time-scope filters in the UI).

