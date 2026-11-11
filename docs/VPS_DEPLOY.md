# VPS Deployment Runbook (Hostinger — 2 vCPU / 7.9 GB, Ubuntu 24.04)

Backend on the VPS; frontend stays on Vercel. The repo is
`https://github.com/Zhav1/peta-nadi.git`; the production image is
`ghcr.io/zhav1/peta-nadi/backend`. Until a real domain exists, TLS is served
for `api.177-202-246-251.nip.io` (nip.io maps that host to `177.202.246.251`).

## 1. Production architecture

```
Caddy (:80/:443, auto-TLS) ──▶ backend :8000 (ONE uvicorn worker,
                                  published on 127.0.0.1:8000 only)
                                  │
scheduler (every 300 s) ── POST /internal/tick (X-Internal-Token)
redis (compose network only, --appendonly yes, no host port)
```

HARD CONSTRAINTS — read before touching anything:

- **Exactly ONE uvicorn worker.** The app starts an AIS WebSocket and an alert
  fan-out consumer per process; `--workers > 1` duplicates them and
  double-consumes every poller. The compose command already pins
  `--workers 1`. Never scale the `backend` service or add replicas.
- **`docker-compose.override.yml` is the DEV file** (bind mounts, reload).
  The VPS must ALWAYS deploy with `-f docker-compose.yml` only — never plain
  `docker compose up`, which would pick up the override if the file were
  present in the deploy dir.
- Frontend lives on Vercel. The compose `frontend` service is dev-only;
  do not deploy or start it on the VPS.
- Migrations are applied **MANUALLY** upstream. CI/CD never runs
  `supabase db push` or any migration.
- Only one scheduler may tick the Supabase project: the compose `scheduler`
  sidecar. The Render service and cron-job.org must be retired
  (`docs/KEEPALIVE_RUNBOOK.md`).

## 2. First-time provisioning

```bash
# 2.1 Docker + Compose plugin (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker akin && newgrp docker
docker compose version
```

The SSH user is **`akin`** (not `deploy`). The `docker` group membership is
already in place on this VPS — it is listed here as a prerequisite for a
rebuilt box; with it, plain `docker compose ...` works without sudo.

```bash
# 2.2 Firewall: 80/443 + SSH only. 8000 and 6379 must not be reachable
#     (backend publishes 127.0.0.1:8000 only; keep UFW tight anyway).
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable

# 2.3 Deploy directory
sudo mkdir -p /opt/prehub && sudo chown akin:akin /opt/prehub
git clone https://github.com/Zhav1/peta-nadi.git /opt/prehub
```

## 3. Production `.env` (`/opt/prehub/.env`, mode 600)

Copy `.env.example` and fill every key. VPS-specific differences from dev:

```ini
ENVIRONMENT=production
CORS_ORIGINS=https://pre-hub.vercel.app          # NO trailing slash
APP_URL=https://pre-hub.vercel.app
INPROCESS_BATCH_POLLERS=false      # thin web: ingestion rides /internal/tick
POLLERS_ENABLED=true               # keeps the AIS WS + alert consumer on this process
INTERNAL_TICK_TOKEN=<openssl rand -hex 32>
IMAGE=ghcr.io/zhav1/peta-nadi/backend
IMAGE_TAG=latest                   # CI overwrites with the commit SHA
API_DOMAIN=api.177-202-246-251.nip.io    # read by Caddyfile {$API_DOMAIN}
```

Fill the rest as in dev: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, provider keys (`GEMINI_API_KEY`,
`MISTRAL_API_KEY`, `TOMTOM_API_KEY`, `AISSTREAM_API_KEY`,
`NASA_FIRMS_MAP_KEY`), WhatsApp alerting keys, `NEXT_PUBLIC_MAPBOX_TOKEN`.
`REDIS_URL` is ignored — compose injects `redis://prehub-redis:6379`.
Do not commit `.env` to git and never paste its values into docs or tickets.

`API_DOMAIN` matters: Caddy fails fast on an empty value because an empty host
cannot get a certificate. `nip.io` resolves
`api.177-202-246-251.nip.io` to `177.202.246.251`, so Let's Encrypt issuance
works before you own a domain. When a real domain exists, point an A record
(Cloudflare proxy **off**) at the VPS, set `API_DOMAIN=api.<your-domain>`, and
`docker compose -f docker-compose.yml up -d caddy`.

## 4. GitHub secrets

| Secret | Value |
|---|---|
| `VPS_HOST` | `177.202.246.251` |
| `VPS_USER` | `akin` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | Private key (OpenSSH format); public half in `/home/akin/.ssh/authorized_keys` |
| `DEPLOY_DIR` | `/opt/prehub` |
| `HEALTHCHECK_URL` | `https://api.177-202-246-251.nip.io` |

No DNS record is needed while `nip.io` is in use.

## 5. The image (GHCR is public)

`.github/workflows/deploy.yml` (push to `main`) runs the hermetic test gate,
builds `backend/Dockerfile`, and pushes
`ghcr.io/zhav1/peta-nadi/backend:<sha>` + `:latest`. The GHCR package is
**public**, so the VPS pulls anonymously — no registry login, no
`~/.docker/config.json`, no PAT needed on the box. A non-blocking
`integration` job runs the full test suite with a Redis service container
(known failures are tracked in `docs/TEST_DEBT.md`).

## 6. Deploy flow (what CI does on the VPS)

One push to `main` = tests → build & push → SSH to the VPS and:

```bash
cd /opt/prehub
git fetch --prune origin
git checkout main
git pull --ff-only origin main          # syncs compose/Caddyfile/docs, not just the image
docker compose -f docker-compose.yml pull backend scheduler
docker compose -f docker-compose.yml up -d --no-deps backend scheduler
```

Then a 90 s health gate polls `$HEALTHCHECK_URL/health`; on success CI writes
the new SHA to `/opt/prehub/.deployed_sha`, on failure it re-ups the previous
SHA (auto-rollback). The `--ff-only` pull aborts the deploy on a dirty tree or
diverged history instead of shipping a mismatched checkout; `.env` is
gitignored and cannot be clobbered. Watch a deploy from the box:

```bash
cd /opt/prehub
docker compose -f docker-compose.yml logs -f backend scheduler
```

## 7. Verification checklist

```bash
curl -fsS https://api.177-202-246-251.nip.io/health            # 200
curl -fsS https://api.177-202-246-251.nip.io/api/v1/health     # 200
curl -fsS https://api.177-202-246-251.nip.io/internal/tick/status | jq
```

Expect: `last_finished_at` advancing within ~5 min, `jobs_executed`
non-empty, and `prehub-scheduler` logging `POST /internal/tick -> 202` every
300 s. `docker compose -f docker-compose.yml ps` must show exactly `caddy`,
`redis`, `backend` (healthy), `scheduler` — never `frontend`.

Snapshot freshness lives in Supabase; query `ingest_runs` /
`scheduler_jobs` as shown in `docs/KEEPALIVE_RUNBOOK.md` when a section looks
stale.

## 8. Rollback

Automatic in CI: if `/health` never passes within 90 s, the deploy job
re-ups the image tagged `.deployed_sha` (previous release) and restores that
file. If no previous SHA was ever recorded, the failed release is left up for
investigation.

Manual:

```bash
cd /opt/prehub
IMAGE=ghcr.io/zhav1/peta-nadi/backend IMAGE_TAG=$(cat .deployed_sha) \
  docker compose -f docker-compose.yml up -d --no-deps backend scheduler
# .deployed_sha stays unchanged on a manual rollback
```
