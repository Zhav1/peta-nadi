# LEARNINGS — Phase 152: P3 Zone Evidence-Only + Causal

**Window:** 2026-10-26/27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Evidence-only zone gating** — tab-level lock (not just disabled
   buttons) prevents action on unrouted zones.
2. **hold_staging exclusion** — filtering the placeholder type in both the
   route list and the fallback keeps HOLD display-only.
3. **Always-visible causal** — collapse, not conditional render, so the
   Why-chain never disappears on zone switch.

## 2. Concerns (open, evidenced)

1. Two separate `hold_staging` guards must stay in sync; a shared
   `isRealRoute()` helper would be safer.
2. `effectiveTab` forcing can surprise deep-links; acceptable for safety.

## 3. Constraints (observed this window)

- E2E route→HITL→commit never breaks: gating is additive, never reorders.
- Hold/reroute only after a real route — enforced at tab level here,
  at POST level in Phase 154.

## 4. Conditions (user-stated this window)

- Zone click inspects; only a computed route unlocks action.
- Causal timeline must stay readable in every state.

## 5. Issues found (do not repeat)

1. Treating `hold_staging` as a route unlocked action tabs on
   placeholders — exclude by type, in both list and fallback paths.
