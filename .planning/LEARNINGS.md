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
