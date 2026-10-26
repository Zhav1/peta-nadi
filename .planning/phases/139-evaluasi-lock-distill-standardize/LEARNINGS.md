# LEARNINGS — Phase 139: Evaluasi Lock + Distill + Standardize

**Window:** 2026-10-26 · Grounded facts only (grep / `git show --stat` this pass).

## 1. Fixes tried (what worked, with file evidence)

1. **Guest hard-block at mount** — `DashboardClient.tsx:3699,3742,3786`
   (Analytics / Reports / Evaluation sections); rationale comment `:927`.
2. **Distilled default view (KPI+N+Status)** — `EvaluationSection.tsx:415-416`;
   Status kept in collapsed "Data apa yang diuji?" so the audit trail survives.
3. **Diagnostik commented out, entry points kept** — `EvaluationSection.tsx:411`
   (Tolok Ukur button + Muat Ulang retained).
4. **KPI threshold hints removed from default view, numbers kept** —
   `EvaluationSection.tsx:558,569,580,591` (four PHASE5 comments).
5. **Batch explicitly labeled non-live** — `EvaluationSection.tsx:545`
   ("Simulasi N=60 — bukan data live").
6. **Deltas + provenance collapsed by default** — `EvaluationSection.tsx:595-596`
   (deltas hidden per spec), `:612` (provenance collapsed without `open`).
7. **Persist badges removed; verifikasi entry + audit deep-link added;
   provenance restored gated** — `ae1dc3b` stat: `EvaluationSection.tsx` +42,
   `LaporanAktualModal.tsx` +567, `ReportsSection.tsx` +73, `api.ts` +8.

## 2. Concerns (open, evidenced)

1. **Distilled bar re-introduced persist-badge risk**: the N+Status bar that
   replaced verbose baseline/live badges is itself a persistent surface —
   later work had to hide Status from the default view (`:416`), confirming
   the pattern recurs unless the default view stays minimal.
2. **403-copy dependence**: guest sandbox messaging keys off `'403'` /
   `'Forbidden'` substrings (`DashboardClient.tsx:2593-2595`) — a backend
   message change silently breaks the sandbox copy path.

## 3. Constraints (hard rules observed this window)

- Frontend-only lock for this slice: all `8b76a5c` files are
  `frontend/components/dashboard/*` (verified: `git show --stat 8b76a5c` —
  5 frontend files, zero backend).
- No E2E break: e2e specs untouched by both commits (stat shows no `e2e/` paths).

## 4. Conditions (environment this window)

- Commits `8b76a5c` (20:26) → `ae1dc3b` (21:37) on 2026-10-26, ahead of the
  laporan merge `8d8d8b8` (22:33) — so this slice's files were later merged
  under, then re-touched by, the overhaul.

## 5. Issues found (do not repeat)

1. **Handoff-reported, not re-verified in this docs pass** (from the parent
   brief; no git/code evidence available to this agent): `pred_prob`
   unwritable at one point; UUID `incident_id` mismatch; PGRST204 on missing
   021 columns pre-MCP-application; concurrent-worker dirty files; a stash
   merge incident. Do not cite these as verified — re-verify against Supabase
   logs / shell history before acting on them.
