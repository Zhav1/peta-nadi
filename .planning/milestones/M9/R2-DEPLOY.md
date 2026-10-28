# M9 R2 — Distilled Surface Production Rollout

**Date:** 2026-10-28
**Operator:** subagent (rollout R2)
**Branch merged:** `m9-distilled-surface` @ `904c4fe`
**Merge commit on `main`:** `3d5f3b5` — `merge: M9 wave 2 — distilled command surface`
**Rollback tag:** `pre-m9-r2` → `origin/main` @ `c250a09` (pushed before merge)

---

## 1. Pre-flight

| Check | Result |
| --- | --- |
| `origin/main` tip | `c250a09` — **had not moved** past R1.1 |
| Ahead commits on branch | 6 (`1f5485c` … `904c4fe`) |
| Conflict risk from other session's dirty tree | **none** — their edits (`AnalyticsSection.tsx`, `ReportsSection.tsx`, `analytics/CorrelationMatrix.tsx`, `analytics/TimeHeatstrip.tsx`, `docs/screenshots/*.png`) are **not touched by any of the 68 merged files** |
| Dirty tree handling | left untouched; no `git add -A`, no revert, no stash. Files still show as modified after the merge |

## 2. Merge

```
git tag pre-m9-r2 origin/main && git push origin pre-m9-r2   # new tag -> pre-m9-r2
git switch main && git pull --ff-only                        # already up to date
git merge --no-ff m9-distilled-surface                        # ort strategy, 0 conflicts
git push origin main                                          # c250a09..3d5f3b5
```

- Files: 68 changed, +4457 / −903.
- No conflict, no abort, no force-push.

## 3. Deploy verification

| Target | Before | After |
| --- | --- | --- |
| `https://pre-hub.vercel.app` ETag | `"86336559494c5baf9594e1a84cc86540"` | `"ebda0c53353516cc57bc229f35869679"` (flipped 16:57:46 local, ~2 min after push) |
| `https://peta-nadi.onrender.com/health` | — | `200` `{"status":"ok","version":"0.1.0","environment":"development","service":"prehub-api"}` at 16:58:03 |

Backend did redeploy: fresh geocode lookups (uncached keys) return the new `kabupaten` vocabulary — see §4.4.

## 4. Production smoke (live, real data)

| # | Endpoint | Status | Result |
| --- | --- | --- | --- |
| 1 | `/api/v1/weather/summary` | 200 | `waspada.count = 28` (`total 28`, `status:"ok"`), `cuaca.count = 1` (`status:"ok"`), bbox `94,-6,108,6`, `window_hours 24` — **PASS** |
| 2 | `/api/v1/fire/hotspots` | 200 | `count = 145`, `status:"ok"`, VIIRS_SNPP_NRT, FRP up to 53.91 MW — **PASS** |
| 3 | `/api/v1/news/live` | 200 | see below — **PASS** |
| 4 | `/api/v1/geocode/search?q=natuna` (default `limit=10`) | 200 | `type:"regency"` — **FAIL (stale cache, see 4.4)** |
| 5 | `/api/v1/geocode/search?q=belitung%20timur` (default `limit=10`) | 200 | `type:"regency"` — **same FAIL** |

### 4.3 News coverage — 8 new feeds are live

```
crisis_count      = 4
regional_count    = 29
total             = 33
provinces_present = Aceh, Sumatera Utara, Sumatera Barat, Riau, Jambi,
                    Sumatera Selatan, Bangka Belitung, Bengkulu, Lampung   (9/10)
provinces_missing = Kepulauan Riau
```

Per-province: Aceh 8, Sumut 2, Sumbar 6, Riau 1, **Jambi 1**, Sumsel 4,
**Bangka Belitung 3**, **Bengkulu 2**, Lampung 6.

New sources actually contributing: `Tribun Jambi`, `LKBN ANTARA Babel`,
`BaBelnews.id`, `LKBN ANTARA Bengkulu`, `Tribun Bengkulu`.
Jambi / Bangka Belitung / Bengkulu now appear on the deployed dashboard
(province chips + grouped feed). Kepulauan Riau remains absent — pre-existing
gap, **not** one of the three feeds this wave restored.

### 4.4 Gazetteer `type` vocabulary — code shipped, cache still serves old rows

The API returns `"cached":true, "nominatim":"cached"` for the bare queries.
Those entries were written to Redis **before** the redeploy, under
`lrip:geocode:search:v2:{query}:{limit}` with `ex=86400`, and the cached payload
is echoed verbatim — so the pre-deploy `"regency"` strings survive.

Same query, different (uncached) cache key, proves the new code is live:

| Request | `cached` | `type` |
| --- | --- | --- |
| `?q=natuna` | true | `regency` ← stale |
| `?q=natuna&limit=3` | false | **`kabupaten`** |
| `?q=natuna&limit=6` | false | **`kabupaten`** |
| `?q=belitung%20timur` | true | `regency` ← stale |
| `?q=belitung%20timur&limit=4` | false | **`kabupaten`** |

Consequence: the literal R2 assertion (`type == "kabupaten"` on the *default*
query) fails until the stale Redis keys expire (≤24 h) or are deleted.
The fix in code is correct and deployed.

## 5. Live visual verification (real data, no stubs)

New spec: `frontend/e2e/r2-production-capture.spec.ts` — guest, prod baseURL, no
webServer, read-only. It asserts HTTP 200, the three counter testids
(`counter-cuaca`, `counter-waspada`, `counter-titik-panas`), at least one
`berita-card-*`, and the absence of the `"Belum ada berita live terverifikasi"`
empty state; it also dismisses first-visit overlays.

```
npx playwright test -c playwright.vercel.config.ts e2e/r2-production-capture.spec.ts --reporter=line
  → 2 passed (35.5s)
```

| Viewport | Screenshot | Observed live values |
| --- | --- | --- |
| 1920×1080 | `.planning/milestones/M9/phaseR2/live-dashboard-1920.png` | Cuaca 1 · Waspada 28 · Titik Panas 145 · Berita 29 sumber, 33 artikel, chips incl. Jambi 1 / Bangka Belitung 3 / Bengkulu 2; "Kepulauan Riau: tidak ada artikel 48 j" |
| 390×844 | `.planning/milestones/M9/phaseR2/live-dashboard-390.png` | counters pinned in one row (Cuaca 1 · Waspada 28 · Titik Panas 145), news sheet closed by design (176.5), map readable |

Local palette/chrome gate against the merged source:

```
npx playwright test e2e/dashboard-chrome-distilled.spec.ts e2e/dashboard-palette-contract.spec.ts --reporter=line
  → 8 passed (11.3s)
```

### Reproducibility note (uncommitted, intentional)

`frontend/playwright.vercel.config.ts` had `testMatch: /vercel-capture\.spec\.ts/`,
so the new spec was filtered out ("No tests found"). The one-line change to
`/(?:vercel-capture|r2-production-capture)\.spec\.ts/` was required to run the
command above. It is **left uncommitted** because this rollout's commit was
scoped to the doc + spec only — see "What a human must still do".

## 6. Failures / debt

1. **FAIL — geocode default queries still return `type:"regency"`** (stale Redis
   payloads, keys `lrip:geocode:search:v2:{natuna|belitung timur}:10`, TTL ≤24 h).
   Code is deployed and correct (verified via uncached keys). Requires a cache
   delete or a key-version bump (`v2` → `v3`) in `geocode_router.py`.
2. **Note — Kepulauan Riau** still has no live feed (0 articles / 48 h). Honest
   empty state is shown; no fail.
3. **Note — `frontend/playwright.vercel.config.ts` testMatch change uncommitted.**
4. **Note — `truncated: true`** on `/news/live` (budget 150); 33 articles made it
   through, so nothing observable is lost today.

## 7. Rollback

Not triggered. Frontend stayed 200 on every poll and `/health` returned 200 on
the first check after the merge. Rollback remains:
`git reset --hard pre-m9-r2 && git push --force-with-lease origin main`.
