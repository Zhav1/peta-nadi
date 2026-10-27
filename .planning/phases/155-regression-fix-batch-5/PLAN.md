# PLAN — Phase 155: Regression-Fix Batch (5)

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `2de5ff8`

## Objective

Record the 5-item regression-fix batch: distill evidence card, remove
Histori, remove Armada duplicate mount, restore Titik Panas + Waspada,
gate Berita Hold.

## Scope IN

1. Evidence card distill (`EvidenceTab.tsx`: 935-line rewrite, 529+/637-).
2. Histori removal (duplicate history surface deleted).
3. Armada duplicate removal (bottom-left floating roster mount deleted;
   header trigger single source — see Phase 150).
4. Titik Panas + Waspada restore (pills re-rendered after cleanup).
5. Berita Hold gate (route-presence condition — see Phase 151).

## Scope OUT

- No ingestion/logic change; behavior details live in Phases 151/153/156.
- No commit/push.

## Decisions locked (from diff + code reads)

1. One surface per concern: duplicate mounts/panels are deleted, not
   hidden.
2. Restore-after-cleanup is explicit: Titik Panas/Waspada re-added as
   pills, not as floating badges.
3. Net diff shrinks the tree (529 insertions vs 637 deletions).
