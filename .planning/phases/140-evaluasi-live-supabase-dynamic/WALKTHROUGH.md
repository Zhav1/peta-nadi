# WALKTHROUGH — Phase 140: Evaluasi Live Supabase Dynamic

**Commits:** `50eb6e1` (2026-10-26 22:38) + `2069c23` (2026-10-26 23:00).
In-window context: `fc67632` preview + merge `8d8d8b8` (22:26/22:33).
**Mode:** docs-only; no code touched, no seeds/migrations run, no commit.

## What was done

1. `50eb6e1` — live Supabase dynamic N12 (4 files, +535/−17):
   - `outcomes_router.py` (+181): forecast auto-join (explicit → local
     trace → Supabase) + `FIELD_REPORT` default source.
   - `approvals.py` (+130): `_resolve_approval_forecast` with the same
     stored-Supabase fallback chain.
   - `decision_schemas.py` (+27): schema support for stored forecast fields.
   - `seed_live_demo.py` (+214, new): N=12 live demo seed.
2. `2069c23` — live KPIs default + merged Supabase reader (4 files, +228/−9):
   - `outcome_evaluation_service.py` (+113): `_merge_outcome_rows` Supabase
     merge into the live aggregate.
   - `backfill_live_remote_preds.py` (+86, new): backfill remote preds.
   - `seed_live_demo.py` (+2/−): seed tweak.
   - `EvaluationSection.tsx` (+36/−): live KPIs default, Simulasi badge
     batch-only.
3. Context: merge `8d8d8b8`/`fc67632` (41 files, +2353/−1731) landed
   `022_perf_indexes_and_erp_rpc.sql` (+91) plus the laporan Phase1-5 overhaul
   and spec fixes — recorded here as context, detailed docs belong to the
   laporan workstream, not this phase.
4. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by grep / git show --stat this pass)

| Claim | Verification |
|---|---|
| Auto-join order explicit → local → Supabase | `outcomes_router.py:47-86` (docstring + `_coerce_pred` chain, Supabase 021 cols `:77`) |
| Approval forecast fallback chain | `approvals.py:42-78` (`stored_supabase_incident` / `stored_supabase_approval`) |
| FIELD_REPORT defaults | `outcomes_router.py:280` (batch path), `:329` (single path) |
| Live merge local+remote | `outcome_evaluation_service.py:494-580` (`_merge_outcome_rows`, `local_n`/`remote_n`); tests bypass at `:578` |
| Live source label merged vs offline | `outcome_evaluation_service.py:580` (`live_outcomes_merged` / `live_outcomes_offline`) |
| Live sufficient flags | `outcome_evaluation_service.py:646,727,912,961` |
| Seed N=12 target + confusion layout | `seed_live_demo.py:33-34` (TP=5/TN=4/FP=2/FN=1, cut pred≥0.50/delay≥2.0h) |
| Seed rows FIELD_REPORT-majority | `seed_live_demo.py:37-59` (+ `DEMO_TAG` cleanup `:69`) |
| Commit file lists/sizes | `git show --stat 50eb6e1` (+535/−17); `git show --stat 2069c23` (+228/−9) |
| 022 migration + laporan overhaul in-window | `git show --stat fc67632` / `8d8d8b8` (41 files, +2353/−1731; `022_…sql` +91) |

## Deliberately NOT done (per scope)

- Did not apply migrations, run seeds/backfill, or re-run tests.
- 021-via-MCP application and PGRST204 incident details were handoff-reported,
  not re-verifiable from git in a docs pass — see LEARNINGS.
- No commit, no push.
