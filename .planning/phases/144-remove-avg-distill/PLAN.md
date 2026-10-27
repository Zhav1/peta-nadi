# PLAN — Phase 144: Remove Avg + Distill

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the de-clutter slice: delete the `Rata-rata ekonomi` average banner
+ header (keep per-row values), distill subtitles to 1 line with title
tooltips, and remove GET-only / guard-backend / Komposit-sqrt internals
from visible copy.

## Scope IN (this folder only)

- Remove average banner + average header row; per-row economics untouched.
- Subtitles distilled to single lines; full text moved to `title` tooltips.
- Visible copy no longer exposes GET-only, guard-backend, or Komposit-sqrt mechanics.

## Scope OUT

- No computation change, no API change, no migration.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. Average removed because it mixed measured + unmeasured trips into one
   misleading number; per-row stays auditable.
2. Subtitle distillation is copy-only; tooltip carries the removed detail.
3. Backend/guard/Komposit internals stay in code — removed from display only.
