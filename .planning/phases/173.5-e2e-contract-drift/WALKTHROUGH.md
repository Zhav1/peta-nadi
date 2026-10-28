# WALKTHROUGH — Phase 173.5: E2E Contract Drift

**Mode:** docs-only. Source, specs, and tests untouched. Suite numbers
are those recorded for `40359c2`; they were **not re-run** in this pass.

## What was done

1. Read the `40359c2` diff (10 files, +357/−67).
2. Established the baseline claim: `phase57-pilot-hardening.spec.ts` was
   already failing at HEAD with 8 failures, before any change in this
   phase.
3. Enumerated the four drift causes: modal role, offline tag rename
   (`TANPA GEOMETRI LIVE`, spec `:120` and `:139`), demo button locator,
   revised guest copy.
4. Split the diff by intent:
   - **code fixed** — `base-ui/dialog.tsx` (new) renders `role="dialog"`
     for non-urgent modals; `RouteDetailModal.tsx` adopts it.
   - **specs updated** — `phase57-pilot-hardening.spec.ts` (+69),
     `demo-recorder.spec.ts`, `m8-proxy-cache.spec.ts`,
     `mapbox-turn-by-turn.spec.ts`, `toll-bypass-routing.spec.ts`,
     `vercel-capture.spec.ts`.
5. Found and fixed a genuine product defect while in the area:
   `GuidedDemoPanel.tsx` (+7) — the Stage-0 dead-end that blocked demo
   progression.
6. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Spec was red at HEAD | 8 failures recorded against `phase57-pilot-hardening.spec.ts` |
| Modal role cause | `dialog.tsx:7-9` states non-alerting surfaces render `role="dialog"`, `alertdialog` reserved for urgent |
| Offline tag | `TANPA GEOMETRI LIVE` at `phase57-pilot-hardening.spec.ts:120,139` |
| Spec updates are scoped | 6 spec files touched, each matched to a named drift cause |
| Real bug fixed | `GuidedDemoPanel.tsx` (+7) Stage-0 dead-end |
| Proxy reconciled | `app/api/proxy/[...path]/route.ts` (+4/−) |
| Suite result | 16 failed → 93 passed — *recorded* |

## Triage split

```
drift cause                     → resolution        → file
modal role (alertdialog)        → fix CODE          → base-ui/dialog.tsx, RouteDetailModal.tsx
offline tag renamed             → update SPEC       → phase57-pilot-hardening.spec.ts
demo button locator             → update SPEC       → phase57-pilot-hardening.spec.ts
revised guest copy              → update SPEC       → phase57-pilot-hardening.spec.ts
Stage-0 dead-end (real bug)     → fix CODE          → GuidedDemoPanel.tsx
proxy cache expectations        → update SPEC       → m8-proxy-cache.spec.ts
```

## Deliberately NOT done

- No re-run of the Playwright suite in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No change to the four known-red backend tests — they are out of scope
  for this phase and remain a baseline condition.
- No assertion was deleted; every rewritten expectation corresponds to a
  named intentional change.
