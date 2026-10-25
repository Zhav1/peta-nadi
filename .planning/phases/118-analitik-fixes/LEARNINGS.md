# LEARNINGS — Phase 118: Analitik Fixes

## Issues found

1. **Bare-text cause, transparent outline:** per-bar date labels render as bare text with no pill background (transparent outline by design) — a missing-looking label is the style, not a missing import; check `text-xs text-slate-400 tabular-nums` before "fixing" it into a badge.
2. **Registry-only shimmer, zero-motion:** the `Lihat Laporan` shimmer is the only registry-style motion on the page and it is fully `motion-safe:`-gated (span + button transitions); reduced-motion yields a static glass button with zero movement.
3. **Single-region scraper root + slug mismatch:** the PIHPS scraper only persists one region, so 8 UI slugs must collapse to `north_sumatra` at fetch time (`REGION_TO_DB`) while URL/state slugs stay unchanged; `Semua ('') → undefined` (no filter) is the only honest unfiltered read.
4. **Weekly cadence, static look:** PIHPS points arrive weekly, so 7/14/30d windows often show repeated values and flat `#64748b` bars; flat is correct data, not a broken gradient — do not recolor flat bars green/red to "enliven" the trend.
5. **T- fallback only when time missing:** `T-{n}` labels appear only when a point has no `time`; any `T-` on a dated point means the `priceTimes` array misaligned with `priceHistory`, not a formatting choice.
6. **Stale `:3000` standalone vs fresh build:** a killed-but-cached `:3000` standalone server can still show the pre-fix surface (globe canvas / unmapped regions / dateless bars) while `next dev` + fresh `npm run build` show the fixed tree; kill `:3000` first, trust the fresh build.
7. **Stale M7 gate spec left for owner:** the M7 gate spec referenced by earlier windows is stale relative to this tree; left untouched for the owner to reconcile — do not paper over it with a local gate edit in this docs-only turn.
8. **Same-file single writer avoids collisions:** P1/P3 taught this and Phase 117 confirmed it — this fix set landed as one serialized pass (layout, days, shimmer, region map, trend dates, spikes guard) with no parallel writers on `AnalyticsSection.tsx`.

## What not to repeat

- Do not re-add the map/globe canvas to Analitik — the full-width single-column contract is the ceiling.
- Do not run `shadcn add` for days/shimmer — hand-rolled glass + `motion-safe:` is the approved pattern here.
- Do not expand `REGION_TO_DB` with invented per-province DB codes — the scraper root is single-region until the backend proves otherwise.
- Do not interpolate `< 3`-record series or weekly-flat runs to "fill" the trend — `AnalyticsEmpty` / flat slate bars are the complete render.

## Environment pitfalls

- Stale `.next` (`ENOENT`) can block rebuild verification — remove `.next` and retry (carried from Phase 116).
- Root `npx tsc --noEmit` shim is the standard evidence line (carried from Phase 117); `frontend/`-scoped runs can report a different file set.
