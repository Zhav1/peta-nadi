# PROJECT: LRIP / PetaNadi — Logistics Resilience Intelligence Platform

## Vision
An AI-powered decision support platform that shifts logistics and disaster response from **reactive** to **proactive**. PetaNadi ingests real-time physical hazard data (weather, traffic, maritime, wildfire), detects logistics disruptions, predicts cascading economic impacts (commodity price spikes), and delivers actionable intelligence to field coordinators and government executives — all before the crisis escalates.

The core differentiator is the **"TheoTown" Dual-Mode Engine**: a live sentinel in normal operations, and an interactive crisis simulation sandbox where decision-makers drop synthetic disasters onto a 3D map and watch the AI swarm compute reroutes and inflation forecasts in real-time, powered by NVIDIA's enterprise routing and weather APIs.

## Problem Statement
Indonesia's logistics network is uniquely fragile. A single physical shock — a flooded bridge on the Trans-Sumatra Highway, port congestion at Belawan — creates a domino effect: traffic, commodity shortages, and eventually localized inflation. Decision-makers currently have no way to "see the math" behind these failures before prices surge. Monitoring is fragmented across weather apps, GPS tools, and manual social media trawls.

## Target Users
- **Operations Coordinators** (Fleet Managers, NGO Coordinators, Port Ops): Real-time alerts, alternative routing, immediate execution.
- **Strategic Decision Makers** (BPBD/BNPB Leadership, Ministry Executives, Supply Chain Directors): Macro resilience, resource allocation, crisis simulation, inflation mitigation.

## Tech Stack
- **Backend:** FastAPI (Python) — high-throughput webhook API gateway
- **Agent Orchestration:** LangGraph — stateful multi-agent cognitive swarm
- **Frontend:** Next.js 14 + Mapbox GL JS + Deck.gl — 3D crisis map
- **Database (Supabase):**
  - PostgreSQL / PostGIS — geospatial intersection calculations
  - TimescaleDB — high-frequency time-series (prices, traffic velocity)
  - pgvector — Long-Term Memory (LTM) semantic storage for historical disaster episodes
- **Event Bus:** Redis Streams — zero-loss telemetry ingestion; Redis KV — Short-Term Memory (STM) for active crisis state
- **AI Models & Fallbacks:** Gemini Flash (vision) + DeepSeek V3 (primary reasoning) with **NVIDIA NIM** (Llama 3.1) as an automatic, seamless failover layer.
- **Routing Engine:** pgRouting (cost matrix) + **NVIDIA cuOpt** (VRP constraint solving for multi-agent fleets).
- **Weather Prediction:** **NVIDIA Earth-2 (FourCastNet)** (replaces custom MLOps/LSTMs for macro-weather forecasting).
- **Headless Scraping:** Lightpanda — PIHPS, marketplace prices, TikTok/social OSINT
- **Notifications:** WhatsApp Business API (MVP alert delivery for validated crises)
- **Knowledge Graph:** GraphRAG over entity graph (Ports → Routes → Warehouses → Commodities)

## External API Dependencies
| API | Role | Status |
|-----|------|--------|
| BMKG | Ground truth weather / seismic alerts | Integration started (src/) |
| NVIDIA Earth-2 (FourCastNet) | Predictive macro-weather forecasting | Planned (Architecture Update) |
| NVIDIA cuOpt | Complex fleet routing (VRP) optimization | Planned (Architecture Update) |
| NVIDIA NIM | High-availability LLM failover endpoints | Planned (Architecture Update) |
| TomTom Traffic | Congestion detection | Pending |
| AISstream.io | Maritime / vessel tracking | Pending |
| NASA FIRMS | Wildfire / active fire polygons | Pending |
| PIHPS | Government commodity prices | Integration started (src/) |
| Tokopedia / Shopee | Market price scraping | Pending (Lightpanda) |
| Mapbox GL JS | 3D map rendering | Pending (frontend) |
| OpenSky Network | Aviation bottleneck detection | Pending |

## MVP Scope — North Sumatra Corridor (Pilot)
- **Geographic Scope:** Belawan Port → Trans-Sumatra Highway corridor (North Sumatra)
- **Synthetic Data:** `run_demo.py` injects realistic mock crisis events into Redis Streams for demo reliability
- **Real API Data:** BMKG + PIHPS live (already partially integrated)
- **Deferred to v2:** Driver mobile app (WatermelonDB/CRDT), self-serve operator onboarding, full multi-province rollout

## Success Metrics (MVP)
1. `< 15 minutes` from physical disruption → validated dashboard alert
2. `> 85%` alert precision (multi-source consensus gate before pushing)
3. `70%` acceptance rate for AI-optimized route recommendations
4. Commodity price volatility under `5%` during a monitored crisis phase
5. Demo: flawless end-to-end simulation run (`run_demo.py`) for hackathon judges

## Business Model
- **B2G SaaS:** Dashboard licensing to BNPB, Kemendag, Bappenas, provincial governments
- **B2B API:** Route optimization alert subscriptions for logistics operators (JNE, SiCepat)
- **Tiers:** Freemium (monitoring maps) → Professional (AI Copilot + routing) → Enterprise/Government (full GraphRAG + simulation modules)

## Team
- Solo developer, AI-assisted development
- Timeline: ~4 weeks to hackathon MVP (accelerated with AI tooling)

## Context Files
- `LRIP Master Technical Blueprint (1).md` — authoritative v3.0 system design
- `ide-2-v2.md` — TheoTown dual-mode engine spec (v3.0 PetaNadi PRD)
- `src/` — existing data analysis scripts (PIHPS/BMKG data pipeline research)
- `architecture-1.md` — preliminary architecture diagrams (UMKM Assistant era, now superseded)
