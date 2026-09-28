# Phase 43 Learnings: Self-Serve Fleet Onboarding & Live GPS Ingestion Engine

## Executive Context & Environment Boundaries
- **Project**: PreHub — AI Swarm Crisis Response & Dynamic Logistics Re-Routing Platform for the Sumatra Priority Corridor.
- **Operating System / Environment**: Windows 11, PowerShell shell, Python 3.13 venv (`backend/.venv/`), Next.js 14 App Router (`frontend/`), local SQLite (`backend/data/prehub_local.db`).
- **Core Constraints**:
  1. **Deterministic Execution**: Zero-GPU reliance for core routing; deterministic CPU solver using NetworkX + OR-Tools and Mapbox Directions.
  2. **Zero-Emoji UI/UX Policy**: 100% monochrome Lucide SVG icons; strict prohibition of emojis, AI purple/pink generic gradients, and non-pointer interactive buttons. Glassmorphism styling (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`).
  3. **Multi-Role RBAC Invariants**: Server-enforced role decision reading strictly from `app_metadata.role` (Supabase security best practice). `DISPATCHER` / `GUEST` have write/mutation permissions; `REGULATOR` is strictly read-only.
  4. **Token Optimization**: RTK (`Rust Token Killer`) CLI proxy prefixing on all terminal commands.

---

## Key Learnings & Architecture Patterns

### 1. Cross-Layer Schema & Variable Naming Alignment
- **Problem**: During multi-layer integrations (FastAPI Pydantic models -> SQLite tables -> TypeScript interfaces -> React forms), subtle field drift often emerges (e.g., `org_name` vs `organization` vs `org`, `vehicle_id` vs `id`, `speed_kmh` vs `speed`).
- **Solution**:
  - Enforced exact field mirroring:
    - User Profile: `org_name` across `UserSession` (Pydantic), `UserProfile` (TS), and JWT payload `app_metadata.org_name`.
    - Custom Vehicle: `vehicle_id`, `name`, `modality`, `driver_name`, `driver_phone`, `cargo`, `origin`, `destination`, `speed_kmh`, `temperature_c`.
    - Webhook Telemetry: `vehicle_id`, `latitude`, `longitude`, `speed_kmh`, `heading_deg`, `altitude_m`, `temperature_c`, `timestamp`, `battery_level`, `ignition`.
  - Added centralized constants for Sumatra strategic transit hubs (`SUMATRA_STRATEGIC_HUBS`) with 40+ coordinate pairs, enabling instant fallback synthesis if user manifests lack manual GPS waypoints.

### 2. Authorization Token Propagation in Multipart vs JSON Requests
- **Problem**: Standard JSON endpoints go through the centralized `request()` wrapper in `lib/api.ts` which automatically attaches `Authorization: Bearer <token>`. However, file uploads using `FormData` (multipart) often require custom `fetch()` calls to avoid overriding the browser's dynamic `multipart/form-data; boundary=...` header.
- **Fix Applied**: In `api.fleet.uploadManifestFile()`, explicitly extracted `currentAuthToken` and attached `headers['Authorization'] = 'Bearer ' + currentAuthToken` without setting a manual `Content-Type` header.
- **Prevention Rule**: Always check custom `fetch()` wrappers in `api.ts` to ensure `Authorization` headers are injected while preserving automatic multipart boundaries.

### 3. Role Normalization & Case-Insensitive Guarding
- **Problem**: In `approvals.py`, an early check used `if current_user.role == ROLE_REGULATOR:` without string case normalization. If any client or mock token provided lowercase `'regulator'`, the check could theoretically bypass or behave inconsistently.
- **Fix Applied**: Normalized all role comparisons to uppercase (`if current_user.role.upper() == ROLE_REGULATOR:`) across all backend routers (`approvals.py`, `fleet_ingest_router.py`, `auth_router.py`).
- **Prevention Rule**: Never assume incoming token roles are strictly title-cased or upper-cased in downstream routers; normalize via `.upper()` at the dependency decoding stage AND guard stage.

### 4. Mock Persona Synchronicity for Offline Evaluation
- **Problem**: When running in offline evaluator sandbox mode without active Supabase cloud connectivity, the frontend `authContext.tsx` generates local fallback persona profiles. A minor string variance existed (`'Dr. Hendra Wijaya (Analis Pangan)'` in frontend mock vs `'Dr. Hendra Wijaya (Analis Ketahanan Pangan)'` in backend defaults).
- **Fix Applied**: Synchronized all persona names, organization titles, and role constants between backend dictionaries (`DEFAULT_ROLE_NAMES`, `DEFAULT_ROLE_ORGS`) and frontend mock generators.
- **Prevention Rule**: Maintain an identical canonical dictionary of persona definitions in documentation and codebase.

### 5. WebGL Native Rendering & Real-Time GPS Fusion
- **Architecture Win**: Instead of recreating React DOM markers on every GPS ping (which degrades FPS when tracking dozens of units), fleet vehicles are rendered natively into Mapbox GL WebGL layers (`fleet-vehicles-layer` and `fleet-labels-layer`).
- **Telemetry Fusion**: `TelemetryService.get_unified_fleet()` merges SQLite custom onboarded vehicles with the baseline 45-unit multi-modal fleet, updating position, heading azimuth via forward geodesic calculation (`calculate_bearing`), and cold-chain status evaluation (`NORMAL` vs `WARNING_EXCURSION` at 4.0°C threshold).

### 6. Production Container Dependencies for FastAPI Form/File Endpoints
- **Problem**: FastAPI endpoints using `UploadFile = File(...)` or `Form(...)` (such as `/api/fleet/upload-manifest/file`) strictly require `python-multipart`. While often auto-installed or present in local development environments, if omitted from `backend/requirements.txt`, containerized deployment targets (e.g. Render, Docker) crash on startup with `RuntimeError: Form data requires "python-multipart" to be installed.` during route registration.
- **Fix Applied**: Added `python-multipart>=0.0.9` explicitly to `backend/requirements.txt`.
- **Prevention Rule**: Whenever introducing `File()` or `Form()` parameters in FastAPI routers, immediately verify that `python-multipart` is pinned in the root/backend `requirements.txt`.

---

## Verification Evidence
- **Backend Test Suite**: 108 / 108 tests passing in `backend/tests/` (including 9 dedicated tests in `test_fleet_ingest.py` and 15 tests in `test_auth_rbac.py`).
- **Frontend Production Build**: `next build` compiled cleanly across 7 static routes with 0 linting/type errors.
- **Git Commit History**: Fully tracked under atomic commits on branch `main`.
