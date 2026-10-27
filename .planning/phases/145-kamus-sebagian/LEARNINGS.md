# LEARNINGS — Phase 145: Kamus Sebagian

**Window:** 2026-10-27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **KPI-only translation** — 5 judge-facing labels (`Risiko harga`,
   `Porsi naik`, `WoW — Perubahan sepekan`, `Naik beruntun`,
   `Bencana bersamaan`) renamed; analytic terms untouched.
2. **Locked-term guard** — `Disparitas` / `Volatilitas` / `Spike`
   explicitly excluded from rename to preserve audit precision.
3. **Tooltip/table freeze** — technical detail layers kept verbatim
   so Regulator evidence language does not drift.

## 2. Concerns (open, evidenced)

1. Partial translation creates a two-register UI (operator labels over
   technical tables) — first-time judges may misread locked terms.
2. `WoW — Perubahan sepekan` dual form must stay byte-stable; dropping
   either half breaks doc comparability.

## 3. Constraints (observed this window)

- Never break E2E/API shapes: label-only change; keys and formulas frozen.
- Subagents-only to protect main context; no default subagent — High only.
- Copy slice: no computation, no schema change.

## 4. Conditions (environment this window)

- Roles: Dispatcher/Regulator/Guest share KPI labels; Regulator relies
  on technical tooltips.
- Honest-empty: untranslated states render source term, never blank.
- Graceful fallback: missing gloss key falls back to locked term.

## 5. Issues found (do not repeat)

1. Duplicate double-submit: N/A to labels but forms under labels still
   need pending-disable.
2. Placeholder drift: translated labels must keep examples aligned
   (`cth.` values unchanged meaning).
3. Stale `.next/standalone` can serve mixed old/new label sets.
4. Render cold start can serve cached untranslated bundle.
5. Redis has no invalidation tool for label-cached responses — version keys.
6. 5 pre-existing `system_audit` fails unrelated to this slice.
