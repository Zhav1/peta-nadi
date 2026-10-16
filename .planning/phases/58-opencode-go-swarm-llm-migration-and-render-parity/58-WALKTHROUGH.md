# Phase 58 Walkthrough: opencode-go Migration + Render Parity

**Date:** 2026-10-14
**Commits:** `44030b4` .. `f296487` (+ closeout)

## Resolved model IDs (Task 1.3)

- Reasoning: `mimo-v2.6-flash-free` (default; pro-override only if `GET /models` under the Go key shows a non-free `mimo-*` ID)
- Driver: `deepseek-v4.1-flash`
- Live catalog probe without key returns 403; script exits 2 fail-loud as designed (key required for catalog read)
- Privacy note: free-tier mimo may use prompts for training; payloads are crisis telemetry only, never operator PII (Phase 11 UU 27/2022 sweep holds)

## Local SSE trace (Task 4.3, executor run 01:06 UTC)

`POST /api/v1/simulate/stream` synthetic flood (Belawan 3.79/98.67) completed end-to-end locally:

| Event | Detail |
|---|---|
| `simulation_started` | crisis `6c57e5220123c101`, `[Simulasi] Flood - North Sumatra` |
| `data_collection` | complete, conf 0.9, source_health green |
| `osint_hazard` | complete, conf 0.8, 40 official news corroborations (LKBN ANTARA Sumut) |
| `prediction` | complete, conf 0.7, 48h horizons (max 112.5 min at 12h) |
| `consensus_gate` | **validated, 0.8616** (weather 0.3149 / traffic 0.245 / osint 0.2399) |

Full event log was captured in executor probe debris (since removed); stream proves the 4-stage DAG + consensus gate work post-migration with LLM keys absent (deterministic fallbacks engaged, no canned prose leaked).

## Local-vs-Render matrix

| Probe | Local (codebase) | Render live (RESEARCH session) | Status |
|---|---|---|---|
| `GET /health` | env from settings | `ok`, but `environment: development` vs yaml `production` | DRIFT - dashboard override or stale deploy suspected |
| `GET /api/v1/agents/status` | idle seeds post-WP3.2 | healthy, 6 agents, seeded timestamps | parity pending re-probe post-redeploy |
| `GET /api/v1/health/sources` | Supabase + fallbacks | TomTom degraded, FIRMS `last_seen` 2026-07-18 (stale) | honest stale/degraded labels required in UI |
| `GET /api/v1/news/live` | Supabase cache | live, 60 articles, `link_alive` tagging intact | OK |
| `GET /api/v1/news/market-regime` | classifier | `EARLY_WARNING_ACTIVE` | OK |
| `GET /api/v1/incidents` | either-key tolerant post-WP3.1 | returns `id` keys (drift source) | FIXED in code, needs live confirm |
| `POST /api/v1/agent/chat` | `degraded` flag post-WP2.3 | not probed | run probe script post-redeploy |
| `POST /api/v1/simulate/stream` | PASS (trace above) | not probed (stream over webfetch infeasible) | `curl -N` post-redeploy, expect 30-50s cold start |

Run: `bash scripts/probe_parity.sh http://localhost:8000`, then `bash scripts/probe_parity.sh https://peta-nadi.onrender.com`.

## Render dashboard runbook (D-10)

yaml holds non-secret defaults; these values live **dashboard-only**:

1. `OPENCODE_API_KEY` - Go subscription key (`sync: false` reference in yaml, no value)
2. `GEMINI_API_KEY` - kept for LTM embeddings (same treatment)
3. `AISSTREAM_API_KEY`, `NASA_FIRMS_MAP_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOMTOM_API_KEY`, `GOOGLE_API_KEY`
4. Confirm `ENVIRONMENT=production` in dashboard (overrides yaml if conflicting)
5. Redeploy, then: `GET /health` must report `production`; run full probe script; record matrix here

## Notes carried (D-12 / D-13 / R9 / R10 / R3)

- Cold start 30-50s on Render free; keep-alive cron `*/10` unchanged (`.github/workflows/keep-alive.yml`)
- `PREHUB_DB_PATH=/app/data/prehub_local.db` is ephemeral on free disk; Supabase is source of truth, local rows are write-through cache
- MemorySaver is in-process; restart loses in-flight stream checkpoints, `incidents` table survives
- TomTom degraded + FIRMS 3-month-stale are input conditions, not code bugs; consensus temporal decay already discounts them; UI must keep stale/degraded badges (pilot lens D-16, gods-eye rule)
- Free-mimo data-use: never send PII; crisis telemetry only
- `graph.py` / `state.py` / `consensus_gate.py` diffs confirmed empty

## Test ledger

- 40 passed: `test_llm_gateway.py` (8) + `test_incident_id_normalization.py` (6) + `test_auth_rbac.py` (26), zero regressions
- `test_agents.py`: 11/15 fast-pass; remaining LLM-touching tests each burn ~30-50s on NIM egress timeout in this sandbox, then pass via fail-loud fallback (environmental, pre-existing)
- Full suite: **194 passed, 0 failed** in ~10:46 (background run at closeout; LLM-touching tests each burn ~30-50s on NIM egress timeout in this sandbox, then pass via fail-loud fallback)

---
*Phase: 58-opencode-go-swarm-llm-migration-and-render-parity*
