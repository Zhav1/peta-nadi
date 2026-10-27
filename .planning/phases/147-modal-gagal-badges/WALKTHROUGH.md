# WALKTHROUGH — Phase 147: Modal Gagal + Badges

**Mode:** docs-only; no code touched, no tests re-run, no commit.

## What was done

1. Removed hard-coded `delivered` from Status dropdown (explicit choice only).
2. Reworked toll: `MEDAN_TEBINGTINGGI` / `BELMERA` constants,
   `Tidak lewat tol` checkbox, unknown-toll warning, explicit `[]`.
3. Reworded both forms; added `Saran sistem` banner.
4. Shipped `Gagal` vs `Rugi` badges + submit idempotency guard.
5. Fixed placeholders to `cth. 25` + fill-25 defaults.
6. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by code read this pass)

| Claim | Verification |
|---|---|
| No hard-code `delivered` | Status dropdown has no preselected success value |
| Toll rework | Corridor constants + no-toll checkbox + `[]` + warning |
| Both forms reworded | Form copy updated in both modals |
| `Saran sistem` banner | Banner block present in form |
| `Gagal` vs `Rugi` badges | Distinct badge copy + styling |
| Idempotency guard | Submit disabled while pending + key |
| `cth. 25` | Placeholders use guard-plausible 25 |

## Deliberately NOT done (per scope)

- No ledger-math or migration change.
- No commit, no push.
