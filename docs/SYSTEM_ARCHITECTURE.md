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

## 3. Routing Engine & Multi-Modal Corridors

### 3.1 Ground Freight Routing (Trans-Sumatra Highway)
- Primary routing calculates Mapbox driving traffic paths across the Trans-Sumatra Highway network.
- Every polyline is evaluated against active hazard radii using the Haversine line-segment clearance algorithm (`isPolylineIntersectingHazardCircle`).
- If primary routes are compromised, the engine searches nearest clean arterial bypass nodes (`HIGHWAY_JUNCTION_NODES`).

### 3.2 Nautical Sea-Lane Routing (ALKI Corridors)
- Coastal maritime routing utilizes `SUMATRA_NAUTICAL_PERIMETER`, an ordered sequence of verified coastal waypoints along the Malacca Strait, Sunda Strait, and Indian Ocean.
- Pathfinding resolves shortest open-water nautical routes between ports without traversing landmasses.

### 3.3 Air Cargo Corridors
- Connects regional airport nodes (`CARGO_AIRPORT_NODES`: KNO, BTJ, PKU, BIM, DJB, PLM, TKG) using Great Circle flight vectors with first-mile and last-mile truck feeder connections.

### 3.4 Hold / Delay Tactical Fallback
- When all primary and bypass road corridors intersect the disaster perimeter, the router marks all routes `COMPROMISED` and provides a tactical **Hold / Delay** recommendation to stage vehicles safely at buffer hubs.

---

## 4. Frontend Command Center (Next.js 14 + Mapbox GL JS)

- **Dark Glassmorphic UI:** Built with Tailwind CSS and glassmorphism styling (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`).
- **Globot-Style Vehicle Markers:** High-contrast solid badges for trucks, maritime vessels, and aircraft with bearing rotation and zero neon glow halos.
- **Layer Filter Controls:** Independent toggles for baseline corridors, traffic bottlenecks, weather radar polygons, and active fleet units.
- **Focused Navigation:** Clean focus on the 4D Map with unfinished sections locked to eliminate ungrounded fixture dashboards.

---

## 5. Verification & Testing

- **Backend Unit & Integration Tests:** 34 tests covering adapters, agents, and scrapers in `backend/tests/`.
- **Static Type Safety:** 100% TypeScript type check coverage via `tsc --noEmit`.
