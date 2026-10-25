# LEARNINGS — Phase 117: Analitik Simplification

## Issues found

1. **Spikes guard must explain the empty:** `spikeRecordsTotal < 3` renders a backend-guard sentence (`Hanya N catatan harga … spike butuh ≥ 3 catatan`), distinct from the no-spike sentence (`Tidak ada lonjakan ≥ 5% …`). A bare `AnalyticsEmpty` without the count reason reads as broken; the count is the diagnosis.
2. **Disparity empty → blank map:** an ops/disparity layer with zero valid rows produced a blank canvas with no status text. Deleting the overlay and keeping one honest status pill (`Visualisasi Aliran Komoditas Spasial`) beats an empty data layer every time.
3. **Telemetry safe-delete verified by e2e grep:** `corridorContext`/`activeRoutes` props are `void`-ignored (L114-116) with zero `GET`-beyond-prices/spikes. Verified by grepping `AnalyticsSection.tsx` for `fetch|POST|axios|WebSocket|EventSource` (no hits outside `api.commodities`) plus the E2E no-interference pass on Peta/Laporan/Evaluasi 403 paths.
4. **Same-file sequential edits avoid collisions:** P1/P3 taught this (duplicate bars healed via rename); this simplification landed as one serialized pass — filter bar, trend, spikes, canvas, reports link — with no parallel writers on the file.
5. **Stale `:3000` standalone vs fresh build:** a killed-but-cached `:3000` standalone server can show the pre-simplification surface (regime/freshness/ops) while `next dev` + fresh `npm run build` show the simplified 526-line tree. Kill `:3000` first; trust the fresh build, not the stale port.
6. **Root `npx tsc` shim vs frontend `tsc`:** the repo root `npx tsc --noEmit` shim resolves the frontend config; running `tsc` from `frontend/` with different flags can report a different file set. Standardize on root `npx tsc --noEmit` (exit 0 this window) for the evidence line.

## What not to repeat

- Do not re-add regime/freshness/telemetry/map-overlay/ops surfaces to Analitik without a new user note — the 6-note contract is the ceiling.
- Do not interpolate `< 3`-record series to "fill" the trend or spikes — `AnalyticsEmpty` is the complete render.
- Do not widen `GET`s beyond `prices`/`spikes` for display chrome; corridor/telemetry reads belong to Peta, not Analitik.

## Environment pitfalls

- Stale `.next` (`ENOENT`) can block rebuild verification — remove `.next` and retry (carried from Phase 116).
- `recharts` version pin (`^3.9.2`) is irrelevant here (no charts in simplified view) — do not reintroduce chart deps to justify removed overlays.
