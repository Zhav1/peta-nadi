# PreHub System Architecture & Technical Specification

## Overview

PreHub is a spatial decision support platform designed to prevent food supply chain failures caused by hydrometeorological disasters and infrastructure bottlenecks across Indonesia, with a primary operational focus on the Trans-Sumatra logistics corridor.

---

## 1. Multi-Source Telemetry & Normalization Layer

The platform continuously ingests heterogeneous data streams into standardized spatial features indexed by H3 hexagonal grids:

| Source | Protocol / Format | Polling Cadence | Primary Attributes |
|---|---|---|---|
| **BMKG Radar** | REST / XML / GeoJSON | 15 minutes | Precipitation intensity (mm/h), flood warnings, observation station health |
| **TomTom Traffic Flow** | REST / JSON | 60 seconds | Current speed, free-flow speed, segment delay (seconds), congestion level |
| **Pan-Sumatra Official News & Press (ANTARA 8 Biro & Press)** | XML RSS & REST / JSON | 3 minutes (TTL Cached) | Tier 1 (ANTARA 8 Biro, BMKG, BNPB) & Tier 2 (CNBC, CNN, Regional Press), NLP structured entities, corridor segment, lead-time hours |
| **PIHPS Bank Indonesia** | REST / JSON | Daily / Real-time | Price deviations for rice, shallots, bird's eye chili, and cooking oil across Sumatra markets |
| **AISStream Maritime** | WebSocket / JSON | Real-time | Vessel MMSI, ship name, speed over ground, heading, coordinates along Sumatra coastline |
| **BPJT & Pertamina** | Local Cache & Ingestion | Static / Calibrated | Official Trans-Sumatra toll tariffs (Golongan I–V) and subsidized/industrial diesel fuel consumption |

---

## 1.1 Multi-Outlet News Intelligence Engine (Pan-Sumatra)

The news intelligence subsystem (`backend/app/services/news_aggregator.py` and `backend/app/nlp/news_extractor.py`) ingests authoritative news and official bulletins across all 8 mainland provinces of Sumatra:

- **Tier 1 Official Feeds ($w_{\text{tier}} = 0.95$):** LKBN ANTARA regional bureaus (Sumut, Sumbar, Riau, Aceh, Sumsel, Lampung, Jambi, Bengkulu) and ANTARA Ekonomi.
- **Tier 2 Authoritative Press ($w_{\text{tier}} = 0.85$):** CNN Indonesia, CNBC Indonesia Market, and targeted Google News RSS queries for key logistics bottlenecks (Sitinjau Lauik, Bakauheni, Selat Malaka, Jalintim, Jalinsum).
- **Structured NLP Extraction (Gemini Flash + Fast Deterministic Fallback):**
  - **Incident & Temporal Classification:** Detects incident types (*flood, landslide, marine wave, port congestion, supply buffer*) and phases (*forecast early warning with 3–6h lead-time, active disruption, clearing recovery*).
  - **Pan-Sumatra Location & Corridor Gazetteer:** Matches entities against an expanded gazetteer of Sumatra ports, arterial junctions, and toll roads.
  - **Ground-Truth Metrics:** Extracts flood water levels (cm), debris lengths (m), and lane blockade status.
- **Autonomous Swarm Dispatch:** Critical road blockages (`severity == "critical"` or `lane_status == "BLOCKED"`) automatically trigger background LangGraph swarm execution (`run_crisis_event`) with deduplication.

---

## 2. Multi-Agent Swarm Orchestration (LangGraph)

The core reasoning engine consists of 6 specialized agents orchestrated through LangGraph state graphs:

```
[ Ingested Telemetry ]
          |
          v
1. Data Collection & Sensor Agent
          |
          v
2. OSINT & Ground Hazard Agent
          |
          v
3. Consensus Engine & Grounding Gate (Threshold >= 0.85)
          |
     +----+----+
     |         |
     v         v
4. Traffic/Weather     5. Price & Inflation
   Prediction Agent       Intelligence Agent
     |         |
     +----+----+
          |
          v
6. Route Optimization Agent (NetworkX Dijkstra + Nautical Sea-Lanes)
          |
          v
7. AI Decision Support Copilot (DeepSeek R1 Executive Trace)
          |
          v
[ Human-in-the-Loop Operator Gate ]
```

---

## 3. Operational Hedging, Compliance & Intermodal Engine (Milestone M3)

### 3.1 Intermodal Choke-Point Registry & Delay Multiplier
- Tracks 18+ strategic hubs across Sumatra (7 maritime/ferry ports and 11 mountain passes/conjunctions).
- Evaluates queue dwell times and calculates the dynamic Intermodal Delay Multiplier:
  $$M_{\text{intermodal}} = 1.0 + 0.15 \times N_{\text{queue}} \times \text{SeverityWeight}$$
  clamped to the interval $[1.0, 3.5]$.

### 3.2 Spoilage Hedging Calculator
- Evaluates closed-form monetary tradeoffs across three actionable policies:
  $$\text{Cost}(\text{Continue}) \quad \text{vs} \quad \text{Cost}(\text{Reroute}) \quad \text{vs} \quad \text{Cost}(\text{Hold})$$
- Factors 4-tier exponential perishability decay ($\delta = 0.025$ to $0.0005/\text{hr}$), official BPJT Sumatra toll tariffs across Golongan I-V, Pertamina diesel rates modulated by market inflation, and cargo spot valuations.

### 3.3 Digital Regulatory Compliance & Enforcement
- **BKHIT Quarantine Gate:** Strictly enforces `HARD_BLOCK` on inter-island / strait crossing shipments lacking verified agricultural quarantine certificates.
- **MST Axle-Load Constraint:** Evaluates vehicle gross vehicle weight (GVW) against Indonesian road classes, issuing `WARNING` and bypass advisories on Class III collector/mountain corridors for vehicles exceeding 8.0 Ton MST, with human-in-the-loop liability transfer override logging.

---

## 4. Routing Engine & Multi-Modal Corridors

### 4.1 Ground Freight Routing (Trans-Sumatra Highway)
- Primary routing calculates Mapbox driving traffic paths across the Trans-Sumatra Highway network.
- Evaluates polyline clearance against active hazard radii using the Haversine line-segment clearance algorithm (`isPolylineIntersectingHazardCircle`).
- If primary routes are compromised, the engine searches nearest clean arterial bypass nodes (`HIGHWAY_JUNCTION_NODES`).

### 4.2 Nautical Sea-Lane Routing (ALKI Corridors)
- Coastal maritime routing utilizes `SUMATRA_NAUTICAL_PERIMETER`, an ordered sequence of verified coastal waypoints along the Malacca Strait, Sunda Strait, and Indian Ocean.
- Pathfinding resolves shortest open-water nautical routes between ports without traversing landmasses.

### 4.3 Air Cargo Corridors
- Connects regional airport nodes (`CARGO_AIRPORT_NODES`: KNO, BTJ, PKU, BIM, DJB, PLM, TKG) using Great Circle flight vectors with first-mile and last-mile truck feeder connections.

### 4.4 Hold / Delay Tactical Fallback
- When all primary and bypass road corridors intersect the disaster perimeter, the router marks all routes `COMPROMISED` and provides a tactical **Hold / Delay** recommendation to stage vehicles safely at buffer hubs.

---

## 5. Storage, Concurrency & Containerization

### 5.1 SQLite Local Persistence with Write-Ahead Logging (WAL)
- Operates local database `prehub_local.db` with `PRAGMA journal_mode=WAL;` and `PRAGMA busy_timeout=5000;`.
- Provides thread-safe concurrent reads and writes across FastAPI worker processes without locking deadlocks.
- Stores operator decision traces, ground-truth trip outcomes (T+12h, T+24h), custom fleet assets, and offline session records.

### 5.2 Multi-Container Production Orchestration
- Orchestrated via `docker-compose.yml` with dual-profile support (production and development override).
- Next.js frontend compiled via multi-stage Alpine runner executing as non-root user `nextjs` (UID 1001) using Next.js standalone output.
- Uvicorn backend with persistent data volumes for SQLite and native container healthcheck probes (`GET /api/v1/health`).
- Redis 7 alpine message broker with persistent storage.

---

## 6. Verification & Automated Testing

- **Automated Test Suite:** 133 automated unit, integration, and end-to-end tests cataloged across Functional Requirements FR-1 through FR-20 in `backend/tests/`.
- **Pilot E2E Drills (`test_pilot_e2e.py`):** 8 automated tests validating the complete lifecycle under real Pan-Sumatra geographic constraints:
  - Drill 1: Belawan - Pekanbaru perishable detour with spoilage hedging.
  - Drill 2: Bakauheni strait crossing quarantine block and certificate release.
  - Drill 3: Sitinjau Lauik MST axle-load mountain pass warning and liability override.
  - Data integrity invariant validation across 54/56 road nodes, BPJT tariffs, and Pertamina rates.
- **Static Type Safety:** 100% TypeScript type check coverage via `npx tsc -p frontend/tsconfig.json --noEmit`.
- **Non-AI Aesthetic Compliance (NFR-11):** 100% monochrome SVG Lucide icons, dark glassmorphism styling, zero emojis, and zero marketing boasting.
