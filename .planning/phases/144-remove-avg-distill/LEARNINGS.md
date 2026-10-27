# LEARNINGS — Phase 144: Remove Avg + Distill

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Average banner + header deleted** — `Rata-rata ekonomi` aggregate
   removed; per-row economy values kept auditable.
2. **Subtitles distilled to 1 line** — each subtitle single-line with
   full text in `title` tooltip (no information loss, less clutter).
3. **Internals removed from visible copy** — GET-only, guard-backend,
   and Komposit-sqrt mechanics no longer displayed; code paths unchanged.

## 2. Concerns (open, evidenced)

1. Tooltip-only detail is undiscoverable on touch devices — critical
   caveats must not live in `title` alone.
2. Removing the average changes judges' mental model; per-row-only
   needs an explicit `n terukur / n tak-terukur` count nearby.

## 3. Constraints (observed this window)

- Never break E2E/API shapes: display-only removal; no contract change.
- Subagents-only to protect main context; no default subagent — High only.
- Frontend-copy slice: no computation or schema change.

## 4. Conditions (environment this window)

- Roles: Dispatcher/Regulator/Guest all see the same distilled copy.
- Honest-empty: no average synthesized from partial rows.
- Graceful fallback: missing tooltip text degrades to bare label, never crash.

## 5. Issues found (do not repeat)

1. Duplicate double-submit: distilled forms still need pending-disable.
2. Placeholder drift: shortened subtitles must not orphan their examples.
3. Stale `.next/standalone` can serve the old banner — rebuild before verify.
4. Render cold start can flash the pre-distill layout from cache.
5. Redis has no invalidation tool for distilled panel cache — version keys.
6. 5 pre-existing `system_audit` fails unrelated to this slice.
