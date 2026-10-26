# WALKTHROUGH — Phase 134: Analitik Palette 3+Neutral Canonical

**Commit:** `8f30522` (Fase A slice). Current HEAD `de078d7` (evaluasi WS-B on top).

## Changes made

- `heatScale.tsx`: `spikeRamp` v≥10 orange→red; `corrRamp` negative sky→slate.
  Legend: positif red, negatif slate, `n<10` neutral.
- `AnalyticsSection.tsx`: `severityBadge('high')` orange→red classes.
- `ERPSavingsPanel.tsx`: Dispatcher dot `bg-cyan-400`→`bg-emerald-400`.
- `LaporanCharts.tsx`: Hemat Bar `#34d399`→`#10b981`; Area gradient +
  Line `#22d3ee`→`#10b981`.
- E2E contract added (see Phase 137): source grep + computed-style scan,
  trend `#38b8f8` pinned.

## Fixes tried + retry (user-provided context)

- `offsetParent` returns `null` for SVG elements even when laid out → computed-style
  scan uses `getClientRects().length === 0` to skip hidden `display:none`
  map/eval/report containers, plus skips `position:fixed` portals.
- Heatmap `aria-label` added where missing so Playwright role queries are stable.
- Orange/cyan residual at `DashboardClient:199` (TopNavTelemetry legend) left
  intentional — out of scope (map chrome, not analitik/laporan subtree).
- `tsc` must run from `frontend/` root (not repo root) — repo-root invocation
  resolves wrong `tsconfig`/deps.

## Concerns

- Juri validitas data: color change only, no data semantics altered; thresholds
  5/10/15% and |r|>0.7 unchanged.
- No synthetic-as-real: palette phase touches no fetchers/seeders.

## Constraints / conditions (user-given)

- Analitik canonical 3+neutral, no clutter; keep threshold 10; never touch
  Peta/Evaluasi/RBAC POST; e2e must stay green; use Playwright auto-check;
  orchestrator Xhigh via sub High only.

## Environment

- Windows `D:\College\Pidi.id`; `frontend/` root for Vercel, `backend/` Render.
- Branch (user-given): `evaluasi-credibility-milestone-20261026`; commit `8f30522`.
- Env: `NEXT_PUBLIC_*` (user-given).

## Issues found — avoid next time

- Don't reintroduce `orange-500`/`cyan-400` Tailwind classes into analitik/laporan
  files; the palette spec greps sources.
- Don't "fix" `DashboardClient:199` TopNav cyan/orange inside an analitik phase —
  separate surface, separate phase.
- SVG visibility checks: never use `offsetParent`; use `getClientRects`.
