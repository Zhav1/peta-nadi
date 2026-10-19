# Phase 72 Summary: LLM News Gatekeeper, Red/Yellow Audit Zones & Port-Closure Rerouting

## Executive Overview
Phase 72 eliminated six production defect classes in the news-to-map-to-route chain on `https://pre-hub.vercel.app` (frontend) backed by `https://peta-nadi.onrender.com` (backend, Supabase `news_articles`):
1. **Bureau-name location pollution (`"ANTARA Bengkulu"`)**: feed `fallback_province` + dateline substring matches pinned articles to the Bengkulu province centroid `(-3.8004, 102.2655)`.
2. **Ad/irrelevant leakage**: single-generic-word relevance gate admitted lifestyle/medical noise.
3. **News `"Fokus"` firing fake simulations** instead of inspecting the stored item.
4. **Unclickable map zones** with no Red/Yellow distinction or filters.
5. **6-type hazard coercion** silently relabeling `marine_wave`/`road_closure` as `'flood'`.
6. **`Penutupan Pelabuhan` failing to reroute** (nearest-port selection ignored closures; economics defaulted to 14h flood clearance).

---

## Detailed Implementation & Changes

### 1. Economical 3-Tier Gatekeeper & Bureau Stripping (Backend)
- `backend/app/services/news_aggregator.py`: `fetch_existing_processed_articles_map()` (Supabase + memory dedup before any LLM call); `strip_bureau_and_dateline_noise()`; expanded `EXCLUDED_NOISE_KEYWORDS`.
- `backend/app/nlp/geocoding_service.py`: no-match returns `is_geocoded=False, latitude=None` with `exact_node` vs `province_only` precision — never a centroid.
- `backend/app/nlp/news_extractor.py`: `_fast_heuristic_extraction()` + `_build_impact_profile()` + `extract_structured_news_batch()` implementing `RED_CONFIRMED` / `YELLOW_CLARIFY` / `DROPPED_IRRELEVANT` with LLM overlay only for unprocessed items.
- `backend/app/services/unified_news_ingestor.py` + `backend/app/routers/news_router.py`: new metadata packed in existing `ground_truth_metrics` JSONB; legacy rows cleaned/re-tiered on read.

### 2. Red/Yellow Zones & Stored Audit-Trail Inspection (Frontend)
- `frontend/components/map/CrisisMap.tsx`: click/hover on `disaster-zones-fill`/`outline`; `#ef4444` Red vs `#eab308` Yellow styling by `zone_tier`.
- `frontend/components/dashboard/DashboardClient.tsx`: independent `[x] Zona Merah` / `[x] Zona Kuning` checkboxes; `inspectNewsOrZoneAuditTrail()` replaces `triggerFullSimulationEngine()` on news `"Fokus"` (zero LLM/simulation cost).
- `frontend/components/sidebar/CrisisSidebar.tsx` + `EvidenceTab.tsx`: stored tier badge, `tier_reason`, `custom_hazard_label`, impact profile, permalink.
- `frontend/lib/types.ts` + `frontend/hooks/useNewsVerification.ts`: 10-hazard + tier-aware types and reason strings.

### 3. 10-Hazard Taxonomy & Dynamic ImpactProfile
- Canonical: `flood`, `port_closure`, `marine_wave`, `road_closure`, `landslide`, `earthquake`, `volcanic_eruption`, `wildfire`, `congestion`, `other_disruption`, with `custom_hazard_label`, `affected_modalities`, `passability`, `estimated_delay_hours` threaded through `impact_assessment_service.py`, `llm_reasoning_service.py`, `CrisisSimulatorBar.tsx` (new `Penutupan Pelabuhan` option), and `MitigationTab.tsx`.

### 4. Port-Closure Alternate-Port Failover & Tradeoff Economics
- `frontend/lib/aiDynamicRouter.ts`: `isSeaportBlockedByHazard()` (`max(radiusKm + 8, 22)` km), `findClosestOpenSeaport()`, `Truck Feeder -> Next Open Port -> Sea` failover, `hazardType` passed to Hold-vs-Reroute economics, per-route `tradeoff_analysis` (Pros/Cons, ΔWaktu, ΔBiaya).
- `backend/app/services/cpu_routing_service.py` + `agents/nodes/route_optimization.py`: mirrored backend port-blockage penalties.

---

## Verification & Proof of Work
1. **Type Safety**: `npx tsc --noEmit` on `frontend/` exited with code 0.
2. **Python Tests**: `pytest backend/tests -q` — news/geocoding/routing suites pass.
3. **Router Failover Probe**: closed origin port bypassed; tradeoff deltas present on all options.
4. **Post-Push Live Checks**: confirm `GET /api/v1/news/live` re-tiering on Render and Red/Yellow + alternate-port flows on Vercel in a real browser session.
