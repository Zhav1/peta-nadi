# PreHub — Food Logistics Disruption Early Warning & Mitigation Decision Support System

> **PreHub** (*Predictive Logistics Hub & Early Warning System*) is an AI-powered decision support platform that shifts Indonesia's food distribution and disaster response from **reactive** to **proactive**. PreHub ingests real-time multisource data, detects logistics disruptions across the North Sumatra corridor, calculates operational and economic risks, and delivers actionable evidence-grounded mitigations (*Continue*, *Reroute*, or *Hold/Delay*) directly to logistics dispatchers and government executives.

---

## 🏛️ System Architecture

```
Multisource Telemetry (BMKG, TomTom, Google News RSS, Open-Meteo, PIHPS)
                             ↓
             Redis 7 Pub/Sub & OSINT Ingestion Queue
                             ↓
       LangGraph 6-Agent Swarm (DeepSeek R1 via NVIDIA NIM)
                             ↓
           Risk Assessment & Consensus Gate (≥85%)
                             ↓
      NetworkX Dijkstra Graph Router & Mapbox Visualizer
                             ↓
   PreHub Command Center 4D + B2G Cabinet Briefing Center
```

---

## 🚀 Key Features

1. **Multi-Source Grounding & Evidence Chain:**
   * Live BMKG hydrometeorological radar and extreme weather warnings.
   * Real-time TomTom traffic speed delta and corridor segment delay caching.
   * Automated Google News RSS OSINT crawler with keyword scoring and Redis stream publishing.
   * Open-Meteo atmospheric forecast API for 24-hour precipitation and flood risk.
   * PIHPS commodity price variance and volatile food inflation tracking.

2. **Multi-Agent Swarm Intelligence (6 Specialist Agents):**
   * **Data Collection & Health Agent:** Validates and normalizes multi-source sensor telemetries.
   * **OSINT & Intelligence Agent:** Corroborates news and grassroots reports with PostGIS hazard polygons.
   * **Congestion & Weather Forecast Agent:** Computes 48-hour traffic trends & Open-Meteo precipitation risks.
   * **Logistics & Graph Routing Agent:** Computes optimal detour routes via NetworkX Dijkstra graph solver with dynamic hazard penalty weighting.
   * **Price & Inflation Intelligence Agent:** Detects price anomalies on staples and projects inflation impacts.
   * **AI Decision Copilot:** Synthesizes executive multi-agency recommendations (*Continue*, *Reroute*, *Hold/Delay*) with deep reasoning traces using **DeepSeek R1 via NVIDIA NIM**.

3. **High-Performance Command Center (Next.js 14 + WebGL):**
   * Persistent 6-Agent Swarm Live Health Widget with real-time confidence scores and node execution status.
   * Always-alive map with real-time TomTom segment traffic colors (green/yellow/red) and weather polygons on initial load.
   * 60 FPS route-bound fleet vector layer with dynamic bearing rotation (Ships, Trucks, Aircraft).
   * Deck.gl Arc & Scatterplot spatial commodity flow layers.
   * Multi-Agency Simulation Sandbox (What-If Advisor with 5–50 km shockwave radius).
   * B2G Cabinet Briefing Center with Print-to-PDF and JSON telemetry export.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Web App** | Next.js 14.2+ (App Router), React 18, TypeScript, TailwindCSS (Dark Glassmorphic UI) |
| **Spatial & GIS Rendering** | Mapbox GL JS v3, Deck.gl v8, Framer Motion, Turf.js |
| **Backend API** | FastAPI (Python 3.11+ / 3.13), Uvicorn ASGI Server, Pydantic v2 |
| **Multi-Agent Swarm** | LangGraph, LangChain Core, DeepSeek R1 (via NVIDIA NIM) / Google Gemini |
| **Database & Spatial Store** | PostgreSQL 15+ with PostGIS 3.3+, Supabase Managed Layer |
| **Cache & Event Bus** | Redis 7.0+ (Streams `lrip:stream:osint` & Pub/Sub) |
| **Optimization Engine** | NetworkX Dijkstra Shortest Path Solver & Mapbox Direction APIs |
| **Weather Forecast** | Open-Meteo Free Global Meteorological API & BMKG Observation Stations |
| **E2E & Visual Verification** | Playwright Test Suite (Chromium Headless) |

---

## ⚡ Quick Start & 1-Click Launchers

### 1. Requirements
* Python 3.11+ or 3.13+
* Node.js 18+ or 20+
* Mapbox Access Token (free at [mapbox.com](https://mapbox.com))

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Zhav1/peta-nadi.git prehub
cd prehub

# Backend setup
cd backend
python -m venv .venv
.\.venv\Scripts\activate          # Windows (PowerShell/CMD)
pip install -r requirements.txt
cp .env.example .env

# Frontend setup
cd ../frontend
npm install
cp .env.example .env.local
```

### 3. Launching Both Backend & Frontend (1-Click)

* **Windows Batch (Double-Clickable):**
  ```cmd
  start.bat
  ```
* **PowerShell Launcher:**
  ```powershell
  .\start.ps1
  ```

* **URLs:**
  * **Frontend Web Command Center:** [http://localhost:3000](http://localhost:3000)
  * **Backend Swagger API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
  * **Health Probe:** [http://localhost:8000/health](http://localhost:8000/health)

---

## 🧪 Testing & Verification

### Backend Test Suite (34 Unit & Integration Tests)
```bash
cd backend
.\.venv\Scripts\pytest
```

### Frontend Static Build
```bash
cd frontend
npm run build
```

### Automated Playwright Screenshots
```bash
cd frontend
npx playwright test e2e/capture-screenshots.spec.ts
```

---

## 📂 Project Directory Structure

```
├── .planning/                  # GSD Project Memory & Milestone Tracking
├── agents/                     # LangGraph 6-Agent Swarm Nodes & Consensus Gate
├── backend/                    # FastAPI Backend Application
│   ├── app/
│   │   ├── adapters/           # BMKG, TomTom, Earth2/NVIDIA adapters
│   │   ├── routers/            # Health, Incidents, Approvals, Corridor, Vehicles, Routing
│   │   ├── services/           # cuOpt, Weather Fusion, Corridor Context, Geocoding
│   │   └── workers/            # Ingestion & OSINT background workers
│   ├── tests/                  # 34 pytest unit & integration tests
│   └── run_demo.py             # Scenario injector & offline demo runner
├── frontend/                   # Next.js 14 Web Command Center
│   ├── app/                    # App Router pages (/dashboard, /demo-remote, /)
│   ├── components/             # Command Center Map, Sidebar, Analytics, Simulation, Reports
│   └── e2e/                    # Playwright screenshot & E2E test specs
├── docs/                       # Technical Documentation & Booklets
│   ├── Dokumen_Pendukung_PreHub.md  # Official Comprehensive Technical Document
│   └── screenshots/            # Automated 1080p high-fidelity UI screenshots
├── start.bat                   # Windows 1-click launcher
└── start.ps1                   # PowerShell unified launcher
```

---

## 📄 License & Submissions
PreHub is developed for the **AI-Driven Logistics & Food Security Initiative 2026**.
All rights reserved.
