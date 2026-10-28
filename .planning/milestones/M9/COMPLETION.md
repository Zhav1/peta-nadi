# M9 — Completion Audit

**Milestone:** M9 "Operational Truth & Distilled Command Surface" (phases 167–176.8)
**Audit date:** 2026-10-28 · **Operator:** subagent (final rollout R2.1)
**Final merge on `main`:** `c84018d` — `fix: M9 final polish — news legibility, guest clearance, geocode cache v3`
**Branch merged:** `m9-r2.1` @ `804f537` (fast-forwarded doc commit) on top of `378e58d` — **no conflicts, no abort, no force-push**

## Rollback tags

| Tag | Points at | Purpose |
|---|---|---|
| `pre-m9-r2.1` | `df11f58` (origin/main before this rollout) | undo the final polish |
| `pre-m9-r2` | `c250a09` | undo wave 2 (distilled surface) |
| `pre-m9-r1.1` | `bfa3337` | undo the FIRMS day-range fix |
| `pre-m9-r1` | `b1ebf7b` | undo wave 1 |

Rollback: `git reset --hard pre-m9-r2.1 && git push --force-with-lease origin main`.

**Follow-up commits on `main`:** `d533ac9` (production assertions + live captures), then this audit.

---

## 1. The eight original complaints

| # | Complaint (verbatim) | Phase(s) | Commit(s) | Live production evidence (measured) | Verifying test |
|---|---|---|---|---|---|
| 1 | Waspada Dini & Titik Panas selalu 0 | 167, 168, 173.6 | `51b3903`, `e8567b1`, `299b4f9` | `/weather/summary` → `waspada.count 28` (`total 28`, `status ok`); `/fire/hotspots` → `count 145` (`total 145`, `capped false`, `status ok`, `source nasa-firms-api`); dashboard pills read **28** and **145** | `hazard-counter-truth.spec.ts › Waspada Dini counts backend truth even with every weather layer OFF`; `firms-hotspot-truth.spec.ts › ok envelope renders the true hotspot count`; `r2-production-capture.spec.ts › R2.1 legibility at {1920x1080,390x844}` (counters non-`—`) |
| 2 | Tooltip zona cuaca/waspada/FIRMS terasa asing | 176 | `57641f2` | All zone popups render the `.ds-popup` contract, XSS payloads render as text | `map-tooltip-contract.spec.ts › weather zone popup renders the distilled tooltip contract`; `… › firms single-detection popup escapes hostile feature strings` |
| 3 | Layer hilang/muncul, ingin seluruh Sumatera | 169 | `ef0148a` | Corridor filter removed; grid 23 → 58 points (≥4 per province); `bbox 94,-6,108,6`, `window_hours 24`; freshness badges + cap notice | `weather-freshness.spec.ts › fresh payload shows Diperbarui and the 24-of-30 cap notice`; `… › stale weather refresh keeps polygons and counters, badge says data tertunda` |
| 4 | Rute alternatif tidak muncul untuk kota kecil | 170 | `bb9b61b` | `MAX_SNAP_KM = 75` (median hub spacing 38.6 km); `no_route` surfaced with `reason_code`; provenance badge; `k_alternatives: 3` | `small-town-routing.spec.ts › solver no_route surfaces the backend reason instead of rendering nothing`; `… › route cards carry provenance badges and identical geometries render once` |
| 5 | Pencarian tidak menemukan kota/kecamatan kecil | 171, 176.7 | `2783c10`, `44f0ee4` | 2,096-record gazetteer; live `?q=natuna` → `type:"kabupaten"`, `?q=belitung%20timur` → `type:"kabupaten"` (was `regency`) | `gazetteer-search.spec.ts › offline kecamatan hit renders level, parent regency and province`; `backend/tests/test_geocode_cache_version.py` (27 passed) |
| 6 | Berita hanya Tribun Aceh; keyakinan 86% | 172, 172.5, 176.7, 176.8 | `83a12fe`, `269324c`, `44f0ee4`, `378e58d` | `/news/live` → `crisis 3` + `regional 34` = **37** articles across **9/10** provinces; 34 sources verified; constant 86% gone, label is `Belum terverifikasi` | `news-honesty-breadth.spec.ts › (b) an uncorroborated Tier-2 card never shows 86% and says Belum terverifikasi`; `news-card-legibility.spec.ts › "Belum terverifikasi" is fully painted inside the card`; `r2-production-capture.spec.ts › R2.1 legibility at {1920x1080,390x844}` |
| 7 | Dispatcher tidak bisa melihat detail armada | 173 | `69840d4` | Tenant-scoped drawer restored, per-vehicle detail, Medan fallback removed, `?company_id=` widening closed | `fleet-roster.spec.ts › drawer states both counts and lists all tenant units`; `… › a unit without coordinates is honest: no Medan fallback anywhere` |
| 8 | Dashboard terlalu berwarna, ingin mewah/distilled | 174, 175, 176, 176.5, 176.6 | `1f5485c`, `cf2a1bb`, `57641f2`, `95fc6a1`, `904c4fe` | One accent `#38b8f8`, monochrome chrome, 14 banned hex values gated; counter pills pinned below `md` | `dashboard-chrome-distilled.spec.ts › no chrome element computes to a banned palette value`; `dashboard-palette-contract.spec.ts › CLEANED_FILES contain no banned chrome hex`; `mobile-layout.spec.ts › primary hazard counters are pinned and visible` |

All eight complaints have a shipped fix and a named test. **Two live defects remain open** — see §5.

---

## 2. Rollout record (R2.1)

| Step | Result |
|---|---|
| Pre-flight `origin/main` | `df11f58` — unchanged, as expected |
| Docs commit | `804f537` `docs(m9): roadmap registration and milestone ledger` (ROADMAP M9 block + `.planning/milestones/M9/**` only; the other session's dirty files were never staged) |
| Merge | `git merge --no-ff m9-r2.1` → `c84018d`, ort strategy, 0 conflicts, 30 files, +927/−30 |
| Push | `df11f58..c84018d  main -> main` |
| Backend deploy (Render) | redeployed; first uncached geocode call at 17:51:17 local returned the new vocabulary |
| Frontend deploy (Vercel) | ETag `"ebda0c5…"` (df11f58 build) → `"f017f37…"` (c84018d build), stable and `x-vercel-cache: HIT` across 18:05:31–18:06:11 |

Dirty tree left untouched throughout: `AnalyticsSection.tsx`, `ReportsSection.tsx`, `CorrelationMatrix.tsx`, `TimeHeatstrip.tsx`, `docs/screenshots/*.png`.

## 3. Production smoke (live, real data, after deploy)

| # | Endpoint | Status | Result |
|---|---|---|---|
| 1 | `/api/v1/geocode/search?q=natuna` | 200 | **`type:"kabupaten"`, `cached:false`** on the first (v3-miss) call — the cache fix is provably live. Later calls: `cached:true`, still `kabupaten` (new v3 key) |
| 2 | `/api/v1/geocode/search?q=belitung%20timur` | 200 | **`type:"kabupaten"`, `cached:false`**, `province:"Kepulauan Bangka Belitung"` |
| 3 | `/api/v1/weather/summary` | 200 | `cuaca.count 1` (`status ok`), **`waspada.count 28`** (`total 28`, `status ok`), `window_hours 24`, `bbox 94,-6,108,6` |
| 4 | `/api/v1/fire/hotspots` | 200 | **`count 145`**, `total 145`, `capped false`, `status:"ok"`, `source nasa-firms-api` |
| 5 | `/api/v1/news/live` | 200 | `crisis 3`, `regional 34`, `total 37`, `truncated true`; **present 9**: Aceh, Sumatera Utara, Sumatera Barat, Riau, Jambi, Sumatera Selatan, Bangka Belitung, Bengkulu, Lampung; **missing 1**: Kepulauan Riau |
| 6 | `/health` | 200 | `{"status":"ok","version":"0.1.0","environment":"development","service":"prehub-api"}` |
| 7 | `https://pre-hub.vercel.app` | 200 | ETag changed vs the `df11f58` build (`ebda0c5…` → `f017f37…`) |

## 4. Local suite (pre-merge, branch `m9-r2.1`)

- Playwright full suite: **120 passed / 9 skipped / 0 failed** (129 collected, 12.2 min) — `.planning/milestones/M9/phase176.8-full-suite.txt`
- `tsc --noEmit`: **0 errors** · `next build`: **0 errors**
- `test_geocode_cache_version`: **27 passed**
- Backend (R1 artifact `r1-pytest.txt`): **516 passed / 4 failed** (520 collected). M9 baseline in `PROGRESS.md` records the same 4 failures.

The 4 known baseline failures — **not regressions**, all pre-date M9 phase 167 and were already red on `df11f58`:

1. `test_impact_assessment` — wall-clock latency budget, fails on a loaded CI box.
2. `test_travel_fuel_guard` — Starlette constant drift after the framework bump.
3. `test_travel_fuel_guard` (second case) — same drift, different assertion.
4. `test_cpu_routing_weather::…seed_fallback` — depends on a live TomTom cache entry.

None touch the geocode, weather, FIRMS, news, routing or approval code paths changed by M9.

## 5. Open items — NOT fixed

1. **390×844 guest banner still overlaps the last Berita card by 17.6 px.** Live: last card bottom `711.6`, banner top `694.0`. Root cause: the `68vh` bottom sheet overflows its own box (content `652` vs client `573`; the feed's box bottom lands at `870.1`, i.e. 26 px below `innerHeight 844`), while `--guest-banner-clearance` (`158px`) is computed as `innerHeight − bannerTop + 8` and therefore assumes the scroll box ends at the viewport edge. The feed is squeezed to `158px` and the sheet footer ("Transparansi Data") is clipped off-screen. The local suite missed it because `news-card-legibility.spec.ts` stubs a short feed with no province-chip row; the defect only appears with the real 9-province chip block. Fails as `r2-production-capture.spec.ts › R2.1 banner clearance at 390x844` (3 consecutive runs, same 17.6 px). Fix requires real layout work on the mobile sheet (shrink/collapse the filter block, or grow the sheet), not a padding tweak.
2. **The banner still covers mid-list cards while scrolling at 1920.** The clearance guarantee only holds at scroll-bottom (last card `853` < banner `914`). Visible in `.planning/milestones/M9/phaseR2.1/live-dashboard-1920.png`.
3. **`/health` reports `environment:"development"`** on Render despite `render.yaml` — the service is not synced from the blueprint. Cosmetic; fix in the Render dashboard or derive from `RENDER=true`.
4. **Kepulauan Riau has no live feed** (0 articles / 48 h). Honest empty state shown; outside the three feeds restored in 176.7.
5. **`cuaca.count = 1`** — a supply problem (one qualifying disruption zone), not a contract bug; the counter is truthful.
6. **`/news/live` returns `truncated: true`** (budget 150; 37 articles survived today, so nothing observable is lost).
7. **BMKG province-level DigitalForecast deferred** — documented endpoints 301 away, no public province contract.
8. **DESA-level offline gazetteer out of scope** (≈25k records, unreliable centroids). 21 kecamatan remain honestly unplaceable; the `regency` → `kabupaten` vocabulary is fixed for Natuna / Belitung Timur.
9. **`m9-r2.1` branch left in place** (merged, no cleanup performed).

## 6. Live captures

| File | Viewport | Content |
|---|---|---|
| `.planning/milestones/M9/phaseR2.1/live-dashboard-1920.png` | 1920×1080 | Cuaca 1 · Waspada 28 · Titik Panas 145; 34 sumber terverifikasi; first card `Belum terverifikasi` whole; province chips incl. Jambi 1 / Bangka Belitung 3 / Bengkulu 2; "Kepulauan Riau: tidak ada artikel 48 jam" |
| `.planning/milestones/M9/phaseR2.1/live-dashboard-390.png` | 390×844 | Counters pinned in one row (1 / 28 / 145); sheet open; chips visible; banner overlapping the feed's bottom sliver — the defect in §5.1 |

## 7. R2.2 rollout - final layout fix (merged; assertions still red on one defect)

Merged `m9-r2.2` (`fa2edc9`) into `main` as **`6db893a`** (`--no-ff`), with tag `pre-m9-r2.2` on the pre-merge `main` (`ca1fca1`). `origin/main` had not moved past `ca1fca1` at fetch time; no merge conflicts (the other session's uncommitted files do not overlap the merged paths).

### Deploy

| Item | Value |
|---|---|
| ETag before (R2.1 build) | `"280784705310b5e782dc9619b2df9014"` |
| ETag after (R2.2 build) | `"9a59ba70a3f437eadbe051fcfd55063a"` |
| Time to flip | ~100 s (5 polls at 20 s) |
| Evidence commit | `693e1d4` - `.planning/milestones/M9/phaseR2.2/` |

### Production assertions - `playwright.vercel.config.ts` (4 tests: **2 passed / 2 failed**)

Both **legibility** tests passed at 1920 and 390 (honest label fully inside the first card, counters `28` / `145` live). Both **banner clearance** tests failed - but not on geometry. They failed on a duplicated mount:

```
Error: strict mode violation: getByTestId('guest-evaluation-banner') resolved to 2 elements:
  1) <div id="guest-evaluation-banner" ...>   (parent: <body>, page-level strip)
  2) <div id="guest-evaluation-banner" ...>   (inside [data-testid="news-sheet"])
```

`6db893a` mounts `<GuestEvaluationBanner />` twice: `frontend/app/dashboard/page.tsx:24` (carried over from R2.1, top level) and `frontend/components/dashboard/DashboardClient.tsx:4119` (new in 176.9, docked in flow inside the panel). The local 121-pass run was measured against a working tree in which the other session had already removed the `page.tsx` mount - that edit was never committed, so the merged tree regressed. Full log: `.planning/milestones/M9/phaseR2.2/prod-assertions.txt`.

Measured geometry (`.planning/milestones/M9/phaseR2.2/prod-measure.txt`), scoping the locator to the in-sheet banner:

| Viewport | last card bottom | feed box bottom | innerHeight | in-sheet banner top | clearance |
|---|---|---|---|---|---|
| 1920x1080 | 1016.5 | 1017.0 | 1080 | 1029.0 | **+12.5 px** |
| 390x844 | 789.0 | 789.0 | 844 | 797.0 | **+8.0 px** (was **-17.6 px**) |

So the 176.9 layout fix itself is correct: the feed now ends 55 px above `innerHeight` (R2.1: 26 px below), and the banner sits in flow below it at every scroll position. The only blocker is the duplicate mount - a one-line removal of the `page.tsx` mount. **Not fixed in this rollout**, because that file is the other session's uncommitted work.

### Smoke (prod API `https://peta-nadi.onrender.com`)

| Check | Result |
|---|---|
| `/api/v1/weather/summary` | 200, `waspada.count 28` / `total 28`, `status ok`, `window_hours 24` |
| `/api/v1/fire/hotspots` | 200, `count 145`, `total 145`, `status ok` |
| `/api/v1/geocode/search?q=natuna` | 200, top result `type "kabupaten"` (`Natuna`, Kepulauan Riau, gazetteer) |
| `/api/v1/news/live` | 200, `total 39` (crisis 2 / regional 37); present 8 - Aceh, Sumut, Sumbar, Jambi, Sumsel, Bangka Belitung, Bengkulu, Lampung; **missing 2** - Riau, Kepulauan Riau |
| `/health` | 200 `{"status":"ok","version":"0.1.0","environment":"development","service":"prehub-api"}` |

Log: `.planning/milestones/M9/phaseR2.2/smoke.txt`. `waspada.count` and the FIRMS count match the R2.1 snapshot; the news feed lost Riau (R2.1 had 9 present / 1 missing) - a feed-side fluctuation, not a regression.

### Open item (blocks R2.2 sign-off)

1. **Guest banner rendered twice on `/dashboard`.** Remove `<GuestEvaluationBanner />` from `frontend/app/dashboard/page.tsx` (the `DashboardClient` mount is the correct one) and re-run `r2-production-capture.spec.ts`; expect 4/4 green. Until then the page shows a redundant full-width banner strip at `y 0-50` above the command center.

No rollback: the frontend stayed 200 and `/health` stayed 200 throughout.

### R2.2 captures

`live-dashboard-1920.png` and `live-dashboard-390.png` in `.planning/milestones/M9/phaseR2.2/` - same capture step as the prod spec (scroll-bottom, sheet open), retaken against the R2.2 deployment.
