# PLAN — Phase 174: Design Contract (Distilled Command Surface)

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `1f5485c` — `docs(m9-174): distilled command surface contract + token ratchet`
**Diff size (verified):** 7 files, +530/−0

## Objective

Lock the visual contract **before** any UI change, so later phases
(175 shell, 176 overlays) have a written, testable definition of "done"
instead of a taste argument per screenshot. The phase is deliberately
zero-visual-change: it publishes rules, tokens, and a ratchet that makes
the rules enforceable.

## Scope IN

- `DESIGN.md` gains a **"Distilled Command Surface"** section:
  - surfaces `#080d14` / `#0c1017` / `#121822`;
  - borders at 8% and 15% opacity;
  - text tiers (primary/secondary/tertiary);
  - exactly one data accent, `#38b8f8`;
  - hazard red/amber/emerald reserved for hazard state only.
- A **14-value ban list** of legacy chrome hues, including `#00d4ff`,
  `#22d3ee`, `#f97316`, `#a855f7`, `#1c2432`.
- Structural rules: 12px type floor; radii `12/10/999`; one shadow;
  motion rules; overlay contract.
- `--ds-*` CSS custom properties plus `frontend/lib/designTokens.ts`
  (single source consumed by both CSS and tests).
- Palette ratchet spec (`frontend/e2e/dashboard-palette-contract.spec.ts`)
  with an explicit `CLEANED_FILES` list that may **only grow**.
- Token baseline run: a real panel border was literally `#1c2432`,
  i.e. the ban list is grounded in shipped code, not invented.

## Scope OUT

- No component restyle, no layout change, no colour swap in this phase.
- No whole-dashboard scan: most of the tree still carries banned chrome,
  and a red gate everyone ignores is worse than no gate.
- No commit of downstream phase work; no push.

## Decisions locked

1. **Contract before pixels.** Ban list, tokens, and ratchet land first;
   175/176 consume them.
2. **One accent.** Data emphasis is `#38b8f8` and nothing else; a second
   accent re-opens the hue circus this phase exists to end.
3. **Hazard hues are semantic, not decorative.** red/amber/emerald may
   appear only where hazard state is being reported.
4. **Ratchet is one-way.** `CLEANED_FILES` starts with genuinely clean
   files; every later phase appends what it cleans; a listed file that
   regresses fails the spec. The only legal removal is deleting the file
   (rename = remove + append in the same commit).
5. **Mapbox paint is the named exception.** Banned hues may survive only
   inside `components/map/` paint expressions and only in the ranges
   published in `DESIGN.md`.

## Risk notes

- A ratchet that starts too large fails immediately and gets muted; the
  narrow initial list is intentional, and it defers enforcement to 175/176.
- `designTokens.ts` and the `--ds-*` block are two representations of one
  contract; any edit must touch both or the spec's oracle drifts.
