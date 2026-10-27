# PLAN — Phase 164: Backend hot-path + proxy hardening

**Window:** 2026-10-27 · **Mode:** implementation (split unit)
**Milestone:** M8 — Fast & Durable (phase 5 of 7)
**Depends on:** 160 (`BACKEND-AUDIT.md` F4 / F8 / F12 / F13), 161 (fail-closed optional auth), 163 (bootstrap contract), 162 (external tick)
**Branch:** implemented on `m9-operational-truth`, **uncommitted**. M8's own branch is `m8-operational-truth`.

---

## Why

Phase 160 ranked three defects that sit on the authenticated read path and cannot be
deferred to the SLO gate:

1. **The proxy leaked cache entries across tenants (F12 / M8 root cause #4).**
   `frontend/app/api/proxy/[...path]/route.ts` marked **every** 200 GET
   `public, s-maxage=60, stale-while-revalidate=120` — including authenticated tenant
   reads. Phase 161's `Cache-Control: private, no-store` on `/dashboard/bootstrap` was
   simply overwritten by the proxy, so the "two-user cache isolation" gate could never
   pass. The same route also trusted a client-supplied `x-target-base-url`, i.e. it was
   an open forwarder.
2. **`_NEWS_CACHE["last_fetched_at"] = 0.0` after each ingestion cycle (F8).** The
   completed cycle *invalidated* the cache instead of stamping it, so the next poll
   missed the 30 s window and queued another cycle immediately. Combined with the boot
   poller's `force_refresh=True` every 300 s, the free tier ran a continuous ingestion
   loop (Supabase fetch + per-row re-tier + canonical URL resolution) that competed
   with request handling on 0.1 CPU.
3. **The v7 re-tier never converged (F8).** `fetch_news_from_supabase` and the
   `news_router` guard both re-ran the heuristic whenever `schema_version != 7`, and
   never wrote the result back, so every read paid the cost again — forever.

## Split

The unit is split because a concurrent M9 session owns
`backend/app/routers/geocode_router.py`, `backend/app/nlp/gazetteer_data.py`,
`scripts/build_sumatra_gazetteer.py` and the routing/weather surface. The async-I/O
sweep touches exactly those files, so it cannot be done safely in this window.

| Unit | Scope | Status |
|---|---|---|
| **164a** | Proxy cache isolation + open-proxy removal; news `last_fetched_at`; re-tier batched write-back; tests | **DONE (this unit)** |
| **164b** | Sync-I/O sweep on the auth/hot paths (audit F4 rows 1–14, F13, F9, F10, F12 route sprawl) | **DEFERRED — M9 conflict** |

### 164b backlog (not started, do not treat as done)

| # | Item | Audit ref | Why deferred |
|---|---|---|---|
| 1 | `asyncio.to_thread` for `GET /incidents`, `/fleet/vehicles`, `/erp/summary`, `/evaluation/*`, `/intermodal/toll-tariffs` | F4 rows 1, 7, 8, 9, 10 | `/fleet/vehicles` sits under the M9 weather/fleet surface; needs a routing-free window |
| 2 | Async Redis (`redis.asyncio` or `to_thread`) for every `cache_get/cache_set` reached from `async def`, incl. the new `/weather/summary` | F13, row 13 | `/weather/summary` is M9-owned |
| 3 | JWKS pre-warm hardening beyond the phase-161 boot task (per-kid negative cache) | F10 | 161 already removed the cold-login block; measure first |
| 4 | `get_write_client()` singleton (F9) | F9 | 161 already cached `get_service_client`; only the anon fallback path remains |
| 5 | Route/alias sprawl + explicit `Cache-Control` on JSON responses | F12 | Needs a route-count re-pin (82/75/25) that depends on M9 routing files |
| 6 | `fetch_existing_articles` re-tier is still read-only (third re-tier site, not in this brief) | F8 | Same class as 164a; deliberately left for the sweep so the write-back stays one helper |

---

## 164a — delivered (this unit)

### Files

| File | Change |
|---|---|
| `frontend/app/api/proxy/[...path]/route.ts` | Rewritten cache decision, server-only upstream resolution, header allowlists, SSE pass-through |
| `frontend/lib/api.ts` | `proxyTargetHeader()` — `x-target-base-url` is sent only in non-production builds and only for a loopback backend (2 call sites) |
| `backend/app/routers/news_router.py` | `last_fetched_at = time.time()` after a cycle; router re-tier now writes back |
| `backend/app/services/news_aggregator.py` | `_unpack_ground_truth_metrics(applied=…)`, `RE_TIER_WRITE_BACK_FIELDS`, `build_re_tier_write_back`, `persist_re_tiered_news_rows`; `fetch_news_from_supabase` persists its re-tiers |
| `backend/tests/test_news_read_path.py` | **new** — 8 hermetic cases |
| `frontend/e2e/m8-proxy-cache.spec.ts` | **new** — 7-case cache matrix over HTTP |
| `frontend/playwright.m8.config.ts` | `testMatch` now includes `proxy-cache` |

### Proxy cache contract

The header decision lives in one function (`resolveCacheControl`) so the rules cannot
drift between branches. Order matters: method/stream → authentication → allowlist.

| # | Request | Upstream | `Cache-Control` |
|---|---|---|---|
| A | anonymous GET `/api/v1/health` | 200 | `public, s-maxage=60, stale-while-revalidate=120` (+ `Vary: Authorization, Cookie`) |
| B | `Authorization` GET `/api/v1/health` | 200 | `private, no-store` |
| C | anonymous GET `/api/v1/fleet/vehicles` | 200 | `private, no-store` |
| D | `Authorization` GET `/api/v1/fleet/vehicles` | 200 | `private, no-store` |
| E | `prehub_auth_token` cookie GET tenant path | 200 | `private, no-store` |
| F | any non-GET | 200 | `no-store` |
| G | GET `text/event-stream` (anonymous or authenticated) | 200 | `no-store`, body streamed unbuffered |
| H | anonymous GET allowlisted path, upstream not 200 | 5xx | `private, no-store` |
| I | authenticated GET, upstream unreachable | 502 | `no-store` |
| J | dev-only forged `x-target-base-url` | — | `400` + `private, no-store` |

Allowlist is explicit and exact-path: `/api/v1/health`, `/api/v1/health/sources`
(`ANONYMOUS_PUBLIC_CACHE_PATHS`). Everything else defaults to private/no-store. The
root `/health` alias is **not** allowlisted — nothing in the client calls it through the
proxy, and a one-line addition is cheaper than an unjustified public path.

Upstream resolution (server-side only):

```
API_PROXY_TARGET → NEXT_PUBLIC_API_URL → (production: PRODUCTION_API_BASE_URL | dev: http://localhost:8000)
```

`x-target-base-url` is read **only** when `NODE_ENV !== 'production'` and must be exactly
`http://localhost:8000` or `http://127.0.0.1:8000`; anything else → `400`. In production
the header is ignored entirely (a stale client keeps working, the upstream never moves).

Forwarded request headers (allowlist, hop-by-hop dropped): `authorization`, `accept`,
`content-type`, `idempotency-key`, `x-request-id`, `if-none-match`. Preserved response
headers: `etag`, `last-modified`, `www-authenticate` (so phase 161's 401 contract
survives the proxy). Status and body are otherwise unchanged; JSON stays buffered.

### News `last_fetched_at`

```python
await unified_news_ingestor.run_ingestion_cycle(force_refresh=force)
_NEWS_CACHE["last_fetched_at"] = time.time()   # was 0.0
```

The 30 s TTL and the `force_refresh` scheduling paths are untouched. Because the cache
now stays warm after a cycle, a read inside the window is served from memory and does
not touch Supabase.

### Re-tier write-back

`fetch_news_from_supabase` tracks exactly the rows it re-tiered (via the new `applied`
out-parameter on `_unpack_ground_truth_metrics` plus the inline fallback branch), then
calls `persist_re_tiered_news_rows(rows)` **once** via `asyncio.to_thread`:

- one `upsert(records, on_conflict="link")` for the whole batch — never one call per row;
- payload = `link` + `id` + the 19 re-tiered fields + `ground_truth_metrics` with
  `schema_version` forced to `7`;
- only rows that the heuristic actually touched, and only rows that survive the read's
  own gates (a `DROPPED_IRRELEVANT` verdict from a read is not made permanent);
- any failure is logged and swallowed — the read still returns;
- the router guard collects the rows *it* repaired and uses the same helper, so the
  defensive path cannot reintroduce the double cost. In the normal path the router sees
  `schema_version == 7` from the in-memory row and does not re-tier at all.

### Tests

| File | Cases | Covers |
|---|---|---|
| `backend/tests/test_news_read_path.py` | 8 | cycle stamps a real timestamp (not 0.0); two reads inside the TTL schedule zero ingestions and one Supabase fetch; expired cache still re-arms; `force_refresh` still schedules; legacy row re-tiered once → one batched upsert → second read neither re-tiers nor rewrites; 3 legacy rows → 1 upsert; write-client failure never fails the read; router guard writes back |
| `frontend/e2e/m8-proxy-cache.spec.ts` | 7 | the A–G matrix above against the real Next route handler; skips cleanly when the target or upstream is unreachable; forged target ignored in production, `400` in dev (`M8_PROXY_MODE=dev`) |

### Verification (this session, 2026-10-27)

| Command | Result |
|---|---|
| `cd backend; .venv/Scripts/python.exe -m pytest tests/test_news_read_path.py -q` | **8 passed**, 3 warnings, 0.95 s, exit 0 |
| `… -m pytest tests/test_news_read_path.py tests/test_news_pipeline.py tests/test_phase76_news_spatial_consensus.py tests/test_osint_leak_hardening.py tests/test_pre_llm_filter.py -q` | **97 passed**, 3 warnings, 25.65 s, exit 0 |
| `… -m pytest tests/test_api_routers.py -q` | **16 passed**, 4 warnings, 174.56 s, exit 0 (router import smoke) |
| `cd frontend; npx tsc --noEmit` | **exit 0** |
| `cd frontend; npm run build` | **exit 0** — Next 14.2.35, 7/7 static pages, `/api/proxy/[...path]` dynamic |
| `npx playwright test e2e/m8-proxy-cache.spec.ts --config=playwright.m8.config.ts` (production build `npm start`, `API_PROXY_TARGET` → local stub, `M8_BASE_URL=http://localhost:3000`) | **7 passed**, 1.0 s |
| same spec, `next dev -p 3001`, `M8_PROXY_MODE=dev` | **7 passed**, 1.1 s (case G asserts the `400`) |

Header matrix was also captured directly against the built server (values verbatim in
`PROGRESS.md` §164a): A `public, s-maxage=60, stale-while-revalidate=120` ·
B/C/D/E `private, no-store` · F `no-store` · G/H `no-store`.

### Decisions / deviations

1. **Non-GET is `no-store`, not `private, no-store`.** A mutation has no business in any
   cache, private or shared; `no-store` states that unambiguously.
2. **`Vary: Authorization, Cookie` only on the public branch.** It is the belt-and-braces
   header for any shared cache that does not already key on credentials; adding it to
   private responses would be noise.
3. **SSE is passed through as a stream.** The old code did `await upstreamRes.text()`,
   which never resolves for an event stream. Streaming is a two-line change and removes a
   hang; the cache rule (`no-store`) is independent of it.
4. **No `x-proxy-target` rename.** Keeping the existing header name means an undeployed
   client keeps working; only its *authority* changed.
5. **The write-back skips rows the read drops.** Persisting a `DROPPED_IRRELEVANT`
   verdict would make a heuristic's opinion permanent; ingestion remains the only place
   that decides a row is irrelevant for good.
6. **`fetch_existing_articles` (third re-tier site) was not changed.** It is not in the
   brief, and the helper makes it a one-line follow-up in 164b.
7. **`persist_re_tiered_news_rows` runs in a thread.** It is new sync I/O on an `async`
   path, so it follows the repo's existing counter-example pattern
   (`approvals.py:302`, `commodity_router.py:154`) rather than adding to audit F4.

### Risks / open items

1. **The deployed proxy is still the old one.** `https://pre-hub.vercel.app` will fail
   cases B–E of the spec until phase 165 deploys — that is the gate, not a flake.
2. **`NEXT_PUBLIC_API_URL` is also the client base.** If it is ever pointed somewhere
   other than the canonical backend, the proxy follows it (by design: one server-side
   source of truth). `API_PROXY_TARGET` exists to separate the two.
3. **`upsert` with a partial payload** relies on `ON CONFLICT DO UPDATE` skipping the
   insert-side NOT NULL checks. The row was just read, so the conflict fires; a row
   deleted between read and write would log a write-back warning and nothing else.
4. **`force_refresh` can still queue two ingestion tasks for one request** (two
   scheduling blocks in `get_live_news`, pre-existing). The ingestion lock dedupes
   concurrent runs, not sequential ones. Left as-is: orthogonal to the `last_fetched_at`
   reset and out of the brief's scope — noted here so it is not lost.
5. **`/api/v1/health/sources` is allowlisted** because it is a public bootstrap section
   for guests; it still reads Redis/Supabase upstream, so a public cache hit is also a
   latency win (30 s TTL server-side).
6. **No production deploy in this unit.** Phase 165 owns the deploy + smoke.

---

## Scope OUT (both units)

- No async rewrite of the fleet/incidents/ERP services (164b).
- No route-count re-pin, no alias cleanup (164b).
- No `SPEC.md` edit, no `.planning/baseline-pytest.txt` edit, no commit, no deploy.
- No frontend dashboard file touched (M9-owned), no geocode/gazetteer/routing/weather
  file touched.
