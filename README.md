# PetaNadi — Logistics Resilience Intelligence Platform (LRIP)

> An AI-powered decision support platform that shifts Indonesia's logistics and disaster response from **reactive** to **proactive**. PetaNadi ingests real-time hazard data, detects disruptions across the North Sumatra logistics corridor, predicts cascading economic impacts (commodity price spikes), and delivers actionable intelligence to field coordinators and government executives — before the crisis escalates.

---

## Architecture at a Glance

```
Physical Hazard (BMKG/NASA) → Redis Streams → LangGraph 6-Agent Swarm
                                                      ↓
                        Consensus Gate (>85% confidence)
                                                      ↓
                     Supabase (PostGIS + TimescaleDB + pgvector)
                                                      ↓
              Next.js + Mapbox 3D Dashboard ← FastAPI WebSocket
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.13) |
| Agent Orchestration | LangGraph |
| Frontend | Next.js 14 + Mapbox GL JS + Deck.gl |
| Database | Supabase (PostgreSQL + PostGIS + TimescaleDB + pgvector) |
| Event Bus | Redis Streams (Upstash) |
| AI Models | Gemini Flash (vision) + DeepSeek V3 (reasoning) |
| Scraping | Lightpanda (PIHPS, marketplaces, social OSINT) |
| Notifications | WhatsApp Business API |

## Prerequisites

- Python 3.13+
- Node.js 22+
- [Upstash account](https://upstash.com) — free Redis database
- [Supabase account](https://supabase.com) — free project

## Setup

### 1. Clone & Configure Environment

```bash
git clone <repo-url>
cd Pidi.id
cp .env.example .env
# Fill in your credentials in .env
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env
# Fill in credentials
```

### 3. Database — Run Initial Migration

In your Supabase project SQL Editor, run the contents of:
```
infra/supabase/migrations/000_init.sql
```

This creates all tables (incidents, commodity_prices, ltm_episodes, kg_entities, etc.)
and seeds the North Sumatra knowledge graph.

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# NEXT_PUBLIC_MAPBOX_TOKEN is already filled in .env.example
```

## Running Locally

**Backend (Terminal 1):**
```bash
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```
→ API docs: http://localhost:8000/docs

**Frontend (Terminal 2):**
```bash
cd frontend
npm run dev
```
→ Dashboard: http://localhost:3000

## Demo (Phase 6)

You can launch the end-to-end simulator either online (using your configured Redis/Supabase credentials) or offline (using local in-memory mock databases and query caching).

### Running Offline Demo (Recommended - No Credentials Required)
This runs the full 6-agent swarm using in-memory mocks for Redis Streams, Supabase databases, and LTM vector spaces.
```bash
cd backend
# Run fast (0.1s delay between events)
backend\.venv\Scripts\python run_demo.py --offline --speed fast

# Run normal (1.0s delay between events, mimics live feed)
backend\.venv\Scripts\python run_demo.py --offline
```

### Running Online Demo
Ensure Redis and Supabase are configured in `.env`.
```bash
backend\.venv\Scripts\python run_demo.py --scenario belawan_flood
```

For a dry run (prints scenario info without injecting):
```bash
backend\.venv\Scripts\python run_demo.py --dry-run
```

To run the performance audit script:
```bash
backend\.venv\Scripts\python backend/scripts/perf_check.py
```

See [DEMO_SCRIPT.md](file:///d:/College/Pidi.id/DEMO_SCRIPT.md) for a step-by-step 3-minute pitch/walkthrough of the system.

## Project Structure

```
├── backend/          FastAPI API + run_demo.py
│   └── app/
│       ├── config.py         Settings (pydantic-settings)
│       ├── main.py           FastAPI entry point
│       └── db/               Supabase client
├── frontend/         Next.js 14 (Mapbox + Deck.gl)
├── agents/           LangGraph 6-agent swarm
├── infra/
│   └── supabase/migrations/  SQL schema
├── DEMO_SCRIPT.md    3-minute presentation walkthrough script
└── .planning/        GSD project planning artifacts
```

## Build Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Foundation & Repo Setup | ✅ Complete |
| 1 | Data Ingestion Pipeline (BMKG, TomTom, AISstream, NASA) | ✅ Complete |
| 2 | OSINT & Headless Scraping (Lightpanda + PIHPS) | ✅ Complete |
| 3 | LangGraph Agent Swarm (6 agents + STM/LTM + GraphRAG) | ✅ Complete |
| 4 | 3D Map Dashboard (Next.js + Mapbox + Deck.gl) | ✅ Complete |
| 5 | Notifications & Human-in-the-Loop | ✅ Complete |
| 6 | Demo Polish & run_demo.py Finalization | ✅ Complete |
| 7 | Interactive Guided Demo Mode | ✅ Complete |
| 8 | NVIDIA Architecture Integration (NIM, cuOpt, FourCastNet) | ✅ Complete |
| 9 | Responsive Layout & Stitch Screens Integration | ✅ Complete |
