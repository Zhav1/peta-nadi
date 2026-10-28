# WALKTHROUGH — Phase 176.11: Visual Colour Pass

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** direct user feedback on the shipped visual state.

## What was done

1. Read the `a1b6e1b` diffstat: 11 files, +743/−293.
2. Lightened the map: base water `#0a121a`, land `#121b24`.
3. Built three sibling hazard treatments — Cuaca blue
   `#2f81f7`/`#60a5fa`, Waspada amber `#f59e0b`/`#fbbf24` (dashed),
   Titik Panas red `#ef4444`/`#f87171` — same grammar, different hue.
4. Gave the fleet modalities distinct colours: truck `#34d399`, aircraft
   `#a78bfa`, vessel `#e2e8f0`.
5. Collapsed the Berita filter row into a `Filter · N` modal with
   tingkat / kategori / wilayah facets, counts, and honest empty rows.
6. Amended the contract: `DESIGN.md` gained "Operational layer palette"
   (verified at `DESIGN.md:266`) and the ratchet gained a `LAYER_FILES`
   allowlist (verified at `dashboard-palette-contract.spec.ts:77`).

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 a1b6e1b` → `feat(m9-visual): layer colour coding, lighter map, modality colours, news filter modal` |
| Merge commit exists | `git log -1 2d7991d` → `merge: m9 visual pass (map tone, layer hues, modality colours, news filter modal)` |
| Diff scope | 11 files, +743/−293 |
| Contract section exists | `DESIGN.md:266` "### Operational layer palette" |
| Allowlist exists | `dashboard-palette-contract.spec.ts:77` `const LAYER_FILES = [` |
| Allowlist is enforced | same spec also asserts the list is sorted and has no duplicates |
| `tsc` | exit 0 (reported) — **not re-run in this pass** |
| Build | exit 0 (reported) — **not re-run in this pass** |
| Verification scope | map-popup unit only; user explicitly asked for no Playwright |
| Full suite | **not run this phase by design** |

## Before → after

| Surface | Before (per 174/175) | After |
|---|---|---|
| Water / land | `#070a10` / `#0d1219` (near-black) | `#0a121a` / `#121b24` |
| Cuaca | neutral chrome | blue `#2f81f7` / `#60a5fa` |
| Waspada | neutral chrome | amber `#f59e0b` / `#fbbf24`, dashed |
| Titik Panas | neutral chrome | red `#ef4444` / `#f87171` |
| Truck / aircraft / vessel | not distinguishable | `#34d399` / `#a78bfa` / `#e2e8f0` |
| Berita filters | occupying panel space | `Filter · N` modal with counts |
| Palette gate | absolute ban list | ban list + `LAYER_FILES` allowlist |

## Deliberately NOT done (per scope)

- No Playwright: the user explicitly asked for none. Verification was
  `tsc`, a build, and the map-popup unit only.
- No change to filter semantics or backend query.
- No commit, no push from this documentation pass.

## Carried into 176.12

Freeing violet for aircraft and giving Waspada a hazard hue leaves a
follow-up: Waspada becomes a purple FIRMS-style dot layer in 176.12,
aircraft moves to `#e2e8f0`, and vessel moves to `#2dd4bf`.
