# PLAN — Phase 18: Map UI/UX Refactoring, Unified Telemetry HUD & Localized Weather Animations

**Phase:** 18  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** 
1. Replace hardcoded single-node markers for TomTom and BMKG with a unified, interactive **Operations Telemetry HUD Overlay Panel** docked on the map canvas.
2. Build precision localized regional weather indicators by rendering 4 distinct weather markers over North Sumatra regency center points, featuring animated SVGs (rain, clouds, lightning) driven by live spatial weather data.
3. Clean the map canvas layout by removing overlapping, static text indicators and centralizing HUD details with clean font hierarchies.

---

## 1. Frontend Mapbox UI & Telemetry HUD (`frontend/components/map/CrisisMap.tsx`)

- **Telemetry HUD Overlay (`CrisisMap.tsx`):**
  - Remove floating badges from the top-left corner.
  - Replace them with a cohesive glassmorphic **Operations Telemetry HUD Panel** at `top-4 left-4 z-[350]` (`pointer-events-auto`).
  - Display:
    *   **NVIDIA cuOpt:** Solver speed (`3.2ms` or dynamic), compute cost savings (`-18.5%`), and active state.
    *   **TomTom Live Traffic:** Overall congestion rate and delays, plus a small segment legend (🟢 Clear, 🟡 Moderate, 🔴 Heavy).
    *   **BMKG Weather Alert:** Global corridor weather alert status.
  - Toggle layer displays (like showing/hiding traffic segment colors or weather polygons) directly from the HUD.

- **Localized Weather Badge Engine (`CrisisMap.tsx`):**
  - Delete the single hardcoded weather badge at `[98.68, 3.78]`.
  - Loop through `spatialWeatherPolygons` features. Snaps HTML weather markers to the center coordinate of each of the 4 regions (Belawan Coastal, Central Deli Serdang, Binjai Langkat, Tebing Tinggi).
  - Include beautiful, custom animated SVGs inside the markers:
    *   **Light Rain / Cloudy (☁️/🌦️):** Drifting cloud shape.
    *   **Heavy Rain (🌧️):** Cloud shape with falling rain drops.
    *   **Extreme Rain / Thunderstorm (⛈️):** Storm cloud shape with lightning flashes.
  - **Hover Detail Card:** Hovering a weather marker expands it to show the precise rainfall MM, flood risk percentage, and metadata sources (BMKG + FourCastNet).

- **CSS Keyframes Animation Injection (`CrisisMap.tsx`):**
  - Dynamically inject a `<style>` block containing CSS animations for elements:
    *   `rain-drop`: translates rain drops vertically and fades opacity.
    *   `lightning-flash`: toggles opacity rapidly to simulate lightning flashes.
    *   `cloud-drift`: minor horizontal sway to simulate wind.

---

## 2. Dashboard Interface Wiring (`frontend/components/dashboard/DashboardClient.tsx`)

- Clean up references to old markers.
- Ensure state variables (like `corridorContext`, `spatialWeatherPolygons`, `cuOptInfo`) feed dynamically into `CrisisMap` to update the weather badges and HUD segments instantly.

---

## 3. Verification Plan

### Automated Verification
- Run `npm run build` in the `frontend` folder to ensure clean Next.js/TypeScript compilations.

### Manual Visual Verification
- Verify that weather pins are correctly anchored on the 3D globe and do not shift during map rotation.
- Verify that hovering a localized weather card expands the badge and displays precise details.
- Verify that the traffic segments color lines correctly correspond to the colors shown on the HUD legend.
