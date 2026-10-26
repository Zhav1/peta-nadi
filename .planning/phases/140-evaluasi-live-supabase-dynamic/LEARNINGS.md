# LEARNINGS — Phase 140: Evaluasi Live Supabase Dynamic

**Window:** 2026-10-26 · Grounded facts only (grep / `git show --stat` this pass).

## 1. Fixes tried (what worked, with file evidence)

1. **Forecast auto-join chain** — `outcomes_router.py:47-86`: explicit
   payload pred → local decision trace → Supabase `incidents` /
   `route_approvals` (021 columns `:77`); silent-skip with `logger.debug`
   at each miss so one missing layer never breaks POST.
2. **Approval-side mirror** — `approvals.py:42-78`
   (`stored_supabase_incident` / `stored_supabase_approval`).
3. **FIELD_REPORT default** — `outcomes_router.py:280,329` (batch + single paths).
4. **Durable live merge** — `outcome_evaluation_service.py:494-580`:
   `_merge_outcome_rows` unions local mirror + Supabase rows, preferring the
   side with usable pred (`:545-546`); source labeled
   `live_outcomes_merged` vs `live_outcomes_offline` (`:580`); explicit
   `outcomes=` callers bypass the merge (`:578`) so tests stay hermetic.
5. **N=12 live seed with known confusion layout** — `seed_live_demo.py:33-34`
   (TP=5/TN=4/FP=2/FN=1, cut pred≥0.50 / delay≥2.0h); FIELD_REPORT-majority
   rows (`:37-59`); `DEMO_TAG` cleanup (`:69`).
6. **Backfill script committed** — `backend/scripts/backfill_live_remote_preds.py`
   (+86, new in `2069c23`).
7. **Simulasi badge scoped to batch; live KPIs default** —
   `EvaluationSection.tsx` +36 in `2069c23`.

## 2. Concerns (open, evidenced)

1. **Proxy circularity persists for unstored rows**: rows without any stored
   forecast still fall back to a derived proxy (Phase 138 concern carries
   forward — the auto-join only helps rows whose 021 columns are populated).
2. **Merge preference is pred-availability, not freshness**: at `:545-546`
   the row *with* a usable pred wins regardless of recency — a stale stored
   pred beats a fresh pred-less row.
3. **Silent-skip logging**: every auto-join miss is `logger.debug` — in prod
   (default INFO) a fully-unjoined POST is indistinguishable from a joined one.

## 3. Constraints (observed this window)

- Backend open for this slice (routers + service + scripts), outcomes-table
  shape untouched — no new columns, only reads of the 021 set.
- Vercel deploys from `main` (carried from Phase 138; re-verified scope only,
  not re-proved here).

## 4. Conditions (environment this window)

- 021 migration file (`021_pred_tersimpan.sql`) dates to `de078d7` (Phase 138
  era); 022 (`022_perf_indexes_and_erp_rpc.sql`, +91) landed in-window via
  merge `8d8d8b8`/`fc67632` (41 files, +2353/−1731).
- Handoff states 021 was applied to live Supabase via MCP in this window and
  the backfill reached N=12 — **reported, not re-verifiable from git** (no
  MCP transcript or seed output in-repo).

## 5. Issues found (do not repeat)

1. **PGRST204 on 021 columns pre-application** — handoff-reported (querying
   `pred_prob` before 021 existed remotely returned PGRST204); consistent with
   the defensive `try/except` + debug-skip pattern at
   `outcomes_router.py:69-86`, but the error itself was not re-verified here.
2. **Do not re-seed blindly**: `seed_live_demo.py:69` deletes by `DEMO_TAG`
   prefix — running it twice without the tag guard understood would wipe and
   rewrite the demo N=12.
