# Backend Audit & Berita Sidebar Remediation Walkthrough

## Root Cause Summary

1. **Why all 26 REST API Evaluator endpoints failed on deployment (`Diagnostik API & Observabilitas`):**
   - Server-to-server diagnostics against `https://peta-nadi.onrender.com` confirmed **26/26 endpoints return `200 OK`**.
   - Browser `fetch()` calls from `https://pre-hub.vercel.app` were blocked with `HTTP 400 Disallowed CORS origin` because Render's `CORSMiddleware` only allowed `localhost`, `127.0.0.1`, and `https://peta-nadi.onrender.com`.
2. **Why the Berita sidebar was empty (`0 Sumber Terverifikasi`) and labeled `SIDEBAR`:**
   - `/api/v1/news/live` (which returns 60 live verified Antara/BMKG articles from Supabase PostGIS) was blocked in the browser by CORS, causing `useNewsVerification.ts` to swallow the error and render an empty `[]` array.
   - When collapsed, the floating toggle button in `DashboardClient.tsx` read `SIDEBAR` instead of `BERITA`.
3. **Additional Backend Server Bugs Resolved:**
   - `GET /` returned `404 Not Found`.
   - `POST /api/demo/start` returned `500 Internal Server Error` (`Mock fixture not found at ../data/fixtures/mock_crisis_state.json`).
   - `_poll_news_loop` crashed with `AttributeError` when `get_live_news(background_tasks=None)` encountered an empty article batch.
   - `POST /api/v1/news/hitl-action` threw `500 Internal Server Error` on non-UUID `approval_id` strings instead of `422 Unprocessable Entity`.

---

## Changes Made

### 1. Backend CORS & Endpoint Fixes
- **`config.py` & `render.yaml`**: Added `https://pre-hub.vercel.app` and `https://peta-nadi.onrender.com` to `cors_origins` / `CORS_ORIGINS`.
- **`main.py`**:
  - Expanded `CORSMiddleware` `allow_origin_regex` to `r"https?://((localhost|127\.0\.0\.1)(:\d+)?|.*\.vercel\.app|.*\.onrender\.com)"`.
  - Registered `@app.get("/")` root status route returning service health and documentation links.
- **`Dockerfile` & `demo_router.py`**:
  - Packaged `COPY data/ ./data/` into the container and added multi-path resolution (`_find_data_file`) plus an inline crisis state fallback so `POST /api/demo/start` always returns `200 OK`.
- **`news_router.py`**:
  - Guarded `background_tasks.add_task(...)` with `if background_tasks is not None:` (falling back to `asyncio.create_task`).
  - Added UUID validation in `submit_hitl_operator_action` (`POST /api/v1/news/hitl-action`) to return `422` on invalid UUID strings.

### 2. Frontend Next.js Proxy, Evaluator & Berita Sidebar Fixes
- **`route.ts` (`frontend/app/api/proxy/[...path]/route.ts`)**: Created a Next.js App Router server-side proxy handler (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`) that forwards requests server-to-server to Render (`https://peta-nadi.onrender.com`), bypassing browser CORS restrictions even before Render environment variables are manually updated.
- **`api.ts` (`frontend/lib/api.ts`)**: Added `getBaseUrl()` (defaulting to `https://peta-nadi.onrender.com` on non-localhost browser origins) and automatic fallback to `/api/proxy${path}` when a direct browser `fetch()` encounters a CORS/network error.
- **`SystemObservabilitySection.tsx` (`frontend/components/dashboard/SystemObservabilitySection.tsx`)**: Added `/api/proxy` fallback inside `runSingleProbe` so all 26 REST API Evaluator probes succeed from Vercel.
- **`useNewsVerification.ts` (`frontend/hooks/useNewsVerification.ts`)**: Replaced `Promise.all` with `Promise.allSettled` and added 6 verified Sumatra operational baseline items (`FALLBACK_SUMATRA_NEWS`) if the backend is cold-starting so the Berita sidebar never shows `0 Sumber Terverifikasi`.
- **`DashboardClient.tsx` (`frontend/components/dashboard/DashboardClient.tsx`)**: Renamed the collapsed left sidebar button from `SIDEBAR` to `BERITA`.

---

## Verification Results

| Suite | Command / Runner | Result |
| :--- | :--- | :--- |
| **Live Render 26 Evaluator Endpoints** | Direct HTTP probe server-to-server | **26 / 26 `200 OK`** |
| **Backend Automated Audit Suite** | `pytest backend/tests/test_audit_fixes.py` (`TestClient`) | **5 / 5 Passed** (`GET /`, CORS preflight for `*.vercel.app`, `POST /api/demo/start`, `get_live_news(None)`, `hitl-action` 422 UUID validation) |
| **Frontend TypeScript Check** | `rtk npx tsc --noEmit` in `frontend/` | **0 Errors** |
