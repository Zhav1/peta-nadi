# LEARNINGS — Phase 112: Watermelon Chrome P1

## Issues found

1. **P1/P3 same-file overwrite:** concurrent edits to `AnalyticsSection.tsx` collided (P3 polish overwrote P1 chrome); healed via `corridorFilter` rename + re-apply. Serialize edits per file.
2. **`asChild` vs render-prop warning:** base-ui trigger components warn when child composition mismatches — lock the `PopoverTrigger asChild > Button` pattern and do not improvise wrappers (carried to Phase 115).
3. **Portal-over-Mapbox clipping:** Portals render under/over WebGL canvas unpredictably — rule confirmed: no Portal/Popover over the Mapbox canvas (L1130).

## What not to repeat

- Do not run chrome (P1) and polish (P3) edits to the same file concurrently — sequence them.
- Do not add bespoke badge/button divs once base-ui primitives are adopted — one chrome language.
- Do not use Popover for static titles — native `title` tooltips suffice (L1196).

## Environment pitfalls

- `hideWhenDetached` missing in Base-UI 1.9.0 — do not rely on it for popover dismissal (see Phase 115 risk log).
- Stale `:3000` standalone vs `next dev` divergence also masked chrome regressions — always verify on the canonical dev port.
