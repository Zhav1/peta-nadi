# PLAN — Phase 19: Differentiated Multi-Hazard Map Layers, Time Horizon Engine (`PAST | PRESENT | FUTURE | PREDICT`) & Lightpanda OSINT Integration

**Phase:** 19  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** 
1. Render differentiated spatiotemporal map layers in `CrisisMap.tsx` tailored per hazard type:
   - **Banjir (Flood):** Water inundation cyan-navy fill (`rgba(6, 182, 212, 0.35)`), animated wave contours, submerged road highlights.
   - **Gempa Tektonik (Earthquake):** Seismic epicenter shockwave pulse rings (0km to 30km expanding concentric rings) + red-purple fault line vector overlay with `M6.2 Epicenter` badge.
   - **Tanah Longsor (Landslide):** Debris hazard cross-hatch pattern on mountain slopes (Berastagi/Jalinsum slopes) + corridor blockage indicators.
   - **Titik Panas / Kebakaran (Wildfire):** Thermal gradient heatmap (Yellow $\rightarrow$ Orange $\rightarrow$ Deep Crimson Red glow).
   - **Cuaca Ekstrem (Storm):** Animated radar rain grid polygon with dark slate-cyan gradient & lightning flash indicators.
2. Bind the bottom bar **Time Horizon Engine** (`PAST | PRESENT | FUTURE | PREDICT`) to dynamic dataset state switches:
   - **PAST:** Query historical LTM disaster episode database (Gempa Pasaman 2022, Banjir Pantura 2024, Banjir Medan 2023) and display past disaster polygons + historical PIHPS price inflation spikes.
   - **PRESENT:** Live multi-sensor real-time feed (BMKG, TomTom, PIHPS, Belawan vessel queue).
   - **FUTURE:** Multi-horizon predictive risk horizon (TFT 24-48h forecast warning zones on vulnerable highway segments).
   - **PREDICT:** Interactive AI simulation sandbox (trigger custom hazard scenarios, AI rerouting, inflation impact calculation).
3. Connect **Lightpanda OSINT Scraper** bridge in backend API (`backend/app/routers/incidents.py`) to feed news & social disaster reports into active incident stream.

---

## 1. Backend API & Fixtures (`backend/app/routers/` & `backend/app/fixtures/`)

- **Historical & Predictive Incidents Router (`backend/app/routers/incidents.py`):**
  - Endpoint `GET /api/incidents/historical` — returns LTM historical disaster memory episodes (Gempa Pasaman 2022, Banjir Pantura 2024, Banjir Medan 2023).
  - Endpoint `GET /api/incidents/predictive` — returns 24-48h TFT predictive risk zones for highway segments.
  - Endpoint `GET /api/incidents/osint` — integrates Lightpanda OSINT scraper fixture bridge supplying news/social disaster reports.

- **Historical Episodes & Predictive Fixture Data (`backend/app/fixtures/historical_episodes.json`):**
  - Fixture containing structured historical disaster events with GeoJSON polygons, coordinates, economic inflation lag correlations, and past mitigation records.

---

## 2. Frontend Mapbox Visualization & State Engine (`frontend/components/`)

- **Differentiated Hazard Spatiotemporal Layers (`CrisisMap.tsx`):**
  - **Flood Water Inundation Layer:** Mapbox fill layer (`rgba(6, 182, 212, 0.35)`), animated wave outline, submerged highway segment highlights.
  - **Earthquake Epicenter & Fault Lines:** Concentric pulse ring circles around epicenter + fault line polyline overlay with `M6.2 Epicenter` badge.
  - **Landslide Debris Hazard:** Cross-hatch hazard fill pattern on hillside corridors + blockage marker icons.
  - **Wildfire Heatmap Layer:** Deck.gl / Mapbox heatmap layer with thermal color gradient.
  - **Storm Radar Grid:** Radar rain grid layer with storm cell indicators.
  - Conditional layer rendering based on active time filter (`activeTimeFilter`).

- **Time Horizon State Engine (`DashboardClient.tsx`):**
  - Connect `activeTimeFilter` (`past` | `present` | `future` | `predict`) state to dynamic data fetchers:
    * `past`: Load historical LTM episodes and display historical inflation spikes.
    * `present`: Load live real-time BMKG / TomTom / PIHPS stream.
    * `future`: Highlight 24-48h TFT predictive risk zones on vulnerable highway corridors.
    * `predict`: Activate interactive AI crisis simulator sandbox.

- **Hazard Target Selector & Presets (`CrisisSimulatorBar.tsx`):**
  - Add Earthquake (Gempa Tektonik M6.2) and Landslide (Longsor Jalinsum) to preset selector.
  - Bind hazard types to map click targeting and freehand polygon draw tool.

---

## 3. Verification Plan

### Automated & Build Verification
- Execute `npm --prefix frontend run build` to verify zero TypeScript or compilation errors.
- Test backend endpoints:
  - `GET http://localhost:8000/api/incidents/historical`
  - `GET http://localhost:8000/api/incidents/predictive`
  - `GET http://localhost:8000/api/incidents/osint`

### Manual UI Verification
- Verify `PAST` button loads historical disaster polygons & inflation markers.
- Verify `PRESENT` button displays live status.
- Verify `FUTURE` button displays 24-48h TFT predictive warning zones.
- Verify `PREDICT` button opens interactive simulation sandbox.
- Verify each hazard type (Flood, Earthquake, Landslide, Wildfire, Storm) renders distinct visual styling on Mapbox canvas.
