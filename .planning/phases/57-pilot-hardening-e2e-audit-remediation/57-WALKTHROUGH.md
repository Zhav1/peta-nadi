<!-- generated-by: gsd-doc-writer -->
# Phase 57: Pilot Hardening (E2E Audit Remediation) — Technical Walkthrough

**Purpose:** the complete, evidence-grade breakdown of the Track A work packages implemented in this phase, with exact file:line anchors, before/after contrasts, and the verification ledger. This document is the implementation record for `57-PLAN.md` (decisions D1–D8). **TRACK A record; Track B pending** — STEP 0 + Track A (frontend) are done and pushed to `origin/main`; Track B (backend/auth, friend's) is NOT done.

**Evidence sources:**
- `git show --stat` on the 7 Track A commits (`93bead5`, `d2253f3`, `a5ac783`, `6aae292`, `a58e43c`, `b19ae84`, `4fd1d4f`).
- Direct file reads of every modified module (anchors below confirmed against the working tree).
- Live verification runs: `tsc` + `next build` + Playwright runs (**15/15**).
- Supabase MCP inspection (migration 012 live as version `20261013161649` with 6 seed orgs, richer trigger than the first repo draft — reconciled in `a58e43c`).
- Honesty greps (`headline_inflation_pct|210000000` = 0 source hits).

**Decision register (from `57-CONTEXT.md` lines 11–20):**

| ID | Decision |
|---|---|
| D1 | Guest writes stay 403 (Option A). Fix UX, not permissions. |
| D2 | NO copy-paste password card in UI/repo. Pilot accounts = invite-only via Supabase Dashboard / `auth.admin.inviteUserByEmail` + Magic Link login. |
| D3 | `company_id` captured at signup. New `organizations` + `profiles(company_id FK)` tables, `handle_new_user()` trigger, JWT `app_metadata.company_id`, fleet filtered by it. |
| D4 | Pilot routing = live Mapbox Directions first; curated polyline ONLY as labeled last-known-good/offline cache, never presented as live. |
| D5 | News ingestion moves to background (`BackgroundTasks` + `_ingestion_in_progress` guard); endpoint returns Supabase cache immediately. |
| D6 | REJECT audit Solusi 2 mock-economy injection (+17.1% / Rp 210jt canned payload). Offline demo shows honest empty state or real engine output only. |
| D7 | Guest banner gets dismiss X (sessionStorage). Stage-0 button calls `onStart({origin,destination})`, not `onAdvance()` on null `crisisId`. Simulation tab gets macro-vs-tactical explainer card. |
| D8 | Perf items (GPU ReadPixels stall, Mapbox style abort) are P3 stretch, not pilot-blockers. |

---

## STEP 0 — Tenant Contract (`93bead5`, later reconciled `a58e43c`)

### Problem

Tenancy was free-text `org_name` with no read-path filter — unenforceable without a stable ID (D3). Both tracks (frontend Track A, backend/auth Track B) needed the wire format frozen before either could build on it.

### Implementation

**New `infra/supabase/migrations/012_organizations_profiles_tenancy.sql`** — the tenant contract:

- `organizations(id, name)` + `profiles(id FK auth.users, company_id FK, role, name, email)`.
- `handle_new_user()` trigger (safe GUEST/NULL defaults, never throws).
- RLS (own-profile read/update, `service_role` full, org roster public read).
- 6 pilot seed orgs (`pos_logistik`, `bapanas`, `kemenhub`, `pelindo_belawan`, `jne_sumut`, `demo_sandbox`).

**Files modified:**

| File | Lines | Change |
|---|---|---|
| `infra/supabase/migrations/012_organizations_profiles_tenancy.sql` | full file (new) | `organizations` + `profiles` tables, `handle_new_user()` trigger, RLS policies, 6 pilot seed orgs |
| `frontend/lib/types.ts` | L420–421 | `FleetVehicle.company_id?` |
| `frontend/lib/types.ts` | L529–531 | `UserProfile.company_id?` |
| `frontend/lib/api.ts` | `fleet.vehicles(modality?, company_id?)` | builds `?company_id=` (optional, backward-compatible; backend ignores it until WP-B3) |

**Critical nuance:** 012 was ALREADY live on Supabase (richer: `name`/`email` columns, 6 real org names) before the repo draft; the first repo draft would have downgraded the trigger, so `a58e43c` rewrote the file verbatim from live (trigger body copied exactly, `ADD COLUMN IF NOT EXISTS` convergence guards, exact live policy names so re-runs are no-ops). The `api.ts` signature inclusion in STEP 0 was the one deliberate deviation — the contract needs the wire format frozen for both tracks; it enforces nothing until WP-B3.

### Verification

- `tsc` clean.
- Callers in `useFleetVehicles.ts` single-arg compatible (optional param is backward-compatible).

---

## WP-A1 — Guest Banner + Simulator Explainer (`d2253f3`, hydration follow-up `b19ae84`)

### Problem

The guest evaluation banner had no dismiss affordance (D7), and the Simulation tab gave operators no macro-vs-tactical framing — a B2G pilot audience reads the simulator as a toy without the explainer.

### Implementation

**`frontend/components/dashboard/GuestEvaluationBanner.tsx`:**

| Lines | Change |
|---|---|
| L7 | `DISMISS_KEY = 'prehub_guest_banner_dismissed'` |
| L19–26 | `sessionStorage` read moved into `useEffect` (follow-up fix for SSR hydration mismatch — `b19ae84`) |
| L64–65 | X button `aria-label 'Tutup banner evaluasi tamu'` |

Per-session dismiss: dismissed this session stays hidden; next session returns.

**`frontend/components/dashboard/SimulationSection.tsx`:**

| Lines | Change |
|---|---|
| L15 | `FlaskConical` import |
| L112–120 | explainer card `'Simulator Makro (B2G) — Kalkulasi Lokal'`; `handleDeploy` stays local-calc |

### Verification

- Playwright banner test (reload-hidden, fresh-context-visible) passes.
- Explainer visibility test passes.

---

## WP-A2 — Stage-0 Fix + Honest Economy (`a5ac783`)

### Problem

Fast cold click on the demo's stage-0 button stalled silently at stage 0: `start()` sets `isRunning` synchronously but `crisisId` arrives after the async `demo/start`; the button called `onAdvance()`, which hit `if (!crisisId) return` and did nothing.

### Implementation

**`frontend/components/demo/GuidedDemoPanel.tsx`:**

```diff
- onAdvance()
+ stage === 0 ? onStart({ origin: selectedOrigin, destination: selectedDestination }) : onAdvance()
```

| Lines | Change |
|---|---|
| L432–436 | `stage === 0 ? onStart({origin: selectedOrigin, destination: selectedDestination}) : onAdvance()` |

**`frontend/components/dashboard/DashboardClient.tsx`** L1909 wires `onStart` through to `demoState.start` with origin/destination passthrough.

**`frontend/hooks/useDemoState.ts`:**

| Lines | Change |
|---|---|
| L167–169 | D6 guard comment — offline fallback MUST NOT gain canned `inflation_forecast`/`ltm_episodes` |
| L80–90 | economy gating at `stage >= 3` unchanged |
| `EconomicTab` | empty states intact (`'Proyeksi inflasi belum diterbitkan…'`) |

### Verification

- Playwright Stage-0 test (hang `demo/start`, Run Demo, click stage-0 → second `demo/start` request observed, zero `advance` calls).
- Honesty grep `headline_inflation_pct|210000000` = **0 hits** in `backend/app` `frontend/lib` `frontend/hooks` `frontend/components` `data` (only the `SYSTEM_AUDIT` doc + `57-PLAN` text mention the rejected figures).

---

## WP-A3 — 403 Sandbox + Live-First Routing (`6aae292`)

### Problem

Guest writes correctly return 403 (D1 — permissions stay), but the UX dead-ended: no local save, no explanation. Separately, interpolated geometry could be presented as live routing (D4 honesty violation).

### Implementation

**`frontend/components/dashboard/DashboardClient.tsx` (D1 sandbox):**

| Lines | Change |
|---|---|
| L590–625 | `catch` detects `/403/`, saves `{incident_id, route_id, agency, action, saved_at}` to `localStorage` `prehub_sandbox_approvals[]` (L597) |
| L597 | local-only `approvalsCount + 1` |
| L613 | toast `'Mode Sandbox: tersimpan lokal — login Dispatcher untuk commit ke koridor.'` (`type: info` — `Toast.tsx` supports `success\|error\|info`) |

Map styling + operational impact still apply below (single source of truth preserved).

**`frontend/lib/aiDynamicRouter.ts` (D4 provenance):**

| Lines | Change |
|---|---|
| L253 | `MapboxRouteResult.source: 'live' \| 'offline-interpolated'` |
| L364 / L422 | live pushes |
| L432–439 | offline fallback with summary `'SIMULASI/OFFLINE — garis lurus, bukan geometri jalan live'` |
| L640–661 | STEP-1 recommendations label offline geometry with `[SIMULASI]` `route_name`, description prefix, `safety_tag` suffix |

**`frontend/lib/mapboxRoutingService.ts`:**

| Lines | Change |
|---|---|
| L352–355 | `DirectionsFetchResult { coords, source }` |
| L367 / L383 / L389 | `fetchMapboxDirections` returns provenance |
| L457–458 | `calculateRoadNetworkDetourRoutes` `offlineLabel` prefixes both descriptions when both legs interpolate |

**`frontend/hooks/useDemoState.ts`:**

| Lines | Change |
|---|---|
| L194–195 | offline bypass route labeled `[SIMULASI]` |
| L214 | `safety_tag 'BYPASS PESISIR • SIMULASI/OFFLINE'` |

**Known edge (record, don't fix here):** `mapboxRoutingService` labels only when BOTH legs are offline; that function currently has no live callers.

### Verification

- `tsc` + `next build` clean.
- Playwright deploy-403 test (intercepted 403 → toast + 1 `localStorage` entry).
- 4 routing-honesty unit tests (offline provenance/label, live provenance/unlabeled, badge on detour recs, `fetchMapboxDirections` offline).

---

## Verification Infrastructure (`4fd1d4f`)

### Implementation

| File | Change |
|---|---|
| `frontend/e2e/phase57-pilot-hardening.spec.ts` | new, 8 tests (force-added — `frontend/e2e/` is gitignored, `toll-bypass-routing.spec.ts` remains local-only; team must decide e2e-in-repo policy) |
| `playwright.config.ts` | `webServer` command fixed: `npm run start` → `node .next/standalone/server.js` (`next.config.mjs` sets `output: 'standalone'`, under which `next start` refuses to boot — the Playwright gate was unrunnable repo-wide) |

Full run **15/15** with toll-bypass (no regressions).

**Env quirk recorded:** fresh builds don't copy `.next/static` + `public` into `.next/standalone/` here (copied manually for the test server); if pilot deploys use the standalone bundle, verify asset serving there too.

---

## E2E Audit Carry-Overs (for Track B / joint verification — NOT resolved here)

**P0:**
- Backend `supabase_auth.py` verifies HS256 against the dev-fallback secret while frontend `login()` sends the real Supabase-issued `access_token` → every Magic-Link/invite login will 401 at `api.auth.me()` until WP-B2 fixes verification (JWKS or server `get_user` relay).
- `company_id` chain has 4 unwritten links (metadata → `app_metadata` → `UserSession` field (missing) → fleet filter (missing) → `user.company_id` population); `signUp` still defaults DISPATCHER with no company field — invite BEFORE closing signup.

**P1:**
- Sandbox approvals write-only (no list/badge/commit-after-login; count not rehydrated; `approvalsCount` initial hardcoded 14 at `DashboardClient.tsx:487`); failed (non-403) deploy still styles map as approved.

**P2:**
- Deploy fallback payload hardcodes `distance_km: 42` / eta 38 when no route; 403 detection is `/403/` string-match (works with the current `` `API … → 403` `` format, brittle).

**DB hygiene (pre-existing):** repo migrations dir missing live versions `001_seed_kg`, `002_fix_indicent` columns (fresh envs can't reproduce live DB); `ltm_episodes` RLS-on-zero-policies = silent deny-all (confirm `service_role`-only reads, don't just add policy); `spatial_ref_sys` RLS-disabled is a PostGIS system table — leave alone; `route_approvals` duplicate permissive policies (perf noise, intent-consistent). Advisors also warn `handle_new_user()` is SECURITY DEFINER RPC-callable by `anon`/`authenticated` + mutable `search_path` + no role allowlist on live `profiles` → proposed 013 hardening (role CHECK + REVOKE EXECUTE + SET `search_path`), NOT applied (friend's auth territory).

**Remaining plan gates:** pytest 183 green, Track B Playwright flows (dispatcher tenant filter, regulator macro, cold news <1s warming), staging 012 rollback test, stretch P3.

---

## Commit Ledger (Track A)

| Hash | Message | Files |
|---|---|---|
| `93bead5` | STEP 0 tenant contract | `infra/supabase/migrations/012_organizations_profiles_tenancy.sql` (new), `frontend/lib/types.ts`, `frontend/lib/api.ts` |
| `d2253f3` | WP-A1 guest banner + simulator explainer | `GuestEvaluationBanner.tsx`, `SimulationSection.tsx` |
| `a5ac783` | WP-A2 Stage-0 fix + honest economy | `GuidedDemoPanel.tsx`, `DashboardClient.tsx`, `useDemoState.ts` |
| `6aae292` | WP-A3 403 sandbox + live-first routing | `DashboardClient.tsx`, `aiDynamicRouter.ts`, `mapboxRoutingService.ts`, `useDemoState.ts` |
| `a58e43c` | STEP 0 reconciliation from live | `012_organizations_profiles_tenancy.sql` (verbatim-from-live rewrite) |
| `b19ae84` | WP-A1 hydration follow-up | `GuestEvaluationBanner.tsx` (`sessionStorage` → `useEffect`) |
| `4fd1d4f` | Verification infrastructure | `frontend/e2e/phase57-pilot-hardening.spec.ts` (new, force-added), `playwright.config.ts` |

## Guardrails Honored

- No mock resurrection (D6: canned economy rejected; honesty grep 0 source hits).
- RBAC intact (D1: guest 403 stays; UX explains + saves locally, permissions untouched).
- No secrets (D2: no password cards in UI/repo; invite-only + Magic Link).
- CPU solver untouched (deterministic `NetworkX + OR-Tools / 2-Opt` — no GPU claims reintroduced).
- Lucide UI (icon-only changes use `FlaskConical`/`ChevronDown`-family lucide icons; no emoji icons).

## Track B File-Ownership Reminder

- Friend must rebase onto `4fd1d4f` before starting Track B.
- `types.ts` / `api.ts` frozen — STEP 0 wins conflicts.
- `012_organizations_profiles_tenancy.sql` is verbatim-from-live — do not hand-edit; converge with `ADD COLUMN IF NOT EXISTS` guards only.
- Proposed 013 hardening (role CHECK + REVOKE EXECUTE + SET `search_path`) is friend's auth territory — do not apply from Track A.
