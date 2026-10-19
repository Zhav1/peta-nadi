# Phase 74 PLAN: Agent Verification Gate, Hazard-Specific Zone Geometry, and 48h Freshness Lockdown

**Goal:** Fix 3 user-reported live defects in the news-to-map chain: (1) an academic policy article (`"Akademisi Unand: Pemulihan Hulu DAS menjadi Solusi Banjir di Kota Padang"`) promoted to `RED_CONFIRMED` because bare `"banjir"` in `PHYSICAL_BLOCKAGE_PREDICATES` canceled the opinion-exclusion veto; (2) all news zones rendered as hardcoded 16 km / 20 km circles (`DashboardClient.tsx:393`) ignoring hazard physics (2.8 km mountain-pass landslide vs 12 km earthquake) with `incident_geometry_service.py` unwired from the pipeline; (3) a May 2024 Tribunnews article (`.../2024/05/17/...`) surfacing as "latest at 4 AM today" because `upsert_articles_to_supabase` overwrote RSS `pubDate` with `datetime.now()` and no URL date-path check existed.

**Status:** COMPLETE ✅
**Requirements:** NEWS-74.1 (4-check agent verification gate), NEWS-74.2 (hazard-specific geometry), NEWS-74.3 (48h freshness lockdown), NEWS-74.4 (schema v3 re-verification + audit UI)
**AI Spec Needed:** No (deterministic NLP/geocoding/freshness engineering; zero LLM contract changes)

---

## WP1: 4-Stage Agent Verification & Discourse Gate

**Problem (Live Issue 1):** `"banjir"` sat inside `PHYSICAL_BLOCKAGE_PREDICATES` (`news_extractor.py:51`), so `fails_crisis_gate = (not has_crisis_predicate) or (has_exclusion and not has_physical_blockage)` evaluated `False` on `"Akademisi Unand: Pemulihan Hulu DAS menjadi Solusi Banjir di Kota Padang"` — the bare noun `"banjir"` counted as "physical blockage" and canceled the academic-exclusion veto, promoting an opinion article to `RED_CONFIRMED`.

**Changes:**
- `backend/app/nlp/news_extractor.py`:
  - Removed bare `"banjir"` / `"longsor"` from `PHYSICAL_BLOCKAGE_PREDICATES` (now only true blockage actions: `putus`, `amblas`, `ambruk`, `runtuh`, `tertutup`, `ditutup`, `lumpuh`, `terisolir`, `macet total`, `tidak bisa dilalui`, `merendam jalan`, `menimbun/menutup badan jalan`, ...). Bare hazard nouns remain valid `STRICT_CRISIS_PREDICATES` (signal) but never count as blockage (override).
  - Added `NON_INCIDENT_DISCOURSE_MARKERS` (academic/policy/solution/post-disaster/ceremonial markers: `akademisi`, `unand`, `guru besar`, `pakar`, `solusi`, `pemulihan`, `hulu das`, `reboisasi`, `sosialisasi`, `seminar`, `wacana`, `pasca banjir`, `rekonstruksi`, `dukung perekonomian`, `pengusaha:`, ...).
  - New `run_agent_verification_gate()` — strict 4-check deterministic gate:
    - Check 1 `freshness_passed`: `parse_and_validate_article_freshness <= 48h` (URL date-path + pubDate/HTML meta).
    - Check 2 `discourse_passed`: `not (has_non_incident and not has_physical) and has_crisis`.
    - Check 3 `spatial_passed`: `is_geocoded and latitude is not None`.
    - Check 4 `impact_corroborated`: ALL must hold for `RED_CONFIRMED` (fresh + discourse + spatial + `exact_node` + `active_disruption` + (blockage or high/critical severity) + not weather-warning-only).
  - Verdict ladder: `impact_corroborated` → RED; stale → DROPPED; discourse-fail → DROPPED; weather-warning-only → YELLOW; ungeocoded → DROPPED; else YELLOW.
  - `_fast_heuristic_extraction()` + `extract_structured_news()` call the gate and pack the full `verification_audit` (4 booleans + `discourse_type` + `age_hours` + `agent_verdict_summary`) into every extraction dict and `ground_truth_metrics` JSONB.
- `agents/nodes/osint_hazard.py`: Agent-2 pre-filter — skips articles whose text hits `NON_INCIDENT_DISCOURSE_MARKERS` without a physical-blockage predicate, and drops 48h-stale items via `parse_and_validate_article_freshness` before confidence scoring.

**Verification:**
- `"Akademisi Unand: Pemulihan Hulu DAS menjadi Solusi Banjir di Kota Padang"` → `discourse_passed=False`, `DROPPED_IRRELEVANT` (no blockage override).
- True blockages (`"Jalan putus"`, `"Pelabuhan ditutup"`, `"Longsor tutup akses"`) still RED-path preserved.

---

## WP2: Agent-Decided Hazard-Specific Radius & Anisotropic Polygon Geometry

**Problem (Live Issue 2):** `DashboardClient.tsx:393` drew every news zone as a hardcoded 16 km / 20 km circle — a 2.8 km mountain-pass landslide and a 12 km earthquake rendered identically — and `incident_geometry_service.py` was unwired from the news pipeline.

**Changes:**
- `backend/app/services/incident_geometry_service.py`: new `compute_hazard_zone_geometry_and_radius(incident_type, severity, location_precision, zone_tier, lat, lon, corridor_segment)` — agent-decided radius + skewed-ellipse ring (`_create_skewed_ellipse`, 36-pt closed `[lon, lat]` ring):
  - landslide / road_closure: `3.5 km` critical / `2.8 km` corridor wedge (60° bearing).
  - port_closure: `3.2 km`; congestion: `2.5 km`; flood: `6.0 km` critical / `4.8 km` river ellipse (22°); wildfire: `7.5 km`; marine_wave: `8.5 km`; volcanic_eruption: `10.0 km`; earthquake: `12.0 km`; regency weather warning / `other_disruption`: `9.0 km` province-only / `7.2 km`.
  - YELLOW regency warnings keep regional `7.2–9.0 km` ellipses; pinpoint hazards get tight corridors.
- `backend/app/nlp/news_extractor.py`: extraction calls the geometry service per incident and packs `radius_km` + `geometry_polygon` (per `affected_locations[]` entry and top-level).
- `frontend/components/dashboard/DashboardClient.tsx`: new `buildHazardSpecificZoneGeometry(lon, lat, hazardType, tier, agentRadiusKm, backendPolygon)` — prefers the backend agent polygon when present (≥4 pts), else mirrors the same hazard table client-side (landslide/road 2.8, port 3.2, congestion 2.5, flood 4.8, wildfire 7.5, marine 8.5, volcanic 10.0, earthquake 12.0, other 7.2). `combinedDisasterZones` threads `loc.radius_km` / `n.radius_km` and `geometry_polygon` through every fan-out zone.
- `frontend/lib/types.ts`: `VerificationAudit` + `radius_km` / `geometry_polygon` on news items and `affected_locations[]` entries.

**Verification:**
- Landslide zone ≈ 2.8 km wedge; earthquake zone ≈ 12 km; flood ≈ 4.8–6.0 km; no two hazard classes share a radius except by physics.

---

## WP3: Strict 48-Hour Freshness & Archival URL Date Gate

**Problem (Live Issue 3):** `upsert_articles_to_supabase` overwrote RSS `pubDate` with the 4 AM UTC ingestion `datetime.now()` (`news_aggregator.py:819`), and no URL date-path check existed — so a May 2024 Tribunnews URL (`.../2024/05/17/...`) displayed as "latest at 4 AM today".

**Changes:**
- `backend/app/services/news_aggregator.py`:
  - `MAX_NEWS_AGE_HOURS = 48`; `parse_and_validate_article_freshness(pub_date_raw, url, html_meta_date, max_age_hours=48)`:
    - Check 1: URL archival patterns `/YYYY/MM/DD/`, `-YYYY-MM-DD`, year-only slug — archival dates beyond 48h → `is_fresh=False` with `reject_reason`; returns `published_at_iso` from the URL date itself.
    - Check 2: RFC-2822/ISO `pubDate` + `<meta property="article:published_time">` / `pubdate` / `datePublished` (`extract_html_published_time`) → age vs 48h window.
    - Unparseable relative timestamps ("15m lalu") → fresh with `now` so offline fixtures keep working.
  - `upsert_articles_to_supabase` preserves true `published_at` (never overwrites with `now`); stores `published_at_iso` + `age_hours` + freshness reject reason in `ground_truth_metrics`.
  - Read-path re-verification: legacy rows re-checked on read — DB rows whose `published_at` was overwritten pre-v3 are dropped when the URL carries a stale archival date even if `published_at` looks fresh.
  - `fetch_lead_image_and_meta()` enriches `html_published_at` from article `<meta>` for the gate.
  - Google News query constraint `when:2d` on all targeted search queries (freshness at the source).
- `backend/app/routers/news_router.py`: `/live` endpoint re-verifies every row through the freshness gate before serving.
- `backend/app/services/unified_news_ingestor.py`: ingestion pipeline filters stale items pre-upsert.
- `frontend/hooks/useNewsVerification.ts`: `validateClientNewsFreshnessAndDiscourse(title, summary, link, rawPubDate)` — client-side mirror guard (archival-URL check + 48h pubdate check + academic-discourse-without-closure check) applied to every feed item before render.

**Verification:**
- `.../2024/05/17/...` URL → `is_fresh=False`, dropped regardless of `published_at` column value.
- Fresh RSS items keep their real `pubDate` as displayed `published_at`.

---

## WP4: `EXTRACTION_SCHEMA_VERSION = 3` Auto Re-Verification + 4-Check Audit Trail UI

**Changes:**
- `EXTRACTION_SCHEMA_VERSION = 3` in both `news_extractor.py` and `news_aggregator.py`. Any stored row with `schema_version != 3` is re-verified and filtered by the 48h freshness + discourse gate on read — the sanctioned cache-invalidation path for all future NLP rule changes (follows the Phase 73 `schema_version = 2` precedent).
- `frontend/components/sidebar/EvidenceTab.tsx`: 4-Check Verification Gate panel — renders the stored `verification_audit` (`freshness_passed`, `discourse_passed`, `spatial_passed`, `impact_corroborated` + `agent_verdict_summary`) per crisis/news item.

**Verification:**
- Legacy v1/v2 Supabase rows (pre-gate REDs, overwritten `published_at`) self-heal to DROPPED/YELLOW on next read with zero new LLM cost and zero migrations (all metadata in existing `ground_truth_metrics` JSONB).

---

## Files Modified (10)

1. `backend/app/services/news_aggregator.py` — 48h gate, URL date patterns, true-`published_at` preservation, read-path re-verification, `when:2d`.
2. `backend/app/nlp/news_extractor.py` — discourse markers, blockage-predicate fix, 4-check gate, geometry wiring, schema v3.
3. `backend/app/services/incident_geometry_service.py` — `compute_hazard_zone_geometry_and_radius`.
4. `backend/app/services/unified_news_ingestor.py` — pre-upsert freshness filtering.
5. `backend/app/routers/news_router.py` — `/live` re-verification.
6. `agents/nodes/osint_hazard.py` — Agent-2 discourse + freshness pre-filter.
7. `frontend/lib/types.ts` — `VerificationAudit`, `radius_km`, `geometry_polygon`.
8. `frontend/hooks/useNewsVerification.ts` — client freshness + discourse guard.
9. `frontend/components/dashboard/DashboardClient.tsx` — `buildHazardSpecificZoneGeometry` + zone threading.
10. `frontend/components/sidebar/EvidenceTab.tsx` — 4-check audit panel.
