# PreHub — Food Logistics Disruption Early Warning & Mitigation Decision Support System

> **PreHub** (*Predictive Logistics Hub & Early Warning System*) is an AI-powered decision support platform that shifts Indonesia's food distribution and disaster response from **reactive** to **proactive**. PreHub ingests real-time multisource data, detects logistics disruptions across Sumatra and national corridors, calculates operational and economic risks, and delivers actionable evidence-grounded mitigations (*Continue*, *Reroute*, or *Hold/Delay*) directly to logistics dispatchers and government executives.

---

## System Architecture

```
Multisource Telemetry (BMKG Sensor, TomTom Speed Flow, Google News RSS, PIHPS Price Stream)
                                      |
                                      v
                   Redis 7 Pub/Sub & OSINT Ingestion Queue
                                      |
                                      v
               LangGraph 6-Agent Swarm (DeepSeek R1 / Gemini)
                                      |
                                      v
                   Consensus Gate & Grounding Verification
                                      |
                                      v
              NetworkX Dijkstra Matrix & Mapbox Directions Router
                                      |
                                      v
           PreHub 4D Decision Map & Multi-Modal Fleet Command Center
                                      |
                                      v
     Multi-Persona Operations (Dispatcher, Regulator, Guest Evaluator)
```

---

## Core Capabilities & Technical Implementations

### 1. Multi-Source Grounding & Pan-Sumatra News Intelligence
- **Pan-Sumatra Multi-Biro News Ingestion:** Real-time ingestion from LKBN ANTARA regional bureaus across 8 mainland Sumatra provinces (Sumut, Sumbar, Riau, Aceh, Sumsel, Lampung, Jambi, Bengkulu) and national economic outlets (ANTARA Ekonomi, CNBC, CNN).
- **Structured NLP Extraction:** Automated entity recognition for arterial corridor segments, 3–6h pre-disruption lead times, affected food commodities (rice, chili, shallots, oil), and physical ground-truth metrics (water depth cm, road blockades).
- **Deep Publisher Permalink Resolution:** Unmasks Google News opaque redirect wrappers via `batchexecute` Fbv4je RPC and direct regional RSS feeds into authentic permanent publisher articles (Antara, Detik, Kompas), eliminating redirect bounce and fake numeric IDs.
- **BMKG Hydrometeorological Telemetry:** Real-time precipitation intensity, flood alerts, and observation station monitoring.
- **TomTom Traffic Speed Flow:** Live segment-level speed deltas, delay metrics, and congestion index caching.
- **PIHPS Price Stream:** Monitoring volatility and price spikes for strategic staple commodities.

### 2. Multi-Agent Swarm Intelligence (6 Specialist Agents)
- **Data Collection & Health Agent:** Ingests and normalizes multi-source sensor and news telemetries.
- **OSINT & Hazard Intelligence Agent:** Aggregates and cross-corroborates official news reports and social alerts against PostGIS hazard polygons with $+0.15$ confidence boost for Tier 1 official sources.
- **Congestion & Weather Forecast Agent:** Projects 24-48 hour congestion trends and atmospheric precipitation risks.
- **Route Optimization Agent:** Computes optimal detour routes via NetworkX Dijkstra graph matrix, applying dynamic $\times 5.0$ edge penalties to blocked arterial corridors (e.g. Jalinsum KM 78 $\rightarrow$ Tol MKTT detour).
- **Price & Inflation Intelligence Agent:** Combines PIHPS price anomalies with news-reported commodity disruptions to project regional food inflation shocks ($+15\%$ to $+35\%$).
- **Decision Support Agent:** Synthesizes executive multi-agency recommendations (*Continue*, *Reroute*, *Hold/Delay*) backed by verified news citations and chain-of-thought reasoning.

### 3. Dedicated Intelligence & Observability Endpoints
- `GET /api/v1/news/live?force_refresh={bool}`: Returns aggregated, structured real-time news articles across Sumatra with corridor impact metrics.
- `GET /api/v1/news/market-regime`: Computes real-time market risk status (*NORMAL_SUPPLY*, *EARLY_WARNING_ACTIVE*, *CRITICAL_DISRUPTION*) and active corridor crisis indicators.
- `GET /api/v1/health` and `GET /health`: Dual-alias system health probe monitoring database connectivity, Redis broker status, and service latency.
- `GET /api/v1/intermodal/chokepoints`: Live status of 18+ strategic Pan-Sumatra maritime ports and mountain passes.
- `POST /api/v1/compliance/verify`: Digital manifest verification for BKHIT quarantine certification and MST Class III axle-load constraints.

### 4. Coastal Nautical Fairways, Estuary Navigation & Multi-Modal Routing
- **100% Water-Path Coastal & River-Estuary Routing:** Dedicated port channel waypoints (`SUMATRA_PORT_CHANNELS`) connecting inland/river estuaries (Boom Baru Musi River, Pekanbaru Siak River, Jambi Batanghari River) to the 16-point `SUMATRA_NAUTICAL_PERIMETER`. Dijkstra pathfinding mathematically prevents all landmass and peninsula traversal.
- **Modality-Specific Multi-Color Route Legs:** Visual differentiation with emerald green `#10B981` (road haulage), royal blue `#3B82F6` (coastal & river maritime), and sky cyan `#00F0FF` (air cargo express).
- **Pure Coordinate Snap Routing:** Decoupled routing from rigid pre-defined hub nodes to pure `[lon, lat]` coordinates using Haversine nearest-node road graph snapping (`cpu_routing_adapter.py`).
- **Hazard Collision & Hold/Delay Fallback:** When all primary and arterial bypass routes intersect disaster zones, the system surfaces an honest **Mitigasi Taktis: Tunda Keberangkatan (Hold / Delay)** recommendation instead of proposing compromised detours.

### 5. High-Density GPU Telemetry & Memory Stability (Deck.gl v8 + SpatialHash)
- **GPU-Instanced Telemetry Layer:** High-density `@deck.gl/mapbox` MapboxOverlay (`IconLayer`, `PathLayer`, `TextLayer`, `ScatterplotLayer`) rendering 5,000+ units at 60 FPS with pre-rendered icon atlas.
- **4 Hz Buffer Throttling (Zero OOM):** Decoupled Deck.gl `setProps` buffer uploads to ~4 Hz (250ms interval) and recycled typed arrays in `FleetVehicleLayer.tsx`, eliminating main-thread CPU spikes and browser V8 heap OOM crashes.
- **Persistent Visual Anchors & `billboard: true`:** Persistent `ScatterplotLayer` dots and `billboard: true` orientation prevent label/sprite tilting distortion during pitched 3D globe and terrain rotations.
- **Balanced Modality Label Quotas:** Macro-zoom arbitration in `spatialHashArbiter.ts` enforces balanced fair-share label slots (trucks: 8, maritime: 9, air: 7) across 32px/56px spatial hash cells, preventing truck labels from being starved out by high-density maritime traffic.
- **AIS Vessel MMSI Continuity & 90s Sliding TTL:** Persistent 96-vessel regional Sumatra baseline merged with live WebSocket AISStream messages (`get_live_ais_vessels()`) and 90-second sliding TTL cache (`useFleetVehicles.ts`), guaranteeing zero vessel disappearance during WebSocket reconnections or polling renewal.

### 6. On-Map Contextual Corridor Selection & Node Glow Cleanup
- **Contextual Route Popovers:** Clicking any route polyline opens an interactive Glassmorphic popover displaying corridor title, distance, duration, risk status, IDR logistics cost, and direct actions (*"Pilih Rute Ini"*, *"Sembunyikan Koridor Ini"*, *"Tutup"*).
- **Clean Slate Architecture:** Bottom mode-selector buttons have been decommissioned in favor of this direct on-map contextual workflow.
- **Bidirectional Corridor Restoration:** When routes are hidden, a contextual *"Tampilkan Semua Rute (N Tersembunyi)"* pill appears in `CrisisSimulatorBar.tsx`, restoring all hidden routes with synchronized state.
- **Immediate Node Glow Cleanup:** An active synchronization hook immediately clears `customPinnedPoints` and resets `custom-pinned-source` GeoJSON when origin/destination nodes are cleared, instantly extinguishing lingering pulse rings and node glow.

### 7. Multi-Persona Operations & Digital Compliance
- **Supabase Authentication & Multi-Role RBAC:** Role-based access control partitioning features for `DISPATCHER` (fleet routing and reroute approvals), `REGULATOR` (BKHIT quarantine audit, price volatility monitoring, reports), and `GUEST` (strictly read-only evaluation sandbox).
- **Self-Serve Fleet Onboarding:** Drag-and-drop CSV manifest ingestion, manual vehicle onboarding modal, and TMS GPS telemetry ingestion webhooks.
- **Pan-Sumatra Intermodal Choke-Points:** Tracking 7 maritime/ferry ports (Belawan, Bakauheni, Dumai, Teluk Bayur, Panjang, Sibolga, Kuala Tanjung) and 11 mountain passes (Sitinjau Lauik, Kelok 9, Malalak, etc.) with automated delay multipliers ($1.0 \le M_{\text{intermodal}} \le 3.5$).
- **Closed-Form Spoilage Hedging Matrix:** Closed-form monetary tradeoff solver evaluating Continue vs Reroute vs Hold factoring 4-tier exponential perishability decay ($\delta = 0.025$ to $0.0005/\text{hr}$), official BPJT toll tariffs across Golongan I-V, and Pertamina fuel consumption.
- **Differentiated Regulatory Enforcement:** Deterministic `HARD_BLOCK` on missing BKHIT agricultural quarantine certificates for inter-island transits; tactical `WARNING` & bypass advisory with operator liability transfer override for heavy vehicles ($>8$ Ton) traversing Class III mountain corridors.

### 8. Strict RBAC, Route Middleware & Guest Read-Only Mode
- **Supabase Authentication Required:** Login, sign-up, and magic links run through Supabase Auth (`frontend/lib/authContext.tsx`). There is **no offline login fallback** — when the auth service is unavailable the modal returns *"Layanan autentikasi database sedang tidak tersedia"* and no operational session is ever issued.
- **Read-Only Guest Mode:** Unauthenticated visitors enter a locked guest profile (`DEFAULT_GUEST_PROFILE`) with zero operational permissions. Backend `ROLE_GUEST` is restricted to `benchmark:read` and `reports:read` only (`backend/app/auth/supabase_auth.py`), so approvals, fleet mutation, and persona switching are rejected server-side with HTTP 403.
- **Next.js Route Middleware (`frontend/middleware.ts`):** `/dashboard` requires a well-formed, unexpired session JWT (`prehub_auth_token` cookie). Unauthenticated visits are redirected to `/dashboard?guest=1` and rendered as an explicitly-flagged read-only evaluation preview instead of an operational session.
- **Verified-Signature Enforcement:** FastAPI validates JWT signatures and active sessions with no `verify_signature=False` fallback; forged or expired tokens are rejected with HTTP 401.

### 9. Simulasi Bencana (Single Canonical Simulator)
- **Live Agentic Hazard Simulation:** Unified interactive simulation engine on the map canvas (`CrisisSimulatorBar.tsx`), invoking `POST /api/v1/simulate/stream` with real-time SSE event streaming.
- **Calibrated Multi-Model Evaluation:** Computes deterministic CPU OR-Tools / NetworkX detour corridors in $<150\text{ms}$, enforces BKHIT digital quarantine compliance, checks MST axle-load limits, and evaluates exponential perishability decay ($1 - e^{-\delta \cdot T}$).
- **Decommissioned Toy Sliders:** Fully purged legacy macro-slider "Simulasi" tab (`SimulationSection.tsx`) and dead `/simulation/chat` routes.

### 10. Laporan Audit Ledger (Operational Governance & Traceability)
- **Non-Repudiable Mitigation Ledger:** The Laporan tab (`ReportsSection.tsx`) serves as the official operational ledger ("Catatan Audit Mitigasi Logistik Pangan"), persisted to Supabase `route_approvals` with SQLite `route_decision_traces` fallback.
- **Multi-Action Logging:** Captures genuine human-in-the-loop decisions (`ACCEPT`, `REJECT`, `OVERRIDE`) with live sync indicators (`SYNCED` / `PENDING`), tactical maneuver directives (`REROUTE`, `HOLD`, `CONTINUE`), and operator justification notes.
- **Precise Chronology & Dynamic Exports:** Formats full ISO date-time with explicit timezone (`GMT+7`), interactive filter toolbar (search, action type, date range), and dynamic filtered PDF and JSON export generation. All mock fallback rows are eliminated.

### 11. Analytics Honesty (Empirical PIHPS Series & Honest Empty States)
- **Empirical Market Data:** Integrates live strategic food commodity price series for rice and red chili (`GET /api/v1/commodities/prices`) queried from Supabase `commodity_prices`.
- **Zero Fabricated Claims:** Completely eradicated ungrounded 24-hour risk cards (+18.5%, +24.5%), static causal chains, and synthetic Deck.gl arcs/nodes in favor of honest, transparent `"Data tidak tersedia"` empty states.

### 12. Decommissioned Stubs & Purged Time Replays
- **Purged Past/Future/Predict Tabs:** Purged mock Past, Future, and Predict dock tabs, synthetic fallback fixtures, `TimelineScrubber.tsx`, and dead backend endpoints (`/historical/episodes`, `/predictive/risks`).
- **Frontend API Auto-Sanitization:** `getBaseUrl()` automatically reroutes obsolete endpoints to `https://peta-nadi.onrender.com`, preventing 404s and CORS failures.

### 13. Economical 3-Tier News Gatekeeper, Red/Yellow Audit Zones & Port-Closure Failover (Phase 72)
- **DB-First Economical Ingestion:** `fetch_existing_processed_articles_map()` dedups via Supabase `news_articles` plus in-memory cache before any LLM call, so the 5-minute background RSS cycle never burns duplicate tokens — including for `DROPPED_IRRELEVANT` items.
- **Bureau/Dateline Stripping:** `strip_bureau_and_dateline_noise()` removes outlet headers (`ANTARA Bengkulu`, `Bengkulu (ANTARA) -`, `Medan (Antara)`) before gazetteer matching; location misses yield `is_geocoded=False` with null coordinates, never a province centroid. All tier metadata packs into the existing `ground_truth_metrics` JSONB column (no migration).
- **Red/Yellow Zone Intelligence:** Deterministic heuristic assigns `RED_CONFIRMED` / `YELLOW_CLARIFY` / `DROPPED_IRRELEVANT` with live LLM overlay only for unprocessed items. Map renders clickable Red (`#ef4444`) / Yellow (`#eab308`) zones with independent `Zona Merah` / `Zona Kuning` checkboxes; news `Fokus` and zone clicks open the stored Audit Trail (`inspectNewsOrZoneAuditTrail`) at zero simulation cost.
- **10-Hazard Dynamic Impact Model:** Canonical `flood`, `port_closure`, `marine_wave`, `road_closure`, `landslide`, `earthquake`, `volcanic_eruption`, `wildfire`, `congestion`, `other_disruption` with `custom_hazard_label`, `affected_modalities`, `passability`, `estimated_delay_hours` threaded through reasoning, assessment, and routing.
- **Port-Closure Alternate-Port Failover:** `isSeaportBlockedByHazard()` (`max(radiusKm + 8, 22)` km capture) + `findClosestOpenSeaport()` drive automatic `Truck Feeder -> Next Open Port -> Sea` intermodal failover for `Penutupan Pelabuhan`, with per-route tradeoff analysis (Pros, Cons, time-delta, cost-delta) on every route card.

### 14. Toponym Specificity Hierarchy, Crisis Predicate Gate & Multi-Regency Fan-Out (Phase 73)
- **4-Tier Toponym Ordering:** Gazetteer candidates rank by `(tier, -len)` — Tier-1 pinpoints (Sitinjau Lauik, Sipirok, Kelok 9) outrank Tier-2 Kabupaten/Kota, which outrank Tier-3 macro-corridors (Jalintim/Jalinteng/JTTS); string length breaks ties only within a tier. Completed Pan-Sumatra Kabupaten coverage (`sipirok` at `1.6050, 99.2778`, `asahan`, `deli serdang`, `langkat`, `tapanuli selatan`).
- **Route-Endpoint Masking:** `Jalan Lintas A-B` / `tol A-B` road-name substrings are blanked before Tier-2 matching when a Tier-1 pass or explicit `via` is present, so `"Pekanbaru-Padang"` never shadows `"Sitinjau Lauik"`.
- **Two-Factor Crisis Gate:** `STRICT_CRISIS_PREDICATES` (physical-disruption actions only) is the sole hazard signal; `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS` vetoes opinion/ceremonial pieces unless a `PHYSICAL_BLOCKAGE_PREDICATE` overrides. Bare nouns (`tol`, `pelabuhan`, `truk`) never trigger alone — `"Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar"` is `DROPPED_IRRELEVANT`.
- **Multi-Location Fan-Out:** `resolve_all_sumatra_locations()` returns ALL distinct locations (15 km dedupe, Medan HQ-noise drop) as `affected_locations[]`; lead-paragraph meta scraping (`og:description` + lead `<p>`) enriches title-only RSS items. The map renders N Red/Yellow polygons per multi-daerah report (each opening the parent Audit Trail) with `Wilayah Terdampak` pills in Evidence and News Cards.
- **Schema Version Invalidation:** `EXTRACTION_SCHEMA_VERSION = 2` packed in existing `ground_truth_metrics` JSONB; legacy rows auto re-tier on read with zero new LLM cost and zero migrations.

### 15. Agent Verification Gate, Hazard-Specific Geometry & 48h Freshness Lockdown (Phase 74)
- **4-Check Agent Verification Gate:** `run_agent_verification_gate()` enforces freshness (≤48h) / discourse / spatial-geocode / impact-corroborated checks with a strict verdict ladder; `NON_INCIDENT_DISCOURSE_MARKERS` plus removal of bare `banjir`/`longsor` from `PHYSICAL_BLOCKAGE_PREDICATES` stops academic/policy articles from reaching RED. Agent-2 pre-filters discourse/stale items; Evidence tab shows the stored 4-check audit per item.
- **Hazard-Specific Zone Geometry:** Agent-decided radii replace hardcoded circles — landslide/road_closure 2.8–3.5 km corridor wedge, port_closure 3.2 km, congestion 2.5 km, flood 4.8–6.0 km river ellipse, wildfire 7.5 km, marine_wave 8.5 km, volcanic_eruption 10.0 km, earthquake 12.0 km, regency warning 7.2–9.0 km — rendered as anisotropic polygons (backend polygon preferred, mirrored client table as fallback).
- **48h Freshness Lockdown:** Archival `/YYYY/MM/DD/` URL date gate, RFC-2822/ISO `pubDate` + `<meta property="article:published_time">` validation, `when:2d` Google News query constraint, true-`published_at` preservation (never ingestion time), client-side mirror guard, and `EXTRACTION_SCHEMA_VERSION = 3` auto re-verification of all legacy Supabase rows on read. Zero migrations, zero LLM contract changes.

### 16. Full-Body Scraping, Workhorse LLM Content Verifier & Post-Disaster Construction Guards (Phase 75)
- **Full-Body Article Scraper:** `enrich_article_description_if_needed()` no longer skips ≥90-char descriptions — short RSS teasers (< 450 chars) are enriched with scraped `<article>`/`<p>` body text up to 2,500 chars, persisted once per article (`body_scraped`, `article_body_chars`, `html_published_at`) in Supabase `ground_truth_metrics`.
- **Workhorse LLM Content Reader:** `extract_structured_news_batch()` feeds up to 1,600 chars of scraped body per article to `settings.opencode_driver_model` (NVIDIA NIM `deepseek-v4.1-flash` fallback) in 5-article chunks, returning `is_active_disaster`, `zone_tier`, `verified_sumatra_locations[]`, `recommended_radius_km`, and content-grounded `tier_reason`.
- **Post-Disaster Construction Guards:** Bare `"darurat"` removed from crisis/severity triggers; `pascabencana` (both spacings) + construction words (`pembangunan`, `tanggul`, `perbaikan`, `renovasi`, …) added to discourse markers; `other_disruption` without physical blockage can no longer corroborate impact — `"Pembangunan tanggul darurat pascabencana di Padang"` resolves to DROPPED, not RED.
- **Schema v4 + Badge:** `EXTRACTION_SCHEMA_VERSION = 4` auto re-verifies legacy rows on read with zero migrations; Evidence tab shows a `✓ Konten Artikel Dianalisis Workhorse LLM` badge per analyzed item.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Web App** | Next.js 14.2+ (App Router), React 18, TypeScript, TailwindCSS (Dark Glassmorphic UI) |
| **Spatial & GIS Rendering** | Mapbox GL JS v3, Deck.gl v8, Framer Motion, Turf.js |
| **Backend API** | FastAPI (Python 3.11+ / 3.13), Uvicorn ASGI Server, Pydantic v2 |
| **Multi-Agent Swarm** | LangGraph, LangChain Core, DeepSeek R1 / Google Gemini |
| **Database & Persistence** | SQLite 3 (WAL Mode + 5s Busy Timeout), PostgreSQL 15+ / PostGIS 3.3+, Supabase Managed Layer |
| **Cache & Event Bus** | Redis 7.0+ (Streams `lrip:stream:osint` & Pub/Sub) |
| **Optimization Engine** | NetworkX Dijkstra Shortest Path Solver & Mapbox Direction APIs |
| **Weather & Observations** | Open-Meteo Global Meteorological API & BMKG Observation Stations |
| **Containerization** | Docker Engine 24+, Docker Compose v2 (Multi-stage Next.js standalone runner) |

---

## Quick Start & Launchers

### 1. Requirements
- Python 3.11+ or 3.13+
- Node.js 20+
- Mapbox Access Token (configured in `frontend/.env.local` or root `.env`)
- Docker Engine & Docker Compose (optional for containerized deployment)

### 2. Local Installation

```bash
# Clone the repository
git clone https://github.com/Zhav1/peta-nadi.git prehub
cd prehub

# Backend setup
cd backend
python -m venv .venv
.\.venv\Scripts\activate          # Windows PowerShell / CMD
pip install -r requirements.txt
cp .env.example .env

# Frontend setup
cd ../frontend
npm install
cp .env.example .env.local
```

### 3. Launching (Local)

- **Windows Batch Launcher:**
  ```cmd
  start.bat
  ```
- **PowerShell Unified Launcher:**
  ```powershell
  .\start.ps1
  ```

### 4. Launching with Docker Compose

```bash
# Production multi-container launch
docker compose up --build -d

# Development mode with hot-reloading
docker compose -f docker-compose.yml -f docker-compose.override.yml up
```

- **URLs:**
  - **Frontend Web Command Center:** [http://localhost:3000](http://localhost:3000)
  - **Backend Swagger API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
  - **System Health Probes:** [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health) and [http://localhost:8000/health](http://localhost:8000/health)

---

## Testing & Verification

### Complete Backend Test Suite (216 Unit, Integration & E2E Tests)
```bash
cd backend
.\.venv\Scripts\python -m pytest tests/ -v
```
All 216 automated tests across 16 test modules pass with 100% reliability, covering data adapters, swarm agents, deterministic CPU Dijkstra routing, weather fusion, economic hedging, BKHIT/MST compliance, AIS vessel continuity, intermodal leg generation, and full pilot drills.

### Frontend Type Check, Automated Tests & Production Build
```bash
cd frontend
# TypeScript verification (0 errors)
npx tsc -p tsconfig.json --noEmit

# SpatialHash declutterer & RangeError safety tests
npm test

# Water-path corridor and estuary routing verification
npx tsx scripts/test_nautical_corridor.ts

# Fleet telemetry filter and estimated unit viewport verification
npx tsx scripts/test_phase70_logic.ts

# Production build verification (7/7 static routes)
npm run build
```

---

## Project Directory Structure

```
├── .agents/                    # Design system and agent orchestration rules
├── .planning/                  # Project memory, milestones, and phase roadmaps
│   └── phases/                 # Phase directories with plans, summaries, and walkthroughs
├── agents/                     # LangGraph 6-agent swarm nodes and consensus gate
├── backend/                    # FastAPI backend application
│   ├── app/
│   │   ├── adapters/           # BMKG, TomTom, Open-Meteo, AISstream adapters
│   │   ├── db/                 # Local SQLite storage with WAL concurrency
│   │   ├── routers/            # Health, Incidents, Approvals, Corridor, Vehicles, News, Routing, Intermodal, Compliance
│   │   ├── services/           # NetworkX routing, weather fusion, hedging, compliance
│   │   └── workers/            # Ingestion and OSINT background workers
│   ├── tests/                  # 133 pytest unit, integration & E2E tests
│   ├── Dockerfile              # Backend production container
│   └── run_demo.py             # Scenario injector & demo runner
├── frontend/                   # Next.js 14 Web Command Center
│   ├── app/                    # App Router pages (/dashboard, /demo-remote, /)
│   ├── components/             # Command Center Map, Sidebar, Telemetry, Layers, Dashboard
│   ├── hooks/                  # useFleetVehicles, useNewsVerification, useCrisisSocket
│   ├── lib/                    # aiDynamicRouter, mapboxRoutingService, types, api
│   └── Dockerfile              # Multi-stage Next.js standalone container
├── docs/                       # Technical blueprints, manuals, and test matrix
│   ├── PreHub_Pilot_Onboarding_Manual.md  # Official multi-persona pilot operational manual
│   ├── test_matrix.md                     # Complete inventory of 133 automated tests
│   └── SYSTEM_ARCHITECTURE.md             # System architecture and technical specifications
├── docker-compose.yml          # Production multi-container orchestration
├── docker-compose.override.yml # Local development bind-mount configuration
├── start.bat                   # Windows batch launcher
└── start.ps1                   # PowerShell unified launcher
```

---

## License
PreHub is developed for the **AI-Driven Logistics & Food Security Initiative 2026**.
All rights reserved.
