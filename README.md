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
```

---

## Core Capabilities & Technical Implementations

### 1. Multi-Source Grounding & Evidence Chain
- **BMKG Hydrometeorological Telemetry:** Real-time precipitation intensity, flood alerts, and observation station monitoring.
- **TomTom Traffic Speed Flow:** Live segment-level speed deltas, delay metrics, and congestion index caching.
- **Direct OSINT News Ingestion:** Automated RSS stream ingestion linking directly to specific Google News query topics rather than bare domain homepages.
- **PIHPS Price Stream:** Monitoring volatility and price spikes for strategic staple commodities (rice, chili, cooking oil).

### 2. Multi-Agent Swarm Intelligence (6 Specialist Agents)
- **Data Collection & Health Agent:** Ingests and normalizes multi-source sensor telemetries into unified spatial representations.
- **OSINT & Intelligence Agent:** Corroborates news and grassroots reports against PostGIS hazard polygons.
- **Congestion & Weather Forecast Agent:** Projects 24-48 hour congestion trends and atmospheric precipitation risks.
- **Logistics & Graph Routing Agent:** Computes optimal detour routes via NetworkX Dijkstra graph matrix with dynamic hazard penalties.
- **Price & Inflation Intelligence Agent:** Detects price anomalies on staple foods and projects regional price lag.
- **AI Decision Copilot:** Synthesizes executive multi-agency recommendations (*Continue*, *Reroute*, *Hold/Delay*) with deep Chain-of-Thought reasoning.

### 3. Coastal Nautical Sea-Lane & Air Multi-Modal Routing
- **Authentic Coastal Maritime Sea-Lanes:** Navigates along verified Indonesian nautical fairways (Malacca Strait, Sunda Strait, Indian Ocean West Coast) ensuring maritime routes around Sumatra never traverse landmasses.
- **Air Cargo Express Corridors:** Connects regional cargo airport nodes (KNO, BTJ, PKU, BIM, DJB, PLM, TKG) via Great Circle flight trajectories with first-mile and last-mile road feeder transport.
- **Hazard Collision & Hold/Delay Fallback:** When all primary and arterial bypass routes intersect disaster zones, the system surfaces an honest **Mitigasi Taktis: Tunda Keberangkatan (Hold / Delay)** recommendation instead of proposing compromised detours.

### 4. High-Contrast Fleet Tracking & Interactive Layer Controls
- **45 Active Multi-Modal Fleet Units:** Scaled distribution of trucks, maritime vessels, and cargo flights across all 10 provinces of Sumatra.
- **Calibrated Observable Movement:** Calibrated simulation pace (12x) driven by route distance in kilometers using the Haversine formula.
- **Globot-Style High-Contrast Markers:** Clean solid vehicle badges with bearing rotation for aircraft and zero neon glow halos.
- **Interactive Layer Filter Widget:** Real-time toggle controls for Trans-Sumatra baseline corridors, traffic bottleneck segments, weather radar polygons, and active logistics fleet.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Web App** | Next.js 14.2+ (App Router), React 18, TypeScript, TailwindCSS (Dark Glassmorphic UI) |
| **Spatial & GIS Rendering** | Mapbox GL JS v3, Deck.gl v8, Framer Motion, Turf.js |
| **Backend API** | FastAPI (Python 3.11+ / 3.13), Uvicorn ASGI Server, Pydantic v2 |
| **Multi-Agent Swarm** | LangGraph, LangChain Core, DeepSeek R1 / Google Gemini |
| **Database & Spatial Store** | PostgreSQL 15+ with PostGIS 3.3+, Supabase Managed Layer |
| **Cache & Event Bus** | Redis 7.0+ (Streams `lrip:stream:osint` & Pub/Sub) |
| **Optimization Engine** | NetworkX Dijkstra Shortest Path Solver & Mapbox Direction APIs |
| **Weather & Observations** | Open-Meteo Global Meteorological API & BMKG Observation Stations |

---

## Quick Start & Launchers

### 1. Requirements
- Python 3.11+ or 3.13+
- Node.js 18+ or 20+
- Mapbox Access Token (configured in `frontend/.env.local`)

### 2. Installation
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

### 3. Launching (1-Click)

- **Windows Batch:**
  ```cmd
  start.bat
  ```
- **PowerShell Launcher:**
  ```powershell
  .\start.ps1
  ```

- **URLs:**
  - **Frontend Web Command Center:** [http://localhost:3000](http://localhost:3000)
  - **Backend Swagger API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
  - **Health Probe:** [http://localhost:8000/health](http://localhost:8000/health)

---

## Testing & Verification

### Backend Test Suite (34 Unit & Integration Tests)
```bash
cd backend
.\.venv\Scripts\python -m pytest tests/
```

### Frontend Type Check
```bash
cd frontend
npx tsc --noEmit
```

---

## Project Directory Structure

```
├── .agents/                    # Design system and agent orchestration rules
├── .planning/                  # Project memory and roadmap tracking
├── agents/                     # LangGraph 6-agent swarm nodes and consensus gate
├── backend/                    # FastAPI backend application
│   ├── app/
│   │   ├── adapters/           # BMKG, TomTom, Earth2/NVIDIA adapters
│   │   ├── routers/            # Health, Incidents, Approvals, Corridor, Vehicles, News, Routing
│   │   ├── services/           # NetworkX routing, weather fusion, corridor context
│   │   └── workers/            # Ingestion and OSINT background workers
│   ├── tests/                  # 34 pytest unit & integration tests
│   └── run_demo.py             # Scenario injector & demo runner
├── frontend/                   # Next.js 14 Web Command Center
│   ├── app/                    # App Router pages (/dashboard, /demo-remote, /)
│   ├── components/             # Command Center Map, Sidebar, Telemetry, Layers
│   ├── hooks/                  # useFleetVehicles, useNewsVerification, useCrisisSocket
│   └── lib/                    # aiDynamicRouter, mapboxRoutingService, types, api
├── docs/                       # Technical blueprints and documentation
├── start.bat                   # Windows batch launcher
└── start.ps1                   # PowerShell unified launcher
```

---

## License
PreHub is developed for the **AI-Driven Logistics & Food Security Initiative 2026**.
All rights reserved.
