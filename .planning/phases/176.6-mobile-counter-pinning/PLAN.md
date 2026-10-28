# PLAN — Phase 176.6: Mobile Counter Pinning

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `904c4fe` — `fix(m9-176.6): pin hazard counters on mobile`
**Diff size (verified):** 11 files, +493/−140

## Objective

On mobile the three hazard counters shared a horizontal scroller with
the legend toggles, so `Titik Panas` — one of the three primary metrics
— required a swipe to see. Pin the counters; move the toggles out of
their row.

## Scope IN

- **Pinned counters:** Cuaca / Waspada / Titik Panas become three equal
  pills that are visible at rest, not reachable by scrolling.
- **Second row:** legend and filters move to their own horizontally
  scrolling row beneath the counters.
- **Berita toggle:** gains a newspaper icon, `aria-label`, and
  `aria-expanded`.
- Mobile test coverage for the pinned row: 8 tests.

## Scope OUT

- No data change; counts are unchanged, only their placement.
- No change to desktop arrangement beyond what the shared component
  implies — **not verified in this phase** (the diff was not read
  file-by-file in this pass).
- No work on the counter *label* truncation; that surfaces in 176.10.

## Decisions locked

1. **Primary metrics are pinned, secondary controls scroll.** Sharing
   one scroller between "what is happening" and "what am I filtering"
   was the defect.
2. **Three equal pills.** Equal width means position is stable, so a user
   can learn where Titik Panas is and hit it without reading.
3. **The Berita toggle states its own state.** `aria-label` plus
   `aria-expanded` means assistive tech knows whether the sheet is open;
   an icon alone does not.
4. **Icons need an accessible name.** The newspaper icon is paired with
   a label, never used as the sole name.

## Risk notes

- Pinning three pills consumes fixed width at 390; the labels inside them
  are still tight, which is exactly why 176.10 has to stack the label
  above the number.
- A second scroll row is still a scroll row: any future "primary" metric
  added to the toggle row repeats this bug.
