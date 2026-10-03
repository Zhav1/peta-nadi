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
     Multi-Persona Operations (Dispatcher, Port Coordinator, Regulator, Admin)
```

---

## Core Capabilities & Technical Implementations

### 1. Multi-Source Grounding & Pan-Sumatra News Intelligence
- **Pan-Sumatra Multi-Biro News Ingestion:** Real-time ingestion from LKBN ANTARA regional bureaus across 8 mainland Sumatra provinces (Sumut, Sumbar, Riau, Aceh, Sumsel, Lampung, Jambi, Bengkulu) and national economic outlets (ANTARA Ekonomi, CNBC, CNN).
- **Structured NLP Extraction:** Automated entity recognition for arterial corridor segments, 3–6h pre-disruption lead times, affected food commodities (rice, chili, shallots, oil), and physical ground-truth metrics (water depth cm, road blockades).
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

### 4. Coastal Nautical Sea-Lane & Air Multi-Modal Routing
- **Authentic Coastal Maritime Sea-Lanes:** Navigates along verified Indonesian nautical fairways (Malacca Strait, Sunda Strait, Indian Ocean West Coast) ensuring maritime routes around Sumatra never traverse landmasses.
- **Air Cargo Express Corridors:** Connects regional cargo airport nodes (KNO, BTJ, PKU, BIM, DJB, PLM, TKG) via Great Circle flight trajectories with first-mile and last-mile road feeder transport.
- **Hazard Collision & Hold/Delay Fallback:** When all primary and arterial bypass routes intersect disaster zones, the system surfaces an honest **Mitigasi Taktis: Tunda Keberangkatan (Hold / Delay)** recommendation instead of proposing compromised detours.

### 5. Multi-Persona Operations & Digital Compliance (Milestone M3)
- **Supabase Authentication & Multi-Role RBAC:** Role-based access control partitioning features for `DISPATCHER` (routing, rerouting approvals), `REGULATOR` (BKHIT quarantine audit, price volatility monitoring), and `GUEST` (evaluation sandbox).
- **Self-Serve Fleet Onboarding:** Drag-and-drop CSV manifest ingestion, manual vehicle onboarding modal, and TMS GPS telemetry ingestion webhooks.
- **Pan-Sumatra Intermodal Choke-Points:** Tracking 7 maritime/ferry ports (Belawan, Bakauheni, Dumai, Teluk Bayur, Panjang, Sibolga, Kuala Tanjung) and 11 mountain passes (Sitinjau Lauik, Kelok 9, Malalak, etc.) with automated delay multipliers ($1.0 \le M_{\text{intermodal}} \le 3.5$).
- **Closed-Form Spoilage Hedging Matrix:** Closed-form monetary tradeoff solver evaluating Continue vs Reroute vs Hold factoring 4-tier exponential perishability decay ($\delta = 0.025$ to $0.0005/\text{hr}$), official BPJT toll tariffs across Golongan I-V, and Pertamina fuel consumption.
- **Differentiated Regulatory Enforcement:** Deterministic `HARD_BLOCK` on missing BKHIT agricultural quarantine certificates for inter-island transits; tactical `WARNING` & bypass advisory with operator liability transfer override for heavy vehicles ($>8$ Ton) traversing Class III mountain corridors.

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

### Complete Backend Test Suite (133 Unit, Integration & E2E Tests)
```bash
cd backend
.\.venv\Scripts\python -m pytest tests/ -v
```
All 133 automated tests across Functional Requirements FR-1 through FR-20 pass with 100% reliability, covering data adapters, swarm agents, Dijkstra routing, economic hedging, BKHIT/MST compliance, and full pilot drills.

### Frontend Type Check & Production Build
```bash
cd frontend
npx tsc -p tsconfig.json --noEmit
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
│   │   ├── adapters/           # BMKG, TomTom, Earth2/NVIDIA adapters
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
