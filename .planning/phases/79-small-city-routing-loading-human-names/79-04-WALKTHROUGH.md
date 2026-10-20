<!-- generated-by: gsd-doc-writer -->
# Phase 79: Small-City Routing, Loading/Cancel Banner, Human Names — Walkthrough

**Purpose:** implementation record for Phase 79 (Q1 small-city routing, Q2 regency-ID mismatch, Q3 loading + Batal, Q4 human names, Q5 legend/provenance). Every claim below was verified by direct file reads of the working tree; line numbers are current working-tree lines.

**Commit shape:** Phase 79 lands as one commit — `docs(79): small-city routing, loading-cancel banner, human names + walkthrough and learnings` — containing the 9 modified + 2 new code files plus these six documents.

---

## 1. Files changed (11)

| # | File | Status | What changed |
|---|---|---|---|
| 1 | `backend/app/adapters/cpu_routing_adapter.py` | modified | `_build_no_route_response` (line 538); explicit no-route return on unknown origin (614) and destination (646) replaces the first/last-graph-node snap |
| 2 | `frontend/components/dashboard/DashboardClient.tsx` | modified | `resolveNodeInfo` requires/uses normalized IDs + returns display metadata; `updateBaselineMapboxRoute` is abortable, stale-guarded, and no longer silently returns; `RoutingStatusBanner` mount; corridor visibility state; legend block |
| 3 | `frontend/components/dashboard/TopNavTelemetry.tsx` | modified | `isRoutingLoading` prop; `RUTE: ...` and popover `Menghitung rute...` instead of stale/`< 15ms` |
| 4 | `frontend/components/demo/GuidedDemoPanel.tsx` | modified | `HUB_NODES` → `formatNodeId`; step text + endpoint cards use human labels |
| 5 | `frontend/components/map/CrisisMap.tsx` | modified | `normalizeRegencyId` on endpoint matching (1353, 1398); `formatNodeDisplay`/`prettyNodeSlug` labels (792–798, 1346, 1391, 1564); `corridorClass`/`isDirectLand`/`isIslandRing` props; 6.5 px direct-land stroke case (552); `isCorridorVisible` filter (1162–1172) |
| 6 | `frontend/components/map/CrisisSimulatorBar.tsx` | modified | `originInfo`/`destInfo` props; human names + province row (127–139); LIVE vs `SIMULASI/OFFLINE` provenance badge (141–146); `Darat/Laut/Udara` toggle grid (147–176, 281) |
| 7 | `frontend/lib/aiDynamicRouter.ts` | modified | `throwIfAborted` (818); `signal` threaded through every Mapbox/sea/air leg; abort rethrown from every catch; no offline polyline after cancel |
| 8 | `frontend/lib/api.ts` | modified | `request()` accepts `signal`, never proxy-falls-back after abort, throws `AbortError`; `optimizeRouting(payload, signal?)` (192) |
| 9 | `frontend/lib/mapboxRoutingService.ts` | modified | `normalizeRegencyId` (414); `mergeBackendGazetteerNode` (424); `fetchGazetteerNodes` merges instead of overwriting (465); `fetchMapboxDirections(..., signal?)` (574) |
| 10 | `frontend/components/dashboard/RoutingStatusBanner.tsx` | **new** | Persistent loading banner (spinner, elapsed seconds, cold-render hint at ≥10 s, **Batal**) + dismissible error banner |
| 11 | `frontend/lib/formatNode.ts` | **new** | `NodeDisplayInfo`, `prettyNodeSlug`, `formatNodeDisplay`, `resolveNodeDisplayInfo`, `formatNodeId` |

---

## 2. What each fix actually does

### Q1 / Q2 — small-city routing (`regency-159-...` mismatch)

1. `CrisisMap` emits regency feature ids as `regency-${idx}-${slug}`; `normalizeRegencyId` strips `regency-<digits>-` **only for lookup**, keeping the original id as the map/React key.
2. `DashboardClient.resolveNodeInfo` applies the same normalization against `PAN_SUMATRA_GAZETTEER`, so Tembilahan / Rengat / any regency with a coords entry now resolves instead of returning `null`.
3. If resolution still fails, the route pipeline **refuses explicitly**: clears stale routes, sets `routingError`, toasts `Rute tidak ditemukan`, returns `false`. `handleNodeSelected` only shows the success toast when routes were applied.
4. Backend: unknown ID + no coords → `{ status: "no_route", routes: [], routes_count: 0 }` with a message naming the ID. `belawan` → `belawan_port` alias still resolves; `origin_coords` still wins when supplied.

### Q3 — loading + Batal

- `RoutingStatusBanner` renders for the entire request (not 3 s), shows elapsed seconds, and switches its hint to `render dingin bisa 30-50 detik` after 10 s.
- **Batal** → `handleCancelRouting`: abort controller, invalidate request id, clear banner/error/latency/routes, toast `Perhitungan rute dibatalkan.`, keep endpoints.
- Signal flows `api.request` → `optimizeRouting` → `calculateAIDynamicDetourRoutes` → land/sea/air legs. Abort is detected before any proxy fallback and before any `fallbackHighwayRoute` / `SIMULASI/OFFLINE` result.
- `routeCalculationReqIdRef` comparisons guard **every** state write; `routingInFlightKeyRef` de-dupes the handler/effect double-invocation so a click cannot abort itself.
- HUD: `routingInfo` is nulled at request start and `isRoutingLoading` forces `...`, so solver-ms never masquerades as the current request's latency.

### Q4 — human names

`formatNode.ts` centralizes: hub → gazetteer (normalized) → custom pin → pretty slug. `formatNodeDisplay` is duplicate-safe (`Tembilahan (Kab. Indragiri Hilir)` does not become `..., Indragiri Hilir, Riau`). Backend `/geocode/nodes` returns `slug.title()` names and no `display_name`/`kabupaten`; `mergeBackendGazetteerNode` backfills those fields from the local gazetteer instead of letting the live response downgrade labels.

### Q5 — legend + toggles

Legend gains `KORIDOR LANGSUNG VS RING PULAU` with emerald/sky/cyan swatches, an amber `SIMULASI/OFFLINE` badge, and a `Darat/Laut/Udara` visibility grid plus `Semua ON`. The simulator bar carries the same toggle grid and a provenance badge derived from the route payload text (`SIMULASI/OFFLINE` vs `LIVE`) — never self-declared. The map filters by `corridor_type` through `isCorridorVisible` and draws direct-land corridors 6.5 px vs 5 px for island-ring legs.

---

## 3. Automated verification (executed in this window)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.json` in `frontend/` | **exit 0**, no diagnostics |
| Python compile | `python -m py_compile backend/app/adapters/cpu_routing_adapter.py` | **exit 0** |
| Routing tests | `python -m pytest backend/tests/test_cpu_routing_weather.py -q` | **10 passed**, 1 Pydantic deprecation warning (`backend/app/config.py` class-based `Config`) |

No other test suite was run; Playwright e2e was not executed in this window.

---

## 4. Manual verification — deployed pair

**Environment under test:**

| Role | URL |
|---|---|
| Frontend | `https://pre-hub.vercel.app` (Vercel, standalone Next output; **no `vercel.json` in the repo**) |
| Backend | `https://peta-nadi.onrender.com` (Render; free-tier cold start 30–50 s, warm seconds) |
| Frontend proxy | `/api/proxy/*` → `NEXT_PUBLIC_API_URL` or default `https://peta-nadi.onrender.com`, with a legacy rewrite from `prehub-backend.onrender.com` |
| Local | frontend `localhost:3000`, backend `localhost:8000` |

> These steps require the Phase 79 commit to be deployed (Vercel auto-builds on push; Render redeploys the backend image). They were **not** run against production in this window.

### 4.1 Small-city routing (Tembilahan → Rengat)

1. Open `https://pre-hub.vercel.app`, sign in as DISPATCHER (or observe in guest sandbox).
2. Wait for the backend to warm: open DevTools → Network is not required; the first route request may take 30–50 s. Optionally hit `https://peta-nadi.onrender.com/health` first.
3. Click the **Tembilahan** marker (Indragiri Hilir, Riau), then **Rengat** (Indragiri Hulu, Riau).
4. **Expected:**
   - Banner: `Menghitung rute...` with an advancing seconds counter (and the cold-render hint if it exceeds 10 s).
   - Simulator bar reads `Tembilahan (Kab. Indragiri Hilir) → Rengat (Kab. Indragiri Hulu)` — **no** `regency-`.
   - Land corridor renders; sea/air island-ring corridors render in sky/cyan if the backend returns them.
   - Landscape orientation is sensible (Sumatra east coast, short hop) — **not** a Belawan → Bakauheni cross-strait line.
5. Select a third marker to move the destination; confirm the previous corridors clear immediately and the new ones replace them.

### 4.2 Explicit no-route (no silent snap)

1. In DevTools console on the Vercel origin:
   ```js
   await fetch('/api/proxy/api/v1/routing/optimize', {
     method: 'POST',
     headers: { 'content-type': 'application/json' },
     body: JSON.stringify({ origin_id: 'atlantis_kota', dest_id: 'belawan', fleet_size: 3 })
   }).then(r => r.json()).then(console.log);
   ```
2. **Expected:** `status: "no_route"`, `routes_count: 0`, `routes: []`, message containing `'atlantis_kota'` and `Fallback ke node graph pertama dinonaktifkan`.
3. Repeat with `origin_id: 'belawan'`, `dest_id: 'bakauheni'` — **expected:** a normal routed result (aliases still work), not `no_route`.

### 4.3 Batal (cancel) behavior

1. Clear the node selection (reset), then select Tembilahan → Rengat on a **cold** backend (wait ~15 min idle, or use a pair that triggers a cold start).
2. As soon as the banner appears, press **Batal**.
3. **Expected:**
   - Banner disappears immediately.
   - Toast: `Perhitungan rute dibatalkan.`
   - No new corridor appears afterwards; no `SIMULASI/OFFLINE` straight line is drawn by the cancelled request.
   - HUD returns to its idle value (`...` disappears; a stale ms value is never shown).
4. Repeat, but this time immediately select a different destination after cancelling — the new request must complete normally and must not be cancelled by the old one's teardown.

### 4.4 Label audit (Q4)

1. Select a **hub** (e.g. Pelabuhan Belawan) → label is the hub name.
2. Select a **regency** (e.g. Indragiri Hilir) → label is `Tembilahan (Kab. Indragiri Hilir), Riau` on detail surfaces, with no duplicate kabupaten/province.
3. Drop a **custom pin** on the map → label is `Titik <lat>, <lon>` (or the pin name), never `pin-...`.
4. Open the guided demo panel (`Panduan`) → step text and both endpoint cards show the same human labels.
5. Grep the rendered DOM (Elements → Ctrl-F) for `regency-`, `node-`, `pin-` — **expected:** zero matches in visible text.

### 4.5 Legend + toggles (Q5)

1. With corridors on screen, open the map legend → `KORIDOR LANGSUNG VS RING PULAU` block is present; badge reflects the route set (amber if any route description contains `SIMULASI/OFFLINE`, emerald `LIVE` otherwise).
2. Toggle **Laut** OFF → sea legs disappear, land/air remain; `hiddenRouteCount` badge increments; `Semua ON` restores everything.
3. Toggle all three OFF → map has no corridors but endpoints/hazard stay; `Tampilkan Semua Rute` restores.
4. Confirm the simulator bar's `TITIK RUTE KORIDOR` popover shows the same labels, the province row, and the same toggles.

---

## 5. Not covered by this phase

- `fitBounds` after a successful route (map does not auto-frame the corridor).
- `status: "no_route"` is typed but not branched on in `updateBaselineMapboxRoute` — the frontend's visible failure currently comes from missing coords / empty routes.
- Solver-ms vs HTTP wall-time reconciliation in the HUD.
- Backend `/geocode/nodes` enrichment (`display_name`, `kabupaten`, `kecamatan`, real names) — currently compensated client-side by the merge.
- Render `OPENCODE_REASONING_EFFORT` environment parity.
