# Phase 180 Summary: VPS Migration & Data-Correctness Hardening (`180-01-SUMMARY.md`)

**Status:** COMPLETE ✅ (deployed)
**Date:** 2026-11-11
**Context Authority:** `.planning/phases/180-vps-migration-data-correctness/180-CONTEXT.md` (Decisions D1–D7)
**Plan:** `.planning/phases/180-vps-migration-data-correctness/180-01-PLAN.md`

Note on numbering: this single record covers the work shipped under the SQL migration names
`phase180` and `phase181`; the directory is numbered 180 as the next free phase number
after phase 179.

---

## 1. Executive Summary

Phase 180 moved the FastAPI backend off Render Free — a platform that sleeps, caps build
minutes, and had become one of two competing snapshot publishers — onto a Hostinger VPS,
and fixed six data-correctness defects that made dashboard sections lie about the world.
After this phase the snapshot contract is: every section carries a freshness stamp traceable
to the evidence it describes, honest `stale`/`degraded` states are preserved rather than
papered over, and exactly one worker publishes.

## 2. Deployment Reality (post-phase)

| Piece | Before (phase 179 and earlier) | Now (verified 2026-11-11) |
|---|---|---|
| Backend host | Render Free (`peta-nadi.onrender.com`), sleeps 15 min after idle, 30–77 s cold start | Hostinger VPS `177.202.246.251` (SSH user `akin`, `/opt/prehub`, Ubuntu 24.04, 2 vCPU / 7.9 GB); Render demoted to read-only standby |
| Public API | Render URL | `https://api.177-202-246-251.nip.io` behind Caddy + Let's Encrypt (`{$API_DOMAIN}` in `Caddyfile`) |
| Frontend | Vercel `pre-hub.vercel.app` | unchanged |
| Ingestion tick | cron-job.org → `/internal/tick` every 5 min | compose `scheduler` sidecar POST `/internal/tick` every 300 s; cron-job.org retired |
| Runtime contract | in-process pollers / external tick mixed | `INPROCESS_BATCH_POLLERS=false`, `POLLERS_ENABLED=true`, one uvicorn worker (`--workers 1`) |
| CI/CD | manual redeploys + keep-alive cron | `.github/workflows/deploy.yml`: push main → hermetic test gate → GHCR (`ghcr.io/zhav1/peta-nadi/backend`) → SSH → `git pull --ff-only` → pull → restart → 90 s health gate → auto-rollback |
| Koyeb | planned in phase 179 D1 (`koyeb.yaml`) | superseded before deployment; `koyeb.yaml` remains in the repo root but is unused |

## 3. Data-Correctness Fixes (the substance)

| # | Symptom | Fix | Commit |
|---|---|---|---|
| 1 | BMKG adapter read `forecast["code"]`/`["desc"]`; public payload uses `weather`/`weather_desc` → Cuaca/Waspada emitted zero events forever | Read the real field names | `f734bea` |
| 2 | Provider budget caps sized exactly to cadence (`bmkg_cap` 288/288 three days running) → one retry denied the source until UTC midnight | Caps resized with ≥1.3× headroom; denials retry next tick | `b23c894` |
| 3 | Scheduler oversubscribed (43.5 slots/h demand vs 36/h supply); one slow job held the lease | `tick_max_jobs` 3→6, `tick_budget_seconds` 180→200 (< 240 s lease TTL); per-job budget now a hard deadline on a dedicated executor | `b23c894`, `540bc05` |
| 4 | TomTom TTL 600 s vs cadence 3600 s → section honestly stale 50 min of every hour | Cadence and TTL both 1800 s; daily cap 1500 (1.34× measured 1120/day) | `cbb47ab`, `66ebc3e` |
| 5 | News/incidents `_db_entry` no `ORDER BY` → `limit 60` returned the OLDEST rows of 8,312 with `valid_until = now+10min` | Newest-first `_ROW_ORDER`; stamps derived from the newest held row; empty reads publish no stamps | `774c4d1` |
| 6 | VPS + Render standby published the same snapshot and clobbered per-section evidence (43-min-old traffic overwrote 2-min-old) | Per-section evidence-recency guard (evidence stamp ≥ stored stamp, ties accepted, fresher section projected back), plus the app-side tie-accepting merge | `7f15e99`, `91b0450` |

Migrations applied manually (the deploy workflow never runs them):
- `infra/supabase/migrations/20261110120000_phase180_section_freshness_guard.sql`
- `infra/supabase/migrations/20261110130000_phase181_section_guard_degraded.sql`
- Migration `013` was reconciled rather than run as written.

## 4. Known Honest States (not bugs)

- `traffic_flow_segments` may report `degraded` at 19/20 checkpoint coverage.
- `news` and `incidents` may report `stale` when no qualifying new rows exist.
The snapshot reports these truthfully by design; do not widen freshness windows to force `ok`.

## 5. Verification Evidence (repo-checkable)

- Scheduler capacity/lease assertions: `backend/tests/test_internal_tick.py` (supply ≥ demand,
  budget < `LOCK_TTL_SECONDS`).
- TTL == cadence contract: `backend/tests/test_freshness_cadence_contract.py`.
- Budget starvation regressions: `backend/tests/test_provider_budget_starvation_fix.py`.
- `_db_entry` behavior: `backend/tests/test_section_staleness_root_cause.py`.
- CI pipeline: `.github/workflows/deploy.yml` (hermetic gate, 90 s health poll,
  rollback to `.deployed_sha`).
- Production topology: `docs/ARCHITECTURE.md` (VPS diagram), `docs/VPS_DEPLOY.md`,
  `docs/VPS_AGENT_RUNBOOK.md`, `docs/KEEPALIVE_RUNBOOK.md`.

## 6. Open Items

- First-week watch on the VPS: `/health` latency, scheduler logs, `/internal/tick/status`,
  provider budget counters (no budget should pin at its cap).
- Keep applying Supabase migrations manually before or with each deploy.
- The Render standby must remain read-only; re-enabling it as a publisher re-introduces fix #6.
- M8's 166 soak gate remains NOT STARTED (see `.planning/STATE.md` Current Position).
