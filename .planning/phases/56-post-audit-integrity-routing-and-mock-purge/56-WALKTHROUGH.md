# Phase 56: Post-Audit Integrity Routing & Mock Purge — Technical Walkthrough

**Purpose:** the complete, evidence-grade breakdown of the five work packages implemented in this phase, with exact file:line anchors, before/after contrasts, and the verification ledger. This document is the implementation record for `56-PLAN.md` (decisions D1–D5).

**Evidence sources:**
- `git diff` archaeology on the uncommitted Phase 56 working tree (23 modified files, 2 new files, +1191/−384 lines).
- Direct file reads of every modified module (the workspace content-search tool returned empty results for strings verifiably present in files — see `56-ENVIRONMENT-FIXES-AND-PITFALLS.md` §3 — so every line anchor below was confirmed by reading the files end-to-end).
- Live verification runs: backend `pytest`, Next.js production build, Playwright headless spec run.

**Decision register (from `56-PLAN.md`):**

| ID | Decision |
|---|---|
| D1 | Flood radius toggle `[5, 8, 15]` km, default 8 |
| D2 | `exclude=toll` only if hazard is within radius+2 km of a toll/interchange node; retry without it on NoRoute |
| D3 | Keep `FALLBACK_FLEET`, but only behind an explicit "Mode Simulasi" badge/toggle (default off shows honest empty/loading) |
| D4 | Demo stage 4 opens Economic; approve/dispatch CTA opens Mitigation; no timers |
| D5 | `/spikes` = % change vs 30-day baseline, min-records guard, honest `[]` if insufficient |

---

## WP1 — Anti-Collision Map Dock Layout (1366×768 responsive math)

### Problem

At 1366×768 (the most common laptop viewport), three bottom-docked UI elements collided:

1. The **time-scope footer** (`DashboardClient.tsx`) and the **CrisisSimulatorBar** pill row each carried their own hand-rolled 4-branch ternary (`lg:left-[calc(50%-30px)]` / `lg:left-[calc(50%+160px)]` / `lg:left-[calc(50%-190px)]` / `lg:left-1/2`) that never accounted for *both* the 320 px left sidebar and the 424 px crisis drawer being open simultaneously.
2. `GuidedDemoPanel.tsx` offset itself with `right-[408px]` while the crisis drawer is actually **424 px** wide — a 16 px overlap.

### Implementation

**New file `frontend/components/dashboard/mapDockLayout.ts` (21 lines)** — the single source of truth for map dock geometry:

```ts
const MAP_DOCK_CLASSES = {
  sidebarAndDrawer: 'lg:left-[calc((100vw-424px+320px)/2)] max-w-[calc(100vw-460px)] lg:max-w-[calc(100vw-424px-320px-48px)]',
  sidebarOnly:      'lg:left-[calc((100vw+320px)/2)] lg:max-w-[calc(100vw-320px-48px)]',
  drawerOnly:       'lg:left-[calc((100vw-424px)/2)] max-w-[calc(100vw-460px)]',
  mapOnly:          'lg:left-1/2',
} as const;

export function resolveMapDockClasses({ isLeftSidebarCollapsed, isCrisisDrawerOpen }: MapDockLayoutInput): string
```

The responsive math: the content region between the 320 px sidebar and the 424 px drawer spans `[320px, 100vw−424px]`, so its center is `(100vw − 424px + 320px) / 2`. The `max-w` caps reserve 48 px (24 px per side) so the dock never touches the sidebar or drawer edges — the ≥24 px gap the plan required.

**Files modified:**

| File | Lines | Change |
|---|---|---|
| `frontend/components/dashboard/mapDockLayout.ts` | 1–21 (new) | `MapDockLayoutInput` interface (L1–4), `MAP_DOCK_CLASSES` (L6–11), `resolveMapDockClasses()` (L13–20) |
| `frontend/components/dashboard/DashboardClient.tsx` | L42 | import `resolveMapDockClasses` |
| `frontend/components/dashboard/DashboardClient.tsx` | L1264–1265 | `const isCrisisDrawerOpen = isSidebarOpen && !!selectedCrisis; const footerDockClass = resolveMapDockClasses({ isLeftSidebarCollapsed, isCrisisDrawerOpen });` |
| `frontend/components/dashboard/DashboardClient.tsx` | L1901 | footer className: 4-branch ternary → `${footerDockClass}` |
| `frontend/components/map/CrisisSimulatorBar.tsx` | L27 | import `resolveMapDockClasses` |
| `frontend/components/map/CrisisSimulatorBar.tsx` | L116–122 | `dockPositionClass = resolveMapDockClasses({...})`; `pillsRowClass` gains `flex-wrap justify-center` when the drawer is open so pills wrap instead of overflowing |
| `frontend/components/map/CrisisSimulatorBar.tsx` | L127 | container className: 4-branch ternary → `${dockPositionClass}` |
| `frontend/components/demo/GuidedDemoPanel.tsx` | L141 | `right-[408px]` → `right-[424px]` (matches the real drawer width) |

**Before/after contrast (`DashboardClient.tsx` L1901):**

```diff
- <footer className={`... ${!isLeftSidebarCollapsed && (isSidebarOpen && !!selectedCrisis)
-     ? 'lg:left-[calc(50%-30px)]'
-     : !isLeftSidebarCollapsed && !(isSidebarOpen && !!selectedCrisis)
-       ? 'lg:left-[calc(50%+160px)]'
-       : isLeftSidebarCollapsed && (isSidebarOpen && !!selectedCrisis)
-         ? 'lg:left-[calc(50%-190px)]'
-         : 'lg:left-1/2'
-   }`}>
+ <footer className={`... ${footerDockClass}`}>
```

### Verification

- Playwright headless collision check at **1366×768 @100% zoom**: footer/drawer gap ≥ 24 px in all four dock states (sidebar+drawer, sidebar-only, drawer-only, map-only).
- Pre-fix failure state captured as `shot-drawer-failed.png` (retained untracked as evidence).
- Both dock consumers (`DashboardClient` footer, `CrisisSimulatorBar`) now compute identical geometry from one module — the two ternaries can never drift apart again.

---

## WP2 — Mapbox Routing Toll Avoidance (D1 + D2)

### Implementation

**`frontend/lib/aiDynamicRouter.ts`** — the routing core:

| Lines | Change |
|---|---|
| L6–8 | `export const HAZARD_RADIUS_OPTIONS_KM = [5, 8, 15] as const;` / `DEFAULT_HAZARD_RADIUS_KM = 8` / `TOLL_CORRIDOR_BUFFER_KM = 2.0` (D1) |
| L13 | `HIGHWAY_JUNCTION_NODES` items gain `isTollGate?: boolean` |
| L24, L32–33, L35–37, L43–44, L47–48 | 11 nodes flagged `isTollGate: true`: `interchange_amplas`, `kualanamu_junction`, `lubuk_pakam_interchange`, `sei_rampah_interchange`, `tebing_tinggi_toll`, `galang_junction`, `pekanbaru_tol_in`, `dumai_tol_out`, `palembang_kramasan`, `terbanggi_besar_tol`, `bakauheni_tol_gate` |
| L252–258 | New `MapboxDirectionsRoute` / `MapboxDirectionsResponse` / `MapboxDirectionsProfile` types |
| L262 | `MAPBOX_DIRECTIONS_ENDPOINT` constant |
| L267–272 | `isHazardNearTollCorridor(hazardCenter, radiusKm, bufferKm)` — true when any toll-gated node is within `radiusKm + 2.0 km` (haversine) |
| L278–303 | `requestMapboxDirections(coordString, profile, params, token, excludeToll)` — builds `…?{params}&exclude=toll&access_token=…` when `excludeToll`; detects `NoRoute` (`data.code === 'NoRoute'` **or** `res.ok && !data.routes?.length`) and **retries exactly once without the exclusion** so routing never fails closed |
| L306 | `fetchMapboxRouteWithForcedWaypoint(..., token, excludeToll = false)` |
| L369 | `fetchMapboxAlternativeDrivingRoutes(..., waypoints = [], excludeToll = false)` |
| L577 | `calculateAIDynamicDetourRoutes(hazardCenter, radiusKm = DEFAULT_HAZARD_RADIUS_KM, ...)` |
| L580 | `const excludeToll = hazardCenter ? isHazardNearTollCorridor(hazardCenter, radiusKm) : false;` |
| L620, L670, L723 | all three Mapbox fetch layers receive `excludeToll` |
| L761–762 | **HOLD card fix:** `waypoints: []` (was `recommendations[0]?.waypoints || []` — reusing a compromised corridor's waypoints) and `is_compromised: true` (was `false`, which painted an unsafe route as safe) |
| L778–784 | Sort ranks only *non-HOLD* compromised routes below safe ones, so the HOLD card surfaces first without demoting genuinely safe routes |

**`frontend/lib/mapboxRoutingService.ts`:**

| Lines | Change |
|---|---|
| L4–8 | imports `DEFAULT_HAZARD_RADIUS_KM`, `isHazardNearTollCorridor`, `requestMapboxDirections` from `aiDynamicRouter` |
| L353–355 | `fetchMapboxDirections(..., waypoints = [], excludeToll = false)` |
| L365–370 | delegates to `requestMapboxDirections(...)` (raw URL construction removed) |
| L414 | `calculateRoadNetworkDetourRoutes(hazardCenter, radiusKm = DEFAULT_HAZARD_RADIUS_KM, ...)` |
| L418 | `const excludeToll = isHazardNearTollCorridor(hazardCenter, radiusKm);` |
| L443–444 | both detour waypoint calls pass `excludeToll` |

**`frontend/components/dashboard/DashboardClient.tsx`:**

| Lines | Before → After |
|---|---|
| L442 | `useState<number>(15)` → `useState<number>(DEFAULT_HAZARD_RADIUS_KM)` |
| L695 | `updateBaselineMapboxRoute(..., radiusKm: number = 15)` → `= DEFAULT_HAZARD_RADIUS_KM` |
| L998–999 | new `demoRadiusRef = useRef<number>(DEFAULT_HAZARD_RADIUS_KM)`, synced to `selectedRadius` |
| L1004–1012 | Stage-2 shockwave: `radiusKm: 15` → `radiusKm: demoRadiusKm` (operator-selected radius) |
| L1017 | `buildHazardBypassRoute(..., hazardCenter, 15)` → `..., demoRadiusKm)` |
| L1560 | news "Fokus" handler passes `15` → `selectedRadius` |

**`frontend/components/map/CrisisSimulatorBar.tsx`** L338: radius popover `[5, 15, 30].map(...)` → `HAZARD_RADIUS_OPTIONS_KM.map(...)` (D1 options).

**New spec `frontend/e2e/toll-bypass-routing.spec.ts` (207 lines, 7 tests):**
1. D1 radius options are `[5, 8, 15]` with 8 km default.
2. D2 haversine gate: Lubuk Pakam hazard is within 8+2 km of the `lubuk_pakam_interchange` toll gate; a toll-free hazard is not.
3. Directions URL carries `exclude=toll` only when the caller requests it.
4. `NoRoute` with `exclude=toll` retries once without the filter.
5. Lubuk Pakam hazard: tolls excluded **and every safe polyline clears the hazard circle** (haversine clearance check per route).
6. Hazard far from toll corridors keeps toll lanes available (no `exclude=toll`).
7. Offline HOLD card carries no polyline (`waypoints: []`) and flags `is_compromised: true` honestly.

### Before/after contrast — HOLD card (`aiDynamicRouter.ts` L761)

```diff
-      waypoints: recommendations[0]?.waypoints || [],
+      waypoints: [],
       distance_km: recommendations[0]?.distance_km || Math.round(odDistanceKm),
       eta_minutes: (recommendations[0]?.eta_minutes || 60) + 180,
       fuel_increase_pct: 0,
       risk_score: 0.15,
-      is_compromised: false,
+      is_compromised: true,
```

### Verification

- Playwright headless run (production build): **7/7 passed** — including the Lubuk Pakam haversine clearance assertion that no safe polyline enters the flood circle.
- URL construction unit-tested via fetch interception (`captureMapboxRequests` harness): exact `exclude=toll` presence/absence asserted.
- Next.js production build clean.

---

## WP3 — Guided Demo Economic Integration & Tab Pacing (D4)

### Implementation

**`frontend/components/dashboard/DashboardClient.tsx`:**

| Lines | Change |
|---|---|
| L1025–1033 | Stage 4: `setActiveTab('Mitigation')` → `setActiveTab('Economic')` — the operator reviews economic impact *before* approving the mitigation plan |
| L1886–1892 | `GuidedDemoPanel` receives `inflationForecast={demoState.currentCrisisState?.inflation_forecast}`, `economicFinding={...economic_intelligence_finding}`, and `onOpenMitigation={() => { setActiveTab('Mitigation'); setIsSidebarOpen(true); }}` |

**`frontend/components/demo/GuidedDemoPanel.tsx`:**

| Lines | Change |
|---|---|
| L21–24 | imports `ArrowRight`, `Info`, `AlertTriangle` (lucide) + `CrisisState` type |
| L43–45, L64–66 | new props `inflationForecast`, `economicFinding`, `onOpenMitigation` |
| L143–165 | **payload-derived** economic values only: `inflationPct` (from `pct_increase`, else `(inflation_multiplier − 1) × 100`), `commodityLabel`, `recoveryDays` (`data.recovery_days_estimate`), `precedentCount` (`data.ltm_episodes_used`), `anomalyDetected`, `newsCommodities`, `economicConfidencePct`, `hasEconomicPayload` |
| L338–420 | Stage-4 card rebuilt: "Notifikasi Terkirim ke Operator Armada" header, then a "Dampak Ekonomi" grid — *Proyeksi Kenaikan* (`+X.X%` + commodity), *Horizon Proyeksi* (`N jam` + recovery estimate), anomaly/preseden chips — every field renders "Belum tersedia" when the payload lacks it, and a dashed empty-state box ("Belum ada temuan ekonomi…") when no payload exists at all |
| L454–481 | CTA row: primary **"Buka Mitigasi & Setujui"** (`ArrowRight`, calls `onOpenMitigation`) + compact icon-only restart button (`RotateCcw`). Before: a single full-width "Mulai Ulang Demo" button |

**`frontend/components/sidebar/EconomicTab.tsx`:**

| Lines | Change |
|---|---|
| L10–29 | New `resolveLtmEpisodes(crisis)` — nested `economic_intelligence_finding.data.ltm_episodes` first, **root `crisis.ltm_episodes` fallback**; `resolvePctIncrease(forecast)` |
| L42–56 | Price-chart merge **no longer fabricates prices**: removed `|| { price_idr: 14000 }` / `17000` / `55000` fallbacks; rows with no data are filtered out; `setChartData([])` on fetch error |
| L68–88 | Forecast card with honest empty states ("Persentase belum tersedia", "Horizon proyeksi belum tersedia") and a "Proyeksi inflasi belum diterbitkan untuk krisis ini." box when `forecast` is absent |
| L112+ | LTM episodes section renders from `resolveLtmEpisodes` with per-field `typeof` guards (no `.toFixed()` on possibly-undefined) |
| L127–133 | Chart empty state: "Riwayat harga PIHPS belum tersedia." |

**`frontend/hooks/useDemoState.ts`** L86: `base.ltm_episodes = full.ltm_episodes` — root-level LTM episodes now flow into the client crisis state (the EconomicTab fallback source).

**`frontend/lib/types.ts`** L113: `ltm_episodes?: LTMEpisode[]` added to `CrisisState`.

**`DEMO_SCRIPT_90S.md`:** Segment 3/4 restructured — "Economy Review (Economic Tab) ➔ Mitigation Approval & Action Plan"; spoken pitch updated ("operator melihat dampak ekonominya lebih dulu…"); mermaid architecture diagram de-branded to reality (LangGraph Agent Swarm; "Deterministic CPU Router: NetworkX + OR-Tools / 2-Opt" instead of NVIDIA cuOpt GPU/FourCastNet claims); run instructions rewritten for manual pacing (`Run Demo` → `Langkah Berikutnya` → stage 4 Economic → `Buka Mitigasi & Setujui`).

### Before/after contrast — stage 4 pacing (`DashboardClient.tsx` L1025)

```diff
       case 4: {
-        // Stage 4: Dispatch Complete
-        setActiveTab('Mitigation');
+        // Stage 4: Dispatch Complete — review the economic impact before approving the mitigation plan
+        setActiveTab('Economic');
```

### Verification

- `tsc --noEmit` clean; `npm run build` clean (exit 0).
- Offline demo walkthrough: Evidence (stage 3) → **Economic** (stage 4) → **Mitigation** (CTA click) — pacing fully operator-controlled, no timers.
- Economic cards render only payload values; with a payload-free crisis the dashed empty state renders (no hardcoded "+17.1%" / "Rp 210 Juta" anywhere — guardrail from `56-PLAN.md`).

---

## WP4 — News Link Integrity & Cached Excerpt

### Implementation

**`backend/app/services/unified_news_ingestor.py`** — ingestion-time link probing:

| Lines | Change |
|---|---|
| L36–41 | `LINK_CHECK_TIMEOUT_SECONDS = 4.0`, `LINK_CHECK_CONCURRENCY = 5`, `LINK_LIVENESS_TTL_SECONDS = 900.0`, verdict constants `alive`/`dead`/`unknown` |
| L46 | `self._link_liveness_cache: Dict[str, Tuple[str, float]]` (TTL cache) |
| L53 | Cycle step 3: `await self._attach_link_liveness(structured_articles)` before the Supabase upsert |
| L93–104 | `_same_host()` — case-insensitive, `www.`-stripped host comparison; empty original host is permissive |
| L106–136 | `_is_link_alive()` — **dead** = status ≥ 400, final path `""`/`"/"` (redirect to site root), or redirect to another host; **unknown** = `httpx.TimeoutException` / `httpx.HTTPError` (never declared dead without a proving response); verdicts cached except `unknown` |
| L138–157 | `_attach_link_liveness()` — `asyncio.Semaphore(5)`, `httpx.AsyncClient(follow_redirects=True, timeout=4.0)`, `asyncio.gather` over all articles; articles without a link are tagged `unknown` without a probe |
| L183 | Redis stream payload carries `link_alive` |

**`backend/app/services/news_aggregator.py`** L326: upsert whitelist adds `"link_alive": a.get("link_alive", "unknown")` — the verdict survives to Supabase.

**New migration `infra/supabase/migrations/011_news_articles_link_alive.sql` (9 lines):**

```sql
ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS link_alive TEXT DEFAULT 'unknown';
```

plus a `COMMENT ON COLUMN` documenting the verdict semantics (dead = status ≥ 400, redirect to site root, or redirect to another host; unknown = timeout/transport error).

**`frontend/components/dashboard/DashboardClient.tsx`** (news feed card):

| Lines | Change |
|---|---|
| L502 | new `expandedNewsId` state |
| L1545–1547 | `canOpenSource = Boolean(item.link) && item.link_alive !== 'dead'`; `isExpiredLink = item.link_alive === 'dead'`; `isExcerptExpanded` — **replaces** the `isDeadMockUrl` heuristic (`!item.link \|\| link.includes('/berita/49') \|\| !link.startsWith('http')`) and its Google News search-URL substitution |
| L1597–1613 | headline anchor renders only when the source is openable; otherwise a plain span |
| L1615–1622 | stored excerpt renders `line-clamp-2` until expanded (`ChevronDown` rotates 180°) |
| L1640–1676 | action row: "Buka Berita Asli" button only when alive; amber `AlertTriangle` badge **"Tautan asli kedaluwarsa"** (dead) / **"Tautan sumber tidak tersedia"** (no link) + **"Kutipan tersimpan" / "Sembunyikan kutipan"** expander button |

**`frontend/components/sidebar/EvidenceTab.tsx`:**

| Lines | Change |
|---|---|
| L12–22 | `NewsCitation` interface with `link_alive?: 'alive' \| 'dead' \| 'unknown'` |
| L65–80 | Citation resolution: nested `verified_citations` first, **root `crisis.verified_news_citations[0]` fallback**; `sourceIsDead`, `canOpenSource` |
| L177–238 | Excerpt-first card: headline + stored excerpt (hardcoded fallback string *"Debit air Sungai Padang meningkat merendam jalur logistik Jalinsum KM 78…"* **removed**); **"Buka sumber"** anchor only when alive (tooltip distinguishes `unknown`); amber "Tautan asli kedaluwarsa" badge when dead |

**`frontend/hooks/useNewsVerification.ts`:**

| Lines | Change |
|---|---|
| L32 | `link_alive?: 'alive' \| 'dead' \| 'unknown'` on `NewsItem` |
| L69–73 | `fallbackSearchUrl` + `isDeadMockUrl` heuristic deleted; maps `sourceLink` and `linkAlive` through to the feed item |

**`frontend/lib/types.ts`** L131: `link_alive` on the `verified_news_citations` item type.

**Tests — `backend/tests/test_news_pipeline.py` (+150 lines):**
- `_install_fake_httpx` harness replaces `httpx.AsyncClient` with a deterministic fake that records calls and client kwargs.
- `test_news_link_liveness_verdicts` — alive (200 same-URL); dead (root redirect, other-host redirect, 404); unknown (timeout, missing link); asserts `follow_redirects=True`, 4 s timeout, and that a linkless article is never probed.
- `test_news_link_liveness_cache_avoids_second_probe` — second batch served from the TTL cache.
- `test_news_link_liveness_cache_expires_after_ttl` — backdated cache entry re-probes.
- `test_link_alive_is_persisted_to_supabase` — the upsert whitelist carries `link_alive` (cross-module contract test).

### Before/after contrast — news card action row (`DashboardClient.tsx` L1545)

```diff
-  const isDeadMockUrl = !item.link || item.link.includes('/berita/49') || !item.link.startsWith('http');
-  const targetNewsUrl = isDeadMockUrl
-    ? `https://news.google.com/search?q=${encodeURIComponent(item.headline + ' ' + (item.source_name || 'ANTARA'))}&hl=id-ID&gl=ID&ceid=ID:id`
-    : item.link;
+  const canOpenSource = Boolean(item.link) && item.link_alive !== 'dead';
+  const isExpiredLink = item.link_alive === 'dead';
+  const isExcerptExpanded = expandedNewsId === item.id;
```

### Verification

- `pytest backend/tests` — all WP4 tests pass with mocked httpx (redirect-to-base, 200, timeout, 404 cases).
- Dead links never open a browser tab; the operator sees the honest "kedaluwarsa" badge and can still read the stored excerpt inline.

---

## WP5 — Full Mock Data Purge & Empirical Calibration

### 1. `backend/app/scrapers/social_scraper.py`
- **Deleted** `MOCK_SOCIAL_POSTS` (24 lines, 3 fabricated Twitter/TikTok posts).
- Log messages de-mocked: `"Twitter API returned status {code}. Falling back to mock data."` → `"Twitter API returned status {code}."`; `"Error calling Twitter API: {e}. Falling back."` → without "Falling back."; `health_check()` docstring `"always OK (uses mock fallback if API fails)."` → `"always OK."`.
- Empty-response behavior is honest: returns `[]` (the comment already said so; now nothing contradicts it).

### 2. `backend/app/routers/commodity_router.py` — `/spikes` (D5)
- L4: `import random` removed.
- L74–162 rewritten: queries Supabase `commodity_prices` for the last 30 days (`gte("time", …)`, `order("time", desc=True)`, `limit(500)`, optional region filter), groups by `(commodity, region)`, enforces `MIN_RECORDS_GUARD = 3`, computes `baseline_price` as the window mean and `spike_pct = (current − baseline) / baseline × 100`, and classifies: ≥15 % → `critical`/`active_shock`, ≥10 % → `high`/`elevated`, ≥5 % → `medium`/`warning`, below 5 % → omitted. Errors log a warning and return an honest `{"spikes": [], "total": 0}`.

### 3. `frontend/components/dashboard/EvaluationSection.tsx`
- **Deleted** `FALLBACK_OUTCOMES` (40 lines, 3 fabricated closed-loop outcome rows with invented metrics like `18.5%` / `22.0%`).
- `outcomes` initializes to `[]` (was `FALLBACK_OUTCOMES`).
- Metric fallbacks `?? 1.0` / `?? 0.9714` / `?? 0.9855` / `?? 0.0782` / `?? 0.019` → `?? null`, each rendering **"Belum dihitung"** instead of a fabricated score.
- Outcomes table gains an empty-state row: "Belum ada log verifikasi lapangan (outcomes) yang tersinkronisasi."
- `ReliabilityDiagram` receives `brierScore ?? undefined`, `ece ?? undefined`.

### 4. `frontend/components/dashboard/ReliabilityDiagram.tsx`
- Default props `brierScore = 0.0782`, `ece = 0.1899` → required-with-null; renders "BS: Belum Dihitung" / "ECE: Belum Dihitung" when absent.

### 5. `frontend/hooks/useFleetVehicles.ts` (D3)
- New `UseFleetVehiclesOptions { enableSimulationFallback?: boolean }`; `isSimulationMode` state (default **false**); `vehicles` initializes to `[]` (was `FALLBACK_FLEET`).
- `FALLBACK_FLEET` is served **only** when `isSimulationMode` is on (filtered by modality when a modality is selected); otherwise empty arrays and honest errors.
- A dedicated effect syncs the fleet when the toggle flips; the hook now returns `isSimulationMode` / `setIsSimulationMode`.

### 6. `frontend/components/dashboard/DashboardClient.tsx`
- L439–445: destructures `isSimulationMode: isFleetSimMode` / `setIsSimulationMode: setIsFleetSimMode` from `useFleetVehicles()`.
- L1811–1837: new **"Mode Simulasi"** toggle in the telemetry toolbar — amber pulsing dot + bold amber chip when on; toast explains "Armada fallback sintetis dimuat" vs "Tampilan armada riil/offline cache".

### 7. `backend/app/routers/demo_router.py` — derived causal chain
- New `_derive_causal_chain(full_state)` (L19–52): existing chain nodes are re-labeled `"Rantai Sebab-Akibat (Simulasi)"`; a missing chain is derived from `title` / `inflation_forecast.commodity` / `region` with the same label. Wired into both `/demo/status` response paths (L253, L268).

### 8. `data/fixtures/mock_crisis_state.json`
- `causal_chain` nodes carry `"label": "Rantai Sebab-Akibat (Simulasi)"` — the simulation provenance is explicit in the fixture too.

### 9. `backend/app/scrapers/marketplace_scraper.py`
- `DEFAULT_MARKETPLACE_DATA` minyak_goreng `38500.0` → `38000.0` (comment synced) — aligns the seed with the real scraped price band.

### 10. Tests — `backend/tests/test_api_routers.py`
- `test_commodity_endpoints` now asserts the `/spikes` response contract (`spikes` list, `total`).
- New `test_commodity_spikes_calculation_and_guard` (monkeypatched Supabase client): <3 records → honest `[]` / `total: 0`; 3 records (60000 / 48000 / 50000) → baseline ≈ 52666.67, `spike_pct` ≈ 13.9 %, `severity: "high"`.

### Before/after contrast — `/spikes` (`commodity_router.py` L74)

```diff
-    """Returns detected price spike anomalies for active regional food commodities."""
-    spikes = [
-        {"commodity": "cabai_merah", "current_price": 62000.0, "baseline_price": 52000.0, "spike_pct": 19.2, ...},
-        {"commodity": "bawang_merah", "current_price": 38500.0, "baseline_price": 35000.0, "spike_pct": 10.0, ...}
-    ]
+    """... Per D5: computes percent change vs 30-day baseline from Supabase commodity_prices
+    with a minimum-records guard (>= 3 records in 30-day window per commodity),
+    returning an honest empty list if data is insufficient."""
+    MIN_RECORDS_GUARD = 3
+    spikes: List[Dict[str, Any]] = []
+    ...
```

### Verification — purge sweep

PowerShell `Select-String` sweep across `*.ts,*.tsx,*.py,*.json,*.md` (excluding `node_modules`, `.venv`, `.next`, `.git`):

| Pattern | Source-code hits (`backend/app`, `frontend`, `data`) | Notes |
|---|---|---|
| `MOCK_SOCIAL_POSTS` | **0** | remaining hits only in historical planning/audit docs (phases 21/52/55/56 plans, ROADMAP, audit reports) |
| `FALLBACK_OUTCOMES` | **0** | remaining hits only in planning/audit docs |
| `62000` | **0** | only in `56-PLAN.md` itself |
| `38500` | **0 real** | the single hit is `test_pilot_e2e.py:77`'s `385000.0` spoilage-cost bound — a substring false positive, not the mock price |

`FALLBACK_FLEET` is intentionally retained, reachable only behind the "Mode Simulasi" toggle (D3).

---

## Global Verification Ledger

| Check | Command | Result |
|---|---|---|
| Backend test suite | `backend\.venv\Scripts\python.exe -m pytest tests -q` | **183 passed**, 0 failed (baseline before Phase 56: 178) |
| TypeScript typecheck | `npx tsc --noEmit` (via `npm run build`) | clean |
| Next.js production build | `npm run build` | **exit 0** |
| Playwright headless (WP2 routing) | `npx playwright test toll-bypass-routing.spec.ts` | **7/7 passed** (1.6 s, chromium) |
| Playwright collision check (WP1) | headless @1366×768, all four dock states | footer/drawer gap ≥ 24 px |
| Mock purge sweep | `Select-String` for `MOCK_SOCIAL_POSTS\|FALLBACK_OUTCOMES\|62000\|38500` | 0 source-code hits |
| Offline demo walkthrough | `Run Demo` → `Langkah Berikutnya` ×4 → CTA | Evidence → Economic → Mitigation pacing confirmed |

**Phase 56 totals:** 23 files modified, 2 files added (`mapDockLayout.ts`, `011_news_articles_link_alive.sql`), 1 spec added (`toll-bypass-routing.spec.ts`), +1191 / −384 lines.
