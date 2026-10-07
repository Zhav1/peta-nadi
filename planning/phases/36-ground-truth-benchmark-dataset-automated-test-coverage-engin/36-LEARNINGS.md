# Phase 36 Learnings, Context, Constraints and Problem-Solving Archive

This document captures all critical learnings, environmental constraints, runtime conditions, and diagnosed failure modes discovered during Phase 36 execution and verification. Future context windows and phases must reference this document to prevent regression or repeated errors.

---

## 1. Operating Environment and System Constraints

### A. OS, Shell and Terminal Proxy
- **Operating System:** Windows 11 (64-bit).
- **Shell:** Windows PowerShell.
- **Command Proxy (rtk):** All shell commands must be routed through rtk to reduce token overhead. In new terminal sessions where rtk is not in PATH, refresh registry environment variables first:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
  ```
- **Virtual Environment:** Use the explicit virtual environment Python binary:
  `d:\College\Pidi.id\backend\.venv\Scripts\python.exe`
  Do not use the global system Python `C:\Python313\python.exe` which lacks project dependencies.
- **Module Import Resolution (PYTHONPATH):**
  Backend tests and scripts require both `backend` and repository root on `PYTHONPATH`:
  `$env:PYTHONPATH = "d:\College\Pidi.id\backend;d:\College\Pidi.id"`

### B. Encoding, Charmap and Style Prohibitions
- **Zero Emojis in CLI / Backend Scripts:** Windows cp1252 console encoding crashes with `UnicodeEncodeError: 'charmap' codec can't encode character` if emoji characters (such as checkmarks, status symbols, or flags) are printed in Python stdout/stderr or pytest assertion messages. Use plain ASCII markers like `[OK]`, `[FAIL]`, `[PASS]`, `[WARN]`.
- **Zero Em Dashes:** The project specification strictly prohibits em dashes in all documentation, code comments, and conversational output. Use colons, parentheses, or commas instead.
- **File Encoding (No UTF-8 BOM):** Never write configuration files (especially `.coveragerc` or `.ini` files) with UTF-8 BOM (`\ufeff`). Standard Python `configparser` will raise `MissingSectionHeaderError`. Always save as standard UTF-8 (`encoding='utf-8', newline='\n'`).

---

## 2. Issues Encountered and Diagnosed Fixes

### Issue 1: UTF-8 BOM Crash in `.coveragerc`
- **Symptom:** `coverage.exceptions.ConfigError: Couldn't read config file .coveragerc: File contains no section headers. file: '.coveragerc', line: 1 '\ufeff[run]\n'`
- **Root Cause:** File creation utility created `.coveragerc` with a UTF-8 Byte Order Mark (`\ufeff`), breaking Python `configparser`.
- **Permanent Solution:** Re-wrote `.coveragerc` using pure UTF-8 without BOM. When creating config files via script, explicitly specify `encoding='utf-8'` and ensure the first character is `[` without preamble.

### Issue 2: Frontend-to-Backend Fleet Route Mismatch (`/vehicles` vs `/api/v1/fleet/vehicles`)
- **Symptom:** In live API mode, `frontend/lib/api.ts` requested `/api/v1/fleet/vehicles`, but `backend/app/routers/vehicles_router.py` only had `@router.get("/vehicles")` mounted without `/api/v1` prefix in `main.py`, returning HTTP 404.
- **Root Cause:** Route naming divergence between frontend API client and backend router definitions.
- **Permanent Solution:** Added dual-route decorator to `vehicles_router.py`:
  ```python
  @router.get("/vehicles")
  @router.get("/api/v1/fleet/vehicles")
  async def get_active_fleet(...)
  ```

### Issue 3: Parameterized Incident Route Catch-All Collisions
- **Symptom:** Frontend client methods `api.incidents.historical()` (`/api/v1/incidents/historical/episodes`), `api.incidents.predictive()` (`/api/v1/incidents/predictive/risks`), and `api.incidents.osint()` (`/api/v1/incidents/osint/feed`) failed with 404/500 errors.
- **Root Cause:** In FastAPI, `@router.get("/{incident_id}")` was declared before sub-resource endpoints, capturing `"historical"`, `"predictive"`, and `"osint"` as incident IDs and querying Supabase.
- **Permanent Solution:** Explicitly registered dedicated sub-resource handlers (`/historical/episodes`, `/predictive/risks`, `/osint/feed`, `/osint/live`) **above** `@router.get("/{incident_id}")`.

### Issue 4: Approval Creation Payload Schema Flexibility
- **Symptom:** Potential validation failure if frontend sent extra audit fields (`crisis_id`, `approved_by`, `notes`, `route_name`, `origin`, `destination`).
- **Root Cause:** Backend `ApprovalCreate` Pydantic model required `incident_id` and had no optional fields declared.
- **Permanent Solution:** Enhanced `ApprovalCreate` with optional fields and dynamic fallback mappings:
  ```python
  inc_id = payload.incident_id or payload.crisis_id or "INC-DEFAULT"
  op_id = payload.operator_id or payload.approved_by or "anonymous"
  ```

### Issue 5: Commodity Router Plural/Singular Aliasing and Missing Anomaly Endpoint
- **Symptom:** Mismatches between `/commodities/prices` (plural) and legacy singular `/commodity/spikes` calls.
- **Root Cause:** Inconsistent route prefixes in router registration.
- **Permanent Solution:** Mounted both `/api/v1` and `/api/v1/commodity` aliases in `main.py` and implemented the dedicated `/spikes` anomaly detection endpoint.

### Issue 6: Separation of Offline Benchmark Data vs Runtime Endpoints
- **Constraint:** The prototype application must maintain strict separation between offline evaluation benchmark data (`data/benchmark/`) and live runtime endpoints.
- **Solution:** Offline benchmarks run through `scripts/evaluate_metrics.py` and `backend/tests/test_benchmark_eval.py`, asserting statistical invariants without contaminating runtime state stores or requiring live Supabase credentials.

---

## 3. Checklist for Future Context Windows and Phases

When starting Phase 37 and subsequent phases:
1. Always check that newly added FastAPI router endpoints have matching frontend definitions in `frontend/lib/api.ts` and `frontend/lib/types.ts`.
2. Ensure static/literal route paths are registered BEFORE parameterized `{id}` routes in FastAPI routers.
3. Keep all unit and integration test assertions hermetic (utilizing mock fallbacks when Supabase or external APIs are offline).
4. Run full test suite with coverage before committing:
   ```powershell
   $env:PYTHONPATH = "d:\College\Pidi.id\backend;d:\College\Pidi.id"; & "d:\College\Pidi.id\backend\.venv\Scripts\python.exe" -m pytest backend/tests --cov=app --cov=agents
   ```
5. Run frontend build to verify zero TypeScript typing regressions:
   ```powershell
   npm run build
   ```
