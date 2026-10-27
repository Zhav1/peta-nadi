# LEARNINGS — Phase 155: Regression-Fix Batch (5)

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Distill-don't-patch** — full EvidenceTab rewrite beat incremental
   fixes for card bloat.
2. **Delete duplicates** — Histori surface and floating roster removed
   rather than restyled.
3. **Restore explicitly** — Titik Panas/Waspada re-added as pills after
   the purge, verified present in tree.
4. **Gate at render** — Berita Hold condition added in the same batch.

## 2. Concerns (open, evidenced)

1. Batch commits mix 5 concerns; future batches should split by concern
   for cleaner reverts.
2. `EvidenceTab.tsx` rewrite scale (935 lines) needs a follow-up read
   for dead branches.

## 3. Constraints (observed this window)

- Dashboard minimalist: dedup first, restyle second.
- Subagents-only; no temp files (untracked `bench.json`/`erp*.json`/
  `evlive.json`/`h1.json`/`headers1.txt` in tree are probe debris — delete
  before any commit).

## 4. Conditions (user-stated this window)

- Playwright per phase; E2E route→HITL→commit never breaks.

## 5. Issues found (do not repeat)

1. Cleanup passes that delete-then-restore must verify the restore in
   the same window — never assume.
2. Probe debris (`*.json`, `headers1.txt`) must not be committed.
