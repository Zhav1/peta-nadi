# WALKTHROUGH — Phase 166: 7-day soak start + review

**Status: NOT STARTED.** No soak window is open. There is no start time, no commit pin and no
artifact URL yet, because this phase was not executed — only planned.

If you are reading this in a later session and the fields below are still `TBD`, **the soak
has not begun**. Do not infer one from M8's other green gates.

---

## Start record

| Field | Value |
|---|---|
| Soak start (UTC) | **TBD** |
| Soak end (UTC) = start + 7×24 h | **TBD** |
| Commit SHA pinned on `main` | **TBD** |
| Backend deploy id / time | **TBD** |
| Frontend deploy id / time | **TBD** |
| First keep-alive run id + artifact URL | **TBD** |
| No-deploy commitment made by | **TBD** (human) |
| Cold-start gate at start: measured / waived | **TBD** |

---

## Exact start checklist

Run in order. Stop at the first failure — a window started on a broken prerequisite is a
wasted week.

### 1. Pin the code

```bash
git checkout main
git pull --ff-only
git status --porcelain        # expect clean (only untracked run artifacts are tolerable)
git log --oneline -1          # record this SHA in the start record above
```

### 2. Confirm the deploy matches the pin

```powershell
# Backend: /health must report production and the current version
curl.exe -s https://peta-nadi.onrender.com/health

# Frontend: production alias must be serving
curl.exe -s -o NUL -w "%{http_code}\n" https://pre-hub.vercel.app
```

- `environment` **must** be `production`. If it reads `development`, the Render dashboard env
  was reset — fix it *before* starting, not during.
- Check the Render dashboard deploy log: the running build's commit must equal the pinned SHA.

### 3. Confirm migrations

Supabase → Database → Migrations. Expect:

- `20261027111905` — `023_scheduler_jobs`
- `20261027111919` — `024_dashboard_snapshots`

### 4. Confirm the tick and the snapshot

```powershell
# 202 + run_id, or 404 if INTERNAL_TICK_TOKEN is unset in Render
curl.exe -i -X POST https://peta-nadi.onrender.com/internal/tick -H "X-Internal-Token: $env:INTERNAL_TICK_TOKEN"
```

Then in Supabase:

```sql
select computed_at, pg_column_size(payload) as bytes
from dashboard_snapshots where snapshot_key = 'global';

select job_name, last_finished_at, last_error
from scheduler_jobs order by job_name;
```

Expect: `computed_at` within 10 minutes, `bytes` ≈ 291 000, `news`/`bmkg` recently finished,
`pihps` without a fresh error (or with a documented one).

### 5. Confirm the prober has run green

GitHub → Actions → `Keep-Alive Pinger (Render & Supabase)`.

- The most recent scheduled run on the pinned commit must be green.
- Its artifact `keepalive-<run_id>-<attempt>` must exist and contain 4 JSONL records.
- Record the run URL in the start record.

If the last runs are red because of Supabase secrets (`skipped`), fix the secrets first — a
soak with a permanently skipped DB probe proves half of what you need.

### 6. Check the budget

- Actions usage page: confirm remaining minutes are enough for ~1,008 jobs over 7 days.
- Render: free tier is 750 instance-hours/month; an always-on service is ~730. Confirm no
  second service is being added.

### 7. Freeze

- Announce the no-deploy window (see `PLAN.md` § Hard rules).
- Record who committed to it.
- Do **not** dispatch a manual workflow run "just to check" unless you also record that it is
  outside the window.

### 8. Start

- Write the start record table at the top of this file.
- Set the day-1 / day-3 / day-7 review reminders.
- Leave this file otherwise untouched until day 7.

---

## What was NOT done in this pass

- No soak started.
- No artifact collected.
- No commit pin recorded.
- No cold-start measurement (still open from phase 165).
- No confirmation that `keep-alive.yml` has ever been manually dispatched on the current
  commit — carried from phase 160.

---

## Day-7 review (template — fill in later)

| Metric | Threshold | Observed | Verdict |
|---|---|---|---|
| `result: fail` count | 0 | TBD | TBD |
| Delayed schedules | recorded only | TBD | TBD |
| Warm `/health` p95 | < 500 ms | TBD | TBD |
| Cold samples | recorded | TBD | TBD |
| Tick `202` rate | all accepted | TBD | TBD |
| `snapshot_failed` / `state_unavailable` | 0 unexplained | TBD | TBD |
| Snapshot age | < 600 s | TBD | TBD |
| Snapshot size | ≈ 291 KB, stable | TBD | TBD |
| PIHPS | completes | TBD | TBD |
| `/health` `environment` | `production` | TBD | TBD |

**Final verdict:** TBD (PASS / PASS WITH EXCEPTIONS / FAIL) — see `PLAN.md` § Verdict process.
