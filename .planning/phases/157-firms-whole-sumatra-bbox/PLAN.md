# PLAN — Phase 157: FIRMS Whole-Sumatra BBox

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `1668222`

## Objective

Record the FIRMS scope change: whole-Sumatra bbox (`94,-6,108,6`) as the
only geo gate — the 20 km corridor-distance drop is removed;
HIGHWAY_SPINE survives as nearest-segment provenance only.

## Scope IN

- Parser (`nasa_firms_adapter.py:98-135`): bbox check only; "NEVER drop
  by distance"; spine loop kept for `dist_to_corridor_km` /
  `near_segment` provenance (hotspot click contract).
- Kept: confidence==low drop, 24 h dedup, FRP severity mapping
  (>500 critical; >100 or <5 km high; else medium), Redis 3 h cache.
- Endpoint (`routing_router.py:141-265`): whole-Sumatra docstring; cap
  500 by FRP desc; `status=ok` always (empty-healthy = `total=0`,
  "no active hotspots in Sumatra window"); honest-degraded when
  `NASA_FIRMS_MAP_KEY` missing (200 + `status=degraded`, never 500/never
  fake points).
- Radius-area mapping kept: critical 5 km / high 2.5 km / medium 1 km.

## Scope OUT

- No clustering change (Phase 153); no commit/push.

## Decisions locked (from diff + code reads)

1. Bbox is the only geo gate; distance is provenance, never a filter.
2. Degraded = honest empty (200), never synthetic points.
3. `NASA_FIRMS_MAP_KEY` is Render backend-only (never Vercel frontend).
