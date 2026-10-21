<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 84 / Plan 01 — News-Precision Gate-2 (Phase A)

**Goal:** kill the two false-positive families observed on live news (Java/out-of-island centroid
mis-pinning, prevention-ceremony promoted to YELLOW) and re-verify only the uncertain remainder in a
capped async Gate-2, without slowing the Gate-1 sync hot path.

**Status:** implemented locally, committed on `main` inside `b443352`, pending deploy/verification.

## 1. Objective

- **Q1 (spatial + discourse precision):** hard Sumatra island bbox 94–108E / −6…6N enforced on every
  resolved coordinate (gazetteer AND Nominatim AND incident synthesis); Java/out-of-island toponyms
  (e.g. Gunung Sumbing Jateng) can never resolve to a Sumatra node; mitigasi/pemetaan/sosialisasi/
  apel-siaga without a physical blockage predicate is ceremony/prevention → `DROPPED_IRRELEVANT`,
  never a zone. Admit uncertainty > false positive; new `max_false_positive_rate: 0.15` gate.
- **Q2+Q7 (selective async Gate-2):** Gate-1 (DB-first + deepseek-v4.1-flash batch x5 sync) unchanged;
  only uncertain / YELLOW / conf<0.7 / ambiguous items spend extra budget (mimo-v2.6-pro low-effort +
  single web-search + W/T/I/E re-check, 5-concurrency, 60 s/item, MD5 cache capped at 500, schema v6).
  Still-uncertain resolves to `DROPPED_IRRELEVANT` (`koroborasi kurang`); refined verdicts upsert so the
  next cycle serves them with 0 LLM calls.

## 2. Scope

### In scope (committed in `b443352`, diff `1c51619..b443352`)

| File | Lines | Change |
|---|---|---|
| `backend/app/nlp/news_extractor.py` | `:29`, `:34-52`, `:57-66`, `:72-86`, `:331-500`, `:502-860`, `:975-1010`, `:1080-1500` | `EXTRACTION_SCHEMA_VERSION` 5→6; `STRICT_SUMATRA_BBOX` + helper; `OUT_OF_SUMATRA_TEXT_MARKERS` + helper; `PREVENTION_CEREMONIAL_MARKERS` (+ discourse classifier + `NON_INCIDENT_DISCOURSE_MARKERS` extension); verification-gate Q1 guards (ceremony-without-blockage fails discourse, out-of-Sumatra fails spatial, bbox post-check); deterministic island-bbox + prevention re-checks in heuristic and post-LLM paths; `_needs_gate2_review` (`:1080`), `_gate2_web_search_verify` (`:1118`), `_gate2_consensus_recheck` (`:1155`), `_gate2_verify_single_item` (`:1222`), `run_gate2_async_verification` (`:1452`, semaphore-capped) |
| `backend/app/nlp/gazetteer_data.py` | `:26-56` | `SUMATRA_BOUNDING_BOX` tightened 95–109E/−6.2…6 → 94–108E/−6…6; new `OUT_OF_SUMATRA_MARKERS` frozenset (sumbing, jateng/jatim/jabar + variants, semeru, jakarta/bandung/surabaya/yogya/banten) |
| `backend/app/nlp/geocoding_service.py` | `:10`, `:16-44`, `:415-500` | `STRICT_SUMATRA_BBOX` + `is_within_strict_sumatra_bbox` (Q1); `contains_out_of_sumatra_marker`; `is_within_sumatra` delegates to hard bbox; Tier-1 hits bbox-filtered (verbatim port/pass keeps exemption vs Java markers, e.g. Bakauheni–Merak); Tier-2-only + Java marker without Sumatra province context → `[]` (admit uncertainty, never Medan centroid); Tier-3 macro fallback vetoed by Java markers; empty bbox-filtered results return `[]`, never centroid |
| `backend/app/services/news_aggregator.py` | `:135`, `:574-584`, `:1001-1004`, `:1074`, `:1259-1310` | `EXTRACTION_SCHEMA_VERSION` 4→6; all stale-row checks `!= 4` → `!= 6` (read-path re-tier, upsert stamping); comments updated to v6 |
| `backend/app/services/unified_news_ingestor.py` | `:143-151`, `:202-214`, `:391-414`, `:553-596` | DB-first reuse requires `schema_version == 6` (was `!= 5` intermediate); Gate-2 background scheduling after sync path (`asyncio.create_task(run_gate2_background_review)`); hard island-bbox guard in incident synthesis → `DROPPED_IRRELEVANT` + `SKIPPED_OUT_OF_SUMATRA`; new `run_gate2_background_review` (select → verify → upsert + remember, never raises) |
| `backend/app/workers/ingestion_worker.py` | `:88-140` | `IngestionWorker.run_news_gate2_review` + module-level `run_news_gate2_background_task` (fire-and-forget safe, never raises) |
| `backend/app/routers/news_router.py` | `:140`, `:157` | Re-tier trigger `!= 4` → `!= 6` (two sites) |
| `backend/app/schemas/evaluation.py` | `:49-51` | `BenchmarkThresholds.max_false_positive_rate = 0.15` (admit-uncertainty contract) |
| `frontend/hooks/useNewsVerification.ts` | `:181-220`, `:797-799` | Client mirror: 13 prevention-ceremonial markers added; hard island-bbox filter (lat −6…6, lon 94…108) before zone render |

### Out of scope

- Gate-1 sync extraction model/prompts (deepseek-v4.1-flash batch x5 unchanged).
- Weather/FIRMS overlay work (Phase 85), deploy/verification (Phase 86).
- New tests for Gate-2/FIRMS paths — none were added this window (see Learnings §2.1).
- Migration 014 apply, RLS predicates, `sync_status` drain (still open from Phase 82).

## 3. Decisions Q1–Q7 + prod-only correction (as evidenced in-tree)

- **Q1 (precision, SPEC-LOCKED):** hard bbox + Java-marker veto + prevention-ceremonial guards at three
  layers (extractor, geocoder, ingestor synthesis) plus client mirror. Rationale in comments: admit
  uncertainty > false positive.
- **Q2+Q7 (selective async Gate-2, SPEC-LOCKED):** only uncertain items cost extra calls; Gate-1 sync
  path never slowed (background `create_task`, MD5 cache, 5-conc/60 s caps). Still-uncertain →
  DROPPED with `koroborasi kurang` reason, persisted so never re-tested.
- **Q3/Q6:** covered in Phase 85 (corroborator-only toggles, fire-as-I, FIRMS poller).
- **Q4/Q5:** no SPEC-LOCKED marker for Q4/Q5 exists in the committed diffs (`grep Q4|Q5 backend` = 0
  hits) — not documented here; do not invent. See orchestrator spec for assignment.
- **FPR gate:** `max_false_positive_rate: 0.15` pins the admit-uncertainty contract in the eval schema.
- **Prod-only correction:** Playwright harness still boots frontend only (no backend `webServer`, no JWT
  seed — cf. Phase 83 walkthrough §6, `.planning/LEARNINGS.md:232`). API-backed Gate-2/hedging specs
  stay skipped locally; flip on only against the deployed prod pair (warm `/health` first).

## 4. Walkthrough (what was implemented this window)

1. Bumped the extraction contract to **schema v6** (`news_extractor.py:29`) and migrated every stale-row
   check to `!= 6` (`news_aggregator.py` ×4 sites, `news_router.py` ×2, `unified_news_ingestor.py:146`).
   Stale rows re-extract on read; upserts stamp v6. (Note the ingestor's intermediate `!= 5` — v4/v5→v6
   drift history, see Learnings.)
2. Added Q1 guards: island bbox (`:34-52`), Java markers (`:57-66`), ceremony markers (`:72-86` +
   classifier `:309-330` + exclusions list), gate signature gains `longitude` (`:331-339`) so spatial
   checks use both axes, ceremony-without-blockage fails discourse (`:425`), out-of-Sumatra fails
   spatial (`:434`), coords outside bbox force `DROPPED_IRRELEVANT` with zero zone (`:564-578`,
   `:678-684`, `:684-700`), plus a post-LLM deterministic re-check (`:975-1010`, `:1295-1301`) so the
   LLM cannot re-introduce a Java pin or ceremony YELLOW.
3. Added selective Gate-2: selector (`:1080-1116`, conf < 0.7 threshold `:1101`), single web-search
   verify (`:1118`), W/T/I/E consensus re-check (`:1155-1220`, corroboration limited to
   `GATE2_PHYSICAL_BLOCKAGE` when blockage present `:1171/:1216`), per-item verify with cache + full-body
   2500ch+ fetch (`:1222-1450`), semaphore-capped runner (`:1452-1500`, defaults from `:83-84`).
4. Wired background review without touching the hot path: ingestor schedules `create_task` after the
   sync return (`unified_news_ingestor.py:202-214`), persists refined rows + remembers processed
   (`:580-596`); worker exposes standalone entry points (`ingestion_worker.py:88-140`).
5. Closed the geocoder hole: bbox on all tiers, Java-marker guard with Tier-1-verbatim exemption and
   Sumatra-context check for Tier-2/3, `[]`-not-centroid fallthrough (`geocoding_service.py:415-500`).
6. Mirrored both guards on the client (`useNewsVerification.ts:181-220` markers, `:797-799` bbox) so
   stale-cached rows can never render an out-of-island or ceremony zone.
7. Pinned FPR ≤ 0.15 in `BenchmarkThresholds` (`evaluation.py:49-51`).

## 5. Verification gates

| Gate | Command / probe | Expected | Status this window |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.json` (frontend/) | exit 0 | NOT re-run after `b443352` (last green pre-b443352, Phase 83 walkthrough §4) |
| Regression bundle | 35-test pytest bundle (routing-hedging/travels-erp/geocode-search/fleet-ingest) | all pass | NOT re-run after `b443352` |
| Gate-2 unit | no test file exists (`backend/tests/` has no gate2 spec) | — | MISSING — next window must add |
| Live re-tier | `GET /api/v1/news/live` cold ≈ 11.5 s expected; rows carry `schema_version: 6` | v6 rows, Sumbing/Mitigasi cases DROPPED | NOT probed this window — re-prove recipe in LEARNINGS §4 |
