# LEARNINGS — Phase 149: Dedupe Gagal Wording

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Duplicate deletion** — removed `257bb100` / `063d28c1` /
   `a1d88536` (same business key) → ledger 22 trips.
2. **Fuel correction** — total -102.8 L → -8.55 L once phantom
   duplicate rows left the aggregate.
3. **Wording lock** — `gagal` = failed strict (operational status);
   `merugi` = loss-making (negative savings); badges/forms use them
   distinctly (see Phase 147).
4. **Render live verify** — prod ledger total confirmed 22 post-dedupe.

## 2. Concerns (open, evidenced)

1. Dedup was by explicit ID list; the insert path still needs a
   business-key uniqueness guard or duplicates reaccumulate.
2. Fuel -8.55 L still needs plausibility review per-trip (guard band
   1.5–25 km/L from Phase 141 applies at write time, not retroactively).

## 3. Constraints (observed this window)

- Never break E2E/API shapes: row deletion only; no contract change.
- Subagents-only to protect main context; no default subagent — High only.
- Ledger-hygiene slice: no formula or DDL change.

## 4. Conditions (environment this window)

- Roles: Dispatcher owns dedupe; Regulator audits 22-trip total;
  Guest sees sanitized count only.
- Honest-empty: removed rows absent from counts, not zero-filled.
- Graceful fallback: missing ledger row renders `Belum tersedia`.

## 5. Issues found (do not repeat)

1. Duplicate double-submit: the likely duplicate source — rapid
   double-click inserts without idempotency key; keep Phase 147 guard.
2. Placeholder drift: dedupe scripts must not inject demo-magnitude values.
3. Stale `.next/standalone` can render the pre-dedupe 25-trip count.
4. Render cold start can serve a mid-dedupe read — verify total 22
   after warm.
5. Redis has no invalidation tool for ledger totals — version keys
   after any delete.
6. 5 pre-existing `system_audit` fails unrelated to this slice.
