# PLAN — Phase 176.10: Mobile Counter Label

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `63b0ad2` — `fix(m9-176.10): stack mobile counter labels so Titik Panas is never truncated`
· merge `fe4c876` — `fix: mobile counter labels`
**Diff size (verified):** `63b0ad2` — 2 files, +153/−8

## Objective

On mobile the counter read `Titik Pa…`. The pill could not fit the label
at its pinned width, and truncation had been accepted as the outcome.
Change the layout so the full label fits.

## Scope IN

- Below `md`, stack **label above number**: a grid with the dot in column
  1, the label in column 2 row 1, and the number in row 2.
- Desktop unchanged.
- Live verification: `scrollWidth` / `clientWidth` = **99 / 99** for all
  three counters, i.e. the label fits with zero overflow; accessible
  names are exact.

## Scope OUT

- No wording change — `Titik Panas` stays `Titik Panas`.
- No font-size reduction to force a fit.
- No change to the counter values, the pinned row, or the data source
  (Phase 176.6 owns the row).
- Desktop re-layout — **not verified in this phase**; the change is
  scoped below `md`.

## Decisions locked

1. **If a primary label cannot fit, change the layout, not the
   wording.** Renaming a hazard class to save pixels is a semantic
   regression for a cosmetic gain.
2. **Stack, don't shrink.** Label on one line above the number gives the
   label the full pill width instead of competing with the numeral.
3. **Fit is measured, not eyeballed.** `scrollWidth === clientWidth` at
   99px on all three pills is the acceptance criterion.
4. **Accessible names are exact.** Visual restructuring must not alter
   what a screen reader announces.

## Risk notes

- Two-line counters are taller than one-line counters; that height
  change interacts with the surrounding pinned row and must be re-checked
  at every width where the grid applies.
- The grid is expressed with explicit column/row placement, so a copy of
  the pattern elsewhere must carry the same placement rules.
