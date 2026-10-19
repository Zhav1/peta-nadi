# Phase 75 WALKTHROUGH: Full-Body Scraping, Workhorse LLM Content Verifier & Post-Disaster Guards

**Date:** 2026-10-19 — **Status:** COMPLETE ✅

## Modified Files (9)

### 1. `backend/app/services/news_aggregator.py`
- `extract_lead_text_from_html()` scrapes `<article>` / `.post-content` / `.read__content` / `<p>` blocks (up to 2,500 chars); aliased as `extract_full_article_body_from_html` for the WP1 contract name.
- `enrich_article_description_if_needed()` rewritten: the old `< 90` char early-return is gone. Enrichment triggers when the article is unscraped and the description is a short RSS teaser (`< 450` chars), empty, equal to the title, or the title carries a location cue (`daerah/kabupaten/wilayah/titik/lokasi/catat`). Fetch via `httpx.AsyncClient` (5 s timeout); RSS summary + scraped body combined and capped at 2,500 chars; sets `body_scraped`, `article_body_chars`, and `html_published_at` (from `article:published_time` / `pubdate` / `datePublished`) even when no enrichment was needed, so the 48h freshness gate can re-validate.
- `EXTRACTION_SCHEMA_VERSION = 4`; legacy rows re-tiered on read.

### 2. `backend/app/nlp/news_extractor.py`
- `EXTRACTION_SCHEMA_VERSION = 4`.
- `extract_structured_news_batch()`: async pre-enrichment gather over short-body articles, heuristic baselines for all, then Workhorse LLM overlay in 5-article chunks — each line carries `ISI BERITA: {_desc[:1600]}`, `LLMGateway.generate_content(..., model_name=settings.opencode_driver_model, max_tokens=1600)`, 35 s timeout per chunk, JSON-array response contract (`id`, `is_active_disaster`, `zone_tier`, `tier_reason`, `verified_sumatra_locations[]`, `verified_sumatra_location`, `incident_type`, `severity`, `recommended_radius_km`, `discourse_type`, `concise_summary`). Heuristic fallback preserved when the LLM is unreachable.
- Guardrails: bare `"darurat"` removed from `STRICT_CRISIS_PREDICATES` and the `severity == "critical"` trigger list (only `"tanggap darurat bencana"` / `"darurat banjir"` / `"darurat longsor"` remain); new `POST_CONSTRUCTION_EXCLUSION_PHRASES`; `NON_INCIDENT_DISCOURSE_MARKERS` gains both `pasca` spacings and construction vocabulary (`pembangunan`, `membangun`, `tanggul`, `tanggul/jembatan/posko/tenda/sekolah darurat`, `jembatan bailey`, `dapur umum`, `perbaikan`, `renovasi`, `peletakan batu`, `meninjau`, `kunjungan`); `impact_corroborated` gains `not (_is_generic_other and not has_physical_blockage)`.

### 3. `backend/app/services/unified_news_ingestor.py`
- Ingestor gathers `enrich_article_description_if_needed()` over unseen articles before calling `extract_structured_news_batch()` — one shared enrichment path, no double-fetch (guarded by `body_scraped`).

### 4. `backend/app/routers/news_router.py`
- Read path unpacks `ground_truth_metrics` keys (`affected_locations`, `schema_version`, `radius_km`, `geometry_polygon`, `verification_audit`) and re-tiers legacy (`schema_version != 4`) rows on read.

### 5. `agents/llm_gateway.py`
- Unchanged contract reused: `LLMGateway.generate_content()` routes to `settings.opencode_driver_model` with NVIDIA NIM (`deepseek-ai/deepseek-v4.1-flash`) fallback — the fail-loud gateway the batch verifier calls into.

### 6. `agents/nodes/osint_hazard.py`
- Agent-2 pre-filter skips academic/opinion/solution discourse and archival (>48h, `max_age_hours=48`) payloads before confidence scoring, so post-disaster construction items never boost hazard confidence.

### 7. `frontend/lib/types.ts`
- `VerificationAudit` carries `agent_verdict_summary?`, `llm_verified?`, `content_chars_analyzed?`; surfaced on crisis/news item types.

### 8. `frontend/hooks/useNewsVerification.ts`
- Client mirror guard: `academicMarkers` extended with `pascabencana`, `pasca-bencana`, `pascabanjir`, `pascagempa`, `pembangunan tanggul`, `tanggul/jembatan/posko/tenda darurat`, `perbaikan`, `renovasi`, `rehabilitasi`, `rekonstruksi`, `normalisasi sungai`, `peletakan batu` — items matching without a closure phrase (`lumpuh/putus/tutup total/amblas/tidak bisa dilalui`) return `{ valid: false, reason: 'opinion_discourse' }`.

### 9. `frontend/components/sidebar/EvidenceTab.tsx`
- New conditional badge: `✓ Konten Artikel Dianalisis Workhorse LLM ({n} kar)` when `verification_audit.llm_verified` (fallback `✓ Isi Berita Diverifikasi ({n} kar)`), rendered inside the existing 4-check audit panel with the agent verdict summary.

## Verification Test Outputs

1. **Grep audit (code facts):** `EXTRACTION_SCHEMA_VERSION = 4` confirmed in both `news_extractor.py:25` and `news_aggregator.py:135`; `extract_full_article_body_from_html = extract_lead_text_from_html` alias at `news_aggregator.py:1168`; `enrich_article_description_if_needed` at `news_aggregator.py:1171` with `< 450` trigger and 2,500-char cap; batch `ISI BERITA: {_desc[:1600]}` + `max_tokens=1600` + 5-chunks in `news_extractor.py:921-966`; `POST_CONSTRUCTION_EXCLUSION_PHRASES` at `news_extractor.py:53`; discourse markers incl. `pascabencana`/`pascabanjir`/`pembangunan`/`tanggul`/`perbaikan`/`renovasi` at `news_extractor.py:66-84`; `not (_is_generic_other and not has_physical_blockage)` at `news_extractor.py:364`; LLM badge at `EvidenceTab.tsx:145`; client markers at `useNewsVerification.ts:192-206`.
2. **Live-case reasoning:** `"Pembangunan tanggul darurat pascabencana di Padang"` → `tanggul darurat` no longer a crisis predicate; `pascabencana` + `pembangunan` hit discourse markers with no blockage override → discourse check fails → `DROPPED_IRRELEVANT`; severity path cannot reach `critical` on bare `darurat`.
3. **Regression safety:** true closures (`putus`, `amblas`, `tertutup`, `terisolir`, `ditutup`) remain in both `PHYSICAL_BLOCKAGE_PREDICATES` and the `critical` severity list, so genuine REDs still corroborate.
4. **Working tree:** `git status --short` shows exactly the 9 intended files; no temporary test files.
