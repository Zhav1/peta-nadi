# WALKTHROUGH — Phase 176.5: Mobile Map Legibility

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** screenshot review at 390 — not a failing test.

## What was done

1. Read the `95fc6a1` diffstat: 21 files, +717/−82.
2. Replaced the text tab row with icon nav plus an overflow affordance
   below `xl`, so the active tab ("Peta") stops overflowing its pill.
3. Stopped counter pills from being cut mid-pill.
4. Turned the Berita panel into a closed-by-default bottom sheet at
   small widths, so it no longer consumes nearly the full width.
5. Made the dock wrap instead of overflow.
6. Repainted the map — land `#0d1219`, water `#070a10`, coastline at 6%
   — restoring separation that the 175 palette pass had flattened.
7. Gave the Mapbox popup close button real chrome; it had been an
   unstyled white square.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 95fc6a1` → `fix(m9-176.5): mobile layout, map legibility, popup chrome` |
| Diff scope | 21 files, +717/−82 |
| Targeted specs | 19 (reported) — **not re-run in this pass** |
| Full suite | 112 passed (reported) — **not re-run in this pass** |
| Popup builder from 176 | `frontend/components/map/mapPopup.ts` present |
| Prior palette contract | `DESIGN.md` "Distilled Command Surface" (174) |

## Before → after

| Surface @390 | Before | After |
|---|---|---|
| Nav | active "Peta" clipped out of its pill | icon nav + overflow below `xl` |
| Counters | cut mid-pill | intact pills |
| Berita panel | ~full width | closed-by-default bottom sheet |
| Dock | overflowed | wraps |
| Map | land/water contrast ≈ 0 | land `#0d1219`, water `#070a10`, 6% coastline |
| Popup close | unstyled white square | styled chrome |

## Deliberately NOT done (per scope)

- No counter-pinning work; 176.6 finds that the hazard counters still
  sit behind a horizontal scroller.
- No change to the news feed content or supply.
- No commit, no push from this documentation pass.

## What this phase proves about evidence

The suite was green (112 passing) while six visible defects were on
screen. The signal that found them was a rendered screenshot at the
width a user actually holds. Green tests bound behaviour; they do not
bound layout.
