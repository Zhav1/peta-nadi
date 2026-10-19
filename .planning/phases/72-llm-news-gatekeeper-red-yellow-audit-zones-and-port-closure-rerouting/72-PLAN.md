# Phase 72 Plan: LLM News Gatekeeper, Red/Yellow Audit Zones & Port-Closure Modality Rerouting

## Execution Strategy

### WP1: DB-First News Deduplication, Bureau/Dateline Stripping & Economical 3-Tier LLM Gatekeeper
- **Files**:
  - `backend/app/services/news_aggregator.py`
  - `backend/app/services/unified_news_ingestor.py`
  - `backend/app/nlp/ner_pipeline.py`
  - `backend/app/nlp/geocoding_service.py`
  - `backend/app/nlp/news_extractor.py`
  - `backend/app/routers/news_router.py`
- **Actions**:
  1. In `news_aggregator.py`: add `fetch_existing_processed_articles_map()` (Supabase `news_articles` + in-memory cache check) called before any LLM work; expand `EXCLUDED_NOISE_KEYWORDS`; add `strip_bureau_and_dateline_noise()` so outlet/bureau headers (`"ANTARA Bengkulu"`, `"Bengkulu (ANTARA) -"`, `"Medan (Antara)"`, `"lkbn antara <prov>"`, `"detiksumut"`, `"cnbc indonesia"`) are removed before location matching.
  2. In `geocoding_service.py`: `resolve_sumatra_location_and_corridor()` returns `is_geocoded=False, latitude=None, longitude=None, location_precision="none"` when no gazetteer node matches cleaned body text; distinguish `exact_node` vs `province_only`; never emit province centroid as fallback coordinate.
  3. In `news_extractor.py`: implement `_fast_heuristic_extraction()` (deterministic tier `RED_CONFIRMED` / `YELLOW_CLARIFY` / `DROPPED_IRRELEVANT`), `_build_impact_profile()`, `extract_structured_news_batch()` (LLM overlay only for unprocessed items; LLM `DROPPED_IRRELEVANT` respected; `RED_CONFIRMED` without geocode clamped).
  4. In `news_router.py` + `unified_news_ingestor.py`: pack `zone_tier`, `tier_reason`, `custom_hazard_label`, `impact_profile`, `is_geocoded`, `location_precision` into existing `ground_truth_metrics` JSONB (no new-column migration); add `_unpack_ground_truth_metrics` + `_fast_heuristic_extraction` on read to clean/re-tier legacy polluted rows.
- **Verification**: `pytest backend/tests -q` (news extractor, geocoding, aggregator suites); confirm zero LLM calls for already-processed IDs; confirm `"ANTARA Bengkulu"` article no longer resolves to `(-3.8004, 102.2655)`.

### WP2: Interactive Red & Yellow Map Zones, Independent Checkboxes & Stored Audit-Trail Inspection
- **Files**:
  - `frontend/lib/types.ts`
  - `frontend/hooks/useNewsVerification.ts`
  - `frontend/components/map/CrisisMap.tsx`
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/components/sidebar/CrisisSidebar.tsx`
  - `frontend/components/sidebar/EvidenceTab.tsx`
- **Actions**:
  1. In `types.ts`: extend news/zone types with `zone_tier`, `tier_reason`, `custom_hazard_label`, `impact_profile` (`affected_modalities`, `passability`, `estimated_delay_hours`), `is_geocoded`, `location_precision`.
  2. In `CrisisMap.tsx`: add click + hover listeners on `disaster-zones-fill` / `disaster-zones-outline`; style fill/outline by `zone_tier` (`#ef4444` Red vs `#eab308` Yellow); forward zone-click events to `DashboardClient`.
  3. In `DashboardClient.tsx`: add independent `showRedZones` / `showYellowZones` state + `[x] Zona Merah` / `[x] Zona Kuning` checkboxes; replace `handleMapPointTargeted()` -> `triggerFullSimulationEngine()` on news `"Fokus"` (lines 1528-1543) with `inspectNewsOrZoneAuditTrail()` which flies to the zone and opens the stored Audit Trail in `CrisisSidebar` at zero LLM/simulation cost.
  4. In `CrisisSidebar.tsx` / `EvidenceTab.tsx`: render stored tier badge, `tier_reason`, `custom_hazard_label`, impact profile, and source permalink for the inspected zone/news.
  5. In `useNewsVerification.ts`: surface `zone_tier`/`tier_reason` classification reasons (Red = high-strength official source; Yellow = low-medium intensity, monitor before full reroute).
- **Verification**: `npx tsc --noEmit` (0 errors); browser check: both checkboxes filter zones independently; zone click and news `"Fokus"` open Audit Trail drawer without launching synthetic simulation.

### WP3: Expanded 10-Hazard Sumatra Taxonomy & Dynamic ImpactProfile
- **Files**:
  - `backend/app/nlp/news_extractor.py`
  - `backend/app/services/impact_assessment_service.py`
  - `backend/app/services/llm_reasoning_service.py`
  - `frontend/lib/types.ts`
  - `frontend/components/map/CrisisSimulatorBar.tsx`
  - `frontend/components/sidebar/MitigationTab.tsx`
- **Actions**:
  1. Expand canonical hazard set to 10: `flood`, `port_closure`, `marine_wave`, `road_closure`, `landslide`, `earthquake`, `volcanic_eruption`, `wildfire`, `congestion`, `other_disruption` (replacing 6-type frontend `CrisisType` that silently coerced unknowns to `'flood'`).
  2. Add `_DEFAULT_HAZARD_LABELS` + per-hazard `_build_impact_profile()` emitting `custom_hazard_label`, `affected_modalities`, `passability` (`BLOCKED`/`RESTRICTED`/`CLEAR`), `estimated_delay_hours`.
  3. Thread `hazardType` through `impact_assessment_service.py` and `llm_reasoning_service.py` so reasoning and delay estimates reflect the true hazard (not default 14h flood clearance).
  4. In `CrisisSimulatorBar.tsx`: add `port_closure` option (`Penutupan Pelabuhan`, Anchor icon); in `MitigationTab.tsx`: render dynamic label + modality/passability chips.
- **Verification**: `pytest` impact-assessment suites; `tsc --noEmit`; confirm `marine_wave`/`road_closure` articles no longer display as `Banjir`.

### WP4: Penutupan Pelabuhan (port_closure) & Modality-Aware Rerouting
- **Files**:
  - `frontend/lib/aiDynamicRouter.ts`
  - `backend/app/services/cpu_routing_service.py`
  - `agents/nodes/route_optimization.py`
  - `frontend/components/sidebar/MitigationTab.tsx`
- **Actions**:
  1. In `aiDynamicRouter.ts`: add `isSeaportBlockedByHazard()` with `max(radiusKm + 8, 22)` km capture radius; add `findClosestOpenSeaport()` excluding blocked ports; wire alternate-port intermodal failover (`Truck Feeder -> Next Open Port -> Sea`) at lines ~1019-1052; pass `hazardType` into `calculateHoldVsRerouteEconomics()` (fix line 1346 omission); set port-hazard node buffer to 6.0 km; attach `buildRouteTradeoffAnalysis()` (Pros, Cons, ΔWaktu, ΔBiaya breakdown) to every route option (line ~1763).
  2. In `cpu_routing_service.py` + `agents/nodes/route_optimization.py`: mirror port-blockage penalty so backend Dijkstra avoids ports covered by `port_closure`/`marine_wave`; keep Hold-at-Port/Buffer-Depot and full Land/Air shift as ranked alternatives.
  3. In `MitigationTab.tsx`: render `tradeoff_analysis` per route card (operational cost breakdown, delay delta).
- **Verification**: router failover check — Pelabuhan Asal under `Penutupan Pelabuhan` selects next open port (no route through closed port); `npx tsc --noEmit` 0 errors; `pytest` routing suites pass.

---

## Verification Plan

1. **Static Typecheck**: `npx tsc --noEmit` from `frontend/` (0 errors).
2. **Python Tests**: `pytest backend/tests -q` (all suites pass; news/geocoding/routing green).
3. **Router Failover Check**: scripted `findClosestOpenSeaport` + `calculateHoldVsRerouteEconomics(hazardType='port_closure')` probe — closed origin port bypassed, tradeoff deltas present.
4. **Live Deployment Checks (post-push)**: `GET https://peta-nadi.onrender.com/api/v1/news/live` shows tiered zones with no province-centroid pollution; `https://pre-hub.vercel.app` Red/Yellow checkboxes, zone-click Audit Trail, and Pelabuhan Asal alternate-port rerouting verified in browser.
