# Phase 73 Summary: Toponym Specificity Hierarchy, Strict Crisis Predicate Gate & Multi-Regency Zone Fan-Out

## Executive Overview

Phase 73 fixed 4 user-reported live misclassification defects in the news-to-map chain on `https://pre-hub.vercel.app` (frontend) backed by `https://peta-nadi.onrender.com` (backend, Supabase `news_articles`):

1. **Longest-key string sorting beat toponym specificity**: `"jalan lintas tengah"` (19 chars, Tier-3 Jambi fallback `-1.0, 102.0`) outranked the 7-char town `"sipirok"`, which was missing from `gazetteer_data.py` entirely — a Sipirok landslide report pinned to the Jambi centroid.
2. **Route-descriptor endpoint cities shadowed mountain passes**: in `"Longsor Jalan Lintas Pekanbaru-Padang via Sitinjau Lauik"`, cities inside the `"Jalan Lintas A-B"` road name competed with the true pinpoint, and `geocode()` iterated in dict insertion order.
3. **Bare infrastructure nouns triggered false Yellow zones**: `"tol "` / `"pelabuhan"` in the hazard signal turned the economic-opinion piece `"Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar"` into `other_disruption` → `YELLOW_CLARIFY`.
4. **Single-point schema + title-only RSS snippets collapsed multi-regency reports**: `"BPBD Sumut catat 3 daerah cuaca ekstrem"` rendered 1 Medan/Sumut dot because Kabupaten keys (`asahan`, `deli serdang`, ...) were missing, lead `<meta>` descriptions were never scraped, and the map plotted 1 circle per item.

---

## Detailed Implementation & Changes

### 1. 4-Tier Toponym Specificity + Route-Endpoint Masking (Backend)
- `backend/app/nlp/gazetteer_data.py`: 4-tier contract in docstring; added `sipirok` (Tier 1, `1.6050, 99.2778`) + missing Kabupaten/Kota keys (`asahan`, `deli serdang`, `langkat`, `tapanuli selatan`, ...).
- `backend/app/nlp/geocoding_service.py`: `_tiered_keys()` sorts `(tier, -len(k))`; `_SPECIFIC_PASS_KEYS` + `_ROUTE_PAIR_RE` + `_mask_route_endpoint_pairs_when_specific_pass_present()` blanks `"Jalan Lintas A-B"`/`"tol A-B"` road-name substrings when a Tier-1 pass (or `via`) is present; `resolve_all_sumatra_locations()` fans out ALL distinct locations (15 km dedupe, Medan HQ-noise drop); `geocode()` iterates in tier order.
- `backend/app/nlp/ner_pipeline.py`: `LOCATION_GAZETTEER` sorted `(tier, -len(k))`; same bureau-strip + endpoint-masking before matching.

### 2. Strict Two-Factor Crisis Predicate Gate (Backend)
- `backend/app/nlp/news_extractor.py`: `STRICT_CRISIS_PREDICATES` (physical-disruption actions only) + `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS` (opinion/ceremonial veto) + `PHYSICAL_BLOCKAGE_PREDICATES` (sole exclusion override). Bare infra nouns (`tol`, `pelabuhan`, `truk`, ...) NEVER trigger alone; `fails_crisis_gate` → `DROPPED_IRRELEVANT`.

### 3. Multi-Location Extraction + Lead Scraping + Schema v2 (Backend)
- `backend/app/services/news_aggregator.py`: `extract_lead_text_from_html()` (og/meta + lead `<p>`); `enrich_article_description_if_needed()` (empty/title-equal/<90 chars/multi-area title markers); stale-v1 (`schema_version != 2`) re-tier on read and write.
- `backend/app/services/unified_news_ingestor.py`: `asyncio.gather` enrichment of unseen items; forced re-extraction of stale v1 rows.
- `backend/app/routers/news_router.py`: `affected_locations` / `schema_version` unpacked into live payloads.
- `EXTRACTION_SCHEMA_VERSION = 2` packed into every extraction; legacy rows self-heal without new LLM calls or migrations.

### 4. Multi-Zone Map Fan-Out (Frontend)
- `frontend/lib/types.ts` + `frontend/hooks/useNewsVerification.ts`: `AffectedLocationNode[]` end-to-end.
- `frontend/components/dashboard/DashboardClient.tsx`: `combinedDisasterZones` renders N Red/Yellow polygons per multi-location report, all opening the parent Audit Trail.
- `frontend/components/sidebar/EvidenceTab.tsx`: `Wilayah Terdampak (N Lokasi)` pills per `affected_locations[]` entry.

---

## Verification & Proof of Work

1. **Live case 1**: Sipirok landslide → `(1.6050, 99.2778)` exact_node, never Jambi centroid.
2. **Live case 2**: Sitinjau Lauik report → pass pinpoint; `pekanbaru`/`padang` masked.
3. **Live case 3**: `Pengusaha: Tol Padang-Pekanbaru...` → `DROPPED_IRRELEVANT`; true closures still gate `True`.
4. **Live case 4**: BPBD 3-daerah report → N zones (Asahan, Deli Serdang, Langkat) + pills.
5. **Type safety**: `npx tsc --noEmit` → 0 errors. Supabase schema untouched (JSONB-only).
