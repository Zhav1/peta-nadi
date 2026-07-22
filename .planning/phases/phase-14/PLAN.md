# PLAN — Phase 14 Refine: Pure Agentic Tangential Avoidance Router, Clean Slate Selection & Skill Integration

**Phase:** 14  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Status:** READY TO EXECUTE ⏳  
**Skills Ingested:** `mapbox-geospatial-operations`, `logistics-routing-vrp`, `mapbox-google-maps-migration`, `nextjs-mapbox-deckgl`  
**Benchmark Reference:** [BENCHMARK_ANALYSIS.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/BENCHMARK_ANALYSIS.md)  
**Proposal Spec:** [Submission Tahap 2 (3) - compiled.md](file:///c:/Farras/DIGDAYA/peta-nadi/docs/Submission%20Tahap%202%20%283%29%20-%20compiled.md)  

---

## 1. Goal

Eliminate 100% of hardcoded lat/lon city coordinates (`98.65, 3.55` Saribudolok mountain detours), implement a Pure Agentic Tangential Vector Avoidance Engine ($R + 2\text{km}$ safety buffer) that works dynamically for ANY origin/destination/hazard location globally, establish a Clean Slate (Unset Initial State) dynamic node selection workflow with a 1-click Reset button, and align with Proposal 2 End-to-End specifications.

---

## 2. The 4 Core Refactoring Pillars

### Pillar 1: Pure Agentic Tangential Vector Avoidance Engine (`aiDynamicRouter.ts`)
- **Zero Hardcoding Guarantee**: Remove 100% of hardcoded North Sumatra/Saribudolok coordinates from `aiDynamicRouter.ts`.
- **Pure Tangential Vector Projection**:
  - Calculate unit perpendicular vector $P_{perp}$ to line $OD$ centered at hazard $H$.
  - Project dynamic clearance waypoints $W_{left}$ and $W_{right}$ **persis 2 km di luar tepi radius krisis**:
    $$W = H \pm P_{perp} \times (R \times 1.15 + 2.0\text{km})$$
  - Query Mapbox Directions API (`v5/mapbox/driving-traffic`) for $O \rightarrow W_{left} \rightarrow D$ and $O \rightarrow W_{right} \rightarrow D$.
  - Inspect candidate polylines using point-in-circle test (`distance(pt, H) >= R`).
  - Select candidate route with **0 points inside hazard circle AND shortest travel time/distance**.
- **Outcome**: Detour route smoothly curves just 2 km outside the flood circle on actual nearby roads, eliminating 150 km volcano mountain detours!

### Pillar 2: Clean Modality Routing Channels (`aiDynamicRouter.ts`)
- **🚚 Truk Darat (`truck`)**: Mapbox Directions API `mapbox/driving-traffic` along highways.
- **⚓ Kapal Laut (`maritime`)**: Maritime channel vectors connecting ports (Belawan Port ➔ Selat Malaka ➔ Dumai Port).
- **✈️ Cargo Udara (`air`)**: Emergency air flight vectors connecting airports (Kualanamu International Airport KNO ➔ destination).

### Pillar 3: Clean Slate Dynamic Node Selection Workflow (`DashboardClient.tsx` & `CrisisSimulatorBar.tsx`)
- On initial page load: `selectedOriginNode = null` and `selectedDestNode = null`. Zero routes drawn initially.
- Interactive 2-Step Workflow:
  - Step 1: Click marker 1 ➔ Set Start Node (🟢 "START").
  - Step 2: Click marker 2 ➔ Set End Node (🟡 "END") ➔ Query Mapbox baseline route.
  - Step 3: Click map location ➔ Set Hazard (🎯) ➔ Query AI Tangential Clearance Detour.
- Provide 1-click **`🔄 RESET RUTE`** button to clear and re-select Start/End anytime.

### Pillar 4: Docked MAP 4D AI Copilot & 4 Mandatory XAI Blocks (`MitigationTab.tsx`)
- AI Copilot reads exact distance, ETA, and polyline coordinates directly from Mapbox Directions API response.
- Generates natural Indonesian Explainable AI (XAI) text referencing official expressways.
- Clicking `[ APPROVE & DISPATCH REROUTE ]` updates status badge to `APPROVED ✅`, logs approval audit record, and triggers Toast UI confirmation.

---

## 3. Verification Plan

### Automated Build Check
- Run Next.js production build check:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); npm run build --prefix frontend
  ```

### Manual Verification Checklist
1. **Pure Tangential Detour**: Place hazard on Tebing Tinggi; verify detour curves slightly around hazard ring (0 points inside) WITHOUT shooting 150 km into Saribudolok mountains.
2. **Clean Slate Selection**: Open page; verify Start & End nodes are unset until user clicks markers on map.
3. **Reset Button**: Click `🔄 RESET RUTE`; verify Start & End selection clears and returns to netral clean slate.
4. **Modality Corridors**: Toggle Cargo Udara; verify direct flight vector to KNO without shooting into Simalungun jungle.
5. **Approve Action**: Click `[ APPROVE & DISPATCH REROUTE ]`; verify badge updates to `APPROVED ✅` and Toast UI appears.
