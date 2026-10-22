# Phase 90 — Walkthrough (what was actually implemented)

Uncommitted working tree at time of writing; verified against
`git diff -- backend/... backend/tests/` plus the untracked
`backend/tests/test_osint_leak_hardening.py`. No commits made by this docs task.

## Item 1 — Freshness backdoor closed (`news_aggregator.py`)

- `parse_and_validate_article_freshness(..., is_test_fixture: bool = False)`:
  unparseable/missing dates return `is_fresh=False`,
  `reject_reason='unparseable_date_in_prod'` unless `is_test_fixture=True`
  (legacy fresh/age-0 path preserved for fixtures).
- New `_parse_indonesian_relative_to_hours` + Check 1b handles
  `N detik|menit|jam|hari lalu` and short forms `10m lalu` / `1j lalu`;
  relative age > 48h rejects with an Indonesian over-age reason.
- Fixture updates (they relied on the backdoor, now carry fresh dates):
  - `test_news_pipeline.py::test_get_live_news_returns_live_state_when_cached` —
    article now carries `pubDate`/`published_at`/`original_pub_date = now`,
    Tebing Tinggi coords, `YELLOW_CLARIFY`, `schema_version: 7`.
  - `test_phase76_news_spatial_consensus.py::test_tier_c_regency_invariant…` —
    added `"5 menit lalu"` dates + link.
  - `test_pre_llm_filter.py::test_batch_extraction_pre_filter_drops_irrelevant` —
    all three articles carry `"5 menit lalu"` dates; Java-article assertion
    widened to accept the Q1 out-of-Sumatra/bbox reason.

## Item 2 — Boilerplate stripping (`news_aggregator.py`)

- `_strip_inline_anchors_if_crosslink`: strips `<a>…</a>` inside `<p>` when the
  paragraph carries `baca juga / lihat juga / simak`; surrounding prose kept.
- `_is_boilerplate_para`: drops start-anchored cross-link paragraphs and
  `Saksikan video pilihan / Google News / download aplikasi` promo footers.
- Wired into both `extract_lead_text_from_html` (first 8 `<p>`) and
  `extract_full_article_body_from_html` (first 18 `<p>`).

## Item 3 — Sentence-level proximity + veto (`news_extractor.py`)

- `has_physical_crisis_proximity(text)`: sentence-split on `[.!?\n;]+`;
  per-sentence veto → negation guard → hazard branch (A) / predicate+infra
  branch (B). `_VETO_INFRA_NOUNS` (veto check, incl. distribusi/logistik) vs
  `_PHYSICAL_INFRA_NOUNS` (strict qualification: jalan/tol/jembatan/ruas/
  jalur/pelabuhan/dermaga/truk/kendaraan/lalu lintas/badan jalan…).
- Wired into `_detect_incident_type` (metaphor pre-veto returns
  `other_disruption`), `_fast_heuristic_extraction` (proximity blockage +
  `_is_economic_metaphor_only` DROP), `run_agent_verification_gate`
  (proximity blockage).
- Iterative fixes during the session (all visible in the final diff):
  1. Veto lists tightened: `_ECON_SUBJECTS` += `tengkulak/permainan harga/
     ulah/pasokan/operasi pasar`; `_ECON_VETO_PREDICATES` += `terganggu`;
     `_NEGATION_MARKERS` guard for `bukan banjir`.
  2. Bare-hazard qualification switched from permissive veto-infra list to
     strict infra list (flood verb alone insufficient without road/port context).
  3. Title/desc joins changed `" "` → `". "` in three sites
     (`run_agent_verification_gate` ×2, `_fast_heuristic_extraction`) so
     sentence splitting sees the boundary.

## Item 4 — RED cap + geo expansion + bbox (`news_extractor.py`, `gazetteer_data.py`, `geocoding_service.py`, `unified_news_ingestor.py`)

- `_apply_batch_llm_item`: un-geocoded / `verified_sumatra_location is None` /
  out-of-bbox + LLM RED → Tier-1-with-province-match caps at YELLOW_CLARIFY,
  else DROPPED_IRRELEVANT (bbox string updated to `-6.5..6.5N`).
- `SUMATRA_GEO_REGEX`: added `sumatra`, province long-forms, Kepri/Babel,
  ~100 remote towns/corridors; missing anchors `Tuapejat/Manggar/Toboali/Koba/
  Ranai/Tarempa/Daik` added.
- `PAN_SUMATRA_GAZETTEER`: +7 Babel rows, +8 Kepri-archipelago rows, +7
  offshore-island rows, +8 corridor-alias rows (lintas timur/barat/tengah,
  lintas sumatera, jalinpantim + variant, trans sumatera/sumatra).
- Bbox `-6…6` → `-6.5…6.5N` in all four files; ingestor numeric check
  `-6.0` → `-6.5` corrected to match its own comment.

## Item 5 — Single-item concurrent LLM batch (`news_extractor.py:1759-`)

- `extract_structured_news_batch`: chunk-of-5 loop replaced by
  `asyncio.Semaphore(8)` + `asyncio.gather` over per-article `_llm_single`
  calls; strict Pan-Sumatra prompt with 4 rejection rules; single-JSON-object
  contract; debug-on-failure, heuristics preserved.

## Test evidence (verified by running, `-p no:cacheprovider`)

| Suite | Result |
|---|---|
| `test_osint_leak_hardening.py` (new, 64 tests) | 64 passed |
| `test_news_pipeline.py` + `test_pre_llm_filter.py` + `test_phase76_news_spatial_consensus.py` | 24 passed |
| Combined hardening + news/pre_llm/phase76 | **88 passed** |
| `test_bmkg_consensus_validation.py` | 8 passed |
| `test_consensus_calibration.py` | 9 passed |
| `test_geocode_search.py` | 10 passed |
| `test_scrapers.py` | 22 passed |
