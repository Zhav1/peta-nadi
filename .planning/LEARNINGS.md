# Consolidated Learnings: Phases 64–72

**Scope:** Architectural cleanup, mock elimination, audit ledger hardening, and E2E restoration across PreHub.  
**Authority:** Grounded facts only; zero unverified assumptions.

---

## 1. Decisions with Rationale

1. **Removal of Past, Future, and Predict Dock Tabs (Phase 64)**:
   - **Past (Masa Lalu)**: Backend items lacked `geojson_geometry`, so the map rendered zero features, and the UI had no timeline scrubbing capability. True operational history is properly maintained in the Laporan audit ledger (`ReportsSection.tsx`), backed by Supabase `route_approvals` and SQLite `route_decision_traces`.
   - **Future (Masa Depan)**: Static synthetic risk polygons were disconnected from live numerical weather and traffic forecasts. Authentic spatial weather forecasting is provided by real-time BMKG Radar + Open-Meteo NWP spatial fusion in `backend/app/services/weather_fusion_service.py`.
   - **Predict (Prediksi)**: Performed zero API fetches, relied on static hardcoded client text (`pred-rob-belawan-48h`), and falsely advertised a "TFT & Open-Meteo Multi-Model" in the UI banner. FourCastNet and GPU models were completely purged in Phase 59; no Temporal Fusion Transformer (TFT) model exists in the codebase.
   - **TimelineScrubber Cleanup**: `frontend/components/ui/TimelineScrubber.tsx` was orphaned prototype code since Phase 19. Safely deleted.
   - **Endpoint Deprecation**: Removed dummy endpoints `GET /api/v1/incidents/historical/episodes` and `GET /api/v1/incidents/predictive/risks` from `backend/app/routers/incidents.py`, while preserving `GET /incidents?status=resolved`.

2. **Removal of Simulasi Main Tab and Dead Code (Phase 65)**:
   - The "Simulasi" main tab (`SimulationSection.tsx`, 495 lines) was a legacy prototype using arbitrary linear formulas (e.g. `closureHours * 0.6 - bulogStockAlloc * 0.05` for commodity price deviation) and hardcoded strings (`"~1.400 Unit"`).
   - It made zero backend calls and had zero empirical validation against the standardized $N=60$ Sumatra benchmark.
   - The single canonical simulator in PreHub is **Simulasi Bencana** on the map canvas (`CrisisSimulatorBar.tsx` -> `POST /api/v1/simulate/stream`), which streams live multi-agent execution, runs deterministic CPU OR-Tools/NetworkX detours, evaluates BKHIT quarantine / MST axle-load compliance, and evaluates calibrated exponential spoilage decay ($1 - e^{-\delta \cdot T}$).
   - The Analytics deep link now routes directly to the map tab under `"Simulasi Bencana (Peta)"`.
   - Dead route `/simulation/chat` in `backend/app/routers/agent_router.py` was purged.

3. **Analytics Honesty Audit (Phase 66)**:
   - The Analytics tab (`AnalyticsSection.tsx`) possessed authentic dynamic data via `api.commodities.prices()` querying Supabase `commodity_prices`.
   - However, it contained hardcoded risk-ranking cards (`Cabai Merah +18.5%`, `Bawang Putih +24.5%`), a static causal chain (4 cards), static Deck.gl arcs (5 lines across Sumatra/Java), static port scatter nodes (6 points), and synthetic fallback figures (`Rp 12.400`, `+14.2%`).
   - The hardcoded cards, causal chain, and fake arcs/nodes were removed. Missing data now displays an honest, explicit `"Data tidak tersedia"` empty state.

4. **Laporan Audit Ledger Hardening (Phase 67)**:
   - The Laporan tab (`ReportsSection.tsx`) was hardcoded to status `"DISETUJUI"`, masking operator rejections (`REJECT`) and overrides (`OVERRIDE`), and ignoring backend sync status.
   - Timestamps were truncated to time-of-day strings (`09:15:00`).
   - The table rendered two fake fallback rows (`Genangan Air Jalinsum`, `Hambatan Arteri Sei Rampah`) when empty, a hardcoded `14` counter, and a static `"Terkendali"` badge.
   - PDF exports ignored the approval list and printed 1 static demo row.
   - The ledger was hardened with:
     - Real decision actions (`ACCEPT`, `REJECT`, `OVERRIDE`) with distinct badge styling and live sync indicator (`SYNCED` / `PENDING`).
     - Indonesian locale ISO date-time formatting with timezone (e.g. `18 Okt 2026, 03.47.03 GMT+7`).
     - Honest empty states for zero records and zero filter matches.
     - Dynamic approval count bound to backend totals.
     - Interactive filter toolbar (search, action type, start/end dates, reset).
     - Filter-synchronized PDF and JSON export generation.

5. **Restoration of Guest-403 E2E Test (Phase 68)**:
   - Deleted E2E coverage for guest RBAC handling was re-implemented against `MitigationTab.tsx` (`POST /api/v1/approvals`).
   - When approvals return HTTP 403 Forbidden, `MitigationTab` catches the rejection, displays the sandbox confirmation toast (`"tersimpan secara lokal"`), and updates component state optimistically to `DISETUJUI & DIKIRIM`.
   - Discovered that unlike legacy Simulasi, `MitigationTab` does not write to `localStorage` (`prehub_sandbox_approvals`), retaining state exclusively in React memory. The test was written strictly to assert actual behavior without inventing persistence.

---

## 2. Constraints & Operating Environment

- **Production Targets**:
  - Frontend: `pre-hub.vercel.app` (Next.js 14 App Router, Mapbox GL JS v3, Deck.gl v9.3).
  - Backend: `https://peta-nadi.onrender.com` (FastAPI, Python 3.13, NetworkX, OR-Tools, Supabase PostGIS).
- **Endpoint Lifecycles**:
  - Removed backend endpoints (`/incidents/historical/episodes`, `/incidents/predictive/risks`, `/simulation/chat`) only vanish from the live API after a deployment on Render.
  - The frontend no longer invokes these routes, ensuring deployment order independence.
- **Architectural Rules (AGENTS.md)**:
  - Prefix every shell command with `rtk`.
  - Enforce Non-AI Anti-Patterns: no purple/pink generic gradients, no emojis as icons (SVG Lucide only), strict `cursor-pointer` on interactive elements, consistent glassmorphism (`bg-[#0c1017]` / `bg-[#121822]`), no bombastic claims.
  - `.planning/` is the single source of truth; undotted `planning/` is forbidden; `docs/` is legacy context.
  - Ground truth benchmark: $N=60$ Sumatra empirical evaluation.
- **Pilot Stakeholders**:
  - Pelindo Belawan (maritime queues & container THC)
  - BKHIT (agricultural quarantine compliance certificates)
  - BPJT (Trans-Sumatra toll gates & vehicle golongan classifications)
  - PIHPS / Bank Indonesia (strategic food commodity price volatility)

---

## 3. Issues Hit During Work

1. **Subagent Quota Exhaustion (429 RESOURCE_EXHAUSTED)**:
   - When attempting to launch the E2E Test Restorer subagent, the system returned:
     `RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 31m20s.`
   - **Resolution**: Successfully handled by scheduling a one-shot timer (`DurationSeconds=1980`) using the `schedule` tool, waiting for quota reset, and cleanly relaunching the task.
2. **Parallel Editing on Large Monolithic Files**:
   - Running parallel subagents that both touched `frontend/components/dashboard/DashboardClient.tsx` (~2,000 lines) caused transient TypeScript compilation errors and file lock race conditions.
   - **Lesson**: Subagents modifying large shared orchestrator components must be dispatched sequentially.
3. **E2E Test Decoupling & Rewrite**:
   - The old `phase57-pilot-hardening.spec.ts` guest-403 test was tightly coupled to `#deploy-unified-action-plan-btn` and `localStorage.getItem('prehub_sandbox_approvals')`.
   - With `SimulationSection` deleted, the test required rewriting against the guided demo Stage 4 `MitigationTab` approval flow.
4. **Unrequested Subagent Code Modifications**:
   - The test restoration subagent made unprompted modifications to `MitigationTab.tsx` (null guards on distance and fuel) and `DashboardClient.tsx` (`handleCrisisReadyFromDemo` defaulting to Belawan -> Tebing Tinggi).
   - While the null guards are beneficial defensive programming, defaulting nodes altered clean-slate demo behavior and required careful code review.
5. **Tool Interruption on Interactive Queries**:
   - An `ask_question` modal was cancelled once due to a backend system tool event, requiring re-prompting.

---

## 4. Open Issues for Next Context Window

The following items are prioritized for subsequent development phases:

1. **MitigationTab Guest-403 Persistence vs Wording Mismatch**:
   - Toast notification proclaims: `"Keputusan rute #1 (ACCEPT/REROUTE) tersimpan secara lokal!"`.
   - Reality: State is maintained strictly in React memory and is discarded on page refresh (`localStorage` is NOT written).
   - **Action**: Either update toast wording to `"Tindakan aktif untuk simulasi sesi ini"` or implement explicit `localStorage` persistence under `'prehub_sandbox_approvals'`.
2. **Regulatory Audit Schema Expansion**:
   - `route_approvals` currently stores basic routing and operator IDs.
   - For complete audits by Pelindo, BKHIT, and BPJT, add schema fields:
     - `bkhit_cert_id` (quarantine certificate number)
     - `bpjt_toll_gate` & `bpjt_vehicle_class` (Golongan I–V)
     - `container_id` / `vessel_mmsi`
3. **Dynamic Multi-Market Analytics Risk Cards**:
   - The risk ranking section in `AnalyticsSection.tsx` is currently an empty state.
   - Connect it to dynamic multi-market PIHPS price spreads when scrapers or multi-province feeds are active, avoiding hardcoded static percentages.
4. **Status Koridor Derivation**:
   - Laporan's "Status Koridor" metric is currently derived from `selectedCrisis.severity` and traffic status.
   - Expand to an aggregate health metric factoring all active Trans-Sumatra freight corridors.
5. **Full E2E Test Suite Run & Manual Browser Audit**:
   - The complete Playwright suite was not fully re-executed end-to-end, and no manual visual browser verification was performed. Conduct a comprehensive visual audit.
6. **Render Backend Redeployment**:
   - Deploy backend commit to `peta-nadi.onrender.com` so deprecated endpoints return 404 in public OpenAPI documentation.
7. **Review `handleCrisisReadyFromDemo` Default Corridor**:
   - Review whether falling back to `'belawan'` -> `'tebingtinggi'` is acceptable for all demo stepper invocations or if clean-slate selection should be strictly enforced.

---

## 5. Mistakes to Avoid (Process & Engineering Safeguards)

- **Do NOT introduce decorative mock data to make UI look "full"**: If data is unavailable, render an explicit glassmorphic empty state. Ungrounded numbers destroy pilot credibility with enterprise stakeholders.
- **Do NOT run parallel agents on `DashboardClient.tsx`**: Monolithic UI files must be modified sequentially to prevent merge conflicts and syntax corruption.
- **Do NOT claim AI models that do not exist**: Never advertise "TFT", "FourCastNet", or "NVIDIA cuOpt" unless an active, verified model service is executing those calculations.
- **Do NOT assume tests assert what they claim**: Always inspect what an E2E test actually checks (e.g. confirming whether `localStorage` was genuinely written vs asserted).
- **Do NOT map bureau/outlet names to coordinates**: Strip bureau/dateline headers (`"ANTARA Bengkulu"`, `"Bengkulu (ANTARA) -"`) before gazetteer matching; a location miss must yield `is_geocoded=False` with null coordinates, never a province centroid.
- **Do NOT launch simulations from news inspection**: News `"Fokus"` and zone clicks open the stored Audit Trail (`inspectNewsOrZoneAuditTrail`); only explicit `CrisisSimulatorBar` actions run `POST /api/v1/simulate/stream`.
- **Do NOT add new Supabase columns for news metadata**: Pack `zone_tier`, `tier_reason`, `custom_hazard_label`, `impact_profile`, `is_geocoded`, `location_precision` into the existing `ground_truth_metrics` JSONB to avoid production migration failures.
- **Do NOT route through closed ports**: `findClosestSeaport` must exclude ports inside `port_closure`/`marine_wave` radii (`max(radiusKm + 8, 22)` km) via `findClosestOpenSeaport`; always pass the true `hazardType` into Hold-vs-Reroute economics.

---

## 6. Phase 72: Economical Tiered News Gating, Stored Audit Inspection & Port-Closure Failover

### Decisions
1. **DB-first deduplication**: `fetch_existing_processed_articles_map()` (Supabase `news_articles` + memory) runs before any LLM call in the 5-minute RSS cycle, so re-ingested items — including `DROPPED_IRRELEVANT` — never burn duplicate tokens.
2. **Heuristic-first, LLM-overlay gatekeeper**: deterministic `_fast_heuristic_extraction()` assigns `RED_CONFIRMED` / `YELLOW_CLARIFY` / `DROPPED_IRRELEVANT`; live LLM tiering applies only to unprocessed items (requires `OPENCODE_API_KEY` on Render); LLM `DROPPED_IRRELEVANT` is respected and LLM `RED_CONFIRMED` without geocode is clamped.
3. **Stored-audit inspection over simulation**: `inspectNewsOrZoneAuditTrail()` flies to stored zone coordinates and opens the persisted Audit Trail in `CrisisSidebar` at zero LLM cost.
4. **10-hazard dynamic impact model**: `flood`, `port_closure`, `marine_wave`, `road_closure`, `landslide`, `earthquake`, `volcanic_eruption`, `wildfire`, `congestion`, `other_disruption` with `custom_hazard_label`, `affected_modalities`, `passability`, `estimated_delay_hours` end-to-end.
5. **Alternate-port intermodal failover**: `Truck Feeder -> Next Open Port -> Sea` with per-route `tradeoff_analysis` (Pros, Cons, ΔWaktu, ΔBiaya) on every route card.

### Constraints & Deployment Context
- Frontend: `https://pre-hub.vercel.app`; Backend: `https://peta-nadi.onrender.com`; DB: Supabase `news_articles` (`ground_truth_metrics` JSONB carries all new metadata).
- Orchestration: main orchestrator strictly delegates tool/research/implementation/git work to `opencode-go/muse-spark-1.3#high` subagents.

### Open Concerns
1. Confirm live Render `GET /api/v1/news/live` fans out N zones per multi-location item and legacy v1 rows re-tier on read.
2. Confirm `OPENCODE_API_KEY` is set on Render for the live LLM tiering overlay.
3. Browser E2E on Vercel: multi-zone fan-out click-through to parent Audit Trail, `Wilayah Terdampak` pills, `Pengusaha: Tol...` DROPPED absence from map.

---

## 7. Phase 73: Toponym Hierarchy, Predicate Gate & Multi-Regency Fan-Out

### Decisions
1. **Tier-first gazetteer ordering**: `_tiered_keys()` and `LOCATION_GAZETTEER` sort by `(tier, -len(k))` — string length breaks ties only within a tier, never across tiers. Completed Pan-Sumatra Kabupaten coverage (`sipirok`, `asahan`, `deli serdang`, `langkat`, `tapanuli selatan`).
2. **Route-endpoint masking**: `Jalan Lintas A-B` / `tol A-B` substrings blanked when a Tier-1 pass or explicit `via` is present; `via`/pass precondition prevents nuking legitimate `A-B` mentions.
3. **Two-factor crisis gate**: `STRICT_CRISIS_PREDICATES` (physical actions only) required; `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS` veto unless `PHYSICAL_BLOCKAGE_PREDICATES` override. Bare infrastructure nouns never count as a hazard signal alone.
4. **Enrich-then-extract + 1-to-N fan-out**: canonical-URL lead fetch on short/title-only/multi-area items; `affected_locations[]` end-to-end (extractor → JSONB → API → N map zones + pills).
5. **Schema version invalidation**: `EXTRACTION_SCHEMA_VERSION = 2`; `schema_version != 2` rows auto re-tier on read and force re-extract in the ingestor — the sanctioned cache-invalidation path for all future NLP rule changes.

### Constraints & Deployment Context
- Frontend: `https://pre-hub.vercel.app`; Backend: `https://peta-nadi.onrender.com`; DB: Supabase `news_articles` (`ground_truth_metrics` JSONB carries `affected_locations`, `schema_version`; no migration, no new columns).
- Deterministic layer only: zero LLM prompt/contract changes in Phase 73.

### Open Concerns (Phase 73)
1. Confirm legacy v1 rows (Jambi-centroid fallbacks, false Yellows, single-point shapes) visibly self-heal on live Render read.
2. Browser E2E on Vercel: N-zone fan-out rendering, parent Audit Trail linkage, `Wilayah Terdampak` pills on Evidence tab + News Cards.

---

## 8. Phase 74: Agent Verification Gate, Hazard-Specific Geometry & 48h Freshness Lockdown

### Decisions
1. **4-check deterministic verification gate**: `run_agent_verification_gate()` (freshness ≤48h / discourse / spatial geocode / impact-corroborated) with a strict verdict ladder; full `verification_audit` packed in `ground_truth_metrics` JSONB and rendered in the Evidence tab 4-check panel. Agent-2 (`osint_hazard.py`) pre-filters discourse/stale items before confidence scoring.
2. **Signal/blockage list separation**: bare `"banjir"`/`"longsor"` removed from `PHYSICAL_BLOCKAGE_PREDICATES` (kept in `STRICT_CRISIS_PREDICATES` as signal); a hazard noun never counts as blockage evidence. `"Akademisi Unand ... Solusi Banjir ..."` → DROPPED; true closures still RED.
3. **Agent-decided hazard geometry**: one shared radius table (landslide/road 2.8–3.5, port 3.2, congestion 2.5, flood 4.8–6.0, wildfire 7.5, marine 8.5, volcanic 10.0, earthquake 12.0, regency warning 7.2–9.0) in `incident_geometry_service.py`, backend polygon preferred, client table fallback-only.
4. **48h freshness lockdown**: archival URL date-path gate dominates stored timestamps; true `published_at` preserved end-to-end (never ingestion `now()`); `when:2d` at the query source; client mirror guard at render; `schema_version = 3` auto re-verifies all legacy rows on read.

### Constraints & Deployment Context
- Frontend: `https://pre-hub.vercel.app`; Backend: `https://peta-nadi.onrender.com`; DB: Supabase `news_articles` (`ground_truth_metrics` JSONB carries `verification_audit`, `radius_km`, `geometry_polygon`, `published_at_iso`, `age_hours`, `schema_version`; no migration, no new columns).
- Deterministic layer only: zero LLM prompt/contract changes in Phase 74.

### Open Concerns
1. Confirm legacy v1/v2 rows (academic REDs, overwritten `published_at`) visibly self-heal on live Render read.
2. Browser E2E on Vercel: hazard-specific footprints per class, Evidence 4-check panel per item, stale items absent from feed.

---

## 9. Phase 75: Full-Body Scraping, Workhorse LLM Content Verifier & Post-Disaster Guards

### Decisions
1. **Teaser-triggered full-body enrichment**: `enrich_article_description_if_needed()` enriches any unscraped HTTP-linked article with a `< 450`-char / empty / title-equal description (or location-cue title), combining the RSS summary with scraped `<article>`/`<p>` body up to 2,500 chars; `body_scraped` / `article_body_chars` / `html_published_at` persisted once per article in `ground_truth_metrics` JSONB. The old `< 90` skip is gone — standard ~120-char RSS teasers are now always expanded.
2. **Workhorse LLM reads article content, not teasers**: `extract_structured_news_batch()` pre-enriches short bodies, then feeds `ISI BERITA[:1600]` per article to `settings.opencode_driver_model` (NVIDIA NIM `deepseek-v4.1-flash` fallback) in 5-article chunks (`max_tokens=1600`), returning `is_active_disaster`, `zone_tier`, `verified_sumatra_locations[]`, `recommended_radius_km`, and content-grounded `tier_reason`.
3. **Post-disaster construction can never be a crisis signal**: bare `"darurat"` removed from `STRICT_CRISIS_PREDICATES` and the `critical`-severity list (only `tanggap darurat bencana` / `darurat banjir` / `darurat longsor` remain); `POST_CONSTRUCTION_EXCLUSION_PHRASES` quarantines emergency-infra nouns; both `pasca` spacings plus construction vocabulary (`pembangunan`, `tanggul`, `perbaikan`, `renovasi`, …) in `NON_INCIDENT_DISCOURSE_MARKERS`, mirrored in the Agent-2 pre-filter and the frontend client guard; `other_disruption` without physical blockage cannot set `impact_corroborated`.
4. **`EXTRACTION_SCHEMA_VERSION = 4`** in both `news_extractor.py` and `news_aggregator.py`; legacy rows auto re-verify on read (sanctioned zero-migration invalidation path). Evidence tab renders `✓ Konten Artikel Dianalisis Workhorse LLM ({n} kar)` when `verification_audit.llm_verified`.

### Constraints & Deployment Context
- Frontend: `https://pre-hub.vercel.app`; Backend: `https://peta-nadi.onrender.com`; DB: Supabase `news_articles` (`ground_truth_metrics` JSONB carries `body_scraped`, `article_body_chars`, `verification_audit`, `schema_version`; no migration, no new columns).
- Prompt contract changed (content-grounded `tier_reason`, post-disaster DROPPED rules) — first LLM-prompt change since Phase 72; heuristic baselines unchanged as fallback.

### Open Concerns
1. Confirm live Render ingestor enriches short teasers (check `body_scraped` / `article_body_chars` on fresh rows) and the Workhorse overlay fires (`llm_verified` badges in Evidence tab on Vercel).
2. Confirm `OPENCODE_API_KEY` is set on Render — without it the batch path keeps heuristic baselines and `tier_reason` stays heuristic.

---

## 2026-10-21 — Phases 80-82 (search E2E, dispatcher scope, truck/travel ERP)

### Fixes applied

1. **One canonical API-base resolver, and no direct env reads.** `frontend/lib/baseUrl.ts` is the only place `NEXT_PUBLIC_API_URL` is read; `lib/api.ts`, `app/api/proxy/[...path]/route.ts`, and `FleetOnboardingModal` all call it. `sanitizeBaseUrl` strips whitespace/quotes/trailing slashes, rejects non-http and relative values and the decommissioned `prehub-backend.onrender.com`, and returns `null` instead of a best-effort string. The WebSocket base is resolved per connection via `getWsBaseUrl()` — the old module-scope `WS_BASE` captured `ws://localhost:8000` into deployed bundles.
2. **Search relevance, dedupe, and cache semantics.** `/geocode/search` ranks by `(score, tier, len(slug), slug)` and ranks *before* truncating to `limit`; alias duplicates are collapsed by proximity (1.5 km server, 0.05° client with parenthesis-stripped names) instead of by name; a 20 s deadline raises a distinct `Error` (`Pencarian backend melebihi 20 detik`), never `AbortError`; only non-empty results are cached; Redis keys moved to `lrip:geocode:search:v2:` (`ex=86400`); an exact gazetteer hit skips the Nominatim call entirely.
3. **Gazetteer data honesty.** `/geocode/nodes` skips coordinate-less entries with a warning instead of defaulting to the Medan centroid; the client badge derives from an explicit type vocabulary and falls back to `Titik`, not `Desa`.
4. **Dispatcher tenant scope is the token claim.** `vehicles_router` branches on role *before* reading `?company_id=`; for a dispatcher the claim wins and the query is ignored. `get_unified_fleet` applies authorization (`matches_tenant`) before modality via `tenant_only`; `FALLBACK_FLEET` is never substituted for a dispatcher; the 90 s vehicle cache is cleared on role/tenant change; a null `path` is normalized to `[]` so one un-routed row cannot 500 the collection; the retry path keeps `Authorization` and `getBaseUrl()`.
5. **Master data split from transactions.** `truck_assets` (registered once, tenant-owned) + `travels` (append-mostly, snapshotting `truck_name`/`company_id`/`driver_name`) in migration 014; `truck_id` is the business key and the ledger never depends on the asset row surviving. `resolve_truck_asset` still reads legacy `custom_fleet_vehicles`.
6. **Every rupiah/percent has a provenance path.** ERP figures are summed from persisted `travels` columns and named constants; `actual_recorded=false` mirrors baseline (zero savings); savings items are rounded once at the component boundary so `saved_total == baseline − actual` and `split ≈ saved_cost`; missing values render `Belum tersedia` / `Belum terverifikasi`. Artificially computed numbers left `HoldVsRerouteCard` / `MitigationTab`.
7. **Coordinates are required at the schema boundary.** Gazetteer failure invalidates any previously selected coordinate; `[0,0]` and centroid defaults are not acceptable substitutes for "unknown".

### Concerns (open, evidenced)

1. **Render free-tier cold start (30–77 s observed) exceeds the 20 s client deadline** — the first search after idle fails; the failure is honest and retryable but there is no warm-up path.
2. **CORS preflight during boot surfaces as a browser CORS error**, not the backend-asleep copy; the same 20 s deadline does not produce the intended message.
3. **Supabase is provisioned but not written.** All asset/travel writes go to instance SQLite; `build_erp_summary` hardcodes `storage="local_sqlite"`; `sync_status='pending'` has no drain caller (`mark_as_synced` is never invoked outside `local_storage.py`), so a Render redeploy discards fleet and ERP history.
4. **RLS on migration 014 tables is effectively open** (`USING (true)` / `WITH CHECK (true)` for `authenticated`); tenant isolation currently rests on router filters.
5. **Single-record reads are unscoped** — `GET /fleet/trucks/{id}`, `GET /fleet/travels/{id}` take no session; `PATCH /travels/{id}` checks `fleet:write` but not tenant ownership.
6. **Actual toll defaults to zero** when `actual_recorded` is true and no segments are supplied, overstating toll savings; the wizard has no actual-toll control.
7. **Stale cache keys survive 24 h** — v1 keys are ignored but never deleted, and an intermediate build's `v2` entries bypass the fix.
8. **Synchronous Redis calls inside async endpoints** (`socket_timeout=5`) can block the event loop for seconds when Redis is configured but unreachable.
9. **In-flight fleet fetch is not cancelled on role switch** (no `isMounted`/sequence guard), so a slow request can render the previous tenant briefly.
10. **Whole-response validation still has fleet-wide blast radius** — the `path` guard covers one trigger; other required fields can still 500 the list.
11. **`matches_tenant` org-name fallback is a heuristic**; `truck_assets` rows created outside a dispatcher session default to `org-prehub-pilot`.
12. **Playwright boots only the frontend** (`webServer` has no backend entry), so any API-backed wizard spec is environment-dependent; there is also no client test for search ranking, dedupe, or cancel.
13. **Type vocabulary is duplicated across the API boundary** (`hub | kecamatan | regency` vs `searchResultBadge`); a new backend type silently degrades to `Titik`.
14. **ERP panel does not refresh after onboarding** — `ERPSavingsPanel` accepts `refreshKey` but `ReportsSection` renders it without one.
15. **Unrelated suite failures in this environment:** `simulate/stream` needs absent `langgraph`; `resolve_canonical_article_url` expects `google.com/search` while the resolver returns the publisher search URL; one order-dependent fleet test passes standalone but failed in a 6-file combined run.

### Constraints and environment

- Frontend prod `https://pre-hub.vercel.app` (Next.js `output: 'standalone'`, **no `vercel.json`**); backend `https://peta-nadi.onrender.com`; local `:3000` → `:8000`.
- Vercel `NEXT_PUBLIC_API_URL` inspected on 2026-10-20 inlines `https://peta-nadi.onrender.com` — the defect was a **structural bypass of the resolver**, not a dead-host env value. Any future env edit still reaches unvalidated path concatenation if a direct read returns.
- CORS allowlist: `pre-hub.vercel.app`, `peta-nadi.onrender.com`, `localhost:3000` (`render.yaml` `CORS_ORIGINS`, `allow_origin_regex` covers `*.vercel.app`).
- `render.yaml` service renamed `prehub-backend` → `peta-nadi`; a dashboard-side rename must be reconciled or the service can take a new URL — check health check and `CORS_ORIGINS` before the next deploy.
- Roles: `dispatcher → pos_logistik`, `regulator → bapanas`, `guest → demo_sandbox`; claim resolution `app_metadata.company_id` → `user_metadata.company_id` → `profiles.company_id` → role default.
- Windows PowerShell, mixed CRLF/LF (git warns on `frontend/lib/types.ts`); gates are `tsc` + `pytest`, no shell scripts touched. Python 3.13, Pydantic 2.13 (v1-style `Config` deprecation).
- Verification states are distinct: *in tree*, *built*, *deployed*. Local `tsc` exit 0 and green tests do not prove the deployed pair changed; use a cheap sentinel (e.g. `precision_tier` on `/geocode/nodes`).

### Issues found — do not repeat

- Do not claim a resolver is centralised while any call site reads `process.env.NEXT_PUBLIC_API_URL` directly (grep it) or captures an env value at module scope.
- Do not reuse `AbortError` for a deadline; cancellation and timeout have different UI outcomes and a shared identity leaves `isSearching` stuck.
- Do not cache empty/negative results, do not rely on dict/list insertion order for relevance, and do not `break` at `limit` before sorting.
- Do not default a missing coordinate to a city centroid or `[0,0]`; skip and warn, or fail the schema.
- Do not default a UI type label to a specific class (`Desa`); use the neutral term.
- Do not let a query parameter widen a token-derived scope, and never `OR` a modality allowlist with a tenancy predicate — it silently disables tenancy.
- Do not substitute mock/fleet fallback data for a scoped role; empty is a valid, renderable answer.
- Do not write `sync_status='pending'` without a drain worker; a status the runtime does not honour is a silent data-loss contract.
- Do not treat "field not recorded" as zero when the number feeds a savings claim.
- Do not add an e2e spec for an API-backed flow to a harness that only starts the frontend.

---

## 2026-10-23 - Phases 97-99: Pilot-to-Real Interference Fixes, Risk Batch, Walkthroughs

**Scope:** WP1-WP7. Docs live in `.planning/phases/97-pilot-interference-core/`, `98-ingestion-resilience-and-alert-bridge/`, and `99-honest-ui-and-risk-batch/`.

### Decisions

1. **Dedup terminates at Stage 1.** `agents/graph.py:32,69` sends `status="duplicate"` to `END`; `agents/nodes/data_collection.py:19,808` exempts operator/UI and simulation sources so the demo and interactive re-runs are never swallowed by the 300 s TTL.
2. **Confidence is weather-grounded.** `agents/nodes/data_collection.py:246,857-865` derives confidence from warning level, precipitation, flood risk, wind, BMKG code, and payload severity. Supabase `data_sources` health is diagnostic only.
3. **E channel votes only when it has an observation.** `agents/tools/consensus_gate.py:29,39,358-361` selects `W 0.35 / T 0.25 / I 0.20 / E 0.20` when `econ_conf > 0.50`, otherwise `W 0.4375 / T 0.3125 / I 0.25 / E 0.0`. A permanently-on 0.20 E weight structurally capped physical crises at `P_max = 0.688`.
4. **Degrade, but say so.** PIHPS falls back to 14 days of `commodity_prices` (`economic_intelligence.py:19,88-116`); STM/dedup falls back to a bounded 500-entry local store (`stm.py:23-67`); OSINT falls back to 12 h of recent news (`osint_hazard.py:45,232,365`); prediction uses `SCAN` and a 25 km corridor anchor (`prediction.py:146,292`). Each path records a source/provenance field.
5. **News replay is idempotent.** Deterministic UUIDv5 incident/approval ids + `upsert` (`unified_news_ingestor.py:648-658,715,769-798`). A news-derived incident is excluded from hazard fusion (`supabase_tools.py:581-610,684-692`) so a story cannot corroborate itself.
6. **Alerts cross workers.** `alert_fanout.py:44,223` tails `lrip:stream:validated_alerts`; `main.py:307-314` starts the consumer in every API process; dedup identity is `(crisis_id, timestamp)` or a stable SHA-1.
7. **UI cannot fake success.** Archived signals force `validated=false` and open `Evidence` with an `info` toast (`useCrisisSimulationStream.ts:177-178`; `DashboardClient.tsx:1965-1990`). Fallback news is labelled and excluded from the PIHPS-live indicator (`DashboardClient.tsx:2663-2667,3000`).
8. **Brier uses two explicitly named scales.** NFR-4 scores `calibrate_confidence_scale(raw_prob, active_sources, SENSOR_WEIGHTS_ECONOMIC_ACTIVE)`; the raw product stays as `raw_brier_score` telemetry. Detection stays at `0.50` raw (equiv. `0.727` normalized). `overall_confidence` is not scored because its `0.50` OSINT cap would clip the benchmark.
9. **Canonical URLs stay on the publisher.** `news_aggregator.py:328-405` unwraps Google redirect/AMP links, rejects any `google.` host, and falls back to `_map_publisher_deep_fallback` for undecodable tokens.
10. **HITL is auth-first.** `test_audit_fixes.py:72-94` asserts `401` without a token and `422` only after a valid Dispatcher token.

### Verification (docs pass)

| Suite | Result |
|---|---|
| `test_agents.py + test_adapters.py + test_bmkg_consensus_validation.py` | 49 passed |
| `test_consensus_calibration.py` | 12 passed |
| `test_scrapers.py` | 22 passed |
| `test_news_pipeline.py + test_osint_leak_hardening.py + test_phase76_news_spatial_consensus.py` | 84 passed |
| `test_pilot_e2e.py` | 9 passed |
| `test_audit_fixes.py + test_cross_workstream_integration.py` | 10 passed |
| `npx tsc --noEmit` | exit 0 |
| `test_benchmark_eval.py + test_evaluation_router.py` | 7 passed, 1 failed (`TP 35 != 34`) |

The window log reported WP1 48, WP2 41p/1f (Brier), WP3 22+114, WP4 22+104, WP5 36, WP6 tsc PASS, risk batch 14. The re-run counts above are the subsets actually re-executed; differences are collection drift, not silently changed results.

### Open concerns

- `test_evaluation_router.py::test_get_benchmark_report` is red after normalization (`true_positives` 35 vs expected 34). No decision recorded yet on the correct label/cut.
- The validated-alert bridge has no direct test (`grep` over `backend/tests` finds no `alert_fanout`/`validated_alert` reference).
- STM/dedup fallback is per process; two workers can accept the same event during a Redis outage.
- A held `lrip:lock:news_ingestor` silently skips a cycle for up to 240 s; the skip is logged but not surfaced in the API response.
- UI honesty changes have TypeScript coverage only; no browser assertion for archived tab/toast or fallback labels.
- `isFallbackNews` uses object identity, so a cloned fixture would not be labelled.

### Mistakes not to repeat

- Do not leave a dead E weight in the consensus formula; renormalize physical weights when E has no observation.
- Do not use source health as crisis confidence.
- Do not let a news article corroborate itself via the incident polygon created from it.
- Do not use `KEYS` on a shared Redis event loop; use `SCAN`.
- Do not make Redis a single point of failure for STM/dedup; degrade to a bounded local store.
- Do not let archived/rejected UI reuse the success path (Mitigation tab + savings toast).
- Do not default a validation flag to `true`.
- Do not rely on Batchexecute as the only canonical-URL resolver; keep the publisher fallback and test the undecodable case.
- Do not validate the body before authentication; `401` must precede `422`.
- Do not compare raw-product Brier to a normalized NFR-4 target; name the scale.
- Do not change a benchmark expectation just to make it green; record the label/cut decision.

### Process constraints (this window)

- DeepSeek subagents only, to keep manager context uncluttered.
- Manager-only coordination; no direct manager edits.
- `git add .` then one conventional commit, then `git push origin main` for Vercel visibility.
- Continue numbering from the observed maximum phase (96).
- Final docs under `.planning/phases/`; never `%TEMP%` or `/tmp`.
- Keep the demo fixture intact and CPU routing only.
- Keep the BMKG warning-code mapping (`60 -> 25 / 55`, `95/97 -> 65.5 / 87.5`).
- Workflow: grill first, then boost.
- `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example` are off-limits.

---

## 2026-10-26 — Phase 138: Evaluasi Credibility Docs Commit (`.planning/phases/138-evaluasi-credibility-docs-commit/`)

### Fixes (verified in tree)

1. Ringkas+expandable evaluasi UI; batch immutable (`batch-v2026-10-26-N60`) + live recompute with metrics null when N<10 (`backend/app/routers/evaluation_router.py`).
2. Diagnostik live-wire: per-probe AbortController, 15 s timeout (`SystemObservabilitySection.tsx:151,157`).
3. Keep-alive `--max-time 90` on `/health`; `healthCheckPath: /health` in `render.yaml` (`ccb5bbd`).
4. Pred tersimpan: nullable forecast columns via `021_pred_tersimpan.sql` (idempotent; NULL rows excluded as `missing_pred`).
5. Offline ledger per-row `row_hash` + raw vs normalized Brier (`outcome_evaluation_service.py:252,380-423,588-603`); UI hash/download (`EvaluationSection.tsx`).

### Concerns

- Benchmark 100% circular-synthetic; P_max 0.688 with 0.0063 pass margin; ECE 0.1994; static `DEFAULT_BENCHMARK_REPORT` can mask a missing report file; echo-exclusion label sensitivity; delay/4.0 proxy circularity for forecast-less rows; no fitted `.pkl` calibrator.

### Constraints / conditions

- DO NOT touch `agents/graph.py`, consensus-gate formula, SSE `simulate/stream`, or `lifespan`; Vercel prod from main; Render free-tier 30-77 s cold start; Supabase primary ledger; orchestrator delegates to high subagents; no parallel `DashboardClient.tsx` edits. Branch `evaluasi-credibility-milestone-20261026`; backend `peta-nadi.onrender.com`; `NEXT_PUBLIC_API_URL` baked; `OPENCODE_API_KEY`/`MAP_KEY` via render env sync.

### Issues (do not repeat)

- Flaky `solver_latency<10ms` point assertion (measured live per request); stale `STATE.md` vs filesystem; duplicate phase numbers 107/118/119 (use full slugs); `TestMatrixTable` still partial; live N=0 must render honest-empty; `git add .` risks `screenshots/` + `Final-Gemastik/` + `outputs/`.
