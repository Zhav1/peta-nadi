# Phase 72 Learnings: Economical Tiered News Gating, Stored Audit Inspection & Port-Closure Failover

## Key Architectural & Operational Learnings

### 1. Bureau/Outlet Headers Are Location Poison — Strip Before Matching
- **Fact**: `news_aggregator.py` passed the RSS bureau province (`Bengkulu`) as `fallback_province`; `geocoding_service.py` returned the centroid `(-3.8004, 102.2655)` on body-text miss; `"Bengkulu (ANTARA) -"` datelines substring-matched `"bengkulu"`.
- **Rule**: always run `strip_bureau_and_dateline_noise()` before gazetteer matching; a no-match must yield `is_geocoded=False, latitude=None` — never a centroid. Distinguish `exact_node` vs `province_only`.

### 2. Single-Keyword Relevance Gates Admit Noise — Use Tiered Gatekeeping
- **Fact**: `is_relevant_logistics_or_disaster()` accepted articles on one generic word (`jalan`, `pangan`, `distribusi`). Fixed with expanded `EXCLUDED_NOISE_KEYWORDS` + deterministic 3-tier gate (`RED_CONFIRMED` / `YELLOW_CLARIFY` / `DROPPED_IRRELEVANT`) with LLM as overlay only.
- **Rule**: relevance = hazard signal + geocode quality + impact confirmation, not keyword presence.

### 3. News "Fokus" Must Inspect, Never Simulate
- **Fact**: `DashboardClient.tsx:1528-1543` called `triggerFullSimulationEngine()` on news focus, launching a synthetic flood at fallback coordinates. Replaced with `inspectNewsOrZoneAuditTrail()` (fly-to + stored Audit Trail, zero LLM cost).
- **Rule**: stored intelligence is inspected; simulations only run from explicit `CrisisSimulatorBar` actions.

### 4. Zones Need First-Class Map Interactions
- **Fact**: `CrisisMap.tsx` had no click listener on `disaster-zones-fill`/`outline`. Added click + hover, `zone_tier` paint (`#ef4444`/`#eab308`), and independent `Zona Merah`/`Zona Kuning` checkboxes.
- **Rule**: every visible zone tier gets a matching, independently toggleable legend control.

### 5. Fixed Hazard Enums Silently Lie — Make Impact Dynamic
- **Fact**: 6-type frontend `CrisisType` coerced `marine_wave`/`road_closure` to `'flood'`; economics defaulted to 14h flood clearance (missing `hazardType` at `aiDynamicRouter.ts:1346`). Fixed with 10 canonical hazards + `ImpactProfile` (`custom_hazard_label`, `affected_modalities`, `passability`, `estimated_delay_hours`) threaded end-to-end.

### 6. Nearest-Port Selection Must Exclude Blocked Ports
- **Fact**: `findClosestSeaport()` picked ports inside `port_closure`/`marine_wave` radii. Fixed with `isSeaportBlockedByHazard()` (`max(radiusKm + 8, 22)` km) + `findClosestOpenSeaport()` driving `Truck Feeder -> Next Open Port -> Sea` failover, plus per-route `tradeoff_analysis` (Pros/Cons, ΔWaktu, ΔBiaya).

## Constraints & Operating Environment
- Frontend: `https://pre-hub.vercel.app` (Next.js 14, Mapbox GL JS v3, Deck.gl).
- Backend: `https://peta-nadi.onrender.com` (FastAPI; 5-min background RSS ingestion).
- Database: Supabase `news_articles`; all new metadata in existing `ground_truth_metrics` JSONB (no new-column migration).
- LLM economy: `fetch_existing_processed_articles_map()` dedups before any LLM call; live tiering overlay requires `OPENCODE_API_KEY` on Render.
- Orchestration: main orchestrator (Gemini 4 Argon) delegates all tool/research/implementation/git work to `opencode-go/muse-spark-1.3#high` subagents.

## Open Concerns for Next Context Window
1. Verify live Render `GET /api/v1/news/live` cleans/re-tiers legacy polluted rows on read (`_unpack_ground_truth_metrics` + `_fast_heuristic_extraction`).
2. Verify `OPENCODE_API_KEY` is set on Render so `extract_structured_news_batch` applies the live LLM tiering overlay.
3. Run live browser E2E on `https://pre-hub.vercel.app`: Red/Yellow checkboxes, zone-click Audit Trail drawer, Pelabuhan Asal `Penutupan Pelabuhan` alternate-port rerouting.
