# WALKTHROUGH — Phase 176: Branded Tooltips & Motion

**Mode:** docs-only record of built work; read-only inspection this pass.

## What was done

1. Read the `57641f2` diffstat: 28 files, +1549/−265.
2. Built `frontend/components/map/mapPopup.ts` as pure, escaped HTML
   builders: `buildWeatherPopup`, `buildFirmsPopup`,
   `buildFirmsClusterPopup`, plus shared `escapeHtml` / `cap` /
   `formatNumber` helpers. Verified in-file: every interpolated value
   passes through `escapeHtml`, and text fields are clipped by `cap`
   (default 120, footer 64) before escaping.
3. Styled `.ds-popup` per the contract: one surface, 10px radius, 1px
   border, 12px type, label 62%, hairline rule, footer 38%, max 320px.
4. Reset Mapbox's own chrome: `.mapboxgl-popup-content`,
   `.mapboxgl-popup-tip`.
5. Added the motion budget: 120–300ms on
   `cubic-bezier(.4,0,.2,1)`; drawers slide; modals scale `.98 → 1`;
   one 2.4s live pulse.
6. Added `prefers-reduced-motion` handling that disables the set.
7. Applied the overlay contract to HITL, route modal, fleet drawer, and
   auth.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 57641f2` → `feat(m9-176): branded zone tooltips, overlay contract, purposeful motion` |
| Diff scope | 28 files, +1549/−265 |
| Builders exist | `mapPopup.ts` exports `buildWeatherPopup`, `buildFirmsPopup`, `buildFirmsClusterPopup` |
| Escaping is systematic | every interpolation in the file is wrapped in `escapeHtml` |
| Popup contract values | file header: surface `#0c1017`, 10px radius, one hairline border, label 62%, footer 38%, max 320px |
| Targeted specs | 13 (reported) — **not re-run in this pass** |
| Full suite | 106 passed (reported) — **not re-run in this pass** |
| XSS payloads render as text | reported — **not re-executed in this pass** |

## Deliberately NOT done (per scope)

- No layout/mobile repair; the 390 defects found next phase include the
  Mapbox close button left unstyled here.
- No palette change; 175 owned chrome.
- No commit, no push from this documentation pass.

## Handed to 176.5

Screenshot review at 390 found the Mapbox close button rendered as an
unstyled white square. It is the visible symptom of the boundary this
phase documented: library-injected chrome is part of the overlay
contract and must be reset explicitly.
