# Phase 73 PLAN: Toponym Specificity Hierarchy, Strict Crisis Predicate Gate & Multi-Regency Zone Fan-Out

**Goal:** Fix 4 user-reported live misclassification defects in the news-to-map chain: (1) `"jalan lintas tengah"` (19 chars) outranking pinpoint towns by raw string length and falling back to the Jambi centroid; (2) `"Jalan Lintas A-B"` route-endpoint cities shadowing mountain passes such as Sitinjau Lauik; (3) bare infrastructure nouns (`"tol"`, `"pelabuhan"`) triggering false Yellow zones on economic-opinion pieces; (4) single-point schema + title-only RSS snippets collapsing multi-regency reports (Asahan, Deli Serdang, Langkat) into one Medan/Sumut dot.

**Status:** COMPLETE ✅
**Requirements:** NEWS-73.1 (toponym hierarchy), NEWS-73.2 (crisis predicate gate), NEWS-73.3 (multi-location fan-out), NEWS-73.4 (schema v2 re-tiering)
**AI Spec Needed:** No (deterministic NLP/geocoding engineering; zero LLM contract changes)

---

## WP1: 4-Tier Toponym Specificity Hierarchy + Route-Endpoint Masking + Pan-Sumatra Gazetteer Completion

**Problem (Issues 1 & 2):**
- `_tiered_keys()` / NER gazetteer ordering by raw `len(k)` let `"jalan lintas tengah"` (19 chars, hardcoded Jambi `-1.0, 102.0`) beat the 7-char town `"sipirok"`, which was additionally missing from `gazetteer_data.py`. A `"Longsor Jalan Lintas Tengah"` report pinned to the Jambi centroid instead of Sipirok, Tapanuli Selatan.
- In `"Longsor Jalan Lintas Pekanbaru-Padang via Sitinjau Lauik"`, endpoint cities inside the `"Jalan Lintas A-B"` road-name descriptor competed with the true pinpoint `"Sitinjau Lauik"`, and `geocode()` iterated in dict insertion order (`padang` before `sitinjau lauik`).

**Changes:**
- `backend/app/nlp/gazetteer_data.py`:
  - Documented 4-tier specificity contract in module docstring: Tier 1 (pinpoint chokepoints/passes/towns/ports/airports/volcanoes) > Tier 2 (Kabupaten/Kota + capitals) > Tier 3 (macro-corridors Jalintim/Jalinbar/Jalinteng/Jalinsum/JTTS) > Tier 4 (bare province names via `BARE_PROVINCE_ALIASES`, never in gazetteer proper).
  - Added missing pinpoint + Kabupaten/Kota keys completing the Pan-Sumatra 154-regency coverage, including `"sipirok": {"coords": (1.6050, 99.2778), "province": "Sumatera Utara", "corridor": "Jalinteng Sipirok (Tapanuli Selatan)", "tier": 1}` plus `"asahan"`, `"deli serdang"`, `"langkat"`, `"tapanuli selatan"`, etc.
- `backend/app/nlp/geocoding_service.py`:
  - `_tiered_keys()` sorts by `(tier, -len(k))`: Tier-1 pinpoint first, Tier-2 kabupaten second, Tier-3 macro last; longer keys win only within the same tier.
  - `_SPECIFIC_PASS_KEYS` (`sitinjau lauik`, `lembah anai`, `kelok 9`, `sipirok`, `batu jomba`, `sibolangit`, `berastagi`, `tarutung`, ...) + `_ROUTE_PAIR_RE` + `_mask_route_endpoint_pairs_when_specific_pass_present()`: when a Tier-1 pass is present (or an explicit `via` connector), the `"Jalan Lintas A-B"` / `"tol A-B"` road-name substring is blanked before Tier-2 matching, so endpoint cities (`pekanbaru`, `padang`) never compete with the pass pinpoint.
  - `geocode()` partial-match loop iterates in tier order (was: raw dict insertion order).
- `backend/app/nlp/ner_pipeline.py`:
  - `LOCATION_GAZETTEER` sorted by `(tier, -len(k))` (was: `len(k)` descending); `extract_locations_gazetteer()` strips bureau/dateline noise and applies the same route-endpoint masking before regex matching.

**Verification:**
- `resolve_sumatra_location_and_corridor("Longsor Jalan Lintas Tengah ... Sipirok ...")` resolves to Sipirok `(1.6050, 99.2778)` exact_node, never Jambi centroid.
- `"Longsor Jalan Lintas Pekanbaru-Padang via Sitinjau Lauik"` resolves to Sitinjau Lauik; `pekanbaru`/`padang` masked.
- NER `extract_locations_gazetteer` returns Tier-1 pinpoint over longer Tier-3 corridor strings.

---

## WP2: Strict Two-Factor Crisis Predicate Gate

**Problem (Issue 3):** Having `"tol "` and `"pelabuhan"` in `_hazard_signal` / `disruption_hints` let `"Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar"` classify as `other_disruption` -> `YELLOW_CLARIFY`: a false Yellow zone from an economic-opinion piece with zero physical disruption.

**Changes** (`backend/app/nlp/news_extractor.py`):
- `STRICT_CRISIS_PREDICATES`: explicit physical-disruption action predicates only (`banjir`, `longsor`, `putus`, `amblas`, `ditutup`, `terisolir`, `macet total/parah`, `gelombang tinggi`, `erupsi`, `gempa`, `karhutla`, `kecelakaan`, `darurat/siaga/waspada/peringatan dini`, `gangguan operasional`, ...). Port-closure detection stays specific-first (`penutupan pelabuhan`, `dermaga ditutup`, ...) and precedes generic checks.
- `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS`: opinion/ceremonial markers (`dukung perekonomian`, `pertumbuhan ekonomi`, `peresmian`, `apresiasi`, `investasi`, `progres pembangunan`, `pengusaha:`, `pengamat:`, ...) that veto logistics relevance unless a `PHYSICAL_BLOCKAGE_PREDICATE` (`putus`, `amblas`, `longsor`, `banjir`, `ditutup`, `lumpuh`, `terisolir`, `ambruk`, ...) is also present.
- `_detect_incident_type()`: logistics catch-all (`bbm`, `tol`, `pelabuhan`, `truk`, `disrupsi`, ...) fires **only** when `has_crisis` is true. Bare infrastructure nouns NEVER trigger alone.
- `_fast_heuristic_extraction()`: two-factor rule `fails_crisis_gate = (not has_crisis_predicate) or (has_exclusion and not has_physical_blockage)`; any article failing the gate (or un-geocoded, or ad noise) is `DROPPED_IRRELEVANT`.

**Verification:**
- `"Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar"` -> `DROPPED_IRRELEVANT` (no strict predicate; exclusion fires; no blockage override).
- True closures (`"Jalan putus"`, `"Pelabuhan ditutup"`, `"Longsor tutup akses"`) still gate `True` -> RED path preserved.

---

## WP3: Multi-Location Extraction + Lead-Paragraph HTML Meta Scraping + `schema_version = 2`

**Problem (Issue 4):** `"BPBD Sumut catat 3 daerah cuaca ekstrem"` returned 1 coordinate (Medan/Sumut centroid) because Kabupaten keys (`asahan`, `deli serdang`, ...) were missing, lead `<meta>` descriptions were never scraped on short RSS items, and the schema had a single-point shape.

**Changes:**
- `backend/app/nlp/geocoding_service.py`: `resolve_all_sumatra_locations()` returns ALL distinct matched locations with specificity filtering (Tier-1 present -> Tier-1 + Tier-2 outside masked road names with 15 km Haversine dedupe; else ALL Tier-2 kabupaten with Medan bureau-HQ noise drop; else Tier-3 single `province_only` entry; else `[]`). `resolve_sumatra_location_and_corridor()` keeps the top hit as primary but attaches the full fan-out as `affected_locations[]`.
- `backend/app/nlp/news_extractor.py`: `_fast_heuristic_extraction()` + `extract_structured_news()` pack `affected_locations` and `schema_version = EXTRACTION_SCHEMA_VERSION (2)` into every extraction dict.
- `backend/app/services/news_aggregator.py`:
  - `extract_lead_text_from_html()`: pulls `og:description` / `meta[name=description]` + first 1-2 `<p>` lead paragraphs (skipping copyright/`baca juga`/ads), preferring the longer informative source, capped at 1000 chars.
  - `enrich_article_description_if_needed()`: fetches the canonical article URL when `raw_description` is empty, equal to the title, shorter than 90 chars, OR the title carries multi-area summary markers (`daerah`, `kabupaten`, `wilayah`, `titik`, `lokasi`, `catat`).
  - Read-path and upsert-path re-tiering: rows whose `ground_truth_metrics.schema_version != 2` are re-run through the v2 heuristic + bureau strip on read (`fetch_news_from_supabase`, `_re_tier_row_if_stale`) and re-classified on write, so legacy v1 rows (Jambi-centroid fallbacks, false Yellows, single-point shapes) self-heal without new LLM calls.
- `backend/app/services/unified_news_ingestor.py`: enriches unseen articles via `asyncio.gather(enrich_article_description_if_needed(...))` before extraction; stale v1 Supabase rows (`schema_version != 2`) are force re-extracted.
- `backend/app/routers/news_router.py`: unpacks `affected_locations` / `schema_version` from `ground_truth_metrics` into live API payloads.

**Verification:**
- Multi-kabupaten title + enriched lead body -> `affected_locations` with N exact_node entries (Asahan, Deli Serdang, Langkat), primary = first.
- Legacy v1 Supabase rows re-tier on read; `schema_version` bump forces re-evaluation without duplicate LLM spend.

---

## WP4: Frontend Multi-Zone Map Fan-Out

**Problem:** `DashboardClient.tsx` plotted 1 circle per news item, so multi-daerah reports rendered a single dot even when `affected_locations[]` carried N regencies.

**Changes:**
- `frontend/lib/types.ts`: `AffectedLocationNode` (`name`, `latitude`, `longitude`, `province?`, `corridor_segment?`, `location_precision?`); `affected_locations?: AffectedLocationNode[]` on news/crisis types.
- `frontend/hooks/useNewsVerification.ts`: maps `affected_locations` from API / `ground_truth_metrics` into normalized `AffectedLocationNode[]` on every verified item.
- `frontend/components/dashboard/DashboardClient.tsx`: `combinedDisasterZones` fans out N Red/Yellow polygons per multi-location news report (title `"${loc.name} — ${headline}"` when N > 1), each zone opening the parent Audit Trail (`resolvedAffected` / `fallbackZone`); single-location items keep the legacy single-zone shape.
- `frontend/components/sidebar/EvidenceTab.tsx`: `Wilayah Terdampak (N Lokasi)` pill list rendering every `affected_locations[]` entry with name + corridor segment.

**Verification:**
- `npx tsc --noEmit`: 0 errors.
- Multi-regency report renders N clickable Red/Yellow zones, all linked to the parent Audit Trail; Evidence tab + News Cards show `Wilayah Terdampak` pills.

---

## Files Touched (11)

Backend (7): `gazetteer_data.py`, `geocoding_service.py`, `ner_pipeline.py`, `news_extractor.py`, `news_aggregator.py`, `unified_news_ingestor.py`, `news_router.py`.
Frontend (4): `types.ts`, `useNewsVerification.ts`, `DashboardClient.tsx`, `EvidenceTab.tsx`.

## Non-Goals

- No LLM prompt/contract changes (deterministic layer only).
- No new Supabase columns (all metadata in existing `ground_truth_metrics` JSONB).
- No `frontend/**` map-layer rewrites beyond fan-out rendering.
