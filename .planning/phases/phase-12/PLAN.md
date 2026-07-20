# PLAN — Phase 12: Route Alignment & Simulation State Hardening

## Goals
Fix the critical HTTP 404 error on `POST /api/demo/start`, align backend demo router prefixes with frontend calls, and harden client-side demo state against network disruptions and UI resets.

## Root Cause Analysis
1. `backend/app/routers/demo_router.py` defined `prefix="/demo"` and was included in `main.py` without an `/api` prefix, exposing `/demo/start` instead of `/api/demo/start`. Frontend `api.ts` called `/api/demo/start`, causing an HTTP 404 error.
2. `useDemoState.ts` caught the 404 error and called `setIsRunning(false)`, causing the UI to flicker and reset within 1 ms.

## Proposed Fixes
1. Update `demo_router.py` to use `prefix="/api/demo"`. Include `demo_router.router` in `main.py` with backward-compatibility aliases.
2. In `useDemoState.ts`, add client-side mock fallback when offline or when backend fails, avoiding 1ms UI flickering.
3. Ensure drawing mode state toggles cleanly in `DashboardClient.tsx`.

## Verification Plan
1. `rtk docker compose run --rm backend pytest`
2. `rtk docker compose build frontend`
3. Click "Run Demo" and verify HTTP 200 response and smooth stepper progression.
