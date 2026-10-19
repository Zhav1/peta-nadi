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

---

## Phase 73 Extension: Toponym Hierarchy, Predicate Gate & Multi-Location Fan-Out

### Decisions Locked (additive, Phase 72 invariants preserved)

1. **4-Tier Toponym Specificity + Route-Endpoint Masking**
   - Tiers: `Tier 1 pinpoint (passes/towns/ports/airports/volcanoes)` > `Tier 2 Kabupaten/Kota` > `Tier 3 macro-corridors (jalintim/jalinbar/jalinteng/jalinsum/JTTS)` > `Tier 4 bare province` (aliases only, never gazetteer keys).
   - Ordering key is `(tier, -len(k))` in `_tiered_keys()` and `LOCATION_GAZETTEER`; length breaks ties only within a tier.
   - `_mask_route_endpoint_pairs_when_specific_pass_present()`: `Jalan Lintas A-B` / `tol A-B` road-name substrings blanked before Tier-2 matching when a `_SPECIFIC_PASS_KEYS` pass or explicit `via` is present.
2. **Strict Two-Factor Crisis Predicate Gate**
   - `STRICT_CRISIS_PREDICATES` (physical-disruption actions only) is the sole hazard signal; `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS` vetoes unless a `PHYSICAL_BLOCKAGE_PREDICATE` overrides.
   - `fails_crisis_gate = (not has_crisis_predicate) or (has_exclusion and not has_physical_blockage)` → `DROPPED_IRRELEVANT`. Bare infrastructure nouns (`tol`, `pelabuhan`, `truk`, `distribusi`, `logistik`, `bbm`, `jalan`, `pangan`) NEVER count alone.
3. **Multi-Location Extraction + Lead Scraping + `schema_version = 2`**
   - `resolve_all_sumatra_locations()` → `affected_locations[]` (15 km dedupe, Medan HQ-noise drop, `province_only` single-entry Tier-3 fallback, else `[]`).
   - `extract_lead_text_from_html()` (og/meta + lead `<p>`) + `enrich_article_description_if_needed()` (empty/title-equal/<90 chars/multi-area title markers) run before extraction for unseen items.
   - `EXTRACTION_SCHEMA_VERSION = 2` packed in `ground_truth_metrics` JSONB; `schema_version != 2` rows re-tier on read and force re-extract in the ingestor — the sanctioned cache-invalidation path for all future NLP rule changes.
4. **Frontend Multi-Zone Fan-Out**
   - `combinedDisasterZones` renders N Red/Yellow polygons per multi-location report (per-location title `"${loc} — ${headline}"`), each opening the parent Audit Trail; `Wilayah Terdampak (N Lokasi)` pills in `EvidenceTab.tsx`.

### Interfaces (Phase 73 additions)
- `resolve_all_sumatra_locations(text, fallback_province) -> List[{name, latitude, longitude, province, corridor_segment, location_precision}]`.
- `extract_lead_text_from_html(html) -> str`; `enrich_article_description_if_needed(article) -> article`.
- `AffectedLocationNode {name, latitude, longitude, province?, corridor_segment?, location_precision?}` (`types.ts`); `combinedDisasterZones` (`DashboardClient.tsx`).

### Edge Cases
- `"Longsor Jalan Lintas Tengah ... Sipirok"` → Sipirok `(1.6050, 99.2778)` exact_node, never Jambi `(-1.0, 102.0)`.
- `"Longsor Jalan Lintas Pekanbaru-Padang via Sitinjau Lauik"` → Sitinjau Lauik pinpoint; endpoints masked.
- `"Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar"` → `DROPPED_IRRELEVANT`, never `YELLOW_CLARIFY`.
- `"BPBD Sumut catat 3 daerah cuaca ekstrem"` (+ enriched lead) → N exact_node entries; single-location items keep legacy single-zone shape.

### Verification Hooks (Phase 73 additions)
1. Tier-order checks: Sipirok over `jalan lintas tengah`; Sitinjau Lauik over `pekanbaru`/`padang` under masking.
2. Gate checks: opinion piece DROPPED; `"Jalan putus"` / `"Pelabuhan ditutup"` still gate `True`.
3. Fan-out checks: multi-kabupaten body → N `affected_locations`; `schema_version != 2` fixture row re-tiers on read.
4. `npx tsc --noEmit` 0 errors; no new Supabase columns; no LLM contract changes.

---

## Phase 74 Extension: Agent Verification Gate, Hazard-Specific Geometry & 48h Freshness Lockdown

### Decisions Locked (additive, Phases 72–73 invariants preserved)

1. **4-Check Agent Verification Gate**
   - `run_agent_verification_gate()` (`news_extractor.py`): Check 1 `freshness_passed` (`parse_and_validate_article_freshness` ≤ 48h); Check 2 `discourse_passed = not (has_non_incident and not has_physical) and has_crisis`; Check 3 `spatial_passed = is_geocoded and latitude is not None`; Check 4 `impact_corroborated` (all of: fresh + discourse + spatial + `exact_node` + `active_disruption` + (blockage or high/critical) + not weather-warning-only).
   - Bare `"banjir"`/`"longsor"` removed from `PHYSICAL_BLOCKAGE_PREDICATES` (kept in `STRICT_CRISIS_PREDICATES` as signal only); `NON_INCIDENT_DISCOURSE_MARKERS` covers academic/policy/solution/post-disaster/ceremonial text.
   - `agents/nodes/osint_hazard.py` pre-filters discourse-without-blockage and 48h-stale items before Agent-2 confidence scoring.
2. **Agent-Decided Hazard-Specific Radius & Anisotropic Polygons**
   - `compute_hazard_zone_geometry_and_radius()` (`incident_geometry_service.py`): landslide/road_closure 2.8–3.5, port_closure 3.2, congestion 2.5, flood 4.8–6.0, wildfire 7.5, marine_wave 8.5, volcanic_eruption 10.0, earthquake 12.0, regency warning/other 7.2–9.0; 36-pt `_create_skewed_ellipse` rings.
   - `buildHazardSpecificZoneGeometry()` (`DashboardClient.tsx`) prefers the backend polygon (≥4 pts), else mirrors the same table; threaded through `combinedDisasterZones` fan-out and crisis focus.
3. **Strict 48h Freshness & Archival URL Date Gate**
   - `MAX_NEWS_AGE_HOURS = 48`; `parse_and_validate_article_freshness()` checks `/YYYY/MM/DD/` + `-YYYY-MM-DD` + year-only URL patterns, then RFC-2822/ISO `pubDate` + `<meta property="article:published_time">` (`extract_html_published_time`); `when:2d` on all targeted Google News queries.
   - `upsert_articles_to_supabase` preserves true `published_at` (never ingestion `now()`); read path distrusts pre-v3 overwritten `published_at` when the URL carries a stale archival date; `validateClientNewsFreshnessAndDiscourse` (`useNewsVerification.ts`) mirrors the guard client-side.
4. **`EXTRACTION_SCHEMA_VERSION = 3` + 4-Check Audit Trail UI**
   - `schema_version != 3` rows auto re-verify/filter on read (sanctioned invalidation path, follows Phase 73 v2 precedent); `EvidenceTab.tsx` renders the stored 4-check audit (`freshness/discourse/spatial/impact` + `agent_verdict_summary`).

### Interfaces (Phase 74 additions)
- `run_agent_verification_gate(article|kwargs) -> {freshness_passed, discourse_passed, spatial_passed, impact_corroborated, discourse_type, age_hours, agent_verdict_summary, ...}`.
- `parse_and_validate_article_freshness(pub_date_raw, url, html_meta_date, max_age_hours=48) -> {is_fresh, published_at_iso, age_hours, reject_reason}`; `extract_html_published_time(html) -> str | None`.
- `compute_hazard_zone_geometry_and_radius(incident_type, severity, location_precision, zone_tier, lat, lon, corridor_segment) -> {radius_km, geometry_polygon}`.
- `validateClientNewsFreshnessAndDiscourse(title, summary, link, rawPubDate) -> {valid, reason?, formattedPubDate?}`; `buildHazardSpecificZoneGeometry(lon, lat, hazardType, tier, agentRadiusKm?, backendPolygon?) -> {polygon, radiusKm}`.
- `VerificationAudit {freshness_passed, discourse_passed, spatial_passed, impact_corroborated, discourse_type?, age_hours?, agent_verdict_summary?}` (`types.ts`).

### Edge Cases
- `"Akademisi Unand: Pemulihan Hulu DAS menjadi Solusi Banjir di Kota Padang"` → `DROPPED_IRRELEVANT` (discourse fail, no blockage override).
- `"Jalan putus"` / `"Pelabuhan ditutup"` / `"Longsor tutup akses"` → RED path preserved.
- `".../2024/05/17/..."` URL → stale-dropped even if stored `published_at` looks fresh; unparseable relative timestamps (`"15m lalu"`) stay fresh-with-now for offline fixtures.

### Verification Hooks (Phase 74 additions)
1. Gate checks: academic article DROPPED; weather-warning-only → YELLOW; ungeocoded → DROPPED.
2. Geometry checks: landslide ≈ 2.8 km wedge vs earthquake 12.0 km; backend polygon wins over client fallback.
3. Freshness checks: archival URL stale-dropped; fresh RSS keeps real `pubDate` as displayed `published_at`.
4. `npx tsc --noEmit` 0 errors; no new Supabase columns; no LLM contract changes.

---

## Phase 75 Extension: Full-Body Scraping, Workhorse LLM Content Verifier & Post-Disaster Guards

### Decisions Locked (additive, Phases 72–74 invariants preserved)

1. **Full-Body Article Scraper**
   - `extract_lead_text_from_html(html) -> str` (aliased `extract_full_article_body_from_html`): scrapes `<article>` / `.post-content` / `.read__content` / `<p>` blocks, up to 2,500 chars.
   - `enrich_article_description_if_needed(article) -> article`: old `< 90` skip removed; enriches unscraped HTTP-linked articles with `< 450`-char / empty / title-equal descriptions or location-cue titles; combines RSS summary + scraped body (2,500-char cap); sets `body_scraped`, `article_body_chars`, `html_published_at` (from `article:published_time` / `pubdate` / `datePublished`) once per article in `ground_truth_metrics` JSONB.
2. **Workhorse LLM Content Reader**
   - `extract_structured_news_batch(articles) -> structured[]`: async pre-enrichment gather, heuristic baselines for all, then LLM overlay in 5-article chunks — `ISI BERITA: {desc[:1600]}` per line, `LLMGateway.generate_content(prompt, model_name=settings.opencode_driver_model, max_tokens=1600)`, 35 s timeout/chunk, JSON-array contract (`id`, `is_active_disaster`, `zone_tier`, `tier_reason`, `verified_sumatra_locations[]`, `verified_sumatra_location`, `incident_type`, `severity`, `recommended_radius_km`, `discourse_type`, `concise_summary`).
   - Prompt rules: construction/recovery post-disaster, `perbaikan`, academic/expert solutions, ceremonial, economic → `DROPPED_IRRELEVANT`; province-only → `YELLOW_CLARIFY`; only specific node locations may be `RED_CONFIRMED`.
3. **Post-Disaster Construction & Relief Guardrails**
   - Bare `"darurat"` removed from `STRICT_CRISIS_PREDICATES` and `severity == "critical"` triggers (only `tanggap darurat bencana` / `darurat banjir` / `darurat longsor` remain); `POST_CONSTRUCTION_EXCLUSION_PHRASES` (`tanggul/jembatan/posko/tenda/sekolah darurat`, `pembangunan`) never count as crisis signal alone.
   - `NON_INCIDENT_DISCOURSE_MARKERS` += both `pasca` spacings (`pascabencana`, `pascabanjir`, `pascagempa`, `pascalongsor` + hyphenated/spaced forms) and construction vocabulary (`pembangunan`, `membangun`, `tanggul`, `jembatan bailey`, `posko/tenda/sekolah darurat`, `dapur umum`, `perbaikan`, `renovasi`, `peletakan batu`, `meninjau`, `kunjungan`); mirrored in `osint_hazard.py` pre-filter and `useNewsVerification.ts` `academicMarkers`.
   - Check 4: `not (_is_generic_other and not has_physical_blockage)` — generic `other_disruption` never corroborates impact without a `PHYSICAL_BLOCKAGE_PREDICATES` hit.
4. **`EXTRACTION_SCHEMA_VERSION = 4` + Workhorse Badge UI**
   - `schema_version != 4` rows auto re-verify on read (follows v2/v3 precedent). `VerificationAudit {…, agent_verdict_summary?, llm_verified?, content_chars_analyzed?}`; `EvidenceTab.tsx` renders `✓ Konten Artikel Dianalisis Workhorse LLM ({n} kar)`.

### Interfaces (Phase 75 additions)
- `extract_full_article_body_from_html(html) -> str` (alias of `extract_lead_text_from_html`).
- `extract_structured_news_batch()` prompt contract: JSON array with `is_active_disaster`, `verified_sumatra_locations[]`, `recommended_radius_km`, `tier_reason` (Bahasa Indonesia, content-grounded).

### Edge Cases
- `"Pembangunan tanggul darurat pascabencana di Padang"` → `DROPPED_IRRELEVANT` (no crisis predicate, discourse hit, no blockage, `other_disruption` blocked).
- `"Jalan putus"` / `"Pelabuhan ditutup"` / `"Longsor tutup akses"` → RED path preserved (blockage predicates + `critical` severity words untouched).
- Long bodies truncated at 1,600 chars/article for the LLM, 2,500 chars stored; LLM unreachable → heuristic baselines returned (never raises).

### Verification Hooks (Phase 75 additions)
1. Enrichment checks: `< 450`-char teaser triggers fetch; `body_scraped` prevents re-fetch; 2,500-char cap.
2. Guard checks: `tanggul darurat` absent from crisis/severity lists; `pascabencana` + `pembangunan` in discourse markers; `other_disruption` + no blockage → not corroborated.
3. Schema checks: v4 in both modules; legacy rows re-verify on read.
4. `npx tsc --noEmit` 0 errors; no new Supabase columns; first LLM-prompt contract change since Phase 72.

Spec status: READY
