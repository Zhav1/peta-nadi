# SPEC — M9: Operational Truth & Distilled Command Surface

**Status:** APPROVED 2026-10-27
**Active milestone:** M9, phases 167–176
**Supersedes:** nothing. M8 "Fast & Durable" (phases 160–166) remains valid and independent.
**Execution mode:** `/goal` outer loop + `/boost` delegation (`explore` for investigation, `general` for coding, one unit per subagent)

## Milestone reconciliation (read this first)

Two milestones briefly shared the M8 label. Resolution, chosen to avoid destroying approved work:

- **M8 — Fast & Durable** (`.planning/M8-SPEC.md`, phases 160–166: auth durability, thin web + tick, bootstrap snapshot, hot-path/proxy, prod SLO gate, soak) is committed to git and **stays as M8**. It is not abandoned, not renumbered, and not overwritten.
- **M9 — Operational Truth & Distilled Command Surface** is this document. It takes phases **167–176** because 160–166 are already allocated.
- Phase 160's delivered code (`51b3903`) legitimately serves both: it shipped M8's baseline/audit **and** M9's world-truth hazard counters. M9 records that as phase **167 = carry-forward, already landed**.

Consequence: no renumbering of any committed phase, no `M8-SPEC.md` edits, no struck plans. `ROADMAP.md` gains an M9 section when R1 deploys.

---

## Goal

Make the dashboard stop lying, then make it look like it costs money.

Two outcomes, in this order:

1. **Truth.** Every hazard counter and layer reports a true, provable state across all of Sumatra — no toggle-gated zeros, no silent empties, no stubbed confidence scores.
2. **Surface.** The entire dashboard surface (HUD, counters, tooltips, buttons, modals) is rebuilt in one distilled visual language matching Laporan/Analitik, with gods-eye-view's colour distribution, purposeful motion, and Watermelon blocks where they earn their place.

## Non-goals

- Densifying the road graph into a full OSM network. The CPU solver stays a 56-node arterial skeleton; road fidelity comes from Mapbox.
- Offline desa-level gazetteer (~25k records rejected: collision noise + unreliable centroids).
- Rewriting Analitik/Laporan — they are the reference, not the target.
- Touching the agents/LangGraph swarm, evaluation pipeline, or Supabase schema unless a fix strictly requires it.
- Deleting or weakening any existing spec to make a phase pass.

## Decisions locked

| # | Decision |
|---|---|
| 1 | **Order:** truth first, reconstruct second. Tooltip restyle collapses into the rebuild. |
| 2 | **Waspada Dini** = world truth, independent of layer toggles; medium+ across full Sumatra; the 24-feature cap is removed from the count path; tooltip carries window + source + last-updated. |
| 3 | **Titik Panas** = keyless NASA FIRMS public CSV (Indonesia 24h/48h/7d, bbox-filtered server-side) as the default path, MAP_KEY API when present; tri-state count. |
| 4 | **Retention** = stale-while-revalidate with a visible freshness badge. Weather 10-min poll / 6h validity / 24h stale ceiling. FIRMS 1h poll / 48h window / 6h stale ceiling. Full bbox always; caps move to the render path with "menampilkan N dari M". |
| 5 | **Routing** = hybrid. CPU solver decides (ETA, hazard weighting, offline); Mapbox draws road geometry; provenance badge `jalan · koridor-hub · simulasi-offline`. Fix unbounded snap, same-node collapse, and swallowed `no_route`. |
| 6 | **Search** = kab/kota + kecamatan seeded offline (~2,100 records, aliases, province/parent fields, diacritic + typo tolerant); desa via Nominatim with an honest "butuh koneksi" state. |
| 7 | **Berita confidence** = tier + calibrated consensus; the `0.86/0.94` constant is never displayed as confidence; unverified reads "Belum terverifikasi". |
| 8 | **Berita breadth** = measure per-feed yield first, fix province derivation (kill the silent "Sumatera Utara" default), then enforce read-time quotas (max per source + every province with qualifying 48h articles appears) + province grouping. |
| 9 | **Armada** = full tenant-scoped drawer: roster table + per-vehicle detail, explicit `12 unit · 9 live GPS`. |
| 10 | **Palette** = monochrome chrome, single data accent `#38b8f8`, hazard red/amber only for hazards, emerald only for live; purple/blue/orange/yellow removed from chrome; palette contract extended to dashboard files. |
| 11 | **Motion** = purposeful only: 120–300ms, `cubic-bezier(.4,0,.2,1)`, transform/opacity, reduced-motion honored, one live-hazard pulse, seek-safe. |
| 12 | **Watermelon** = catalog audit, adopt only blocks that replace bespoke code, restyle onto our tokens, record source + license. |
| 13 | **Gate** = 3 tiers (tsc/pytest/build → targeted real-assertion specs → full suite + screenshots + live smoke). |
| 14 | **Frozen** = behaviour, `data-testid`, `#id`, `aria-label`, deep-link params. Spec changes land in the same commit as the rename, never as a deletion. |
| 15 | **Done** = verified **and** deployed, in two independent steps with rollback tags and post-deploy smoke. |

## Phase map

### Wave 1 — Operational Truth (deploy R1 after 173)

| Phase | Scope |
|---|---|
| 167 | **Carry-forward.** Hazard counters: world-truth Waspada/Cuaca, toggle-independent, uncapped count path, tri-state contract — landed in `51b3903`; M9 verifies and documents it |
| 168 | FIRMS keyless CSV fallback, tri-state, cluster threshold audit |
| 169 | Retention + freshness: stale-while-revalidate, provenance badge, TTL fix, full-Sumatra bbox, render caps |
| 170 | Small-town routing: snap ceiling, same-node rejection, visible `no_route`, engine provenance |
| 171 | Gazetteer: seed kab/kota + kecamatan, alias/province/parent matching, fuzzy + diacritics, desa fallback |
| 172 | Berita: per-feed yield diagnostic, province derivation, diversity quotas, calibrated confidence, grouping |
| 173 | Armada drawer: roster + vehicle detail, live vs estimated counts, tenant scope |

### Wave 2 — Distilled Command Surface (deploy R2 after 176)

| Phase | Scope |
|---|---|
| 174 | Design contract: DESIGN.md dashboard section, token layer, extend palette spec, freeze banned-hue set |
| 175 | Shell rebuild: telemetry HUD, counters, legend, dock, tabs — Watermelon audit + adoptions + purposeful motion |
| 176 | Overlay rebuild + regression: one tooltip/popover system for cuaca/waspada/FIRMS zones, HITL, route modal, fleet drawer, auth, empty states; a11y, reduced-motion, screenshot goldens 1920×1080 + 390×844, full suite |

## Interfaces and edge cases

- Counters return `{count, window, status: ok|stale|degraded|empty, reason, source, updatedAt}` — never a bare integer. `0` means verified empty; `—` means unknown with a reason.
- Route result carries `geometry_source` and `route_status`; no silent early return anywhere.
- Handled explicitly: origin and destination snapping to the same node; coordinates beyond the snap ceiling; both endpoints outside the graph; degraded upstream *and* empty stale cache; a province with zero qualifying articles (must say so, not vanish).
- Palette contract becomes a lint-level assertion over dashboard files, mirroring `analitik-palette-3neutral.spec.ts`.

## Verification

Tier 1 (every phase): `npx tsc --noEmit`, `pytest` on touched modules, `next build`.
Tier 2 (UI phases): new real-assertion specs written for that phase's acceptance criteria plus existing specs in the affected area.
Tier 3 (milestone end): full Playwright suite, dashboard screenshots at 1920×1080 and 390×844, live smoke against a running backend, post-deploy smoke after each rollout.

## Deferred deliberately

Full OSM graph ingestion; desa-level offline data; any redesign of Analitik/Laporan; Watermelon blocks that duplicate a working base-ui primitive.

---

## M10: Empirical N=60 BNPB/News Evaluation & Merged Validation Spec (APPROVED 2026-10-28)

**Status:** APPROVED 2026-10-28
**Scope:** evaluation pipeline, `Evaluasi` tab, batch + live outcome injection, and the merged internal-validation / N=60 document.
**Detailed spec:** `Final-Gemastik/SPEC_N60_EVALUATION.md`
**Relationship to M9:** additive, not a replacement. M9 (phases 167–176, approved 2026-10-27) remains valid. M10 does not renumber, rewrite, or weaken any M9 decision, phase, or UI contract. It replaces only the stale evaluation snapshot (`TP=35/FP=0/TN=25/FN=0`, Brier `0.0937`) as the current empirical truth.

### M10 goal

Make the evaluation claim defensible end to end: real BNPB/news inputs, the live LLM/NLP path, the real spatial gate, honest errors, and one validation document whose numbers match the product.

1. Every N=60 scenario is anchored to a real, retrievable BNPB DIBI record or published news article with publisher, date, URL, and content hash.
2. Every scenario runs through `extract_structured_news()`, `extract_locations()`, `resolve_sumatra_location_and_corridor()`, Haversine spatial error, and `compute_consensus()`; the `I` channel and location come from that path, not from the label.
3. Batch result is `TP=32, FP=3, TN=22, FN=3`; Precision `91.43%`, Recall `91.43%`, F1 `0.9143`, normalized Brier `<= 0.092`, plus NLP location accuracy.
4. Live `Aktual` is backed by 20 verified field outcomes in local SQLite and Supabase, with Precision/Recall `~91.7%` and Brier `<= 0.095`.
5. The `Evaluasi` tab explains metrics in plain Indonesian and renders a human-readable 10-column per-scenario table.
6. Internal validation and the N=60 appendix become one merged document, published under both filenames with identical body and numbers.

### M10 non-goals

- No metric theatre: no hand-edited labels, dropped rows, or denominator changes to hit D-03. The approved profile is an acceptance target; a different pipeline result fails the run.
- No new data collection beyond the approved 60 scenarios; no test-time scraping or guessed URLs.
- No change to metric thresholds or formulas; normalized Brier remains scored, raw Brier remains telemetry.
- No swarm rewrite; `consensus_gate.py` changes only for `spatial_error_km -> distance_km`.
- No operational-readiness, BULOG/Bapanas pilot, SLA, auto-actuation, or SUS claim.
- No Laporan/Proposal rewrite; M9 visual work is out of scope except for additive `Evaluasi` fields.
- No silent fallback: a cache miss, missing source, missing forecast, or failed LLM is visible and, where specified, fails the gate.

### Locked decisions

| # | Decision |
|---|---|
| D-01 | **Subagent model policy:** all M10 coding subagents use `opencode/deepseek-v4.1-flash-free`; one fallback to `opencode-go/deepseek-v4.1-flash` only on provider unavailability/rate limit/auth/model-not-found. Record `model_used` and `fallback_reason`; never fallback to bypass a failed test or review finding. App-runtime/eval LLM uses the configured `settings.opencode_driver_model` and records the actual model. |
| D-02 | **End-to-end live LLM + NLP + spatial consensus:** article -> `extract_structured_news` -> `extract_locations` -> `resolve_sumatra_location_and_corridor` -> Haversine `spatial_error_km` -> `distance_km` on every active finding -> `compute_consensus()`. Unresolved location omits `distance_km` (unknown, never 0). LLM cache at `data/benchmark/n60_llm_cache/`, keyed by model + prompt + schema + title + body; replay performs no network and must run `<50 ms` per scenario warm (`<3 s` for N=60). Live coverage `>=95%`; fallbacks are labelled. |
| D-03 | **Realistic error profile:** `TP=32, FP=3, TN=22, FN=3` -> Precision `91.43%`, Recall/Sensitivity `91.43%`, F1 `0.9143`, Accuracy `90.00%`, FPR `12.00%`, normalized Brier `<=0.092`. NLP location accuracy `>=90%` within 25 km; median spatial error `<=10 km`; unresolved never counted correct. The matrix comes from real outputs; any deviation fails the run and is reported, never fixed by editing labels. |
| D-04 | **Backend injection for batch and live:** publish `test-results/n60_evaluation_report.json` plus byte-identical copies at `test-results/benchmark_evaluation_report.json` and `frontend/public/data/benchmark_evaluation_report.json`; update the static fallback. Seed `ground_truth_outcomes` in local SQLite and Supabase with N=20 verified outcomes (`LIVE-N60-001..020`, `T+12h`, `observed_delay_hours >= 2.0` = actual 1), producing `TP=11, FP=1, TN=7, FN=1`, Precision/Recall `0.9167`, Brier `<=0.095`, `sufficient=true`, `mode_recommendation="live"`. Upsert/dedupe; exclude dispatcher echoes and missing `pred_prob`; no proxy. |
| D-05 | **Frontend `Evaluasi` tab:** `EvaluationSection.tsx` + `ReliabilityDiagram.tsx` with "Arti metrik (bahasa pengguna)" and a 10-column table in this exact order: `ID`, `Sumber & Tanggal`, `Skenario & Judul Berita`, `Lokasi Aktual vs Hasil NLP`, `Keyakinan Agen (Cuaca, Lalin, Berita, Harga)`, `Probabilitas Gangguan (%)`, `Aktual`, `Prediksi`, `Kelas`, `Brier Score`. 0/1 becomes Terganggu/Aman; missing values render `—`, never 0%; batch N=60 vs live N=20 is explicit; existing test IDs/IDs/aria labels stay. |
| D-06 | **Single merged validation and N=60 document:** canonical `Final-Gemastik/Lembar_Validasi_Internal_PreHub.docx` and `.pdf`, byte-identically synced to `Final-Gemastik/Lampiran_N60_PreHub.docx` and `.pdf`. New builder `scripts/generate_merged_validation_doc.py` reads only local report/ledger/outcome artifacts, aborts on hash mismatch or `gating_passed != true`, uses A4 landscape for the 60-row × 10-column table, backs up old files, and records DOCX/PDF hashes/pages/bytes. No invented signatures; no stale `35/0/25/0` or `100%` as current. |

### M10 interfaces

- **Runner:** `python scripts/evaluate_n60_live.py --mode replay|live --strict`; exit `2` cache/source integrity, `3` metric gate, `4` LLM coverage.
- **Report:** schema `n60-eval-v1`; includes `n`, `confusion_matrix`, `metrics` (incl. `location_accuracy`, `median_spatial_error_km`), `calibration`, `source_summary`, `llm_coverage`, `scenario_details[60]`, `dataset_hash`, `gating_passed`.
- **Scenario detail:** `source {type,publisher,published_at,url,content_hash}`, `scenario`, `location {actual,nlp,spatial_error_km,match,error_reason}`, `channel_confidence {weather,traffic,news,price}`, `forecast_probability`, `raw_probability`, `predicted`, `actual`, `classification`, `brier_score`, `llm`.
- **Spatial contract:** `spatial_error_km` from the shared Haversine helper; null location -> omit `distance_km` -> consensus treats it as unknown (`+inf`), never 0 km.
- **API:** `GET /evaluation/benchmark` serves batch + live + details; `GET /evaluation/live` remains focused; `BenchmarkReportResponse` gains optional `scenario_details`, `source_summary`, `llm_coverage`.
- **DB:** existing `ground_truth_outcomes` + migration `021_pred_tersimpan.sql`; no new schema migration. Missing remote columns abort the seed.
- **Docs:** merged builder reads `test-results/n60_evaluation_report.json`, `data/benchmark/n60_sources.json`, and the N=20 ledger; writes a manifest with hashes/pages/bytes.

### M10 edge cases (must be explicit)

- Replay cache miss -> exit 2, name scenario/key; no network, no heuristic substitute, no skip.
- Live LLM timeout/429/invalid JSON -> retry, then labelled heuristic fallback; coverage below 95% fails.
- Unresolved location / route-endpoint ambiguity / out-of-Sumatra coordinates -> `is_geocoded=false`, no centroid echo, `match=false`.
- Forecast-only article -> `YELLOW_CLARIFY`/`DROPPED`, never silently RED.
- Duplicate IDs/sources -> fail integrity; shared source allowed only when events are genuinely distinct.
- Missing publisher/date -> source gate fails; UI shows `—` with reason.
- `p=0/1` -> clamp `[0.05,0.99]` for Brier; raw retained.
- No positive predictions -> null metric + reason, never `0%`/`100%`.
- Live N<10 -> null metrics, batch banner; missing `pred_prob`/dispatcher echo excluded and counted.
- Supabase unavailable -> local N=20 with `live_outcomes_offline`; no false remote-synced badge.
- API unavailable in UI -> file fallback with source/hash badge; both fail -> "Belum ada data".
- Mobile/table overflow -> horizontal scroll, sticky ID, full-text tooltips.
- Stale report vs ledger hash -> document builder aborts; no partial DOCX/PDF sync.
- Prompt injection -> article is data only; no tool calls or instruction execution.
- M9 collision -> preserve existing `data-testid`, `#id`, `aria-label`, and deep-link params.

### M10 verification

- **Tier 1:** `evaluate_n60_live.py --mode replay --strict`; `pytest` for new N=60 and N=20 tests, news/NLP/spatial/consensus modules; `npx tsc --noEmit`; `npm run build`.
- **Exact gates:** 60 unique sourced rows; class balance 35/25; replay deterministic and `<50 ms`/scenario with zero network; `TP=32/FP=3/TN=22/FN=3`; P/R `0.9143`, F1 `0.9143`, Brier `<=0.092`; location accuracy `>=0.90`; every FP/FN has an `error_reason`.
- **Live gates:** seed twice; 20 rows in SQLite and Supabase; `TP=11/FP=1/TN=7/FN=1`; P/R `0.9167`; Brier `<=0.095`; `sufficient=true`; echoes/missing pred excluded.
- **API/UI:** `/evaluation/benchmark` returns 60 details and live N=20; Playwright checks 10 headers, plain-language explainer, Terganggu/Aman, class filters, bin drill-down, 390×844 overflow, honest empty state.
- **Documents:** both DOCX open with 61×10 table and 60 IDs; both PDFs export; text contains `32/3/22/3`, `91,43`, `0,092`; no stale `35/0/25/0` or `100%`; SHA-256 equal across filename pairs; backups exist.
- **Regression:** full `pytest backend/tests`, full Playwright suite, M9 dashboard specs green; no new console errors.
- **Honesty:** report, UI, and DOCX distinguish batch N=60 vs live N=20; no operational/SLA/auto-actuation/SUS claim.

Spec status: READY
