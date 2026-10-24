---
phase: 103
phase_name: Industry Validation Alignment — Tactical Cargo Tiering, Non-Natural Social Hazard Ingestion & Empiric Verification HUD
milestone: M6
milestone_name: 3D Globe Native Mapbox Fleet, Street-Snapping & Impeccable Cartography
created_at: "2026-10-24T11:05:00.000Z"
status: planned
framework: GSD
---

# Phase 103: Industry Validation Alignment — Tactical Cargo Tiering, Non-Natural Social Hazard Ingestion & Empiric Verification HUD

## Context & Objectives
Following deep research and critical evaluation of stakeholder validation interviews (**PT Multi Terminal Indonesia / Pelindo**, **PT Socfin Indonesia**, **PT Bumi Sawita Nusantara Berjaya / PT Sawita**, and **Ditmawalumni USU**), PreHub requires high-leverage tactical alignments that address industry realities without disrupting core architecture:

1. **Pelindo Cold-Chain vs. Dry-Bulk Cost Matrix**:
   - Pelindo highlighted that logistics disruption costs critically depend on cargo type: refrigerated containers (*reefer*) burn continuous diesel fuel ($\sim\text{Rp } 45.000/\text{jam}$) to maintain temperature during traffic jams or detours, whereas dry bulk cargo experiences zero fuel penalty and negligible spoilage.
   - While `backend/app/services/spoilage_hedging_service.py` already contains a 4-tier model (`COLD_CHAIN`, `ULTRA_PERISHABLE`, `SEMI_PERISHABLE`, `DRY_BULK`), the frontend currently lacks a quick-selection mechanism in the simulator interface, leaving `commodity` unpassed and route hedging in an *honest null* state ("Data tidak tersedia").
   - Furthermore, the current backend engine calculates genset fuel solely during `HOLD` (depot staging), omitting active genset burn during `CONTINUE` (delay waiting) and `REROUTE` (extra detour transit hours).

2. **Ditmawalumni USU Social Disruption Ingestion (Non-Natural Hazards)**:
   - Field operations along the Trans-Sumatra Highway are frequently paralyzed by non-meteorological disruptions: illegal extortion checkpoints (*pungli*), local civil blockades (*pemblokiran jalan*), and community protests (*unjuk rasa*).
   - PreHub's NLP pipeline currently focuses heavily on hydrometeorological disasters (floods, landslides, earthquakes). Social and civil blockages must be ingested into the `road_closure` taxonomy to generate proactive detour routes.

3. **PT Sawita & Socfin Empiric Verification & Transparency Demands**:
   - PT Sawita's executive leadership critically challenged AI claims, demanding measurable proof (detection precision, false alarm rate, latency) and absolute transparency regarding live vs. fallback data sources.
   - PT Socfin emphasized driver dispatch safety and vessel tracking continuity in Aceh and the Malacca Strait.
   - PreHub already possesses an empirical $N=60$ benchmark dashboard (`EvaluationSection.tsx`), but its connection to daily route decision modals must be prominently surfaced.

---

## Design System & UI/UX Standards (Impeccable & Anti-Slop)

- **Design Read**: Mission-critical logistics command center for enterprise dispatchers and terminal operators; dark tactical command aesthetic (`#080d14` base canvas, Glassmorphism 2.0 `backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10`).
- **The Three Dials**:
  - `DESIGN_VARIANCE: 5` (Operational cockpit, high structure, zero goofy chaos)
  - `MOTION_INTENSITY: 4` (Smooth 150ms-250ms transitions, no dizzying animation)
  - `VISUAL_DENSITY: 8` (High data density, tabular monospace metrics, compact tactical pills)
- **Strict Anti-Slop Invariants**:
  - ❌ **HARAM**: AI purple/pink gradients (`from-purple-600 to-pink-500`).
  - ❌ **HARAM**: Emojis as primary structural UI icons. Must use crisp SVGs from `lucide-react` (`Snowflake`, `Sprout`, `Package`, `ShieldAlert`, `Scale`).
  - ✅ **WAJIB**: `cursor-pointer` on all interactive buttons, pills, dropdown items.
  - ✅ **WAJIB**: Stacking order matrix (`z-35` for simulator popovers/bubbles, `z-40` for sidebars, `z-50` for top nav).

---

## Work Packages

### WP1: UI Cargo Tier Quick-Selector & Frontend Hedging Integration
- **Target Files**:
  - `frontend/components/map/CrisisSimulatorBar.tsx`
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/components/sidebar/RouteDetailModal.tsx`
- **Actions**:
  1. Add a compact, tactical **Cargo Preset Selector** (`CargoTierSelector`) to `CrisisSimulatorBar.tsx` featuring 3 curated industry tiers:
     - `❄️ Cold Chain` (Lucide `Snowflake` SVG): sets `commodity: 'ikan_segar'`, tonnage `10.0 Ton`, `vehicle_golongan: 'GOL_II'`.
     - `🌶️ Hortikultura` (Lucide `Sprout` SVG): sets `commodity: 'cabai_merah'`, tonnage `10.0 Ton`, `vehicle_golongan: 'GOL_II'`.
     - `🌾 Kargo Kering` (Lucide `Package` SVG): sets `commodity: 'beras'`, tonnage `10.0 Ton`, `vehicle_golongan: 'GOL_II'`.
  2. In `DashboardClient.tsx`, maintain active `selectedCommodity` in React state and synchronize it with `hedgingOpts` when triggering `api.routing.optimizeRouting(...)`.
  3. In `RouteDetailModal.tsx`, when `route.hedging` is present, render:
     - Net Savings badge (`text-emerald-400 font-mono font-bold`)
     - Spoilage Risk loss (`text-rose-400 font-mono`)
     - Reefer Genset Breakdown badge (e.g. `Reefer Genset: Rp 540.000` when cold-chain is active).
     - Maintain honest null state ("Kargo belum dipilih") when no commodity is selected.
- **Proof of Work**: Clicking `Cold Chain` immediately triggers re-routing with active hedging metrics, showing diesel genset cost and spoilage risk in `RouteDetailModal.tsx`. 0 TypeScript errors.

---

### WP2: Backend Spoilage Hedging Engine Precision (Moving Genset Calculation)
- **Target Files**:
  - `backend/app/services/spoilage_hedging_service.py`
  - `backend/tests/test_spoilage_hedging.py` (or relevant test suite)
- **Actions**:
  1. In `spoilage_hedging_service.py`, enhance Policy 1 (`CONTINUE`) and Policy 2 (`REROUTE`) to account for active genset fuel consumption during delay and detour:
     - For `CONTINUE`: When `tier_info["requires_reefer"] is True`, add `continue_reefer_cost = delay_hours * tier_info["genset_cost_per_hour"]` into `cost_continue` and breakdown dictionary.
     - For `REROUTE`: When `tier_info["requires_reefer"] is True`, add `reroute_reefer_cost = req.detour_time_hours * tier_info["genset_cost_per_hour"]` into `cost_reroute` and breakdown dictionary.
  2. Ensure explanation strings reflect cold-chain genset operating expenses during active transit and waiting.
  3. Verify deterministic execution on CPU with zero performance regression.
- **Proof of Work**: Pytest unit test confirms `COLD_CHAIN` reflects active genset expenses on all 3 policies (`CONTINUE`, `REROUTE`, `HOLD`), while `DRY_BULK` incurs `Rp 0` genset expense.

---

### WP3: Non-Natural Social Disruption NLP Ingestion (Ditmawalumni USU)
- **Target Files**:
  - `backend/app/services/news_aggregator.py`
  - `backend/app/nlp/news_extractor.py`
  - `backend/tests/test_pre_llm_filter.py`
- **Actions**:
  1. Expand `LOGISTICS_DISASTER_KEYWORDS` in `news_aggregator.py` with social and extortion keywords:
     `"pungli"`, `"pos pungli"`, `"pemalakan"`, `"pemblokiran jalan"`, `"blokade warga"`, `"unjuk rasa"`, `"aksi massa"`.
  2. In `news_extractor.py`, map civil blockades and extortion disruptions directly to `disaster_type = "road_closure"`.
  3. Set default severity for physical road blockades to `0.80` (High Disruption) so the router automatically avoids congested or blocked corridors.
  4. Ensure zero-token regex filtering correctly permits social disruption articles without LLM hallucination.
- **Proof of Work**: `test_pre_llm_filter.py` validates that articles containing `"pos pungli Lintas Sumatera"` and `"warga blokir jalan"` pass the regex gate and map to `road_closure`.

---

### WP4: Empiric Evaluation HUD Prominence & Grounding
- **Target Files**:
  - `frontend/components/sidebar/RouteDetailModal.tsx`
  - `frontend/components/dashboard/EvaluationSection.tsx`
- **Actions**:
  1. In `RouteDetailModal.tsx`, add a tactical footer link/badge:
     `"Metrik Validasi Empiris: 92.5% Presisi (N=60 Benchmark) →"` that smoothly navigates or opens `EvaluationSection.tsx`.
  2. Add high-contrast data provenance indicators (`[LIVE TOMTOM]`, `[BMKG RADAR]`, `[AIS STREAM]`, `[SEED FALLBACK]`) with tactical micro-tooltips explaining source credibility, directly resolving PT Sawita's data transparency requirements.
  3. Include disclaimer in RouteDetailModal: `"Prinsip Operasional 20/80: Rekomendasi rute sistem merupakan panduan digital awal; konfirmasi kondisi fisik lapangan dan kelas jalan tetap menjadi kewenangan Dispatcher."`
- **Proof of Work**: Visual inspection of RouteDetailModal confirms data provenance badges, 20/80 operational disclaimer, and link to empirical benchmark.

---

### WP5: Verification Gate & Regression Check
- **Execution Checklist**:
  1. `rtk npx tsc -p frontend/tsconfig.json --noEmit` -> Exit code 0.
  2. `rtk pytest backend/tests/test_spoilage_hedging.py` (or routing tests) -> All pass.
  3. `rtk pytest backend/tests/test_pre_llm_filter.py` -> All pass.
  4. `rtk npx tsx frontend/scripts/test_turn_by_turn.ts` -> 4/4 assertions pass.
  5. `rtk npx tsx frontend/scripts/test_state_isolation.ts` -> 4/4 assertions pass.

---

## Deliverables Summary
| Work Package | Focus Area | Impacted Files | Verification |
|---|---|---|---|
| **WP1** | UI Cargo Tier Quick-Selector | `CrisisSimulatorBar.tsx`, `DashboardClient.tsx`, `RouteDetailModal.tsx` | 3-Pill selector active, zero slop, instant hedging display |
| **WP2** | Precision Spoilage Hedging Engine | `spoilage_hedging_service.py` | Active genset cost on detour/delay; unit test verified |
| **WP3** | Social Disruption NLP Ingestion | `news_aggregator.py`, `news_extractor.py` | Pungli/blokade mapped to `road_closure`; regex gate verified |
| **WP4** | Empiric HUD Prominence & Provenance | `RouteDetailModal.tsx`, `EvaluationSection.tsx` | 20/80 disclaimer, data provenance badges, N=60 link |
| **WP5** | Full Verification Gate | Backend + Frontend test suites | Typecheck clean, all unit tests passing |
