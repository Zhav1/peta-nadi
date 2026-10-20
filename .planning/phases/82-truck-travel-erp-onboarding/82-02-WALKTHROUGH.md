<!-- generated-by: gsd-doc-writer -->
# Phase 82: Truck Asset / Travel Ledger Split, ERP Summary, Two-Step Onboarding — Walkthrough

**Purpose:** implementation record for the asset-vs-trip separation, the rupiah ledger behind the ERP panel, and the two-step fleet wizard. Every statement below was verified against the working tree (file reads, `git diff`, `git show HEAD:`, or an executed command). Items that were not executed are marked **not verified**.

---

## 1. Files changed

| # | File | Status | What changed |
|---|---|---|---|
| 1 | `infra/supabase/migrations/014_truck_assets_and_travels.sql` | **new** | `truck_assets` + `travels`, indexes, RLS policies; `custom_fleet_vehicles` untouched |
| 2 | `backend/app/schemas/travel.py` | **new** | `TruckAssetCreate/Response`, `TravelCreate/Update/Response/ListResponse`, `TravelHedgingRequest`, `ERPTotals`, `ERPSavingsBreakdown`, `ERPCompanySummary`, `ERPTripRow`, `ERPSummaryResponse` |
| 3 | `backend/app/services/travel_ledger_service.py` | **new** | asset resolution (master → legacy), ledger math, create/update/hedging, ERP aggregation |
| 4 | `backend/app/routers/travels_router.py` | **new** | `/fleet/trucks` CRUD (no PATCH), `/fleet/travels` create/list/get/patch/hedging |
| 5 | `backend/app/routers/erp_router.py` | **new** | `GET /erp/summary` with dispatcher/regulator scope |
| 6 | `backend/app/db/local_storage.py` | modified | SQLite mirror of both tables, additive column migrations, tenancy columns on `custom_fleet_vehicles`, CRUD helpers |
| 7 | `backend/app/services/spoilage_hedging_service.py` | modified | exports `TRUCK_FUEL_CONSUMPTION_KM_PER_LITER`, `DRIVER_OVERTIME_HOURLY_IDR`, `DEPOT_HOURLY_FEE_IDR`, `get_effective_fuel_rate`, `get_spoilage_loss` |
| 8 | `backend/app/main.py` | modified | mounts `travels_router`, `erp_router` under `/api/v1` |
| 9 | `backend/app/routers/fleet_ingest_router.py` | modified | `GET /fleet/custom` is tenant-scoped for dispatchers (`?company_id=` honored for regulator/guest) |
| 10 | `backend/app/routers/vehicles_router.py` | modified | dispatcher fleet is claim-only; no-claim → honest empty; `matches_tenant` tagging |
| 11 | `backend/app/services/telemetry_service.py` | modified | merges master truck assets into the fleet as `ROUTE_ESTIMATED` tenant units; tenant matching helper |
| 12 | `backend/app/routers/geocode_router.py` | modified | ranked gazetteer search, bounded caches, honest empty on miss, no Medan centroid for coordless nodes |
| 13 | `backend/tests/test_travels_erp.py` | **new** | 11 tests incl. the end-to-end wizard call sequence |
| 14 | `frontend/components/fleet/FleetOnboardingModal.tsx` | modified | two-step wizard; gazetteer autocomplete; toll segments; asset list |
| 15 | `frontend/components/dashboard/ERPSavingsPanel.tsx` | **new** | ERP KPIs, split, regulator aggregate, per-rit table, hedging action |
| 16 | `frontend/components/dashboard/ReportsSection.tsx` | modified | `ERP Penghematan` / `Catatan Audit Mitigasi` switch, ERP default |
| 17 | `frontend/components/sidebar/MitigationTab.tsx` | modified | delay/inflation read from payload; `Belum terverifikasi` when absent |
| 18 | `frontend/components/sidebar/HoldVsRerouteCard.tsx` | modified | rupiah from solver fields; `Belum tersedia` when absent |
| 19 | `frontend/lib/api.ts` | modified | `fleet.createTruck/listTrucks/createTravel/listTravels/getTravel/updateTravel/solveTravelHedging`, `erp.summary`, geocode search timeout |
| 20 | `frontend/lib/types.ts` | modified | `TruckAsset*`, `Travel*`, `ERPSummaryResponse`, ERP row/breakdown types |
| 21 | `frontend/lib/baseUrl.ts` | **new** | canonical API base sanitizer + `getWsBaseUrl()` |
| 22 | `frontend/hooks/useCrisisSocket.ts` | modified | WS URL via `getWsBaseUrl()` instead of a hardcoded `ws://localhost:8000` |
| 23 | `frontend/lib/fleetScope.ts` | **new** | pure tenant/live/projection scoping helpers |
| 24 | `frontend/hooks/useFleetVehicles.ts` | modified | dispatcher tenant slice, no mock fallback for dispatchers, cache reset on role/tenant change |
| 25 | `frontend/components/fleet/TenantFleetRoster.tsx` | **new** | dispatcher asset inventory with LIVE/PROYEKSI badges |
| 26 | `render.yaml` | modified | service renamed `prehub-backend` → `peta-nadi` |
| 27 | `frontend/.env.example` | modified | documents `https://peta-nadi.onrender.com` and client sanitization |

Adjacent modified files in the same working tree (map/corridor context, types, proxy): `frontend/components/map/CrisisMap.tsx`, `frontend/components/map/FleetVehicleLayer.tsx`, `frontend/components/dashboard/DashboardClient.tsx`, `frontend/hooks/useCorridorContext.ts`, `frontend/hooks/useCrisisSimulationStream.ts`, `frontend/app/api/proxy/[...path]/route.ts`, `frontend/components/dashboard/AgentStatusWidget.tsx`, `frontend/package.json`, `backend/tests/test_fleet_ingest.py`.

---

## 2. Schema diff

### 2.1 `truck_assets` (master — written once in Step 1)

| Column | Type | Default | Meaning |
|---|---|---|---|
| `id` | TEXT PK | — | Row id |
| `truck_id` | TEXT UNIQUE NOT NULL | — | Nopol / `vehicle_id`, normalized uppercase (the join key for travels and legacy) |
| `name` | TEXT NOT NULL | — | Unit name (`Truk Cold-Chain Sayur Berastagi #4`) |
| `modality` | TEXT | `truck` | Asset modality |
| `vin` | TEXT | — | Chassis / VIN |
| `vehicle_golongan` | TEXT | `GOL_II` | BPJT class `GOL_I`–`GOL_V` |
| `driver_name`, `driver_phone` | TEXT | — | Primary driver + WhatsApp |
| `company_id` | TEXT | `org-prehub-pilot` | Tenant claim used for scope |
| `company_name` | TEXT | — | Display name |
| `gross_weight_ton` | NUMERIC | `12.0` | Audit/MST context |
| `fuel_type` | TEXT | `biosolar` | `biosolar` / `dexlite` / `pertamina_dex` |
| `notes`, `created_by` | TEXT | — | Audit |
| `sync_status` | TEXT | `synced` (SQL DDL) / `pending` (app writes) | Remote-sync marker |
| `created_at`, `updated_at` | TIMESTAMPTZ | `NOW()` | Audit |

### 2.2 `travels` (transactional — one row per rit)

| Group | Columns |
|---|---|
| Identity | `id`, `truck_id`, `truck_name`, `company_id`, `driver_name` |
| Endpoints | `origin_name`, `origin_ref`, `origin_coords`, `destination_name`, `destination_ref`, `dest_coords` |
| Cargo/SLA | `commodity_key`, `cargo_tonnage`, `cargo_value_idr`, `cargo_value_source`, `vehicle_golongan`, `fuel_type`, `sla_deadline_hours` |
| Baseline | `baseline_distance_km`, `distance_source`, `baseline_time_hours`, `blocked_delay_hours`, `baseline_fuel_liters`, `baseline_toll_segments`, `baseline_fuel_cost_idr`, `baseline_toll_cost_idr`, `baseline_spoilage_idr`, `baseline_labor_idr`, `baseline_cost_idr` |
| Actual | `actual_time_hours`, `actual_recorded`, `actual_fuel_liters`, `actual_toll_segments`, `actual_fuel_cost_idr`, `actual_toll_cost_idr`, `actual_spoilage_idr`, `actual_labor_idr`, `actual_cost_idr` |
| Savings split | `saved_time_hours`, `saved_fuel_liters`, `saved_fuel_cost_idr`, `saved_toll_idr`, `saved_spoilage_idr`, `saved_labor_idr`, `saved_cost_idr`, `efficiency_pct` |
| Execution | `rerouted`, `disruption_id`, `status`, `inflation_shock_factor` |
| Persisted hedging | `hedging`, `hedging_policy`, `hedging_net_savings_idr`, `hedging_solved_at` |
| Audit | `notes`, `created_by`, `sync_status`, `created_at`, `updated_at`, `delivered_at` |

### 2.3 Supabase vs runtime SQLite

| Aspect | Supabase (014) | SQLite (`local_storage`) |
|---|---|---|
| Coordinates | `origin_coords JSONB DEFAULT '[0,0]'`, `dest_coords JSONB` | `origin_coords_json TEXT`, `dest_coords_json TEXT` |
| Toll segments | `JSONB DEFAULT '[]'` | `baseline_toll_segments_json TEXT`, `actual_toll_segments_json TEXT` |
| Hedging | `hedging JSONB` | `hedging_json TEXT` |
| Booleans | `BOOLEAN` | `INTEGER` (`0/1`) |
| Legacy table | untouched | additive `company_id`, `company_name`, `tracking_mode`, `departure_time`, coordinate columns |
| Constraint on `truck_id` | none (FK intentionally omitted so legacy ids remain valid) | none |

**Migration status:** the SQL file is additive and idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`). It has **not** been applied to the remote Supabase project in this window; the API persistence path used by the tests and the app is SQLite. See concerns 1 and 2 in the learnings document.

---

## 3. Endpoints

### 3.1 Truck assets (Step 1)

| Method | Path | Auth | Success | Errors | Behavior |
|---|---|---|---|---|---|
| `POST` | `/api/v1/fleet/trucks` | `fleet:write` | `201 TruckAssetResponse` | `403` missing permission, `409` plate owned by another tenant | Uppercases `truck_id`; defaults tenant from JWT; `sync_status="pending"`; upsert for same tenant |
| `GET` | `/api/v1/fleet/trucks?company_id=` | public (optional user not required) | `200 [TruckAssetResponse]` | — | Union of `truck_assets` + legacy `custom_fleet_vehicles` (truck modality), deduped by plate; `source` ∈ `master` / `legacy_custom_fleet` |
| `GET` | `/api/v1/fleet/trucks/{truck_id}` | public | `200 TruckAssetResponse` | `404` | Master first, then legacy |
| `DELETE` | `/api/v1/fleet/trucks/{truck_id}` | `fleet:write` | `200 {status,message,truck_id}` | `403`, `404` (incl. legacy rows — those go through `DELETE /fleet/custom/{vehicle_id}`) | Historical travels keep their snapshot |

### 3.2 Travels / rit ledger (Step 2 + outcomes)

| Method | Path | Auth | Success | Errors | Behavior |
|---|---|---|---|---|---|
| `POST` | `/api/v1/fleet/travels` | `fleet:write` | `201 TravelResponse` | `404` unknown truck, `400` validation, `403` | Resolves asset, snapshots name/company/driver, inherits golongan/fuel, computes ledger |
| `GET` | `/api/v1/fleet/travels` | optional user | `200 TravelListResponse` | — | Filters `company_id` (dispatcher claim if omitted), `status`, `truck_id`; `limit` 1–2000; newest first |
| `GET` | `/api/v1/fleet/travels/{travel_id}` | public | `200 TravelResponse` | `404` | Includes persisted hedging block |
| `PATCH` | `/api/v1/fleet/travels/{travel_id}` | `fleet:write` | `200 TravelResponse` | `404`, `400`, `403` | Applies realised fields, recomputes split, sets `delivered_at` |
| `POST` | `/api/v1/fleet/travels/{travel_id}/hedging` | `fleet:write` | `200 {status,travel_id,hedging}` | `404`, `400`, `403` | Solves Continue/Reroute/Hold, persists policy + net savings |

### 3.3 ERP

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `GET` | `/api/v1/erp/summary?company_id=` | optional user | DISPATCHER → tenant-scoped `DISPATCHER_DETAIL` with per-rit rows; REGULATOR/GUEST → `REGULATOR_AGGREGATE` with `trips: []`; always includes `totals`, `per_company`, `business_notes` |

### 3.4 Supporting

| Method | Path | Used by |
|---|---|---|
| `GET` | `/api/v1/geocode/search?q=` | Wizard origin/destination autocomplete (250 ms debounce, client 20 s timeout, ranked gazetteer + Nominatim fallback, honest empty) |
| `GET` | `/api/v1/intermodal/toll-tariffs` | Wizard BPJT segment picker |
| `GET` | `/api/v1/fleet/vehicles` | Tenant-scoped map fleet (dispatchers: claim only; no-claim → empty) |
| `GET` | `/api/v1/fleet/custom` | Legacy onboarded vehicles (tenant-scoped for dispatchers) |

---

## 4. UI changes

| Surface | Before | After |
|---|---|---|
| Onboarding modal | One form mixing nopol, driver, cargo, origin/destination; search fallback mapped every hub to Medan `3.5952, 98.6722` | Two steps: **Aset Truk** (nopol, name, VIN, golongan, driver, phone, weight, fuel) → **Rit Pengiriman** (truck select, gazetteer origin/dest, commodity, tonnage, value, SLA, baseline time, blocked delay, optional BPJT segments + actual time/fuel) |
| Endpoint pickers | Free text + fabricated fallback coordinates | Debounced gazetteer dropdown showing `kecamatan, kabupaten, province`; selection stores `[lon, lat]`; editing the text invalidates the coordinate; submit disabled without both points |
| Step transition | n/a | Saving the asset preselects it in Step 2, shows `Aset truk <plate> tersimpan. Lanjut membuat rit pertama.`, and a `Tambah aset lain` link returns to Step 1 |
| Read-only roles | Wizard still rendered writable inputs | REGULATOR/GUEST see disabled fields + explicit banner; `fleet:write` is denied server-side anyway |
| Reports | Single long mitigation/audit ledger | Tabs `ERP Penghematan` (default) and `Catatan Audit Mitigasi`; ERP view is the new panel |
| ERP panel | Did not exist | Six KPIs, four-way split with provenance hints, regulator per-company table, dispatcher per-rit table with status filter and inline `Hitung` hedging |
| Mitigation impact block | `+4.2 Jam Delay Pasokan`, `Potensi Inflasi Medan +2.1% (Cabai +14.2%)` | Values from `prediction_finding` / `inflation_forecast`; otherwise `Belum terverifikasi` |
| Hold vs reroute card | `Rp 6.800/km`, `Rp 85.000`, `Rp 170k/jam` | Solver rupiah per component (`BBM (Pertamina)`, `Tarif Tol BPJT`, `Uang Lembur Supir`, `Jarak Detour`, `Biaya Depo`, `Reefer & Genset`, `Susut Muatan`); `Belum tersedia` when absent |
| Fleet workspace | Every role could see the macro/mock fleet; dispatcher could toggle simulation | Dispatcher sees tenant assets only, map draws `LIVE_GPS`, `ROUTE_ESTIMATED` listed with `PROYEKSI` and only drawn on inspection; no mock fallback; regulator/guest keep macro view |
| WebSocket | `NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'` | `getWsBaseUrl()` derives `wss://` from the canonical API base; localhost override rejected outside local dev |

---

## 5. Business metrics — what each number means

All figures are computed in `travel_ledger_service._apply_ledger` and aggregated in `build_erp_summary`. None are accepted from the client.

| Metric | Formula / source | Reading |
|---|---|---|
| `baseline_cost_idr` | fuel + BPJT toll + spoilage + driver labour on the **blocked baseline** | What the trip would cost if the disruption were ignored |
| `actual_cost_idr` | same four components on realised time/fuel/toll | What the trip actually cost (or the blocked baseline while unrecorded) |
| `saved_cost_idr` | `baseline_cost_idr − actual_cost_idr` | Net rupiah avoided; **0 until actuals exist** |
| `saved_fuel_cost_idr` | `(baseline L − actual L) × Pertamina rate` | Fuel component of the split (can be negative) |
| `saved_toll_idr` | `BPJT(baseline segments) − BPJT(actual segments)` | Toll component; depends on actual segments being supplied |
| `saved_spoilage_idr` | `C(1−e^(−δ·t_baseline)) − C(1−e^(−δ·t_actual))` | Cargo-value loss avoided by shorter exposure |
| `saved_labor_idr` | `(baseline hours + delay − actual hours) × Rp 50.000` | Driver overtime avoided |
| `saved_time_hours` | `(baseline_time + blocked_delay) − actual_time` | Operational time recovered |
| `saved_fuel_liters` | `baseline L − actual L` | Fuel volume delta; negative means the reroute burned more |
| `efficiency_pct` | `saved_cost ÷ baseline_cost × 100` | Share of baseline spend avoided; 0 when baseline is 0 |
| `reroute_success_count` | `rerouted` **and** status `rerouted/delivered` **and** `saved_cost > 0` | Reroutes that paid off |
| `reroute_failed_count` | `rerouted` **and** (`status = failed` **or** `saved_cost < 0`) | Reroutes that cost more |
| `reroute_success_rate_pct` | success ÷ (success + failed) | Quality of mitigation, not volume |
| `sla_compliance_pct` | delivered rit with `actual_time ≤ sla_deadline` ÷ delivered | On-time share among completed trips |
| `avg_cost_saved_per_trip_idr` | total saved ÷ total rit | Per-rit unit economics |
| `cost_efficiency_pct` (aggregate) | total saved ÷ total baseline | Portfolio-level efficiency |
| `per_company[]` | aggregates grouped by `company_id` | Regulator macro view without per-rit commercial detail |

**Cost constants (single source: `spoilage_hedging_service`):** BPJT tariffs per segment for `GOL_I`–`GOL_V` (e.g. `MEDAN_TEBINGTINGGI` GOL_II = Rp 85.000); Pertamina base rates biosolar 6.800, dexlite 14.550, pertamina_dex 15.100 IDR/L; truck consumption 3.5 km/L; driver overtime Rp 50.000/h; depot Rp 35.000/h. Spoilage deltas: ultra-perishable 0.025/h, cold-chain 0.015/h, semi-perishable 0.008/h, dry bulk 0.0005/h. Default cargo prices when `cargo_value_idr` is empty: 55.000 / 125.000 / 35.000 / 14.000 IDR/kg per tier.

**Regulator boundary:** `include_trips=False` removes the per-rit rows; totals and per-company aggregates remain. Guests are treated like regulators for read scope and cannot write (`fleet:write` absent).

---

## 6. Automated verification (executed in this window)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.json` in `frontend/` | **exit 0** (no diagnostics) |
| Ledger/ERP/wizard | `python -m pytest backend/tests/test_travels_erp.py -q` | **11 passed**, 2 warnings, 20.46 s |
| Regression bundle | `python -m pytest backend/tests/test_travels_erp.py backend/tests/test_geocode_search.py backend/tests/test_fleet_ingest.py backend/tests/test_auth_rbac.py backend/tests/test_precision_fleet_telemetry.py -q` | **65 passed**, 7 warnings, 19.54 s |
| Fleet + geocode subset | `python -m pytest backend/tests/test_travels_erp.py backend/tests/test_fleet_ingest.py backend/tests/test_geocode_search.py backend/tests/test_vehicles_telemetry.py backend/tests/test_precision_fleet_telemetry.py -q` | 45 passed, 79.74 s |
| Fleet module alone | `python -m pytest backend/tests/test_fleet_ingest.py -q` | 12 passed, 11.49 s |

**The named test covers the wizard sequence end to end** (`test_two_step_onboarding_flow_end_to_end`, `test_travels_erp.py:294`): Step 1 POST asset (lowercase plate → uppercased), asset visible in the Step 2 list, rit created as `planned` with `saved_cost_idr = 0`, PATCH with realised time/fuel/toll, ERP summary reports exactly that one rit and its split reconciles.

**Broader-run caveats (executed, not inferred):**

- `python -m pytest backend/tests/test_api_routers.py backend/tests/test_cross_workstream_integration.py backend/tests/test_auth_rbac.py backend/tests/test_fleet_ingest.py backend/tests/test_geocode_search.py backend/tests/test_travels_erp.py -q` → **78 passed, 3 failed**.
  - `test_api_routers.py::test_simulate_crisis_stream_endpoint` → `ModuleNotFoundError: No module named 'langgraph'` (`backend/app/workers/agent_worker.py:6`), an environment dependency gap.
  - `test_cross_workstream_integration.py::test_resolve_canonical_article_url` → expects `google.com/search` but the resolver returns `antaranews.com/search`; a news-resolver expectation mismatch, unrelated to fleet/ERP.
  - `test_fleet_ingest.py::test_registered_truck_visible_to_owning_dispatcher` failed only in that combined run; it passes standalone (12/12) and in the 23-test travels+fleet pair. Cause not isolated → **unverified**.
- No test writes to or reads from remote Supabase; the SQLite database is the exercised store.

**Not executed in this window:** Playwright e2e, applying migration 014 to Supabase, Render redeploy, and any live check against `peta-nadi.onrender.com`. Treat deployed-behavior claims as unverified.

---

## 7. Manual verification (local pair)

**Prereqs:** backend on `http://localhost:8000` (it must be running — the browser wizard calls the API directly; the Playwright config only boots the frontend, see learnings 1.5), frontend on `http://localhost:3000`, signed in as DISPATCHER with a `company_id` claim.

1. **Step 1** — open `Onboard Armada` → `Aset Truk & Rit` → fill plate `BK-8821-XA`, name, golongan `GOL_II`, driver, fuel → **Simpan Aset & Lanjut ke Rit**. Expect success banner, automatic Step 2, and the plate preselected.
2. **Step 2 coordinates** — type `tembilahan` in origin, pick the gazetteer result; repeat for destination. Expect coordinates displayed as `[lat, lon]`. Edit the origin text again → the coordinate disappears and submit disables. Type gibberish → `Tidak ada hasil gazetteer…` and no fabricated point.
3. **Step 2 rit** — commodity, tonnage, SLA, baseline time, blocked delay; optionally pick a BPJT segment. Submit. Expect `Rit RIT-… (<plate>) tersimpan. Baseline Rp … • penghematan tercatat saat hasil aktual diisi.`
4. **ERP tab** — `Laporan` → `ERP Penghematan`. Expect the new rit with `Status = Direncanakan`, `Biaya Hemat = Rp 0`, `Efisiensi 0,0%`; KPI totals reflect one rit.
5. **Actuals** — `PATCH /api/v1/fleet/travels/{id}` (or the advanced section when creating) with `actual_time_hours` and `actual_fuel_liters`; reload ERP. Expect non-zero time/fuel deltas and a split whose four components equal `Biaya Hemat`.
6. **Hedging** — in the per-rit table press `Hitung`. Expect a policy (`CONTINUE`/`REROUTE`/`HOLD`) stored on the row; reload keeps it.
7. **Regulator view** — sign in as REGULATOR. Expect the `AGREGAT REGULATOR` badge, per-company table, **no** per-rit table, and the same aggregate totals.
8. **Legacy compat** — `GET /api/v1/fleet/trucks` must still list previously onboarded vehicles with `source = "legacy_custom_fleet"`; selecting one in Step 2 must create a rit successfully.
9. **Tenant isolation** — with a second dispatcher token/tenant, `GET /api/v1/fleet/travels` must not return the first tenant's rows; `GET /api/v1/erp/summary` totals must be zero/empty for the new tenant.

---

## 8. Not covered by this phase

- Supabase write-through / `sync_status` drain worker (rows are `pending` forever today).
- Actual toll segments in the wizard UI (the API accepts them; the form does not collect them).
- ERP auto-refresh after onboarding (`refreshKey` is not wired from `ReportsSection`).
- Per-tenant RLS predicates (migration policies are `USING (true)`).
- `GET /fleet/trucks/{id}` and `GET /fleet/travels/{id}` tenant checks.
- Playwright coverage of the wizard; live deployment verification.
- Replacing the static `CORRIDOR_EFFICIENCY_DATA` reference rows (the ERP ledger is now the authoritative money view, but the benchmark endpoint still serves planning figures).
