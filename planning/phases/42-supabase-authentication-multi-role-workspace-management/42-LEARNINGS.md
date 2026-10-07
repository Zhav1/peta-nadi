# Phase 42 Learnings & Engineering Retrospective

**Phase:** 42 (Supabase Authentication & Multi-Role Workspace Management)  
**Milestone:** M3 (PreHub MVP Pilot Operations & Multi-Persona Dispatcher Platform)  
**Date:** 2026-09-28  

---

## 1. Context, Conditions & Operating Environment

### 1.1 Environment Constraints
- **Operating System:** Windows (PowerShell 7 / 5.1).
- **Python Runtime:** Python 3.13.7 in `backend/.venv/Scripts/python.exe`.
  - Must invoke python directly with `backend/.venv/Scripts/python.exe` or ensure subshell PATH is refreshed.
- **Node Runtime:** Next.js 14.2.35 with TypeScript, Tailwind CSS, `@supabase/supabase-js`, `mapbox-gl`, `@deck.gl`.
- **Token Optimization Rule (RTK)**:
  - Commands should be prefixed with `rtk` (e.g. `rtk git status`, `rtk pytest`, `rtk npm run build`).
  - If `rtk` fails in subshells, refresh PATH from registry:
    ```powershell
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    ```
- **PowerShell Statement Separator Rule**:
  - In Windows PowerShell, chaining commands with `&&` causes a syntax error (`The token '&&' is not a valid statement separator`).
  - **Always use semicolon `;`** to separate sequential commands in PowerShell (e.g. `git add .; git commit -m "..."`).

---

## 2. Issues Encountered & Concrete Fixes

### 2.1 Issue 1: Supabase Role Extraction Tamper-Proofing
- **Problem**: In naive JWT auth setups, role information is often read from `user_metadata.role`. However, Supabase permits users to update their own `user_metadata` via the client SDK, creating a severe privilege escalation vector.
- **Root Cause & Fix**:
  - Authorization MUST strictly inspect `app_metadata.role` (which is server-signed and immutable by the client).
  - In `backend/app/auth/supabase_auth.py`, `decode_and_verify_token()` extracts `payload["app_metadata"]["role"]`.
  - Any attempt to spoof `user_metadata.role` is rejected or downgraded to `GUEST`.

### 2.2 Issue 2: Offline Competition & Air-Gapped Demo Reliability
- **Problem**: If Supabase Cloud JWKS endpoints are unreachable or the presenter has no internet connection at a competition venue, normal OAuth / OIDC flows will fail.
- **Solution**:
  - Implemented `create_guest_token()` using PyJWT with local HS256 signing secret.
  - Provided `POST /api/v1/auth/guest-session` and `POST /api/v1/auth/switch-role` that generate valid HMAC-signed tokens with 48h expiration.
  - In `frontend/lib/authContext.tsx`, if the cloud Supabase client cannot be reached, the application seamlessly uses signed guest tokens persisted in `localStorage` (`prehub_auth_token` and `prehub_auth_role`).

### 2.3 Issue 3: Variable Name Mismatches Between Pydantic and TypeScript
- **Precaution**: During multi-layer integrations, field name drift often occurs (e.g. `user_role` vs `role`, `orgName` vs `org_name`, `access_token` vs `token`).
- **Standardization Invariant**:
  - Pydantic models (`UserSession`, `AuthTokenResponse`, `RoleCatalogItem`) and TypeScript interfaces (`UserProfile`, `AuthTokenResponse`, `RoleCatalogItem`) use strictly identical snake_case keys:
    - `id: str / string`
    - `email: str / string`
    - `role: UserRole` (`DISPATCHER` | `REGULATOR` | `GUEST`)
    - `org_name: str / string`
    - `name: str / string`
    - `permissions: list[str] / string[]`
    - `is_offline_guest: bool / boolean`
    - `access_token: str / string`

### 2.4 Issue 4: Workflow Boundary Discipline
- **Mistake Made**: Automatically jumping into planning Phase 43 before the user explicitly requested it.
- **Correction Protocol**:
  - Always wait for explicit user direction before advancing phases or generating subsequent phase plans.
  - Keep each session focused on completing, verifying, and documenting the active phase thoroughly.

---

## 3. Verified Invariants & Architecture Checklist

1. **RBAC Endpoint Protection**:
   - `POST /api/v1/approvals` enforces `DISPATCHER` or `GUEST`. Any `REGULATOR` token receives an immediate `HTTP 403 Forbidden`.
2. **UI Minimalist Ergonomics**:
   - Zero emojis in all auth modals, top navigation buttons, and advisory cards (100% monochrome Lucide SVG icons).
   - Glassmorphism: `backdrop-blur-2xl bg-[#0c0e12]/95 border border-white/10`.
   - Explicit `cursor-pointer` on all interactive buttons.
3. **Automated Coverage**:
   - 15 dedicated auth/RBAC test cases (`backend/tests/test_auth_rbac.py`).
   - 99 total backend pytest tests passing (100%).
   - Next.js production build compiling with 0 type errors across all 7 routes.
