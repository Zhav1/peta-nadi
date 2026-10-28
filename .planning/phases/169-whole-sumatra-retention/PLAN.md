# PLAN — Phase 169: Whole-Sumatra Retention

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `ef0148a` — `feat(m9-169): whole-Sumatra coverage, stale-while-revalidate, freshness badges`

## Objective

Restore visual and factual coverage of the whole island. Three separate
filters were each individually defensible and together produced a map
where most provinces had no weather at all.

## Scope IN

- `backend/app/adapters/open_meteo_adapter.py`: grid grown **23 → 58
  points**, sized for **≥ 4 points per province** across the 10 Sumatra
  provinces.
- Removed the corridor land-mask: `_CORRIDOR_SPINE` is now **ordering
  only**. It previously *filtered* zones outside the spine.
- Removed `GRID_KEEP_RADIUS_KM = 60`, which had been dropping every grid
  point more than 60 km from the corridor.
- `backend/app/services/weather_fusion_service.py` and
  `backend/app/routers/routing_router.py`: shared snapshot so the polygon
  and summary paths read one inventory.
- `backend/app/services/retention.py` (new): stale-while-revalidate
  policy — **600 s refresh / 6 h validity / 24 h ceiling**.
- `frontend/components/dashboard/FreshnessBadge.tsx` (new) plus
  `DashboardClient.tsx` / `TopNavTelemetry.tsx`: freshness badges and an
  explicit capped notice.
- Tests: `backend/tests/test_weather_retention_coverage.py`,
  `frontend/e2e/weather-freshness.spec.ts`.

## Scope OUT

- No change to BMKG ingestion or fusion scoring.
- No new upstream provider.
- No change to the hazard counter contract established in 167.

## Decisions locked

1. **A "priority" list must never become a filter.** The corridor spine
   exists to order requests, not to exclude territory.
2. A cache TTL equal to the poll interval is a bug, not a tuning choice:
   the layer disappears in the gap.
3. Coverage is a contract with a number attached — ≥ 4 points per
   province, verifiable in a test.
4. Every served snapshot must state its age. Freshness is part of the
   payload, not a footnote.

## Measured effect

- Shared snapshot reduced Open-Meteo usage from **16,704 to 8,352
  metered calls/day**.
- `MAX_WEATHER_FEATURES = 24` still caps rendering; the cap is now
  surfaced in the UI as a notice rather than being silently applied.

## Risk notes

- 58 points per poll is a bigger payload than 23. The call saving comes
  from sharing one snapshot, not from shrinking the grid; removing the
  snapshot would multiply the new cost by the number of consumers.
