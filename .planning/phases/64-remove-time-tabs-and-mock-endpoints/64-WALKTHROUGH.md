# Phase 64 Walkthrough: Remove Past/Future/Predict Dock Tabs and Mock Endpoints

## Executive Overview
Phase 64 eradicated synthetic time-horizon abstractions (Past, Future, Predict) from the PreHub dashboard and backend services. These tabs previously showed hardcoded, geometry-less incidents or canned text falsely attributed to non-existent TFT deep-learning models.

---

## Detailed Changes

### 1. Frontend Removal & Simplification
- **[DashboardClient.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx)**:
  - Stripped `FALLBACK_HISTORICAL` and `FALLBACK_PREDICTIVE` synthetic arrays.
  - Removed `TimeModeBanner` component and rendering logic.
  - Purged `activeTimeFilter` state, `historicalEpisodes`, and `predictiveRisks`.
  - Removed `loadTimeHorizonData` effect.
  - Simplified bottom footer dock: eliminated the four-state button loop (`['past', 'present', 'future', 'predict']`), keeping only `#run-demo-btn`.
  - Unlocked the Fleet Modality filter so it is permanently visible regardless of simulation state.
  - Streamlined `getDisplayedIncidents` to return live incidents only.
- **[CrisisMap.tsx](file:///d:/College/Pidi.id/frontend/components/map/CrisisMap.tsx)**:
  - Removed obsolete props: `activeTimeFilter`, `historicalEpisodes`, `predictiveRisks`.
  - Purged Mapbox layer definitions: `historical-episodes-source`, `predictive-risks-source`, `time-horizon-badges-source`.
  - Cleaned up source update effects and GeoJSON mutations.
- **[api.ts](file:///d:/College/Pidi.id/frontend/lib/api.ts)**:
  - Dropped `api.incidents.historical()` and `api.incidents.predictive()` methods.
- **[SystemObservabilitySection.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/SystemObservabilitySection.tsx)**:
  - Removed probe entries `ep-4` (`Historical Episodes`) and `ep-5` (`Predictive Risks`).
- **Deleted File**:
  - `frontend/components/ui/TimelineScrubber.tsx` (orphaned prototype code).

### 2. Backend Cleanup
- **[incidents.py](file:///d:/College/Pidi.id/backend/app/routers/incidents.py)**:
  - Removed dummy route endpoints `@router.get("/historical/episodes")` and `@router.get("/predictive/risks")`.
  - Preserved standard `GET /incidents?status=resolved`.
- **Deleted File**:
  - `backend/app/fixtures/historical_episodes.json` (orphaned 245-line mock fixture).

---

## Verification & Checks Run
- **TypeScript**: `rtk npx tsc --noEmit` passed with 0 errors.
- **Next.js Production Build**: `rtk npm run build` passed cleanly (7/7 static pages generated).
- **Codebase Grep Verification**:
  - `git grep "activeTimeFilter"` -> 0 matches in `frontend/` and `backend/`.
  - `git grep "TimelineScrubber"` -> 0 matches in `frontend/` and `backend/`.
  - `git grep "FALLBACK_HISTORICAL"` -> 0 matches in `frontend/` and `backend/`.
  - `git grep "TFT"` -> 0 code matches (only 1 binary frame image).
