# WALKTHROUGH — Phase 176.6: Mobile Counter Pinning

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** on mobile, `Titik Panas` was not visible without a swipe.

## What was done

1. Read the `904c4fe` diffstat: 11 files, +493/−140.
2. Separated the two concerns that had been sharing one horizontal
   scroller: the hazard counters and the legend/filter toggles.
3. Pinned Cuaca / Waspada / Titik Panas as three equal-width pills,
   visible at rest.
4. Moved legend and filters into a second, independently scrolling row
   beneath the counters.
5. Gave the Berita toggle a newspaper icon plus `aria-label` and
   `aria-expanded`.
6. Added 8 mobile tests covering the pinned row.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 904c4fe` → `fix(m9-176.6): pin hazard counters on mobile` |
| Diff scope | 11 files, +493/−140 |
| Mobile tests | 8 (reported) — **not re-run in this pass** |
| Full suite | 116 passed (reported) — **not re-run in this pass** |
| Prior phase base | `95fc6a1` (mobile layout, close-button chrome) present in history |

## Before → after

| Element | Before | After |
|---|---|---|
| Cuaca / Waspada / Titik Panas | inside a shared scroller with toggles; Titik Panas needed a swipe | three equal pills pinned at rest |
| Legend + filters | same row as counters | second scrolling row below |
| Berita toggle | unlabelled icon toggle | newspaper icon + `aria-label` + `aria-expanded` |

## Deliberately NOT done (per scope)

- No change to the counter values or their data source.
- No label-truncation fix — `Titik Pa…` is still possible here and is
  handled explicitly in Phase 176.10.
- Desktop arrangement not re-verified in this pass.
- No commit, no push from this documentation pass.

## Open thread handed to 176.10

Pinning gave the three counters a fixed, narrow width. The label inside
each pill then had to fit that width, and `Titik Panas` did not: the live
label read `Titik Pa…`. That is a layout-vs-wording problem, solved in
176.10 by stacking label above number below `md`.
