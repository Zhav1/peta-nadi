# Phase 180: VPS Migration & Data-Correctness Hardening (Decision Record)

Source: post-phase-179 operations session, 2026-11-07 → 2026-11-11.
Goal: move the backend off Render Free onto infrastructure that does not sleep, and fix the
class of bugs that made sections lie (fabricated freshness, zero-event sources, budget
starvation, two-publisher clobber). Supersedes the Koyeb plan in phase 179 (D1) — Koyeb was
never deployed; the Hostinger VPS replaced it.

## Root causes found (codebase + production audit)

| Symptom | Root cause | Location |
|---|---|---|
| Cuaca/Waspada emitted zero events forever | BMKG adapter read `forecast["code"]`/`["desc"]`; the public payload uses `weather`/`weather_desc` | `backend/app/adapters/bmkg_adapter.py` (~L195-201) |
| Provider denied its source until UTC midnight | Budget caps sized exactly to the job cadence (`bmkg_cap` 288/288 for three consecutive days, TomTom 48/48 daily) — one retry consumed the last slot | `private.provider_budget_counters`; `backend/app/config.py` `provider_budget_daily_limits` |
| Ingestion queue grew every hour; one hung job held the lease | Scheduler oversubscribed: demand 43.5 slots/h vs supply 36/h (12 ticks × `tick_max_jobs=3`); per-job budget was cooperative, not a deadline | `backend/app/config.py` (tick knobs), `backend/app/services/job_scheduler.py` |
| `traffic_flow_segments` honestly stale 50 min of every hour | TomTom data TTL 600 s against a 3600 s cadence | `backend/app/adapters/tomtom_adapter.py`; `backend/app/services/job_scheduler.py` (~L125) |
| News/incident sections carried month-old evidence stamped fresh | `_db_entry` had no `ORDER BY` (`limit 60` returned the OLDEST rows of 8,312) and stamped `valid_until = now + 10 min` from the clock, not the evidence | `backend/app/services/public_snapshot_service.py` `_db_entry` / `_response_rows` |
| Sections flipped ok ↔ stale every few minutes | Two workers (VPS + the Render standby) published to the same Supabase project; the outer snapshot row was guarded by `computed_at`, but per-section upserts were not — and `computed_at` is fresh on BOTH publishers | SQL: `infra/supabase/migrations/20261110120000_phase180_section_freshness_guard.sql` (documents the defect) |

## Locked decisions

**D1. Hosting — Hostinger VPS (supersedes phase 179 D1/Koyeb and the Render deployment)**
- FastAPI backend runs on the Hostinger VPS: `177.202.246.251`, SSH user `akin`, deploy dir
  `/opt/prehub`, Ubuntu 24.04, 2 vCPU / 7.9 GB. Public API `https://api.177-202-246-251.nip.io`
  behind Caddy + Let's Encrypt (`{$API_DOMAIN}` in `Caddyfile`; nip.io until a real domain).
- The frontend stays on Vercel (`https://pre-hub.vercel.app`). Supabase unchanged.
- The Render `peta-nadi` service is demoted to a **read-only standby**: it must not own the
  tick and must not publish snapshots (it is one of the two publishers behind the clobber).

**D2. Tick ownership — compose scheduler sidecar (retires cron-job.org)**
- The `scheduler` service in `docker-compose.yml` POSTs `/internal/tick` every 300 s
  (`curl --max-time 90`, exponential backoff on transient failure, loud halt on 404).
- Runtime contract: `INPROCESS_BATCH_POLLERS=false`, `POLLERS_ENABLED=true`, exactly one
  uvicorn worker (`--workers 1`).

**D3. CI/CD — GitHub Actions to the VPS**
- `.github/workflows/deploy.yml`: push to `main` → hermetic test gate → frontend build →
  GHCR image (`ghcr.io/zhav1/peta-nadi/backend`, public) → SSH (secrets `VPS_HOST`,
  `VPS_USER`, `VPS_PORT`, `DEPLOY_DIR`) → `git pull --ff-only` (never force, never reset) →
  image pull → restart backend + scheduler → 90 s health gate → auto-rollback to the
  previous SHA (`.deployed_sha`). Migrations are a **manual** step the workflow never runs.

**D4. Freshness stamps must be traceable to evidence**
- `_db_entry` orders newest-first (`_ROW_ORDER`: `news_articles→published_at`,
  `incidents→created_at`) and derives `observed_at`/`valid_until` from the newest held row,
  never from `now()`. An empty-but-successful read publishes no stamps.
- TTL == cadence is the default contract (enforced by `backend/tests/test_freshness_cadence_contract.py`).

**D5. Provider budgets carry headroom; denials retry on the next tick**
- Caps sized at ≥1.3× measured demand (TomTom daily cap 1500 vs measured 1120 units/day).
- A budget denial must retry on the next tick, never wait for the UTC rollover.

**D6. Per-section evidence guard at publish time**
- A published section replaces the stored one only when its evidence stamp
  (`observed_at`, else `valid_until`) is ≥ the stored stamp; `computed_at` is deliberately
  not compared. Ties are accepted so same-tick publishers never deadlock. When the guard
  rejects a write, the stored (fresher) section is projected back into the served payload.
- Phase 181 extension: the guard also persists `degraded` sections so a worker that saw a
  degraded source does not resurrect a last-good `ok` forever.

**D7. Honest states are features**
- `traffic_flow_segments` at 19/20 checkpoint coverage may report `degraded`; `news` and
  `incidents` may report `stale` when no qualifying new rows exist. Do not widen freshness
  windows to make them look `ok`.
