# Consolidated Learnings: Phases 64–68

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
