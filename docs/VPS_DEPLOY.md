# VPS Deployment Runbook (Hostinger — Singapore, 2 vCPU / 4 GB, Ubuntu 24.04)

Backend on the VPS; frontend stays on Vercel. Supabase + Upstash are in AWS
ap-southeast-1 (Singapore) — pick the Singapore datacenter so RTT stays < 10 ms.

## 1. Production architecture

```
Caddy (:80/:443, auto-TLS) ──▶ backend :8000 (ONE uvicorn worker)
                                  │
scheduler (every 300 s) ── POST /internal/tick (X-Internal-Token)
redis (compose network only, --appendonly yes)
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

## 2. First-time provisioning

```bash
# 2.1 Docker + Compose plugin (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy && newgrp docker
docker compose version

# 2.2 Firewall: 80/443 + SSH only. Close 8000 and 6379 to the internet
#     (backend still publishes 8000 for local checks; keep UFW tight).
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable

# 2.3 Deploy directory
sudo mkdir -p /opt/prehub && sudo chown deploy:deploy /opt/prehub
cd /opt/prehub
git clone https://github.com/<owner>/<repo>.git .
```

## 3. Production `.env` (`/opt/prehub/.env`, mode 600)

Copy `.env.example` and fill every key. VPS-specific differences from dev:

```ini
ENVIRONMENT=production
CORS_ORIGINS=https://pre-hub.vercel.app,https://<your-vercel-domain>   # NO trailing slash
APP_URL=https://<your-vercel-domain>
INPROCESS_BATCH_POLLERS=false      # thin web: ingestion rides /internal/tick
POLLERS_ENABLED=true               # keeps the AIS WS + alert consumer on this process
INTERNAL_TICK_TOKEN=<openssl rand -hex 32>
REDIS_URL=redis://redis:6379       # ignored — compose injects redis://prehub-redis:6379
IMAGE=ghcr.io/<owner>/<repo>/backend   # what `docker compose pull` fetches
API_DOMAIN=api.<your-domain>           # read by Caddyfile {$API_DOMAIN}
```

Fill the rest as in dev: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, Upstash `REDIS_URL`/`REDIS_PASSWORD`
(overridden by compose, kept for completeness), `GEMINI_API_KEY`,
`MISTRAL_API_KEY`, `TOMTOM_API_KEY`, `AISSTREAM_API_KEY`,
`NASA_FIRMS_MAP_KEY`, WhatsApp alerting keys, `NEXT_PUBLIC_MAPBOX_TOKEN`.
Do not commit `.env` to git.

## 4. DNS / GitHub secrets

| Item | Value |
|---|---|
| DNS | `api.<domain>` → VPS IPv4 (A record, proxied OFF if behind Cloudflare) |
| `VPS_HOST` | VPS IPv4 or hostname |
| `VPS_USER` | `deploy` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | Private key (OpenSSH format); its public half in `/home/deploy/.ssh/authorized_keys` |
| `DEPLOY_DIR` | `/opt/prehub` |
| `HEALTHCHECK_URL` | `https://api.<domain>` |

## 5. First deploy

1. Apply Supabase migrations manually (never from CI).
2. Push to `main`. The pipeline: tests → GHCR image `:sha` + `:latest` → pull →
   `up -d --no-deps backend scheduler` → poll `$HEALTHCHECK_URL/health` 90 s →
   record `.deployed_sha`.
3. Watch it:

```bash
cd /opt/prehub
docker compose -f docker-compose.yml logs -f backend scheduler
```

## 6. Verification checklist

```bash
curl -fsS https://api.<domain>/health            # 200
curl -fsS https://api.<domain>/api/v1/health     # 200
# Tick heartbeat (public, tokenless read):
curl -fsS https://api.<domain>/internal/tick/status | jq
# Expect: older timestamps before the s; within ~5 min last_tick advances,
# jobs_executed non-empty, container `prehub-scheduler` logs "tick -> 202".
# Snapshot freshness — check whatever read-only projection endpoint the
# frontend uses for hot data (page freshness UI) or compare the newest row in
# the shared snapshot tables against the last tick timestamp above.
```

Also confirm `docker compose -f docker-compose.yml ps` shows caddy, redis,
backend (healthy), scheduler — no `frontend` on the VPS.

## 7. Rollback

Automatic in CI: if `$HEALTHCHECK_URL/health` never passes within 90 s, the
deploy job re-tags `.deployed_sha` (previous release) and re-ups it.

Manual:

```bash
cd /opt/prehub
IMAGE_TAG=$(cat .deployed_sha) docker compose -f docker-compose.yml \
  up -d --no-deps backend scheduler
echo "$(cat .deployed_sha)" > .deployed_sha  # unchanged on manual rollback
```

(Export `IMAGE` too if not set in `.env`: `IMAGE=ghcr.io/<owner>/<repo>/backend`.)
