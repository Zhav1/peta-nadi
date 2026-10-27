# LEARNINGS — Phase 151: P2 Berita + TopNav

**Window:** 2026-10-26/27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Route-gated Hold** — hiding (not disabling) `Tahan (Hold)` without a
   route killed the hold-without-route path at the UI layer.
2. **Dormant-prop retention** — `_`-prefixed props keep old callers
   compiling while rendering nothing; deletion would break the build.
3. **Zero-cost Fokus** — stored audit-trail inspection, no new LLM call.

## 2. Concerns (open, evidenced)

1. Hidden-vs-disabled: hidden buttons are undiscoverable; acceptable only
   because Fokus covers the no-route case.
2. Dormant props accumulate; a cleanup pass must be explicit, not silent.

## 3. Constraints (observed this window)

- E2E route→HITL→commit must never break: Hold gating is additive only.
- Tenant scoping rules unchanged by this slice.

## 4. Conditions (user-stated this window)

- Dashboard minimalist; map-critical pills only in TopNav.
- Waspada stays info-only (Phase 156); berita Hold only after real route.

## 5. Issues found (do not repeat)

1. Rendering Hold without a route synthesized hold_staging actions —
   gate at render, not just at POST.
2. Deleting dormant props breaks callers; prefix `_` and keep.
