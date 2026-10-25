# LEARNINGS — Phase 119: PIHPS 8-Province Scraper

## Issues found

1. **Concurrent same-dir `next build` races manifests:** two `next build` processes in one `frontend/` dir fail *after* 7/7 with varying ENOENTs (`_ssgManifest.js`, then `page.js.nft.json`) — compiled + types + pages all green, only the trace/manifest write phase collides. Check `Get-Process node` command lines, wait for the other build to exit, `Remove-Item .next`, rebuild solo.
2. **Stale `.next` ENOENT is back (carried from 116/118):** pre-existing `build-final.log` failed on `middleware-manifest.json`; clean `.next` remains the first move before diagnosing further.
3. **Compat-first region expansion:** keeping `REGION`, `SUMUT_PROVINCE_ID`, and bare `lrip:pihps:latest` = north_sumatra meant zero consumer changes; per-region keys are purely additive (`rolling:{com}:{region}`, `latest:{region}`, `dedup {short}`).
4. **Phase 118 slug-collapse correctly superseded:** collapsing 8 UI slugs → `north_sumatra` was honest when the scraper was single-region; the moment the backend scopes by region, the 1:1 map must land in the same commit or Analitik reads the wrong province.
5. **Short slugs belong in dedup keys, canonical slugs in DB:** UI shorts (`sumut/sumbar/sumsel`) survive only inside `pihps:{com}:{short}:{date}` dedup keys; `commodity_prices.region` and event `region` always carry canonical slugs matching `normalize_region`.
6. **Pytest trio takes ~3 min:** `test_scrapers + test_api_routers + test_agents` ran 172s (heavy backend imports); run with a generous timeout or backgrounded, not in a 120s foreground slot.
7. **Sibling-new TS file can red the build mid-window:** `laporanAggregations.ts:104` spread-of-`Map.values()` failed type-check until `Array.from(...)`; with parallel writers, re-run `tsc` right before `build` instead of trusting an earlier green.

## What not to repeat

- Do not run `npm run build` while another agent's build is alive in the same dir — serialize or expect manifest ENOENTs.
- Do not re-collapse `REGION_TO_DB` to a single region — the backend now persists 8 distinct regions.
- Do not invent new short slugs — `REGION_SHORT_SLUG` is the single dedup-slug source.
- Do not raise fetch concurrency for the 8× region loop without checking BI anti-DoS behavior first (sequential + 0.5s sleep is the proven pattern).

## Environment pitfalls

- `Get-Process node` + `Win32_Process.CommandLine` identifies stray `next build`/`npm run build` PIDs (carried technique, new use).
- PowerShell has no `tail/head/sed` — use `Select-Object -Last/-Skip/-First` (recurring).
- Foreground shell cap is 120s — pytest trio must be backgrounded.
