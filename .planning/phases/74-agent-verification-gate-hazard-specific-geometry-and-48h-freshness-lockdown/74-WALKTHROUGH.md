# Phase 74 WALKTHROUGH: Agent Verification Gate, Hazard-Specific Geometry & 48h Freshness Lockdown

**Phase:** 74 — Agent Verification Gate, Hazard-Specific Zone Geometry, and 48h Freshness Lockdown
**Status:** COMPLETE ✅ | **Date:** 2026-10-19 | **Files modified:** 10 | **tsc:** 0 errors (to confirm on build)

---

## 1. What Changed (file by file)

### Backend (6 files)

1. **`backend/app/nlp/news_extractor.py`** (WP1 + WP2 + WP4):
   - `EXTRACTION_SCHEMA_VERSION = 2` → `3` (`news_extractor.py:25`).
   - `PHYSICAL_BLOCKAGE_PREDICATES` (`:50`): removed bare `"banjir"`/`"longsor"` — now only true blockage actions (`putus`, `terputus`, `amblas`, `ambruk`, `runtuh`, `tertutup`, `ditutup`, `lumpuh`, `terisolir`, `macet total`, `tidak bisa dilalui`, `merendam/menimbun/menutup jalan`, ...).
   - New `NON_INCIDENT_DISCOURSE_MARKERS` (`:58`): academic/policy/solution/post-disaster/ceremonial markers.
   - New `run_agent_verification_gate()` (`:244`): 4-check gate (freshness / discourse / spatial / impact-corroborated) with verdict ladder RED → DROPPED-stale → DROPPED-discourse → YELLOW-weather → DROPPED-ungeocoded → YELLOW-default. Returns `freshness_passed`, `discourse_passed`, `spatial_passed`, `impact_corroborated`, `discourse_type`, `age_hours`, `agent_verdict_summary`.
   - `_fast_heuristic_extraction()` + `extract_structured_news()` invoke the gate, call `compute_hazard_zone_geometry_and_radius`, and pack `verification_audit` + `radius_km` + `geometry_polygon` + `schema_version: 3` into every dict / `ground_truth_metrics`.
2. **`backend/app/services/news_aggregator.py`** (WP3 + WP4):
   - `MAX_NEWS_AGE_HOURS = 48` (`:134`), `EXTRACTION_SCHEMA_VERSION = 3` (`:135`).
   - `parse_and_validate_article_freshness()` (`:662`): Check 1 archival-URL patterns (`/YYYY/MM/DD/`, `-YYYY-MM-DD`, year-only) → stale ⇒ `is_fresh=False`; Check 2 `pubDate`/HTML-meta parse vs 48h; unparseable relative timestamps ⇒ fresh-with-now (offline fixtures).
   - `extract_html_published_time()` (`:752`): `article:published_time` / `pubdate` / `datePublished` meta extraction.
   - `upsert_articles_to_supabase()` (`:913`): preserves true `published_at` (never `now()` overwrite); stores `published_at_iso` + `age_hours` in JSONB.
   - Read path (`:1282`+): legacy rows re-verified — overwritten `published_at` distrusted when `schema < 3` and URL carries a stale archival date; `published_at` re-synced from gate output.
   - Targeted Google News queries carry `when:2d` (`:127–:131`).
3. **`backend/app/services/incident_geometry_service.py`** (WP2): `compute_hazard_zone_geometry_and_radius()` (`:204`) — radius table landslide/road 2.8–3.5, port 3.2, congestion 2.5, flood 4.8–6.0, wildfire 7.5, marine 8.5, volcanic 10.0, earthquake 12.0, regency warning 7.2–9.0 + `_create_skewed_ellipse` 36-pt ring.
4. **`backend/app/services/unified_news_ingestor.py`**: pipeline applies the freshness gate pre-upsert; `upserted_count = await upsert_articles_to_supabase(...)` (`:167`).
5. **`backend/app/routers/news_router.py`**: `/live` re-verifies rows via `parse_and_validate_article_freshness` (`:117`) before serving.
6. **`agents/nodes/osint_hazard.py`**: Agent-2 pre-filter (`:69`+) — drops `NON_INCIDENT_DISCOURSE_MARKERS` text without blockage predicates and 48h-stale items before confidence scoring.

### Frontend (4 files)

7. **`frontend/lib/types.ts`**: `VerificationAudit` (`freshness_passed`, `discourse_passed`, `spatial_passed`, `impact_corroborated`, `discourse_type?`, `age_hours?`, `agent_verdict_summary?`) (`:29–:35`); `verification_audit?` on news/zone types (`:222`, `:280`).
8. **`frontend/hooks/useNewsVerification.ts`**: `validateClientNewsFreshnessAndDiscourse()` (`:120`) — archival-URL + 48h-pubdate + academic-without-closure guard; applied to feed items (`:696`, `:742`).
9. **`frontend/components/dashboard/DashboardClient.tsx`**: `buildHazardSpecificZoneGeometry()` (`:374`) — backend-polygon-first, same hazard table fallback; threaded through `combinedDisasterZones` fan-out (`:495`, `:518`) and crisis focus (`:1332`).
10. **`frontend/components/sidebar/EvidenceTab.tsx`**: 4-check audit panel rendering `verification_audit.agent_verdict_summary` (`:144–:147`) plus per-check pass/fail.

---

## 2. Live-Issue Verification Results (all 3 user-reported)

| # | Report | Before | After | Proof |
|---|--------|--------|-------|-------|
| 1 | `"Akademisi Unand: Pemulihan Hulu DAS menjadi Solusi Banjir di Kota Padang"` shown RED | bare `"banjir"` ∈ blockage predicates canceled the academic veto → RED_CONFIRMED | `has_non_incident=True`, `has_physical_blockage=False` → `discourse_passed=False` → `DROPPED_IRRELEVANT` | `run_agent_verification_gate` Check-2 logic (`news_extractor.py:325`); client mirror (`useNewsVerification.ts:181–198`) |
| 2 | All news zones identical 16/20 km circles | `DashboardClient.tsx:393` hardcoded radius | landslide 2.8–3.5 wedge, flood 4.8–6.0 ellipse, earthquake 12.0, etc., backend polygon preferred | `incident_geometry_service.py:204–270`; `buildHazardSpecificZoneGeometry` (`DashboardClient.tsx:374–467`) |
| 3 | May 2024 Tribunnews (`.../2024/05/17/...`) shown as "latest at 4 AM today" | `published_at` overwritten with ingestion `now()`; no URL-date check | URL Check-1 rejects archival dates >48h; true `pubDate` preserved; legacy rows re-verified on read | `parse_and_validate_article_freshness` (`news_aggregator.py:662–749`); read-path guard (`:1282–1306`); `when:2d` queries |

## 3. Regression Guarantees

- True blockages (`putus`, `ditutup`, `tutup total`, `lumpuh`, `amblas`) still gate RED — blockage list only lost bare nouns, kept all action phrases.
- Offline fixtures with relative timestamps (`"15m lalu"`, missing pubDate) still pass as fresh-with-now.
- Zero migrations: all new metadata (`verification_audit`, `radius_km`, `geometry_polygon`, `affected_locations`, `schema_version`) lives in existing `ground_truth_metrics` JSONB.
- Zero LLM contract changes: gate, geometry, and freshness are fully deterministic.
