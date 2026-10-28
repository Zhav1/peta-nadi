# KEEPALIVE-FIX — GitHub Actions keep-alive probe

**Phase:** 160 (M8, task 4) · **File:** `.github/workflows/keep-alive.yml`
**Status:** rewritten, YAML + shell validated, not dispatched (no GitHub token assumed)

## Why the old job could not finish

Every step used `--max-time 90 --retry 2 --retry-delay 10`. `--retry 2` means
**three** attempts, so one probe cost `3 × 90s + 2 × 10s = 290s`.

| Old step | Worst case | Cumulative |
|---|---|---|
| 1. `GET /health` | 290s | 290s |
| 2. `sleep 20` + `GET /health` | 20 + 290 = 310s | **600s** |
| 3. `GET /api/v1/health/sources` | 290s | 890s |
| 4. Supabase REST (`--max-time 20`, no retry) | 20s | **910s (15m10s)** |

The job ceiling was `timeout-minutes: 5` = **300s**. With step 1 taking its full
290s, the runner killed the job 10s into step 2's `sleep 20`:

```
290s  step 1 exhausts its 3 attempts (cold start, 60-80s boot, retried)
300s  job cancelled  <-- during `sleep 20`
      steps 3 and 4 never ran
```

So on exactly the event the workflow exists for — a cold instance — the job was
killed before the Supabase REST query, the only probe that refreshes the free
database's inactivity timer. The workflow was green whenever it was warm and
cancelled whenever it was cold, which is the inverse of useful. The 910s declared
budget was also 3× the ceiling, so the failure was structural, not unlucky.

## What the old job also failed to report

1. **No `-f` / `--fail-with-body`.** `curl -s -o /dev/null -w '%{http_code}'`
   exits **0** on 4xx/5xx. A 502 cold-start page printed
   "Warning: Render returned status 502 (cold start may be underway)" and the
   step stayed green. The run proved nothing.
2. **Exit codes discarded.** Only the status string was compared
   (`[ "$CODE" -ge 200 ]`), so timeout exit 28, DNS failure, and "000" were
   indistinguishable from a real response in the log.
3. **Fragile Supabase parsing.** `grep HTTP_STATUS | cut -d: -f2` breaks when the
   body contains that token; an empty match reaches `[ "" -eq 200 ]` and errors
   with "integer expression expected". Under GitHub's default `bash -e` the
   pipeline failure aborts the step, so the same code either ignored an error or
   died on it depending on where it failed.
4. **No artifact.** Every run's evidence was echoed into a log and discarded, so
   the M8 SLO "warm `/health` p95 < 500ms, 0 probe failures over 7 days" had no
   data source.
5. **No `concurrency` guard.** GitHub delays scheduled runs by 5–20+ min under
   load; two delayed runs could probe simultaneously and interleave.

## New behavior

| Probe | Endpoint | `--max-time` | Worst case |
|---|---|---|---|
| 1 | `GET /health` (cold wake) | 120s | `2 × 120 + 10` = **250s** |
| — | `sleep 15` (cold-start settle) | — | **15s** |
| 2 | `GET /health` (warm confirmation) | 120s | **250s** |
| 3 | `GET /api/v1/health/sources` (DB probe) | 90s | `2 × 90 + 10` = **190s** |
| 4 | Supabase REST `data_sources?select=name&limit=1` | 30s | `2 × 30 + 10` = **70s** |
| | **total** | | **775s (12m55s)** |

Job ceiling is `timeout-minutes: 15` = 900s, so ~125s of headroom covers runner
startup plus the summary and upload steps. Every probe uses
`--fail-with-body --retry 1 --retry-delay 10` (`--retry 1` = 2 attempts, not 3).

Changes:

- `concurrency: { group: keep-alive, cancel-in-progress: false }` — delayed runs
  queue instead of overlapping or cancelling, so no probe result is dropped.
- `permissions: contents: read` — the job only uploads an artifact.
- Each probe records `http_status`, `time_total_s`, `curl_exit`,
  `started_utc`/`finished_utc`, `http_class`, and the effective `curl_max_time_s`.
- `set -u -o pipefail` **without `-e`**: a failed probe is recorded and the
  remaining probes still run; the step exits 1 at the end if any probe failed.
  A failed JSON write is counted separately and also fails the step, so an
  unreadable artifact can never look like a green run.
- `--fail-with-body` also keeps the error body, so `body_preview` shows the
  Render/FastAPI error text instead of nothing.
- Missing `SUPABASE_URL` / `SUPABASE_ANON_KEY` → `result: skipped` + `::warning::`,
  never a red job.
- Summary table goes to `$GITHUB_STEP_SUMMARY`; JSON goes to
  `soak/keepalive-<run_id>.json` and is uploaded as
  `keepalive-<run_id>-<run_attempt>` with `retention-days: 90`
  (`if: always()`, `if-no-files-found: warn`).
- Schedule (`*/10 * * * *`) and `workflow_dispatch` unchanged. A delayed
  schedule is **not** a failure: each record carries its own UTC timestamp, so
  lateness is visible without turning the job red.

## How to read the artifact

Download the `keepalive-<run_id>-<attempt>` artifact, or read
`soak/keepalive-<run_id>.json` locally. It is **JSON Lines** — one object per
probe (4 per run), not a single array. That is deliberate: an interrupted step
still leaves the records it already wrote.

```bash
# whole run as an array
jq -s '.' soak/keepalive-12345678901.json

# every failure across the whole soak
jq -r 'select(.result=="fail") | [.started_utc,.probe,.http_status,.curl_exit,.detail] | @tsv' \
  soak/keepalive-*.json

# warm /health latency series (the SLO measurement)
jq -r 'select(.probe=="render_health_warm" and .result=="ok") | .time_total_s' \
  soak/keepalive-*.json | sort -n

# schedule delay: gap between consecutive runs
jq -r 'select(.probe=="render_health_cold") | .started_utc' soak/keepalive-*.json
```

| Field | Meaning |
|---|---|
| `probe` | `render_health_cold`, `render_health_warm`, `render_sources`, `supabase_rest_inactivity` |
| `result` | `ok` / `fail` / `skipped` (`skipped` = missing secret, not a failure) |
| `http_status` | final HTTP status, `null` when curl never received a response |
| `time_total_s` | curl `%{time_total}` of the last attempt, 3 decimals |
| `curl_exit` | `0` ok · `22` HTTP ≥ 400 (`--fail-with-body`) · `28` `--max-time` hit · `6`/`7` DNS/connect |
| `curl_max_time_s`, `curl_retries` | the flags actually applied, so the budget is auditable from the data |
| `started_utc`, `finished_utc` | probe wall-clock window; the delay signal |
| `detail` | first 300 chars of curl stderr, or the skip reason |
| `body_preview` | first 400 chars of the response body (error text for 4xx/5xx) |
| `schedule` | the cron that triggered the run, or `unscheduled` for manual dispatch |

Reading a run: `result: fail` **and** `curl_exit: 28` with a high `time_total_s`
means the instance did not answer inside `--max-time` (still sleeping, or hung).
`curl_exit: 22` with a 5xx means the instance answered and the backend is broken —
that one is a real incident, not a sleep artifact. Gaps between `started_utc`
values above ~12 min are GitHub schedule delay, not probe failures.

## Deliberate deviations and assumptions

1. **Route is `/api/v1/health/sources`, not `/health/sources`.** The task brief
   said `/health/sources`, but no such route exists
   (`backend/app/routers/health.py:185`); probing it would 404 on every run.
   `/health` is mounted at the root (`health.py:173`).
2. **`--max-time` is 120s only for the two `/health` probes**, 90s for
   `/api/v1/health/sources`, 30s for Supabase REST. Four probes at the flat
   120s would cost `4 × 250 = 1000s`, over the 900s ceiling — the exact class of
   bug this fix removes. Only the first probe can meet a cold start; after two
   `/health` hits the instance is awake, and a PostgREST query needs no boot
   budget at all.
3. **`sleep 20` → `sleep 15`**, keeping the total budget inside 900s.
4. **Assumes `ubuntu-latest` ships `curl` ≥ 7.76 (for `--fail-with-body`) and
   `python3`.** `python3` is only used to serialize JSON and render the summary;
   if it is ever missing, the run fails loudly via the `RECORD_ERRORS` guard
   instead of silently producing an empty artifact.
5. **Secrets:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same names as before).
   The anon key is only sent in headers and never echoed. Both missing → the
   probe is `skipped`.
6. **Only one action is used**, `actions/upload-artifact@v4`, as required.
7. **`docs/KEEPALIVE_RUNBOOK.md` is now stale** in its Layer-2 section: it still
   documents `timeout-minutes: 5` ("jangan diubah"), `--retry 2`, and the 20s
   wait. It was outside this unit's write scope, so it was left untouched and
   needs a follow-up edit to match this file.
8. **Not dispatched.** No GitHub token is assumed, so no run was triggered; the
   workflow is verified statically and the two shell steps were executed
   locally against fake backends.

## Verification performed

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/keep-alive.yml'))"  # exit 0
```

- YAML parses (exit 0); job `timeout-minutes` reads back as 15; `concurrency` as
  `{group: keep-alive, cancel-in-progress: false}`; triggers are
  `schedule: */10 * * * *` + `workflow_dispatch`.
- Both extracted `run:` scripts pass `bash -n`.
- Both scripts were executed against a local fake backend:
  - `/sources` → 503: `render_sources` recorded `result: fail`, `http_status: 503`,
    `curl_exit: 22`; other probes unaffected; step exit **1**.
  - `/health` slower than `--max-time`: both health probes recorded
    `curl_exit: 28`, `http_status: null`; `/sources` still ran and passed; step
    exit **1**. Measured cost `2 × max-time + retry-delay`, confirming the budget.
  - Missing Supabase secrets: `result: skipped`, exit **0** for that probe.
  - Artifact parsed as 4 valid JSON objects; summary rendered to
    `$GITHUB_STEP_SUMMARY` as valid UTF-8.
