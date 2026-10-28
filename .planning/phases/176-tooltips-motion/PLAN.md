# PLAN — Phase 176: Branded Tooltips & Motion

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `57641f2` — `feat(m9-176): branded zone tooltips, overlay contract, purposeful motion`
**Diff size (verified):** 28 files, +1549/−265

## Objective

Make the two surfaces the palette phase could not reach: Mapbox popups
(rendered outside React, so unstyled by default) and every overlay
(modal, drawer, sheet). Popups get a branded, escaped HTML builder; all
overlays get one shared contract; motion becomes purposeful and
reduced-motion-aware instead of incidental.

## Scope IN

- **`frontend/components/map/mapPopup.ts`** — pure builders
  `buildWeatherPopup`, `buildFirmsPopup`, `buildFirmsClusterPopup`, with
  full HTML escaping (`escapeHtml`, `cap`, `formatNumber`) so any field
  is safe by construction.
- **`.ds-popup` contract** — one surface, 10px radius, 1px border, 12px
  type, label at 62% opacity, a hairline rule, footer at 38% opacity,
  max width 320px, no ornament.
- **Mapbox resets** — `.mapboxgl-popup-content` and `.mapboxgl-popup-tip`
  neutralised so the library's chrome does not show through.
- **Motion** — 120–300ms, `cubic-bezier(.4,0,.2,1)`; drawers slide;
  modals scale `.98 → 1`; exactly one 2.4s live pulse.
- **`prefers-reduced-motion`** disables all of it.
- **Overlay contract applied** to HITL, the route modal, the fleet
  drawer, and auth.

## Scope OUT

- No mobile layout repair — 176.5 handles the 390 defects, including the
  unstyled Mapbox close button this phase did not cover.
- No chrome/palette change (Phase 175).
- No data or backend change.

## Decisions locked

1. **Popups are strings, built by pure functions.** Testable without a
   map instance, and escaping is not optional at the call site.
2. **One popup anatomy.** Label / rule / footer positions are fixed, so
   weather, FIRMS point, and FIRMS cluster read as the same object.
3. **Motion has a budget.** 120–300ms, one easing curve, one live pulse
   on screen at a time; animation communicates state change, nothing
   else.
4. **Reduced motion is a hard off switch**, not a shortening.
5. **Overlays are one family.** HITL, route modal, fleet drawer, auth
   share the same surface/border/radius/motion rules.

## Risk notes

- Mapbox popups live outside React's tree; any styling must be global
  CSS. Local CSS-in-JS or module-scoped selectors will silently miss
  them.
- The library close button was left unstyled here and had to be fixed in
  176.5 — library chrome is part of the overlay contract, not an
  afterthought.
