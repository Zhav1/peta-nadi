# WALKTHROUGH — Phase 157: FIRMS Whole-Sumatra BBox

**Mode:** docs-only; no code touched; tests re-run this pass (read-only).

## What was done

1. Read the `1668222` FIRMS diff (adapter + router hunks).
2. Re-ran `pytest backend/tests/test_adapters.py -k firms` → **2 passed**.
3. Re-ran `npx tsc --noEmit` → **exit 0**.
4. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Bbox-only gate | Adapter docstring + removed `min_dist_km <= 20.0` drop |
| Spine = provenance | `near_segment`/`dist_to_corridor_km` still emitted |
| Honest degraded | 200 + `status=degraded`, no fake points |
| pytest firms | 2 passed |
| tsc | exit 0 |

## Deliberately NOT done (per scope)

- No code edits; no commit, no push.
