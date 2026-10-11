# Phase 54: Post-Audit Plothole Remediation, Guest Lockdown Enforcement & PIHPS Persistence (Plan)

**Status:** COMPLETE ✅ (executed 2026-10-11 across commits `8f12e50`, `0ff2ac0`, `4df17de`)
**Predecessor:** `POST_IMPLEMENTATION_AUDIT_REPORT.md` (all findings resolved) and `.planning/phases/53-system-audit-routing-geometry-and-strict-rbac-guardrails/53-LEARNINGS.md` §2 backlog
**Successor:** `.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-PLAN.md`

---

## 1. Objective

Resolve every plothole recorded in `POST_IMPLEMENTATION_AUDIT_REPORT.md` and the Phase 53 backlog (deliverables A1–A3, B1–B3, C1–C4), and close the commodity data-availability gap discovered during remediation:

1. **Lane A — Runtime contract & semantics:** incremental detour delay (A1), `ROLE_GUEST` backend/frontend alignment (A2), honest `LIVE`/`FALLBACK` sensor badges (A3).
2. **Lane B — Lifecycle & state:** corridor impact persistence across the 30s poller (B1), predictive-risk 404 round-trip removal (B2), auth race-condition guards (B3).
3. **Lane C — UX & guardrails:** offline login bypass removal (C1), modal error icon (C2), `?guest=1` URL cleanup (C3), guest persona copy (C4).
4. **Lane D — Data availability:** persist PIHPS scraper output into `commodity_prices` (D1), run the scraper on FastAPI startup (D2), unblock public reads with migration 009 (D3).

---

## 2. Context, Environment & Constraints

- Host OS: Windows (PowerShell); commands proxied through `rtk` where applicable.
- Backend: Python + FastAPI (`backend/.venv`), Redis, Supabase (PostgreSQL 17 + PostGIS).
- Frontend: Next.js App Router; TypeScript compiler (`npx tsc --noEmit`) is the hard gate.
- Design guardrails from Phase 53: Lucide SVG icons only (no emoji), strict glassmorphism tokens, `text-xs` typography floor, no purple AI gradients.
- Live Supabase project `ulpmmacsdkohwkmyhlwj`; `commodity_prices` RLS state required a service-role write path (see `54-ENVIRONMENT-FIXES-AND-PITFALLS.md`).

---

## 3. Workstream A — Runtime Contract & Semantics

### A1. Relative Detour Delay (`delayMinutes` delta)

| | |
|---|---|
| **Root cause** | `applyOperationalImpact` received the route's **total** `eta_minutes` (38–90 min) instead of the incremental detour delay, inflating corridor delay accumulation. |
| **Files** | `frontend/components/dashboard/DashboardClient.tsx` |
| **Remedy** | New `resolveApprovedDelayMinutes(approved, routes)` helper: `Math.max(0, approved.eta_minutes − min(route.eta_minutes in set))`, never a hardcoded baseline. Wired at both call sites (approval handler + map approval), with `currentMapRoutes` added to the callback dependencies. |
| **Acceptance** | Approving a detour only adds the delta over the fastest route; `applyOperationalImpact` input ≥ 0 and never the raw ETA. |

### A2. `ROLE_GUEST` Alignment (Backend vs Frontend)

| | |
|---|---|
| **Root cause** | Frontend guest profile was locked to `permissions: []`, but backend `ROLE_GUEST` still held `approvals:write`, `scenarios:run`, `fleet:read`, etc. — mutation APIs remained callable by guests. |
| **Files** | `backend/app/auth/supabase_auth.py`, `backend/app/routers/approvals.py`, `backend/app/routers/fleet_ingest_router.py` |
| **Remedy** | `ROLE_GUEST` trimmed to read-only `['benchmark:read', 'reports:read']`. Mutation routers converted from role-name denylists (`if role == ROLE_REGULATOR`) to **permission-capability gates**: `approvals:write` (approvals), `fleet:write` + `manifests:upload` (fleet ingest, 4 endpoints). Guests and regulators now receive HTTP 403 with explicit `required_permissions` payloads. |
| **Acceptance** | Guest JWT → `POST /api/v1/approvals` and all fleet-write endpoints return 403; dispatcher passes. |

### A3. Sensed `LIVE` vs `FALLBACK` Branch

| | |
|---|---|
| **Root cause** | `useCorridorContext` always populated a fallback object, so `corridorContext?.weather` was permanently truthy and the `FALLBACK` badge branch was unreachable. |
| **Files** | `frontend/lib/types.ts`, `frontend/hooks/useCorridorContext.ts`, `frontend/components/dashboard/DashboardClient.tsx` |
| **Remedy** | Added `is_fallback: boolean` to `CorridorContext`; `DEFAULT_FALLBACK_CORRIDOR` sets `is_fallback: true`, fresh fetches set `is_fallback: false`. All three sensor badges (BMKG / TOMTOM / PIHPS) now render `FALLBACK` (amber) when the flag is set, `MEMUAT` (cyan) while loading, `LIVE` (emerald) otherwise. |
| **Acceptance** | Killing the backend flips badges to amber `FALLBACK`; live fetch shows green `LIVE`. |

---

## 4. Workstream B — Lifecycle & State

### B1. Corridor Recalculation Persistence Across the 30s Poller

| | |
|---|---|
| **Root cause** | The `fetchCorridor` interval overwrote locally applied detour impacts (`applyOperationalImpact`) with raw backend data every 30 seconds. |
| **Files** | `frontend/hooks/useCorridorContext.ts` |
| **Remedy** | `activeImpactRef` stores the latest approved impact; a shared `applyImpactToContext(base, impact)` recomputes congestion, delay, flow speed, checkpoint speeds and commodity prices. On every successful poll the fresh payload is re-based **and the stored impact re-applied** before `setCorridorContext`; on failure the default fallback is used only when no context exists yet. |
| **Acceptance** | After approval, effects survive at least one 30s refresh cycle (no revert to baseline). |

### B2. Predictive-Risk 404 Round-Trip Removal

| | |
|---|---|
| **Root cause** | Clicking a `pred-*` catalog risk called `api.incidents.get(id)` which always 404s (IDs are not in the `incidents` table). |
| **Files** | `frontend/components/dashboard/DashboardClient.tsx` |
| **Remedy** | Prefix guard: `if (!id.startsWith('pred-')) { … fetch … }` — predictive IDs skip the backend entirely and resolve from the local predictive catalog. |
| **Acceptance** | Clicking `pred-rob-belawan-48h` performs zero network calls to `/api/v1/incidents/*`. |

### B3. Auth Race-Condition Guards

| | |
|---|---|
| **Root cause** | Shared `isLoading` plus `setState` in finally blocks after unmount/interruption (switchRole, login, signUp, magic link). |
| **Files** | `frontend/lib/authContext.tsx` |
| **Remedy** | `isMountedRef` (set false on unmount) guards every `setState`/`applyToken` after async awaits; `finally` blocks only clear `isLoading` when mounted. |
| **Acceptance** | No React unmount warnings under rapid auth interactions; `npx tsc --noEmit` clean. |

---

## 5. Workstream C — UX & Guardrails

### C1. Offline Guest Login Bypass Removal

| | |
|---|---|
| **Root cause** | If Supabase was offline/unconfigured, any email/password minted a `DISPATCHER` session via `createGuestSession` — a full login bypass. |
| **Files** | `frontend/lib/authContext.tsx` |
| **Remedy** | Removed the guest-session fallback from `login`, `signUp`, and `loginWithMagicLink`. Added `AUTH_SERVICE_UNAVAILABLE_MESSAGE` ("Layanan autentikasi database sedang tidak tersedia") + `isAuthServiceUnavailable()` classifier. Failed init/logout return to the locked `DEFAULT_GUEST_PROFILE` (permissions `[]`). |
| **Acceptance** | With Supabase unreachable, login returns the explicit error — no session is created. |

### C2. Auth Modal Error Icon

| | |
|---|---|
| **Files** | `frontend/components/auth/AuthModal.tsx` |
| **Remedy** | Status alert now renders `AlertCircle` for errors and `CheckCircle2` only for success. |

### C3. `?guest=1` URL Cleanup

| | |
|---|---|
| **Files** | `frontend/components/auth/AuthModal.tsx` |
| **Remedy** | `dismissGuestQuery()` (via `usePathname`/`useRouter`) removes only the `guest` param, preserving other query state; invoked after successful sign-up, login, and magic-link processing. |

### C4. Guest Persona Copy Correction

| | |
|---|---|
| **Files** | `frontend/components/auth/AuthModal.tsx` |
| **Remedy** | Copy changed to *"Mode Pratinjau Terbatas (Evaluasi Tamu): Akses pemantauan peta dasar tanpa hak wewenang persetujuan atau mutasi rute operasional."* and badge `Akses Penuh` → `Akses Terbatas`. |

---

## 6. Workstream D — PIHPS Persistence, Startup Loop & Migration 009

### D1. Persist PIHPS Output to `commodity_prices`

| | |
|---|---|
| **Files** | `backend/app/scrapers/pihps_scraper.py` |
| **Remedy** | New `_get_write_client()` prefers the **service-role** client (RLS bypass) and falls back to the anon client; new `persist_price_points()` writes **every weekly period point** (not just the latest) with idempotent delete-then-insert per `(commodity, region, time)` key — no schema migration required, never raises. `parse()` calls persistence before spike detection and logs a warning when a commodity (e.g. `cabai_merah`) only exposes a level-1 aggregate row. |
| **Acceptance** | After one cycle, `commodity_prices` holds ~35 rows (7 commodities × ~5 weekly periods) and the scraper remains green even when Supabase is unavailable. |

### D2. Startup Loop

| | |
|---|---|
| **Files** | `backend/app/main.py` |
| **Remedy** | New `_poll_pihps_loop()` (24h normal / 15m crisis cadence inside `BaseScraper.run`) registered as a lifespan task (`pihps_task`) and added to the shutdown cancel list. |

### D3. Migration 009 — Public Read Policy

| | |
|---|---|
| **Files** | `infra/supabase/migrations/009_commodity_prices_public_read.sql` |
| **Remedy** | `create policy "commodity_prices_public_read" on public.commodity_prices for select to anon, authenticated using (true);` — unblocks anon reads of the price series. Writes remain service-role only (no INSERT policy). |

---

## 7. Execution Order (as run)

1. `8f12e50` — `fix(auth,corridor): resolve post-implementation audit findings` (A1–A3, B1–B3, C1–C4 across 12 files; +441/−180).
2. `0ff2ac0` — `feat(pihps): persist scraper output to commodity_prices and run it on startup` (D1, D2 + `KNOWN_POIS` test-compat alias; 4 files; +311/−13).
3. `4df17de` — `chore(db): add commodity_prices public read policy migration` (D3).

---

## 8. Verification Plan & Results

| Check | Result |
|---|---|
| `pytest backend/tests/test_auth_rbac.py` | ✅ 18/18 — guest mutation denial (HTTP 403), forged-signature rejection, `/switch-role` auth enforcement (suite extended +199 lines) |
| `pytest backend/tests/test_scrapers.py` | ✅ Extended (+187 lines) — `test_pihps_persists_all_period_points_to_supabase` and persistence safety tests |
| `pytest backend/tests/test_api_routers.py`, `test_fleet_ingest.py`, `test_outcomes_decisions.py` | ✅ Adjusted for permission gates and offline decision-log fallback |
| `npx tsc --noEmit` | ✅ 0 type errors |
| Live `GET /api/v1/commodities/prices` | ✅ Non-empty after persistence (previously failing with 0 DB rows) |
| `NEXT_CONTEXT_TASKS.md` / `POST_IMPLEMENTATION_AUDIT_REPORT.md` | ✅ Marked Done / resolved |

**Touched files (Phase 54 total):** `frontend/lib/authContext.tsx`, `frontend/lib/types.ts`, `frontend/components/auth/AuthModal.tsx`, `frontend/hooks/useCorridorContext.ts`, `frontend/components/dashboard/DashboardClient.tsx`, `backend/app/auth/supabase_auth.py`, `backend/app/routers/approvals.py`, `backend/app/routers/fleet_ingest_router.py`, `backend/app/main.py`, `backend/app/nlp/geocoding_service.py`, `backend/app/scrapers/pihps_scraper.py`, `infra/supabase/migrations/009_commodity_prices_public_read.sql`, plus the four test suites above.
