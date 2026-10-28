# WALKTHROUGH — Phase 164: Backend hot-path + proxy hardening

**Milestone:** M8 — Fast & Durable (phase 5 of 7)
**Window:** 2026-10-27 (164a) → 2026-10-28 (production verification)
**Status:** **164a DONE** · **164b DEFERRED** (sync-I/O sweep — overlaps M9 routing/weather)
**Commit:** `0f20068` — `feat(m8-164a): proxy cache isolation + news read-path fixes`
**Plan:** `PLAN.md` · **Learnings:** `LEARNINGS.md`

---

## Why this phase existed

Three findings, all on the authenticated read path:

1. **F12 — the proxy shared cache entries across tenants.** `frontend/app/api/proxy/[...path]/route.ts`
   marked *every* 200 GET `public, s-maxage=60`, including tenant reads. Phase 161's
   `private, no-store` on `/dashboard/bootstrap` was overwritten by the proxy one layer up.
   The same route took a client-supplied `x-target-base-url`, i.e. it was an open forwarder.
2. **F8 — `_NEWS_CACHE["last_fetched_at"] = 0.0` after every ingestion cycle.** The cycle
   invalidated the cache instead of stamping it, so the next read missed the 30 s window and
   queued another cycle. On the free tier that is a continuous ingestion loop competing with
   request handling.
3. **F8 — the v7 re-tier never converged.** Legacy rows were re-tiered on every read and the
   result was discarded, so the cost was paid forever.

---

## Delivered (164a)

| Deliverable | Path |
|---|---|
| One cache decision function, auth/cookie → `private, no-store`, explicit anonymous allowlist, non-GET + SSE → `no-store`, dev-only loopback target override, header allowlists, SSE streamed | `frontend/app/api/proxy/[...path]/route.ts` |
| `x-target-base-url` sent only in non-production builds, only for a loopback backend (2 call sites) | `frontend/lib/api.ts` |
| `last_fetched_at = time.time()` after a completed cycle (was `0.0`) | `backend/app/routers/news_router.py:657` |
| Batched v7 re-tier write-back: `applied` out-param, `RE_TIER_WRITE_BACK_FIELDS`, `build_re_tier_write_back`, `persist_re_tiered_news_rows`, one `upsert` per read | `backend/app/services/news_aggregator.py:1399–1465` |
| Router guard persists what it repaired (defensive path only) | `backend/app/routers/news_router.py` |
| Hermetic read-path tests (8) | `backend/tests/test_news_read_path.py` |
| Proxy cache matrix spec (7) + config registration | `frontend/e2e/m8-proxy-cache.spec.ts`, `frontend/playwright.m8.config.ts` |

---

## Proxy cache matrix

The decision order in `resolveCacheControl` is: **method/stream → authentication →
allowlist**. Observed values (not assertions only — captured against the built server):

| # | Request | Status | `Cache-Control` |
|---|---|---|---|
| A | anonymous GET `/api/proxy/api/v1/health` (allowlisted) | 200 | `public, s-maxage=60, stale-while-revalidate=120` (+ `Vary: Authorization, Cookie`) |
| B | `Authorization` GET `/api/proxy/api/v1/health` | 200 | `private, no-store` |
| C | anonymous GET `/api/proxy/api/v1/fleet/vehicles` | 200 | `private, no-store` |
| D | `Authorization` GET `/api/proxy/api/v1/fleet/vehicles` | 200 | `private, no-store` |
| E | cookie-only GET `/api/proxy/api/v1/fleet/vehicles` (`prehub_auth_token`) | 200 | `private, no-store` |
| F | `Authorization` POST `/api/proxy/api/v1/fleet/vehicles` | 200 | `no-store` |
| G | anonymous GET SSE `/api/proxy/api/v1/incidents/simulate/stream` | 200 | `no-store`, body streamed |
| H | `Authorization` GET SSE (same path) | 200 | `no-store` |

Allowlist is exact-path: `/api/v1/health`, `/api/v1/health/sources`. Everything else defaults
to `private, no-store`. The root `/health` alias is deliberately **not** allowlisted.

### Upstream pinning

```text
API_PROXY_TARGET → NEXT_PUBLIC_API_URL → (production: PRODUCTION_API_BASE_URL | dev: http://localhost:8000)
```

`x-target-base-url` is read **only** when `NODE_ENV !== 'production'` and must be exactly
`http://localhost:8000` or `http://127.0.0.1:8000`; anything else → `400` +
`private, no-store`. In production the header is ignored entirely — a stale client keeps
working and the upstream never moves.

| Dev-only `x-target-base-url` | Result |
|---|---|
| absent | 200 (server env) |
| `http://127.0.0.1:8000` | 200 |
| `http://169.254.169.254` | **400** |
| `https://evil.example` | **400** |

### Header allowlists

- Forwarded request: `authorization`, `accept`, `content-type`, `idempotency-key`,
  `x-request-id`, `if-none-match`.
- Preserved response: `etag`, `last-modified`, `www-authenticate` (so phase 161's 401
  contract survives the proxy).

---

## News read-path fixes

| Behaviour | Before | After |
|---|---|---|
| Cycle completes | `last_fetched_at = 0.0` → next read misses the 30 s window → queues another cycle | `last_fetched_at = time.time()` → two consecutive reads inside the TTL schedule **0** ingestions and **1** Supabase fetch; the second is a `cached: true` hit |
| Legacy row (`schema_version != 7`) | heuristic re-runs on every read, result discarded | heuristic runs once, one batched `upsert(on_conflict="link")` with `zone_tier` + `ground_truth_metrics.schema_version = 7`; next read neither re-tiers nor rewrites |
| Write-back failure | n/a | logged, read still returns the repaired rows |
| `force_refresh` / 30 s TTL | — | unchanged (asserted) |

The write-back only persists rows the read's own gates kept — a `DROPPED_IRRELEVANT`
verdict from a *read* is never made permanent (ingestion owns that decision).

---

## Verification

### Re-run in the 2026-10-28 docs pass

| Command (from `backend/`) | Result |
|---|---|
| `.venv/Scripts/python.exe -m pytest tests/test_news_read_path.py -q` | **8 passed** (executed together with `test_internal_tick.py`: 28 passed, 3 warnings, 2.12 s, exit 0) |

### Recorded by the implementation pass (not re-run here)

| Command | Result |
|---|---|
| `pytest tests/test_news_read_path.py tests/test_news_pipeline.py tests/test_phase76_news_spatial_consensus.py tests/test_osint_leak_hardening.py tests/test_pre_llm_filter.py -q` | **97 passed**, 25.65 s |
| `pytest tests/test_api_routers.py -q` | **16 passed**, 174.56 s |
| `cd frontend; npx tsc --noEmit` | exit 0 |
| `cd frontend; npm run build` | exit 0 — Next 14.2.35, 7/7 static, `/api/proxy/[...path]` dynamic |
| `npx playwright test e2e/m8-proxy-cache.spec.ts --config=playwright.m8.config.ts` (production build + local stub upstream) | **7 passed**, 1.0 s |
| same, `next dev -p 3001`, `M8_PROXY_MODE=dev` | **7 passed**, 1.1 s (case G asserts the `400`) |

### Production (phase 165, 2026-10-28)

| Gate | Result |
|---|---|
| `e2e/m8-proxy-cache.spec.ts` against `https://pre-hub.vercel.app` | **7/7 passed** |
| Two-user cache isolation | authenticated GETs are `private, no-store` on the deployed proxy — the pre-164a handler is gone |

---

## Split: what is NOT in this phase

**164b (deferred):** `asyncio.to_thread` for `/incidents`, `/fleet/vehicles`,
`/erp/summary`, `/evaluation/*`, `/intermodal/toll-tariffs`; async Redis everywhere on
`async def` paths; per-`kid` JWKS negative cache; `get_write_client()` singleton; route/alias
sprawl + `Cache-Control` on JSON; `fetch_existing_articles` third re-tier site.

Reason it stayed deferred: those files are the routing/weather surface owned by the M9
window. Note that phase 163's trim (`60bca8a`) already moved the **snapshot's** news and
incidents reads off-loop, so the read model is no longer the worst offender — the
browser-facing endpoints are.

---

## Unverified / open

1. **`/health`-during-tick behaviour under a real ingestion burst** was not isolated; tick
   timing was observed indirectly via `scheduler_jobs.last_finished_at`.
2. **`force_refresh` can still queue two ingestion tasks for one request** (pre-existing,
   two scheduling blocks in `get_live_news`). Out of scope by decision, not by oversight.
3. **Partial-payload upsert** relies on `ON CONFLICT DO UPDATE` skipping insert-side NOT NULL
   checks; a row deleted between read and write logs a warning and nothing else.
4. **`NEXT_PUBLIC_API_URL` is still the proxy's second-choice base.** If it is ever pointed
   off the canonical backend, the proxy follows it. `API_PROXY_TARGET` exists to separate them.
