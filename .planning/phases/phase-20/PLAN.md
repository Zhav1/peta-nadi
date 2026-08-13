# Phase 20 Plan — Real District Logistics Boundaries & Non-Colliding Spatial GIS Layout

## Phase Overview
- **Phase Goal:** Eliminate arbitrary synthetic weather boxes, implement real administrative & logistical district GeoJSON boundary polygons for North Sumatra, resolve map component overlapping (Z-Index architecture & Operations HUD repositioning), and upgrade map badges to compact Glassmorphism 2.0 UI UX Pro Max standards.
- **Status:** IN_PROGRESS 🚀
- **Target Completion:** Phase 20 Execution

---

## Deliverables & Technical Requirements

### 1. Real Geographic District Logistics Boundaries (`CrisisMap.tsx`)
- Replace synthetic `defaultRegions` math circles with 5 real geographic GeoJSON district polygons representing North Sumatra key logistics sectors:
  1. **Sektor Belawan Maritime Gateway & North District** (Pelabuhan, Belawan, Medan Labuhan)
  2. **Sektor Medan Central Logistics Hub** (Medan Petisah, Medan Selayang, Medan Amplas, Hub Utama)
  3. **Sektor Binjai & Langkat West Food Supply Corridor** (Jalur Pangan Utama West)
  4. **Sektor Deli Serdang & Kualanamu Airport Belt** (KNO Belt & Tanjung Morawa)
  5. **Sektor Serdang Bedagai & Tebing Tinggi Toll Interchange** (Koridor Timur Trans-Sumatra)
- **Interactive Boundary Styling & Selection:**
  - Mouse hover highlights exact district boundary with a crisp glowing cyan/amber stroke line (`line-width: 3`, `line-color: #00f0ff`).
  - Displays dynamic glassmorphism hover card showing real-time BMKG rainfall rate (mm/h), FourCastNet flood risk %, and TomTom traffic congestion index.
  - Clicking a district polygon filters the sidebar metrics and zooms to that specific district.

### 2. Non-Colliding Spatial Z-Index Layout & Operations HUD Repositioning
- **Operations HUD Repositioning:** Reposition the floating `OPERATIONS HUD` panel away from top-left map canvas to a sleek top-right telemetry HUD bar (`backdrop-blur-xl bg-[#0c0e12]/85 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-4`), ensuring `Pelabuhan Belawan` and `Hub Utama Medan` markers are 100% unobstructed.
- **Compact Map Badges & Tooltips:**
  - Replace giant multi-line text cards on map canvas with compact glassmorphic badges using Lucide SVG icons (`AlertTriangle`, `Droplets`, `Activity`, `FileText`).
  - Structural icons use Lucide SVGs (no raw emojis per `MASTER.md` Anti-AI-Slop rules).
  - Hovering/clicking a badge opens a sleek side drawer or highlights item details in the right sidebar.

---

## Verification Plan

### 1. Build Verification
- Execute Next.js production build check: `$env:PATH = ...; rtk npm --prefix frontend run build`

### 2. Live Browser Visual Verification
- Use `browser_subagent` to test `http://localhost:3000`:
  - [ ] Real district boundary polygons render cleanly on map canvas.
  - [ ] Mouse hover over district boundary triggers cyan glowing border highlight and glassmorphism hover telemetry card.
  - [ ] Top-left map canvas area is completely unobstructed (`Pelabuhan Belawan` and `Hub Utama Medan` markers clearly visible).
  - [ ] Disaster badges in `PAST` and `FUTURE` modes render without colliding with city labels.
