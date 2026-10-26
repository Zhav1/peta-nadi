# LEARNINGS — Phase 126: Analitik Heatmap + BNPB Layout

**Scope:** fixes tried, concerns, user constraints, and issues found across this
context window (assumptions excluded; every item grounded in a file:line).

## 1. Fixes tried

1. **Severity cross-attribution (nearest-number fix)** —
   `backend/app/adapters/bnpb_adapter.py:175-205` (`nearest()` inside
   `severity_from_impact`): impact numbers are claimed by the nearest preceding
   keyword alternative, so `..."meninggal"... 3 ...luka... 10...` no longer swaps
   counts. Avoid next time: never regex-extract bare numbers without anchoring each
   number to its closest keyword; add a two-number unit test per severity path.
2. **`Map` spread TS2802 (`Array.from` fix)** — spreading a `Map` iterator trips
   TS2802 under the repo tsconfig; use `Array.from(map.entries())`.
   Avoid next time: grep `...new Map` / `[...map]` before `tsc --noEmit`.
3. **M7 stale canvas (`toHaveCount(0)` fix)** —
   `frontend/e2e/analitik-heatmap-tooltip-bnpb.spec.ts:51`
   (`main canvas:visible` count 0): analytics must render zero map canvases.
   Avoid next time: every analytics e2e keeps the canvas-absence guard; the layout
   (`AnalyticsSection.tsx:820-821`) never mounts map layers.
4. **DIBI 404 + Cloudflare 403 diagnosis** — DIBI guesses 404 and `bnpb.go.id`
   bulletin can 403 behind Cloudflare; the adapter falls through tiers instead of
   failing (`bnpb_adapter.py:392-402` CKAN → DIBI → bulletin → honest empty;
   `_ckan_get:433-446` never raises). Avoid next time: every external tier returns
   None on failure and the chain ends in an honest empty, never an exception.
5. **CKAN lat variants + TSUNAMI text coercion** —
   `bnpb_adapter.py:128` (`CKAN_GEO_KEYS` covers `latitude/longitude/lat/lon/
   lintang/bujur`), `:314-316` (`ckan_row_geo` tries `latitude → lat → lintang`),
   `:259-282` (`_ckan_count`/`_ckan_float` coerce int/numeric-string/float),
   `:117-118` (`CKAN_HAZARD_COLUMNS` maps `tsunami → TSUNAMI` by substring).
   Avoid next time: normalize keys to lowercase first (`:311-314` pattern) and
   coerce numerics at the boundary; never assume one canonical column name.
6. **`q` vs `filters` case-exact** — CKAN `package_search` `q` is case-sensitive
   in practice; keep dataset slugs exact (`CKAN_DATASETS`, `bnpb_adapter.py:78-82`).
   Avoid next time: copy dataset names verbatim from `status_show`; never
   lowercase/upper-case query terms to "normalize".
7. **Indonesian search terms** — BNPB-side discovery uses Indonesian hazard
   vocabulary (banjir, longsor, gempa, kebakaran hutan, tsunami, kekeringan).
   Avoid next time: match the source locale in queries; English terms silently
   return zero rows from Indonesian catalogs.

## 2. Concerns (open, evidenced)

1. **Annual aggregates misread as live alerts → label stats** — CKAN rows are
   per-province/per-kab aggregates (`bnpb_adapter.py:1-7`), not live events; the UI
   labels the BNPB panel as stats with source note (`AnalyticsSection.tsx:1093`
   `Sumber: BNPB DIBI/bnpb.go.id · cache 1 jam`) and a stale chip (`:451-458`).
   Keep the wording; never render an aggregate count as an alert badge.
2. **Jakarta in bbox gated by tokens** — `within_sumatra`
   (`bnpb_adapter.py:227-232`) drops non-Sumatra rows incl. Jakarta; DKI rows are
   intentionally excluded from the Sumatra board. If a national view is ever needed,
   gate it behind an explicit opt-in filter, not by widening the bbox default.
3. **`odc-by` vs `odc-odbl` license** — CKAN datasets carry Open Data Commons
   licenses; attribute BNPB (`Sumber: BNPB ...` label, `AnalyticsSection.tsx:1093`)
   and never strip the source note when remixing rows into derived stats.

## 3. Constraints / conditions (user-given, still active)

1. Orchestrator Xhigh + High subagents only; manager never makes direct tool calls.
2. Grill-me one-question-at-a-time before executing.
3. Chain `/goal` + `/boost` for phased execution.
4. Playwright auto-check always (new spec per milestone:
   `analitik-heatmap-tooltip-bnpb.spec.ts:1-65`).
5. E2E non-interference: tab IDs (`#nav-*`, spec `:57-63`), `?section=` merge
   (`:13,36`), `?guest` merge, GET-only, no canvas (`:51`), no vehicles, guard ≥3.
6. Mixed horizontal+vertical layout to maximize space (trend 8+donut 4, heatmaps 6+6,
   table 8+BNPB 4 — `AnalyticsSection.tsx:820-1069`).
7. Push to GitHub for Vercel visibility (`git add .` exactly, one commit, push main).
8. Plan md inside the phase folder, never temp files.
9. Continue phase numbering (this phase 126 = 125 + 1).

## 4. Issues found (evidence, no assumptions)

1. **Phase57 copy drift** — `phase57` suite has 8 pre-existing failures from stale copy
   (`Run Demo` / `Detail rute` 0 matches); unrelated to Analitik, documented not fixed.
   Avoid: pin e2e copy assertions to current UI strings on each milestone.
2. **tsc dirty-worktree from parallel edits** — parallel writers on shared files
   (`AnalyticsSection.tsx`, reconciled in `53c12e2`/`7bb1668`) produce transient tsc
   noise. Avoid: one writer per file; reconcile via explicit merge commits.
3. **No `kab-2025` / `monthly-2025` datasets exist** — CKAN discovery found no such
   slugs; only the `CKAN_DATASETS` in `bnpb_adapter.py:78-82` plus bootstrap IDs
   (`:86-88`) are real. Avoid: never invent dataset slugs; enumerate via
   `package_search` first.
4. **PNG infografis dead** — infographic PNG resources on data.bnpb.go.id are not
   machine-readable rows; skipped as a tier. Avoid: filter resource formats to
   datastore-backed/CSV before wiring a parser.
5. **inarisk 0 resources** — InaRISK datasets expose 0 downloadable resources via the
   Action API; dropped as a tier. Avoid: check `num_resources`/`datastore_active`
   before adding a CKAN dataset to the fetch list.
6. **ArcGIS REST 500 server-side** — ArcGIS REST endpoints 500 on the server side;
   not retried, tier skipped. Avoid: treat 5xx as tier-failure (fall through),
   never as retry-storm; log and move on (`_ckan_get:433-446` pattern).
