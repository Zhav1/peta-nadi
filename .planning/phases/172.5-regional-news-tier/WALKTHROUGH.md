# WALKTHROUGH — Phase 172.5: Regional News Tier

**Mode:** docs-only. Source and tests untouched. Test counts are those
recorded for `269324c`; they were **not re-run** in this pass.

## What was done

1. Read the `269324c` diff (10 files, +908/−28).
2. Confirmed the tier constants in `news_router.py`: `TIER_REGIONAL`
   (`:75`), `RELEVANCE_TIERS = (TIER_CRISIS, TIER_REGIONAL, TIER_DROPPED)`
   (`:77`).
3. Confirmed the admission predicate `is_regional_context` (`:184`) and
   its three gates: geocoded, `REGIONAL_MAX_AGE_HOURS = 48` (`:80`), and
   `REGIONAL_TOPIC_KEYWORDS` (`:81`).
4. Confirmed the crisis gate was not edited for leniency; the change
   adds a tier beside it.
5. Confirmed guard coverage by reading the touched surfaces —
   `news_router.py`, `news_yield.py`, `news_aggregator.py`, and a small
   guard edit in `incidents.py` — five independent guards in total, per
   the phase record.
6. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Tier exists | `TIER_REGIONAL` at `news_router.py:75` |
| Tier ordering includes it | `RELEVANCE_TIERS` at `news_router.py:77` |
| Age bound | `REGIONAL_MAX_AGE_HOURS = 48` (`:80`) |
| Topic bound | `REGIONAL_TOPIC_KEYWORDS` (`:81`), matched via `_REGIONAL_TOPIC_RE` |
| Admission function | `is_regional_context(...)` at `:184` |
| Crisis gate unchanged | no leniency edit to the gate in this diff |
| Guard surfaces | `news_router.py`, `news_yield.py`, `news_aggregator.py`, `incidents.py` (+4) |
| Tier tests | `backend/tests/test_news_tiers.py` (386 lines, new) |
| Browser test extended | `frontend/e2e/news-honesty-breadth.spec.ts` (+149) |
| Outcome | 0 crisis → 39 regional across 9 provinces — *recorded* |
| pytest | 50 passed — *recorded* |
| Playwright | 11 passed — *recorded* |

## Shape of the change

```
before:  150 newest ──> crisis gate ──> keep ──> feed
                                  └──> DROP  (149 of 150, unseen)

after:   150 newest ──> crisis gate ──> TIER_CRISIS ──> feed (hazard/agent input)
                                  └──> is_regional_context?
                                          geocoded ∧ <48h ∧ topical
                                          └─ yes ──> TIER_REGIONAL ──> feed (display only)
                                          └─ no  ──> TIER_DROPPED
```

## Deliberately NOT done

- No re-run of pytest or Playwright in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No relaxation of the crisis gate, and no promotion of regional rows
  into hazard or agent paths — both are explicit non-goals of the phase.
