# LEARNINGS — Phase 142: Laporan Rename ERP→Trip

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **UI-only rename** — `ERP` → `Laporan Penghematan Operasional`
   in panel/section copy; `rit` → `Trip` in headers/buttons; `RIT-*`
   ID values and `GET /erp/summary` path/shape untouched.
2. **Concurrent-edit revert recovery** — a parallel edit reverted the
   batch rename; fixed via one-shot rename script with count assertions
   (expected replacement count asserted per file, re-run until green).

## 2. Concerns (open, evidenced)

1. **Judges wording** — `Laporan Penghematan Operasional` must read
   consistently across Analitik/Laporan/Evaluasi tabs; any leftover
   `ERP` acronym in visible copy is a judging-surface inconsistency.
2. **No migration by design** — DB/API keep `erp` naming; future
   contributors may "finish" the rename in the contract layer and break
   E2E selectors and stored ledger references.

## 3. Constraints (observed this window)

- Never break E2E/API shapes: route paths, response keys, and `RIT-*`
  IDs frozen.
- Subagents-only to protect main context; no default subagent — High only.
- UI-only slice: no Supabase DDL, no router rename.

## 4. Conditions (environment this window)

- Roles: Dispatcher (full), Regulator (read-only aggregates), Guest
  (sandbox preview, no writes).
- Honest-empty: zero-trip ledger renders explicit empty state, never zeros-as-data.
- Graceful fallback: missing summary resolves to cached/empty panel, never a 500 surface.

## 5. Issues found (do not repeat)

1. Never run two writers on the same copy batch — concurrent edits
   revert renames; use one one-shot script with count assertions.
2. Duplicate double-submit: rapid rename-script re-runs without
   idempotency guard double-applied replacements — assert counts first.
3. Placeholder drift: renamed headers must keep example values
   (`cth.`) consistent with the new `Trip` term.
4. Stale `.next/standalone` can serve pre-rename copy after a label-only
   deploy — rebuild before verifying copy.
5. Render cold start can mask a copy regression behind a boot-timeout
   error page — retry before judging copy.
6. Redis has no invalidation tool for cached summary copy — bump key
   version instead of hand-editing cache.
7. 5 pre-existing `system_audit` fails unrelated to this slice — do not
   chase them inside a rename pass.
