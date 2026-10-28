# LEARNINGS — Phase 172.5: Regional News Tier

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**Add a labelled tier instead of weakening a precision gate.** After
Phase 172 measured that 149 of 150 rows were dropped, the tempting fix
was to relax the gate until more rows passed. That would have converted
a precise crisis signal into a noisy one for the sake of a fuller feed.
Instead, the rejected rows were given their own name — `TIER_REGIONAL` —
with its own admission rules and its own visual treatment.

The result is that "0 crisis" and "0 news" stopped being the same screen:
**0 crisis → 39 regional across 9 provinces.** Precision was preserved
and breadth was purchased with a label, not with a threshold.

## 2. Fixes tried (what worked, with file evidence)

1. **New tier, explicit ordering** — `TIER_REGIONAL` (`news_router.py:75`)
   and `RELEVANCE_TIERS = (TIER_CRISIS, TIER_REGIONAL, TIER_DROPPED)`
   (`:77`), so every row has a defined fate.
2. **Three-gate admission** — `is_regional_context` (`:184`) requires
   geocoding, age < 48 h (`:80`), and a topical match
   (`REGIONAL_TOPIC_KEYWORDS`, `:81`).
3. **Redundant guards** — five independent guards keep the crisis gate
   the only input to hazard and agent paths; `incidents.py` (+4) was
   touched specifically so aggregate accounting could not drift.
4. **Diagnostics kept honest** — `news_yield.py` (+27) and
   `news_aggregator.py` (+26) both learned the tier, so the yield report
   still sums to the input.
5. **Distinct rendering** — the frontend marks regional rows separately;
   the tier label is visible, not implied.

## 3. Concerns (open)

1. The visual distinction carries the whole semantic load. A restyle
   that merges the two row types would silently promote regional context
   to crisis context.
2. 48 h is a display bound; older rows are dropped, so "regional" is
   always a recent-regional claim, never an archive.
3. Five guards is redundancy by design. Removing one as "duplication"
   would reopen the path this phase closed.

## 4. Conditions (observed this window)

- A quiet day must still look like a working product, not a broken feed.
- Crisis precision is a safety property; it is not negotiable for
  engagement metrics.

## 5. Issues found (do not repeat)

1. "No rows" and "no crisis rows" were rendered identically — the same
   unknown-vs-zero confusion seen in Phases 167 and 172.
2. Adding a tier without teaching the diagnostics would have made the
   yield numbers stop reconciling; the aggregator and yield service had
   to change in the same commit.
3. A gate with ~99% rejection needs a named destination for rejects, or
   the rejected data becomes invisible rather than classified.

## 6. Environment constraints (this checkout)

- Windows + PowerShell. Backend interpreter is
  `backend/.venv/Scripts/python.exe`, not a bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; a build must run before e2e.
- Concurrent sessions share this checkout: never `git add -A` without
  authorisation; never kill port 3000 blindly.
- Free subagent model quota can be exhausted mid-run; keep a fallback
  model configured.
- Four backend tests fail at baseline: `test_impact_assessment`,
  `test_travel_fuel_guard` (×2), and
  `test_cpu_routing_weather::…seed_fallback`. Treat them as pre-existing.
