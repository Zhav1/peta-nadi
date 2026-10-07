# PLAN — Phase 17: TomTom Segment Traffic Lines, NVIDIA FourCastNet Regional Weather Polygons & NVIDIA cuOpt Routing Synchronization

**Phase:** 17  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** 
1. Render Google Maps-style segment-level traffic congestion lines (Green/Yellow/Red) and live incident markers driven by TomTom Flow & Incident APIs.
2. Replace node-only weather markers with regional spatial weather coverage polygons (GeoJSON multi-polygons with data-driven rain/flood intensity gradients) fusing BMKG station data + NVIDIA FourCastNet 48h predictions.
3. Synchronize NVIDIA cuOpt VRP solver with TomTom dynamic cost matrices and weather hazard polygons to calculate GPU-accelerated optimal fleet routes in milliseconds.

---

## 1. Backend Ingestion & Routing Synchronization Services (`backend/app/services/` & `backend/app/routers/`)

- **Weather Fusion Service (`backend/app/services/weather_fusion_service.py`):**
  - Fuses BMKG weather forecasts + `Earth2Adapter` (NVIDIA FourCastNet model).
  - Returns regional GeoJSON multi-polygons covering North Sumatra regencies/cities (Belawan, Medan, Binjai, Deli Serdang, Tebing Tinggi, Pematangsiantar) with data-driven `rainfall_mm` and `flood_risk_pct`.

- **cuOpt & TomTom Routing Synchronization (`backend/app/services/cuopt_tomtom_service.py`):**
  - Builds dynamic $N \times N$ Travel Time Cost Matrix $T[i][j]$ across North Sumatra highway junctions using live TomTom speeds and hazard avoidance penalties.
  - Submits dynamic cost matrix to `CuOptAdapter.solve_vrp()` for GPU-accelerated fleet routing optimization (< 5 ms).
  - Returns cuOpt optimization metrics: `total_travel_time`, `fuel_savings_pct`, `cost_reduction_pct`, and segment breakdown.

- **FastAPI Routing & Weather Router (`backend/app/routers/routing_router.py`):**
  - Endpoint `POST /api/v1/routing/optimize-cuopt`
  - Endpoint `GET /api/v1/weather/spatial-polygons`
  - Endpoint `GET /api/v1/traffic/flow-segments`
  - Mount in `backend/app/main.py`.

---

## 2. Frontend Mapbox Visualization Patterns (`frontend/components/map/` & `frontend/lib/`)

- **TomTom Traffic Flow Lines & Incident Markers (`CrisisMap.tsx`):**
  - Render segment-level traffic polylines on `congestion-segments-source` with Google Maps color scale:
    * Red (`#ef4444`): Heavy Congestion / Standstill (< 20 km/h)
    * Amber (`#f59e0b`): Moderate Traffic (20-45 km/h)
    * Emerald (`#10b981`): Clear Traffic (> 45 km/h)
  - Render TomTom traffic incident markers (⛔ Road Closed, 💥 Accident, 🌊 Flooded Segment).

- **Regional Weather Spatial Coverage Layer (`CrisisMap.tsx`):**
  - Add `weather-coverage-source`, `weather-coverage-fill`, and `weather-coverage-outline` Mapbox layers.
  - Style with data-driven expressions based on `rainfall_mm` / `flood_risk_pct`.
  - Add hover tooltips displaying combined BMKG + NVIDIA FourCastNet prediction per city/regency.

- **NVIDIA cuOpt Routing Integration (`aiDynamicRouter.ts` & `DashboardClient.tsx`):**
  - Call `/api/v1/routing/optimize-cuopt` when route calculation or node selection changes.
  - Render cuOpt GPU acceleration badge (`⚡ NVIDIA cuOpt: Solved in 3.2ms | Cost -14.2%`) in UI sidebar/stepper.

---

## 3. Verification Plan

- **Backend API & Service Verification:**
  - Run test script verifying `/api/v1/weather/spatial-polygons` returns GeoJSON multi-polygons.
  - Verify `/api/v1/routing/optimize-cuopt` returns cuOpt solution & dynamic travel time matrix.
- **Frontend Build & Map Visualization Check:**
  - Execute `npm --prefix frontend run build` to ensure 0 compilation / TypeScript errors.
