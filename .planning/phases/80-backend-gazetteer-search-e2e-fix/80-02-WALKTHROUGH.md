<!-- generated-by: gsd-doc-writer -->
# Phase 80: Gazetteer Search Kota / Desa / Titik — Walkthrough

**Purpose:** implementation record for the end-to-end search fix (base URL, deadline, ranking, de-dupe, honest states, no Medan fallback, bounded cache). Every claim below comes from the working tree or a command executed in this window. Line numbers are current working-tree lines.

**Commit shape:** none yet. All eight files below are **uncommitted working-tree changes** (`git status --porcelain`), together with unrelated Phase 44/ERP work that this phase does not claim.

---

## 1. Files changed (8)

| # | File | Status | What changed |
|---|---|---|---|
| 1 | `frontend/lib/baseUrl.ts` | **new** | Canonical resolver: `PRODUCTION_API_BASE_URL` (11), `DEAD_API_HOSTS` (14), `sanitizeBaseUrl` (25), `getBaseUrl` (60), `sanitizeWsUrl` (93), `getWsBaseUrl` (139) |
| 2 | `frontend/lib/api.ts` | modified | Re-exports the resolver (1–7); one `getBaseUrl()` in `request()` (30); abort never proxy-falls-back (48–52); `geocode.search(q, signal?, timeoutMs=20000)` with non-`AbortError` timeout (212–239) |
| 3 | `frontend/components/map/CrisisMap.tsx` | modified | `scoreSearchItem` (117), `mergeSearchResults` (136), `searchResultBadge` (170), `searchError` state, `cancelPendingSearch` (1879), sequence-guarded live search (1893–1962), loading/error/empty dropdown (2072+) |
| 4 | `frontend/components/fleet/FleetOnboardingModal.tsx` | modified | `apiBase = getBaseUrl()` (149) replaces the direct env read; geocode effects abort on cleanup and surface timeout errors (194–252) |
| 5 | `frontend/app/api/proxy/[...path]/route.ts` | modified | `sanitizeBaseUrl(header) \|\| sanitizeBaseUrl(env) \|\| production/local fallback`; substring rewrite of `prehub-backend` deleted |
| 6 | `frontend/.env.example` | modified | Documents no trailing slash, https outside localhost, canonical host, and client-side sanitization |
| 7 | `backend/app/routers/geocode_router.py` | modified | `_remember` bounded cache (55), `_normalize_query` (62), `_match_score` (75), `_gazetteer_result_type` (95), no Medan default in `/nodes` (124–130), ranked + de-duped gazetteer pass (204–232), Nominatim skip on exact hit (214/239), cache-on-hit-only (300), `search:v2` keys (186/305) |
| 8 | `backend/tests/test_geocode_search.py` | **new** | 10 hermetic regression tests over ranking, prefix stripping, honest miss, negative cache, Nominatim skip, node coordinates |

---

## 2. What each fix actually does

### 2.1 Base URL — one resolver, no bypass

`frontend/lib/baseUrl.ts` exists because the pre-fix tree had **three** base-URL policies:

1. `api.ts getBaseUrl()` — returned `NEXT_PUBLIC_API_URL` verbatim unless it contained the dead host;
2. `app/api/proxy/[...path]/route.ts` — `x-target-base-url || process.env.NEXT_PUBLIC_API_URL || default`, plus its own substring rewrite;
3. `FleetOnboardingModal` — `process.env.NEXT_PUBLIC_API_URL || …` **directly**, bypassing the resolver entirely.

`sanitizeBaseUrl` now normalizes whitespace, pasted quotes, a missing scheme, a trailing slash, and the dead host, and returns `null` rather than an unusable string. `getBaseUrl()` uses it, then falls back to `https://peta-nadi.onrender.com` on a non-localhost browser origin, then `http://localhost:8000`.

Two behaviours worth naming:

- **Trailing slash** — `https://peta-nadi.onrender.com/` previously produced `https://peta-nadi.onrender.com//api/v1/geocode/search`. The path segment is now stripped at the source.
- **Abort is not a network error** — `request()` rethrows an abort *before* the `/api/proxy` fallback (lines 48–52). Falling back would silently restart work the caller just cancelled.

### 2.2 Deadline — a timeout must not look like a cancellation

`api.geocode.search` wraps `request()` in its own `AbortController` with a 20 s timer and forwards the caller's signal. When *its own* timer fires it throws `Pencarian backend melebihi 20 detik` as a plain `Error`; when the *caller* aborts it rethrows the `AbortError`.

That distinction is the whole point: `CrisisMap` and `FleetOnboardingModal` both early-return on `AbortError`. If the timeout also surfaced as `AbortError`, a 77 s cold boot would leave the spinner and the "Mencari…" row on screen forever with no error — which is the exact bug being fixed.

### 2.3 Ranking + de-dupe — client side

`CrisisMap` renders local hub/gazetteer matches immediately, then merges the live response into them:

- `scoreSearchItem`: `0` exact, `1` prefix, `2` word boundary, `3` substring, `4` fallback.
- `mergeSearchResults`: sort by `(score, sourceIndex)` **before** de-duping, so the exact gazetteer name wins over a locally labelled variant of the same place.
- `isSamePlace`: same name (parentheses stripped) **and** `<0.05°` on both axes. Same-name towns in different kabupaten are kept; alias duplicates are collapsed.
- Cap: 10 rows.

This mirrors the backend's `(score, tier, len(slug), slug)` ordering, so the local-first list does not reshuffle when the live response lands.

### 2.4 Ranking + de-dupe — backend side

`_normalize_query("Kecamatan Medan Johor") → "medan johor"`, so the admin prefix is stripped instead of being matched literally. `_match_score` gives Kota Padang score `0` for `padang`; Padang Sidempuan scores `1` and loses. A 1.5 km proximity filter collapses `padangsidimpuan` and `padang sidempuan` (same coordinates).

`exact_gazetteer_hit` skips the Nominatim round-trip only when the **top** scored slug is exact. `padang` and `medan` return without an external call; `Kecamatan Medan Johor` still queries Nominatim and still resolves from the gazetteer.

### 2.5 Honest states

| State | Where | Copy |
|---|---|---|
| Loading | `CrisisMap` dropdown | `Mencari gazetteer desa / kecamatan / kota…` with a spinner |
| Partial / error | `CrisisMap` dropdown | `Pencarian live gagal (<reason>) — menampilkan hasil gazetteer lokal saja.` + **Coba lagi** |
| Empty | `CrisisMap` dropdown | `Tidak ada hasil untuk “<q>”. Coba nama desa, kecamatan, kota, atau hub lain.` |
| Timeout | `FleetOnboardingModal` fields | `Pencarian gagal (Pencarian backend melebihi 20 detik) — backend tidak merespons. Coba lagi.` |
| Backend miss | `/geocode/search` | `200`, `count: 0`, `results: []` — no centroid substitution |

The dropdown is now rendered for `results.length > 0 || isSearching || !!searchError` rather than results-only, so an empty or failed search is visible instead of the panel vanishing.

### 2.6 Cache and negative cache

- `_remember` caps both in-memory caches at 512 entries by evicting the oldest inserted key. It is FIFO, not true LRU (documented, not hidden).
- Results are cached only when non-empty — a transient Nominatim failure can no longer pin "no results" for the process lifetime.
- Redis keys move to `lrip:geocode:search:v2:{query}:{limit}` with `ex=86400`, so pre-fix entries under `lrip:geocode:search:` are ignored without a manual flush.

### 2.7 Honest types

`_gazetteer_result_type` returns `hub` / `kecamatan` / `regency` from `precision_tier` and `tier`; `/geocode/nodes` now also publishes `precision_tier`. `searchResultBadge` maps port/airport/city/kecamatan/village/hub/regency/province to Indonesian badges and falls back to `Titik`, not `Desa`.

### 2.8 No fabricated coordinates

`/geocode/nodes` skips any entry whose `coords` is missing or not length 2 and logs `Gazetteer node '<slug>' missing coords; skipping`. The Medan centroid default is gone. The test asserts the centroid belongs to `medan` alone.

---

## 3. Automated verification (executed in this window)

| Check | Command | Result |
|---|---|---|
| TypeScript | `cd frontend && npx tsc --noEmit -p tsconfig.json` | **exit 0**, no diagnostics |
| Geocode tests | `python -m pytest backend/tests/test_geocode_search.py -q` | **10 passed**, 6.45 s, 2 warnings (Starlette `httpx` deprecation, Pydantic v1-style `Config`) |

The 10 tests are the 5 parametrized exact-name cases plus prefix, miss, negative-cache, Nominatim-skip, and node-coordinate checks.

### 3.1 Local behaviour probes (`TestClient`, Redis stubbed to `None`)

| Query | `count` | Names | First type |
|---|---|---|---|
| `padang` | 5 | Padang, Padang Lawas, Padang Panjang, Padang Pariaman, Padangsidimpuan | `regency` |
| `kota padang` | 5 | Padang, Padang Lawas, Padang Panjang, Padang Pariaman, Padangsidimpuan | `regency` |
| `Kecamatan Medan Johor` | 1 | Medan Johor | `kecamatan` |
| `zzzznotaplace` | 0 | — | — |

`padang` now puts **Kota Padang first** (it was last in the live pre-fix response, §5). `Padangsidimpuan` appears once, not twice.

---

## 4. Deployed-frontend audit (read-only)

The production bundle was inspected to avoid asserting a deployment state that cannot be checked:

- `https://pre-hub.vercel.app` returns 200.
- Its chunk `/_next/static/chunks/264-b7a53ac9c11bc50d.js` contains the **old** resolver, minified as:

  ```js
  function n(){let e="https://peta-nadi.onrender.com";if(!e.includes("prehub-backend.onrender.com"))return e}
  return["localhost","127.0.0.1"].includes(window.location.hostname)?"http://localhost:8000":"https://peta-nadi.onrender.com"
  ```

- No chunk served from the entry HTML contained the new UI strings (`Pencarian backend melebihi`, `Mencari gazetteer`, `Pencarian live gagal`, `Tidak ada hasil untuk`).

**Two conclusions, kept separate:**

1. The deployed frontend is **pre-fix** — the new resolver, timeout copy, and honest states are not live.
2. In *this* build, `NEXT_PUBLIC_API_URL` was inlined as `https://peta-nadi.onrender.com`, **not** the dead host. So the dead-host value is not currently baked into the bundle. The verified bypass is structural, at the call sites: `FleetOnboardingModal` read `process.env.NEXT_PUBLIC_API_URL` directly, and the proxy preferred the header/env over any validation. A later env edit to the dead host would ship straight to those paths without any test catching it.

---

## 5. Live backend audit — still pre-fix

Warm probes against `https://peta-nadi.onrender.com` (no cold start during the window, 0.8–2.8 s):

| Probe | Live response | Interpretation |
|---|---|---|
| `GET /geocode/search?q=padang&limit=5` | `count: 5`; order **Padangsidimpuan, Padang Sidempuan, Padang Lawas, Padang Lawas Utara, Padang**; all `type: "regency_hub"` | Pre-fix ranking **and** pre-fix duplicate aliases: Padang is last, Padangsidimpuan appears twice at `1.3789, 99.2717` |
| `GET /geocode/search?q=zzzznotaplace&limit=5` | `count: 0`, `results: []` | Old code also returns empty here; this probe does not distinguish versions |
| `GET /geocode/nodes` | `total: 324`; keys `id,name,lat,lon,province,corridor,tier`; **no `precision_tier`**; only `medan` sits at `3.5952, 98.6722` | Missing `precision_tier` proves the old router is deployed. All 324 gazetteer entries have coords, so the old Medan default never fired on this dataset |

**Therefore:** the live pair does not run this phase's code. Criteria in 80-01 §5 are proven **locally only**. The live `padang` response is exactly the symptom the fix targets, which also makes it the post-deploy acceptance check.

---

## 6. Deploy checklist (not performed)

1. Commit the eight files above (nothing was committed in this window).
2. Push → Vercel rebuild. The env value is inlined at build time, so a rebuild is mandatory even if `NEXT_PUBLIC_API_URL` did not change.
3. Redeploy Render (`peta-nadi.onrender.com`). `/geocode/nodes` must start returning `precision_tier` — that is the cheapest deploy sentinel.
4. Warm the instance, then re-run: `q=padang` (Padang first, one Padangsidimpuan), `q=kecamatan medan johor`, `q=zzzznotaplace` (empty), `q=` on a cold instance (error within 20 s).
5. If `q=padang` still shows `cached: true` with the old order, a `search:v2` key was written by an intermediate build — delete `lrip:geocode:search:v2:*`.
6. Only then mark 80-01 §5 criteria 1–6 as verified in production.
