# Phase 75 Summary: Full-Body Scraping & Workhorse LLM Content Verifier

**Status:** COMPLETE ✅ — **Date:** 2026-10-19

## What changed
Phase 75 makes the agent actually **read the article**, not just the RSS teaser, and stops post-disaster construction news from turning RED.

1. **Full-body scraper (WP1):** `enrich_article_description_if_needed()` no longer skips articles with ≥ 90-char descriptions. Short RSS teasers (< 450 chars) are enriched with scraped `<article>`/`<p>` body text up to 2,500 chars, with `body_scraped` / `article_body_chars` / `html_published_at` persisted per article.
2. **Workhorse LLM content reader (WP2):** `extract_structured_news_batch()` feeds up to 1,600 chars of scraped body per article to `settings.opencode_driver_model` (NVIDIA NIM `deepseek-v4.1-flash` fallback) in 5-article chunks, returning `is_active_disaster`, `zone_tier`, `verified_sumatra_locations[]`, `recommended_radius_km`, and a content-grounded `tier_reason`.
3. **Construction guards (WP3):** bare `"darurat"` removed from crisis/severity triggers; `pascabencana` (both spacings) + construction words (`pembangunan`, `tanggul`, `perbaikan`, `renovasi`, …) added to discourse markers; `other_disruption` without physical blockage can no longer corroborate impact. `"Pembangunan tanggul darurat pascabencana di Padang"` now resolves to DROPPED, not RED.
4. **Schema v4 + frontend (WP4):** `EXTRACTION_SCHEMA_VERSION = 4` auto re-verifies legacy rows on read; client-side post-disaster guard mirrored in `useNewsVerification.ts`; Evidence tab shows a `✓ Konten Artikel Dianalisis Workhorse LLM` badge.

## Files (9)
`agents/llm_gateway.py`, `backend/app/services/news_aggregator.py`, `backend/app/nlp/news_extractor.py`, `backend/app/services/unified_news_ingestor.py`, `backend/app/routers/news_router.py`, `agents/nodes/osint_hazard.py`, `frontend/lib/types.ts`, `frontend/hooks/useNewsVerification.ts`, `frontend/components/sidebar/EvidenceTab.tsx`

## Verification
Grep-verified all code facts (schema v4 ×2, `< 450` trigger, 2,500-char cap, `[:1600]` body feed, `max_tokens=1600`, construction markers, `other_disruption` blockage guard, LLM badge). True closures (`putus/amblas/tertutup/terisolir`) still corroborate RED. Working tree contains only the 9 intended files.
