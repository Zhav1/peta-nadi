# PLAN — Phase 176.5: Mobile Map Legibility

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `95fc6a1` — `fix(m9-176.5): mobile layout, map legibility, popup chrome`
**Diff size (verified):** 21 files, +717/−82

## Objective

Screenshot review at 390px wide found defects the test suite did not
see. Fix them, and restore land/water separation on the map, which the
Phase 175 palette reduction had flattened to near-zero contrast.

## Scope IN — the defects found

1. The active tab clipped at 390 — "Peta" overflowed its pill.
2. Counter pills were cut mid-pill.
3. The Berita panel occupied nearly the full width.
4. The bottom dock overflowed.
5. The Mapbox close button rendered as an unstyled white square.
6. Land/water contrast was near zero on the map.

## Scope IN — the fixes

- Icon-based nav with overflow below the `xl` breakpoint instead of a
  row of text pills that cannot shrink.
- Berita becomes a **closed-by-default bottom sheet** at small widths.
- The dock wraps instead of overflowing.
- Map repainted: land `#0d1219`, water `#070a10`, coastline at 6%
  opacity — contrast restored inside the sanctioned palette.
- Popup close button given explicit chrome (follow-up to the Phase 176
  gap).

## Scope OUT

- No change to the counter data model or the news feed.
- No desktop redesign; the breakpoint work is scoped below `xl`.
- No new palette values beyond the map's land/water/coastline set.

## Decisions locked

1. **A viewport this narrow cannot hold a text nav row.** Icons plus an
   overflow affordance is the layout, not a fallback.
2. **Secondary panels start closed.** Berita as a bottom sheet means it
   costs zero width until asked for.
3. **Wrapping beats clipping.** The dock wraps; nothing is truncated
   mid-pill.
4. **Map contrast is a legibility requirement, not a taste call.**
   Land `#0d1219` vs water `#070a10` with a 6% coastline stroke.
5. **Library chrome is in scope.** The Mapbox close button is styled
   like any other control.

## Risk notes

- A closed-by-default Berita panel changes the first-glance information
  diet on mobile: news is one tap away, not visible at rest. Accepted
  for this phase; 176.6 immediately revisits what *must* be visible at
  rest (counters), and 176.9 reworks the panel's internal structure.
- Below-`xl` overflow nav can hide a destination; the overflow control
  must remain reachable at every width it applies to.
