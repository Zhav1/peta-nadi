# PLAN — Phase 138: Evaluasi Credibility Docs Commit

**Branch:** `evaluasi-credibility-milestone-20261026`
**Mode:** docs-only (no code changes, no commit by this agent)

## Objective

Close out the evaluasi-credibility workstream (commits `ccb5bbd`, `de078d7`, `b8d27a1`)
with accurate `.planning` records: one phase folder (PLAN + WALKTHROUGH + LEARNINGS),
plus minimal stale-doc touch-ups in root `STATE.md`, `ROADMAP.md`, `LEARNINGS.md`.

## Scope IN

- Create `.planning/phases/138-evaluasi-credibility-docs-commit/` with:
  - `PLAN.md` (this file), `WALKTHROUGH.md`, `LEARNINGS.md`.
- Verify each evidence claim against the codebase (read files, `git show --stat`).
- Minimal root updates: `STATE.md` current_phase/next action, `ROADMAP.md`
  append Phase 138 entry, `LEARNINGS.md` append one dated entry (no rewrite).

## Scope OUT (do NOT touch)

- `agents/graph.py` topology (duplicate → END fan-out stays).
- `agents/tools/consensus_gate.py` formula (`P = 1 − prod(1 − w_k·p_k)`, λ 0.05, d 0.25 km).
- `POST /api/v1/simulate/stream` SSE contract; no `lifespan` refactor.
- No code edits, no `tsc`/`pytest` re-runs, no deployments.
- No commit, no push (orchestrator owns git).
- Never write temp files; docs only under `.planning/phases/`.

## Files (verified to exist)

| Path | Role |
|---|---|
| `backend/app/routers/evaluation_router.py` | `/benchmark` (batch immutable + live overlay), `/live` |
| `backend/app/services/outcome_evaluation_service.py` | per-row ledger, `row_hash`, raw vs normalized Brier, echo exclusion |
| `backend/app/schemas/evaluation.py` | `solver_latency_ms` measured-per-request contract |
| `frontend/components/dashboard/EvaluationSection.tsx` | ringkas + expandable UI |
| `frontend/components/dashboard/ReliabilityDiagram.tsx` | reliability diagram |
| `frontend/components/dashboard/TestMatrixTable.tsx` | partial test matrix table |
| `frontend/components/dashboard/SystemObservabilitySection.tsx` | Diagnostik live-wire (AbortController, 15 s probe timeout) |
| `infra/supabase/migrations/021_pred_tersimpan.sql` | stored forecast columns (nullable, idempotent) |
| `.github/workflows/keep-alive.yml` | `--max-time 90` probes against `/health` |
| `render.yaml` | `healthCheckPath: /health` |
| `docs/KEEPALIVE_RUNBOOK.md` | keep-alive runbook (from `ccb5bbd`) |

## Steps

1. `git log --oneline` — confirm `b8d27a1`, `de078d7`, `ccb5bbd` on this branch. ✅ done
2. `git show --stat` on the three commits — confirm file lists. ✅ done
3. Grep/read the files above — confirm each documented claim. ✅ done
4. Write `PLAN.md`, `WALKTHROUGH.md`, `LEARNINGS.md` in the new 138 folder.
5. Minimal edits: `STATE.md`, `ROADMAP.md`, `LEARNINGS.md` (append-only).
6. Stop. Do NOT commit. Leave working tree with new 138 folder.
