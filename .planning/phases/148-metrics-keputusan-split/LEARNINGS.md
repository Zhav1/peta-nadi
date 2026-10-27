# LEARNINGS — Phase 148: Metrics Keputusan Split

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **`Keputusan` strip** — `Lanjut` / `Ubah Rute` / `Tahan` counts from
   existing decision fields; empty-state copy when zero.
2. **`Hemat` split** — `BBM • Tol • Susut • Sopir` components derived
   from persisted savings fields; single rounding point so split ≈ total.
3. **Fleet-efficiency footer** — avg km/L with measured/unmeasured
   Trip counts so the average is auditable.

## 2. Concerns (open, evidenced)

1. Split ≈ total only if rounding happens once at the component
   boundary; per-component rounding reintroduces drift.
2. Avg km/L without the measured/unmeasured counts nearby re-creates
   the Phase 144 misleading-average problem.

## 3. Constraints (observed this window)

- Never break E2E/API shapes: no new fields; frontend derives only.
- Subagents-only to protect main context; no default subagent — High only.
- Display slice: no math-formula or contract change.

## 4. Conditions (environment this window)

- Roles: Dispatcher/Regulator see full strips; Guest sandbox preview.
- Honest-empty: zero decisions render empty-state copy, never `0` as insight.
- Graceful fallback: missing component renders `Belum tersedia`, never zero.

## 5. Issues found (do not repeat)

1. Duplicate double-submit: strips must not refetch-and-double-count
   on rapid re-render — memoize counts.
2. Placeholder drift: N/A to strips but surrounding forms keep `cth. 25`.
3. Stale `.next/standalone` can serve the pre-split single-total layout.
4. Render cold start can flash unsplit totals from cache.
5. Redis has no invalidation tool for strip aggregates — version keys.
6. 5 pre-existing `system_audit` fails unrelated to this slice.
