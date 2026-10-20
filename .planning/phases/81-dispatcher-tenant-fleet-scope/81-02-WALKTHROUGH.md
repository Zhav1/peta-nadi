<!-- generated-by: gsd-doc-writer -->
# Phase 81: Dispatcher Tenant Fleet Scope — Walkthrough

**Purpose:** implementation record for the dispatcher tenant boundary (issue #2): claim-only backend scope, no macro/fallback fill, honest empty states, `LIVE_GPS`-only map, and inspection-only `PROYEKSI` corridors. Every claim below comes from the working tree or a command executed in this window; line numbers are current working-tree lines.

**Commit shape:** **none** — all changes are uncommitted, per the phase constraint. The working tree also contains unrelated Phase 44/ERP and Phase 80 edits; the files below are the ones this phase actually changed, and several of them carry additional unrelated hunks.

---

## 1. Files changed (14)

| # | File | Status | What changed |
|---|---|---|---|
| 1 | `frontend/lib/fleetScope.ts` | **new** | Pure scope helpers: `isLiveTracked` (11), `isProjected` (16), `isTenantAsset` (25), `selectTenantVehicles` (35), `partitionByTracking` (49), `scopeDispatcherFleet` (63) |
| 2 | `frontend/components/fleet/TenantFleetRoster.tsx` | **new** | Dispatcher-only roster: live-first sort (57–64), LIVE/PROYEKSI counts (85–92), no-claim notice (110–118), honest empty + onboarding (120–136), per-row badges (164–179) |
| 3 | `frontend/hooks/useFleetVehicles.ts` | modified | Claim-only role split (352–358); cache clear on role/tenant change (372–374); `selectTenantVehicles` (488–493); dispatcher map slice = `liveTenantVehicles` (521–525); no `FALLBACK_FLEET` for dispatchers (503–507); retry uses `getBaseUrl()` + bearer (313–345) |
| 4 | `frontend/components/map/FleetVehicleLayer.tsx` | modified | `hideEstimatedRoutes` prop (49, 256); unselected projected units filtered out (441–459); pulse ring and trajectory gated (711, 724–731); `ESTIMASI` → `PROYEKSI` (883); dependency array (1047) |
| 5 | `frontend/components/map/CrisisMap.tsx` | modified | Passes `hideEstimatedRoutes` through the map component to `FleetVehicleLayer` (99, 262, 2015) |
| 6 | `frontend/components/dashboard/DashboardClient.tsx` | modified | Consumes tenant fields (346–352); `isDispatcherWorkspace` + selected-projection injection (455–469); dispatcher-only roster mount (2768–2779); `hideEstimatedRoutes` (2639); tenant badge replaces simulation toggle |
| 7 | `frontend/lib/api.ts` | modified | `fleet.vehicles(modality, company_id)` appends the tenant query (263–275); re-exports the canonical `getBaseUrl` (1–7) |
| 8 | `frontend/lib/types.ts` | modified | `FleetVehicle` gains `is_tenant_asset` alongside the existing `company_id` / `tracking_mode` (559–565); user profile exposes `company_id` (687); additional ERP/travel types are unrelated to this phase |
| 9 | `backend/app/routers/vehicles_router.py` | modified | Dispatcher scope ignores `?company_id=` (41–49); no-claim dispatcher returns honest empty (51–62); stamps `is_tenant_asset` from `matches_tenant` (80–84) |
| 10 | `backend/app/routers/fleet_ingest_router.py` | modified | Register writes claim + tracking mode + coords (121–130); `/fleet/custom` scopes dispatchers to the claim, returns `[]` without one (287–300) |
| 11 | `backend/app/services/telemetry_service.py` | modified | `matches_tenant` (1067); `tenant_only` filter (1800, 2025–2031); null-path guard (1673–1677); master truck assets synthesized as projected tenant units (1800+) |
| 12 | `backend/app/db/local_storage.py` | modified | Persists `company_id`, `company_name`, `tracking_mode`, `departure_time`, origin/dest coords (115–156, 605–610); legacy backfill (805); tenant-filtered listing (818–839) |
| 13 | `backend/tests/test_fleet_ingest.py` | modified | 3 new tenancy/persistence tests (273, 320, 344) |
| 14 | `frontend/scripts/test_fleet_scope.ts` | **new** | 17-assertion role matrix runnable with Node strip-types |

Rows 1–12 are runtime code; 13–14 are verification assets. `backend/tests/test_vehicles_telemetry.py` is **unchanged** — its existing dispatcher-JWT and regulator-macro tests now run against the corrected router. Several runtime files also carry unrelated Phase 44/80 hunks in the same uncommitted tree, so per-file diffs are not exclusively Phase 81.

---

## 2. What each fix actually does

### 2.1 Backend: the claim is the scope, not a default

Pre-fix, `vehicles_router.py` treated `company_id` as the primary filter and the JWT claim as a fallback. That made the tenant boundary caller-controlled: `?company_id=jne_sumut` on a `pos_logistik` session returned JNE's trucks. The router now branches on role first:

- `DISPATCHER` → `effective_company = user.company_id`, `tenant_only = True`; the query is ignored.
- No claim → `200` with `vehicles: []` and zeroed counts. A warning is logged; nothing is substituted.
- `REGULATOR` / `GUEST` → `effective_company = company_id`, `tenant_only = False`; the macro view and optional introspection filter are unchanged.

The service-side filter had a second hole: even with the right claim, `get_unified_fleet` kept every `maritime` and `air` unit (`v.get("modality") in ("maritime", "air") or …`). `tenant_only=True` now runs every unit through `matches_tenant`, so a dispatcher's fleet contains only tenant-owned assets. Regulators retain the old macro behavior because `tenant_only` stays false for them.

`matches_tenant` prefers the stored `company_id` / `organization_id` claim and only falls back to `org_name` for legacy rows where `company_id` is missing or equal to `organization_id`. A unit with an explicit, different claim cannot be captured by sharing a display name.

### 2.2 Frontend: empty stays empty for dispatchers

`useFleetVehicles` previously ended with:

```ts
const baseVehicles = rawVehicles.length > 0 ? rawVehicles : FALLBACK_FLEET;
```

That single expression turned three different states — "tenant has no assets", "backend returned an empty page", and "request failed" — into 26 mock units. The hook now branches on role:

```ts
const tenantVehicles = isDispatcher
  ? selectTenantVehicles(rawVehicles, effectiveCompanyId)
  : rawVehicles;
const baseVehicles = isDispatcher
  ? tenantVehicles
  : rawVehicles.length > 0
    ? rawVehicles
    : FALLBACK_FLEET;
```

A dispatcher's map input is `liveTenantVehicles` (only `tracking_mode === 'LIVE_GPS'`). `estimatedTenantVehicles` is returned separately so the roster can list projected assets without the map drawing them.

The 90-second cache is a second leak path: it was keyed only by elapsed time, so after a `REGULATOR → DISPATCHER` switch it still held macro assets. A `useEffect` on `[effectiveCompanyId, isDispatcher]` clears it when either changes, so a later `mergeWithCache` cannot resurrect the previous scope.

### 2.3 Map: an estimated route is not telemetry

`FleetVehicleLayer` always built `estimatedRouteData` for every `ROUTE_ESTIMATED` unit and rendered it through `deck-fleet-estimated-routes` with amber `[245, 158, 11, 150]` at 2.5 px, plus an amber pulse ring. On a dispatcher screen those lines were indistinguishable from live corridor tracks.

With `hideEstimatedRoutes` on:

1. The visibility filter drops any unselected projected unit before layer construction.
2. The pulse ring is skipped (`v.tracking_mode === 'ROUTE_ESTIMATED' && !hideEstimatedRoutes`).
3. The trajectory is collected only when `!hideEstimatedRoutes || isSelected`.
4. The label badge reads `PROYEKSI` instead of `ESTIMASI`.

Selection is deliberate: `DashboardClient` injects the selected projected unit into `activeFleet` (460–466), and the layer keeps it because `selectedVehicleIdRef.current === v.vehicle_id`. Deselecting removes it again. This is the "inspect only" contract — the roster is the inventory, the map is the live surface.

### 2.4 Roster: honest inventory and honest absence

`TenantFleetRoster` has four states:

| State | Condition | UI |
|---|---|---|
| Loading | `isLoading && sorted.length === 0` | `Memuat armada tenant…` |
| No claim | `!isLoading && !isTenantScoped` | Amber notice: session has no `company_id` claim |
| Empty tenant | `isTenantScoped && sorted.length === 0` | `Belum ada armada terdaftar untuk tenant <id>.` + **Onboard Armada** |
| Populated | `sorted.length > 0` | Live-first rows with `PROYEKSI` / `LIVE GPS` badges + **Tambah Armada** |

The dispatcher toolbar no longer renders the AIS/estimated simulation toggle. It renders `Tenant Live GPS (n)` and, when projected assets exist, an amber `n PROYEKSI` count so the inventory total is still legible.

### 2.5 Persistence: tenant tag survives a cold start

`custom_fleet_vehicles` previously had no `company_id` / `tracking_mode` columns; the values lived in `TelemetryService` memory and `_custom_vehicles_extra`. A Render restart would drop the tenant tag, leaving the row tenant-less and the asset unresolvable from the owner's view.

`local_storage.py` now stores `company_id`, `company_name`, `tracking_mode`, `departure_time`, `origin_coords_json`, and `dest_coords_json`, with `ALTER TABLE` migrations for existing databases. `save_custom_vehicle` defaults `company_id` to `organization_id` (never tenant-less) and `tracking_mode` to `ROUTE_ESTIMATED`. `_row_to_custom_vehicle_dict` backfills `company_id` for legacy rows. `/fleet/register` writes the claim and org name from the verified session.

Master truck assets (`truck_assets`) are joined into the unified fleet as synthesized `ROUTE_ESTIMATED` units, so a truck onboarded through the asset-master wizard exists in the owner's roster even before its first GPS fix or travel.

### 2.6 The 500 on a missing/null path

`FleetVehicleTelemetry.path` is `List[List[float]]` with no default (`backend/app/schemas/fleet.py:59`). A custom row without a route produced `path: null`, and FastAPI's response validation failed the **whole** `/fleet/vehicles` payload — not just that row. The client saw a 500 and fell back to mocks, which made a one-row data defect look like a fleet-wide telemetry outage.

`_enrich_custom_vehicle` now writes `item["path"] = []` when the key is null (1673–1677). The row renders without geometry; every other unit survives.

### 2.7 Retry identity and canonical host

The direct retry used a literal `https://peta-nadi.onrender.com` and sent only `Content-Type`. It now uses `${getBaseUrl()}` and forwards `Authorization: Bearer <token>` from `getAuthToken()`, keeping the same `company_id` query. That preserves both the correct host (env override, dead-host rejection, no trailing slash) and the claim that makes the server scope the response.

---

## 3. Role matrix

| Capability | DISPATCHER | REGULATOR | GUEST |
|---|---|---|---|
| Fleet endpoint scope | JWT `company_id` claim only | Macro, all tenants + maritime/air | Macro, all tenants + maritime/air |
| `?company_id=` effect | **Ignored** (cannot widen or narrow) | Optional narrowing | Optional narrowing |
| Missing claim | Honest empty `vehicles: []` | N/A (role default `bapanas`) | N/A (role default `demo_sandbox`) |
| Map fleet | `LIVE_GPS` tenant assets only | Macro (subject to simulation toggle) | Macro (subject to simulation toggle) |
| `ROUTE_ESTIMATED` | Roster + `PROYEKSI` badge; map only when selected | Drawn as macro/estimated when toggle is on | Drawn as macro/estimated when toggle is on |
| Tenant roster panel | Shown | Hidden | Hidden |
| Client `FALLBACK_FLEET` | **Never** | Used when the API returns empty | Used when the API returns empty |
| Simulation toggle | Hidden; replaced by `Tenant Live GPS (n)` badge | Available | Available |
| Onboarding (`fleet:write`) | Allowed | Denied `403` | Denied `403` |
| Cache on role switch | Cleared when claim / `isDispatcher` changes | Shared macro cache; not cleared on REGULATOR ↔ GUEST | Shared macro cache; not cleared on REGULATOR ↔ GUEST |

Backend evidence: `test_fleet_ingest.py` asserts the owning dispatcher sees the registered truck and another tenant does not; `test_vehicles_telemetry.py::test_fleet_tenancy_filter_by_dispatcher_jwt` asserts a `pos_logistik` dispatcher receives only `pos_logistik` trucks; `::test_fleet_regulator_sees_corridor_wide` asserts ≥120 macro units for a regulator.

Frontend evidence: `scripts/test_fleet_scope.ts` pins all four columns above at the helper level, including "dispatcher without claim → empty" and "regulator keeps maritime + other tenants".

---

## 4. Automated verification (executed in this window)

| Check | Command | Result |
|---|---|---|
| TypeScript | `cd frontend && npx tsc --noEmit -p tsconfig.json` | **exit 0**, no diagnostics |
| Fleet ingest | `python -m pytest backend/tests/test_fleet_ingest.py -q` | **12 passed**, 16.33 s |
| Vehicles/telemetry | `python -m pytest backend/tests/test_vehicles_telemetry.py -q` | **9 passed**, 19.49 s |
| Role matrix | `cd frontend && node --no-warnings --experimental-strip-types scripts/test_fleet_scope.ts` | **17/17 assertions passed** |

Warnings observed (pre-existing, not introduced here): Starlette `httpx` deprecation, Pydantic v1-style `Config`, un-awaited `connect_tcp` coroutines, Supabase client `timeout`/`verify` deprecations.

### 4.1 The 17 role-matrix assertions

| Group | Assertions |
|---|---|
| Dispatcher with `pos_logistik` | sees both own assets; excludes other tenant; excludes macro maritime; excludes mock corridor; map slice is LIVE only; projected unit is roster-only; every roster row carries the claim (7) |
| Dispatcher without claim | empty tenant view; empty map; empty roster (3) |
| Regulator | full macro fleet; includes maritime + other tenants (2) |
| Guest | full macro fleet (1) |
| Helper invariants | `selectTenantVehicles(null)` empty; partition separates projections; server tag is authoritative; non-tenant macro rejected (4) |

---

## 5. Manual verification — deployed pair (not executed)

**Environment:** frontend `https://pre-hub.vercel.app`, backend `https://peta-nadi.onrender.com`. These steps require a deploy; they were **not** run in this window, and the live pair still runs pre-fix code.

### 5.1 Dispatcher isolation

1. Sign in / switch to `DISPATCHER` (`pos_logistik`).
2. Open DevTools → Network → `/api/v1/fleet/vehicles`.
3. **Expected:** every unit has `company_id: "pos_logistik"` and `is_tenant_asset: true`; no `maritime` or `air` macro unit; no `TRK-005-BANDA-ACEH-MEDAN`-style mock id.
4. Re-run with `?company_id=jne_sumut` appended. **Expected:** unchanged scope — the query is ignored for a dispatcher.

### 5.2 Honest empty

1. Use a dispatcher session whose token has no `company_id` (or clear the claim in a local token).
2. **Expected:** `200` with `vehicles: []`; the roster shows the amber "tidak memiliki klaim company_id" notice; the map has no fleet; **no mock trucks appear**.

### 5.3 Projected inspection

1. Onboard a truck with `tracking_mode: ROUTE_ESTIMATED`.
2. **Expected:** it appears in `Armada Tenant` with `PROYEKSI`; the map shows no amber line for it.
3. Click the roster row. **Expected:** the unit is drawn for inspection with the amber path and `PROYEKSI` badge; closing the inspector removes it.
4. Onboard a `LIVE_GPS` truck. **Expected:** it is drawn immediately and sorts above projected rows.

### 5.4 Regulator regression

1. Switch to `REGULATOR`.
2. **Expected:** the macro fleet returns (hundreds of units, including maritime/air), the simulation toggle is available, and no tenant roster panel appears.

### 5.5 Cold-start persistence

1. Onboard a `LIVE_GPS` truck, confirm it is visible.
2. Let the Render instance sleep, then reload.
3. **Expected:** the truck is still in the owner's fleet with its `company_id` and `tracking_mode` intact.

### 5.6 Role-switch cache

1. Load the dashboard as `REGULATOR` and wait for macro assets.
2. Switch to `DISPATCHER` without a full reload.
3. **Expected:** macro assets disappear immediately; no 90-second linger; only live tenant units remain.

---

## 6. Not covered by this phase

- **Row-level response isolation.** A single bad required field other than `path` can still 500 the whole fleet list.
- **In-flight request cancellation on role switch.** The cache is cleared, but `fetchFleet` has no `isMounted` guard; an old request can resolve late.
- **Legacy `truck_assets` tenancy.** Rows default to `org-prehub-pilot` when created outside a dispatcher session; they are matched by `matches_tenant` but are not retroactively migrated.
- **Deployment / live probes.** No Vercel build, Render redeploy, or production Playwright run happened here.
- **`ROUTE_ESTIMATED` route quality.** Hiding ambient corridors does not validate the projected geometry itself; a projected unit still needs origin/destination or a travel to have a path.
- **Per-role UI copy beyond the tenant badge/roster.** The rest of the dashboard's macro widgets are unchanged.
