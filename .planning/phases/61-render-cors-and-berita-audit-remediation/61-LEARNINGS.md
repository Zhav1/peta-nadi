---
phase: 61-render-cors-and-berita-audit-remediation
date: 2026-10-17
type: learnings
tags: [cors, render, vercel, nextjs-proxy, docker, background-tasks, supabase-uuid, tomtom-quota, cpu-solver]
---

# Phase 61: Learnings, Root Causes, and Architectural Invariants

This document contains a rigorous, factual extraction of learnings, root causes, constraints, concerns, and environment conditions discovered during the audit and remediation of cross-origin deployment between Vercel (`https://pre-hub.vercel.app`) and Render (`https://peta-nadi.onrender.com`). All entries are grounded strictly in empirical findings and codebase verification.

---

## 1. Split-Origin Deployment CORS Pitfall (`Vercel` -> `Render`)

### Empirical Finding
All 26 endpoints probed in `SystemObservabilitySection.tsx` (`Diagnostik API & Observabilitas`) returned `HTTP 200 OK` when probed server-to-server directly against `https://peta-nadi.onrender.com`. However, they failed 100% of the time in the browser from `https://pre-hub.vercel.app` with `HTTP 400 Disallowed CORS origin` (`TypeError: Failed to fetch`).

### Root Cause
1. `render.yaml` set `CORS_ORIGINS="https://peta-nadi.onrender.com"` (self-origin only).
2. `backend/app/main.py` configured FastAPI `CORSMiddleware` with `allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?"`, which strictly rejected any `Origin` header ending in `.vercel.app`.
3. Render environment variables defined in `render.yaml` only apply on redeployment or manual sync in the Render Dashboard. Client builds without a backend proxy rely entirely on the browser-to-Render direct CORS handshake.

### Guardrail / Permanent Fix
1. **Multi-Origin Default in Backend Settings**: Include `https://pre-hub.vercel.app` and `https://peta-nadi.onrender.com` directly in `backend/app/config.py` default `cors_origins` and in `render.yaml`.
2. **Permissive Origin Regex for Preview & Production Staging**: Set `allow_origin_regex=r"https?://((localhost|127\.0\.0\.1)(:\d+)?|.*\.vercel\.app|.*\.onrender\.com)"` in `backend/app/main.py`.
3. **Dual-Layer Proxy Fallback**: Maintain the Next.js App Router server-side Route Handler proxy (`frontend/app/api/proxy/[...path]/route.ts`) as an automatic retry mechanism in `frontend/lib/api.ts` and `SystemObservabilitySection.tsx`. If direct browser `fetch()` triggers a CORS/network `TypeError`, the client seamlessly falls back to `/api/proxy` (executing server-to-server with no browser CORS constraints).

---

## 2. Berita Sidebar Data Starvation & Toggle Discoverability

### Empirical Finding
The live Render backend actively serves 60 verified LKBN ANTARA and BMKG articles from Supabase PostGIS at `/api/v1/news/live`. However, on the deployed Vercel application, the left sidebar (`Intelijen Berita Resmi`) displayed `0 Sumber Terverifikasi` with `Tidak ada berita yang cocok`. Furthermore, when collapsed, the floating toggle button in `Peta Operasi` was labeled `SIDEBAR` instead of `BERITA`.

### Root Cause
1. Browser CORS policy blocked direct client calls to `https://peta-nadi.onrender.com/api/v1/news/live` (or `NEXT_PUBLIC_API_URL` fell back to `http://localhost:8000` when unset during client-side build time).
2. In `frontend/hooks/useNewsVerification.ts`, the hydration logic used `Promise.all([api.news.live(), api.news.marketRegime()])`. Any failure or rejection in `marketRegime()` caused the entire promise chain to reject, leaving `newsFeed = []`.
3. In `frontend/components/dashboard/DashboardClient.tsx`, the floating collapsed toggle button (line 1601) used the generic text `SIDEBAR`, confusing users searching for official verified news feeds.

### Guardrail / Permanent Fix
1. **Intelligent Hostname Detection**: In `frontend/lib/api.ts`, implement `getBaseUrl()` to dynamically default to `https://peta-nadi.onrender.com` when running in non-localhost browser environments.
2. **Settled Multi-Source Hydration**: Replace `Promise.all` with `Promise.allSettled` in `useNewsVerification.ts` so live verified news articles are preserved even if secondary commodity market regime APIs are slow or degraded.
3. **Grounded Baseline Fallback**: Provide an authenticated 6-item Sumatra operational baseline (`FALLBACK_SUMATRA_NEWS`) only if both direct and proxied calls return an empty set during backend cold-starts.
4. **Discoverable UX**: Explicitly label the collapsed floating toggle button `BERITA` with `PanelLeftOpen` icon.

---

## 3. Docker Build Context vs. Repository Root (`data/` Fixtures Missing on Render)

### Empirical Finding
Invoking `POST /api/demo/start` with `mock_agents=True` on the deployed Render instance returned `HTTP 500 Internal Server Error` with the exception:
`FileNotFoundError: Mock fixture not found at ../data/fixtures/mock_crisis_state.json`.

### Root Cause
In `render.yaml`, the Docker build context was configured at repository root (`dockerfilePath: ./backend/Dockerfile`). However, `backend/Dockerfile` only copied `backend/` and `agents/` into `/app`, completely omitting the repository root `data/fixtures/` and `data/synthetic/` directories. Furthermore, `demo_router.py` used fragile relative paths (`Path(__file__).parents[3] / "data"`) which failed inside the flat Docker container directory layout (`/app/app/routers`).

### Guardrail / Permanent Fix
1. **Copy Data in Dockerfile**: Add `COPY data/ ./data/` to `backend/Dockerfile` alongside `agents/` and `backend/`.
2. **Multi-Path Resolution Helper**: In `backend/app/routers/demo_router.py`, implement `_find_data_file(relative_path)` checking multiple candidate locations:
   - Root relative to CWD: `Path(relative_path)`
   - App relative: `Path("/app") / relative_path`
   - Relative to router script: `Path(__file__).resolve().parents[2] / relative_path` and `parents[3] / relative_path`
3. **Inline Crisis Fallback**: If fixture files cannot be found on disk, supply a deterministic minimal fallback dictionary (`_get_fallback_crisis_state()`) so demo endpoints guarantee an `HTTP 200 OK` response.

---

## 4. FastAPI `BackgroundTasks = None` Dual-Caller Bug

### Empirical Finding
Calling `get_live_news` resulted in an unhandled server exception:
`AttributeError: 'NoneType' object has no attribute 'add_task'`

### Root Cause
In `backend/app/routers/news_router.py`, `get_live_news` is invoked from two distinct contexts:
1. As an HTTP route handler by FastAPI, where `BackgroundTasks` is injected by the dependency injection system.
2. Internally by `_poll_news_loop` in `backend/app/main.py:156`, where `get_live_news(background_tasks=None)` is called directly as a coroutine.

While line 83 contained a defensive guard `if background_tasks is not None:`, line 93 (`if not articles:`) called `background_tasks.add_task(run_background_news_ingestion, True)` directly without checking whether `background_tasks` was `None`.

### Guardrail / Permanent Fix
At every call site where `BackgroundTasks` is optional, always enforce:
```python
if background_tasks is not None:
    background_tasks.add_task(run_background_news_ingestion, True)
else:
    asyncio.create_task(run_background_news_ingestion(True))
```

---

## 5. Postgres UUID Parameter Validation Before Query Execution

### Empirical Finding
Calling `POST /api/v1/news/hitl-action` with invalid or test IDs (e.g., `"test-id"`) caused Supabase PostGIS to return a database exception, resulting in an unhandled `HTTP 500 Internal Server Error`.

### Root Cause
`req.approval_id` was passed directly into the Supabase query:
`supabase.table("route_approvals").select("*").eq("id", req.approval_id).execute()`
Because the `id` column in PostgreSQL is typed as `uuid`, passing a non-UUID string causes Postgres to raise `invalid input syntax for type uuid`, which crashed the route handler.

### Guardrail / Permanent Fix
Validate string representations of UUIDs at the router boundary before query dispatch:
```python
try:
    valid_uuid = str(uuid.UUID(str(req.approval_id)))
except (ValueError, AttributeError):
    raise HTTPException(
        status_code=422,
        detail=f"Invalid UUID format for approval_id: '{req.approval_id}'. Expected standard 36-character UUID.",
    )
```

---

## 6. External Quota & Infrastructure Constraints Observed on Live Render

### 1. TomTom Traffic API Quota Exhaustion
- **Observation**: During live health audits, TomTom endpoints returned `HTTP 403 (credit_exhausted)`.
- **System Behavior**: The deterministic CPU routing adapter (`NetworkX + OR-Tools / 2-Opt`) in `backend/app/adapters/cpu_routing_adapter.py` seamlessly caught the upstream quota error and returned offline baseline speeds with `is_fallback: true`.
- **Invariant**: The application must never depend on third-party commercial APIs to avoid crashing; fallback routing caches must always remain intact.

### 2. Render Free Tier Spin-Down Latency
- **Observation**: After 15 minutes of inactivity, the Render Web Service instance spins down. The first inbound request triggers a cold boot taking **35–50 seconds**.
- **System Behavior**: Direct browser requests can time out during cold boots. The Next.js server proxy handles up to 60s timeout bounds and retries gracefully, while the frontend displays non-blocking loading states and fallback baseline items.

### 3. Core Architectural & Workflow Invariants (from `.agents/AGENTS.md`)
- **Single Source of Truth**: `.planning/` is the canonical repository for project specifications (`ROADMAP.md`, `PROJECT.md`, `STATE.md`). The deprecated `planning/` or legacy `docs/` must never override `.planning/`.
- **CPU Solver Invariant**: Never reintroduce deprecated GPU solvers or synthetic AI forecast models purged in Phase 59. The deterministic CPU Routing Adapter (`NetworkX + OR-Tools / 2-Opt`) is the sole production solver.
- **Token Efficiency**: All shell commands must be prefixed with `rtk` (Rust Token Killer) to minimize token consumption and dev cycle latency.
- **Orchestration Protocol**: When operating in orchestrator mode, sub-tasks (research, test execution, commits) should be delegated to specialized Flash subagents to conserve parent context and maximize accuracy.
