# PLAN — Phase 167: World-Truth Hazard Counters

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `51b3903` — `feat(m8-160): world-truth hazard counters independent of layer toggles`

## Objective

Make the top-nav hazard counters describe the world instead of the
screen. Before this phase the counts were derived from whatever hazard
layer the operator happened to have toggled on, and a backend render
cap truncated the number on top of that.

## Scope IN

- Contract (`frontend/lib/api.ts`, `frontend/lib/types.ts`): new
  `getWeatherSummary()` and `WeatherSummary` types carrying per-bucket
  `count`, `total`, `status`.
- `frontend/components/dashboard/TopNavTelemetry.tsx`: counters read the
  summary contract; nothing reads `advisoryFeatures.length` any more.
- `frontend/components/dashboard/DashboardClient.tsx`: the
  `advisoryFeatures = showWeatherAdvisory ? ... : []` expression is
  demoted to layer drawing only; it no longer feeds a badge.
- Backend (`backend/app/routers/routing_router.py`):
  `GET /api/v1/weather/summary` with a tri-state envelope
  (`ok` | `stale` | `degraded` | `empty`), `cuaca` bucketed to
  high/critical, `waspada` to medium, totals uncapped.
- `backend/app/services/weather_fusion_service.py`: one inventory feeds
  both the polygon renderer and the summary; `MAX_WEATHER_FEATURES = 24`
  is a render cap, never a count cap.
- Tests: `backend/tests/test_weather_summary_contract.py`,
  `frontend/e2e/hazard-counter-truth.spec.ts`.

## Scope OUT

- No change to hazard thresholds, scoring, or fusion arithmetic.
- No map-layer behaviour change: the toggle still shows/hides polygons.
- No tenancy, auth, or navigation work.

## Decisions locked

1. A counter is a claim about the world; a toggle is a claim about the
   screen. They must never share a variable.
2. Truncation belongs to rendering. A `24` cap may limit how many
   polygons are drawn, not how many events are reported.
3. Degraded is not zero. When the upstream is unreachable the count is
   `null` and renders as `—`; `0` is reserved for a verified empty world.
4. `cuaca` and `waspada` are separate buckets with separate severities;
   the header must show both without summing them into one ambiguous
   number.

## Risk notes

- The `status` field is now load-bearing for the UI: anything that
  serialises a summary without it produces a visible `—`, which is the
  correct failure mode but easy to mistake for a backend outage.
- `MAX_WEATHER_FEATURES` still exists and still truncates the polygon
  payload. A future reader who conflates the two numbers will
  re-introduce this bug.
