# LEARNINGS — Phase 157: FIRMS Whole-Sumatra BBox

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **20 km→bbox lesson** — the 20 km corridor-distance drop silently
   discarded off-corridor fires; bbox `94,-6,108,6` keeps full-island
   recall with no distance filter.
2. **Provenance preserved** — spine loop retained for the hotspot click
   contract instead of being deleted with the filter.
3. **Map-protecting cap** — 500 by FRP desc bounds render cost without
   a geo drop.

## 2. Concerns (open, evidenced)

1. Whole-island scope raises hotspot volume; map cap + clustering
   (Phase 153) absorb it, but watch low-end devices.
2. `NASA_FIRMS_MAP_KEY` missing → degraded gray toggle; operators need
   the 'butuh MAP_KEY' tooltip copy kept accurate.

## 3. Constraints (observed this window)

- Render `NASA_FIRMS_MAP_KEY` backend-only; never expose to Vercel
  frontend env.
- `status=ok` with `total=0` is healthy-empty, not degraded.

## 4. Conditions (user-stated this window)

- Koridor Preserve (ships/planes) is orthogonal — see Phase 158.

## 5. Issues found (do not repeat)

1. Distance-to-corridor as a *filter* loses island-wide fires — use it
   as *provenance* only.
2. Never return 500 or synthetic points for a missing MAP_KEY.
