# Phase 42: Supabase Authentication & Multi-Role Workspace Management — Research

## 1. Domain Background & Technical Objectives

Milestone M3 establishes PreHub as an MVP Pilot Operations platform capable of supporting multi-persona logistics coordination across commercial freight operators, government regulators, and competition evaluators.

Phase 42 delivers multi-tenant authentication and Role-Based Access Control (RBAC) across backend and frontend systems:
1. **Multi-Tenant Supabase Authentication & JWT Middleware**:
   - Verify Supabase JWT tokens via PyJWT with public key / secret signature validation.
   - Fallback to resilient local offline guest sessions when cloud connectivity is unavailable.
   - Strict security compliance per Supabase guidelines: Authorization decisions must check `app_metadata.role` (server-controlled), never mutable `user_metadata`.
2. **Role-Based Access Control (RBAC)**:
   - **DISPATCHER** (`PT Samudera Logistik Sumatra`): Full route planning, fleet management, custom manifest upload, and mitigation approval authority (`fleet:write`, `routes:plan`, `approvals:write`).
   - **REGULATOR** (`Badan Pangan Nasional / Kemenhub`): Read-only macro corridor vulnerability heatmaps, PIHPS staple price analytics, audit logs, and 1-click exportable B2G executive briefing reports (`heatmap:read`, `prices:read`, `reports:export`, `audit:read`).
   - **GUEST / EVALUATOR** (`Kompetisi LRIP Evaluator`): Full interactive demo mode, guided scenario runner, and empirical benchmark audit inspection (`all:sandbox`, `benchmark:read`, `scenarios:run`).
3. **Frontend Minimalist Ergonomics & Role-Adaptive UI**:
   - 1-Click Persona Switcher for competition evaluators to instantly test all 3 views without signing out or re-entering credentials.
   - Supabase Auth Email/Password & Magic Link options.
   - Role-adaptive Top Navigation and action button gating (e.g. only Dispatchers & Guests can dispatch route mitigation approvals; Regulators see advisory status).
   - Zero-emoji minimalist design system: 100% monochrome Lucide SVG icons, high contrast glassmorphism (`backdrop-blur-xl bg-[#0c0e12]/95 border border-white/10`).

---

## 2. Codebase Audit & Architectural Touchpoints

### A. Backend Architecture
- **JWT Verification & Security Model**:
  - `PyJWT==2.13.0` is already installed in `backend/.venv`.
  - Supabase signs tokens with HMAC-SHA256 (using `JWT_SECRET`) or asymmetric RS256/ES256 (via Supabase JWKS `/.well-known/jwks.json`).
  - `backend/app/auth/supabase_auth.py` will implement dual-mode verification:
    1. Online verification against Supabase JWT secret or JWKS endpoint.
    2. Resilient local offline signature verification for deterministic guest/demo tokens.
  - Dependency `get_current_user`: extracts `{ id, email, role, org_name, permissions }`.
  - Dependency `require_roles(allowed_roles: list[str])`: enforces HTTP 403 Forbidden with structured error response if user role is not permitted.
  - Dependency `get_optional_user`: allows public endpoints to optionally associate operations with authenticated identities.
- **REST Endpoints (`backend/app/routers/auth_router.py`)**:
  - `GET /api/v1/auth/me`: Returns current user identity, active role, organization name, and assigned permission list.
  - `POST /api/v1/auth/guest-session`: Issues a valid signed token for specified role (`DISPATCHER`, `REGULATOR`, `GUEST`) for offline or evaluator testing.
  - `POST /api/v1/auth/switch-role`: Allows evaluators to switch active persona dynamically.
- **Endpoint Protection Integration**:
  - `backend/app/routers/approvals.py`: Protect `POST /api/v1/approvals` with `@require_roles(["DISPATCHER", "GUEST"])`.
  - Register `auth_router` in `backend/app/main.py` under `/api/v1/auth`.

### B. Frontend Architecture
- **Supabase Client (`frontend/lib/supabaseClient.ts`)**:
  - Initializes `@supabase/supabase-js` client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Exposes helper for session management with graceful offline fallback.
- **Auth Context Provider (`frontend/lib/authContext.tsx`)**:
  - Global state: `user`, `token`, `role` (`DISPATCHER` | `REGULATOR` | `GUEST`), `isLoading`, `isAuthenticated`.
  - Methods: `login(email, password)`, `loginWithMagicLink(email)`, `switchRole(role)`, `logout()`, `openAuthModal()`, `closeAuthModal()`.
  - Sets Bearer token in `frontend/lib/api.ts` requests.
- **Minimalist Auth Modal (`frontend/components/auth/AuthModal.tsx`)**:
  - High-contrast glassmorphic dialog with 3 tabs:
    1. `1-KLIK PERSONA (EVALUATOR)`: Instant cards for Dispatcher, Regulator, Guest.
    2. `EMAIL & SANDI`: Supabase login/signup.
    3. `MAGIC LINK`: Passwordless auth.
  - Zero emojis (Lucide icons: `Shield`, `User`, `Key`, `Mail`, `ArrowRight`, `Lock`, `Building`, `CheckCircle2`, `Sparkles`, `X`, `Briefcase`, `Scale`, `FlaskConical`).
- **Dashboard & Navigation Synchronization (`DashboardClient.tsx` & `MitigationTab.tsx`)**:
  - Top header displays tactical role pill: `[ DISPATCHER ] PT Samudera`, `[ REGULATOR ] Bapanas`, `[ GUEST ] Evaluator`.
  - Clicking role pill opens `AuthModal`.
  - Role-adaptive tab availability and highlighting:
    * `DISPATCHER`: PETA OPERASI, SIMULATION, EVALUATION
    * `REGULATOR`: PETA OPERASI, ANALYTICS, REPORTS, EVALUATION
    * `GUEST`: All tabs active
  - `MitigationTab.tsx`: Disables route approval button with an informative badge if current user is `REGULATOR` ("Hanya Dispatcher Berwenang"), enables for `DISPATCHER` / `GUEST`.

---

## 3. Plan Decomposition

- **Plan 42-01**: Backend Supabase JWT Auth Middleware, Role-Based Access Control (RBAC), User Routers & Pytest Suite
- **Plan 42-02**: Frontend Supabase Client, Auth Context, Minimalist Auth Modal & Role-Adaptive Navigation
