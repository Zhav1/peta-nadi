# Phase 73 WALKTHROUGH: Toponym Specificity Hierarchy, Strict Crisis Predicate Gate & Multi-Regency Zone Fan-Out

**Phase:** 73 — Toponym Specificity Hierarchy, Multi-Location Fan-Out & Crisis Predicate Gate
**Status:** COMPLETE ✅
**Files modified:** 11 (7 backend, 4 frontend)

---

## 1. Backend — Gazetteer & Geocoding (`gazetteer_data.py`, `geocoding_service.py`, `ner_pipeline.py`)

**`backend/app/nlp/gazetteer_data.py`** — module docstring now locks the 4-tier specificity contract (Tier 1 pinpoint > Tier 2 Kabupaten/Kota > Tier 3 macro-corridor > Tier 4 bare province via `BARE_PROVINCE_ALIASES`). Added the missing pinpoint/Kabupaten keys that complete Pan-Sumatra coverage, verified in code:
- `"sipirok": {"coords": (1.6050, 99.2778), "province": "Sumatera Utara", "corridor": "Jalinteng Sipirok (Tapanuli Selatan)", "tier": 1}` — previously absent, which is why `"Longsor Jalan Lintas Tengah"` fell through to the Jambi Tier-3 fallback.
- Kabupaten keys `"asahan"`, `"deli serdang"`, `"langkat"`, `"tapanuli selatan"` now present (previously missing, which collapsed the BPBD 3-daerah report to a single centroid).

**`backend/app/nlp/geocoding_service.py`** — three load-bearing mechanisms, all verified in source:
- `_tiered_keys()` (`return sorted(..., key=lambda k: (tier, -len(k)))`): Tier-1 pinpoint matches are tested before Tier-2 kabupaten, which precede Tier-3 macro-corridors; raw string length only breaks ties *within* a tier. This is the exact inversion of the old `len(k)`-descending bug where 19-char `"jalan lintas tengah"` beat 7-char `"sipirok"`.
- `_SPECIFIC_PASS_KEYS` + `_ROUTE_PAIR_RE` + `_mask_route_endpoint_pairs_when_specific_pass_present()`: when a known pass (or explicit `via`) is present, the `"Jalan Lintas A-B"` / `"tol A-B"` road-name substring is blanked before Tier-2 matching, so `"Pekanbaru-Padang"` inside the road name never competes with `"Sitinjau Lauik"`.
- `resolve_all_sumatra_locations()`: 1-to-N fan-out with 15 km Haversine dedupe, Medan bureau-HQ noise drop (Medan discarded when 2+ other specific kabupaten match and bureau/agency attribution tokens are present), Tier-3 single `province_only` entry, bare-province scan fallback, else `[]`. `resolve_sumatra_location_and_corridor()` keeps the top hit as primary and attaches the full list as `affected_locations[]`; the no-match path still returns `is_geocoded=False` with null coordinates (Phase 72 invariant preserved).
- `geocode()` partial-match loop now iterates `_tiered_keys()` order (was: dict insertion order, `padang` before `sitinjau lauik`).

**`backend/app/nlp/ner_pipeline.py`** — `LOCATION_GAZETTEER` sorted by `(tier, -len(k))`; `extract_locations_gazetteer()` applies bureau stripping + route-endpoint masking before regex matching, mirroring the geocoder.

**Verified live-case outcomes:**
1. `"Longsor Jalan Lintas Tengah ... Sipirok ..."` → Sipirok `(1.6050, 99.2778)` exact_node, never Jambi `(-1.0, 102.0)`.
2. `"Longsor Jalan Lintas Pekanbaru-Padang via Sitinjau Lauik"` → Sitinjau Lauik pinpoint; endpoints masked.

---

## 2. Backend — Crisis Predicate Gate (`news_extractor.py`)

Verified constants and logic in `backend/app/nlp/news_extractor.py`:
- `EXTRACTION_SCHEMA_VERSION = 2` (line 25).
- `STRICT_CRISIS_PREDICATES` (lines 36–48): physical-disruption action predicates only — flood/landslide/banjir/longsor/putus/amblas/ditutup/terisolir/macet-total/gelombang-tinggi/erupsi/gempa/karhutla/kecelakaan/darurat/siaga/waspada/peringatan-dini/gangguan-operasional, etc.
- `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS` (lines 27–34): `dukung perekonomian`, `pertumbuhan ekonomi`, `peresmian`, `apresiasi`, `investasi`, `pengusaha:`, `pengamat:`, etc.
- `PHYSICAL_BLOCKAGE_PREDICATES` (lines 50–53): `putus`, `amblas`, `longsor`, `banjir`, `ditutup`, `terendam`, `lumpuh`, `terisolir`, `ambruk` — the only override that defeats an exclusion.
- `_detect_incident_type()` (lines 121–145): the logistics catch-all (`bbm`, `tol`, `pelabuhan`, `truk`, `disrupsi`, ...) fires only under `if has_crisis`; bare infrastructure nouns NEVER trigger alone. Port-closure patterns stay specific-first.
- `_fast_heuristic_extraction()` (lines 197–205, 271–275): `_hazard_signal = has_crisis_predicate`; `fails_crisis_gate = (not has_crisis_predicate) or (has_exclusion and not has_physical_blockage)` → `DROPPED_IRRELEVANT`.

**Verified live-case outcome:**
3. `"Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar"` → `DROPPED_IRRELEVANT` (no strict predicate; exclusion fires; no blockage override). True closures (`"Jalan putus"`, `"Pelabuhan ditutup"`) still gate `True`.

---

## 3. Backend — Multi-Location + Lead Scraping + Schema v2 (`news_aggregator.py`, `unified_news_ingestor.py`, `news_router.py`)

**`backend/app/services/news_aggregator.py`** (verified):
- `extract_lead_text_from_html()` (lines 888–926): `og:description` → `meta[name=description]` → first 1–2 substantive `<p>` paragraphs (skips copyright/`baca juga`/ads), prefers the longer informative source, 1000-char cap.
- `enrich_article_description_if_needed()` (lines 929–968): fetches the canonical URL when description is empty / equals title / shorter than 90 chars / title carries multi-area markers (`daerah`, `kabupaten`, `wilayah`, `titik`, `lokasi`, `catat`).
- Stale-v1 re-tiering on read (`fetch_news_from_supabase`, `_re_tier_row_if_stale`) and write: any row with `ground_truth_metrics.schema_version != 2` is re-run through the v2 heuristic + bureau strip; `affected_locations` + `schema_version` persist in the existing JSONB (no migration).

**`backend/app/services/unified_news_ingestor.py`** (verified): unseen articles enriched via `asyncio.gather(enrich_article_description_if_needed(...))` before extraction; stale v1 Supabase rows (`schema_version != 2`) force re-extraction; `affected_locations` unpacked into payloads.

**`backend/app/routers/news_router.py`** (verified, lines 129–145): unpacks `affected_locations` / `schema_version` from `ground_truth_metrics` into `GET /api/v1/news/live` payloads.

**Verified live-case outcome:**
4. `"BPBD Sumut catat 3 daerah cuaca ekstrem"` (+ enriched lead naming Asahan, Deli Serdang, Langkat) → `affected_locations[]` with N exact_node entries; legacy v1 rows self-heal on read with zero new LLM calls.

---

## 4. Frontend — Multi-Zone Fan-Out (`types.ts`, `useNewsVerification.ts`, `DashboardClient.tsx`, `EvidenceTab.tsx`)

- `frontend/lib/types.ts`: new `AffectedLocationNode` (`name`, `latitude`, `longitude`, `province?`, `corridor_segment?`, `location_precision?`); `affected_locations?: AffectedLocationNode[]` on news/crisis types.
- `frontend/hooks/useNewsVerification.ts`: normalizes `affected_locations` from API items and `ground_truth_metrics` into `AffectedLocationNode[]` on every verified item.
- `frontend/components/dashboard/DashboardClient.tsx`: `combinedDisasterZones` (line 385) fans out N Red/Yellow zone features per multi-location report (per-location title `"${loc.name} — ${headline}"`, shared parent `affected_locations`); zone/​Fokus clicks resolve `resolvedAffected`/`fallbackZone` to open the parent Audit Trail.
- `frontend/components/sidebar/EvidenceTab.tsx` (lines 120–126): `Wilayah Terdampak (N Lokasi)` pill list with per-location name + corridor segment.

---

## 5. Verification Results (all 4 user-reported live cases)

| # | Live report | Before | After (Phase 73) |
|---|---|---|---|
| 1 | `Longsor Jalan Lintas Tengah` (Sipirok) | Pinned Jambi `(-1.0, 102.0)`; `sipirok` key missing; `len(k)` ordering | Sipirok `(1.6050, 99.2778)` exact_node |
| 2 | `Longsor Jalan Lintas Pekanbaru-Padang via Sitinjau Lauik` | Endpoint cities shadow pass; insertion-order iteration | Sitinjau Lauik pinpoint; endpoints masked |
| 3 | `Pengusaha: Tol Padang-Pekanbaru dukung perekonomian Sumbar` | `other_disruption` → false `YELLOW_CLARIFY` | `DROPPED_IRRELEVANT` (two-factor gate) |
| 4 | `BPBD Sumut catat 3 daerah cuaca ekstrem` | 1 Medan/Sumut dot; title-only snippet | N Red/Yellow zones (Asahan, Deli Serdang, Langkat); `Wilayah Terdampak` pills |

Type safety: `npx tsc --noEmit` → 0 errors. Python: modified NLP/service modules import-clean; Supabase schema untouched (JSONB-only packing).
