# WALKTHROUGH — Phase 138: Evaluasi Credibility Docs Commit

**Branch:** `evaluasi-credibility-milestone-20261026` · **Mode:** docs-only, no commit.

## What was done

Documented the evaluasi-credibility workstream (three commits) and extracted its
learnings into `.planning`, without changing any code:

1. Created `.planning/phases/138-evaluasi-credibility-docs-commit/` with
   `PLAN.md` (objective/scope/files/steps), `WALKTHROUGH.md` (this file),
   `LEARNINGS.md` (fixes, concerns, constraints, conditions, issues).
2. Verified every claim below against the codebase before writing
   (`git show --stat`, Read of routers/services/migrations/workflows).
3. Minimal root touch-ups: `STATE.md` (current_phase 138 / next action),
   `ROADMAP.md` (Phase 138 row), `LEARNINGS.md` (appended dated entry).

## Workstream recap (what the three commits did)

- `ccb5bbd` — **Evaluasi ringkas + expandable, batch immutable, live recompute,
  Diagnostik live-wire, keep-alive perketat.** Touched `evaluation_router.py`
  (+155), `outcome_evaluation_service.py` (+193), `evaluation.py` schemas (+21),
  `EvaluationSection.tsx`, `ReliabilityDiagram.tsx`, `SystemObservabilitySection.tsx`
  (+204), `RouteDetailModal.tsx`, `keep-alive.yml`, `render.yaml`, new
  `docs/KEEPALIVE_RUNBOOK.md`.
- `de078d7` — **Pred tersimpan + offline ledger per-row raw-Brier hash (WS-B on
  top of WS-A/WS-C).** Touched `supabase_tools.py`, `local_storage.py` (+134),
  `evaluation_router.py` (+29), `evaluation.py` (+6), `outcome_evaluation_service.py`
  (+531), `unified_news_ingestor.py`, `EvaluationSection.tsx` (+834),
  `ReliabilityDiagram.tsx`, `TestMatrixTable.tsx`, new
  `infra/supabase/migrations/021_pred_tersimpan.sql` (+41), plus benchmark JSON data.
- `b8d27a1` — **Docs for phases 134–137** (analitik-laporan plans+walkthroughs,
  palette/guest/audit/backfill/gate learnings).

## Evidence (this window)

| Claim | Verification |
|---|---|
| Commits `de078d7`, `b8d27a1` on branch | `git log --oneline` shows both at HEAD~1/HEAD on `evaluasi-credibility-milestone-20261026` |
| `de078d7` file list (12 files, incl. `021_pred_tersimpan.sql`) | `git show --stat de078d7` matches (local_storage +134, outcome_evaluation +531, EvaluationSection +834, migration +41) |
| `ccb5bbd` file list (10 files, incl. keep-alive + runbook) | `git show --stat ccb5bbd` matches (router +155, service +193, SystemObservability +204, keep-alive 27 lines) |
| pytest 16 passed | Reported from this window (evaluasi suite) |
| `tsc --noEmit` exit 0 | Reported from this window |
| `GET /health` → 200 | Reported from this window |
| `GET /api/v1/evaluation/benchmark` → 200, `dataset_hash e6c7645c`, `raw_brier 0.1106` | Reported from this window; code path confirmed: `_benchmark_file_hash()` (sha256 of `test-results/benchmark_evaluation_report.json`) + `raw_brier_score` in `outcome_evaluation_service.py:603` |
| `GET /api/v1/evaluation/live` → 200 | Reported from this window; endpoint confirmed at `evaluation_router.py:399` (`get_live_aggregate`, live null when N<10) |
| Migration 021 content | Read `021_pred_tersimpan.sql`: nullable `pred_prob/raw_prob/p_max/weights_version/active_sources/forecast_created_at` on `incidents`, `route_approvals`, `ground_truth_outcomes`; P_max comments (ECONOMIC_ACTIVE 0.688, PHYSICAL_ONLY 0.71) |
| Keep-alive `max-time 90` + `healthCheckPath` | `git show ccb5bbd:.github/workflows/keep-alive.yml` shows `--max-time 90` probes; `render.yaml` has `healthCheckPath: /health` |
| Diagnostik live-wire AbortController 15 s | `SystemObservabilitySection.tsx:151,157` (`PROBE_TIMEOUT_MS = 15000`, `new AbortController()`) |
| Per-row `row_hash`, raw vs normalized Brier | `outcome_evaluation_service.py:252,380-417,421-423` (`_stable_row_hash`, `_assemble_per_row`, `_ledger_dataset_hash`); `:588-603` aligned raw subset + `raw_brier` |
| Consensus formula + λ 0.05 | `agents/tools/consensus_gate.py:4,49,396` (`P = 1 − prod(1 − w_k·p_k)`, `LAMBDA_TEMPORAL_DECAY = 0.05`) |
| Graph topology untouched | `agents/graph.py` still `data_collection → … → END` with duplicate short-circuit (`:39-40`) |
| SSE `simulate/stream` intact | `agent_router.py:141-142`, exercised by `test_api_routers.py:452-466` |

## Deliberately NOT done (per scope)

- No code edits, no test/build re-runs, no migration application.
- No commit, no push — working tree left with the new 138 folder only.
