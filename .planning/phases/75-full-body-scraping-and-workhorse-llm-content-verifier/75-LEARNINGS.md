# Phase 75 Learnings: Why the Agent Ignored Article Bodies & Post-Disaster False REDs

**Scope:** Full-body scraping, Workhorse LLM content verification, post-disaster construction guards.
**Authority:** Grounded in verified code facts only (`backend/app/services/news_aggregator.py`, `backend/app/nlp/news_extractor.py`, `frontend/hooks/useNewsVerification.ts`, `frontend/components/sidebar/EvidenceTab.tsx`).

---

## 1. Why the Agent Previously Ignored Article Body Content

1. **`enrich_article_description_if_needed()` skipped scraping on almost every RSS item.** The old guard (`if len(desc) >= 90: return article`) treated any description of 90+ chars as complete — but standard RSS `<description>` tags are ~120-char one-sentence teasers. Result: `extract_lead_text_from_html()` (the `<article>` / `.post-content` / `.read__content` / `<p>` scraper, up to 2,500 chars) was effectively dead code for real feeds. Fix: trigger enrichment for any unscraped HTTP-linked article whose description is `< 450` chars, empty, title-identical, or whose title carries a location cue — and always capture `html_published_at` for the 48h freshness gate.
2. **`extract_structured_news_batch()` starved the Workhorse LLM.** The batch path truncated descriptions to `desc[:200]` before prompting, so the LLM (`deepseek-v4.1-flash` via `settings.opencode_driver_model` / NVIDIA NIM fallback) judged each article on the first sentence only — never reaching paragraphs 2–10 where event details and multi-regency location lists live. Fix: pre-enrich short bodies via async gather, then feed `ISI BERITA: {_desc[:1600]}` per article in 5-article chunks with `max_tokens=1600` and a strict JSON-array contract (`is_active_disaster`, `zone_tier`, `verified_sumatra_locations[]`, `recommended_radius_km`, content-grounded `tier_reason`).

## 2. Why `"Pembangunan tanggul darurat pascabencana di Padang"` Previously Turned Red

1. **Bare `"darurat"` in *"tanggul darurat"* fired both the crisis gate and critical severity.** The word `"darurat"` matched `STRICT_CRISIS_PREDICATES` (crisis signal) and the `severity = "critical"` trigger list, even though an emergency-embankment noun is post-disaster construction, not an active hazard. Fix: only specific active-crisis phrases count (`"tanggap darurat bencana"`, `"darurat banjir"`, `"darurat longsor"`); emergency-infra nouns are quarantined in `POST_CONSTRUCTION_EXCLUSION_PHRASES` and must never count as a crisis signal alone.
2. **Unspaced `"pascabencana"` slipped past spaced-only markers, and construction words were unmarked.** The discourse list missed `"pascabencana"` (unspaced) and had no entries for `"pembangunan"`, `"tanggul"`, `"perbaikan"`, `"renovasi"` — so the construction-sentence detector never fired. Fix: both spacings (`pasca bencana/pascabencana/pasca-bencana`, `pascabanjir/pasca-banjir`, `pascagempa/pasca-gempa`, `pascalongsor`) plus full construction vocabulary (`pembangunan`, `membangun`, `tanggul`, `tanggul/jembatan/posko/tenda/sekolah darurat`, `jembatan bailey`, `dapur umum`, `perbaikan`, `renovasi`, `peletakan batu`, `meninjau`, `kunjungan`) added to `NON_INCIDENT_DISCOURSE_MARKERS`, mirrored in the Agent-2 pre-filter (`osint_hazard.py`) and the frontend client guard (`useNewsVerification.ts`).
3. **`other_disruption` + `severity == "critical"` corroborated impact without any physical blockage.** Check 4 allowed severity words alone to satisfy `impact_corroborated`, so a generic logistics-disruption label plus the spurious `critical` (from bug #1) promoted the item to `RED_CONFIRMED` with `has_physical_blockage == False`. Fix: `not (_is_generic_other and not has_physical_blockage)` — generic `other_disruption` can never corroborate impact without a `PHYSICAL_BLOCKAGE_PREDICATES` hit (`putus/amblas/tertutup/terisolir/...`, which genuinely still corroborate).

## 3. Process Rules (carry forward)

- **RSS descriptions are teasers, not content.** Any NLP gate that reads only `raw_description` without attempting body enrichment is judging headlines. The `< 450` char enrichment threshold + `body_scraped` once-per-article guard is the sanctioned pattern.
- **Emergency-infra nouns are guilty by association with `darurat`.** Any future predicate list containing `darurat`-adjacent nouns must cross-check against `POST_CONSTRUCTION_EXCLUSION_PHRASES` first.
- **Severity words are not impact evidence.** `critical`/`high` severity alone must never satisfy `impact_corroborated` for generic incident types — physical blockage evidence is required.
- **Backend discourse changes must be mirrored twice:** Agent-2 pre-filter (`osint_hazard.py`) and the frontend client guard (`useNewsVerification.ts`), or stale/opinion items leak confidence on one side.
- **Schema version bump for every NLP rule change:** `EXTRACTION_SCHEMA_VERSION = 4` (both `news_extractor.py` and `news_aggregator.py`) auto re-verifies legacy rows on read — zero-migration cache invalidation, same path as v2/v3.
