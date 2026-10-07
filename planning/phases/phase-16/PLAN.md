# PLAN — Phase 16: API Ingestion Adapters, AI Copilot CoT Prompt Injection & Frontend Binding

**Phase:** 16  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** Connect ready API adapters (BMKG, TomTom, PIHPS) to FastAPI backend & Supabase, aggregate into `get_corridor_context()`, inject structured context into AI Copilot prompt with explicit Chain of Thought (CoT) output, and bind live weather/inflation badges + Mapbox overlay indicators on the frontend.

---

## 1. Backend Ingestion & Corridor Context Aggregator (`backend/app/services/corridor_service.py`)

- **Service Module:** `backend/app/services/corridor_service.py`
  - Implement `async def get_corridor_context(corridor_id: str = "sumatra_belawan_medan") -> Dict[str, Any]`
  - Aggregates:
    1. **BMKG Weather:** `weather: { status, rainfall_mm, visibility, alert_summary }` via `BMKGAdapter` / live cache.
    2. **TomTom Traffic:** `traffic: { congestion_level_pct, delay_minutes, active_incidents, flow_speed_kmh }` via `TomTomAdapter` checkpoints.
    3. **PIHPS Commodity Prices:** `commodity_prices: { chili_price, rice_price, price_anomaly_detected, inflation_trend_pct, commodities }` via `PIHPSScraper` / Supabase `commodity_prices` time-series table.
  - Automatically syncs data source health in Supabase `data_sources` table.

- **FastAPI Router:** `backend/app/routers/corridor_router.py`
  - Endpoint `GET /api/v1/corridor/context?corridor_id=sumatra_belawan_medan` returning structured JSON.
  - Mount router in `backend/app/main.py`.

---

## 2. AI Copilot CoT Prompt Injection (`agents/nodes/decision_support.py` & `backend/app/routers/agent_router.py`)

- **Context Integration:**
  - Update `decision_support_copilot` in `agents/nodes/decision_support.py` to call `get_corridor_context()` dynamically.
  - Update `simulation_chat` prompt in `backend/app/routers/agent_router.py` to inject corridor context into AI Advisor system prompt.

- **Chain of Thought (CoT) Output Requirement:**
  Enforce explicit 3-part CoT structure in AI Copilot responses:
  - **a. Ringkasan Ancaman Fisik (BMKG + TomTom):** Analysis of weather intensity, road congestion %, and active traffic blockage.
  - **b. Estimasi Dampak Ekonomi / Inflasi (PIHPS):** Price anomaly detection, affected commodities (Chili, Rice), and 48-hour inflation forecast.
  - **c. Keputusan Rute Taktis + Alasan (Explainable AI):** Tactical rerouting recommendation with clear domain rationale.

---

## 3. Frontend Sidebar & Mapbox Overlay Binding (`frontend/components/`)

- **API & State Binding (`DashboardClient.tsx`):**
  - Fetch `/api/v1/corridor/context` on component mount and on simulated shock.
  - Bind BMKG weather badge (e.g. `BMKG: Hujan Lebat / 68mm`) and PIHPS food inflation badge (e.g. `PIHPS: 7.14% baseline` / `12.8% Anomaly Spike`) in left tactical sidebar.

- **Mapbox Overlay Indicators (`CrisisMap.tsx`):**
  - Add GeoJSON layer / markers for live corridor status:
    * **Weather / Flood Overlay Icon:** Positioned at Belawan / Medan epicenter with rainfall & alert tooltip.
    * **Traffic Congestion Overlay Icon:** Positioned on Trans-Sumatra Highway / Jalinsum checkpoints with congestion % & delay minutes tooltip.

---

## 4. Verification Plan

- **Backend Unit & Integration Test:**
  - Run `rtk pytest` or script verification on `get_corridor_context()` to ensure structured JSON output.
  - Test `/api/v1/corridor/context` FastAPI endpoint returns 200 OK.
- **AI Agent CoT Test:**
  - Verify `decision_support.py` and `/api/simulation/chat` output the 3 CoT sections (Physical Threat, Economic Impact, Tactical Reroute).
- **Frontend Build & UI Check:**
  - Run `rtk npm run build` in `frontend/` to confirm zero compilation or TypeScript errors.
