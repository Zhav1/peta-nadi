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

```bash
cd backend
.venv\Scripts\activate
python run_demo.py --scenario belawan_flood
```

Injects synthetic Belawan Port closure + Trans-Sumatra flooding events into Redis Streams,
triggering the full agent pipeline and populating the 3D dashboard.

For a dry run (no Redis required):
```bash
python run_demo.py --dry-run
```

## Project Structure

```
├── backend/          FastAPI API + run_demo.py
│   └── app/
│       ├── config.py         Settings (pydantic-settings)
│       ├── main.py           FastAPI entry point
│       ├── routers/          API endpoints
│       ├── services/         Redis client
│       └── db/               Supabase client
├── frontend/         Next.js 14 (Mapbox + Deck.gl)
├── agents/           LangGraph 6-agent swarm (Phase 3)
├── infra/
│   ├── supabase/migrations/  SQL schema
│   └── redis/                Redis setup guide
├── src/              Research scripts (PIHPS/BMKG data analysis)
└── .planning/        GSD project planning artifacts
```

## Build Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Foundation & Repo Setup | ✅ Complete |
| 1 | Data Ingestion Pipeline (BMKG, TomTom, AISstream, NASA) | TODO |
| 2 | OSINT & Headless Scraping (Lightpanda + PIHPS) | TODO |
| 3 | LangGraph Agent Swarm (6 agents + STM/LTM + GraphRAG) | TODO |
| 4 | 3D Map Dashboard (Next.js + Mapbox + Deck.gl) | TODO |
| 5 | Notifications & Human-in-the-Loop | TODO |
| 6 | Demo Polish & run_demo.py Finalization | TODO |
