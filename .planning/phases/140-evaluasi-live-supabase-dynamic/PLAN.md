# PLAN — Phase 140: Evaluasi Live Supabase Dynamic

**Window:** 2026-10-26 · **Commits:** `50eb6e1`, `2069c23`
(Context in-window: laporan merge `8d8d8b8`/`fc67632` + `022_perf_indexes_and_erp_rpc.sql`)
**Mode:** docs (no code changes, no commit)

## Objective

Record the live-dynamic slice: pred auto-join (explicit → local trace →
Supabase), FIELD_REPORT default verification source, Supabase-merged live
reader in the evaluation service, remote-pred backfill script, N=12 live demo
seed, and Simulasi badge restricted to batch-only.

## Scope IN (this folder only)

- `50eb6e1` (4 files, +535/−17): `approvals.py`, `outcomes_router.py`,
  `decision_schemas.py`, new `backend/scripts/seed_live_demo.py` (+214).
- `2069c23` (4 files, +228/−9): `outcome_evaluation_service.py` (+113),
  new `backend/scripts/backfill_live_remote_preds.py` (+86),
  `seed_live_demo.py` tweak, `EvaluationSection.tsx` (+36, live KPIs default).
- In-window context: merge `8d8d8b8` (= `fc67632`, 41 files, +2353/−1731)
  incl. `022_perf_indexes_and_erp_rpc.sql` (+91).

## Scope OUT

- Phase 139 lock/distill content; Phase 141 split/fix content.
- No code edits, no migration application, no seed execution, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. Forecast resolution order for approvals/outcomes: explicit payload pred →
   local decision trace → Supabase `incidents`/`route_approvals` 021 columns
   (`outcomes_router.py:47-86`, `approvals.py:42-78`).
2. Verification source defaults to `FIELD_REPORT`
   (`outcomes_router.py:280,329`).
3. Live aggregate merges durable Supabase rows with local mirror
   (`outcome_evaluation_service.py:494-580`, `_merge_outcome_rows`);
   explicit `outcomes=` callers (tests/scripts) bypass the merge (`:578`).
4. Live demo seed targets N=12 with TP=5/TN=4/FP=2/FN=1 at cut pred≥0.50,
   delay≥2.0h (`seed_live_demo.py:33-34`).
5. "Simulasi" badge is batch-only; live tab shows live KPIs by default
   (`EvaluationSection.tsx`, +36 in `2069c23`).
