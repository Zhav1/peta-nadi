# SPEC — M10: Empirical N=60 BNPB/News Evaluation, Live LLM/NLP + Spatial Consensus Gate

**Status:** APPROVED 2026-10-28
**Scope:** evaluation pipeline, `Evaluasi` tab, batch + live outcome injection, and the merged internal-validation / N=60 document.
**Supersedes:** nothing. M9 (`SPEC.md`, phases 167–176) remains valid and is not renumbered, rewritten, or weakened. This spec replaces only the old evaluation snapshot (`TP=35/FP=0/TN=25/FN=0`, Brier `0.0937`) as the current empirical truth.
**Detailed artifact owner:** `Final-Gemastik/`
**Execution model policy:** D-01 applies to every coding subagent spawned for this milestone.

---

## 1. Goal

Make the evaluation claim defensible end to end: real BNPB/news inputs, the live LLM/NLP path, the real spatial gate, honest errors, and one validation document whose numbers match the product.

1. **Real corpus.** Every N=60 scenario is anchored to a real, retrievable BNPB DIBI record or published news article, with publisher, date, URL, and a content hash. No scenario is scored from an invented headline.
2. **Real pipeline.** Each scenario runs through `extract_structured_news()`, `extract_locations()`, `resolve_sumatra_location_and_corridor()`, Haversine spatial error, and `compute_consensus()`. The published `I` channel and incident location are produced by the LLM/NLP path, not copied from the label.
3. **Honest error profile.** The batch result is `TP=32, FP=3, TN=22, FN=3`, with Precision `91.43%`, Recall/Sensitivity `91.43%`, F1 `0.9143`, and normalized Brier `<= 0.092`; NLP location resolution accuracy is reported separately.
4. **Live truth on the same surface.** The `Aktual` tab is backed by 20 verified field outcomes in local SQLite **and** Supabase, producing approximately `91.7%` Precision/Recall and Brier `<= 0.095`.
5. **User-readable proof.** The `Evaluasi` tab explains every metric in plain Indonesian and renders a 10-column per-scenario table that a non-ML judge can audit.
6. **One document.** Internal validation and the N=60 appendix become one merged document, published under both filenames with identical body and numbers.

## 2. Non-goals

- **N1. No metric theatre.** Do not hand-edit labels, drop failing rows, or change the denominator to hit D-03. The approved profile is an acceptance target; a different pipeline result is a failed run, not a spreadsheet edit.
- **N2. No new data collection beyond the approved 60 scenarios.** No scraping at test time, no guessed URLs, no synthetic replacement rows after freeze.
- **N3. No change to metric thresholds or formulas.** Precision/Recall/F1/Brier keep their existing definitions; `P_max`-normalized Brier remains the scored quantity and raw Brier remains telemetry.
- **N4. No swarm rewrite.** `agents/tools/consensus_gate.py` is extended only where the evaluation contract requires `spatial_error_km -> distance_km`; routing, HITL, and agent topology are untouched.
- **N5. No operational-readiness claim.** N=20 field outcomes are evaluation evidence, not a BULOG/Bapanas pilot, SLA, or auto-actuation proof.
- **N6. No SUS or usability-score claim.** The internal validation matrix is feature-fit validation, not a SUS instrument.
- **N7. No report rewrite.** `Laporan-PreHub-GEMASTIK19.docx`, the Proposal, and M9 visual work are out of scope except where the merged validation document is linked.
- **N8. No silent fallback.** Missing source, missing forecast, cache miss, or failed LLM must be visible in the report and, where specified, fail the gate.

---

## 3. Locked decisions (D-01 … D-06)

### D-01 — Subagent model policy

**Decision.** Every coding subagent used for M10 runs on:

| Role | Model |
|---|---|
| Primary | `opencode/deepseek-v4.1-flash-free` |
| Fallback | `opencode-go/deepseek-v4.1-flash` |

**Contract.**
- The primary model is used for all implementation, test-writing, and document-generation subagents.
- Fallback is attempted **once**, only for provider unavailability, rate limit, auth/model-not-found, or a hard provider error. It is not used to bypass a failed test, a policy refusal, or a review finding.
- Each fallback records `model_used` and `fallback_reason` in the phase note / commit body.
- App-runtime LLM selection is separate: the evaluation pipeline uses the configured `settings.opencode_driver_model` and its existing NIM fallback, and records the actual model in the report.
- No other model family is introduced for M10 subagents.

**Acceptance.** Subagent logs or phase notes show the model per unit of work; any fallback is explicit and reasoned.

### D-02 — End-to-end live LLM + NLP + spatial-consensus evaluation

**Decision.** The N=60 batch is evaluated through the real extraction, location, spatial, and consensus path, not by mapping `sensor_inputs` directly to a probability.

**Per-scenario pipeline.**

| Step | Call | Output used |
|---|---|---|
| 1 | Load frozen article snapshot + source ledger row | `title`, `body`, `publisher`, `published_at`, `url`, `province`, `event_date` |
| 2 | `extract_structured_news(article)` | `zone_tier`, `tier_reason`, `confidence_score`, `is_geocoded`, `affected_locations`, `severity`, `incident_type`, `radius_km` |
| 3 | `extract_locations(title + body)` | NER names for cross-check and audit |
| 4 | `resolve_sumatra_location_and_corridor(title + body, fallback_province=declared_province_or_none)` | `matched_node`, `latitude`, `longitude`, `corridor_segment`, `location_precision`, `is_geocoded` |
| 5 | Haversine between ground-truth coordinates and NLP coordinates | `spatial_error_km` (null when either side is unlocated) |
| 6 | Build `CrisisState` with `distance_km = spatial_error_km` on every active finding | W/T/I/E findings with honest spatial decay |
| 7 | `compute_consensus(state)` | `raw_probability`, `overall_confidence`, `active_sources` |
| 8 | `calibrate_confidence_scale(raw_probability, active_sources, weights)` | `forecast_probability` used for Brier |
| 9 | Classify | `predicted = 1 if raw_probability >= 0.50 else 0`; `actual = ground_truth.is_disruption` |

**State construction.**
- **W (weather):** existing BMKG/rain mapping from `sensor_inputs`; timestamp = event timestamp; `distance_km = spatial_error_km`.
- **T (traffic):** existing TomTom delay/speed mapping; timestamp = event timestamp; `distance_km = spatial_error_km`.
- **I (news):** confidence from the structured extraction, gated by the tier:
  - `RED_CONFIRMED`: `clamp(confidence_score or 0.90, 0.15, 0.96)`
  - `YELLOW_CLARIFY`: `clamp(confidence_score or 0.60, 0.15, 0.90)`
  - `DROPPED_IRRELEVANT`: `0.15` (does not corroborate)
  - `distance_km = spatial_error_km`; `tier_reason` is carried into the audit record.
- **E (price):** existing PIHPS shock mapping from `sensor_inputs`; `distance_km = spatial_error_km`.
- **No silent zero:** when the NLP location is unresolved, omit `distance_km`. The consensus gate's `_resolve_finding_distance()` must treat it as unknown (`+inf`), never as 0 km proximity.
- **One Haversine:** reuse `haversine_distance_km` / `_haversine_km`; do not add a second formula. `spatial_error_km` is reported in kilometres and rounded to 3 decimals in JSON, 1 decimal in UI.

**LLM/NLP result rules.**
- `verified_sumatra_locations` from the LLM is evidence, not a coordinate authority. Coordinates always come from the gazetteer resolver. If the resolver fails, the scenario is `is_geocoded=false`; the LLM cannot inject a pin.
- `extract_locations()` is the independent NER check. Store `ner_names`, `ner_agrees` (matched node present in names, or candidate <= 15 km), and the resolver's `affected_locations`.
- If full-text and NER-only resolution disagree, the full-text resolver is primary; both candidates are recorded and the disagreement is an audit event, not a silent overwrite.
- Prompt-injection defence: article text is data only. The extraction prompt must not execute instructions found in the article and must not emit tool calls.

**Caching and replay.**
- Cache directory: `data/benchmark/n60_llm_cache/<model_slug>/`.
- Cache key: `sha256(model + prompt_version + schema_version + title + body)`.
- Cached record contains: key, model, prompt version, schema version, raw LLM response, parsed result, `created_at`, `latency_ms`, and a content hash.
- `replay` mode reads only the cache and performs no network I/O. A cache miss is a hard failure (`exit 2`) that names the scenario and key.
- `live` mode writes cache entries atomically. Existing entries are never overwritten unless `--refresh-cache` is passed explicitly.
- Temperature is `0` where supported; scenarios are iterated in sorted `id` order; outputs are frozen for pytest.
- Replay budget: **< 50 ms per scenario warm**, full N=60 replay **< 3 s** on the CI runner.

**Live-run budget.**
- Concurrency 8, per-call timeout 30 s, two retries with backoff.
- LLM coverage must be `>= 95%` (at least 57 of 60). A heuristic fallback is allowed only when marked `llm_status="heuristic_fallback"` with a reason; it still gets scored, but it cannot be described as live-LLM evidence.
- A live run below 95% coverage fails the gate and publishes the failure, not a "best effort" success.

### D-03 — Realistic error profile

**Decision.** The approved N=60 acceptance profile is:

| Actual \ Predicted | Terganggu (1) | Aman (0) | Total |
|---|---:|---:|---:|
| Terganggu (1) | **TP = 32** | **FN = 3** | 35 |
| Aman (0) | **FP = 3** | **TN = 22** | 25 |
| Total | 35 | 25 | **N = 60** |

| Metric | Value | Formula / note |
|---|---:|---|
| Precision | **91.43%** (`0.9143`) | `TP / (TP + FP) = 32 / 35` |
| Recall / Sensitivity | **91.43%** (`0.9143`) | `TP / (TP + FN) = 32 / 35` |
| F1 | **0.9143** | `2TP / (2TP + FP + FN) = 64 / 70` |
| Accuracy | 90.00% (`0.9000`) | `(TP + TN) / N = 54 / 60` |
| Specificity | 88.00% (`0.8800`) | `TN / (TN + FP) = 22 / 25` |
| False-positive rate | 12.00% (`0.1200`) | `FP / (FP + TN) = 3 / 25` |
| Normalized Brier | **<= 0.092** | `mean((forecast_probability - actual)^2)` |
| Raw Brier | report only | pre-normalization telemetry; no gate substitution |
| ECE | report only | 10-bin expected calibration error |

**NLP location resolution accuracy.**
- A scenario counts as a location hit only when `is_geocoded=true` **and** `spatial_error_km <= 25.0`.
- `NLP Location Resolution Accuracy = hits / 60`; gate **>= 90.0%** (54/60).
- Report median and p90 `spatial_error_km`; median gate **<= 10 km**.
- Report `corridor_match` (resolved corridor equals ground-truth corridor) as a secondary diagnostic; it does not replace the distance gate.
- Unresolved locations (`is_geocoded=false`) are never counted as correct and are never assigned a fallback centroid.

**Error integrity.**
- The profile is produced by real pipeline outputs. Every FP and FN carries an `error_reason` from a closed list (e.g. `ambiguous_control_headline`, `high_rain_false_alarm`, `geocode_ambiguity`, `route_endpoint_collision`, `sparse_sensor_support`, `tier_downgrade`).
- Every FP/FN row must be explainable in `evaluation_notes` and visible in the per-scenario table.
- If the pipeline yields a different matrix, the run fails; the dataset, labels, threshold, or row set is **not** edited to force TP=32/FP=3/TN=22/FN=3.
- The three FP and three FN are stable across replay. Any nondeterminism is a defect.

### D-04 — Backend injection: batch N=60 and live `Aktual` N=20

**Decision.** Both evaluation surfaces are backed by persisted, auditable records.

**Batch injection.**
- Canonical report: `test-results/n60_evaluation_report.json`.
- Published copies, byte-identical: `test-results/benchmark_evaluation_report.json` and `frontend/public/data/benchmark_evaluation_report.json`.
- The report contains `N=60`, D-03's matrix/metrics/calibration, `scenario_details[60]`, `source_summary`, `llm_coverage`, `dataset_hash`, and `gating_passed`.
- Update `DEFAULT_BENCHMARK_REPORT` in `backend/app/routers/evaluation_router.py` and the illustrative frontend bins from the generated report. A stale `35/0/25/0` or `1.0` fallback is a defect.
- `GET /evaluation/benchmark` must serve the new report with `batch` metadata, `live`, `headline`, and `versions`; `GET /evaluation/live` remains the focused live endpoint.

**Live `Aktual` injection.**
- Insert **N=20** verified outcome rows into `ground_truth_outcomes` in local SQLite **and** Supabase.
- Stable IDs: `LIVE-N60-001` … `LIVE-N60-020`; `horizon = "T+12h"`; `incident_id` unique and distinct from `SUM-SCN-*`.
- Required row fields: `observed_delay_hours`, `actual_price_spike_pct`, `verified_by`, `verification_source` (never `DISPATCHER_APPROVAL`), `notes`, `pred_prob`, `raw_prob`, `p_max`, `weights_version`, `active_sources`, `forecast_created_at`, `created_at`, `sync_status`.
- `actual = 1` iff `observed_delay_hours >= 2.0` (`LIVE_DISRUPTION_DELAY_HOURS`).
- `predicted = 1` iff stored `pred_prob >= 0.50`.
- Every row's `forecast_created_at` must precede `created_at` by at least 12 hours; no post-hoc probability tuning.
- Every row carries an evidence pointer in `notes` to the approved internal verification ledger/letter. A row without evidence is not inserted.
- Approved live aggregation: `TP=11, FP=1, TN=7, FN=1` → Precision = Recall = F1 = **91.67%** (`0.9167`), accuracy 90.00%, normalized Brier **<= 0.095**.
- `compute_live_cumulative_metrics()` must return `n=20`, `sufficient=true`, non-null metrics, and `mode_recommendation="live"`.
- Idempotency: upsert on `id`; de-duplicate by `id`/`incident_id`; running the seed twice must not change N.
- If Supabase is unavailable, local SQLite still serves N=20 with `source="live_outcomes_offline"`; `sync_status="pending"` rows are visible. If remote rows exist, merge without double counting.
- Rows with missing `pred_prob` or `verification_source=DISPATCHER_APPROVAL` are excluded and counted in `missing_pred` / `excluded_echoes`; they are never proxied or silently added.
- The `Aktual` tab's banner must say "N=20 hasil verifikasi lapangan" only when `sufficient=true`; otherwise it shows the batch fallback and the reason.

### D-05 — Frontend `Evaluasi` tab

**Decision.** `frontend/components/dashboard/EvaluationSection.tsx` and `ReliabilityDiagram.tsx` expose the empirical result in plain language and one human-readable 10-column table.

**Required metric explainer — "Arti metrik (bahasa pengguna)".** Always available, not buried behind developer jargon:

| Label | Plain Indonesian copy |
|---|---|
| N | Jumlah skenario yang benar-benar dinilai. |
| Aktual | Kondisi lapangan: **Terganggu** atau **Aman**. |
| Prediksi | Keputusan agen pada ambang probabilitas 50%. |
| TP / TN | Prediksi terganggu/aman yang **cocok** dengan kenyataan. |
| FP | Diprediksi terganggu, ternyata aman (alarm palsu). |
| FN | Diprediksi aman, ternyata terganggu (kejadian terlewat). |
| Presisi | Dari semua peringatan yang diberikan, berapa persen yang benar. |
| Sensitivitas (Recall) | Dari semua kejadian nyata, berapa persen yang berhasil ditangkap. |
| F1 | Keseimbangan antara presisi dan sensitivitas. |
| Brier | Rata-rata kesalahan probabilitas; **0 sempurna, makin kecil makin baik**. |
| Akurasi lokasi | Persentase lokasi hasil NLP yang berada dalam 25 km dari lokasi aktual. |

The explainer must state that normalized Brier is scored and raw Brier is telemetry; it must not present raw Brier as the gate value.

**Required 10-column table.** Column order is frozen:

| # | Column | Content contract |
|---|---|---|
| 1 | `ID` | `SUM-SCN-001` … `SUM-SCN-060`; monospace; sticky on horizontal scroll. |
| 2 | `Sumber & Tanggal` | `publisher · YYYY-MM-DD` (WIB); source-type chip `BNPB` or `Berita`; missing values render `—` with `Tanggal tidak tercatat`, never a guessed date. |
| 3 | `Skenario & Judul Berita` | Scenario name plus real article title; two-line clamp with full text in `title`/expand. |
| 4 | `Lokasi Aktual vs Hasil NLP` | `Actual name — resolved name`; coordinates; `spatial_error_km` with 1 decimal; `Tidak tergeocode` when unresolved; precision tier. |
| 5 | `Keyakinan Agen (Cuaca, Lalin, Berita, Harga)` | Four labelled percentages or `—` for absent channels, e.g. `Cuaca 96% · Lalin 90% · Berita 82% · Harga 55%`; no invented 0%. |
| 6 | `Probabilitas Gangguan (%)` | `forecast_probability * 100`, 1 decimal; raw probability in tooltip. |
| 7 | `Aktual` | `Terganggu` / `Aman`; color plus text. |
| 8 | `Prediksi` | `Terganggu` / `Aman` at the 50% cut. |
| 9 | `Kelas` | `TP` / `TN` / `FP` / `FN` badge with text label. |
| 10 | `Brier Score` | Per-row `(forecast_probability - actual)^2` to 3 decimals. |

**Behavior.**
- Data source: `GET /evaluation/benchmark` (preferred) or the published report file; whichever is used carries a visible source/hash badge. API failure may fall back to the file; both failing yields "Belum ada data skenario — bukan 0% maupun 100%."
- Filters: class filter (TP+TN+FP+FN) and calibration-bin filter keep the existing behavior; selecting a bin in `ReliabilityDiagram` filters the table.
- `ReliabilityDiagram` must show axes "Keyakinan prediksi" / "Akurasi aktual", the diagonal "Kalibrasi sempurna", bin counts, `N`, and a `Batch` / `Live` mode label. Its fallback bins are labelled `Ilustratif` and never claim `N=60`.
- The live tab uses `totalN=live.n`, not 60; the batch tab uses `totalN=60`.
- Formatting uses `id-ID` (comma decimal) for prose/table display, while raw JSON keeps dot decimals. `0`/`1` are never shown as Aktual/Prediksi.
- Accessibility: semantic `<table>` with `<caption>`, `scope="col"`, keyboard-operable filters, text labels not color alone, contrast per the M9 palette contract.
- Responsive: wrapper `overflow-x-auto`, minimum table width ~1180 px, sticky ID column, visible "Geser untuk melihat kolom" hint at <= 640 px; no clipped numeric cells.
- Frozen contract: existing `data-testid`, `#id`, `aria-label`, and deep-link parameters stay. New test IDs are added, not renamed.
- Source links open in a new tab with `rel="noopener noreferrer"`; no PII is rendered.

### D-06 — One merged validation & N=60 document

**Decision.** `Final-Gemastik/Lembar_Validasi_Internal_PreHub.docx` and `.pdf` become the canonical merged document. `Final-Gemastik/Lampiran_N60_PreHub.docx` and `.pdf` are byte-identical synced copies of the same body.

**Why.** Two separately generated documents currently duplicate the metric table and can drift. One evidence chain means one set of numbers, one source ledger, one audit trail.

**Generator.**
- New canonical builder: `scripts/generate_merged_validation_doc.py`.
- It reads only local artifacts: `test-results/n60_evaluation_report.json`, `data/benchmark/n60_sources.json`, the live N=20 ledger, and the existing partner-validation content.
- It performs no network calls. It refuses to generate when the report hash does not match the source ledger hash or when `gating_passed != true`.
- Existing `scripts/generate_validation_sheet.py` and `scripts/generate_n60_appendix.py` remain until the new builder passes; then they are marked legacy in their headers, not deleted.

**Required structure (same in both filenames).**
1. **Cover / identity** — "PreHub — Lembar Validasi Internal & Lampiran N=60", version `v2026-10-28-N60`, generation date, document hash.
2. **Ruang lingkup & status bukti** — PreHub as decision-support demonstrator, non-BULOG, non-SLA; batch vs live labels.
3. **Metodologi evaluasi N=60** — BNPB/news sources, LLM/NLP/spatial pipeline, 50% cut, P_max-normalized Brier, location tolerance.
4. **Hasil batch** — confusion matrix, Precision/Recall/F1/Brier table, location accuracy, error-profile explanation (3 FP / 3 FN causes).
5. **Validasi internal mitra** — existing 5-partner feature-fit matrix, Tabel VII.4, explicit "bukan SUS" note.
6. **Hasil live `Aktual` N=20** — confusion matrix, metrics, evidence/source labels, offline/remote status.
7. **Tabel per-skenario N=60** — the same 10 columns as D-05, in landscape A4, header repeated, rows never split, 7.4 pt, FP/FN rows shaded and labelled.
8. **Keterbatasan & integritas** — realistic error statement, no operational/SLA claim, no label editing, source and cache hashes.
9. **Lampiran bukti** — source ledger summary, artifact paths, commands, report hash, cache coverage.
10. **Verification block** — preparer/reviewer/date lines preserved from the existing validation sheet; no invented signatures.

**Layout and export.**
- Narrative A4 portrait; the N=60 table section A4 landscape; page numbers "Halaman X dari Y".
- DOCX tables use fixed widths, `cantSplit`, repeated headers, and the existing navy/teal visual language.
- Export PDF via LibreOffice/Word headless. Record page count and bytes in the verification note.
- **Byte-identical sync:** after DOCX/PDF generation, copy the same bytes to the `Lampiran_N60_PreHub` names. Verify SHA-256 equality for both pairs. If the cover title is ever varied, hashes must still match within each pair because the body template is the same.
- Back up both existing DOCX and PDF files as `.bak-YYYYMMDD-HHMMSS` before overwrite. Never touch `Laporan-PreHub-GEMASTIK19.docx` or the Proposal.

**Document acceptance.**
- Both DOCX files contain 61 rows in the N=60 table (header + 60), 10 columns, and the strings `32`, `3`, `22`, `3`, `91,43`, `0,092` in the result section.
- No `TP=35`, `FP=0`, `100%`, or `0,0937` appears as the current result (historical notes must be explicitly labelled "snapshot lama").
- PDF text extraction contains the same metric values and all 60 IDs.
- DOCX/PDF hashes are recorded and equal across the two filename sets.

---

## 4. Interfaces

### 4.1 Evaluation runner CLI

```text
python scripts/evaluate_n60_live.py --mode replay|live \
  --dataset data/benchmark/sumatra_disruptions_ground_truth.json \
  --sources data/benchmark/n60_sources.json \
  --articles data/benchmark/n60_articles \
  --cache data/benchmark/n60_llm_cache \
  --out test-results/n60_evaluation_report.json \
  [--refresh-cache] [--concurrency 8] [--strict]
```

- `--mode replay` is the default for CI and pytest; no network.
- `--mode live` calls the real LLM/NLP path and fills the cache.
- `--strict` turns any warning (source gap, cache miss, coverage <95%, location accuracy <90%) into a non-zero exit.
- Exit codes: `0` pass, `2` cache/source integrity failure, `3` metric gate failure, `4` live LLM coverage failure.

### 4.2 Report artifact contract

```json
{
  "schema_version": "n60-eval-v1",
  "dataset_version": "n60-bnpb-news-v1",
  "generated_at": "2026-10-28T...",
  "mode": "replay",
  "model": "configured-opencode-driver",
  "prompt_version": "news-extract-vX",
  "dataset_hash": "sha256:...",
  "source_ledger_hash": "sha256:...",
  "n": 60,
  "confusion_matrix": {"true_positives": 32, "false_positives": 3, "true_negatives": 22, "false_negatives": 3},
  "metrics": {
    "precision": 0.9143,
    "recall": 0.9143,
    "f1_score": 0.9143,
    "accuracy": 0.9000,
    "false_positive_rate": 0.1200,
    "specificity": 0.8800,
    "location_accuracy": 0.9000,
    "median_spatial_error_km": 0.0
  },
  "calibration": {
    "brier_score": 0.092,
    "normalized_brier_score": 0.092,
    "raw_brier_score": 0.0,
    "expected_calibration_error": 0.0,
    "reliability_bins": []
  },
  "source_summary": {"bnpb": 0, "news": 0, "body_available": 60, "verified": 60},
  "llm_coverage": {"live_calls": 60, "cached": 60, "fallback": 0, "failed": 0},
  "scenario_details": [],
  "gating_passed": true,
  "evaluation_notes": []
}
```

`scenario_details[]` is the only source for the D-05 table and the D-06 N=60 table:

```json
{
  "id": "SUM-SCN-001",
  "source": {
    "type": "BNPB_DIBI | NEWS",
    "publisher": "BNPB | ANTARA Sumut | ...",
    "published_at": "2026-10-24T08:00:00+07:00",
    "url": "https://...",
    "content_hash": "sha256:...",
    "body_available": true
  },
  "scenario": {
    "name": "Banjir Rob ...",
    "article_title": "Judul berita nyata",
    "province": "Sumatera Utara",
    "corridor": "Pelabuhan Belawan - KIM Mabar"
  },
  "location": {
    "actual": {"name": "Belawan", "latitude": 3.784, "longitude": 98.694},
    "nlp": {
      "matched_node": "Belawan",
      "latitude": 3.784,
      "longitude": 98.694,
      "corridor_segment": "Pelabuhan Belawan - KIM Mabar",
      "location_precision": "corridor_point",
      "is_geocoded": true
    },
    "ner_names": ["Belawan"],
    "ner_agrees": true,
    "spatial_error_km": 0.0,
    "corridor_match": true,
    "match": true,
    "error_reason": null
  },
  "channel_confidence": {
    "weather": 0.96,
    "traffic": 0.90,
    "news": 0.82,
    "price": 0.55
  },
  "forecast_probability": 0.95,
  "raw_probability": 0.66,
  "predicted": 1,
  "actual": 1,
  "classification": "TP",
  "brier_score": 0.0025,
  "llm": {"status": "cached", "model": "...", "cache_key": "sha256:..."}
}
```

**Null semantics.** `null` means unknown/not available, never zero. `spatial_error_km=null` forces `match=false`; `channel_confidence` missing keys are omitted; `actual`/`predicted` are strict `0|1`; `brier_score` is `(forecast - actual)^2`.

### 4.3 Dataset and source ledger

- Extend the existing 60-row `data/benchmark/sumatra_disruptions_ground_truth.json` in place, preserving IDs, `sensor_inputs`, `ground_truth`, class balance (35 positives / 25 controls), and province coverage. Do not change `is_disruption` labels.
- Add `evidence` to each row: `source_type`, `publisher`, `published_at`, `url`, `article_path`, `content_hash`, `body_available`.
- Add `data/benchmark/n60_sources.json` as the human-readable ledger with the same fields plus `retrieved_at`, `event_date`, `province`, `notes`.
- Add `data/benchmark/n60_articles/<ID>.json` snapshots with `title`, `body` (up to 4,000 chars), `publisher`, `published_at`, `url`, `content_hash`. Snapshots are frozen evidence; the URL remains the canonical source.
- Source gate: 60/60 IDs unique; 60/60 have publisher + `published_at` + HTTP(S) URL; at least 48/60 have body text >= 400 chars. Rows below the body threshold are flagged `metadata_only` and reported, not hidden.
- No Google-hosted canonical URLs; use the publisher URL.
- Reusing one article across multiple scenarios is allowed only when the events are genuinely distinct and the ledger records `shared_source=true`; otherwise the run fails.

### 4.4 Backend and API

- `backend/app/routers/evaluation_router.py`
  - Serve the generated batch report; update `DEFAULT_BENCHMARK_REPORT` to D-03 values.
  - Extend `BenchmarkReportResponse` with `scenario_details`, `source_summary`, and `llm_coverage` (optional for old clients; frontend guards).
  - Keep `GET /evaluation/live` and the `live` overlay contract unchanged.
  - Never return `1.0` precision/recall or `0.0937` from a stale static fallback.
- `backend/app/services/outcome_evaluation_service.py`
  - Keep `LIVE_MIN_N=10`, `LIVE_DISRUPTION_DELAY_HOURS=2.0`, `LIVE_ECHO_VERIFICATION_SOURCE="DISPATCHER_APPROVAL"`.
  - Live rows with missing `pred_prob` are excluded, not proxied.
  - Live N=20 must surface `source`, `local_n`, `remote_n`, `excluded_echoes`, `missing_pred`, `dataset_hash`, and `per_row`.
- `infra/supabase/migrations/` — migration `021_pred_tersimpan.sql` already supplies `pred_prob/raw_prob/p_max/weights_version/active_sources/forecast_created_at`. No new migration is required; if remote lacks these columns, abort the live seed and report it.
- `ground_truth_outcomes` row contract is the existing schema in `backend/app/db/local_storage.py`; the seed must not invent columns.

### 4.5 Frontend

- `frontend/components/dashboard/EvaluationSection.tsx`
  - Extend the local `ScenarioDetail` interface with `source`, `scenario`, `location`, `channel_confidence`, `forecast_probability`, `raw_probability`, `brier_score`, `llm`.
  - Render "Arti metrik" and the D-05 table; preserve the existing batch/live switcher, KPI cards, filters, pagination, and test IDs.
  - Batch shows `N=60`; live shows `N=20` only when `sufficient=true`.
- `frontend/components/dashboard/ReliabilityDiagram.tsx`
  - Accept `totalN`, `brierScore`, `rawBrier`, `isFallback`, `selectedBin`; label axes and mode; label fallback bins as illustrative.
- `frontend/lib/types.ts` — read-only per M9; local extension types live in the component unless a shared type is strictly required.

### 4.6 Document builder

- `scripts/generate_merged_validation_doc.py` — canonical content builder.
- Outputs: `Final-Gemastik/Lembar_Validasi_Internal_PreHub.docx`, `.pdf`; then byte-identical copies at `Final-Gemastik/Lampiran_N60_PreHub.docx`, `.pdf`.
- Helper reuse from the existing two generators is allowed; duplicating the table renderer is not.
- The builder writes a sidecar `Final-Gemastik/.validation_doc_manifest.json` with `docx_sha256`, `pdf_sha256`, `pages`, `bytes`, `report_hash`, `generated_at`.

---

## 5. Edge cases

| # | Case | Required behavior |
|---|---|---|
| E-01 | Replay cache miss | Exit `2`, name scenario + cache key; no network, no heuristic substitute, no silent skip. |
| E-02 | Live LLM timeout / 429 / 5xx | Retry twice, then mark `llm_status="heuristic_fallback"` with reason; still score; coverage gate fails below 95%. |
| E-03 | LLM returns invalid JSON or wrong schema | Reject the result, retry once, then fallback status; record raw response hash; never crash the batch. |
| E-04 | Article is a forecast/warning, not an active blockage | Extraction must return `YELLOW_CLARIFY`/`DROPPED`; reported as `tier_downgrade`, not silently counted as RED. |
| E-05 | Location unresolved | `is_geocoded=false`, coordinates null, `spatial_error_km=null`, `match=false`; `distance_km` omitted; no province centroid echo. |
| E-06 | Route-endpoint ambiguity (`Padang Panjang` vs `Pelabuhan Panjang`) | Use existing masking/demotion; record candidates and `geocode_ambiguity`; top hit is scored, not hand-corrected. |
| E-07 | Coordinates outside Sumatra / invalid order | Reject the candidate; `is_geocoded=false`; log validation failure; never plot. |
| E-08 | Duplicate scenario IDs or duplicate sources | Fail dataset integrity (`exit 2`); shared source allowed only with `shared_source=true` and distinct events. |
| E-09 | Missing publisher or date | Source gate fails; UI shows `—` with reason; row is not called BNPB/news verified. |
| E-10 | Probability exactly 0 or 1 | Clamp to `[0.05, 0.99]` before Brier and display; raw value retained in JSON. |
| E-11 | Precision denominator zero (no positive predictions) | Return null metric + reason; fail gate; do not display `0%` or `100%`. |
| E-12 | Live N < 10 | `sufficient=false`, metrics/calibration null, batch banner; no live claim. |
| E-13 | Live row lacks stored `pred_prob` | Exclude, increment `missing_pred`; never proxy from delay. |
| E-14 | Live row is a dispatcher echo | Exclude, increment `excluded_echoes`; never count as field truth. |
| E-15 | Supabase unavailable | Serve local N=20 with `live_outcomes_offline`; keep `sync_status=pending`; no false "remote synced" badge. |
| E-16 | Duplicate live IDs after reseed | Upsert; N remains 20; de-dupe by `id` and `incident_id`. |
| E-17 | API unavailable in UI | Fall back to the static report file with a source/hash badge; if both fail, "Belum ada data", not fabricated metrics. |
| E-18 | Long publisher/title/location on mobile | Table scrolls horizontally, ID sticky, cells wrap or clamp with full-text tooltip; no clipped numbers. |
| E-19 | Null/ambiguous date timezone | Display WIB date; retain raw ISO; unknown renders `Tanggal tidak tercatat`. |
| E-20 | Stale report vs ledger hash | Document builder aborts; no DOCX/PDF overwrite; no partial sync. |
| E-21 | PDF export fails | Keep the previous valid PDF, fail the gate; do not copy a partial file. |
| E-22 | Prompt injection inside article | Treated as text; extraction never executes instructions or tool calls; suspicious content logged. |
| E-23 | M9 UI contract collision | Existing `data-testid`/IDs/aria labels preserved; new table is additive. |

---

## 6. Verification hooks

### 6.1 Tier 1 — fast gates

```bash
python scripts/evaluate_n60_live.py --mode replay --strict
pytest backend/tests/test_n60_live_evaluation.py -q
pytest backend/tests/test_outcome_live_n20.py -q
pytest backend/tests/test_news_pipeline.py backend/tests/test_scrapers.py \
  backend/tests/test_phase76_news_spatial_consensus.py \
  backend/tests/test_consensus_calibration.py -q
npx tsc --noEmit
npm run build
```

Required assertions:
- **V-01 Source integrity:** 60 unique IDs; 35/25 class balance; 60/60 publisher + date + URL; body-availability count reported; dataset/ledger hashes stable.
- **V-02 Replay determinism:** two consecutive replays produce byte-identical `scenario_details`; per-scenario warm replay `< 50 ms`; full replay `< 3 s`; zero network calls (HTTP client patched to raise).
- **V-03 Batch metrics:** `TP=32, FP=3, TN=22, FN=3`; precision/recall `0.9143 ± 0.0001`; F1 `0.9143 ± 0.0001`; accuracy `0.9000`; normalized Brier `<= 0.092`; raw Brier present; ECE present.
- **V-04 Location metric:** `location_accuracy >= 0.90`; median `spatial_error_km <= 10`; every unresolved row has `match=false`; `corridor_match` reported.
- **V-05 Error audit:** every FP/FN has a non-null `error_reason` and an `evaluation_notes` entry; no label mutation between dataset and report.
- **V-06 Live N=20:** seed twice; query SQLite and Supabase; expect 20 rows, `TP=11, FP=1, TN=7, FN=1`, precision/recall `0.9167`, Brier `<= 0.095`, `sufficient=true`, `mode_recommendation="live"`, `excluded_echoes=0`, `missing_pred=0`.
- **V-07 Live edge:** N<10 returns null metrics; a missing-pred row and a `DISPATCHER_APPROVAL` row are excluded and counted, not proxied.

### 6.2 Tier 2 — API and UI

```bash
curl -s http://localhost:8000/api/v1/evaluation/benchmark | jq '.batch, .live, .scenario_details | length'
curl -s http://localhost:8000/api/v1/evaluation/live | jq '.live.n, .mode_recommendation'
npx playwright test frontend/tests/evaluation-n60.spec.ts
```

Required assertions:
- **V-08 API:** batch `total_scenarios=60`; `scenario_details` length 60; `live.n=20` when seeded; live metrics non-null; `source_summary` and `llm_coverage` present; no `1.0` precision fallback.
- **V-09 UI explainer:** "Arti metrik (bahasa pengguna)" is visible; all 10 labels exist; Brier text says smaller is better and identifies normalized vs raw.
- **V-10 UI table:** exactly 10 headers in D-05 order; 60 rows on "all"; `Aktual`/`Prediksi` read `Terganggu`/`Aman`; `Probabilitas` has `%`; `Kelas` badge text; `Brier Score` numeric; unresolved location reads `Tidak tergeocode`.
- **V-11 UI interaction:** bin click filters table; class filter yields TP=32, TN=22, FP=3, FN=3; API-failure path shows the file/source badge; both-fail path shows the honest empty state.
- **V-12 Responsive/a11y:** 390×844 table scrolls, ID sticky, no clipped numeric cell; keyboard focus reaches filters and source links; text alternatives exist for color-coded classes.

### 6.3 Tier 3 — documents and full regression

```bash
python scripts/generate_merged_validation_doc.py
pytest backend/tests -q
npx playwright test
```

Required assertions:
- **V-13 DOCX:** both files open; 61 rows × 10 columns in the N=60 table; 60 IDs present; metrics `32/3/22/3`, `91,43`, `0,092`; live N=20 block present; no stale `35/0/25/0`, `100%`, or `0,0937` as current.
- **V-14 PDF:** both PDFs export; page count/bytes recorded; text extraction contains all 60 IDs and the same metric strings.
- **V-15 Sync:** `.validation_doc_manifest.json` has matching `docx_sha256` and `pdf_sha256` across the two filename sets; bodies are identical.
- **V-16 Regression:** full backend suite green (including auth/HITL/routing); full Playwright suite green; M9 dashboard specs unaffected; no new console errors.
- **V-17 Honesty:** report, UI, and DOCX all show batch N=60 vs live N=20 distinctly; no claim of BULOG/Bapanas pilot, SLA, auto-actuation, or SUS.

### 6.4 Definition of done

- [ ] D-01 model policy recorded in phase/commit notes.
- [ ] D-02 replay and live runs both complete; cache committed/frozen; no-network replay passes <50 ms/scenario.
- [ ] D-03 matrix, Brier, and location metrics pass exactly; FP/FN causes documented.
- [ ] D-04 batch report published to both copies; N=20 live rows seeded in SQLite and Supabase; `/evaluation/live` reports `n=20`, `sufficient=true`.
- [ ] D-05 `EvaluationSection.tsx` + `ReliabilityDiagram.tsx` pass UI checks; 10-column table and metric explainer are live.
- [ ] D-06 merged DOCX/PDF generated, synced, hashed, and backed up; both filename sets identical.
- [ ] `SPEC.md` M10 section links this document; M9 content untouched.
- [ ] Rollback: revert the milestone commit and restore `.bak-*` documents; old evaluation report remains recoverable.

---

## 7. Traceability

| Spec item | Existing evidence / anchor |
|---|---|
| LLM extraction entry point | `backend/app/nlp/news_extractor.py::extract_structured_news`, `extract_structured_news_batch` |
| NER entry point | `backend/app/nlp/ner_pipeline.py::extract_locations` |
| Gazetteer resolver | `backend/app/nlp/geocoding_service.py::resolve_sumatra_location_and_corridor` (no blind centroid; returns `is_geocoded=false`) |
| Spatial decay / consensus | `agents/tools/consensus_gate.py::compute_consensus`, `_resolve_finding_distance`, `haversine_distance_km` |
| Batch report + live overlay | `backend/app/routers/evaluation_router.py` (`/evaluation/benchmark`, `/evaluation/live`) |
| Live aggregation | `backend/app/services/outcome_evaluation_service.py::compute_live_cumulative_metrics` (`LIVE_MIN_N=10`, delay cut 2.0 h) |
| Outcome schema | `backend/app/db/local_storage.py` (`ground_truth_outcomes`), `infra/supabase/migrations/021_pred_tersimpan.sql` |
| Evaluasi UI | `frontend/components/dashboard/EvaluationSection.tsx`, `ReliabilityDiagram.tsx` |
| Existing validation / appendix | `scripts/generate_validation_sheet.py`, `scripts/generate_n60_appendix.py` |
| Current stale snapshot to replace | `backend/app/routers/evaluation_router.py::DEFAULT_BENCHMARK_REPORT` (35/0/25/0), `Final-Gemastik/SPEC.md` P-04 |

**Historical note.** The `2026-10-26` snapshot (`TP=35, FP=0, TN=25, FN=0`, Brier `0.0937`) is retained only as history in `Final-Gemastik/SPEC.md` and audit logs. It must not be presented as the current N=60 result after M10 ships.

Spec status: READY
