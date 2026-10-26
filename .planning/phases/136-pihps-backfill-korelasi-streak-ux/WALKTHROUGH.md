# WALKTHROUGH — Phase 136: Real PIHPS Backfill 180d + Korelasi/Streak UX

**Commit:** `8f30522` (Fase C slice).

## Changes made

- Backfill window 30d→180d weekly in `pihps_scraper.py` docstring + code;
  spikes limit 500→1000 in `commodity_router.py` for 30d overlap depth.
- `AnalyticsSection` multi-series loader refactored to `fetchSeries(commodity,
  region)` with `limit:100`; thin series (<14 pts behind a region filter)
  refetched as Sumatera aggregate and merged only when longer (≥14 and longer
  than thin); `multiFallback` state drives the UI note.
- Correlation UX: `Overlap maks n={max}/10 · {valid}/{total} pasangan`,
  progressbar `aria-valuenow/max=10`, CTA "Perpanjang window (N hari → 30 hari)
  atau pilih Semua wilayah"; region-narrow warning when `regionActive`.
- Streak UX: fallback banner `role=note`; empty state names `minPoints` and
  the "Bedakan" disambiguation paragraph.

## Fixes tried + retry (user-provided context)

- Streak/heatmap specs needed `aria-label` stabilization before role queries
  passed; re-ran after labeling.
- Thin-filter e2e (`fullPoints:8/thinPoints:5`) initially rescued by fallback
  when aggregate was too generous — fixture tuned so aggregate (8) also <14
  for the honest-empty path, and 20/5 for the fallback-banner path.

## Concerns

- Juri validitas: fallback aggregate is real PIHPS (same source, wider region),
  always labeled "Fallback agregat Sumatera aktif (real backfill, bukan
  sintetis)". Unlabeled aggregation would read as fabrication — the label is
  load-bearing.
- No synthetic-as-real: empty BI response → honest-empty; thresholds 10/14
  are display gates, not fill-ins.

## Constraints / conditions (user-given)

- Real backfill only; threshold 10 keep; streak 14; Demo vs Real labeling;
  never touch Peta/Evaluasi/RBAC POST; e2e green; Playwright auto-check.

## Environment

- Windows `D:\College\Pidi.id`; `frontend/` Vercel root; `backend/` Render.
- Branch (user-given): `evaluasi-credibility-milestone-20261026`; commit `8f30522`.

## Issues found — avoid next time

- Don't raise `limit` without checking the 500→1000 payload cost on spikes;
  keep `limit:100` on multi-series (4 commodities × region) to bound fan-out
  (one extra `Promise.all` only when thin series exist).
- Don't silently widen a region filter to hit n≥10 — the CTA must let the user
  choose; auto-widening breaks filter honesty.
- `n<10` cells render blank, never `r=0` — a zero would corrupt the diverging
  scale and mislead judges.
