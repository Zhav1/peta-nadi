# WALKTHROUGH — Phase 176.10: Mobile Counter Label

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** on mobile the counter read `Titik Pa…`.

## What was done

1. Read the `63b0ad2` diffstat: 2 files, +153/−8 — a small, targeted
   layout change.
2. Below `md`, switched the counter to a stacked grid: dot in column 1,
   label in column 2 row 1, number in row 2.
3. Left desktop untouched.
4. Verified live that all three labels fit: `scrollWidth` /
   `clientWidth` = **99 / 99** for each of the three counters.
5. Verified accessible names are exact — the visual restructure did not
   change what is announced.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Fix commit exists | `git log -1 63b0ad2` → `fix(m9-176.10): stack mobile counter labels so Titik Panas is never truncated` |
| Merge commit exists | `git log -1 fe4c876` → `fix: mobile counter labels` |
| Diff scope | 2 files, +153/−8 |
| Label now fits | live check, `scrollWidth`/`clientWidth` 99/99 for all three — reported, **not re-measured in this pass** |
| Accessible names exact | reported — **not re-asserted in this pass** |
| Targeted specs | 27 (reported) — **not re-run in this pass** |
| Pinned row origin | `904c4fe` (176.6) present in history |

## Before → after

| Surface @<`md` | Before | After |
|---|---|---|
| Counter label | `Titik Pa…` | `Titik Panas` on its own line |
| Arrangement | single line, label competing with number | dot col 1 · label col 2 row 1 · number row 2 |
| Fit check | none | `scrollWidth === clientWidth` (99/99) |
| Desktop | — | unchanged |
| Accessible name | — | exact, unchanged |

## Deliberately NOT done (per scope)

- No wording change; the label was never the problem.
- No font shrink — that would have "fixed" the fit and worsened
  legibility at the size the app already treats as a floor.
- Desktop re-verification not performed in this pass.
- No commit, no push from this documentation pass.

## Why the phase is two files

The defect was one component's internal layout plus its coverage. The
temptation was to widen the pill, shrink the type, or rename the metric;
all three are changes to something other than the thing that was wrong.
