<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 84: News-Precision Gate-2 — Learnings

**Scope:** durable lessons from this window's Phase A diff (`1c51619..b443352`, code inside commit
`b443352`). Every entry is grounded in a committed diff hunk or a file read with line numbers.
No assumptions.

---

## 1. Fixes tried (what worked, with evidence)

### 1.1 Sumbing→Medan centroid: fixed at three layers, not one

- **Issue:** a Java/out-of-island toponym (observed case: Gunung Sumbing, Jateng ~110.07E/−7.38) resolved
  to a Sumatra node (Medan) — longest-key gazetteer matching plus centroid fallbacks converted
  out-of-scope text into a false pin.
- **Fix (3 layers):** (a) `gazetteer_data.py:26-56` — bbox tightened to 94–108E/−6…6 + `OUT_OF_SUMATRA_MARKERS`
  frozenset; (b) `geocoding_service.py:415-500` — bbox filter on every tier, Java-marker veto for
  Tier-2-only/Tier-3 results unless explicit Sumatra province context is present, Tier-1-verbatim
  exemption (Bakauheni–Merak keeps working), `[]`-not-centroid fallthrough; (c) extractor
  `news_extractor.py:434` (out-of-Sumatra fails spatial) + `:564-578`/`:678-684` (zero-zone DROP) +
  ingestor synthesis guard `unified_news_ingestor.py:391-414` (`SKIPPED_OUT_OF_SUMATRA`) + client bbox
  mirror `useNewsVerification.ts:797-799`.
- **Lesson:** a toponym guard at only one layer leaks through the others (heuristic → LLM → synthesis →
  client). The post-LLM deterministic re-check (`news_extractor.py:975-1010`) is the load-bearing piece:
  without it the LLM re-introduces exactly the pin the heuristic removed.

### 1.2 Mitigasi YELLOW: ceremony is now a discourse type, not a severity tweak

- **Issue:** prevention-ceremony articles (e.g. "Lampung Selatan Mitigasi") promoted to YELLOW zones.
- **Fix:** `PREVENTION_CEREMONIAL_MARKERS` (`news_extractor.py:72-86`) + classifier branch (`:309-330`) +
  `NON_INCIDENT_DISCOURSE_MARKERS` extension + gate rule "ceremony without physical blockage fails
  discourse" (`:425`) + heuristic DROP (`:684-700`) + client marker mirror
  (`useNewsVerification.ts:181-220`). Indonesian `tier_reason` strings preserved so the DROP is auditable.
- **Lesson:** severity-threshold tuning cannot fix a category error — ceremony needed its own discourse
  type upstream of tiering, mirrored on the client (stale-cached rows otherwise re-render the YELLOW).

### 1.3 Schema v4-vs-v6 drift: the version constant is a contract, grep it

- **Issue:** extraction contract moved 4→(5)→6 while readers still compared against 4; stale rows served
  stale tiering/geocoding. The ingestor even carried an intermediate `!= 5` (`unified_news_ingestor.py`
  pre-image line) — three versions live in one window's history.
- **Fix:** single source `EXTRACTION_SCHEMA_VERSION = 6` (`news_extractor.py:29`,
  `news_aggregator.py:135`) + every comparison site moved to `!= 6` (aggregator ×4, router ×2, ingestor).
- **Lesson:** after any schema bump, `grep -rn "schema_version.*!= "` and `grep -rn "setdefault(\"schema_version\""` —
  a version constant that isn't referenced everywhere is a drift factory. The re-tier-on-read pattern
  (aggregator `:574-584`, router `:140-157`) is what makes the bump deploy-safe without migrations.

### 1.4 Selective Gate-2: uncertainty-gated spend, hot path untouched

- **Evidence:** `_needs_gate2_review` (`news_extractor.py:1080-1116`, conf < 0.7 `:1101`); runner caps
  (`:81-86`: 2500ch body floor, 5-conc semaphore `:1468`, 60 s/item timeout `:1475`, MD5 cache/500
  `:85-89`/`:1235-1249`/`:1435-1437`); scheduling is fire-and-forget *after* the sync return
  (`unified_news_ingestor.py:202-214`); corroboration capped to `GATE2_PHYSICAL_BLOCKAGE` (`:1171/:1216`);
  still-uncertain → DROPPED + persisted (`:580-596`, `:1292-1301`).
- **Lesson:** the test that pins the budget is "Gate-1 latency unchanged with Gate-2 enabled", not the
  Gate-2 accuracy case. Persisting DROPPED verdicts (`remember_processed_article`) is what converts a
  recurring cost into a one-time cost.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **No Gate-2/FIRMS tests exist.** `backend/tests/` has no gate2 or firms spec; `b443352` added 624 lines to the extractor with zero test pins. | `backend/tests/` listing (24 files, none gate2/firms); `git show b443352 --stat` |
| 2 | **No tsc/pytest re-run after `b443352`.** Last green (tsc 0, 35-test bundle) predates the news/FIRMS code. | Phase 83 walkthrough §4 timestamps vs `b443352` |
| 3 | **Code+docs bundled in a mislabeled commit.** `b443352` ("docs(83)") contains 17 code files + 3 docs files; the 83 walkthrough §8 "foreign files left untouched" claim was true at write time but stale after this commit landed them. | `git show b443352 --stat` (20 files) |
| 4 | **`news/live` cold ≈ 11.5 s** (window-reported) vs 20 s client timeout and 30–77 s Render cold starts — first-hit probes fail while warm pass. | Task context; `.planning/LEARNINGS.md:221` (30–77 s cold) |
| 5 | **Q4/Q5 unassigned in-tree.** Zero SPEC-LOCKED Q4/Q5 markers in committed diffs. | `grep Q4\|Q5 backend` = 0 hits |
| 6 | **RLS `USING (true)`, `[0,0]` defaults, actual-toll-zero, `sync_status` no-drain** — all still open from Phase 82/83. | Phase 83 learnings §2.1–2.4; `.planning/LEARNINGS.md:223-226` |
| 7 | **Pre-existing env failure:** `simulate/stream` needs absent `langgraph`; canonical-URL test expects `google.com/search`. Unrelated to M5, do not chase here. | `.planning/LEARNINGS.md:235` |

---

## 3. Constraints (user-given, active)

| Constraint | Effect |
|---|---|
| Muse Spark orchestrator, Deepseek/GLM workers only | Model routing: Gate-1 deepseek-v4.1-flash (driver), Gate-2 mimo-v2.6-pro low-effort (reasoning) — pinned in `render.yaml:29-34`, `config.py:47-48` |
| Prod-only Playwright: skip-local, flip on prod | No API-backed specs added to the frontend-only harness; verify Gate-2 against prod pair only |
| Admit-uncertainty > FP | DROPPED over YELLOW everywhere; FPR ≤ 0.15 in `evaluation.py:49-51` |
| Selective Gate-2 (Q2+Q7) | Uncertain/YELLOW/conf<0.7/ambiguous only; Gate-1 sync never slowed |
| Async capped budget | 5-conc, 60 s/item, MD5 cache ≤ 500, single web-search per item |
| MAP_KEY provision path | Render env `sync:false` + `.env.local` locally, never committed (`.env.example:54-61`, `render.yaml:45-46`) |
| No git commit/push in this docs task | Separate worker owns commits — this task writes files only |

## 4. Re-prove recipe (next window, against prod — warm `/health` first)

1. `GET https://peta-nadi.onrender.com/api/v1/news/live` → rows carry `ground_truth_metrics.schema_version == 6`.
2. Sumbing case: article containing "Gunung Sumbing / Jawa Tengah" without Sumatra Tier-1 node →
   `DROPPED_IRRELEVANT`, zero zone, no Medan pin.
3. Mitigasi case: "mitigasi/pemetaan/sosialisasi/apel-siaga" without blockage predicate → DROPPED, never YELLOW.
4. Uncertain/YELLOW item → Gate-2 background refines within minutes; repeat fetch serves refined verdict with 0 new LLM calls (DB-first reuse).
5. `npx tsc --noEmit` exit 0; 35-test bundle green; add Gate-2 selector unit test
   (`_needs_gate2_review`: YELLOW→True, RED_CONFIRMED high-conf→False, DROPPED→False).
