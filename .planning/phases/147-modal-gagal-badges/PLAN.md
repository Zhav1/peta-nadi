# PLAN — Phase 147: Modal Gagal + Badges

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the modal-honesty slice: remove hard-coded `delivered` Status
dropdown, rework toll (`MEDAN_TEBINGTINGGI` / `BELMERA` + `Tidak lewat tol`
checkbox + unknown-toll warning + explicit `[]`), reword both forms,
add `Saran sistem` banner, and ship `Gagal` vs `Rugi` badges with an
idempotency guard (incl. `cth. 25` + fill-25 fixes).

## Scope IN (this folder only)

- Status dropdown: hard-coded `delivered` default removed.
- Toll rework: corridor constants + no-toll checkbox + unknown warning + explicit `[]`.
- Both forms reworded; `Saran sistem` banner added.
- `Gagal` vs `Rugi` badges + idempotency guard; `cth. 25` placeholder + fill-25.

## Scope OUT

- No ledger math change, no migration in this slice.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. No hard-coded success default — status must be explicit or absent.
2. Unknown toll is explicit (`[]` + warning), never silent zero.
3. `Gagal` (failed strict) ≠ `Rugi` (loss-making): badges carry distinct
   copy + styling.
4. Idempotency guard on submit (disable-while-pending + key).
5. Placeholders use `cth. 25` (guard-plausible), not demo-magnitude values.
