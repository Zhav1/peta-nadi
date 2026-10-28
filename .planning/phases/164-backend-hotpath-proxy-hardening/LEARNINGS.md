# LEARNINGS — Phase 164: Backend hot-path + proxy hardening

**Window:** 2026-10-27 (164a) → 2026-10-28 (production verification) · Grounded facts only.

---

## 1. Vercel does not honour `s-maxage` on a dynamic route

The old proxy sent `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` on every
200 GET. What the CDN actually did with that directive was narrower than the header implied:
on this dynamic route the effective behaviour is plain `public` — no meaningful shared-cache
window, so the header bought almost nothing while it *did* tell every intermediary that an
authenticated tenant response was shareable.

The correct reading: **the header was an assertion about the payload, not a cache control we
controlled.** Once a response carries `Authorization`, no `s-maxage` value makes it safe.
Fix is `private, no-store` on anything credentialed, and a short explicit allowlist for the
two tenant-free health paths.

## 2. The proxy was an open forwarder, and that was client-controlled

Before `0f20068`:

```ts
const baseUrl =
  sanitizeBaseUrl(req.headers.get('x-target-base-url')) ||   // ← client-supplied, any host
  sanitizeBaseUrl(process.env.NEXT_PUBLIC_API_URL) || ...
```

`sanitizeBaseUrl` only normalises the URL; it does not restrict the host. In production, a
caller could point the proxy at any server and have it fetch on their behalf with the
caller's headers — including the `prehub_auth_token` cookie path, which the proxy supplies
implicitly. That is a server-side request forwarder, not a proxy.

Now the header is read **only** when `NODE_ENV !== 'production'` and only for the two exact
loopback origins; anything else is `400`. Upstream resolution is server-only:

```text
API_PROXY_TARGET → NEXT_PUBLIC_API_URL → (production: PRODUCTION_API_BASE_URL | dev: localhost:8000)
```

**Rule:** a proxy that accepts its destination from the request is not a proxy. Keep the
header for local development, gate it on the build mode *and* on an exact-match allowlist.

## 3. The cache rule has to live in one function

The old code inlined `if (req.method === 'GET' && upstreamRes.status === 200)` inside the
handler. Every branch that was added later (SSE, 5xx, 400, 502) would have needed its own
copy, and drift was guaranteed.

`resolveCacheControl({ method, authenticated, upstreamPath, status, contentType })` is now
the only place the decision exists, and the order is load-bearing:

1. non-GET → `no-store`
2. `text/event-stream` → `no-store`
3. any `Authorization` header **or** `prehub_auth_token` cookie → `private, no-store`
4. anonymous **and** status 200 **and** exact allowlisted path → `public, s-maxage=60, …`
5. everything else → `private, no-store`

Note step 3 keys on the **cookie** as well as the header. A request can be authenticated
without an `Authorization` header (the edge middleware reads the cookie), so a header-only
check leaks exactly the case this phase was fixing.

## 4. Header allowlists: `Idempotency-Key` was silently dropped

The pre-164a proxy forwarded exactly three request headers: `accept`, `content-type`,
`authorization`. Everything else was dropped by construction — including
`Idempotency-Key`, which the M8 spec explicitly requires ("Preserve `Idempotency-Key`").
Retries through the proxy were therefore not idempotent at the upstream.

Now forwarded: `authorization`, `accept`, `content-type`, `idempotency-key`,
`x-request-id`, `if-none-match`. Preserved from the upstream response: `etag`,
`last-modified`, `www-authenticate`.

**Known limitations of the new handler (accepted, not fixed):**

1. **Binary bodies are not safe through this proxy.** Request bodies are read with
   `req.text()` and non-SSE responses with `await upstreamRes.text()`. A file upload
   (manifest CSV is sent as text, so it works) or an image/binary download would be decoded
   as UTF-8 and corrupted. Nothing in the dashboard does that today.
2. **SSE had to be special-cased.** `.text()` never resolves for a stream — the old handler
   would hang on `/incidents/simulate/stream`. SSE now returns `upstreamRes.body` directly
   and is `no-store` regardless of method or path.
3. **Unknown headers are dropped, deliberately.** That is the point of an allowlist; adding
   a new end-to-end header means editing `FORWARDED_REQUEST_HEADERS` in the same commit.

## 5. `last_fetched_at = 0.0` was a self-invalidating cache

The line looked defensive ("force the next read to refetch after new data"). It made the
30 s TTL meaningless: every completed ingestion cycle guaranteed the *next* read missed the
cache and scheduled another cycle. Combined with a 300 s boot poller using
`force_refresh=True`, the free tier ran a continuous ingestion loop.

`last_fetched_at = time.time()` (post-cycle) means the fresh data is *stamped*, not thrown
away: two reads inside the TTL now schedule `0` ingestions and perform `1` Supabase fetch.

**Rule:** after you finish producing data, record when you finished. Never "invalidate" a
cache you just filled.

## 6. A heuristic that is never written back is a permanent tax

`fetch_news_from_supabase` re-tiered any row whose `ground_truth_metrics.schema_version != 7`
and then discarded the result. Every read paid the same cost, forever, on 0.1 CPU.

The fix tracks the exact rows the heuristic touched (`applied` out-param), then persists them
in **one** `upsert(on_conflict="link")` through `asyncio.to_thread` →
`persist_re_tiered_news_rows`. Two details matter:

- **Only the rows the read kept.** A `DROPPED_IRRELEVANT` verdict from a read must never
  become permanent; ingestion owns that decision.
- **One upsert, not per row.** A batch of 40 rows would otherwise be 40 TLS round-trips on a
  path that is already the bottleneck.

## 7. What would bite again

1. **Adding a path to `ANONYMOUS_PUBLIC_CACHE_PATHS` is a security decision.** The allowlist
   is two health paths; a tenant path added "for performance" re-creates the original bug.
2. **`Vary: Authorization, Cookie` is only on the public branch.** If a private response ever
   gets a shared cache directive, `Vary` alone will not save it.
3. **`NEXT_PUBLIC_API_URL` is still the proxy's second choice.** `API_PROXY_TARGET` exists to
   separate "where the browser talks" from "where the server forwards"; keep them distinct.
4. **`force_refresh` can still queue two ingestion tasks for one request.** Two scheduling
   blocks in `get_live_news`; the lock dedupes concurrent runs, not sequential ones. Still
   open (164b / M9).
5. **The third re-tier site (`fetch_existing_articles`) is still read-only.** Same class of
   bug as §6; one line once the helper is shared.
