# Phase 53: Environment Fixes, Workarounds & Developer Pitfalls

## 1. Windows PowerShell & PATH Resolution
- **Issue**: Standard shell commands or global binaries (like `rtk` or `node`) intermittently fail to resolve when executed from fresh subshells in Windows.
- **Workaround**: Always prefix PowerShell subshells with environment refresh:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); <command>
  ```

## 2. Token Killer (`rtk`) Proxy
- **Rule**: All repository commands must be proxied through `rtk` (`rtk git status`, `rtk npx tsc --noEmit`, etc.) to minimize token bloat.
- **Caveat**: When executing long background commands via `run_command`, monitor task status with `manage_task` rather than blocking synchronously.

## 3. Subagent Dispatch (`cmdc`) Permission Safeguards
- **Observation**: Running `cmdc` headless (`-p`) without `--yolo` or `--tools-all` causes file edits and shell executions to be permission-blocked.
- **Pitfall**: When subagents run deep reasoning models (`max` effort), they can occasionally take several minutes to complete comprehensive codebase surveys. For targeted fixes, setting appropriate model tiers (`deepseek-v4.1-flash` for code, `glm-5.3-flash` for fast checks) optimizes speed and reliability.
- **Safeguard**: Destructive actions (bulk file deletion, hard resets) must always be approved by the human operator.

## 4. Next.js Edge Middleware vs Base64 Decoding
- **Issue**: Standard Node.js `Buffer` is not guaranteed in Edge runtime environments without polyfills.
- **Fix**: In `frontend/middleware.ts`, lightweight JWT payload extraction was implemented using pure browser-compatible primitives (`atob` with base64 character mapping `-` $\to$ `+`, `_` $\to$ `/` and padding calculation), ensuring 100% zero-dependency compatibility on the Edge.

## 5. Offline Supabase vs Mock Adapters
- **Issue**: When running in an environment without live Supabase database credentials, local adapters for BMKG, TomTom, and AISstream are fully operational, but endpoints checking the `data_sources` table returned `"unknown"`.
- **Fix**: In `backend/app/routers/health.py`, the fallback was updated to report active adapters as `"healthy"` (`note: "verified_active_adapter"`), ensuring the application's telemetry indicators accurately reflect local engine readiness.
