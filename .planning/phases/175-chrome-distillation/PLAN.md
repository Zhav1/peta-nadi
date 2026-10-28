# PLAN — Phase 175: Chrome Distillation

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `cf2a1bb` — `feat(m9-175): distilled dashboard chrome and map paint`
**Diff size (verified):** 9 files, +815/−507

## Objective

Spend the Phase 174 contract on the actual dashboard shell. The screen
had five simultaneously-hued counter pills, an eight-hue legend, tinted
tabs, and map paint outside the sanctioned palette. This phase reduces
all of it to one neutral chrome with a single active state, and records
before/after evidence at both desktop and mobile widths.

## Scope IN

- **Counter pills:** five hues collapse to one neutral recipe; the
  active pill is white (single, unambiguous selection state).
- **Legend:** eight hues collapse to hazard hues only, with shape and
  text-label glyphs carrying the remaining distinctions.
- **Tabs:** active tab is white rather than accent-tinted.
- **Map paint:** reduced to the sanctioned palette published in
  `DESIGN.md` (Phase 174), so the map stops being a separate colour
  system.
- **Evidence capture:** before/after screenshots at 1920 and 390.

## Scope OUT

- No tooltip or popup redesign — Mapbox popups stay default here and are
  Phase 176's subject.
- No layout/breakpoint work; mobile layout defects surface in 176.5.
- No motion work (also 176).
- No backend change.

## Decisions locked

1. **One neutral chrome, one active state.** Emphasis is white, not a
   hue; this removes the "which colour means selected" ambiguity that
   five-hue pills created.
2. **Hue is a semantic budget, not a decoration budget.** Hazard hues
   remain; everything else is monochrome.
3. **Shape + label carry meaning.** Where the legend previously relied
   on colour alone, a glyph and a text label now carry it — colour
   becomes reinforcement, never the only channel.
4. **Map paint obeys the same palette.** A sanctioned palette that the
   map ignores is not a palette.

## Risk notes

- Colour-blind and low-contrast users were the hidden dependency of the
  old legend; moving meaning to glyph + label fixes that, but any future
  legend entry must ship with a shape, not just a swatch.
- Screenshots at 1920 and 390 look acceptable in this phase, yet 176.5
  finds real defects at 390 — a static capture is weaker evidence than
  it appears.
