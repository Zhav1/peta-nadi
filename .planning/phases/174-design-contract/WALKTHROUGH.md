# WALKTHROUGH — Phase 174: Design Contract (Distilled Command Surface)

**Mode:** docs-only record of built work; read-only inspection this pass.

## What was done

1. Read the `1f5485c` diffstat: 7 files, +530/−0 — nothing deleted,
   nothing restyled.
2. Wrote the **"Distilled Command Surface"** section into `DESIGN.md`:
   surface ladder, border opacities, text tiers, single accent, hazard
   semantics, 12px floor, radii, one shadow, motion, overlay contract.
3. Published the 14-value ban list of legacy chrome hues.
4. Added `--ds-*` custom properties and `frontend/lib/designTokens.ts`
   so CSS and tests read one vocabulary.
5. Added the palette ratchet spec
   `frontend/e2e/dashboard-palette-contract.spec.ts`, with its own
   independent oracle: `EXPECTED_BANNED` re-states the published list
   rather than importing it, so a quiet edit to the token file cannot
   silently widen what is allowed.
6. Recorded the token baseline finding: one panel border was `#1c2432`,
   a banned value already shipping.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 1f5485c` → `docs(m9-174): distilled command surface contract + token ratchet` |
| Diff scope | 7 files, +530/−0 |
| Tokens file present | `frontend/lib/designTokens.ts` exists |
| Contract doc present | `DESIGN.md` exists |
| Ratchet spec present | `frontend/e2e/dashboard-palette-contract.spec.ts` exists; header cites phase 174 |
| Ban list matches report | spec's `EXPECTED_BANNED` includes `#1c2432`, `#a855f7`, `#22d3ee`, `#f97316` |
| Palette specs | 6 (reported) — **not re-run in this pass** |
| Full suite | 97 passed (reported) — **not re-run in this pass** |

## Deliberately NOT done (per scope)

- No visual change whatsoever; zero pixels moved.
- No source restyle of any component.
- No commit, no push from this documentation pass.
- Whole-tree palette scan deferred to 175/176 by design.
