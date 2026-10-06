# Phase 49: Context, Environment Conditions, Issues & Critical Pitfalls

## 1. Environment Conditions, Context & Constraints

### 1.1. Operating System & Shell Resolution
- **OS:** Windows 11 (64-bit).
- **Shell:** Windows PowerShell.
- **PATH Resolution Rule:** When invoking standard CLI commands via `rtk`, refresh PATH from machine and user registry if not preloaded:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
  ```
- **PowerShell File Management:** Do not use Unix commands like `rm` or `grep` inside PowerShell without aliases. Use PowerShell built-ins:
  - Deleting files: `Remove-Item -Path <file> -Force`
  - Directory listing: `Get-ChildItem -Path <dir>`

### 1.2. Python Virtual Environment & Testing Runtime
- **System Python (`C:\Python313\python.exe`):** Does not contain project dependencies (`pytest`, `langgraph`, `fastapi`, `httpx`). Calling `python -m pytest` or `rtk pytest` directly causes failure.
- **Canonical Python Executable:** `backend\.venv\Scripts\python.exe`.
- **Test Invocation Standard:**
  ```powershell
  rtk backend\.venv\Scripts\python -m pytest backend/tests
  ```

### 1.3. Frontend Build & Type Invariants
- **Runtime:** Next.js 14.2.35 (React 18).
- **TypeScript & Build Check:** `rtk npm run build` inside `frontend/` must compile with 0 errors across all 7 static routes.
- **Dead File Pitfall:** Removing files like `dynamicRouteCalculator.ts` requires running `rtk git grep` to ensure no active imports exist.

### 1.4. UI/UX Rules & Anti-Patterns (from `.agents/AGENTS.md`)
- ❌ **No Generic AI Gradients:** Avoid unguarded purple/pink gradients.
- ❌ **No Emojis as Icons:** All UI icons must be Lucide SVG components.
- ✅ **Cursor Consistency:** Every interactive button and clickable card requires explicit `cursor-pointer`.
- ✅ **Color & Surface Palette:** Glassmorphic background `#0c1017` / `#121822` with subtle hairline `#1c2432` / `border-white/10` borders.

---

## 2. Issues Discovered and Fixes Applied

### 2.1. Spatial Bounding Box & Port Truncation in Backend Adapters
- **Issue:**
  - `nasa_firms_adapter.py` had a hardcoded North Sumatra bounding box filter (`MIN_LAT, MAX_LAT = 1.0, 5.5`, `MIN_LON, MAX_LON = 97.5, 100.5`) and only 5 highway spine points in Sumut, discarding valid wildfire alerts in South Sumatra, Lampung, and Riau.
  - `aisstream_adapter.py` monitored only Belawan Port (`[[3.7, 98.6], [3.9, 98.8]]`) and its queue processor warned only for Belawan.
  - `tomtom_adapter.py` had an incident BBOX spanning ~40km around Medan (`98.5,3.5,99.2,3.9`), ignoring traffic incidents across Trans-Sumatra corridors.
- **Fix Applied:**
  - Expanded `nasa_firms_adapter.py` to Pan-Sumatra bounds (`lat: -6.0 to 6.0`, `lon: 94.0 to 108.0`) and added 18 highway spine checkpoints across all 8 provinces.
  - Configured `PORTS` dictionary in `aisstream_adapter.py` with bounding boxes for 8 major seaports (Belawan, Kuala Tanjung, Dumai, Teluk Bayur, Boom Baru, Panjang, Bakauheni, Malahayati) and generalized `_process_queue` to group anchored vessels by port.
  - Broadened `tomtom_adapter.py` incident BBOX to `95.0, -6.0, 106.5, 6.0` and added 12 strategic arterial checkpoints.

### 2.2. Port Event Penalization & Static Waypoints in Agent 4 (`route_optimization.py`)
- **Issue:**
  - Agent 4 hardcoded `disrupted_corridors.add("belawan_access")` whenever a `port_closure` or `port_congestion` event occurred, regardless of whether the event occurred in Dumai, Teluk Bayur, or Bakauheni.
  - Line 199 hardcoded waypoints to coordinates near Belawan (`{"lat": 3.78 + (idx * 0.02), "lon": 98.68 - (idx * 0.02)}`). When testing routes between Padang and Pekanbaru, the calculated intermodal choke-point delay was computed using North Sumatra coordinates.
- **Fix Applied:**
  - Updated port disruption detection to inspect event title tokens (`dumai`, `bayur`, `panjang`, `bakauheni`, `boom`, `belawan`) and dynamically penalize the specific port access corridor.
  - Updated Agent 4 to load node coordinates (`node_coords`) from `road_network_sumatra.json` and generate waypoints from actual traversed path nodes before applying choke-point multipliers.

### 2.3. Hardcoded Fallback Detours in `mapboxRoutingService.ts`
- **Issue:**
  - `fallbackHighwayRoute` returned a static array of Medan-Tebing Tinggi-Siantar coordinates when offline.
  - `calculateRoadNetworkDetourRoutes` defaulted origin to Belawan and destination to Siantar, using a heuristic `isEastDetour = hLon <= 98.75`.
- **Fix Applied:**
  - Refactored `fallbackHighwayRoute` to calculate dynamic bezier-curved intermediate waypoints between arbitrary origin and destination coordinates.
  - Replaced the longitude-threshold check in `calculateRoadNetworkDetourRoutes` with a normal tangent vector calculated directly from the origin-destination directional vector.

### 2.4. Residual North Sumatra Labels Across Dashboard UI
- **Issue:**
  - Hardcoded references (`Koridor Sumut`, `Medan`, `Belawan`, `North Sumatra Corridor`) remained in fallback strings across `DashboardClient.tsx`, `AnalyticsSection.tsx`, `ReportsSection.tsx`, and `SimulationSection.tsx`.
- **Fix Applied:**
  - Replaced hardcoded strings with dynamic resolutions from `selectedCrisis.region` with a generalized fallback to `Sumatra Logistics Corridor` / `Koridor Terpadu Sumatera`.
  - Updated Deck.gl commodity flow arcs and market scatter layers in `AnalyticsSection.tsx` to visualize arterial corridors connecting Dumai, Teluk Bayur, Palembang, Bakauheni, and the Sunda Strait.
