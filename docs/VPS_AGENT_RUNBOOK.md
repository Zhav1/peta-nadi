# VPS Agent Runbook — peta-nadi backend

Everything an agent (or a human) needs to install, deploy, verify and update
the backend on the Hostinger VPS. Companion to `docs/VPS_DEPLOY.md` (design
rationale) and `docs/TEST_DEBT.md` (test gate).

## 0. Facts

| Item | Value |
|---|---|
| Host | `177.202.246.251` |
| SSH user | `akin` |
| Deploy dir | `/opt/prehub` |
| Repo (public) | `https://github.com/Zhav1/peta-nadi.git` |
| Backend image | `ghcr.io/zhav1/peta-nadi/backend` |
| Compose file | `docker-compose.yml` **only** |
| Health | `GET /health`, `GET /api/v1/health` |
| Tick status | `GET /internal/tick/status` |

**Hard constraints — violating these breaks production silently:**

1. **One uvicorn worker, one backend replica.** The app opens an AIS WebSocket
   and a validated-alert fan-out consumer per process, and the fan-out is *not*
   gated on `POLLERS_ENABLED`. Two workers = double ingestion.
2. **Never run plain `docker compose up`.** If `docker-compose.override.yml`
   ever lands in the deploy dir it will bind-mount and reload. Always
   `-f docker-compose.yml`.
3. **Never start the `frontend` service.** Next.js runs on Vercel.
4. **Never run migrations from CI.** They are applied manually.
5. **Only one scheduler may own the tick.** The `scheduler` sidecar owns it.
   Do not re-enable cron-job.org against this host.

## 1. One-time install

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker akin
newgrp docker          # or log out and back in
docker compose version

# Firewall: SSH + HTTP/S only. 8000 and 6379 must NOT be reachable.
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw --force enable
sudo ufw status

# Deploy dir
sudo mkdir -p /opt/prehub
sudo chown akin:akin /opt/prehub
git clone https://github.com/Zhav1/peta-nadi.git /opt/prehub
cd /opt/prehub && git log --oneline -1
```

## 2. Production `.env`

Create `/opt/prehub/.env` (mode 600). Start from `.env.example`, then apply the
VPS overrides — these are the only lines that differ from dev:

```ini
ENVIRONMENT=production
INPROCESS_BATCH_POLLERS=false        # thin web: ingestion rides /internal/tick
POLLERS_ENABLED=true                 # keeps AIS WS + alert consumer on this process
INTERNAL_TICK_TOKEN=<openssl rand -hex 32>
REDIS_URL=redis://prehub-redis:6379  # compose network; Upstash is not used here
PREHUB_DB_PATH=/app/data/prehub_local.db
IMAGE=ghcr.io/zhav1/peta-nadi/backend
IMAGE_TAG=latest
API_DOMAIN=api.177-202-246-251.nip.io   # or api.<your-domain> once DNS is set
CORS_ORIGINS=https://pre-hub.vercel.app
APP_URL=https://pre-hub.vercel.app
```

`API_DOMAIN` matters: Caddy fails fast on an empty value because an empty host
cannot get a certificate. `nip.io` resolves `api.177-202-246-251.nip.io` to
`177.202.246.251`, so TLS works before you own a domain. Swap it for a real
subdomain (A record → this IP, Cloudflare proxy **off**) when you have one, then
`docker compose -f docker-compose.yml up -d caddy`.

Copy every secret from the dev `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `MISTRAL_API_KEY`,
`GEMINI_API_KEY`, `TOMTOM_API_KEY`, `AISSTREAM_API_KEY`, `NASA_FIRMS_MAP_KEY`,
`NEXT_PUBLIC_MAPBOX_TOKEN`, `TWITTER_BEARER_TOKEN` (optional).

```bash
chmod 600 /opt/prehub/.env
```

## 3. First bring-up (build locally, not via CI)

The pipeline uses `--no-deps`, so it will not start Redis or Caddy on an empty
box. Do the first start by hand:

```bash
cd /opt/prehub
docker compose -f docker-compose.yml up -d --build caddy redis backend scheduler
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f backend | head -40
```

The backend build takes 5–10 min on 2 vCPU. `caddy` waits for the backend
healthcheck, so `caddy` starting last is normal.

## 4. Verify

```bash
# 1. Local health (bypasses TLS)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/health

# 2. Public health through Caddy (first call may take ~30s for the cert)
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://api.177-202-246-251.nip.io/health

# 3. Scheduler is ticking (needs the token from .env)
TOKEN=$(grep '^INTERNAL_TICK_TOKEN=' .env | cut -d= -f2)
curl -sS -D - -o /tmp/tick.json -X POST \
  -H "X-Internal-Token: $TOKEN" https://api.177-202-246-251.nip.io/internal/tick
cat /tmp/tick.json     # expect 202 {"accepted": true, "due": [...]}

# 4. Tick history
curl -sS https://api.177-202-246-251.nip.io/internal/tick/status | head -c 800

# 5. Scheduler sidecar is alive and getting 202s
docker compose -f docker-compose.yml logs --tail 20 scheduler
```

Expected: `/health` 200 in under 1 s warm; the sidecar logs
`POST /internal/tick -> 202` every 300 s; `/internal/tick/status` shows
`last_finished_at` advancing.

Snapshot freshness (from any machine with psql or the Supabase SQL editor):

```sql
select computed_at, now() - computed_at as age, version
from public.public_dashboard_snapshots where snapshot_key = 'sumatra_mainland';
```

`age` must stay under 600 s. If it grows, the tick is not running — check
`docker compose logs scheduler` and `select job_name, last_status, last_error,
retry_after from public.scheduler_jobs order by last_finished_at nulls first;`

## 5. Updating

**Normal path (CI):** push to `main` → GitHub Actions builds
`ghcr.io/zhav1/peta-nadi/backend:<sha>` → SSH → `docker compose pull` →
`up -d --no-deps backend scheduler` → 90 s health gate → auto-rollback to the
previous SHA on failure. Nothing to do on the box.

**Manual path (CI down):**

```bash
cd /opt/prehub
git pull --ff-only
docker compose -f docker-compose.yml build backend
docker compose -f docker-compose.yml up -d --no-deps backend scheduler
```

**Rollback:**

```bash
cd /opt/prehub
export IMAGE=ghcr.io/zhav1/peta-nadi/backend
export IMAGE_TAG=<previous-sha>          # see: cat .deployed_sha
docker compose -f docker-compose.yml up -d --no-deps backend scheduler
```

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Caddy exits immediately | `API_DOMAIN` empty or DNS not pointing here | set `API_DOMAIN`, confirm `dig +short api.<domain>` |
| `scheduler` logs `FATAL: 404` | `INTERNAL_TICK_TOKEN` unset in backend env | set it in `.env`, `up -d backend scheduler` |
| `scheduler` logs `-> 000` repeatedly | backend not up yet | wait; it backs off 15→180 s |
| `/health` 200 but sections stale | tick not running or provider budget denied | check `scheduler_jobs`, then `provider_budget_counters` |
| `docker compose` complains about override | you ran without `-f` | always `-f docker-compose.yml` |
| Port 8000 reachable from the internet | ufw not enabled | `sudo ufw --force enable` |

## 7. Logs and housekeeping

```bash
docker compose -f docker-compose.yml logs --tail 100 backend
docker compose -f docker-compose.yml logs --tail 50 scheduler
docker system df && docker image prune -f     # reclaim old GHCR tags
```

Redis persists to the `prehub_redis_data` volume with `--appendonly yes`.
The SQLite file at `/app/data/prehub_local.db` is demo/seed data only — Supabase
is the source of truth, so losing it is not an incident.
