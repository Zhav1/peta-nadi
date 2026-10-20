<!-- generated-by: gsd-doc-writer -->
# Phase 80: Gazetteer Search Kota / Desa / Titik — Learnings

**Scope:** durable lessons from the search fix. Each entry is grounded in working-tree code, an executed command, or a live probe. Anything that could not be reproduced is marked **unverified** and kept out of the conclusions.

---

## 1. Learnings

### 1.1 A canonical resolver is only canonical if every call site uses it

- **Evidence:** pre-fix there were three policies — `api.ts getBaseUrl()` (returned `NEXT_PUBLIC_API_URL` verbatim unless it contained the dead host), `app/api/proxy/[...path]/route.ts` (`x-target-base-url || process.env.NEXT_PUBLIC_API_URL || default`, plus its own rewrite), and `FleetOnboardingModal` reading `process.env.NEXT_PUBLIC_API_URL` **directly**. Today all three route through `frontend/lib/baseUrl.ts` (`api.ts` 1–7 and 30, proxy line 15, modal line 149).
- **Consequence:** the modal displayed a webhook URL and issued searches against a different base than the rest of the app. A single bad env value produced *different* failures on different screens, which reads as "the backend is flaky" rather than "one call site is unvalidated".
- **Lesson:** centralising the resolver is only half the fix; the other half is deleting direct env reads. Grep for `process.env.NEXT_PUBLIC_API_URL` is a required review step, not a nicety.
- **Correction to the working hypothesis:** the deployed bundle inspected on 2026-10-20 inlines `NEXT_PUBLIC_API_URL` as `https://peta-nadi.onrender.com`, **not** the dead host. So "dead host baked into the current Vercel env" is **not supported** by the artifact. What *is* verified is the structural bypass above: any future env edit to a dead/malformed host would reach those paths with no validation and no test.

### 1.2 Env values are untrusted input, and a trailing slash fails silently

- **Evidence:** `sanitizeBaseUrl` (`baseUrl.ts` 25–58) handles whitespace, pasted quotes, missing scheme, non-http schemes, relative paths, dead hosts, and trailing slashes. A trailing slash previously produced `https://host//api/v1/geocode/search`; the server answers 404 and the UI reports a generic search failure.
- **Consequence:** an invisible character in an env dashboard breaks search with no configuration error anywhere — the symptom appears only at request time, and only for code paths that concatenate `baseUrl + path`.
- **Lesson:** normalize to `origin + path` with no trailing slash *once*, and return `null` for unusable values instead of best-effort strings. Callers must have a defined fallback; a resolver that always returns *something* hides its own failure.
- **Also verified:** `.env.example` now states the rule (no trailing slash, https outside localhost), but docs do not enforce it — only `sanitizeBaseUrl` does.

### 1.3 A timeout must not reuse `AbortError`

- **Evidence:** `api.geocode.search` creates an internal controller with a 20 s timer and throws `Pencarian backend melebihi 20 detik` as a plain `Error` on timeout, rethrowing `AbortError` only when the *caller* aborted (`api.ts` 212–239). Both consumers early-return on `AbortError` (`CrisisMap` 1947, `FleetOnboardingModal` 210/240).
- **Consequence:** had the timeout surfaced as `AbortError`, a 77 s cold start would hit the "user cancelled" branch, skip the error state, and leave `isSearching` stuck — an infinite spinner with no message. This is the single most likely regression when someone "simplifies" the timeout later.
- **Lesson:** cancellation and deadline expiry are different events with different UI outcomes. Use distinct error identities, and test the timeout path, not just the happy path.

### 1.4 Dict iteration order is not relevance order

- **Evidence:** pre-fix `if q_lower in slug or slug in q_lower` appended hits in `PAN_SUMATRA_GAZETTEER` insertion order and stopped at `limit`. Live pre-fix probe: `q=padang` returned Padangsidimpuan, Padang Sidempuan, Padang Lawas, Padang Lawas Utara, **Padang last**. Post-fix ordering is `(score, tier, len(slug), slug)` and `q=padang` returns Padang first (`TestClient` probe, §3.1 of the walkthrough).
- **Consequence:** the user types an exact city name and the exact city is the fifth row, or missing entirely once `limit` truncates. The data was correct; the ranking was arbitrary.
- **Lesson:** relevance needs an explicit score with a total order and a deterministic tie-break. Never rely on dict/list order for anything a human reads, and never `break` at `limit` before sorting.

### 1.5 Alias duplicates must be collapsed by proximity, not by name

- **Evidence:** live pre-fix `q=padang` returned `Padangsidimpuan` and `Padang Sidempuan` as separate rows at identical coordinates `1.3789, 99.2717`. The fix de-dupes at 1.5 km server-side (`geocode_router.py` ~219) and at 0.05° with a parenthesis-stripped name client-side (`CrisisMap.isSamePlace`, 136–167).
- **Consequence:** two identical-looking rows, same pin on the map, different labels — the user cannot tell whether it is one place or two. A name-only dedupe would either miss the alias or merge genuinely distinct same-named towns.
- **Lesson:** de-dupe on `(normalized name family, coordinates)`. Rank **before** de-duping so the exact label survives; otherwise an alphabetically lucky alias wins.

### 1.6 A centroid default is a lie that only shows up when the dataset changes

- **Evidence:** pre-fix `/geocode/nodes` used `data.get("coords", (3.5952, 98.6722))`. In the current dataset all 324 entries have coordinates (`missing coords: 0`), so the default **never fired in production** — the live probe shows only `medan` at that coordinate. The fix skips coordinate-less nodes and logs a warning (`geocode_router.py` 124–130).
- **Consequence:** the bug was latent. Adding one coordinate-less gazetteer entry would have dropped a town into Medan, with a real-looking lat/lon and no error. Latent fabrications are worse than active ones because tests and dashboards stay green.
- **Lesson:** never supply a geographic default for a missing coordinate. Fail the node (skip + warn) so the gap is visible. Also: "the bug never triggered on today's data" is not evidence that the code is safe.

### 1.7 Caching an empty result is a permanent negative cache

- **Evidence:** pre-fix `_IN_MEMORY_SEARCH_CACHE[cache_key] = results` ran unconditionally; the fix caches only `if results:` (`geocode_router.py` 300). The regression test `test_empty_result_is_not_negatively_cached` asserts the key is absent.
- **Consequence:** one transient Nominatim failure during a Render cold start could pin "no results" for a query for the life of the process — the user retries a valid desa name and keeps getting nothing, with `cached` semantics hiding the cause.
- **Lesson:** cache positive facts, not absences, unless the absence is itself authoritative and has a short TTL. Distinguish "upstream failed" from "upstream said no" before writing anything.

### 1.8 Changing cache semantics requires a namespace bump

- **Evidence:** Redis keys moved from `lrip:geocode:search:` to `lrip:geocode:search:v2:` (read 186, write 305, `ex=86400`). The in-memory cache is capped at 512 via `_remember` (55).
- **Consequence:** without the bump, 24 h of pre-fix results — wrong order, alias duplicates, old `regency_hub` types — would keep being served with `cached: true` after deploy, and the fix would look broken.
- **Lesson:** when ranking, typing, or shape changes, version the key. Deleting keys is an operational step someone will forget; a new namespace is self-invalidating. Note the residual risk: an *intermediate* build that already wrote `v2` keys is not protected (see Concerns 3).
- **Secondary:** `_remember` evicts the oldest **inserted** key; reads do not refresh order. It is FIFO, not LRU. Bounded memory is achieved; hit-rate optimality is not.

### 1.9 UI fallbacks silently relabel data

- **Evidence:** the old badge chain ended in `'Desa'`, so any gazetteer hit that was not city/port/airport/kecamatan rendered as a village. Backend hits were uniformly typed `regency_hub`, so even the branches that existed rarely fired. The fix derives the badge from an explicit type vocabulary and falls back to `Titik` (`CrisisMap` 170–196).
- **Consequence:** a kabupaten or a hub appeared as "Desa", which changes what the operator thinks they are selecting — and therefore what they route to.
- **Lesson:** a default label is a data claim. Fall back to the neutral term ("Titik"), and make the backend emit enough type information that the neutral term is rare.

### 1.10 "Gazetteer-first" must be enforced in control flow

- **Evidence:** the gazetteer pass now runs before any external call, and `if len(results) < limit and not exact_gazetteer_hit:` (239) skips Nominatim when the top score is exact. Test `test_exact_hit_skips_nominatim` asserts zero HTTP calls for `medan`.
- **Consequence:** before, a "gazetteer-first" module still paid an external round-trip on every keystroke search, adding seconds on a cold instance and making the primary source's latency depend on a third party.
- **Lesson:** "X-first" is an ordering claim about *work*, not about *source lists*. If the primary source can answer definitively, the secondary call must be skipped, and that skip must be asserted by a call counter.

### 1.11 Local green does not mean deployed green

- **Evidence:** `tsc` exits 0 and all 10 tests pass locally, yet the live backend still returns pre-fix ranking and no `precision_tier`, and the live frontend chunk still contains the old resolver (§4–5 of the walkthrough).
- **Consequence:** a walkthrough that reported "fixed" based on tests alone would be wrong about the product. The user-visible bug persists until both deploys land.
- **Lesson:** for a two-artifact system (Vercel bundle + Render service), verification has three distinct states — *in tree*, *built*, *deployed*. Record which one was proven, and use a cheap deploy sentinel (`precision_tier` on `/geocode/nodes`) instead of guessing.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **Cold start (77 s) exceeds the 20 s client deadline.** Every first search after idle provably fails, even though the failure is now honest and retryable. The product has no warm-up path. | `api.ts` 212–239 (`timeoutMs = 20000`); Render boot observed at ~77 s |
| 2 | **CORS preflight during boot is not covered by the deadline's error copy.** The browser sends `OPTIONS` to `peta-nadi.onrender.com` before the GET; while Render boots it cannot answer, and the browser surfaces a CORS error rather than a timeout. The UI shows the generic live-search failure, not "backend sedang bangun". **Not reproduced in this window** (instance was warm). | `main.py` 221–229 (`CORSMiddleware`, `allow_origin_regex` includes `*.vercel.app`); direct cross-origin fetch in `api.ts` 43 |
| 3 | **Stale `lrip:geocode:search:v2:*` keys survive 24 h.** v1 keys are correctly ignored, but a key written by an intermediate build (or by a future bad ranking) is served with `cached: true` and bypasses the fix. | `geocode_router.py` 186 / 305 (`ex=86400`) |
| 4 | **Old v1 Redis keys are never deleted.** They are dead weight (up to 24 h of entries) but harmless to correctness; a future reader that reintroduces the old prefix would resurrect them. | key rename at 186/305; no `delete`/`scan` migration |
| 5 | **Synchronous Redis calls inside async endpoints.** `r.get` / `r.set` are blocking with `socket_connect_timeout=5`, `socket_timeout=5`, `retry_on_timeout=True`. If Redis is configured but unreachable, a search can block the event loop for seconds — worst case during boot. | `redis_client.py` 29–41; `geocode_router.py` 186, 305 |
| 6 | **HTTP 502 from a booting instance does not trigger the proxy fallback.** `request()` falls back only on a thrown network error; a non-2xx response throws `API … → 502` and stops. Message quality issue, not a routing issue (the proxy targets the same instance). | `api.ts` 42–66 |
| 7 | **Live pair runs pre-fix code.** Backend `/geocode/nodes` has no `precision_tier` and live `q=padang` returns Padang last with a duplicate; the frontend chunk contains the old resolver. Nothing here is committed or deployed. | §4–5 of 80-02; `git status` shows all eight files uncommitted |
| 8 | **No automated coverage for client ranking/de-dupe/cancel.** `tsc` proves types only; sequence-guard and `isSamePlace` behaviour are inspection-verified. | 80-02 §3; no test file under `frontend/` for search |
| 9 | **Type vocabulary is duplicated across the boundary.** Backend emits `hub \| kecamatan \| regency`; `searchResultBadge` re-encodes them. A new backend type silently degrades to `Titik`. | `geocode_router.py` 95–107; `CrisisMap.tsx` 170–196 |
| 10 | **Nominatim failure is indistinguishable from a true miss in the payload.** The `except` only logs (`geocode_router.py` 296) and the endpoint returns `status: "success"`, `count: 0`. The frontend can label its *own* failed fetch, but not a server-side upstream failure. | `geocode_router.py` 296–315 |
| 11 | **`limit` is part of the cache key**, so `limit=5` and `limit=10` store separate entries for the same query — more keys, no correctness impact. | `cache_key = f"{query}:{limit}"`, line 170 |
| 12 | **`FleetOnboardingModal`'s diff mixes this phase with unrelated work**, so a reviewer cannot isolate the base-URL change from the truck/travel UI. | `git diff --stat` shows 1453 changed lines in that file |
