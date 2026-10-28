# WALKTHROUGH — Phase 175: Chrome Distillation

**Mode:** docs-only record of built work; read-only inspection this pass.

## What was done

1. Read the `cf2a1bb` diffstat: 9 files, +815/−507 — the deletions are
   the point; more colour was removed than added.
2. Collapsed the five-hue counter pill set into one neutral recipe, with
   a white active state.
3. Collapsed the eight-hue legend to hazard hues; the remaining
   distinctions moved to monochrome shape glyphs and text labels.
4. Made active tabs white instead of accent-tinted.
5. Reduced map paint to the sanctioned Phase 174 palette.
6. Captured before/after at 1920 and 390 for review.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 cf2a1bb` → `feat(m9-175): distilled dashboard chrome and map paint` |
| Diff scope | 9 files, +815/−507 |
| Targeted specs | 21 (reported) — **not re-run in this pass** |
| Full suite | 101 passed (reported) — **not re-run in this pass** |
| Before/after captures | at 1920 and 390 (reported) — **not re-inspected in this pass** |
| Prior contract exists | `DESIGN.md` "Distilled Command Surface" (Phase 174, `1f5485c`) |

## What changed, in one line each

- Pills: five hues → one neutral recipe, white when active.
- Legend: eight hues → hazard hues + shape/label glyphs.
- Tabs: accent tint → white.
- Map: free paint → sanctioned palette.
- Screens: two widths captured, before and after.

## Deliberately NOT done (per scope)

- No popup/tooltip work; Mapbox defaults stood until Phase 176.
- No breakpoint or mobile layout fixes.
- No motion, no `prefers-reduced-motion` handling.
- No commit, no push from this documentation pass.

## Open thread handed to 176.5

Screenshot review in the next phase found that at 390 the active tab
clipped, counters were cut mid-pill, the Berita panel took nearly the
full width, the dock overflowed, the Mapbox close button was an
unstyled white square, and land/water contrast was near zero. Those are
**not** regressions introduced here — the layout was never exercised at
that width — but the before/after capture in this phase did not catch
them, which is the evidence gap 176.5 records.
