# Phase 64 Learnings: Remove Past/Future/Predict Dock Tabs and Mock Endpoints

## Executive Summary
Phase 64 purged the mock Past, Future, and Predict dock tabs and their corresponding backend mock endpoints, eliminating misleading time-horizon features and ungrounded "TFT Multi-Model" claims.

---

## Decisions with Rationale
1. **Dock Tabs Removal**:
   - **Past (Masa Lalu)**: Removed because backend items lacked `geojson_geometry`, rendering no map features, and lacked time-series scrubbing. True operational history is maintained in the Laporan audit ledger (`ReportsSection.tsx`), backed by Supabase `route_approvals` and SQLite `route_decision_traces`.
   - **Future (Masa Depan)**: Removed because it served static synthetic polygons disconnected from real numerical weather and traffic forecasts. Live spatiotemporal weather forecasting is already handled by Open-Meteo NWP spatial fusion in `weather_fusion_service.py`.
   - **Predict (Prediksi)**: Removed because it called no backend endpoints, loaded static client fixture `pred-rob-belawan-48h`, and displayed a false "TFT & Open-Meteo Multi-Model" banner. FourCastNet and GPU models were purged in Phase 59; no Temporal Fusion Transformer (TFT) model exists in the codebase.
2. **TimelineScrubber Cleanup**:
   - `frontend/components/ui/TimelineScrubber.tsx` was an orphaned 96-line prototype from Phase 19 that was never wired to actual streaming state. Safely deleted.
3. **Endpoint Deprecation**:
   - Dropped `GET /api/v1/incidents/historical/episodes` and `GET /api/v1/incidents/predictive/risks` from `backend/app/routers/incidents.py`.
   - Retained standard `GET /incidents?status=resolved` for legitimate historical filtering.

---

## Constraints & Environment
- **Hosting Targets**: Frontend is deployed at `pre-hub.vercel.app`, backend at `peta-nadi.onrender.com`.
- **Render Deployment Invariant**: Removed endpoints `/historical/episodes` and `/predictive/risks` only vanish from the live server after a manual/CI backend redeploy on Render. However, because the frontend no longer invokes them, deployment order does not break production operations.
- **Architectural Rules**: Adherence to `AGENTS.md` (no emojis, cursor-pointer, glassmorphism, zero bombastic AI claims, `.planning/` as sole source of truth over `docs/`).

---

## Issues Hit During Work
- **Parallel Modification Collision**: When Phase 64 edits to `DashboardClient.tsx` overlapped with other concurrent edits, TypeScript reported transient type mismatch errors. Work on large monolithic client components (~2,000 lines) must be serialized sequentially.

---

## Open Issues for New Context Window
- **Render Backend Redeployment**: Backend code changes in `incidents.py` require a Render deployment push to ensure the live OpenAPI docs and server reflect endpoint deprecation.
