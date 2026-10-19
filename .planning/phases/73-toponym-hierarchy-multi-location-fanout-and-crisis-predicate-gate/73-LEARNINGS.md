# Phase 73 Learnings: Toponym Hierarchy, Predicate Gating & 1-to-N Fan-Out

**Scope:** Phase 73 news-to-map defect remediation. Every claim below is grounded in files changed in this phase (`git status`: 7 backend + 4 frontend files). No assumptions.

---

## 1. External Reference Research: Globot & God's-Eye View Had No Indonesian RSS Geoparser

- **Globot (`Vector897/Globot`)**: a HITL crisis-review console built around hand-authored *mock scenarios* for operator review. It has no Indonesian RSS ingestion path and no toponym resolver — there was no geoparser design to borrow, only the HITL review pattern (already covered in Phase 52's `HitlDecisionDrawer`).
- **God's-Eye View (`bilawalsidhu/gods-eye-view`)**: a tactical HUD that ingests *pre-geocoded* telemetry (USGS earthquake feeds, NASA FIRMS hotspots, AIS/ADS-B tracks). Coordinates arrive solved; the system never resolves a place-name from free text, so it offered no entity-resolution logic either — only HUD presentation patterns (already adopted in Phase 39).
- **Consequence for our engine**: Indonesian LKBN ANTARA / regional-press RSS arrives as raw titles + short snippets with bureau/dateline headers and road-name descriptors (`"Jalan Lintas A-B"`), so we needed three mechanisms neither reference provides: (a) GDELT-GEO-style **two-factor event predicates** (actor/action must both fire — here: strict crisis predicate AND geocoded pinpoint), (b) **toponym specificity ranking** (pinpoint > kabupaten > macro-corridor > province), (c) **1-to-N event-location fan-out** (`affected_locations[]` instead of one lat/lon per article).

---

## 2. Four Exact Code-Level Bugs Fixed (Never Repeat)

### Bug 1 — Longest-key string sorting beat toponym specificity
- **Location**: `backend/app/nlp/geocoding_service.py` `_tiered_keys()`, `backend/app/nlp/ner_pipeline.py` `LOCATION_GAZETTEER`, `backend/app/nlp/gazetteer_data.py`.
- **Mechanism**: ordering by raw `len(k)` descending let `"jalan lintas tengah"` (19 chars, Tier-3 Jambi fallback `-1.0, 102.0`) outrank the 7-char town `"sipirok"` — which was additionally absent from the gazetteer, so no tie-break could save it.
- **Fix**: sort key `(tier, -len(k))` in both `_tiered_keys()` and `LOCATION_GAZETTEER` (length breaks ties only *within* a tier); added `"sipirok"` Tier 1 `(1.6050, 99.2778)` plus missing Kabupaten keys (`asahan`, `deli serdang`, `langkat`, `tapanuli selatan`).
- **Rule**: never rank gazetteer candidates by string length across specificity tiers; tier first, length second.

### Bug 2 — Route-descriptor endpoint cities shadowed mountain passes
- **Location**: `backend/app/nlp/geocoding_service.py` (`_SPECIFIC_PASS_KEYS`, `_ROUTE_PAIR_RE`, `_mask_route_endpoint_pairs_when_specific_pass_present()`), mirrored in `ner_pipeline.py`.
- **Mechanism**: in `"Longsor Jalan Lintas Pekanbaru-Padang via Sitinjau Lauik"`, `pekanbaru`/`padang` (inside the road-name descriptor, not the incident site) competed with the pinpoint, and `geocode()` iterated in dict insertion order (`padang` before `sitinjau lauik`).
- **Fix**: when a Tier-1 pass or explicit `via` is present, blank the `"Jalan Lintas A-B"` / `"tol A-B"` substring before Tier-2 matching; iterate `geocode()` partial matches in tier order.
- **Rule**: road-name endpoint pairs are descriptors, not incident sites — mask them whenever a higher-specificity toponym is present; require the `via`/pass precondition so legitimate `"A-B"` mentions are not nuked.

### Bug 3 — Bare infrastructure nouns triggered false Yellow zones
- **Location**: `backend/app/nlp/news_extractor.py` (`STRICT_CRISIS_PREDICATES`, `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS`, `_detect_incident_type()`, `_fast_heuristic_extraction()`).
- **Mechanism**: `"tol "` and `"pelabuhan"` sat in `_hazard_signal` / `disruption_hints`, so `"Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar"` classified `other_disruption` → `YELLOW_CLARIFY` with zero physical disruption.
- **Fix**: two-factor gate — `has_crisis_predicate` required; `has_exclusion and not has_physical_blockage` vetoes; logistics catch-all fires only under `if has_crisis`. Bare nouns (`tol`, `pelabuhan`, `truk`, `distribusi`, `logistik`, `bbm`, `jalan`, `pangan`) NEVER count as a hazard signal alone.
- **Rule**: every new keyword added to any disruption hint list must be paired with a strict-predicate requirement test (opinion piece stays DROPPED).

### Bug 4 — Single-point schema + title-only snippets collapsed multi-regency reports
- **Location**: `backend/app/services/news_aggregator.py` (`extract_lead_text_from_html`, `enrich_article_description_if_needed`), `backend/app/nlp/geocoding_service.py` (`resolve_all_sumatra_locations`), `frontend/components/dashboard/DashboardClient.tsx` (`combinedDisasterZones`).
- **Mechanism**: three compounding causes — Kabupaten keys missing (Bug 1's gazetteer gap), lead `<meta>` descriptions never scraped on short RSS items (body naming Asahan/Deli Serdang/Langkat never seen), and the frontend plotting exactly 1 circle per news item.
- **Fix**: enrich-then-extract (canonical-URL fetch when desc is empty/title-equal/<90 chars or title carries `daerah`/`kabupaten`/`wilayah`/`titik`/`lokasi`/`catat`); return ALL distinct locations (15 km dedupe, Medan HQ-noise drop); fan out N zones per item, each opening the parent Audit Trail; `Wilayah Terdampak` pills in `EvidenceTab.tsx` and News Cards.
- **Rule**: any report whose title enumerates areas must be assumed multi-location until the body is fetched — never tier on the title alone.

---

## 3. Schema Version Invalidation Rule (`schema_version: 2`)

- **Mechanism** (`news_extractor.py: EXTRACTION_SCHEMA_VERSION = 2`; `news_aggregator.py`, `unified_news_ingestor.py`, `news_router.py`): every extraction packs `schema_version` into the existing `ground_truth_metrics` JSONB; any cached Supabase row with `schema_version != 2` is automatically re-run through the current deterministic heuristic + bureau strip on read and force re-extracted in the ingestor — no new LLM calls, no migration.
- **Rule**: whenever NLP extraction or geocoding rules change, bump `EXTRACTION_SCHEMA_VERSION` so stale cached rows re-tier themselves through the deterministic gatekeeper instead of serving polluted coordinates/tiers forever. The bump is cheap (heuristic-first, LLM only for unseen) and is the only sanctioned cache-invalidation path — never hand-edit Supabase rows to fix a rule change.
