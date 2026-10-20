<!-- generated-by: gsd-doc-writer -->
# Phase 81: Dispatcher Tenant Fleet Scope — Learnings

**Scope:** durable lessons from the dispatcher tenant-boundary fix. Every entry is grounded in the working tree, `git show HEAD:` of the pre-fix files, or a command executed in this window. Items that were not verified are labelled **unverified** or listed under §6 rather than presented as conclusions.

---

## 1. Learnings

### 1.1 A query parameter must never widen a verified claim

- **Evidence (pre-fix):** `git show HEAD:backend/app/routers/vehicles_router.py` computed `effective_company = company_id`, then fell back to `user.company_id` only when the query was empty. A `pos_logistik` dispatcher could request `?company_id=jne_sumut` and receive JNE's trucks.
- **Consequence:** the tenant boundary was caller-controlled. The same endpoint served two different authorization models depending on which parameter was present, and the client could not tell the difference.
- **Lesson:** for a role whose access is defined by a token claim, the claim is the *scope*, not a default. Optional query filters are legitimate for macro roles (regulator/guest introspection) but must be ignored for the scoped role. Implement the branch on role **before** reading the query, not after.
- **Residual:** `fleet_ingest_router.py` `/fleet/custom` follows the same rule, but any future endpoint that accepts `company_id` needs the same review. A shared dependency (`resolve_tenant_scope(user, query)`) would make the pattern harder to miss.

### 1.2 `FALLBACK_FLEET` turned "no data" into fabricated data

- **Evidence (pre-fix):** `useFleetVehicles` ended with `baseVehicles = rawVehicles.length > 0 ? rawVehicles : FALLBACK_FLEET` (`useFleetVehicles.ts`, pre-fix ~460). The array contains 26 hardcoded units, 5 of them `ROUTE_ESTIMATED`.
- **Consequence:** a dispatcher with no onboarded assets, a tenant whose request returned an empty page, and a tenant whose request failed all saw the same mock trucks. The mocks carried plausible Indonesian names and coordinates, so nothing on screen said "this is not yours".
- **Lesson:** empty is a valid answer and must be rendered as such. A fallback is only acceptable for a role whose contract is *macro demonstration* (regulator/guest), and even then it should be labelled. The fix gates the fallback by role (`isDispatcher ? tenantVehicles : …`), so the empty and failure states stay visible.
- **Why it compounded:** the 500 in §1.3 produced an empty `rawVehicles`, which triggered exactly this fallback. Two independent defects chained into "the dispatcher sees someone else's fleet".

### 1.3 One nullable field can 500 an entire collection response

- **Evidence:** `FleetVehicleTelemetry.path` is required and typed `List[List[float]]` (`backend/app/schemas/fleet.py:59`). `_row_to_custom_vehicle_dict` returns `"path": path_val`, which is `None` when `path_json` is empty (`local_storage.py:795`). `_enrich_custom_vehicle` only wrote `item["path"]` on a reroute, on densification, or when a live ping existed — never a fallback for a null path — so an un-routed row reached the response model with `path: null`. A single such row failed validation for the whole `FleetTelemetryListResponse`.
- **Consequence:** `/fleet/vehicles` returned 500, the client fell back to mocks, and the failure looked like a telemetry outage rather than one incomplete onboarding record.
- **Direct check:** `FleetVehicleTelemetry(vehicle_id='X', name='X', modality='truck', path=None, speed_kmh=1, status='moving')` raises `pydantic.ValidationError` on `path` in the current schema, confirming the null value is rejected rather than coerced.
- **Lesson:** in FastAPI, `response_model` validates the collection atomically — one bad element rejects the payload, it does not skip that element. Any time a DB column is optional but the API contract is required, the mapper must normalize (`[]`, `0`, `""`). The regression should insert an un-routed vehicle and assert `200` plus `path: []`, not just test the happy path.
- **Residual:** the guard covers `path` only. `vehicle_id`, `speed_kmh`, and coordinate-range validators can still fail the whole response.

### 1.4 A time-based cache must also be keyed by authorization context

- **Evidence (pre-fix):** `vehicleCacheRef` kept entries for 90 s and was merged purely on timestamp. `useFleetVehicles`' main effect depended on `[modality, effectiveCompanyId]`, but nothing cleared the cache when `isDispatcher` changed. A `REGULATOR → DISPATCHER` switch could therefore merge macro vessels into the new tenant view until TTL expiry.
- **Consequence:** the first render after a role switch could show another role's assets — a privacy/authorization leak that no server-side fix would catch, because the data was already in memory.
- **Lesson:** cache invalidation keys must include every dimension that changes the authorized result set: tenant claim, role, and (where applicable) user id. A TTL answers "how stale may this be", not "who may still see it".
- **Residual:** the clear does not cancel an in-flight `fetchFleet`; see §2 #1.

### 1.5 If a field determines access, it must be persisted with the asset

- **Evidence (pre-fix):** `custom_fleet_vehicles` had no `company_id`, `company_name`, `tracking_mode`, `departure_time`, or coordinate columns. `company_id`/`tracking_mode` lived in `TelemetryService` memory and `_custom_vehicles_extra`; `local_storage.save_custom_vehicle` wrote only `organization_id`.
- **Consequence:** a Render cold start would drop the in-memory tenant tag; the row still existed, but the owning dispatcher could no longer resolve it as theirs, so the asset could reappear as tenant-less or disappear from the tenant view.
- **Lesson:** tenancy is part of the asset's identity, not session decoration. Persist it in the same row, default it from the verified claim at write time, and backfill legacy rows on read. Additive `ALTER TABLE` migrations are enough for SQLite and keep old databases usable.
- **Residual:** `truck_assets` rows created outside a dispatcher session default to `org-prehub-pilot`; they are matched heuristically but not migrated.

### 1.6 Composing a tenancy filter with a modality allowlist using `OR` silently disables tenancy

- **Evidence (pre-fix):** `get_unified_fleet` filtered with `v.get("modality") in ("maritime", "air") or v.get("company_id") == company_id or v.get("organization_id") == company_id`. Because every macro vessel/flight is `maritime`/`air`, the first branch admitted them regardless of tenant.
- **Consequence:** even after the router was scoped correctly, a dispatcher still received the macro maritime and air fleet. The endpoint looked tenant-aware while leaking the largest data class.
- **Lesson:** never combine "which data class is this" with "who may see it" in one boolean. Apply authorization first (`matches_tenant`), then presentation filters (modality/status). `tenant_only` now does exactly that; the macro branch survives only for `tenant_only=False`.
- **Residual:** other call sites of `get_unified_fleet` that pass `company_id` without `tenant_only` retain macro semantics by design. They need an explicit decision, not a copy-paste.

### 1.7 A retry is still an authenticated request

- **Evidence (pre-fix):** the direct retry in `fetchFleetWithFallback` fetched `https://peta-nadi.onrender.com/api/v1/fleet/vehicles${qs}` with only `Content-Type`. It bypassed `getBaseUrl()` and dropped `Authorization`.
- **Consequence:** if the primary request failed, the retry could hit a different host than the configured one and be treated as an unauthenticated/guest request. In the best case it returned macro data; in the worst case the browser reported CORS/404 and the original error was masked.
- **Lesson:** a fallback transport must carry the same identity and resolve the host through the same function as the primary. If the retry needs different headers, that is a sign it is not a retry but a different request.
- **Residual:** the retry still has a 20 s timeout and no abort propagation from the primary; see §2.

### 1.8 "Estimated" is a claim about reality, not a styling option

- **Evidence:** `FleetVehicleLayer` unconditionally collected every `ROUTE_ESTIMATED` trajectory into `PathLayer` `deck-fleet-estimated-routes`, drawn amber `[245, 158, 11, 150]` at 2.5 px, plus an amber pulse ring. The label previously read `ESTIMASI`.
- **Consequence:** dead-reckoned corridor lines had the same visual authority as live GPS tracks. On a dispatcher screen they implied trucks that were not there, and there was no ownership check.
- **Lesson:** every map layer is an assertion. A position derived from a schedule is inventory/planning data, not telemetry; render it only on explicit inspection and label it `PROYEKSI`. Keep the roster (inventory) and the map (live claims) as separate surfaces.
- **Residual:** a selected `PROYEKSI` unit still draws an amber path, by design. The badge and the explicit selection are the only things distinguishing it from live telemetry.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **In-flight fetch can outlive a role switch.** `fetchFleet` has no `isMounted`/sequence guard; only the interval is cleared. A request started under the old token can resolve after the cache clear and write into `rawVehicles`. Server-side scoping limits it to the previous tenant, but a brief cross-tenant render is possible on a slow link. | `useFleetVehicles.ts:395–413` (no guard), `456–460` (cleanup only clears the interval) |
| 2 | **Whole-response validation still has fleet-wide blast radius.** The `path: []` guard fixes the known trigger; any other required field can still 500 every unit. | `backend/app/schemas/fleet.py:54–127`; `telemetry_service.py:1673–1677` covers `path` only |
| 3 | **`matches_tenant` org-name fallback is a heuristic.** Legacy rows with no `company_id` are matched by `organization_id`/`company_name` equality; two tenants sharing a display name could collide. | `telemetry_service.py:1067–1092` |
| 4 | **`truck_assets` default tenancy is a placeholder.** `company_id TEXT DEFAULT 'org-prehub-pilot'` for rows created outside a dispatcher session; they appear in the fleet only via `matches_tenant`, not via a real claim. | `local_storage.py:225`; `telemetry_service.py` synthesized-asset block |
| 5 | **Projected units without geometry are listed but unframeable.** `path: []` passes validation, but the map cannot fit or draw the unit; only the roster row exists. | `telemetry_service.py:1673–1677`; `FleetVehicleLayer.tsx:441–459` |
| 6 | **Regulators still receive `FALLBACK_FLEET` on an empty/500 response.** Deliberate macro resilience, but it means a regulator cannot distinguish "backend down" from "macro fleet empty" from the map alone. | `useFleetVehicles.ts:503–507` |
| 7 | **The role matrix script tests helpers, not React.** It mirrors the hook's branching by hand (`viewForRole`), so a future divergence between the hook and the script would not be caught. | `frontend/scripts/test_fleet_scope.ts` `viewForRole` |
| 8 | **No production verification.** The live pair still serves pre-fix code; all results are local. | No deploy/commit performed; `git status` shows the files as modified/untracked |

---

## 3. Constraints (hard boundaries this phase worked within)

| Constraint | Evidence | How it shaped the implementation |
|---|---|---|
| **Dispatcher never sees macro or fallback** | `vehicles_router.py:41–62`; `useFleetVehicles.ts:488–507` | Router ignores `?company_id=` for dispatchers, returns honest empty without a claim; hook never substitutes `FALLBACK_FLEET` for a dispatcher |
| **Regulator keeps the macro view** | `get_unified_fleet(tenant_only=False)` default; `test_fleet_regulator_sees_corridor_wide` asserts ≥120 units | `tenant_only` is opt-in only for dispatchers; regulator/guest paths keep the old macro filter |
| **`PROYEKSI` only on inspect, always badged** | `FleetVehicleLayer.tsx:49, 441–459, 724–731, 883`; `TenantFleetRoster.tsx:164–179` | Unselected projected units are filtered out; selection injects the unit for inspection; roster and layer badge say `PROYEKSI` |
| **JWT claim is authoritative** | `supabase_auth.py:292–326`; `vehicles_router.py:43–49` | `company_id` is resolved from token metadata / profile, never trusted from the fleet query for a dispatcher |
| **No commit or deployment** | Phase instruction; `git status --porcelain` | All changes remain in the working tree; no Vercel/Render action, no live probes |
| **Frontend deploy has no `vercel.json`** | No `vercel.json` in the repo; Next standalone output | No routing/header config was added; changes stay in application code |
| **CORS allowlist is explicit** | `render.yaml` `CORS_ORIGINS` | No new origin; local `:3000` → `:8000` remains the dev path |
| **Windows dev shell, LF/CRLF mixed** | `git diff` warnings on `frontend/lib/types.ts` | Verification used `tsc`, `pytest`, and a Node strip-types script — no shell scripts were touched |
| **Additive data contract** | `local_storage.py` `ALTER TABLE` migrations; `FleetVehicle` optional fields | No destructive migration; existing SQLite databases keep working and legacy rows are backfilled on read |

---

## 4. Environment context (for the next window)

| Component | Value |
|---|---|
| Frontend (prod) | `https://pre-hub.vercel.app` — Vercel, Next.js `output: 'standalone'`, no `vercel.json` |
| Frontend (local) | `http://localhost:3000` |
| Backend (prod) | `https://peta-nadi.onrender.com` — Render, free-tier cold start; 30–77 s observed in earlier phases |
| Backend (local) | `http://localhost:8000` |
| Proxy | `frontend/app/api/proxy/[...path]/route.ts`; canonical host from `frontend/lib/baseUrl.ts` (`PRODUCTION_API_BASE_URL` line 11) |
| CORS | `https://pre-hub.vercel.app`, `https://peta-nadi.onrender.com`, `http://localhost:3000` |
| Role defaults | `dispatcher → pos_logistik`, `regulator → bapanas`, `guest → demo_sandbox` (`supabase_auth.py:72–76`) |
| Claim resolution | `app_metadata.company_id` → `user_metadata.company_id` → `public.profiles.company_id` → role default (`supabase_auth.py:292–326`) |
| Fleet baseline | Backend `MASTER_FLEET_DEFINITIONS` (commented "Master 45-unit…", `telemetry_service.py:238`); client `FALLBACK_FLEET` = 26 units, 5 `ROUTE_ESTIMATED` (`useFleetVehicles.ts:11`) |
| Auth storage | `prehub_auth_token` in `localStorage` + mirrored cookie (`authContext.tsx:49–62`) |

---

## 5. Actions performed (evidence)

- `cd frontend && npx tsc --noEmit -p tsconfig.json` → **exit 0**.
- `python -m pytest backend/tests/test_fleet_ingest.py -q` → **12 passed, 5 warnings in 16.33s**.
- `python -m pytest backend/tests/test_vehicles_telemetry.py -q` → **9 passed, 6 warnings in 19.49s**.
- `cd frontend && node --no-warnings --experimental-strip-types scripts/test_fleet_scope.ts` → **17/17 assertions passed**.
- `git status --porcelain` → the tenant files are modified/untracked alongside Phase 44/ERP and Phase 80 work; **nothing was committed**.

Warnings (pre-existing): Starlette `httpx` deprecation, Pydantic v1-style `Config`, un-awaited `connect_tcp` coroutines, Supabase client `timeout`/`verify` deprecations.

**Not verified in this window:** Playwright e2e, live calls against `pre-hub.vercel.app` / `peta-nadi.onrender.com`, Render redeploy, cold-start persistence, and role-switch behaviour in a real browser. Claims based on those remain **unverified**.

---

## 6. Excluded / not claimed

These points were considered but are **not** asserted, because the evidence does not support them:

- **"All 45 units are mock."** The 45-unit `MASTER_FLEET_DEFINITIONS` is a baseline dataset used for macro/regulator views; it is not automatically invalid. The defect was showing it to a dispatcher, not its existence.
- **"The missing path key was the only cause of empty dispatcher fleets."** It is a proven cause of a 500 in the tested path, but the query-widening, modality-`OR`, and cache paths can each produce a wrong or empty view independently.
- **"The role-switch race is fixed."** Only the cache is cleared; in-flight requests are not cancelled (concern #1).
- **"Production is fixed."** Nothing was deployed or probed; the live pair is pre-fix until a deploy happens.
- **"`org_name` matching is secure for all legacy data."** It is a compatibility fallback with the documented collision risk (concern #3).
- **"The 17 script assertions prove the React hook."** They prove the shared helpers and a hand-mirrored role branch, not component rendering (concern #7).
