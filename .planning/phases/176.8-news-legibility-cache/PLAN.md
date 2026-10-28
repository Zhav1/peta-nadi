# PLAN — Phase 176.8: News Legibility & Cache

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `378e58d` — `fix(m9-176.8): news card legibility, guest banner clearance, geocode cache v3`
**Diff size (verified):** 7 files, +670/−30

## Objective

A live card review found two honesty/legibility failures on screen, and
a cache review found that a corrected response contract was still being
served from the *previous* contract for 24h. Fix the cards, fix the
clearance, invalidate the stale namespace.

## Scope IN — what the live review found

1. The honesty label `Belum terverifikasi` was clipped with an ellipsis.
2. The guest banner covered the last news card.
3. Geocode still served a stale `regency` payload from a `v2` Redis key
   for up to 24h after the vocabulary change.

## Scope IN — the fixes

- Confidence value **wraps to a second line**; no truncating ancestor
  remains on that path.
- The banner **measures its occlusion into a CSS variable** and the feed
  reserves that space.
- Cache namespace bumped to **`v3`**; tests prove `v2` is never read.
  Verified in `backend/app/routers/geocode_router.py`:
  `GEOCODE_CACHE_VERSION = "v3"`, with versioned search and reverse
  prefixes, and a comment stating the TTL is 24h and outlives a deploy.
- `playwright.vercel.config.ts` `testMatch` committed; the prod-only spec
  ignored in the local config.

## Scope OUT

- No change to which news items are fetched (Phase 176.7).
- No redesign of the panel's internal layout ordering — the banner is
  still a floating overlay in this phase, which is exactly what 176.9
  removes.
- No backend vocabulary change; only invalidation.

## Decisions locked

1. **Honesty labels are never truncated.** `Belum terverifikasi` is a
   claim about evidence; ellipsising it converts a confidence statement
   into noise.
2. **Measured clearance is better than guessed padding**, for now — the
   banner reads its own occlusion into a CSS variable the feed consumes.
3. **A changed response contract gets a new cache namespace.** Never
   overwrite, never reuse: bump the version segment and never read an
   older one.
4. **Local and production Playwright configs differ deliberately.** A
   prod-only spec must be ignored locally rather than skipped ad-hoc.

## Risk notes

- The CSS-variable clearance is still a measurement, and 176.9 proves it
  wrong by 17.6px once the mobile sheet extends past the viewport. It is
  replaced by layout structure next phase.
- Bumping a namespace orphans the old keys until TTL expiry; orphaned
  entries are cheaper than stale answers.
