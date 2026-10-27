# PLAN — Phase 148: Metrics Keputusan Split

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the laporan-metrics slice: `Keputusan` strip
(`Lanjut` / `Ubah Rute` / `Tahan`), `Hemat` split
(`BBM • Tol • Susut • Sopir`), and `Efisiensi armada` footer —
all frontend-only over existing fields.

## Scope IN (this folder only)

- Keputusan strip counts (3 buckets).
- Hemat split row (4 components, sum ≈ total).
- Fleet-efficiency footer (avg km/L + measured/unmeasured counts).

## Scope OUT

- No new fields, no math change, no API change.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. Frontend-only: every number derives from already-persisted fields.
2. Hemat split components sum to the displayed total (single rounding point).
3. Footer shows measured/unmeasured split so the avg km/L is auditable.
