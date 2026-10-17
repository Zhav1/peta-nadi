# Phase 64 Plan: Remove Past/Future/Predict Dock Tabs and Mock Endpoints

## 1. Executive Summary & Goals

Following the audit of `pre-hub.vercel.app` and `https://peta-nadi.onrender.com`:
- The **Past (Masa Lalu)**, **Future (Masa Depan)**, and **Predict (Prediksi)** tabs on the bottom map dock contained synthetic/mock data.
- Past and Future backend items had no `geojson_geometry`, so the map rendered zero features.
- Predict had zero API fetch, relied on static hardcoded client text (`pred-rob-belawan-48h`), and falsely claimed a "TFT & Open-Meteo Multi-Model" in the UI banner (FourCastNet and GPU models were purged in Phase 59; no TFT model exists).
- `TimelineScrubber.tsx` was orphaned prototype code since Phase 19.
- True forecasting and what-if simulation live in the spatial weather fusion layer (`backend/app/services/weather_fusion_service.py`) and "Simulasi Bencana" on the map (`CrisisSimulatorBar.tsx` -> `POST /api/v1/simulate/stream`).
- True historical records belong in the Laporan audit ledger (`ReportsSection.tsx`), backed by Supabase `route_approvals` and SQLite `route_decision_traces`.

**Goal**: Completely remove the Past/Future/Predict dock tabs, their map sources/layers, client fallback fixtures, orphaned scrubber UI, and dead mock endpoints from the backend.

---

## 2. Deliverables & Blast Radius

### Frontend Changes:
1. `frontend/components/dashboard/DashboardClient.tsx`:
   - Remove `FALLBACK_HISTORICAL` and `FALLBACK_PREDICTIVE` fixtures.
   - Remove `TimeModeBanner` rendering.
   - Remove `activeTimeFilter`, `historicalEpisodes`, and `predictiveRisks` state variables and `loadTimeHorizonData` effect.
   - Remove the `predict` branch in `handleCrisisClick`.
   - Remove the `past/present/future/predict` button loop in the bottom dock, retaining strictly the `Run Demo` action.
   - Remove the `activeTimeFilter === 'present'` condition guard around the Fleet Modality filter so it is always accessible.
   - Simplify `getDisplayedIncidents` to return active live incidents only.
2. `frontend/components/map/CrisisMap.tsx`:
   - Remove props `activeTimeFilter`, `historicalEpisodes`, `predictiveRisks`.
   - Remove Mapbox sources and layers: `historical-episodes-source`, `predictive-risks-source`, `time-horizon-badges-source`.
   - Remove corresponding GeoJSON update blocks.
3. `frontend/lib/api.ts`:
   - Remove `historical` and `predictive` methods from `api.incidents`.
4. `frontend/components/dashboard/SystemObservabilitySection.tsx`:
   - Remove probe entries `ep-4` (`Historical Episodes`) and `ep-5` (`Predictive Risks`).
5. `frontend/components/ui/TimelineScrubber.tsx`:
   - Delete orphaned component.

### Backend Changes:
1. `backend/app/routers/incidents.py`:
   - Remove dummy endpoints `GET /historical/episodes` and `GET /predictive/risks`.
   - Preserve standard `GET /incidents?status=resolved` for future ledger feeding.
2. `backend/app/fixtures/historical_episodes.json`:
   - Delete orphaned fixture file.

---

## 3. Verification & Acceptance Criteria
- [x] `rtk npx tsc --noEmit` compiles cleanly with 0 type errors.
- [x] `rtk npm run build` completes production bundle generation (7/7 static pages).
- [x] `git grep` for `activeTimeFilter`, `TimelineScrubber`, `FALLBACK_HISTORICAL`, and `TFT` in frontend and backend yields 0 code matches.
- [x] Fleet Modality Filter remains visible on dashboard map at all times.
