---
phase: 61-render-cors-and-berita-audit-remediation
plan: 01
subsystem: api-frontend-integration
tags: [cors, render, vercel, nextjs-proxy, news-pipeline, demo-fixtures, hitl-validation]

# Dependency graph
requires:
  - phase: 59-e2e-audit-remediation-and-visual-lockdowns
    provides: E2E audit fixes and arterial coastal routing geometry
  - phase: 60-llm-swarm-post-key-audit
    provides: LLM swarm opencode-first gateway and pgvector 768 parity
provides:
  - Dual-layer CORS resolution: FastAPI regex (*.vercel.app) + Next.js App Router server proxy (/api/proxy/[...path])
  - Berita sidebar resiliency: Promise.allSettled + verified Sumatra news baseline + BERITA label
  - Demo fixture safety: Dockerfile data packaging + _find_data_file multi-path resolution + inline fallback
  - FastAPI dual-caller BackgroundTasks guard in get_live_news
  - UUID format validation in submit_hitl_operator_action (HTTP 422 on invalid format)
  - Registered GET / root endpoint returning API health status and documentation links
affects: [frontend-evaluator, news-sidebar, demo-runner, live-observability]

# Actuals
actuals:
  tokens: 15400
  tasks: 3
  commits: 1

# Tech tracking
tech-stack:
  added: [Next.js App Router server Route Handler proxy]
  patterns: [dual-layer CORS proxy fallback, Promise.allSettled multi-source hydration, multi-path fixture resolution]

key-files:
  created:
    - frontend/app/api/proxy/[...path]/route.ts
    - backend/tests/test_audit_fixes.py
  modified:
    - backend/app/config.py
    - backend/app/main.py
    - backend/app/routers/demo_router.py
    - backend/app/routers/news_router.py
    - backend/Dockerfile
    - render.yaml
    - frontend/lib/api.ts
    - frontend/hooks/useNewsVerification.ts
    - frontend/components/dashboard/DashboardClient.tsx
    - frontend/components/dashboard/SystemObservabilitySection.tsx

key-decisions:
  - "Implement dual-layer CORS resolution: update FastAPI CORSMiddleware regex for *.vercel.app while simultaneously adding Next.js server Route Handler proxy (/api/proxy/[...path]) for immediate zero-config client resilience."
  - "Decouple news live feed from market regime in useNewsVerification.ts using Promise.allSettled so commodity/regime hiccups never starve verified news articles."
  - "Package data/ into Docker container at /app/data/ and implement _find_data_file fallback hierarchy so POST /api/demo/start never throws 500."
  - "Strictly guard BackgroundTasks in news_router.py to handle background_tasks=None when invoked from internal background polling loops."
  - "Validate UUID strings before sending to Postgres/Supabase to return standard HTTP 422 instead of unhandled 500 database exceptions."
---

# Phase 61 Plan 01 Summary: Render CORS and Berita Audit Remediation

## Executive Overview
A full-stack operational audit of the deployed PreHub application (`https://pre-hub.vercel.app`) connected to the live Render backend (`https://peta-nadi.onrender.com`) surfaced split-origin CORS blockages, missing fixtures inside the Docker container, unhandled `BackgroundTasks` dual-caller scenarios, and sidebar discoverability gaps. All 6 root causes have been resolved, verified with live probes and automated regression tests, achieving 100% test pass rates across both backend and frontend layers.

## Key Changes Implemented

### 1. Backend CORS & Resilience
- **Config & Render Manifest**: Added `https://pre-hub.vercel.app` and `https://peta-nadi.onrender.com` to `backend/app/config.py` and `render.yaml`.
- **FastAPI CORS Middleware**: Broadened regex to `r"https?://((localhost|127\.0\.0\.1)(:\d+)?|.*\.vercel\.app|.*\.onrender\.com)"` to accept preview and production Vercel origins.
- **Root Endpoint (`GET /`)**: Added root status endpoint returning service info, version, and links to `/health` and `/docs`.
- **Docker Build Context**: Updated `backend/Dockerfile` with `COPY data/ ./data/` so `mock_crisis_state.json` and synthetic scenarios are available inside containerized deployments.
- **Demo Router Multi-Path Resolution**: Created `_find_data_file` in `backend/app/routers/demo_router.py` checking relative paths, current working directory, and script directory, backed by an inline crisis state dictionary fallback.
- **Dual-Caller `BackgroundTasks` Guard**: In `backend/app/routers/news_router.py`, guarded `background_tasks.add_task` with `if background_tasks is not None: ... else: asyncio.create_task(...)` to support both HTTP request injection and `_poll_news_loop` calls.
- **Postgres UUID Validation**: In `submit_hitl_operator_action` (`POST /api/v1/news/hitl-action`), validated `req.approval_id` with `uuid.UUID(str(...))` to return `HTTP 422 Unprocessable Entity` rather than throwing a 500 database exception on invalid UUID input.

### 2. Frontend Next.js Proxy & Berita Sidebar
- **App Router Server Proxy (`frontend/app/api/proxy/[...path]/route.ts`)**: Implemented dynamic proxy forwarding `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, and `OPTIONS` server-to-server to Render backend (`https://peta-nadi.onrender.com`).
- **Client API Adapter (`frontend/lib/api.ts`)**: Added intelligent `getBaseUrl()` host detection and automated proxy retry on browser CORS/network `TypeError` (`Failed to fetch`).
- **Berita Verification Hook (`frontend/hooks/useNewsVerification.ts`)**: Swapped `Promise.all` for `Promise.allSettled` to prevent regime lookup failures from blocking live news, and provided verified Sumatra fallback baseline articles.
- **Sidebar Discoverability (`frontend/components/dashboard/DashboardClient.tsx`)**: Renamed collapsed left sidebar floating toggle button from `SIDEBAR` to `BERITA`.
- **System Observability Section (`frontend/components/dashboard/SystemObservabilitySection.tsx`)**: Added automated server proxy fallback in `runSingleProbe` so all 26 REST API Evaluator endpoints report Render health accurately from Vercel.

## Verification & Test Results
- **Backend Pytest (`backend/tests/test_audit_fixes.py`)**: 5/5 tests passed (100%).
- **Frontend Compilation (`npx tsc --noEmit`)**: 0 errors.
- **Server-to-Server Live Probe**: All 26 REST API Evaluator endpoints verified returning `HTTP 200 OK` on `https://peta-nadi.onrender.com`.
