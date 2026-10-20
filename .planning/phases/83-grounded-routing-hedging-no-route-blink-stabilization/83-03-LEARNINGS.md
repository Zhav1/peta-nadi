<!-- generated-by: gsd-doc-writer -->
# Phase 83: Grounded Routing Hedging, no_route Honesty, HITL SIMULASI Gate — Learnings

**Scope:** durable lessons from this window. Every entry is grounded in a committed diff (`git show` of `c5d2e9d/c53261e/f5e032d/b4dee0e`), a file read with line numbers, or a command executed this window with its output. No assumptions.

---

## 1. Learnings

### 1.1 A relative path that exists locally can point at nothing in Docker

- **Evidence:** pre-fix `cpu_routing_adapter.py` hard-coded `../../../data/road_network_sumatra.json`. In the Render image (`backend/` → `/app`, `data/` → `/app/data`) that resolves to `/data` — missing — so the adapter booted an **empty graph**: every hub-ID `solve-path` returned `no_route` while coords calls silently fell back to straight lines. Fix: `_resolve_road_cache_path` (`cpu_routing_adapter.py:17-45`), first-existing-wins with `/app/data/road_network_sumatra.json` as a candidate, never raises.
- **Proof it worked:** live `POST /api/v1/routing/solve-path {belawan_port → tebing_tinggi}` now returns `status: success` with 3 routes and snapped nodes `belawan_port` (98.6776, 3.7922) → `tebing_tinggi_toll` (99.1625, 3.3285).
- **Lesson:** path resolution that depends on checkout layout must enumerate every deployment layout explicitly and fail open to the next candidate — never to an empty dataset. An empty graph that still returns 200 (`no_route`) is worse than a crash: it looks like a data fact ("no road") when it is a packaging fact ("no file").

### 1.2 Optional economics in, honest null out — grounded by construction

- **Evidence:** `routing_router.py:242-251` adds commodity fields as `Optional`; `_enrich_routes_with_hedging` (`:301-343`) returns early without `commodity`, enriches only detours, and wraps everything in try/except that logs and leaves hedging absent. Live proof: without commodity → no hedging keys; with `{beras, 10 t, GOL_II, biosolar}` → hedging `[False, True, True]` with detour `optimal_policy: REROUTE`. Suite: `test_routing_hedging.py` 2 passed (20.03 s); bundle with travels/geocode/fleet 35 passed (22.83 s); `tsc` exit 0.
- **Lesson:** the same pattern as Phase 82's rupiah honesty (missing ⇒ `Belum tersedia`, never a default that looks like data) applied to an enrichment path: gate on the presence of inputs, keep every output field optional (`types.ts` hedging block), and make the enricher total (never raises). The test that pins it is the no-commodity case, not the happy path.

### 1.3 `no_route` is a message, not an empty map

- **Evidence:** `DashboardClient.tsx:919-933` — the `nested?.status === 'no_route'` guard converts a backend status the old client ignored into: the backend's message (or `Rute tidak ditemukan…`), cleared routes/selection/routing info, and an error toast, with early `return false` so no stale corridor persists.
- **Lesson:** every backend status variant needs a client branch. An unhandled status does not read as "loading" — it reads as a blank product. Enumerate the status union at the call site when the API gains one.

### 1.4 Provenance must be visible before approval, not just in the payload

- **Evidence:** `MitigationTab.tsx:68-90` (`isSimulatedRoute`: SIMULASI/OFFLINE text, `offline-interpolated` source, or missing `safety_status`) + `:155-161` (`hitlBlocked`, `approveLocked` with hold-staging and GUEST-sandbox exemptions) + handler guard `:814-821` that returns early without POST. Amber `SIMULASI/OFFLINE` vs cyan `LIVE` badges; success copy corrected from `DISETUJUI & DIKIRIM` to `Tercatat sebagai HITL pending — belum dikirim ke armada` (`:66,466,857`).
- **Lesson:** a safety property that lives only in data (`safety_status`, `source`) is invisible at decision time. The gate works because it combines three independent signals (name/source/grounding) with evidence (news/OSINT/proof) at both render time (disabled buttons + copy) and action time (no POST). Either layer alone would be bypassable — the modal override path needed its own check (`:196`).

### 1.5 Blink is redundant writes, not slow renders — dedupe by hash, quantize the rest

- **Evidence:** `FleetVehicleLayer.tsx:475-516` skips Deck `setProps` when vehicle hash + selection key + quantized pulse step + zoom bucket are unchanged (static ~10 s polls become no-ops); `CrisisMap.tsx:1258-1296` rewrites route/congestion/ETA sources only when `routeWriteHash` flips, and `activeFleet` left the effect deps (`:1740-1742`); pulse quantized to 4 steps (`:758`); elapsed timer 250 ms → 1000 ms (`DashboardClient.tsx:744`); `routingInfo` passthrough instead of null-while-loading (`:2670,:2687`).
- **Lesson:** when the data source polls faster than the data changes, the fix is change detection at the write boundary, not memoization of the render. Quantize animation phases so the dedupe key is stable between meaningful frames — a continuous phase defeats any hash.

### 1.6 Parallel same-tree agents must split by file, stash nothing shared, commit nothing foreign

- **Evidence:** `git status --porcelain` shows 17 dirty files belonging to the concurrent FIRMS/news session; our four commits contain only our files (`git show --stat` per SHA); foreign hunks in our four frontend files were reverted rather than committed; `stash@{0}` (`WIP on main: c53261e`, 5 files, zero FIRMS refs) was retained untouched. No commit or push performed by this session.
- **Lesson:** with two agents on one tree, the unit of safety is the hunk, not the file — `routing_router.py` carries both our committed hedging code and their uncommitted `/fire/hotspots` addition, and only `git diff` per-hunk discipline keeps them separable. A stash created mid-split is indistinguishable from work-in-progress: never drop or apply a stash you did not create; verify with `git stash show -p | grep` before touching it.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **RLS still `USING (true)`** on `truck_assets`/`travels`; tenant isolation is router-filter only. | Phase 82 migration 014; unchanged this window |
| 2 | **Supabase provisioned but unwritten** — all ledger writes go to instance-local SQLite; `sync_status='pending'` has no drain; Render disk is ephemeral. | Phase 82 learnings 1.4; unchanged this window |
| 3 | **Actual toll defaults to zero** on recorded trips (`actual_segments = []` when `None`), overstating toll savings; wizard collects no actual toll segments. | `travel_ledger_service.py:214-218`; `FleetOnboardingModal.tsx:1111-1152` |
| 4 | **`[0,0]` coordinate defaults** remain in migration 014. | `014_*.sql` lines 66, 69 |
| 5 | **Cold starts (30–77 s) exceed the 20 s client timeout** — first-hit probes fail while warm instances pass. Retry-after-warm is procedure, not code. | Window-observed; re-prove: warm `/health` first (§7 of walkthrough) |
| 6 | **Playwright harness still frontend-only** — no backend `webServer`, no JWT seed, no cold-start-tolerant timeouts; wizard/hedging specs would test the degraded offline path. | `frontend/playwright.config.ts` single `webServer`; no spec asserts Step 1→2 or hedging |
| 7 | **Stash hazard:** `stash@{0}` duplicates committed hunks; a future `stash pop` after tree drift will conflict or double-apply. Owner (parallel session) should drop it once confirmed. | `git stash list` + `git stash show -p` (5 files, mirrors `f5e032d`/`b4dee0e` hunks) |
| 8 | **Detour hedging inherits baseline quality** — if route[0] is itself an interpolation, detour deltas are relative to a weak reference. Display-side SIMULASI badges/gate are the current mitigation. | `_enrich_routes_with_hedging` derives detour deltas from `routes[0]` distance/ETA |

---

## 3. Constraints (hard boundaries this window worked within)

| Constraint | Evidence | Effect |
|---|---|---|
| **No-commit of foreign files** | 17 dirty FIRMS/news files left untouched; our SHAs contain only our files | Splits done by revert-then-commit, never by including foreign hunks |
| **One-unit-per-subagent, no interim updates** | Four commits, each one reviewable unit (P0/P1, P2+stabilizers, Docker fix+merge, HITL+types+dedupe) | No partial pushes; walkthrough written after all units landed |
| **Honest-null economics** | Optional payload fields; optional hedging types; never-raise enricher | No invented rupiah anywhere on the new path |
| **HOLD always allowed; GUEST sandbox unlocked** | `approveLocked = hitlBlocked && !isHoldStaging && role !== 'GUEST'` | Gate blocks only real Approve/Reroute writes |
| **No new secrets in yaml** | `OPENCODE_REASONING_EFFORT: "low"` is a plain value; keys stay `sync: false` | Deploy config change is value-only |
| **Vercel build-time env inlining** | `pk.eyJ…` bundled in JS chunks (window-observed) | Client must treat the token as public-by-design; rotation means rebuild |

---

## 4. Environment context (for the next window)

| Component | Value |
|---|---|
| Live pair | `https://pre-hub.vercel.app` (frontend) × `https://peta-nadi.onrender.com` (backend, Render Docker, region Singapore, free plan) |
| Local pair | `http://localhost:3000` × `http://localhost:8000` |
| Road cache | `/app/data/road_network_sumatra.json` live (via `_resolve_road_cache_path`); `PREHUB_DB_PATH=/app/data/prehub_local.db` (ephemeral on redeploy) |
| CORS | `CORS_ORIGINS=https://pre-hub.vercel.app,https://peta-nadi.onrender.com,http://localhost:3000` |
| Verified live this window | `/health` 200; hub-ID `solve-path` success + 3 routes; hedging `[False,True,True]`; geocode `padang` exact-first of 7 |
| Test env | Python 3.13, Pydantic 2.13 (v1-style `Config` deprecation warnings), `tsc` exit 0, 35-test bundle green |

---

## 5. Actions performed (evidence)

- `python -m pytest backend/tests/test_routing_hedging.py -q` → **2 passed**, 4 warnings, 20.03 s.
- `python -m pytest backend/tests/test_routing_hedging.py backend/tests/test_travels_erp.py backend/tests/test_geocode_search.py backend/tests/test_fleet_ingest.py -q` → **35 passed**, 7 warnings, 22.83 s.
- `npx tsc --noEmit -p tsconfig.json` in `frontend/` → **exit 0**.
- `GET https://peta-nadi.onrender.com/health` → 200 `{"status":"ok","version":"0.1.0",…}`.
- `POST …/routing/solve-path {belawan_port → tebing_tinggi, k=3}` → success, 3 routes, snapped `belawan_port`/`tebing_tinggi_toll` with coords.
- Same + commodity block → hedging `idx0 False / idx1 True REROUTE / idx2 True REROUTE`.
- `GET …/geocode/search?q=padang` → 7 results, exact `Padang` first (−0.9471, 100.4172).
- `git show --stat` on `c5d2e9d/c53261e/f5e032d/b4dee0e` → only our files; `git status --porcelain` → 17 foreign dirty files untouched; `git stash list` → 1 retained entry.

**Not executed:** applying migration 014, Supabase write path, Render redeploy, Playwright runs, Vercel 982-chunk content grep (landing HTML lacks the route-lazy chunk — fetch via dashboard chunk manifest per walkthrough §7.4).
