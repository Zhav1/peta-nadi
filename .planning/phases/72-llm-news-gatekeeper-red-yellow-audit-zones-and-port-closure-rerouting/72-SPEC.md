# SPEC — PetaNadi Crisis Map: Economical DB-First News Intelligence

## Goal
Turn noisy multi-outlet Sumatra news (LKBN ANTARA 10 bureaus, Detik, CNN, CNBC, Google News targeted queries) into **trusted Red/Yellow map zones** with zero hallucinated locations, minimal LLM cost, and modality-aware rerouting options for dispatchers.

Non-Goals:
- No blind province-centroid mapping. No article is ever placed at a fallback centroid.
- No LLM call for already-processed articles (DB + in-memory dedup).
- No `frontend/**` changes in this workstream.
- No new unknown-column Supabase migrations (all new metadata lives in existing `ground_truth_metrics` JSONB).

## Decisions Locked

### 1. DB-First Deduplication & Economical 3-Tier LLM Gatekeeper
- Tiers: `RED_CONFIRMED`, `YELLOW_CLARIFY`, `DROPPED_IRRELEVANT`.
- Bureau/Dateline Stripping: `"ANTARA Bengkulu"`, `"Bengkulu (ANTARA) -"`, `"Medan (Antara)"`, `"lkbn antara <prov>"`, `"antara <prov>"`, `"antaranews.com"`, `"detiksumut"`, `"detiknews"`, `"cnbc indonesia"`, `"cnn indonesia"`, etc. are stripped **before** location matching so an article from `Antara Bengkulu` never matches `"bengkulu"` from its outlet/dateline header.
- No Blind Province Centroid assignment: `resolve_sumatra_location_and_corridor()` returns `is_geocoded=False, location_precision="none", matched_node=None, latitude=None, longitude=None` when no gazetteer node matches `clean_text`. Legacy fallback-centroid rows are re-tiered/cleaned on read.

### 2. Interactive Red & Yellow Map Zones
- Independent checkboxes: `[x] Zona Merah`, `[x] Zona Kuning`.
- Clicking a zone OR clicking "Fokus" on news flies to the zone and opens the stored Audit Trail (`CrisisSidebar`) with **zero extra LLM calls** (all data comes from persisted `zone_tier`, `tier_reason`, `impact_profile`, coordinates).

### 3. Expanded Disaster Taxonomy + Dynamic ImpactProfile
- Canonical `incident_type`: `flood`, `landslide`, `earthquake`, `wildfire`, `port_closure`, `marine_wave`, `road_closure`, `congestion`, `volcanic_eruption`, `other_disruption`.
- Heuristic keyword mapping (news_extractor):
  - `penutupan pelabuhan` / `pelabuhan ditutup` / `dermaga ditutup` / `operasional pelabuhan dihentikan` → `port_closure`
  - `antrean pelabuhan` / `bongkar muat padat` → `port_closure` + `custom_hazard_label: "Antrean / Kongesti Pelabuhan"`, `passability: "RESTRICTED"`
  - `gelombang tinggi` / `ombak besar` / `cuaca buruk laut` / `angin kencang laut` → `marine_wave`
  - `erupsi` / `abu vulkanik` / `gunung marapi` / `sinabung` / `kerinci` / `semeru` → `volcanic_eruption`
  - `jembatan putus` / `jembatan ambruk` / `jalan putus` / `jalan amblas` / `penutupan jalan` / `blokade jalan` → `road_closure`
  - `kebakaran hutan` / `karhutla` / `kabut asap` → `wildfire`
  - `gempa` / `tektonik` → `earthquake`
  - `banjir` / `genangan` / `luapan` → `flood`
  - `longsor` / `tebing runtuh` → `landslide`
  - `macet` / `kemacetan` → `congestion`
  - Any other logistics disruption → `other_disruption` + descriptive `custom_hazard_label` (e.g. `"Gangguan Pasokan BBM"`, `"Disrupsi Koridor Logistik"`).
- Dynamic `ImpactProfile` per incident:
  - `port_closure`, `marine_wave` → `affected_modalities: ["sea"]` (`["sea","land"]` for port access), `passability: "BLOCKED"` (or `"RESTRICTED"` if medium/low), `estimated_delay_hours: 18`
  - `volcanic_eruption` → `affected_modalities: ["air","land"]`, `passability: "BLOCKED"`, `estimated_delay_hours: 24`
  - `wildfire` → `affected_modalities: ["land","air"]`, `passability: "RESTRICTED"`, `estimated_delay_hours: 10`
  - `flood`, `landslide`, `earthquake`, `road_closure`, `congestion` → `affected_modalities: ["land"]`
- `zone_tier` rules:
  - `DROPPED_IRRELEVANT` if `not is_geocoded` or `latitude is None` or ad/irrelevant/non-Sumatra.
  - `YELLOW_CLARIFY` if `location_precision == "province_only"` OR `temporal_phase in ("early_warning","monitoring")` OR (`incident_type == "other_disruption"` with `severity in ("low","medium")`).
  - `RED_CONFIRMED` if `is_geocoded` + `location_precision == "exact_node"` + active disruption (`flood`, `landslide`, `earthquake`, `port_closure`, `marine_wave`, `road_closure`, `volcanic_eruption`, `wildfire`, `congestion` with high/critical severity or BLOCKED/RESTRICTED passability).
- Economical batched LLM: `extract_structured_news_batch(articles)` — up to 10 candidates per compact prompt via `LLMGateway.generate_content(...)`, JSON array with `id, zone_tier, tier_reason, incident_type, custom_hazard_label, verified_sumatra_location, severity, affected_modalities, passability, estimated_delay_hours, concise_summary`. `verified_sumatra_location == null` or `DROPPED_IRRELEVANT` → dropped. `extract_structured_news(article)` kept for single items.

### 4. Port Closure (Penutupan Pelabuhan) & Modality-Aware Rerouting
- Mark closed origin/destination port leg as `COMPROMISED`.
- Compute both an Alternate-Port Intermodal detour (`Truck Feeder → Next Nearest Open Port → Sea`) and Hold at Port/Buffer Depot option (plus Full Land/Air), presenting Pros & Cons, delayed time (ΔETA), and additional operational cost (ΔCost breakdown) per route option.

## Interfaces
- `strip_bureau_and_dateline_noise(text: str) -> str` (geocoding_service).
- `resolve_sumatra_location_and_corridor(text, fallback_province="Sumatera Utara") -> {matched_node|None, latitude|None, longitude|None, province, corridor_segment, is_geocoded: bool, location_precision: "exact_node"|"province_only"|"none"}`.
- `extract_locations_gazetteer(text)`: strips bureau noise before regex.
- `fetch_existing_processed_articles_map(article_ids, links) -> dict[str, dict]` (news_aggregator): Supabase `news_articles` by `id`/`link` + in-process `_PROCESSED_ARTICLE_MEMORY_CACHE`.
- `upsert_articles_to_supabase(articles)`: stores `zone_tier, tier_reason, custom_hazard_label, impact_profile, is_geocoded, location_precision` inside `ground_truth_metrics` JSONB.
- `fetch_news_from_supabase(...)`: unpacks above fields, filters `zone_tier == "DROPPED_IRRELEVANT"` or `is_geocoded is False`; re-runs `_fast_heuristic_extraction` + bureau strip on legacy rows missing `zone_tier`.
- `extract_structured_news_batch(articles) -> list[dict]` + `extract_structured_news(article)` (news_extractor).
- `unified_news_ingestor.run_ingestion_cycle`: DB-first dedup → batch LLM only for unseen → persist ALL incl. DROPPED → publish only RED/YELLOW to Redis/incidents.
- `/api/v1/news/live`: filters DROPPED/un-geocoded bureau-centroid noise.
- `_estimate_hazard_delay_hours` + `HAZARD_LABELS_ID`: include `port_closure`, `marine_wave`, `road_closure`, `volcanic_eruption`, `other_disruption`.

## Edge Cases
- `"ANTARA Bengkulu"` ad/national-Jakarta story → `is_geocoded=False`, `DROPPED_IRRELEVANT`, never Bengkulu coords.
- Real disaster (Banjir Lintas Timur Palembang / Penutupan Pelabuhan Belawan) → `RED_CONFIRMED` + accurate coords + impact_profile.
- Weather warning / province-wide alert → `YELLOW_CLARIFY` + clear `tier_reason`.
- Already-processed articles → 0 LLM calls on next 5-min cycle.
- Legacy Supabase rows with fallback centroids → cleaned/re-tiered on read, never shown as RED.

## Verification Hooks
1. `strip_bureau_and_dateline_noise("Bengkulu (ANTARA) - ...")` removes dateline; `resolve_...("ANTARA Bengkulu promo ... Jakarta ...")` → `is_geocoded False`.
2. `resolve_...("Banjir Lintas Timur Palembang ...")` → exact_node Palembang + `is_geocoded True`.
3. `_fast_heuristic_extraction(...)` tier checks: RED flood exact_node; YELLOW province_only/early_warning; DROPPED ad/non-Sumatra.
4. `fetch_existing_processed_articles_map` returns cached/DB rows; ingestor skips LLM for them.
5. `python -m pytest` / verification script passes without touching `frontend/**`.

Spec status: READY
