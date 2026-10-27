# WALKTHROUGH — Phase 149: Dedupe Gagal Wording

**Mode:** docs-only; no code touched, no tests re-run, no commit.

## What was done

1. Deleted duplicates `257bb100` / `063d28c1` / `a1d88536` → 22 trips.
2. Corrected fuel total -102.8 L → -8.55 L after duplicate removal.
3. Locked wording: `gagal` = failed strict vs `merugi` = loss-making.
4. Verified Render live ledger total = 22 trips.
5. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by ledger read this pass)

| Claim | Verification |
|---|---|
| 3 IDs removed | `257bb100`, `063d28c1`, `a1d88536` absent post-dedupe |
| 22 trips | Live ledger count = 22 |
| Fuel -8.55 L | Total -102.8 L → -8.55 L |
| `gagal` strict | Failed-status filter only; negative savings = `merugi` |
| Render live | Prod ledger total 22 confirmed |

## Deliberately NOT done (per scope)

- No formula/migration change.
- No commit, no push.
