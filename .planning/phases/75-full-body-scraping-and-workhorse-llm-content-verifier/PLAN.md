# Phase 75 PLAN: Full-Body News Scraping, Workhorse LLM Content Verifier & Post-Disaster Construction Guards

**Status:** COMPLETE ✅
**Date:** 2026-10-19
**Files touched (9):** `agents/llm_gateway.py`, `backend/app/services/news_aggregator.py`, `backend/app/nlp/news_extractor.py`, `backend/app/services/unified_news_ingestor.py`, `backend/app/routers/news_router.py`, `agents/nodes/osint_hazard.py`, `frontend/lib/types.ts`, `frontend/hooks/useNewsVerification.ts`, `frontend/components/sidebar/EvidenceTab.tsx`

---

## Problem Statement

Two linked failures were observed in the news intelligence pipeline:

1. **The agent ignored article body content.** `enrich_article_description_if_needed()` returned early for any article whose RSS `<description>` was ≥ 90 chars — but standard RSS descriptions are ~120-char one-sentence teasers. So full-article HTML was almost never scraped, and `extract_structured_news_batch()` additionally truncated the description to `desc[:200]` before sending it to the Workhorse LLM (`deepseek-v4.1-flash`). The LLM therefore judged every article on paragraph 1 alone, never seeing paragraphs 2–10 where the actual event details and multi-regency lists live.
2. **Post-disaster construction news turned RED.** `"Pembangunan tanggul darurat pascabencana di Padang"` hit three compounding bugs: bare `"darurat"` in `"tanggul darurat"` fired both `STRICT_CRISIS_PREDICATES` and `severity = "critical"`; unspaced `"pascabencana"` missed spaced `"pasca bencana"` and construction words (`"pembangunan"`, `"tanggul"`, `"perbaikan"`, `"renovasi"`) were absent from `NON_INCIDENT_DISCOURSE_MARKERS`; and `other_disruption` + `severity == "critical"` was allowed to set `impact_corroborated = True` even with `has_physical_blockage == False`.

## Work Package 1: Full-Body Article HTML Scraper

**File:** `backend/app/services/news_aggregator.py`

- `extract_lead_text_from_html()` (aliased as `extract_full_article_body_from_html`) scrapes `<article>`, `.post-content`, `.read__content`, and `<p>` blocks, returning up to 2,500 chars of article body.
- `enrich_article_description_if_needed()` rewritten: the `< 90` char skip is removed. Any HTTP-linked article that has not been scraped (`body_scraped` unset) and whose description is a short RSS teaser (`< 450` chars), is empty, equals the title, or whose title contains a location cue (`daerah/kabupaten/wilayah/titik/lokasi/catat`) is fetched with `httpx.AsyncClient` (5 s timeout, `PreHub Logistics Bot 2.0` UA). The RSS summary is combined with the scraped body, capped at 2,500 chars, persisted per article (`body_scraped=True`, `article_body_chars`), and `html_published_at` is extracted from `article:published_time` / `pubdate` / `datePublished` for the 48h freshness gate — even when the description already looks complete.
- Ground-truth metrics persistence: scraped/published metadata flows into Supabase `ground_truth_metrics` JSONB once per article (no new columns, no migration).

## Work Package 2: Workhorse LLM Content Reader

**Files:** `backend/app/nlp/news_extractor.py`, `agents/llm_gateway.py`, `backend/app/services/unified_news_ingestor.py`

- `extract_structured_news_batch()` now pre-enriches every short-body article via `enrich_article_description_if_needed()` (async gather), computes heuristic baselines for all articles, then feeds up to **1,600 chars of scraped body per article** to the Workhorse LLM in **5-article chunks** (`max_tokens=1600`).
- The LLM call routes through `LLMGateway.generate_content()` with `model_name=settings.opencode_driver_model` and NVIDIA NIM (`deepseek-ai/deepseek-v4.1-flash`) fallback — the same fail-loud gateway used by the rest of the swarm.
- The prompt requires the LLM to read the full `ISI BERITA` before deciding and return a strict JSON array with: `is_active_disaster`, `zone_tier`, `verified_sumatra_locations[]`, `verified_sumatra_location`, `incident_type`, `severity`, `recommended_radius_km`, `discourse_type`, `concise_summary`, and a content-grounded `tier_reason` (1–2 sentences in Bahasa Indonesia citing article content).
- Explicit prompt rules: construction/recovery post-disaster (`pembangunan tanggul darurat pascabencana`), `perbaikan`, academic/expert solutions, ceremonial, and economic items → `DROPPED_IRRELEVANT`; province-only mentions → `YELLOW_CLARIFY`; only specific node locations (city/port/road) may be `RED_CONFIRMED`.
- `unified_news_ingestor.py` calls enrichment on unseen articles before `extract_structured_news_batch()`, so the ingestor and the extractor share one enrichment path.

## Work Package 3: Post-Disaster Construction & Relief Guardrails

**Files:** `backend/app/nlp/news_extractor.py`, `agents/nodes/osint_hazard.py`, `frontend/hooks/useNewsVerification.ts`

- Bare `"darurat"` removed as a crisis signal: `STRICT_CRISIS_PREDICATES` and the `severity == "critical"` list now only contain specific active-crisis phrases (`"tanggap darurat bencana"`, `"darurat banjir"`, `"darurat longsor"`). New `POST_CONSTRUCTION_EXCLUSION_PHRASES` tuple (`"tanggul darurat"`, `"jembatan darurat"`, `"posko darurat"`, `"tenda darurat"`, `"sekolah darurat"`, `"pembangunan"`) documents emergency-infra nouns that must never count as a crisis signal alone.
- `NON_INCIDENT_DISCOURSE_MARKERS` extended with both spacings (`"pasca bencana"` + `"pascabencana"`, `"pasca-bencana"`, `"pascabanjir"`, `"pasca-banjir"`, `"pascagempa"`, `"pasca-gempa"`, `"pascalongsor"`) and construction vocabulary (`"pembangunan"`, `"membangun"`, `"tanggul"`, `"tanggul darurat"`, `"jembatan darurat"`, `"jembatan bailey"`, `"posko darurat"`, `"tenda darurat"`, `"sekolah darurat"`, `"dapur umum"`, `"perbaikan"`, `"renovasi"`, `"peletakan batu"`, `"meninjau"`, `"kunjungan"`). The discourse check (`_classify_discourse_type` + `run_agent_verification_gate` Check 2) treats these as non-incident discourse unless a physical blockage predicate overrides.
- `impact_corroborated` (Check 4) now blocks `other_disruption` without physical blockage: `not (_is_generic_other and not has_physical_blockage)` — generic logistics-disruption labels can no longer corroborate impact on severity words alone.
- Agent-2 (`osint_hazard.py`) pre-filter and the frontend client mirror guard (`useNewsVerification.ts` `academicMarkers`: `pascabencana`, `pasca-bencana`, `pascabanjir`, `pascagempa`, `pembangunan tanggul`, `tanggul darurat`, `jembatan darurat`, `posko darurat`, `tenda darurat`, `perbaikan`, `renovasi`, …) apply the same construction/post-disaster vocabulary symmetrically so stale/opinion items never boost hazard confidence on either side.

## Work Package 4: Schema v4 Cache Auto-Reverification + Frontend Guards & Badge

**Files:** `backend/app/nlp/news_extractor.py`, `backend/app/services/news_aggregator.py`, `backend/app/routers/news_router.py`, `frontend/lib/types.ts`, `frontend/components/sidebar/EvidenceTab.tsx`

- `EXTRACTION_SCHEMA_VERSION = 4` in both `news_extractor.py` and `news_aggregator.py`. Rows whose `ground_truth_metrics.schema_version != 4` are auto re-tiered on read and force re-extract in the ingestor — the sanctioned zero-migration cache-invalidation path established in Phase 73/74.
- Frontend client-side post-disaster guard in `useNewsVerification.ts` mirrors the backend discourse markers.
- `frontend/lib/types.ts` carries `verification_audit` fields (`agent_verdict_summary`, `llm_verified`, `content_chars_analyzed`).
- `EvidenceTab.tsx` renders a `✓ Konten Artikel Dianalisis Workhorse LLM ({n} kar)` badge when `verification_audit.llm_verified` is set (fallback: `✓ Isi Berita Diverifikasi ({n} kar)` when only char counts exist), alongside the existing 4-check audit panel.

## Verification

- [x] `enrich_article_description_if_needed`: short RSS teasers (< 450 chars) trigger HTML fetch; combined body capped at 2,500 chars; `body_scraped` / `article_body_chars` / `html_published_at` set.
- [x] `extract_structured_news_batch`: pre-enrichment gather present; LLM prompt carries `ISI BERITA: {_desc[:1600]}` with `max_tokens=1600`, 5-article chunks, JSON-array contract (`is_active_disaster`, `verified_sumatra_locations`, `recommended_radius_km`, `tier_reason`).
- [x] `"Pembangunan tanggul darurat pascabencana di Padang"`: bare `darurat` absent from crisis/severity lists; `pascabencana` + construction words in discourse markers; `other_disruption` without blockage cannot corroborate.
- [x] `EXTRACTION_SCHEMA_VERSION = 4` in both backend modules; re-verification on read.
- [x] Frontend: client guard markers present; `✓ Konten Artikel Dianalisis Workhorse LLM` badge renders conditionally.
- [x] `git status --short` shows only the 9 intended files; no temporary test files remain.
