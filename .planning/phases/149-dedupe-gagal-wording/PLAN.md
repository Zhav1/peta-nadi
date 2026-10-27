# PLAN — Phase 149: Dedupe Gagal Wording

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the ledger-hygiene slice: delete 3 duplicate trips
(`257bb100` / `063d28c1` / `a1d88536`) → 22 trips, correct fuel
(-102.8 L → -8.55 L), and lock `gagal = failed strict` wording vs
`merugi` (loss-making) — with Render live verification (total 22).

## Scope IN (this folder only)

- Delete 3 duplicate IDs; ledger totals recomputed (22 trips).
- Fuel correction -102.8 L → -8.55 L.
- Wording lock: `gagal` = failed strict; `merugi` = loss-making.

## Scope OUT

- No math-formula change, no migration in this slice.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. The 3 IDs are exact duplicates (same business key), not distinct trips.
2. Fuel delta explained by duplicate removal (phantom -102.8 L out).
3. `gagal` is strict operational failure; negative-savings trips are
   `merugi`, never `gagal`.
4. Render live verified: ledger total = 22 trips post-dedupe.
