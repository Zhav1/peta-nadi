# WALKTHROUGH — Phase 176.9: Guest Banner Dock

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** residual 17.6px overlap and a clipped footer on mobile.

## What was done

1. Read the `92b2adc` diffstat: 8 files, +163/−17 — a fix that mostly
   deletes.
2. Removed the floating guest banner.
3. Rebuilt Berita as a flex column in both containers: header → filters
   → `min-h-0` scroll list → docked banner → footer. The desktop panel
   and the mobile sheet now share one ordering.
4. Deleted the `ResizeObserver` and `--guest-banner-clearance` padding
   machinery that 176.8 had introduced.
5. Merged via `6db893a`; gate commit `fa2edc9` carries the same change
   message through the gate.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Fix commit exists | `git log -1 92b2adc` → `fix(m9-176.9): dock guest banner in news panel, fix mobile sheet overflow` |
| Merge commit exists | `git log -1 6db893a` → `fix: M9 final layout - docked guest banner, mobile sheet overflow` |
| Gate commit exists | `git log -1 fa2edc9` → same message |
| Diff scope | `92b2adc` — 8 files, +163/−17 |
| Machinery is gone | `GuestEvaluationBanner.tsx:19`: "`--guest-banner-clearance` measurement (ResizeObserver + padding) is gone." |
| Full suite | 121 passed (reported) — **not re-run in this pass** |
| 17.6px residual overlap | reported measurement from 176.8's approach — **not re-measured in this pass** |

## The mechanism, stated precisely

176.8 computed clearance as *banner height + padding, relative to the
viewport*. On mobile the sheet is taller than the viewport and scrolls
independently, so the reference box was wrong; 17.6px of content stayed
under the banner and the footer was pushed out of the visible area.

176.9 removes the reference box entirely. In a flex column the banner is
a sibling that consumes space, and the list is `min-h-0` so it shrinks
instead of overflowing. There is no number to get wrong.

## Deliberately NOT done (per scope)

- No copy or CTA change to the banner.
- No feed supply change.
- No replacement measurement (e.g. a second observer); the deletion is
  the deliverable.
- No commit, no push from this documentation pass.

## Carried into 176.10

The panel now behaves; the *counter* labels are still constrained by
their pill width, and `Titik Panas` still renders as `Titik Pa…` on
mobile. That is the next phase's subject and a different class of fix —
layout of the label, not of the panel.
