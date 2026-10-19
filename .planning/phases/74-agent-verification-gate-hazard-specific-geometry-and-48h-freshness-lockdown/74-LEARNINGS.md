# Phase 74 Learnings: Agent Verification Gate, Hazard Geometry & Freshness Lockdown

**Scope:** Deterministic news-to-map hardening (verification gate, hazard physics, 48h freshness, schema v3).
**Authority:** Grounded facts only — every claim verified against the Phase 74 diff.

---

## 1. Exact Code-Level Bugs Fixed (Never Repeat)

### Bug 1 — Bare Hazard Nouns inside `PHYSICAL_BLOCKAGE_PREDICATES` Canceled Opinion/Academic Exclusions
- **Location:** `backend/app/nlp/news_extractor.py:51` (before fix).
- **Mechanism:** `fails_crisis_gate = (not has_crisis_predicate) or (has_exclusion and not has_physical_blockage)`. Having `"banjir"` in the blockage list meant any article mentioning floods — including `"Akademisi Unand: Pemulihan Hulu DAS menjadi Solusi Banjir di Kota Padang"` — set `has_physical_blockage=True`, which short-circuited the academic-exclusion veto and promoted a policy article to `RED_CONFIRMED`.
- **Fix:** Bare `"banjir"`/`"longsor"` removed from `PHYSICAL_BLOCKAGE_PREDICATES` (kept: `putus`, `amblas`, `ambruk`, `runtuh`, `tertutup`, `ditutup`, `lumpuh`, `terisolir`, `macet total`, `tidak bisa dilalui`, `merendam/menimbun/menutup jalan`, ...). Bare nouns remain `STRICT_CRISIS_PREDICATES` (hazard *signal*) but never count as *blockage* (exclusion override). Backstopped by Check-2 of `run_agent_verification_gate` (`:325`) plus `NON_INCIDENT_DISCOURSE_MARKERS` (`:58`).
- **Rule:** A noun that names a hazard is not evidence that the hazard is blocking anything. Signal lists and blockage lists must never share bare nouns.

### Bug 2 — Hardcoded `16 km / 20 km` Circle Radii for All News Zones
- **Location:** `frontend/components/dashboard/DashboardClient.tsx:393` (before fix).
- **Mechanism:** One radius for every incident type ignored hazard physics (a 2.8 km mountain-pass landslide and a 12 km earthquake rendered identically) and left `incident_geometry_service.py` unwired from the news pipeline.
- **Fix:** `compute_hazard_zone_geometry_and_radius` (`incident_geometry_service.py:204`) + `buildHazardSpecificZoneGeometry` (`DashboardClient.tsx:374`) share one table: landslide/road_closure 2.8–3.5, port_closure 3.2, congestion 2.5, flood 4.8–6.0, wildfire 7.5, marine_wave 8.5, volcanic_eruption 10.0, earthquake 12.0, regency warning 7.2–9.0. Backend polygon (≥4 pts) always wins; client table is fallback-only.
- **Rule:** Map radius is a physics property decided by the agent pipeline, never a frontend constant. Any new incident type must add a row to BOTH tables.

### Bug 3 — `published_at` Overwritten with `datetime.now()` + Missing URL Date-Path Check
- **Location:** `backend/app/services/news_aggregator.py:819` (before fix: `upsert_articles_to_supabase`).
- **Mechanism:** The upsert overwrote the RSS `pubDate` with the 4 AM UTC ingestion time, and no URL date-path check existed — so a May 2024 Tribunnews article (`.../2024/05/17/...`) displayed as "latest at 4 AM today".
- **Fix:** True-`published_at` preservation (`published_at_iso` from URL date → HTML meta → RSS pubDate, never `now()` except for unparseable relative timestamps); Check-1 archival patterns (`/YYYY/MM/DD/`, `-YYYY-MM-DD`, year-only) reject stale URLs even when the stored `published_at` column looks fresh (read-path guard `:1282–1306`); `when:2d` constrains Google News queries at the source.
- **Rule:** Ingestion time is never publication time. Trust order: URL-embedded date → publisher HTML meta → RSS pubDate → (last resort) ingestion now, and only the last resort may use `now()`.

## 2. Schema Version Invalidation Rule (`schema_version: 3`)

- Bumping `EXTRACTION_SCHEMA_VERSION = 3` (both `news_extractor.py:25` and `news_aggregator.py:135`) guarantees every stored v1/v2 row is re-verified and filtered by the 48h freshness + discourse gate on read (`news_aggregator.py:1282+`, `news_router.py:117`).
- Precedent chain: Phase 73 used `schema_version = 2` for re-tiering; Phase 74 reuses the identical mechanism for re-verification. This is now the sanctioned cache-invalidation path for ALL future NLP rule changes: bump the version, never write a migration, never add a column (all metadata stays in existing `ground_truth_metrics` JSONB).
- Client mirrors the gate (`validateClientNewsFreshnessAndDiscourse`, `useNewsVerification.ts:120`) so even a backend row that slips through is hidden at render.

## 3. Process Rules (carry forward)

- **Do NOT share terms between signal and override lists** — audit every predicate-list edit against `fails_crisis_gate` / Check-2 algebra before merging.
- **Do NOT hardcode map geometry in the frontend** — backend polygon first, mirrored table fallback, single shared radius table.
- **Do NOT trust stored timestamps after an overwrite bug** — read-path re-verification must dominate stored columns when `schema_version` is stale.
- **Do NOT add Supabase columns for news metadata** — pack `verification_audit`, `radius_km`, `geometry_polygon`, `published_at_iso`, `age_hours`, `affected_locations`, `schema_version` into `ground_truth_metrics` JSONB.
- **Do NOT run simulations from news inspection** (reaffirmed Phases 72–73): news `Fokus`/zone clicks open the stored Audit Trail (now with the 4-check panel); only `CrisisSimulatorBar` runs `POST /api/v1/simulate/stream`.
