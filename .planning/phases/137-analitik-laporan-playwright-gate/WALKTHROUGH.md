# WALKTHROUGH — Phase 137: Analitik/Laporan Playwright Gate Green

**Commit:** `8f30522` (Fase D slice).

## Changes made

- 5 new specs + 1 fixture file + 4 appends (see PLAN scope). All hermetic:
  `/api/` routes sunk or mocked (`mockAnalitikApi`, `mockLaporanApi`,
  `mockGuestApi`); `reducedMotion: 'reduce'`; `pageerror` listener asserted
  `[]` in every test.
- Selectors hardened: `#nav-reports`/`#nav-map`, `role=progressbar` with
  `aria-valuenow/max`, `getByRole('button', {name:'pilih Semua wilayah'})`,
  `getByLabel('Label keaslian data')`, `.recharts-line-curve` stroke check.
- M7 regression gate + laporan-filters + heatmap-tooltip specs extended for
  the new auth/palette/UX (dispatcher mock, Select queries, fallback copy).

## Fixes tried + retry (user-provided context)

- Port-3000 squatter killed before gate runs (stale dev server), then green.
- M7 gate `mockDispatcherAuth` updated for hard-block (ledger paths need the
  authenticated mock); re-ran.
- `laporan-filters` Select migration: native `option` queries → Base-UI
  `SelectItem` role queries; re-ran.
- `offsetParent` SVG bug: switched to `getClientRects` visibility filter.
- `tsc` run from `frontend/` (not repo root).

## Concerns

- Juri validitas: hermetic mocks prove UI logic, not live BI data — gate
  asserts honesty paths (empty/fallback/badge), never invents prices.
- Demo vs Real: mixed-ledger test pins `Demo 1`/`Real 1` counts so a future
  change cannot silently merge the two.

## Constraints / conditions (user-given)

- Milestone 4 fase; e2e must stay green; Playwright auto-check always;
  orchestrator Xhigh via sub High only; never touch Peta/Evaluasi/RBAC POST.

## Environment

- Windows `D:\College\Pidi.id`; `frontend/` Vercel root; `backend/` Render.
- Branch (user-given): `evaluasi-credibility-milestone-20261026`; commit `8f30522`.

## Issues found — avoid next time

- Always kill stray `next dev` on :3000 before Playwright; the webServer
  reuses the port and specs test the wrong tree.
- Keep `mockDispatcherAuth` in sync with every auth-guard change — the M7 gate
  breaks first when guards move.
- Fixed-position portals must be excluded from computed-style scans or every
  palette run false-positives on map chrome.
