<!-- generated-by: gsd-doc-writer -->
# Phase 79 → Next Context Window — Handoff

**Status:** Phase 79 **COMPLETE** (Q1 small-city routing, Q2 regency-ID mismatch, Q3 loading + Batal, Q4 human names, Q5 legend/provenance).
**Branch:** `main`.
**Commit:** `docs(79): small-city routing, loading-cancel banner, human names + walkthrough and learnings` — contains 11 code files + the six Phase 79 documents, pushed to `origin/main`.
**Working tree expectation:** clean after the push (verify with `git status --porcelain`).

Read in this order:

1. `79-04-WALKTHROUGH.md` — what shipped, with file/line evidence and manual verification steps.
2. `79-05-LEARNINGS.md` — durable lessons, open concerns, constraints, environment.
3. `79-01-PLAN.md` … `79-03-PLAN.md` — per-question design rationale.

---

## 1. How to resume

```powershell
cd D:\College\Pidi.id
git checkout main
git pull origin main
git log --oneline -3            # expect the docs(79) commit at HEAD
git status --porcelain          # expect empty
```

Then pick the next milestone or start with the P1 items below.

**Verification baseline (must stay green):**

```powershell
cd frontend; npx tsc --noEmit -p tsconfig.json ; cd ..
python -m py_compile backend/app/adapters/cpu_routing_adapter.py
python -m pytest backend/tests/test_cpu_routing_weather.py -q   # 10 passed
```

**Deploy pair to test against:** frontend `https://pre-hub.vercel.app` (Vercel, standalone, no `vercel.json`) × backend `https://peta-nadi.onrender.com` (Render, cold 30–50 s). Local: `localhost:3000` / `localhost:8000`.

---

## 2. Pending work (in priority order)

### P1 — correctness / polish that users will notice

| # | Item | Where | Why / expected change |
|---|---|---|---|
| 1 | **HITL raw-ID nit** | `frontend/components/dashboard/DashboardClient.tsx` lines 1809–1812 (`handleSelectRoute`) | `origin_name`/`destination` still use `resolveNodeInfo(...)?.name \|\| selectedOriginNode`, so an unresolved endpoint sends `regency-159-indragiri-hilir` into `POST /approvals`. Replace with `formatNodeId(selectedOriginNode, originInfo)` / `formatNodeId(selectedDestNode, destInfo)` (both already memoized at ~line 795–803). |
| 2 | **`fitBounds` after routes** | `CrisisMap.tsx` (no `fitBounds` anywhere — verified by grep) | After a successful computation the map does not frame the corridor; the operator pans manually. Add a `map.fitBounds` on the route bbox (padding for the HUD/legend) guarded by a "user has not panned since route" flag so it never fights manual exploration. |
| 3 | **HUD ms vs wall time** | `TopNavTelemetry.tsx` (`Latensi Solver` pill/popover) + `DashboardClient.setRoutingInfo` | The HUD shows `compute_time_ms` (solver) or `< 15ms`; the actual HTTP request can be 30–50 s cold. Phase 79 only hides stale values during a request. Label the scope explicitly (e.g. `Solver` vs `Total`) and prefer `total_pipeline_time_ms` when present. Do **not** invent a synthetic end-to-end number. |
| 4 | **Surface `status: "no_route"`** | `DashboardClient.updateBaselineMapboxRoute` (routing-result block) | `api.routing.optimizeRouting` types `status` but nothing branches on it, so an explicit backend refusal is silently ignored. On `status === 'no_route'`: set `routingError` from `message`, clear routes, skip Mapbox computation (a `no_route` origin has no coords anyway, but the signal should be honored). |

### P2 — cleanup / contract hygiene

| # | Item | Where | Why |
|---|---|---|---|
| 5 | **Duplicate `customNodesRef.current = {}`** | `DashboardClient.tsx` lines 1015 and 1025 (both in `handleResetNodes`) | Merge artifact; delete the later duplicate. No behavior change. |
| 6 | **`_build_no_route_response` fallback name** | `backend/app/adapters/cpu_routing_adapter.py` lines ~550–560 | `origin_name or origin_id` echoes a raw ID when the caller sends no name. Acceptable for diagnostics, but prefer `pretty` server-side naming or return `None` and let the client format. Keep the raw ID inside `message` for debuggability. |
| 7 | **`/api/v1/geocode/nodes` enrichment** | `backend/app/routers/geocode_router.py` lines 42–61 | Returns `name: slug.title()`, no `display_name`/`kabupaten`/`kecamatan`. The frontend now merges around this (`mergeBackendGazetteerNode`), but the contract should carry the rich fields so new clients don't need the workaround. Additive change; keep `id/name/lat/lon/province/corridor/tier` for compatibility (`test_cross_workstream_integration.py` pins the endpoint). |
| 8 | **Proxy does not forward abort** | `frontend/app/api/proxy/[...path]/route.ts` lines 48–53 | `Batal` cancels the browser request but not the Render computation. Forward `req.signal` to the upstream `fetch` (and handle the resulting `AbortError`) so server work is actually reclaimed. Verify Vercel's edge runtime behavior before relying on it. |

### P3 — deliberate non-fixes / product decisions

| # | Item | Where | Note |
|---|---|---|---|
| 9 | **Modality ignored** | `frontend/lib/aiDynamicRouter.ts` `calculateAIDynamicDetourRoutes(_modality, ...)`; `Promise.all` at line 1731 | Intentional under the Q1 **always-show-all** decision: land + sea + air are always computed and visible; `selectedModality` filters the fleet layer, not the corridor set. If this ever changes, it needs a product decision + legend update — not a silent filter. Do not "fix" it by hiding corridors. |
| 10 | **Per-leg provenance badge** | `CrisisSimulatorBar.tsx` lines 136–146; `CrisisMap` route layer | The amber `SIMULASI/OFFLINE` badge is per route-set; a mixed set badges the whole bar. Individual polylines are not badged on the canvas. Consider a map label or per-leg style when mixed sets become common. |
| 11 | **Corridor toggles are per `corridor_type`** | `CrisisMap.tsx` lines 1162–1172 | A route with mixed land/sea legs is classified as one corridor class. Fine while every intermodal route has a single dominant class. |

### P0 — deployment (blocks verifying Phase 78 + 79 in production)

| # | Item | Where | Action |
|---|---|---|---|
| 12 | **Render redeploy with `OPENCODE_REASONING_EFFORT=low`** | `render.yaml` env block | Phase 78 set `OPENCODE_REASONING_EFFORT=low` in local `.env` only. `render.yaml` defines `OPENCODE_API_KEY` (sync:false), `OPENCODE_REASONING_MODEL=mimo-v2.6-pro`, `OPENCODE_DRIVER_MODEL=deepseek-v4.1-flash` — **no** `OPENCODE_REASONING_EFFORT`. Add the key (`value: "low"`) and redeploy, otherwise deployed reasoning models run at provider default and can exhaust the completion budget again (Phase 78 symptom: empty content → `reasoning_content` fallback). |

---

## 3. Verification checklist after any pending fix

| Check | Command / action | Pass condition |
|---|---|---|
| Types | `npx tsc --noEmit -p tsconfig.json` (in `frontend/`) | exit 0 |
| Python | `python -m py_compile backend/app/adapters/cpu_routing_adapter.py` | exit 0 |
| Routing unit tests | `python -m pytest backend/tests/test_cpu_routing_weather.py -q` | 10 passed |
| Small-city route | Tembilahan → Rengat on the deployed pair | corridor renders, labels human-readable, no cross-strait line |
| Cancel | Batal mid-flight on a cold backend | banner clears, toast `Perhitungan rute dibatalkan.`, no `SIMULASI/OFFLINE` polyline |
| No-route | `POST /api/v1/routing/optimize` with `origin_id: 'atlantis_kota'` | `status: "no_route"`, `routes: []`, message names the ID |
| Labels | DOM search for `regency-`, `node-`, `pin-` | zero visible matches |
| Legend | Toggle `Laut` OFF / `Semua ON` | sea corridors hide/restore; hidden count increments |
| Deployment | `GET https://peta-nadi.onrender.com/health` after redeploy | 200; env shows `OPENCODE_REASONING_EFFORT=low` |

---

## 4. Constraints to carry forward

1. **Always-show-all corridors (Q1).** Never filter corridor computation by modality. Legibility comes from legend, provenance, class-based stroke, and toggles.
2. **No silent returns in async route paths.** Every guard clause must clear downstream state and return an explicit result.
3. **No positional backend fallbacks.** Unknown endpoint + no coords → `no_route`, never first/last graph node.
4. **Remote data merges, never downgrades.** Field-level merge for gazetteer-style payloads.
5. **Latency claims carry their scope.** Solver-ms ≠ wall time; while loading show `...`.
6. **Deploy pair is fixed:** `pre-hub.vercel.app` × `peta-nadi.onrender.com`, CORS allowlist includes `localhost:3000`, no `vercel.json`.
7. **Abort must not fabricate geometry.** Any cancelled request must never fall through to an offline estimate.

---

## 5. One-paragraph summary for the next agent

Phase 79 fixed the "small cities don't route" complaint by stripping the `regency-<idx>-` render index before gazetteer matching and by deleting the backend's silent first/last-graph-node snap in favor of an explicit `no_route`. It replaced the 3-second toast with a persistent `RoutingStatusBanner` (elapsed seconds + cold-render hint + working Batal) backed by an `AbortController` threaded through `api.ts`, `aiDynamicRouter.ts`, and `mapboxRoutingService.ts`, with request-id staleness guards and abort-safe fallbacks. It centralized human labels in `lib/formatNode.ts` (name + kabupaten + province, slug pretty-printer as last resort) and prevented live `/geocode/nodes` data from downgrading the rich local gazetteer. Finally it added a corridor legend distinguishing direct land vs island ring, a `SIMULASI/OFFLINE` vs `LIVE` provenance badge, and per-modality visibility toggles wired into the map's `isCorridorVisible` filter. TypeScript, Python compile, and the 10 routing tests pass. Outstanding work is mostly polish and deployment hygiene: HITL raw-ID fallback, `fitBounds`, HUD ms scope, consuming `no_route`, `/nodes` enrichment, proxy abort forwarding, and the Render `OPENCODE_REASONING_EFFORT=low` gap.
