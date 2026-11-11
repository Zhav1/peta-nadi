# Keep-Alive Runbook — SUPERSEDED

This document used to describe keeping the Render Free service awake with
cron-job.org and a GitHub Actions keep-alive workflow. **That pattern is
retired.** The backend now runs on the Hostinger VPS under Docker Compose,
and ticking is owned by the `scheduler` sidecar container
(`docs/VPS_DEPLOY.md`, `docs/VPS_AGENT_RUNBOOK.md`).

## Why the old pattern was retired

1. **The scheduler is now local.** The compose `scheduler` sidecar POSTs
   `/internal/tick` to the backend every 300 s on the same host — no external
   cron, no public cold-start problem, no `X-Internal-Token` header stored in
   a third-party dashboard.
2. **Two schedulers compete for one lease.** `POST /internal/tick` takes a
   durable Supabase lease (TTL 240 s). While the Render service `peta-nadi`
   still ticked the same Supabase project, the two schedulers contended for
   that shared lease and each tick doubled provider spend. The Phase 180/181
   per-section evidence guard prevents a stale publisher from corrupting the
   snapshot, but it does **not** remove the contention — retiring the second
   scheduler is the fix.
3. **Render Free has no role.** The VPS always-on backend removed the 15-minute
   idle-sleep problem the whole keep-alive apparatus existed to fight.

## Retiring the remaining legacy (to be done)

The legacy is still partially live. Retirement order:

1. **Render `peta-nadi`** (currently a read-only standby): blank
   `INTERNAL_TICK_TOKEN` in the Render dashboard. An empty setting disables
   the endpoint — `POST /internal/tick` then answers `404`, the endpoint is
   off, and Render stops competing for the lease.
2. **cron-job.org**: delete both jobs (`GET /health` waker and
   `POST /internal/tick`).
3. **`.github/workflows/keep-alive.yml`**: delete the file. Nothing else
   references it.

Do **not** blank the token on the VPS — there the `scheduler` sidecar needs it.
Do **not** re-enable cron-job.org against the VPS; one scheduler owns the tick
(see the hard constraints in `docs/VPS_AGENT_RUNBOOK.md`).

## The one part still useful: diagnosing a tick that is not running

Three durable signals exist for every tick. None requires the tick token.

### 1. Durable job state — `scheduler_jobs`

State lives in Supabase (migration `infra/supabase/migrations/023_scheduler_jobs.sql`),
one row per job: `last_started_at`, `last_finished_at`, `last_status`,
`last_error`, `locked_until`, `retry_after`.

```sql
-- Which jobs are behind or failing?
select job_name, last_finished_at, last_status, last_error, retry_after
from scheduler_jobs
order by last_finished_at nulls first;
```

Reading it:

- `last_finished_at` only advances on success; a failed job stays due.
- `locked_until` is the cross-process lease; a stuck lease expires on its own
  (TTL 240 s) and the next tick takes over.
- `retry_after` = 120 s backoff after a failure so a downed upstream is not
  hammered every tick.
- If Supabase is unreachable the tick logs a warning and does nothing;
  `/health` stays 200.

### 2. Tick status endpoint (public, tokenless)

```bash
curl -fsS https://api.177-202-246-251.nip.io/internal/tick/status | jq
```

`last_finished_at` should advance roughly every 5 minutes, with the last run's
`jobs_executed` list non-empty. Check the sidecar agrees:

```bash
cd /opt/prehub
docker compose -f docker-compose.yml logs --tail 30 scheduler
# expect: [scheduler] ... POST /internal/tick -> 202 every 300 s
```

Interpretation of scheduler log codes:

| Code | Meaning | Action |
|---|---|---|
| `202` | tick accepted, jobs scheduled | normal |
| `000` | backend down / starting | wait — the sidecar backs off 15→180 s |
| `404` | `INTERNAL_TICK_TOKEN` unset in the backend env | set it in `/opt/prehub/.env`, `up -d backend scheduler` |

### 3. Ingest run audit — `ingest_runs`

Phase 179 persists the last 50 runs (also exposed via the status endpoint above)
to the `ingest_runs` table:

```sql
select run_id, worker_id, started_at, finished_at, status,
       snapshot_version, jobs_executed, upstream_calls
from ingest_runs
order by started_at desc
limit 10;
```

`worker_id` tells you which process published: expect the VPS container
hostname. Any run from the Render service or a local dev box means a second
scheduler is still ticking against this project — finish the retirement above.
