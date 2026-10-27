# WALKTHROUGH — Phase 152: P3 Zone Evidence-Only + Causal

**Mode:** docs-only; no code touched, no commit.

## What was done

1. Verified evidence-only gate + `hold_staging` exclusion
   (`CrisisSidebar.tsx:56-68`).
2. Verified tab lock (`visibleTabs` / `effectiveTab`, `:68-69,144-148`).
3. Verified always-visible causal section (`:183-206`).
4. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by code read this pass)

| Claim | Verification |
|---|---|
| Zone click = Evidence only | `visibleTabs` ternary; `effectiveTab` forced |
| hold_staging excluded | Two `corridor_type !== 'hold_staging'` guards |
| Causal always visible | `CrisisSidebar.tsx:183-206` collapse section |
| tsc | exit 0 (window tail) |

## Deliberately NOT done (per scope)

- No gate-math change; no commit, no push.
