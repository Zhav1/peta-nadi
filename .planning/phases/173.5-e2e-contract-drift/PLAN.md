# PLAN — Phase 173.5: E2E Contract Drift

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `40359c2` — `fix(m9-173.5): reconcile frozen e2e contract drift`

## Objective

Restore a trustworthy test baseline. `frontend/e2e/phase57-pilot-hardening.spec.ts`
was **already red at HEAD** — 8 failures — so any subsequent "all green"
claim was unverified. This phase decides, case by case, whether the code
or the spec was wrong.

## The 8 pre-existing failures

1. Modal role changed to `alertdialog` where the surface is non-alerting.
2. Offline tag renamed to `TANPA GEOMETRI LIVE`
   (`phase57-pilot-hardening.spec.ts:120,139`).
3. Demo button locator no longer matched.
4. Guest copy was revised.

## Scope IN

- Code fixed where semantics were genuinely better:
  - `frontend/components/base-ui/dialog.tsx` (new, +125): a non-alerting
    modal surface that renders `role="dialog"`, leaving `alertdialog`
    for urgent confirmations (`dialog.tsx:7-9`).
  - `frontend/components/sidebar/RouteDetailModal.tsx` (+43/−) adopts it.
- Specs updated where the code had intentionally improved:
  `phase57-pilot-hardening.spec.ts` (+69), `demo-recorder.spec.ts`,
  `m8-proxy-cache.spec.ts`, `mapbox-turn-by-turn.spec.ts`,
  `toll-bypass-routing.spec.ts`, `vercel-capture.spec.ts`.
- Real product bug fixed: `GuidedDemoPanel.tsx` (+7) Stage-0 dead-end —
  the demo could not be advanced past the first stage.
- `frontend/app/api/proxy/[...path]/route.ts` (+4/−) reconciled with the
  proxy cache spec.

## Scope OUT

- No new test framework, no config rewrite.
- No deletion of failing assertions to force green — every changed
  assertion is justified by an intentional product change.
- No touching the four known-red backend tests.

## Decisions locked

1. **Frozen specs drift silently.** A spec that was green months ago is
   evidence about months ago, not about HEAD.
2. Triage rule: fix the **code** when the spec encodes better semantics
   (`role="dialog"` for a non-urgent modal); update the **spec** when the
   code reflects a deliberate product decision (`TANPA GEOMETRI LIVE`).
3. Never delete an assertion to reach green. Either the code changes or
   the expectation is rewritten with the reason recorded.

## Result

Full Playwright suite moved from **16 failed → 93 passed**.

## Risk notes

- This commit mixes code fixes and spec updates. That is inherent to
  contract reconciliation, but it means the diff cannot be read as pure
  test maintenance.
