# Phase 72 Walkthrough: LLM News Gatekeeper, Red/Yellow Audit Zones & Port-Closure Rerouting

## WP1 — DB-First Deduplication, Bureau/Dateline Stripping & 3-Tier Gatekeeper (Backend)

### `backend/app/services/news_aggregator.py`
- Added `fetch_existing_processed_articles_map()` — queries Supabase `news_articles` plus in-memory cache for already-seen article IDs **before** any LLM call, so re-ingested items (including `DROPPED_IRRELEVANT`) never burn duplicate LLM tokens during the 5-minute background RSS cycle.
- Added `strip_bureau_and_dateline_noise()` — removes outlet/bureau/province headers (`"ANTARA Bengkulu"`, `"Bengkulu (ANTARA) -"`, `"Medan (Antara)"`, `"lkbn antara <prov>"`, `"antara <prov>"`, `"antaranews.com"`, `"detiksumut"`, `"cnbc/cnn indonesia"`) prior to location matching. Root cause fixed: feed-level `fallback_province` (`Bengkulu`) previously flowed into the geocoder and produced a province-centroid pin.
- Expanded `EXCLUDED_NOISE_KEYWORDS` so ads and off-topic items are rejected at ingestion before Supabase persistence.

### `backend/app/nlp/geocoding_service.py`
- `resolve_sumatra_location_and_corridor()` now returns `is_geocoded=False, latitude=None, longitude=None, location_precision="none", matched_node=None` when no gazetteer town/road node matches the **cleaned body text**. The old behavior returned the province centroid `(-3.8004, 102.2655)` whenever the body had no match (with `is_geocoded=False` ignored downstream). Added explicit `exact_node` vs `province_only` precision levels; bare province mentions no longer yield coordinates.

### `backend/app/nlp/ner_pipeline.py`
- Extended the Pan-Sumatra gazetteer/alias coverage backing the cleaned-text matcher (ports, toll segments, arterial corridors) so `strip_bureau_and_dateline_noise()` output resolves to real nodes instead of falling through.

### `backend/app/nlp/news_extractor.py`
- Implemented `_fast_heuristic_extraction()` (deterministic, zero-LLM): keyword + geocode + impact signals map to `RED_CONFIRMED` (confirmed corridor impact, `passability` in `BLOCKED`/`RESTRICTED`, geocoded exact node), `YELLOW_CLARIFY` (weak signal / province-only / needs monitoring), or `DROPPED_IRRELEVANT` (ad noise, no hazard signal, or ungeocoded).
- Implemented `_build_impact_profile()` + `_DEFAULT_HAZARD_LABELS` for the 10-hazard taxonomy, emitting `custom_hazard_label`, `affected_modalities`, `passability`, `estimated_delay_hours`.
- Implemented `extract_structured_news_batch()` — DB-first: skips processed IDs, runs the heuristic gatekeeper first, then applies the live LLM tiering overlay only to unprocessed items (gated on `OPENCODE_API_KEY` on Render); an LLM `DROPPED_IRRELEVANT` verdict is respected, and an LLM `RED_CONFIRMED` without geocode is clamped down.

### `backend/app/services/unified_news_ingestor.py` + `backend/app/routers/news_router.py`
- All new metadata (`zone_tier`, `tier_reason`, `custom_hazard_label`, `impact_profile`, `is_geocoded`, `location_precision`) is packed into the existing `ground_truth_metrics` JSONB column — no schema migration, safe for production Supabase.
- Read path adds `_unpack_ground_truth_metrics` + `_fast_heuristic_extraction` so legacy polluted rows (province-centroid pins) are cleaned/re-tiered on read in `GET /api/v1/news/live`.

### `backend/app/services/impact_assessment_service.py` + `llm_reasoning_service.py`
- Both now accept and propagate the true `hazardType`; delay/clearance reasoning no longer defaults everything to a 14h flood figure.

### `backend/app/services/cpu_routing_service.py` + `agents/nodes/route_optimization.py`
- Backend Dijkstra mirrors the frontend port-blockage rule: ports covered by `port_closure`/`marine_wave` radii receive blocking penalties, keeping Hold-at-Port/Buffer-Depot and full Land/Air shifts as ranked alternatives.

## WP2 — Red/Yellow Zones, Checkboxes & Audit-Trail Inspection (Frontend)

### `frontend/lib/types.ts`
- News/zone types extended with `zone_tier`, `tier_reason`, `custom_hazard_label`, `impact_profile` (`affected_modalities`, `passability`, `estimated_delay_hours`), `is_geocoded`, `location_precision`. Eliminates the old 6-type `CrisisType` coercion that relabeled `marine_wave`/`road_closure` as `'flood'`.

### `frontend/hooks/useNewsVerification.ts`
- Surfaces tier + reason strings (Red = high-strength official-source confirmation; Yellow = low-medium intensity, monitor before full reroute) for sidebar badges.

### `frontend/components/map/CrisisMap.tsx`
- Added click + hover handlers on `disaster-zones-fill` / `disaster-zones-outline`; fill/outline paint now keys on `zone_tier` (`#ef4444` Red vs `#eab308` Yellow); zone features carry `impact_profile_json`, `custom_hazard_label`, `zone_tier` props and forward click events to `DashboardClient`.

### `frontend/components/dashboard/DashboardClient.tsx`
- Added independent `showRedZones` / `showYellowZones` state with `[x] Zona Merah (Bencana Terkonfirmasi)` / `[x] Zona Kuning` checkboxes filtering the zone ring builder.
- Replaced the old news `"Fokus"` path (`handleMapPointTargeted()` -> `triggerFullSimulationEngine()`, lines 1528-1543) — which launched a synthetic flood simulation at fallback coordinates — with `inspectNewsOrZoneAuditTrail()`: flies to the stored zone coordinates and opens the persisted Audit Trail in `CrisisSidebar` at zero LLM/simulation cost.

### `frontend/components/sidebar/CrisisSidebar.tsx` + `EvidenceTab.tsx`
- Render the inspected item's stored tier badge, `tier_reason`, `custom_hazard_label`, impact-profile chips (modalities/passability/delay), and source permalink.

## WP3 — 10-Hazard Taxonomy (Both Tiers)

- Canonical set: `flood`, `port_closure`, `marine_wave`, `road_closure`, `landslide`, `earthquake`, `volcanic_eruption`, `wildfire`, `congestion`, `other_disruption`.
- `CrisisSimulatorBar.tsx` gains the `port_closure` simulator option (`Penutupan Pelabuhan`, Anchor icon); `MitigationTab.tsx` renders dynamic labels + modality/passability chips instead of hardcoded flood copy.

## WP4 — Port-Closure Modality-Aware Rerouting (Frontend + Backend)

### `frontend/lib/aiDynamicRouter.ts`
- `isSeaportBlockedByHazard()` with `max(radiusKm + 8, 22)` km capture radius; `findClosestSeaport()` no longer returns a covered port — `findClosestOpenSeaport()` excludes blocked ports and drives automatic Alternate-Port Intermodal failover (`Truck Feeder -> Next Open Port -> Sea`, ~lines 1019-1052).
- `calculateHoldVsRerouteEconomics()` now receives `hazardType` (fixes the line-1346 omission that defaulted everything to 14h flood clearance); port-hazard node buffer raised to 6.0 km.
- `buildRouteTradeoffAnalysis()` attaches structured Pros/Cons + ΔWaktu + ΔBiaya operational cost breakdown to **every** route card (~line 1763); `MitigationTab.tsx` renders it.

## Verification Results
1. `npx tsc --noEmit` (frontend): 0 errors.
2. `pytest backend/tests -q`: news extractor / geocoding / aggregator / routing suites pass (no regressions).
3. Router failover probe: origin port under `port_closure` radius is bypassed for the next open port; `tradeoff_analysis` deltas present on all options.
4. Post-push live checks (pending deployment): `GET https://peta-nadi.onrender.com/api/v1/news/live` re-tiered on read; `https://pre-hub.vercel.app` Red/Yellow checkboxes, zone-click Audit Trail, and Pelabuhan Asal alternate-port rerouting to be confirmed in browser.
