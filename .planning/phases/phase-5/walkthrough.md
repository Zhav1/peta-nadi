# Walkthrough — Phase 5: Notifications & Human-in-the-Loop

All deliverables for Phase 5 of the LRIP / PetaNadi project have been successfully implemented, compiled, and tested.

## Changes Made

### Wave 1 — Backend & Database
- **Supabase Migration (`infra/supabase/migrations/005_route_approvals.sql`):** Created the `route_approvals` table with columns for `incident_id` (foreign key referencing `incidents(incident_id)`), `route_id` (recommendation array index), `recommended_route` (full JSONB snapshot), `operator_id`, and `approved_at` timestamp. Applied the schema changes successfully to the database.
- **WhatsApp Notification Service (`backend/app/services/notification_service.py`):** Developed a new service using `httpx` that posts formatted plain-text messages to Meta's WhatsApp Cloud API endpoint (Graph API `v18.0`). It extracts the incident details, constructs the alert template, displays the top recommended mitigation route, and includes the deep-linked dashboard URL. It falls back gracefully to logging in local environment.
- **Internal Notify Endpoint (`backend/app/routers/agent_router.py`):** Implemented the POST `/api/notify` endpoint. When the Decision Support Agent validates a crisis event, it posts a webhook call to `/api/notify` with the Supabase `incident_id`, which then queries the DB and dispatches the WhatsApp alert.
- **Approval REST Router (`backend/app/routers/approvals.py`):** Developed POST `/api/v1/approvals` (writes route approvals to DB with offline logger fallback) and GET `/api/v1/approvals` (returns list of approvals). Registered in `backend/app/main.py`.
- **Source Health REST Router (`backend/app/routers/health.py`):** Developed `GET /api/v1/health/sources` endpoint, querying the `source_health` table to retrieve real-time status of pipeline ingestions (BMKG, TomTom, AISstream, NASA FIRMS).
- **Incident Router Bugfix (`backend/app/routers/incidents.py`):** Identified and resolved a schema mismatch where the incidents router was attempting to query `id` instead of the actual primary key column name `incident_id`. Mapped `incident_id` to both `id` and `crisis_id` in API responses to align with types.

### Wave 2 — Frontend & UI
- **API Client (`frontend/lib/api.ts` & `frontend/lib/types.ts`):** Added API request bindings and typed interfaces for `approvals` and `sourceHealth` endpoints.
- **Approve Route Button (`frontend/components/sidebar/MitigationTab.tsx`):** Added an "Approve Route" button on active route cards. When approved, it calls the backend POST endpoint, updates the local card state to "✓ Route Approved & Logged", and pulls the logged state on component mount.
- **Source Health Banner (`frontend/components/ui/SourceHealthBanner.tsx`):** Created a floating glass panel component positioned at the bottom-left on the map layout. It polls `/api/v1/health/sources` every 30 seconds and shows colored status dots (healthy/degraded/offline/unknown) with relative last-seen times.
- **Toast Notifications (`frontend/components/ui/Toast.tsx`):** Created a lightweight, animated, auto-dismissing toast component (top-center, success/error/info variants) to confirm route approvals.
- **Dashboard Integration (`frontend/components/dashboard/DashboardClient.tsx`):** Wired both the `SourceHealthBanner` and `Toast` components into the main layout and propagated the approval success callback.

### Wave 3 — Configurations
- **Environment scaffold (`.env.example` & `backend/.env.example`):** Added new configuration keys `WHATSAPP_RECIPIENT_NUMBER` and `APP_URL`.
- **Backend configuration settings (`backend/app/config.py`):** Configured fields in settings class to capture the env vars.

---

## Verification & Testing

### 1. Python Unit Tests (Passed)
Ran the complete test suite in `backend/` using the local python virtual environment:
```powershell
$env:PYTHONPATH="d:\College\Pidi.id;d:\College\Pidi.id\backend"; .\.venv\Scripts\pytest
```
**Results:** All **34 tests passed** successfully.

### 2. Frontend Optimized Production Build (Passed)
Verified that all components compile, types resolve, and pages build cleanly with no ESLint or SSR errors:
```bash
npm run build
```
**Results:** **✓ Compiled successfully** with all static page generations completing correctly.
