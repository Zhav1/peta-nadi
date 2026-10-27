# LEARNINGS — Phase 143: Selesaikan Trip

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Single `Selesaikan Trip` action** — one PATCH (actuals) then auto
   POST hedging on success; removes the half-committed
   actuals-without-hedging state the old `Aktual` + `Hitung` pair allowed.
2. **Legacy hidden for E2E** — old buttons visually hidden but still
   mounted so existing selectors resolve; deletion deferred to a
   dedicated E2E-migration pass.
3. **403 guards kept** — Guest/Regulator writes map to sandbox toast +
   optimistic local state, no backend write.

## 2. Concerns (open, evidenced)

1. **Spec drift `laporan-aktual`** — spec text still documents the
   two-button flow; readers following the spec will mis-operate the UI.
2. **Auto-POST failure window** — PATCH success + hedging POST failure
   leaves a completed trip without hedging; retry/idempotency path
   must be explicit.

## 3. Constraints (observed this window)

- Never break E2E/API shapes: legacy selectors mounted; PATCH/POST
  contracts unchanged.
- Subagents-only to protect main context; no default subagent — High only.
- Frontend-flow slice: no schema change.

## 4. Conditions (environment this window)

- Roles: Dispatcher executes; Regulator/Guest hit 403 → sandbox preview.
- Honest-empty: unhedged trips render `Belum terverifikasi`, never fake savings.
- Graceful fallback: hedging POST failure surfaces inline error, trip
  actuals retained.

## 5. Issues found (do not repeat)

1. Duplicate double-submit: double-clicking completion fires two
   PATCHes — disable while pending + idempotency guard required.
2. Placeholder drift: completion-form examples must match guard bands.
3. Stale `.next/standalone` can serve the old two-button layout —
   rebuild before verifying.
4. Render cold start can time out the chained POST — surface as
   retryable, not as success.
5. Redis has no invalidation tool for trip-summary cache — version keys.
6. 5 pre-existing `system_audit` fails unrelated to this slice.
