# PLAN — Phase 145: Kamus Sebagian

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the partial-glossary slice: KPI labels translated to operator
Indonesian (`Risiko harga`, `Porsi naik`, `WoW — Perubahan sepekan`,
`Naik beruntun`, `Bencana bersamaan`) while `Disparitas` / `Volatilitas` /
`Spike` stay locked technical; tooltips and tables stay technical.

## Scope IN (this folder only)

- KPI label renames (5 labels listed above).
- Locked terms preserved: `Disparitas`, `Volatilitas`, `Spike`.
- Tooltips/tables remain technical by design.

## Scope OUT

- No formula change, no API change, no full-glossary rewrite.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. Partial by intent: only judge-facing KPI labels translated; analytic
   precision terms locked to avoid semantic drift.
2. Tooltips/tables stay technical so Regulator audit language is unchanged.
3. `WoW` keeps the acronym with Indonesian gloss (`Perubahan sepekan`)
   to preserve comparability with source docs.
