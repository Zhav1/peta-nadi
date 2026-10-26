# PLAN — Phase 139: Evaluasi Lock + Distill + Standardize

**Window:** 2026-10-26 · **Commits:** `8b76a5c`, `ae1dc3b` · **Mode:** docs (no code changes, no commit)

## Objective

Record the evaluasi credibility-hardening slice: guest hard-block for
Analitik/Evaluasi, distilled KPI+N+Status default view, Diagnostik commented
out, Analitik/Laporan token standardization, persist-badge removal, and the
Catat-verifikasi entry point.

## Scope IN (this folder only)

- Commits `8b76a5c` (5 files, +355/−211) and `ae1dc3b` (5 files, +569/−127).
- Files: `DashboardClient.tsx`, `EvaluationSection.tsx`,
  `ReliabilityDiagram.tsx`, `RouteEfficiencyCard.tsx`, `TestMatrixTable.tsx`,
  `LaporanAktualModal.tsx`, `ReportsSection.tsx`, `frontend/lib/api.ts`.

## Scope OUT

- Laporan overhaul merge (`fc67632`/`8d8d8b8`), 022 migration → Phase 140.
- Live Supabase reader/backfill (`50eb6e1`, `2069c23`) → Phase 140.
- Internal Skenario vs Aktual split (`c10218a`, `08bf11a`) → Phase 141.
- No code edits, no test re-runs, no commit/push.
- Never write temp files; docs only under `.planning/phases/`.

## Decisions locked (from diffs)

1. Guest hard-block at mount for Analytics / Reports / Evaluation sections
   (`DashboardClient.tsx:3699,3742,3786`; guard comment `:927`).
2. Default Evaluasi view shows only KPI+N+Status; deltas, threshold hints,
   provenance detail hidden behind collapsed/expandable UI
   (`EvaluationSection.tsx:415-416,558,595-596,612`).
3. Diagnostik commented out of default view; "Muat Ulang" + "Tolok Ukur"
   entry retained (`EvaluationSection.tsx:411`).
4. Batch labeled "Simulasi N=60 — bukan data live" (`EvaluationSection.tsx:545`).
5. Persist badges removed; Catat-verifikasi entry added after Trip +
   audit deep-link in Reports; provenance restored gated
   (stat: `EvaluationSection.tsx` +42/−, `LaporanAktualModal.tsx` +567,
   `ReportsSection.tsx` +73, `api.ts` +8 — `ae1dc3b`).
