# WALKTHROUGH — Phase 176.8: News Legibility & Cache

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** live card review + a stale geocode response.

## What was done

1. Read the `378e58d` diffstat: 7 files, +670/−30.
2. Fixed the clipped honesty label: the confidence value wraps onto a
   second line, and the truncating ancestor on that path is gone.
3. Fixed the guest banner covering the last card: the banner measures
   its own occlusion into a CSS variable and the feed reserves the
   space.
4. Bumped the geocode cache namespace to `v3`, with tests proving `v2`
   is never read.
5. Committed the `playwright.vercel.config.ts` `testMatch` and ignored
   the prod-only spec in the local config.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 378e58d` → `fix(m9-176.8): news card legibility, guest banner clearance, geocode cache v3` |
| Diff scope | 7 files, +670/−30 |
| Namespace is v3 | `geocode_router.py:35` → `GEOCODE_CACHE_VERSION = "v3"` |
| Keys are versioned | `lrip:geocode:search:{v3}:` and `lrip:geocode:reverse:{v3}:` prefixes |
| Why v2 was poison | in-file comment: 24h TTL outlived the deploy; `search?v2` kept returning `type:"regency"` after the vocabulary change |
| Config file present | `frontend/playwright.vercel.config.ts` exists |
| geo tests | 27 (reported) — **not re-run in this pass** |
| Full suite | 120 passed (reported) — **not re-run in this pass** |

## Before → after

| Surface | Before | After |
|---|---|---|
| `Belum terverifikasi` | clipped with `…` | wraps to a second line, no truncating ancestor |
| Last news card | covered by guest banner | feed reserves measured clearance |
| Geocode response | stale `regency` from `v2` for 24h | `v3` namespace; `v2` unread |
| Playwright config | prod-only spec ad-hoc | `testMatch` committed; local config ignores it |

## Deliberately NOT done (per scope)

- No change to feed supply; 176.7 owned that.
- No structural fix for the banner overlap — the reserved-space
  measurement is still in place here, and 176.9 replaces it.
- No commit, no push from this documentation pass.

## Handed to 176.9

The clearance was measured from the viewport while the mobile sheet
extended beyond it, so the banner still overlapped content by 17.6px and
the footer clipped. Measurement-based clearance is retired next phase in
favour of a flex column that makes overlap structurally impossible.
