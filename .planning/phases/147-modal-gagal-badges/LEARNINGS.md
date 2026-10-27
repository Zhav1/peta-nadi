# LEARNINGS — Phase 147: Modal Gagal + Badges

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Hard-code `delivered` removed** — Status dropdown no longer
   preselects success; operator must choose explicitly.
2. **Toll rework** — `MEDAN_TEBINGTINGGI` / `BELMERA` corridor
   constants + `Tidak lewat tol` checkbox + unknown-toll warning +
   explicit `[]` (unknown ≠ zero).
3. **Both forms reworded + `Saran sistem` banner** — guidance lives in
   a banner block, not in placeholder hacks.
4. **`Gagal` vs `Rugi` badges + idempotency guard** — failed-strict vs
   loss-making rendered distinctly; submit disabled while pending.
5. **`cth. 25` + fill-25** — placeholders/defaults use guard-plausible
   25, not demo-magnitude values.

## 2. Concerns (open, evidenced)

1. Explicit `[]` unknown-toll still needs downstream math rules —
   readers must confirm it is excluded, not zeroed, in savings.
2. `Gagal`/`Rugi` wording must stay consistent with Phase 149 strict
   `gagal=failed` definition.

## 3. Constraints (observed this window)

- Never break E2E/API shapes: dropdown values and toll payload keys frozen.
- Subagents-only to protect main context; no default subagent — High only.
- Form-copy slice: no ledger-math or DDL change.

## 4. Conditions (environment this window)

- Roles: Dispatcher submits; Regulator reads; Guest sandbox-only.
- Honest-empty: unknown toll renders warning + `[]`, never `Rp 0` as fact.
- Graceful fallback: banner missing degrades to plain form, never blocks submit.

## 5. Issues found (do not repeat)

1. Duplicate double-submit: every modal submit needs pending-disable +
   idempotency key — this slice's guard is the pattern to copy.
2. Placeholder drift: never ship demo-magnitude `cth.` values; they
   leak into prod inputs and trip plausibility guards.
3. Stale `.next/standalone` can serve the old `delivered` default.
4. Render cold start can double-fire a retried submit — idempotency key
   must survive retry.
5. Redis has no invalidation tool for form-default caches — version keys.
6. 5 pre-existing `system_audit` fails unrelated to this slice.
