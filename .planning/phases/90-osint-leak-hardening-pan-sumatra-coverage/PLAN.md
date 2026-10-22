# Phase 90 — OSINT Leak Hardening + Pan-Sumatra Coverage

**Goal:** close the five false-positive / coverage leak families in the OSINT news
ingestion pipeline (stale-date backdoor, Baca-Juga boilerplate poisoning,
document-level metaphor/economic leaks, un-geocoded RED escalation, batch-of-5
cross-article bleed) and extend spatial coverage to every km² of Pulau Sumatera
plus archipelagic nodes — under the admit-uncertainty-over-false-positive philosophy.

**Status:** implemented locally, uncommitted working tree (this docs task writes files only).

**Scope (strict):** `backend/app/services/news_aggregator.py` +
`backend/app/nlp/news_extractor.py` (+ `gazetteer_data.py` / `geocoding_service.py` /
`unified_news_ingestor.py` for gazetteer/bbox consistency) + `backend/tests/`.
New regression file: `backend/tests/test_osint_leak_hardening.py` (untracked, 64 tests).

## 1. Unparseable-date freshness backdoor fix

- `parse_and_validate_article_freshness` (`news_aggregator.py:697-`) gains
  `is_test_fixture: bool = False`. Unparseable/missing dates now fail closed in
  production (`is_fresh=False`, `reject_reason='unparseable_date_in_prod'`);
  fixtures opt in explicitly for the legacy fresh/age-0 behaviour.
- New Check 1b: `_parse_indonesian_relative_to_hours`
  (`news_aggregator.py:665-`) parses `N detik/menit/jam/hari lalu` plus short
  forms (`10m lalu`, `1j lalu`) into `age_hours`; stale relative dates
  (> max_age_hours, default 48) reject with an Indonesian reason.
- Old fixtures that relied on the backdoor were updated to carry fresh dates
  (`pubDate`/`published_at`/`original_pub_date = "5 menit lalu"` or `now.isoformat()`):
  `test_news_pipeline.py`, `test_phase76_news_spatial_consensus.py`,
  `test_pre_llm_filter.py`.

## 2. Baca-Juga / boilerplate DOM stripping (both HTML extractors)

- New helpers in `news_aggregator.py`: `_CROSS_LINK_P_RE` (start-anchored
  `baca|lihat|simak|klik + juga|selengkapnya|berita terkait`),
  `_PROMO_FOOTER_RES` (video-pilihan / Google-News / download-aplikasi footers),
  `_INLINE_ANCHOR_RE`, `_strip_inline_anchors_if_crosslink` (removes `<a>…</a>`
  inside cross-link `<p>` while keeping surrounding prose),
  `_is_boilerplate_para` (drops cross-link/promo paragraphs).
- Wired into both `extract_lead_text_from_html` and
  `extract_full_article_body_from_html`: anchor-strip → de-tag → length floor
  → boilerplate veto → legacy substring guard.

## 3. Sentence-level physical-crisis proximity + economic/metaphor veto

- New `has_physical_crisis_proximity()` (`news_extractor.py:245-`): True iff ONE
  sentence contains (A) an explicit hazard term without a trailing metaphor noun
  (40-char window via `_sentence_has_metaphor_after_hazard`), or (B) a
  `PHYSICAL_BLOCKAGE_PREDICATE` + a strict physical infra noun.
  Economic-only sentences (veto predicate + `_ECON_SUBJECTS`, no infra noun)
  are vetoed; `bukan/tidak/tanpa/belum` negation denies the hazard.
  Bare flood words (`banjir/rob/genangan/luapan/terendam/longsor/amblas/gempa`)
  require strict infra or a same-sentence blockage predicate.
- Wired into `_detect_incident_type` (metaphor pre-veto → `other_disruption`),
  `_fast_heuristic_extraction` (`has_physical_blockage` via proximity +
  `_is_economic_metaphor_only` → `DROPPED_IRRELEVANT` with Indonesian reason),
  `run_agent_verification_gate` (blockage via proximity; title/desc joined
  with `". "` so sentence splitting works).
- Iterative tightening during the session: veto lists extended
  (`tengkulak/permainan harga/ulah/pasokan/operasi pasar`, `terganggu`);
  negation guard added (`bukan banjir`); bare-hazard check moved from the
  permissive `_VETO_INFRA_NOUNS` (incl. `distribusi/logistik/kargo/sembako`)
  to strict `_PHYSICAL_INFRA_NOUNS` for qualification; title+desc join
  changed from `" "` to `". "`.

## 4. Un-geocoded RED cap + Pan-Sumatra geo expansion + bbox 94–108E / −6.5–6.5N

- `_apply_batch_llm_item` (`news_extractor.py:1188-`): un-geocoded / unverified /
  out-of-bbox NEVER escalates to RED. Tier-1 source + explicit province match
  caps at YELLOW_CLARIFY; otherwise DROPPED_IRRELEVANT.
- `SUMATRA_GEO_REGEX` massively expanded (remote kabupaten/kota, corridors
  `jalinsum/jalintim/jalinbar/jalinteng/jalinpantim/lintas-*`, `JTTS/trans
  sumatera`, straits); missing anchors `Tuapejat/Manggar/Toboali/Koba/Ranai/
  Tarempa/Daik` added.
- `PAN_SUMATRA_GAZETTEER` gains Bangka Belitung (Toboali/Koba/Manggar),
  Kepri archipelago (Natuna/Ranai/Anambas/Tarempa/Lingga/Daik/Karimun),
  offshore islands (Mentawai/Tuapejat/Enggano/Lebong/Muara Aman), corridor
  aliases (lintas timur/barat/tengah, trans sumatera, jalinpantim).
- Bbox widened −6…6 → −6.5…6.5N everywhere for consistency:
  `news_extractor.py` (`STRICT_SUMATRA_BBOX` + all Q1 strings),
  `gazetteer_data.py` (`SUMATRA_BOUNDING_BOX`), `geocoding_service.py`
  (`STRICT_SUMATRA_BBOX` + docstrings), `unified_news_ingestor.py`
  (numeric check `-6.0` → `-6.5` to match its own comment + reason strings).

## 5. Single-item concurrent LLM batch (Semaphore(8), strict Pan-Sumatra prompt)

- `extract_structured_news_batch` rewritten: each candidate gets its OWN
  isolated LLM call (batch size 1) under `asyncio.Semaphore(8)`, 600 tokens per
  article. Replaces the batch-of-5 prompt (cross-article bleed + JSON
  truncation at max_tokens=600).
- New per-article prompt: OSINT Logistics & Disaster Verification Engine,
  all 10 Sumatra provinces down to desa/nagari, 4 strict rejection rules
  (metaphors, pure commodity prices, ceremonies/simulations/recovery visits,
  out-of-Sumatra events), single-JSON-object return.
- Parsing accepts dict or single-element list; `_apply_batch_llm_item`
  unchanged contract. Failures log at debug and keep heuristics.
