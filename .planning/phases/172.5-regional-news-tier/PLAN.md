# PLAN — Phase 172.5: Regional News Tier

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `269324c` — `feat(m9-172.5): regional news tier for honest province breadth`

## Objective

Create province breadth without touching the gate that produces it.
Phase 172 measured that **149 of 150** newest articles were dropped by
the crisis gate, so no quota could manufacture breadth from what
survived. This phase adds a second, clearly labelled display tier for the
rows the gate rejects.

## Scope IN

- `backend/app/routers/news_router.py` (+218): new `TIER_REGIONAL`
  (`:75`) and `RELEVANCE_TIERS = (TIER_CRISIS, TIER_REGIONAL, TIER_DROPPED)`
  (`:77`).
- Admission rule (`is_regional_context`, `:184`): the article must be
  **geocoded**, younger than **48 h** (`REGIONAL_MAX_AGE_HOURS`, `:80`),
  and match a **broad logistics/weather topic**
  (`REGIONAL_TOPIC_KEYWORDS`, `:81`).
- `backend/app/services/news_yield.py` (+27) and
  `news_aggregator.py` (+26): the diagnostic and aggregator learn the new
  tier.
- `backend/app/routers/incidents.py` (+4): guard so progress/relevance
  accounting does not silently regress.
- Frontend (`components/dashboard/DashboardClient.tsx`,
  `hooks/useNewsVerification.ts`, `lib/types.ts`): regional rows are
  visually distinct from crisis rows.
- Tests: `backend/tests/test_news_tiers.py` (new, 386 lines),
  `frontend/e2e/news-honesty-breadth.spec.ts` (+149).

## Scope OUT

- **The crisis gate is unchanged.** Precision is not traded for volume.
- No new source, no ingestor change.
- No regional row may enter hazard or agent paths.

## Decisions locked

1. **Add a labelled tier instead of weakening a precision gate.** The
   gate is correct; the display was incomplete.
2. A regional row is *display context*, not a crisis claim — the tier
   name carries that meaning to both the UI and the API consumer.
3. **Five independent guards** keep the crisis gate the only input to
   hazard/agent paths. Redundancy here is deliberate: one missing guard
   would turn a soft display tier into a safety input.
4. Breadth has a floor: geocoded + < 48 h + topical. Ungeocoded or stale
   rows do not qualify.

## Measured result

- **0 crisis rows → 39 regional rows across 9 provinces.** The feed now
  has honest breadth while the crisis set remains empty, which is the
  correct reading of a quiet day.

## Risk notes

- A reader who ignores the tier label will over-read "regional" as
  "crisis-adjacent". The visual distinction is load-bearing.
- 48 h is a display window; anything older is dropped, not aged out
  silently into another tier.
