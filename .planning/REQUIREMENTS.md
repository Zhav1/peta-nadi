# REQUIREMENTS — LRIP / PetaNadi MVP

**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)
**Scope Lock Date:** 2026-07-05
**Deadline:** ~4 weeks

---

## Functional Requirements

### FR-1: Data Ingestion Pipeline
- **FR-1.1** Ingest live BMKG weather alerts and earthquake notifications via API polling
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
- **FR-3.1** Agent 1 — Data Collection Agent: normalize, validate, and route ingested data
- **FR-3.2** Agent 2 — OSINT & Hazard Agent: NER-based location extraction from unstructured text, geocode, and map to PostGIS
- **FR-3.3** Agent 3 — Prediction Agent: multi-horizon forecast (6h / 12h / 24h / 48h) using TFT or proxy model
- **FR-3.4** Agent 4 — Route Optimization Agent: generate alternative routes with risk scores using pgRouting / NetworkX; dynamic edge weights based on hazard severity
- **FR-3.5** Agent 5 — Economic Intelligence Agent: detect PIHPS anomalies, generate inflation forecasts with LTM historical multipliers
- **FR-3.6** Agent 6 — Decision Support Copilot: synthesize all agent outputs into executive summaries and actionable recommendations
- **FR-3.7** All agents share state via LangGraph `MemorySaver` (Redis STM); validated crises published to PostgreSQL
- **FR-3.8** Consensus Gate: alert promoted to "Validated" only when weighted confidence > 85% (Hazard 30%, Visual/Social 20%, Geospatial 30%, LTM Economics 20%)

### FR-4: GraphRAG Knowledge Graph
- **FR-4.1** Seed knowledge graph with North Sumatra corridor entities: Belawan Port, Dumai Port, Trans-Sumatra Highway, major warehouses, commodity flows (cooking oil, rice, fuel)
- **FR-4.2** Entity types: Ports, Routes, Warehouses, Suppliers, Commodities; relationships: Depends On, Ships Via, Located In
- **FR-4.3** Graph traversal: given a disruption event, find all downstream dependency chains
- **FR-4.4** Combine graph traversal with pgvector semantic search (SOPs, historical playbooks)
- **FR-4.5** Explainability output: structured causal chain (Port closure → % supply delayed → N affected warehouses → price impact estimate)

### FR-5: Dual-Mode Engine
- **FR-5.1 (Passive Mode):** Continuous 24/7 monitoring; polling at normal API rates; anomaly detection and flagging
- **FR-5.2 (Crisis Simulation Mode):** User can inject a synthetic disaster polygon onto the map; system enters Crisis Mode immediately
- **FR-5.3** Crisis Mode triggers: Lightpanda scraping shifts to 15-minute intervals; swarm runs full analysis pipeline
- **FR-5.4** `run_demo.py`: deterministic script that injects synthetic anomalies (mocked NASA polygons, TomTom delays, pre-scraped PIHPS JSONs) into Redis Streams for demo reliability

### FR-6: Real-Time Map UI (3D Dashboard)
- **FR-6.1** Mapbox GL JS + Deck.gl rendering: flight paths, maritime vectors, TomTom congestion overlays, NASA fire heatmaps — all at 60 FPS
- **FR-6.2** Crisis pins on map; click to expand Tri-Panel Sidebar
- **FR-6.3 Sidebar Tab 1 — Evidence:** Raw data used by swarm (TikTok transcript, TomTom delay graph, NASA signature)
- **FR-6.4 Sidebar Tab 2 — Mitigation Detour:** Alternative route rendered by routing engine
- **FR-6.5 Sidebar Tab 3 — Economic Fallout:** PIHPS/market price graphs + inflation arc forecast
- **FR-6.6** Timeline Scrubber: playback bar to rewind and replay how a crisis unfolded hour-by-hour
- **FR-6.7** "Simulate Disaster" UI: drop a disaster polygon onto the map to trigger Crisis Mode
- **FR-6.8** Data freshness badges: "Last Updated: X min ago" and green/yellow/red source health indicators for every data layer (minimum: BMKG + TomTom before pilot)
- **FR-6.9** Glassmorphism premium design; dark mode; smooth animated state transitions

### FR-7: Alert & Notification Delivery
- **FR-7.1** Validated alerts (> 85% consensus) trigger WhatsApp Business API push notifications
- **FR-7.2** Only "Validated" alerts generate notifications; "Unconfirmed" anomalies are dashboard-only
- **FR-7.3** Notification content: disruption summary, recommended action, and dashboard deep-link

### FR-8: Human-in-the-Loop Logging
- **FR-8.1** When operator clicks "Approve" on a route recommendation, log: timestamp, recommended route, operator ID
- **FR-8.2** Approval log is queryable for KPI measurement (route acceptance rate metric)

### FR-9: Demo Script & Synthetic Data
- **FR-9.1** `run_demo.py` must be runnable with a single command and produce a complete end-to-end crisis simulation within 3 minutes
- **FR-9.2** Synthetic dataset: North Sumatra corridor — Belawan Port closure scenario + Trans-Sumatra flooding + cooking oil supply shock

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Alert detection latency < 15 minutes from physical event to validated dashboard alert |
| NFR-2 | Alert precision > 85% (false alarm suppression via consensus gate) |
| NFR-3 | Route acceptance rate target: 70% |
| NFR-4 | Map UI: 60 FPS rendering with hundreds of thousands of data points |
| NFR-5 | API fallback: last-known-good cache prevents data gaps from crashing the system |
| NFR-6 | Offline resilience: Redis STM preserves crisis state if external APIs go down mid-event |
| NFR-7 | Cost constraint: cloud/compute overhead Rp10M–Rp40M/month (open APIs + tiered LLM routing) |

---

## Out of Scope (MVP)
- Driver mobile app with offline sync (WatermelonDB + CRDT) → v2
- Self-serve operator GPS onboarding SDK → v2 (manual setup call is sufficient for pilot)
- Full multi-province rollout → post-pilot
- Outcome follow-up on approved route recommendations → v1.1
- OpenSky aviation data (basic fallback only, not core for MVP)
