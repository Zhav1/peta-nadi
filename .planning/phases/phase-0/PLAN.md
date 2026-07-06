# PLAN — Phase 0: Foundation & Repo Setup

**Phase:** 0
**Goal:** Working project skeleton with all services running locally. Every subsequent phase builds on this.
**Estimated Time:** 1 day
**Status:** TODO

---

## Context & Constraints

**Environment (detected):**
- Python 3.13.7 ✅
- Node.js v22.11.0 ✅
- npm 11.6.4 ✅
- git 2.42.0 ✅
- Docker: **NOT INSTALLED** — plan uses direct local services instead of Docker Compose

**Implication of no Docker:** We'll run Redis and rely on Supabase Cloud (not local emulator) for the database layer. This is actually fine for a solo hackathon project — it reduces infra friction and Supabase Cloud's free tier is sufficient for MVP. Docker can be added later for reproducible deploys.

**Pre-existing assets to preserve:**
- `src/` — research scripts (do not move or modify)
- All `.md` / `.pdf` / `.png` files in root — documentation artifacts

---

## Monorepo Structure to Create

```
d:\College\Pidi.id\
├── backend/                    ← FastAPI (Python)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             ← FastAPI entry point
│   │   ├── config.py           ← Settings (pydantic-settings)
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── health.py       ← /health endpoint
│   │   │   └── incidents.py    ← /incidents endpoint (stub)
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   └── redis_client.py ← Redis Streams connection
│   │   └── db/
│   │       ├── __init__.py
│   │       └── supabase_client.py ← Supabase connection
│   ├── requirements.txt
│   ├── .env.example
│   └── run_demo.py             ← Demo script skeleton
│
├── frontend/                   ← Next.js 14
│   ├── (scaffolded by create-next-app)
│   └── .env.example
│
├── agents/                     ← LangGraph agent code (Phase 3)
│   ├── __init__.py
│   └── README.md               ← Placeholder
│
├── infra/
│   ├── supabase/
│   │   └── migrations/
│   │       └── 000_init.sql    ← Initial DB schema
│   └── redis/
│       └── README.md           ← Redis setup instructions
│
├── .env.example                ← Root-level env vars reference
├── .gitignore
└── README.md
```

---

## Tasks

### Task 0.1 — Initialize Git Repository
- `git init` in `d:\College\Pidi.id`
- Create `.gitignore` (Python + Node + env files)
- Initial commit with existing files

**Acceptance:** `git status` shows clean working tree after initial commit.

---

### Task 0.2 — Backend Scaffold (FastAPI)
Create the `backend/` directory with full FastAPI skeleton.

**Files to create:**
- `backend/requirements.txt` — pinned dependencies
- `backend/app/main.py` — FastAPI app with CORS, lifespan, and router registration
- `backend/app/config.py` — `pydantic-settings` `Settings` class reading from `.env`
- `backend/app/routers/health.py` — `GET /health` returning `{status: ok, version: 0.1.0}`
- `backend/app/routers/incidents.py` — stub `GET /incidents` returning empty list
- `backend/app/services/redis_client.py` — Redis Streams connection factory using `redis-py`
- `backend/app/db/supabase_client.py` — Supabase client factory using `supabase-py`
- `backend/.env.example` — template with all required keys

**Dependencies (`requirements.txt`):**
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic-settings==2.3.0
redis==5.0.8
supabase==2.7.4
httpx==0.27.0
python-dotenv==1.0.1
```

**Acceptance:**
- `uvicorn app.main:app --reload` starts without errors
- `GET /health` returns `{status: ok}`
- `GET /docs` opens Swagger UI

---

### Task 0.3 — Redis Setup (Local, No Docker)
Install Redis locally on Windows using `winget` or WSL2 / Memurai (Windows-native Redis).

**Options (in priority order):**
1. **Memurai** (Windows-native Redis-compatible server) — `winget install Memurai.Memurai`
2. **WSL2 + Redis** — if WSL2 already installed: `wsl --install` then `sudo apt install redis-server`
3. **Upstash Redis** (cloud, zero local setup) — free tier, configure via URL in `.env`

**Recommendation:** Use **Upstash Redis** for now — it's free, requires zero local setup, and is production-ready. Local Redis can be configured later for offline demo scenarios.

**Acceptance:**
- Redis connection test passes: `redis_client.ping()` returns `True`
- `redis_client.xadd('test-stream', {'event': 'ping'})` succeeds
- Connection string stored in `.env` / `.env.example`

---

### Task 0.4 — Supabase Project Creation & Schema
Create the Supabase project and run the initial migration.

**Steps:**
1. Create project at https://supabase.com → `lrip-petanadi`
2. Enable extensions: `PostGIS`, `timescaledb`, `vector` (pgvector)
3. Run `infra/supabase/migrations/000_init.sql`

**Initial schema (`000_init.sql`):**
```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;

-- Data source health tracking
CREATE TABLE data_sources (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,          -- 'bmkg', 'tomtom', 'aisstream', 'nasa_firms', 'pihps'
  status      TEXT NOT NULL DEFAULT 'ok',    -- 'ok', 'degraded', 'down'
  last_ok_at  TIMESTAMPTZ,
  cached_at   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Incidents (validated crisis events)
CREATE TABLE incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  type            TEXT NOT NULL,              -- 'flood', 'port_closure', 'wildfire', 'congestion'
  severity        TEXT NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  status          TEXT NOT NULL DEFAULT 'unconfirmed', -- 'unconfirmed', 'validating', 'validated', 'resolved'
  confidence      FLOAT DEFAULT 0,            -- 0.0 - 1.0 (consensus gate threshold: 0.85)
  location        GEOGRAPHY(Point, 4326),     -- PostGIS point
  affected_area   GEOGRAPHY(Polygon, 4326),   -- PostGIS polygon
  evidence        JSONB DEFAULT '{}',         -- raw evidence from agents
  recommendations JSONB DEFAULT '[]',         -- Decision Support Agent output
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- Route approval log (Human-in-the-Loop KPI tracking)
CREATE TABLE route_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id     UUID REFERENCES incidents(id),
  operator_id     TEXT,
  recommended_route JSONB NOT NULL,
  approved_at     TIMESTAMPTZ DEFAULT NOW(),
  outcome         TEXT                        -- 'resolved', 'partial', 'no' (v1.1)
);

-- Time-series: commodity prices (TimescaleDB hypertable)
CREATE TABLE commodity_prices (
  time        TIMESTAMPTZ NOT NULL,
  commodity   TEXT NOT NULL,                  -- 'beras', 'cabai_merah', 'minyak_goreng', etc.
  region      TEXT NOT NULL,                  -- 'north_sumatra', 'national'
  price_idr   NUMERIC NOT NULL,
  source      TEXT NOT NULL                   -- 'pihps', 'tokopedia', 'shopee'
);
SELECT create_hypertable('commodity_prices', 'time');

-- LTM: Historical disaster-inflation episodes (pgvector)
CREATE TABLE ltm_episodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  embedding   vector(1536),                   -- semantic embedding for similarity search
  metadata    JSONB DEFAULT '{}',             -- disaster type, region, lag days, price impact %
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON ltm_episodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Knowledge graph: entities (Ports, Routes, Warehouses, Commodities)
CREATE TABLE kg_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,                  -- 'port', 'route', 'warehouse', 'commodity', 'supplier'
  name        TEXT NOT NULL,
  location    GEOGRAPHY(Point, 4326),
  metadata    JSONB DEFAULT '{}'
);

-- Knowledge graph: relationships
CREATE TABLE kg_relationships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity UUID REFERENCES kg_entities(id),
  to_entity   UUID REFERENCES kg_entities(id),
  relation    TEXT NOT NULL,                  -- 'depends_on', 'ships_via', 'located_in', 'supplies'
  weight      FLOAT DEFAULT 1.0,
  metadata    JSONB DEFAULT '{}'
);
```

**Acceptance:**
- Supabase dashboard shows all tables created
- `SELECT PostGIS_Version();` returns a version string
- Python `supabase_client.table('incidents').select('*').execute()` returns empty list (no error)

---

### Task 0.5 — Frontend Scaffold (Next.js 14)
Scaffold the Next.js frontend using `create-next-app`.

**Command:**
```bash
npx -y create-next-app@14 ./frontend --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

**Post-scaffold additions:**
- `frontend/.env.example` with Supabase URL + anon key + Mapbox token placeholders
- `frontend/app/page.tsx` — stub homepage with "PetaNadi — Loading..." placeholder
- Install Mapbox: `npm install mapbox-gl @types/mapbox-gl`
- Install Deck.gl: `npm install @deck.gl/core @deck.gl/layers @deck.gl/mapbox`

**Acceptance:**
- `npm run dev` inside `frontend/` starts on `localhost:3000`
- Homepage renders without console errors
- No TypeScript compilation errors

---

### Task 0.6 — Agents Directory Placeholder
Create the `agents/` directory structure for Phase 3 (LangGraph).

**Files to create:**
- `agents/__init__.py`
- `agents/README.md` — documents that this directory is built in Phase 3; references Phase 3 plan
- `agents/state.py` — `CrisisState` TypedDict skeleton (empty fields, serves as the shared type contract)

This exists so that `backend/` and `agents/` can import from each other with known paths from Day 1.

---

### Task 0.7 — run_demo.py Skeleton
Create the demo script with the full injection interface, but stub out the actual events.

**`backend/run_demo.py`:**
```python
"""
run_demo.py — PetaNadi Hackathon Demo Injector

Injects a synthetic Belawan Port closure + Trans-Sumatra flood scenario
into Redis Streams, triggering the full agent pipeline.

Usage:
    python run_demo.py [--scenario belawan_flood] [--dry-run]
"""
import argparse
import json
import redis
from datetime import datetime

SCENARIOS = {
    "belawan_flood": {
        "description": "Belawan Port closure + Trans-Sumatra Highway flooding",
        "events": []  # TODO: Phase 6 — populate with full synthetic dataset
    }
}

def main():
    parser = argparse.ArgumentParser(description="PetaNadi Demo Injector")
    parser.add_argument("--scenario", default="belawan_flood", choices=list(SCENARIOS.keys()))
    parser.add_argument("--dry-run", action="store_true", help="Print events without injecting")
    args = parser.parse_args()

    scenario = SCENARIOS[args.scenario]
    print(f"[run_demo.py] Scenario: {scenario['description']}")
    print(f"[run_demo.py] Events to inject: {len(scenario['events'])}")

    if args.dry_run:
        print("[run_demo.py] DRY RUN — no events injected")
        return

    # TODO: Phase 6 — inject events into Redis Streams
    print("[run_demo.py] Skeleton only — implement in Phase 6")

if __name__ == "__main__":
    main()
```

**Acceptance:**
- `python run_demo.py --dry-run` runs without errors and prints scenario info
- `python run_demo.py --help` shows usage

---

### Task 0.8 — Environment & .gitignore
Create root-level `.gitignore` and `.env.example`.

**`.gitignore`** covers: Python (`__pycache__`, `*.pyc`, `venv/`, `.venv/`), Node (`node_modules/`, `.next/`, `dist/`), env files (`.env`, `.env.local`), IDE files (`.vscode/`, `.idea/`), OS files (`.DS_Store`, `Thumbs.db`).

**Root `.env.example`:**
```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis (Upstash or local)
REDIS_URL=rediss://your-upstash-url
REDIS_PASSWORD=your-redis-password

# AI Models
GEMINI_API_KEY=your-gemini-key
DEEPSEEK_API_KEY=your-deepseek-key

# External Data APIs
TOMTOM_API_KEY=your-tomtom-key
AISSTREAM_API_KEY=your-aisstream-key
# BMKG and NASA FIRMS are public APIs — no key required

# Frontend
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

### Task 0.9 — Python Virtual Environment
Set up an isolated Python environment for the backend.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Acceptance:**
- `pip list` shows all packages from `requirements.txt` installed
- `python -c "import fastapi, redis, supabase; print('OK')"` passes

---

### Task 0.10 — README
Create root `README.md` with project overview, setup instructions, and demo launch steps.

**Sections:**
- Project overview (1 paragraph)
- Tech stack table
- Prerequisites (Python 3.13+, Node 22+, Supabase account, Upstash/Redis account)
- Setup steps (clone → env → backend install → frontend install → db migration)
- Run locally (backend + frontend commands)
- Demo: `python backend/run_demo.py` (note: Phase 6 completes this)

---

## Verification Checklist

| # | Check | Command | Expected |
|---|-------|---------|----------|
| V1 | FastAPI starts | `cd backend && uvicorn app.main:app --reload` | Server on port 8000, no errors |
| V2 | Health endpoint | `curl http://localhost:8000/health` | `{"status":"ok","version":"0.1.0"}` |
| V3 | Swagger UI | Open `http://localhost:8000/docs` | UI loads with all endpoints |
| V4 | Redis connection | `python -c "import redis; r=redis.from_url('$REDIS_URL'); print(r.ping())"` | `True` |
| V5 | Supabase connection | `python -c "from app.db.supabase_client import get_client; c=get_client(); print(c.table('incidents').select('count').execute())"` | Count = 0 (no error) |
| V6 | PostGIS active | Run in Supabase SQL editor: `SELECT PostGIS_Version()` | Returns version string |
| V7 | Frontend starts | `cd frontend && npm run dev` | localhost:3000 loads |
| V8 | Demo script | `cd backend && python run_demo.py --dry-run` | Prints scenario info, no errors |
| V9 | Git state | `git status` | Clean working tree (after commit) |

---

## Sequencing Note

Tasks 0.1 → 0.9 → 0.2 (backend) → 0.3 (Redis) → 0.4 (Supabase) → 0.5 (frontend) → 0.6 → 0.7 → 0.8 → 0.10

The git init (0.1) and venv (0.9) should happen first. Supabase setup (0.4) can be done in parallel with frontend scaffold (0.5) since they're independent.

---

## Phase 0 Complete → Next Step
After all verification checks pass, run `/gsd-plan-phase 1` to plan the Data Ingestion Pipeline.
