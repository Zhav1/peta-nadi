<!-- generated-by: gsd-doc-writer -->
# Phase 79: Small-City Routing, Loading/Cancel, Human Names — Learnings

**Scope:** durable lessons from Phase 79. Every entry is grounded in the working-tree code, `git show HEAD:` of the pre-fix files, or an executed command. Items that could not be verified are marked **unverified** rather than presented as conclusions.

---

## 1. Learnings

### 1.1 Indexed IDs silently break every lookup that assumes a stable key

- **Evidence:** `CrisisMap.tsx` (pre-fix line 1509) emits `regency-${idx}-${node.name.toLowerCase()...}`, e.g. `regency-159-indragiri-hilir`. `DashboardClient.resolveNodeInfo` (pre-fix 627–646) and `CrisisMap` endpoint resolution compared against `regency-${slug}`, `node-${slug}`, `name`, `display_name` — never `regency-<digits>-<slug>`.
- **Consequence:** every non-hub regency click failed resolution, even though the gazetteer entry existed with valid coordinates.
- **Lesson:** an ID that embeds a render index is a *display* key, not an *identity* key. Any cross-module matching must normalize explicitly (`normalizeRegencyId`), and the normalization must live next to the gazetteer, not be re-implemented per component. Keep the original ID for map/React keys; normalize only the lookup.
- **Residual risk:** the index depends on backend node ordering. If `/geocode/nodes` ordering changes between deploys, so does the ID — another reason lookups must be slug-based, never index-based.

### 1.2 Silent early return is a bug amplifier

- **Evidence:** pre-fix `updateBaselineMapboxRoute` began with `if (!originNode || !destNode) return;` — no toast, no banner, no state clearing.
- **Consequence:** the operator saw the *previous* corridor still drawn after selecting new endpoints, and concluded "small cities don't work" or "the map is lying". The actual failure (unresolvable ID) was invisible; the visible artifact was stale data.
- **Lesson:** a guard clause in an async pipeline must have a visible terminal state — clear downstream state, emit an error, and return an explicit result (`false`), so callers cannot toast success. Stale UI after a failed request is worse than an error message, because it looks like a valid answer.

### 1.3 A "helpful" backend fallback can fabricate geography

- **Evidence:** pre-fix `cpu_routing_adapter.py` lines 576 / 594: unknown origin without coords → `list(self.graph.nodes)[0]`; unknown destination → `list(self.graph.nodes)[-1]`. In the Pan-Sumatra graph that pair resolved to Belawan (Medan, north) → Bakauheni (Lampung, south).
- **Consequence:** a request for an unknown small town returned a plausible-looking, fully-costed route across the entire island and the Sunda Strait. Nothing in the payload said "I guessed".
- **Lesson:** never substitute a graph node for an unresolved endpoint. Return an explicit `status: "no_route"` with the offending ID. A visible refusal is strictly better than a confident wrong answer in an operational tool. Aliases (`belawan` → `belawan_port`) and coordinate snapping are legitimate; positional first/last-node picking is not.

### 1.4 Two TomTom fetches + proof context make "seconds" inevitable

- **Evidence:** `backend/app/routers/routing_router.py` `_fetch_proof_context()` calls `TomTomAdapter().fetch()` (line 43) on every `POST /routing/optimize` with `include_proof` (default `True`, line 125); the same module exposes `GET /api/v1/traffic/flow-segments` which calls `TomTomAdapter().fetch()` again (line 225). The dashboard polls corridor context (`api.traffic.flowSegments`, `api.ts` line 173–180) and separately requests route optimization.
- **Consequence:** a warm Render request still pays two independent TomTom round-trips (plus weather + news) before the CPU solver returns. That is the bulk of the seconds-scale wall time — not NetworkX.
- **Lesson:** latency budgets must account for enrichment fan-out, not just the solver. Cache/coalesce upstream adapter calls per request (or share one fetch between proof context and corridor context) before adding more proof sources.

### 1.5 Solver milliseconds and HTTP wall time are different numbers

- **Evidence:** `TopNavTelemetry` displays `compute_time_ms` (NetworkX/OR-Tools solver) with `< 15ms` as the fallback copy, next to a request that can take 30–50 s cold. `api.ts` types both `compute_time_ms` and `total_pipeline_time_ms`.
- **Consequence:** the HUD read "sub-detik" while the user waited half a minute. Both numbers were true; presenting them without labels made the product look broken.
- **Lesson:** label every latency with its scope ("solver", "end-to-end", "upstream"). While a request is in flight, show `...` — never the previous request's number. Phase 79 fixed the staleness; reconciling solver-ms against wall time remains open.

### 1.6 Live backend data can downgrade richer local data

- **Evidence:** `backend/app/routers/geocode_router.py` (lines 42–61) returns `name: slug.title()` and omits `display_name`, `kabupaten`, `kecamatan`. Pre-fix `fetchGazetteerNodes()` returned `res.nodes` verbatim whenever non-empty, discarding `PAN_SUMATRA_GAZETTEER`'s `display_name: 'Tembilahan (Kab. Indragiri Hilir)'`.
- **Consequence:** connecting the live backend made labels *worse* than offline mode — the opposite of the expected direction.
- **Lesson:** "prefer remote" is not a universal rule. When a remote payload is known to be a subset, merge field-by-field (remote wins where present, local backfills gaps) instead of replacing the object. Fix the backend contract too, but never let the frontend depend on it being fixed.

### 1.7 Always-show-all is correct only with an explanatory legend

- **Evidence:** Q1's decision keeps land + sea + air computed and visible on every request (`aiDynamicRouter.ts` `Promise.all` at 1731), while `_modality` is unused. Pre-fix there was no legend entry distinguishing direct land from island ring, and no provenance badge.
- **Consequence:** a landlocked Tembilahan → Rengat request rendered a sea ring through distant ports with the same visual weight as the direct road. To an operator that reads as a routing bug, not as a comparison feature.
- **Lesson:** if the product shows all corridors, it must also explain *why they differ* — class (direct vs ring), provenance (`LIVE` vs `SIMULASI/OFFLINE`), and a way to subtract noise (toggles). "Always show" without a legend is indistinguishable from "wrong".

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **Cancel is client-side only.** `frontend/app/api/proxy/[...path]/route.ts` forwards method/headers/body but no `AbortSignal`; Render keeps computing after the browser cancels. User-visible result is correct; server CPU is not reclaimed. | `route.ts` lines 48–53 (`fetch(targetUrl, { method, headers, body })`) |
| 2 | **`no_route` is not consumed.** `api.routing.optimizeRouting` types `status` (api.ts line 194) but `DashboardClient` only reads `optimization_summary`; an explicit backend refusal is currently ignored rather than surfaced. | `DashboardClient` `updateBaselineMapboxRoute` routing-result block |
| 3 | **Corridor toggles are per-`corridor_type`, not per-leg.** `isCorridorVisible` keys off `r.corridor_type`; a route object whose legs mix land and sea is filtered as one class. | `CrisisMap.tsx` lines 1162–1172 |
| 4 | **Provenance badge is per route-set.** One offline route in a mixed set forces the amber `SIMULASI/OFFLINE` badge for the whole bar; individual polylines are not badged on the canvas. | `CrisisSimulatorBar.tsx` lines 136–146 |
| 5 | **Duplicate `customNodesRef.current = {}`** in `handleResetNodes` (lines 1015 and 1025) — harmless but indicates a merge artifact. | `DashboardClient.tsx` |
| 6 | **HITL still sends raw IDs on one path.** `handleSelectRoute` builds `origin_name`/`destination` with `resolveNodeInfo(...)?.name \|\| selectedOriginNode` (lines 1809–1812), bypassing `formatNodeId`. | `DashboardClient.tsx` |
| 7 | **No `fitBounds`** after routes arrive; the operator must pan manually to find the corridor. | grep for `fitBounds` returns no hits |
| 8 | **`_build_no_route_response` echoes the raw ID as the name** when `origin_name` is absent (`origin_name or origin_id`), so a `no_route` message can still contain `atlantis_kota`-style tokens. Intentional for diagnosability, but a display-format pass is pending. | `cpu_routing_adapter.py` lines 550–560 |
| 9 | **`mergeBackendGazetteerNode` heuristics** match on five slug forms; a backend node with a novel name and no local entry passes through un-enriched (degraded label, not broken routing). | `mapboxRoutingService.ts` lines 424–459 |
| 10 | **Pydantic v1-style `Config`** still triggers a deprecation warning in test output. | `backend/app/config.py` line 6 |

---

## 3. Constraints (hard boundaries this phase worked within)

| Constraint | Evidence | How it shaped the implementation |
|---|---|---|
| **Q1 decision: always-show-all corridors** | `aiDynamicRouter.calculateAIDynamicDetourRoutes` computes land + sea + air unconditionally (`Promise.all`, line 1731); `_modality` intentionally unused | No modality-based filtering was introduced. Legibility handled via legend, class-based stroke width, provenance badge, and visibility toggles. Modality remains a fleet/visual filter. |
| **Frontend deploy: `https://pre-hub.vercel.app`, standalone Next output, no `vercel.json`** | No `vercel.json` anywhere in the repo; `next.config.mjs` `output: 'standalone'` (referenced in Phase 57 learnings) | All changes stay in application code — no rewrites/headers added, no new env vars required, no build-config change. The `/api/proxy` route is the only server-side surface touched, and it was not modified. |
| **Backend deploy: `https://peta-nadi.onrender.com`** | `frontend/lib/api.ts` default base URL; `proxy/route.ts` default; `render.yaml` | Manual verification steps target the deployed pair. Cold start (30–50 s) is treated as a product fact requiring a persistent banner, not as a bug to hide. |
| **CORS allowlist is explicit** | `render.yaml` `CORS_ORIGINS: "https://pre-hub.vercel.app,https://peta-nadi.onrender.com,http://localhost:3000"`; `backend/app/config.py` | No new origin was introduced. Local dev remains `:3000` (frontend) → `:8000` (backend) through the proxy fallback path. |
| **`OPENCODE_REASONING_EFFORT` gap** | `render.yaml` defines `OPENCODE_API_KEY` (sync:false), `OPENCODE_REASONING_MODEL=mimo-v2.6-pro`, `OPENCODE_DRIVER_MODEL=deepseek-v4.1-flash` — **no** `OPENCODE_REASONING_EFFORT` key | Phase 78's local `OPENCODE_REASONING_EFFORT=low` is not in the deployed environment. Any deployed LLM behavior still runs at provider default; redeploy with `EFFORT=low` is outstanding. |
| **No backend schema/API contract break** | Existing tests (`test_cross_workstream_integration.py` pins `/api/v1/geocode/nodes`) | `/geocode/nodes` was **not** changed; enrichment was done client-side. `no_route` is additive (new `status` value, empty `routes`). |
| **Windows dev shell, LF/CRLF mixed** | Phase 77 learning 1.3 (probe script still CRLF in working tree) | No shell scripts touched. Python compile + tsc + pytest used as gates. |

---

## 4. Environment context (for the next window)

| Component | Value |
|---|---|
| Frontend (prod) | `https://pre-hub.vercel.app` — Vercel, Next.js `output: 'standalone'`, no `vercel.json` |
| Frontend (local) | `http://localhost:3000` |
| Backend (prod) | `https://peta-nadi.onrender.com` — Render, free-tier cold start 30–50 s, warm seconds |
| Backend (local) | `http://localhost:8000` |
| Proxy | `frontend/app/api/proxy/[...path]/route.ts` → `x-target-base-url` → `NEXT_PUBLIC_API_URL` → `https://peta-nadi.onrender.com`; legacy `prehub-backend.onrender.com` rewritten |
| CORS | `https://pre-hub.vercel.app`, `https://peta-nadi.onrender.com`, `http://localhost:3000` |
| LLM env | `OPENCODE_REASONING_MODEL=mimo-v2.6-pro`, `OPENCODE_DRIVER_MODEL=deepseek-v4.1-flash`; `OPENCODE_REASONING_EFFORT` **absent** from `render.yaml` |
| Roles | GUEST (sandbox, zero POST), REGULATOR (HOLD advisory), DISPATCHER (`approvals:write`, `fleet:write`, `routes:plan`) |

---

## 5. Actions performed (evidence)

- `npx tsc --noEmit -p tsconfig.json` (in `frontend/`) → exit 0.
- `python -m py_compile backend/app/adapters/cpu_routing_adapter.py` → exit 0.
- `python -m pytest backend/tests/test_cpu_routing_weather.py -q` → `10 passed, 1 warning in 24.03s`.
- `git status --porcelain` → exactly 11 entries (9 modified, 2 untracked) before these documents were added.

**Not verified in this window:** Playwright e2e, live calls against `pre-hub.vercel.app` / `peta-nadi.onrender.com`, Render redeploy, and any measurement of actual cold-start duration. Claims based on those remain **unverified**.
