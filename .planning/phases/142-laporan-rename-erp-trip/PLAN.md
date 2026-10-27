# PLAN — Phase 142: Laporan Rename ERP→Trip

**Window:** 2026-10-27 · **Mode:** docs (no code changes, no commit)

## Objective

Record the UI-only rename slice: `ERP` → `Laporan Penghematan Operasional`
and `rit` → `Trip` in visible copy only, keeping all IDs, routes, and
contracts byte-identical for judges wording.

## Scope IN (this folder only)

- Visible labels: ERP panel titles, tab copy, table headers `rit` → `Trip`.
- ID stability: `RIT-*` display IDs kept verbatim (no renumber, no slug change).
- Contract stability: `GET /erp/summary` path, response shape, and query params intact.

## Scope OUT

- No migration, no column rename, no router path rename.
- No code edits, no test re-runs, no commit/push in this docs pass.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs + code reads)

1. UI-only rename: user-facing strings changed; DB columns, Pydantic fields,
   and `RIT-*` ID minting untouched.
2. `/erp/summary` route name frozen — rename applies to labels, not the API.
3. `RIT-*` kept because ledger rows, PDFs, and E2E selectors reference them.
4. No migration: zero Supabase DDL in this slice.
