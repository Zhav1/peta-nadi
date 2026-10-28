# PLAN — Phase 176.11: Visual Colour Pass

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `a1b6e1b` — `feat(m9-visual): layer colour coding, lighter map, modality colours, news filter modal`
· merge `2d7991d`
**Diff size (verified):** `a1b6e1b` — 11 files, +743/−293

## Objective

Direct user feedback overrode two decisions from the earlier contract:
the map was too dark, the hazard layers needed a shared highlight
language in distinct colours, and the fleet modalities were not
distinguishable. Adjust the UI, and amend the written contract in the
same change so the palette ratchet does not start failing.

## Scope IN — user feedback, verbatim in effect

1. Map too dark.
2. Cuaca should be blue.
3. Waspada and Titik Panas should share Cuaca's highlight treatment, in
   different colours.
4. Truck and aircraft must be visually distinct.
5. Berita filters take too much space.

## Scope IN — implemented

- Base water `#0a121a`; land `#121b24` (lighter than 176.5's pairing).
- Three sibling hazard treatments: Cuaca blue `#2f81f7`/`#60a5fa`,
  Waspada amber `#f59e0b`/`#fbbf24` dashed, Titik Panas red
  `#ef4444`/`#f87171`.
- Fleet modalities: truck `#34d399`, aircraft `#a78bfa`, vessel
  `#e2e8f0`.
- Berita filters collapsed into a `Filter · N` modal with
  tingkat / kategori / wilayah facets, counts, and honest empty rows.
- `DESIGN.md` gains a sanctioned **"Operational layer palette"**
  section (verified at `DESIGN.md:266`); the ratchet gains a
  `LAYER_FILES` allowlist (verified at
  `dashboard-palette-contract.spec.ts:77`).

## Scope OUT

- No Playwright verification — the user explicitly asked for none.
- No change to the filter *criteria* themselves; only their container.
- No backend change.

## Decisions locked

1. **Shipping UI outranks the earlier palette bans.** The contract is
   amended, not ignored: the sanctioned layer palette is written down and
   the ratchet gains an explicit allowlist.
2. **Hazard layers share one treatment, three colours.** Same visual
   grammar, different hue — so the layers read as siblings rather than
   as unrelated overlays.
3. **Modality is a colour channel.** Truck / aircraft / vessel must be
   distinguishable at map scale.
4. **Filters earn their space or leave it.** A `Filter · N` modal states
   how many filters are active while costing no panel width.
5. **Empty rows stay visible and honest.** A facet with zero results is
   shown with a count of zero, not hidden.

## Risk notes

- The allowlist is a contract hole by definition; anything not in
  `LAYER_FILES` is still banned, and adding files is a reviewable act.
- Colour-only modality encoding is the pattern Phase 175 argued against;
  here it is accepted deliberately for map paint, where a glyph per
  vehicle is not viable.
