<!-- generated-by: gsd-doc-writer -->
# Phase 82: Truck/Travel Split, ERP Ledger, Two-Step Onboarding — Learnings

**Scope:** durable lessons from Phase 82. Every entry is grounded in a file read of the working tree, `git show HEAD:` of the pre-fix file, or a command executed in this window. Items that could not be verified are marked **unverified** rather than stated as conclusions. Assumptions are deliberately excluded.

---

## 1. Learnings

### 1.1 One table for an asset **and** its trips makes every join ambiguous

- **Evidence:** `backend/app/schemas/fleet_ingest.py` `SingleVehicleRegisterRequest` carries identity (`vehicle_id`, `name`, `vin`, driver) *and* trip data (`origin`, `destination`, `cargo_tonnage`, `sla_deadline_hours`, `temperature_c`, `departure_time`) in one record. `fleet.py` `FleetVehicleTelemetry` does the same for the read model. Pre-fix there was no `travels` table; `custom_fleet_vehicles` was the only store.
- **Consequence:** registering a second trip meant either re-registering the truck (duplicate identities) or overwriting its row (lost history). There was no stable key to join a cost ledger to, so "savings per truck" was structurally impossible.
- **Lesson:** separate **master data** (registered once, mutable, tenant-owned) from **transactions** (append-mostly, snapshot the master's values at creation). `truck_assets` + `travels` snapshots `truck_name`/`company_id`/`driver_name` so a later asset edit cannot rewrite history. Keep `truck_id` as the business key and never make the transaction FK depend on the asset row surviving — deletion of an asset must not orphan the ledger.
- **Residual:** the legacy table is still writable through `POST /fleet/register`; new code must keep reading it as an asset source, which is why `resolve_truck_asset` checks master first and legacy second.

### 1.2 A hardcoded percentage is indistinguishable from fraud once it reaches a report

- **Evidence:** `git show HEAD:frontend/components/sidebar/HoldVsRerouteCard.tsx` printed `Rp 6.800/km`, `Rp 85.000`, `Rp 170k/jam` as if they were computed from the trip; `MitigationTab.tsx` printed `+4.2 Jam Delay Pasokan` and `Potensi Inflasi Medan +2.1% (Cabai +14.2%)` unconditionally. Separately, `backend/app/routers/evaluation_router.py` serves `CORRIDOR_EFFICIENCY_DATA` — explicitly annotated as "reference planning figures" — behind a live-looking endpoint.
- **Consequence:** numbers that were plausible for one corridor were shown for every corridor. The UI could not distinguish "computed" from "illustrative", so an operator could not audit a claim.
- **Lesson:** a displayed rupiah/percent must have a **provenance path to a stored row and a named formula**. If the field is missing, render `Belum tersedia` / `Belum terverifikasi` — never a default that looks like data. Enforce it structurally: the client rejects nothing, but the server never accepts a savings percent, and every ERP number is derived from `travels` columns. Keep benchmark/reference fixtures on a separate endpoint and label them.
- **Applied:** `_apply_ledger` computes fuel/toll/spoilage/labour from constants; `build_erp_summary` sums persisted columns; the cards print solver fields or an explicit unavailable state.

### 1.3 `[0, 0]` and centroid defaults are the same bug wearing two hats

- **Evidence:** migration 014 declares `origin_coords JSONB NOT NULL DEFAULT '[0,0]'` and `dest_coords JSONB ... DEFAULT '[0,0]'` (lines 66/69). Pre-fix, the wizard's gazetteer failure path mapped **every** `STRATEGIC_HUBS` entry to `lat: 3.5952, lon: 98.6722` (Medan) — `git show HEAD:frontend/components/fleet/FleetOnboardingModal.tsx` lines 137–149 and 170–182. In the same phase, `geocode_router.get_gazetteer_nodes` stopped defaulting missing coords to the Medan centroid and now skips the node with a warning (lines 126–136), and search returns an honest empty list instead of a province centroid.
- **Consequence:** a coordinate default turns "unknown" into "a real place". A trip created from a fallback point is priced with a real distance, a real toll segment and a real spoilage curve — all wrong, none flagged. `[0,0]` is worse: it is a point in the Atlantic and will silently produce absurd distances if a client ever omits coords.
- **Lesson:** coordinates must be **required and validated at the schema boundary**, not defaulted in storage. If a legacy path can insert without coords, make the column nullable and reject at the read/service layer rather than inventing a point. Client-side, a failed lookup must invalidate any previously selected coordinate (the wizard does this on every keystroke) so a stale point cannot be submitted with new text.
- **Residual:** the `[0,0]` defaults remain in migration 014. They are unreachable from the wizard (`originCoords`/`destCoords` are required) but are a trap for any future writer; changing them to `NULL` is the safer follow-up.

### 1.4 `sync_status = 'pending'` without a drain worker is a silent data-loss contract

- **Evidence:** `travels_router.create_truck_asset` sets `data["sync_status"] = "pending"`; `travel_ledger_service.create_travel` does the same. `local_storage.mark_as_synced` (line 566) was extended to accept `truck_assets` and `travels`, but a repo-wide search finds **no caller** outside `local_storage.py` itself. `build_erp_summary` reports `storage="local_sqlite"` hardcoded (line 535). The Supabase tables exist only as DDL.
- **Consequence:** every asset and rit is durable on the instance's SQLite file and nowhere else. On Render, that file is ephemeral: a redeploy or instance move discards the fleet and the ERP history while the UI continues to report `pending` as if a sync were queued. The migration creates an expectation the runtime does not honour.
- **Lesson:** `sync_status` is a **promise**, not a label. Either ship the drain (read `pending` → upsert by business key → `mark_as_synced`, with idempotency and retry) or do not write `pending`. If Supabase is the intended system of record, the write path must go there first and treat SQLite as a cache, not the reverse. Surface the storage backend in the API (`storage: "local_sqlite"`) so the UI can warn instead of implying durability.
- **Related:** the tenancy columns added to `custom_fleet_vehicles` in this phase exist precisely because in-memory metadata was lost on cold start. Persisting the row is necessary but still local-only.

### 1.5 A Playwright harness that only boots the frontend cannot test an API-backed wizard

- **Evidence:** `frontend/playwright.config.ts` defines a single `webServer` (`node .next/standalone/server.js`, `http://localhost:3000`, `reuseExistingServer: true`) and no backend process. The wizard's Step 1 and Step 2 call `api.fleet.createTruck` / `createTravel`, which resolve to `http://localhost:8000` locally via `getBaseUrl()`. The config's `testDir` is `frontend/e2e`, whose specs are screenshot/demo/pilot-hardening oriented.
- **Consequence:** running `npx playwright test` on a machine without a separately started backend produces network failures inside the wizard, not a product assertion failure. Any future spec for onboarding must either start the backend (second `webServer` entry with a health check) or mock the API at the route layer; otherwise the test is environment-dependent and will be reported as "flaky".
- **Lesson:** an e2e harness must declare **every** process the flow depends on. Add the backend as a `webServer` (with `/health` readiness) and seed/clean a dedicated tenant, or the suite silently tests a degraded offline path — exactly the failure mode the phase exists to remove.
- **Not verified:** no Playwright run was executed in this window; the absence of a backend entry is a config fact, not an observed test failure.

### 1.6 "Recorded actuals" must not imply "no toll was paid"

- **Evidence:** `travel_ledger_service._apply_ledger` (lines 214–218): when `actual_toll_segments is None` and `actual_recorded` is true, `actual_segments = []`, so `actual_toll = 0` and `saved_toll = baseline_toll`. The wizard's advanced section collects actual time and fuel but has no actual-toll control (`FleetOnboardingModal.tsx` lines 1111–1152).
- **Consequence:** a dispatcher who records a real trip through the same toll road is credited the full baseline toll as a saving. The test suite avoids this because `_travel_payload` always supplies `actual_toll_segments`.
- **Lesson:** absence of evidence is not evidence of absence. For a nullable realised field, "not recorded" and "recorded as zero" must be different states. Defaulting an unset actual toll to the **baseline** segments (conservative) or making the field required once `actual_recorded` flips would both be safer than `[]`. The UI should ask, or the API should refuse to claim a toll saving it cannot substantiate.

### 1.7 Deriving the split from already-rounded components makes the sum exact

- **Evidence:** `_apply_ledger` rounds each component with `_money` before computing `saved_total = _money(saved_fuel + saved_toll + saved_spoilage + saved_labor)`, and `baseline_total`/`actual_total` are sums of those same rounded components. `test_travel_ledger_uses_real_bpjt_fuel_and_spoilage` asserts both `split ≈ saved_cost` and `saved_cost ≈ baseline − actual` with `abs=1`.
- **Consequence/lesson:** computing a total from unrounded floats and then rounding the components independently produces cent-level drift that users notice in a ledger. Round once, at the component boundary, then sum integers. Keep the test that asserts the identity — it is the cheapest guard against a future refactor reintroducing a residual row.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **RLS is wide open on both new tables.** `SELECT` is granted to `public`; insert/update/delete to any `authenticated` session with `USING (true)` / `WITH CHECK (true)`. Tenant isolation currently depends on router filters. | `014_truck_assets_and_travels.sql` lines 37–51 and 142–156 |
| 2 | **Supabase is provisioned but not written.** All API writes go to `local_storage` (SQLite); `storage="local_sqlite"` is hardcoded in the ERP response; `sync_status='pending'` has no drain. | `travel_ledger_service.py:304`, `:535`; `travels_router.py:80`; no `mark_as_synced` caller |
| 3 | **Single-record reads are unscoped.** `GET /fleet/trucks/{truck_id}` and `GET /fleet/travels/{travel_id}` take no `UserSession`; `PATCH /travels/{id}` checks `fleet:write` but not that the rit belongs to the caller's tenant. | `travels_router.py:106`, `:182`, `:194` |
| 4 | **Actual toll defaults to zero on recorded trips**, overstating toll savings. The UI cannot supply actual segments. | `travel_ledger_service.py:214–218`; `FleetOnboardingModal.tsx:1111–1152` |
| 5 | **`[0,0]` coordinate defaults remain in the migration.** Unreachable from the wizard, but any future writer inherits a bogus point. | `014_*.sql` lines 66, 69 |
| 6 | **ERP panel does not refresh after onboarding.** `ERPSavingsPanel` accepts `refreshKey`, `ReportsSection` renders `<ERPSavingsPanel />` with no key. | `ERPSavingsPanel.tsx:57–61`; `ReportsSection.tsx:429` |
| 7 | **`save_truck_asset` upsert keeps a stale `id`.** `ON CONFLICT(truck_id) DO UPDATE` does not update `sync_status` (stays `pending`, acceptable) and returns a newly generated `id` rather than the existing row's id. Travels key off `truck_id`, so no breakage, but the response id can differ from the stored id. | `local_storage.py:1132–1163` |
| 8 | **Order-dependent test pollution.** `test_fleet_ingest.py::test_registered_truck_visible_to_owning_dispatcher` failed in one 6-file combined run but passes standalone (12/12) and in a 23-test travels+fleet run. Cause not isolated. | Commands and results in the walkthrough §6 |
| 9 | **Two unrelated suite failures in this environment.** `simulate/stream` requires `langgraph` (not installed); `resolve_canonical_article_url` expects `google.com/search` while the resolver returns the publisher's search URL. | `backend/app/workers/agent_worker.py:6`; `test_cross_workstream_integration.py:95` |

---

## 3. Constraints (hard boundaries this phase worked within)

| Constraint | Evidence | How it shaped the implementation |
|---|---|---|
| **Backward compatibility** | `custom_fleet_vehicles` predates the split; `resolve_truck_asset` falls back to it; `list_truck_assets_with_legacy` unions both | No legacy table/route removed. Legacy rows are readable as assets and accepted as `truck_id`. Legacy deletion stays on `DELETE /fleet/custom/{id}`. |
| **Actual-recorded gate (Rp 0)** | `_apply_ledger` mirrors baseline when `actual_recorded` is false; `test_planned_travel_claims_no_savings_before_execution` | A planned rit can show a baseline but never a saving. The wizard's success copy says the same. |
| **Split sums exactly** | Savings are derived from rounded components; test asserts both identities | No percentage field is accepted or stored as input. |
| **Indonesian labels** | All new UI strings and error messages (`tidak terdaftar`, `Belum terverifikasi`, `Rit … tersimpan`) | Errors are operator-readable and name the failing entity; money uses `id-ID`. |
| **Per-company scope** | `_effective_company_filter` (router), `matches_tenant` (telemetry), `useFleetVehicles` tenant slice, `fleetScope.ts` | Dispatcher claim wins over query params; no-claim dispatcher gets an honest empty fleet, never the mock corridor fleet. Regulator/guest keep macro views. |
| **No new secrets / no deploy-config change** | `render.yaml` only renames the service; `frontend/.env.example` documents the existing canonical host | Local dev remains `:3000` → `:8000`; no new env var is required for the ledger. |
| **Windows PowerShell shell, mixed line endings** | Git warns `CRLF will be replaced by LF` for `frontend/lib/types.ts` | No shell scripts touched; gates are `tsc` + `pytest`. |

---

## 4. Environment context (for the next window)

| Component | Value |
|---|---|
| Frontend (prod) | `https://pre-hub.vercel.app` — Next.js `output: 'standalone'`, no `vercel.json` |
| Frontend (local) | `http://localhost:3000` |
| Backend (prod) | `https://peta-nadi.onrender.com` |
| Backend (local) | `http://localhost:8000` |
| API base resolution | `frontend/lib/baseUrl.ts` → `sanitizeBaseUrl(NEXT_PUBLIC_API_URL)` → production host on non-localhost → `http://localhost:8000`; rejects quotes/whitespace/trailing slash/`prehub-backend.onrender.com` |
| WebSocket | `getWsBaseUrl()` derives `wss://` from the API base; `NEXT_PUBLIC_WS_URL` may override but a localhost value is rejected outside local dev |
| Proxy | `frontend/app/api/proxy/[...path]/route.ts` → `x-target-base-url` → `NEXT_PUBLIC_API_URL` → canonical host |
| Database | SQLite `local_storage` for all ledger writes; Supabase migration 014 defined but not applied/written in this window |
| Roles | GUEST (read aggregate, zero writes), REGULATOR (aggregate only), DISPATCHER (`fleet:write`, tenant-scoped detail) |
| Test env | Python 3.13, Pydantic 2.13 (v1-style `Config` deprecation), `langgraph` absent |

---

## 5. Actions performed (evidence)

- `python -m pytest backend/tests/test_travels_erp.py -q` → **11 passed**, 2 warnings, 20.46 s.
- `python -m pytest backend/tests/test_travels_erp.py backend/tests/test_geocode_search.py backend/tests/test_fleet_ingest.py backend/tests/test_auth_rbac.py backend/tests/test_precision_fleet_telemetry.py -q` → **65 passed**, 7 warnings, 19.54 s.
- `python -m pytest backend/tests/test_travels_erp.py backend/tests/test_fleet_ingest.py backend/tests/test_geocode_search.py backend/tests/test_vehicles_telemetry.py backend/tests/test_precision_fleet_telemetry.py -q` → 45 passed, 79.74 s.
- `python -m pytest backend/tests/test_fleet_ingest.py -q` → 12 passed, 11.49 s.
- `python -m pytest backend/tests/test_api_routers.py backend/tests/test_cross_workstream_integration.py backend/tests/test_auth_rbac.py backend/tests/test_fleet_ingest.py backend/tests/test_geocode_search.py backend/tests/test_travels_erp.py -q` → 78 passed, 3 failed (reasons in §2.8/§2.9).
- `npx tsc --noEmit -p tsconfig.json` in `frontend/` → **exit 0**.
- `git status --porcelain` → 26 modified + 12 untracked code paths before these documents were added (the untracked `.planning/phases/80-*/` directory is documentation from another phase).

**Not executed:** Playwright e2e, `supabase db push` / migration application, Render redeploy, live calls against `pre-hub.vercel.app` or `peta-nadi.onrender.com`. Claims that depend on those remain **unverified**.

---

## 6. Follow-up notes (landed in the same working tree, not part of the ledger core)

1. **WebSocket base URL fix.** `frontend/hooks/useCrisisSocket.ts` previously captured `const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'` at module scope. A deployed bundle without `NEXT_PUBLIC_WS_URL` therefore tried to connect to the visitor's own machine. It now resolves per connection through `getWsBaseUrl()` (`lib/baseUrl.ts:139`), which converts the canonical `https://` API base to `wss://`, accepts `ws/wss/http/https` overrides, rejects the decommissioned host, and rejects a localhost override outside local dev. Any commit split must keep this fix with the base-URL module it depends on.
2. **Render service rename.** `render.yaml` line 3 changed `name: prehub-backend` → `name: peta-nadi` to match the deployed host used by `lib/baseUrl.ts` and the docs. Renaming a Render service is not a no-op: it can create a new service URL unless the existing service is renamed in the dashboard as well. Reconcile the dashboard name, the health check, and `CORS_ORIGINS` before the next deploy; the code no longer references `prehub-backend` except as a rejected dead host.
3. **Apply migration 014** before enabling any Supabase write path, then add RLS predicates keyed on the JWT `company_id` claim rather than `USING (true)`.
4. **Wire a `sync_status` drain** (or drop the `pending` write) so "pending" means something. Seed idempotency on `truck_assets.truck_id` and `travels.id`.
5. **Collect actual toll segments** in the wizard advanced section, or default them to baseline on `PATCH`, to close concern 4.
6. **Add a backend `webServer` to `playwright.config.ts`** and a wizard spec that asserts the Step 1 → Step 2 handoff with a seeded tenant.
