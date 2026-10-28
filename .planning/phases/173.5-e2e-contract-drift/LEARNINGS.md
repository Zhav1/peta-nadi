# LEARNINGS — Phase 173.5: E2E Contract Drift

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**Frozen specs drift silently; re-run the full suite before assuming a
green baseline.** `phase57-pilot-hardening.spec.ts` was already red at
HEAD — 8 failures — and nobody knew, because only the specs near the
current work were being run. Every later claim of "tests pass" was
therefore about a subset, not about the product.

The corollary is a triage rule that keeps reconciliation honest: **fix
the code when the spec encodes better semantics, update the spec when
the code reflects a deliberate product decision.** Without that rule,
"get to green" becomes "delete the assertion".

## 2. Fixes tried (what worked, with file evidence)

1. **Code fixed where semantics won** — `base-ui/dialog.tsx` (new, +125)
   renders `role="dialog"` for non-alerting modals; the comment at
   `:7-9` records why `alertdialog` is reserved for urgent
   confirmations. `RouteDetailModal.tsx` adopts it.
2. **Specs updated where the product improved** —
   `phase57-pilot-hardening.spec.ts` (+69) for the
   `TANPA GEOMETRI LIVE` tag (`:120`, `:139`), demo button locator, and
   revised guest copy; plus `demo-recorder`, `m8-proxy-cache`,
   `mapbox-turn-by-turn`, `toll-bypass-routing`, `vercel-capture`.
3. **A real bug found while reconciling** — `GuidedDemoPanel.tsx` (+7)
   Stage-0 dead-end: the guided demo could not leave its first stage.
   Contract work surfaces product defects; it should not be treated as
   paperwork.
4. **Proxy contract reconciled** — `app/api/proxy/[...path]/route.ts`
   (+4/−) matched `m8-proxy-cache.spec.ts`.

## 3. Concerns (open)

1. This commit mixes code fixes and spec updates. It is correct but not
   cleanly separable; the diff cannot be read as pure test maintenance.
2. Six spec files were updated in one commit. Each maps to a named drift
   cause, but a future reader must trust that mapping rather than the
   diff.
3. The full-suite run that produced 16 → 93 was a one-off. There is no
   evidence in this phase of a scheduled full-suite gate.

## 4. Conditions (observed this window)

- Playwright runs against the PREBUILT
  `frontend/.next/standalone/server.js`, so a stale build can make a
  correct code change look like a spec failure.
- Multiple sessions share this checkout; e2e runs and builds contend for
  the same port and the same `.next` output.

## 5. Issues found (do not repeat)

1. A spec file kept green by never being run is worse than no spec: it
   manufactures confidence.
2. `role="alertdialog"` on a non-urgent modal is an accessibility
   regression, not a cosmetic rename — the spec was right and the code
   was wrong.
3. A dead-end in a guided demo is invisible to unit tests and to manual
   review of a single stage; only end-to-end progression catches it.

## 6. Environment constraints (this checkout)

- Windows + PowerShell. Backend interpreter is
  `backend/.venv/Scripts/python.exe`, not a bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; a build must run before e2e.
- Concurrent sessions share this checkout: never `git add -A` without
  authorisation; never kill port 3000 blindly.
- Free subagent model quota can be exhausted mid-run; keep a fallback
  model configured.
- Four backend tests fail at baseline: `test_impact_assessment`,
  `test_travel_fuel_guard` (×2), and
  `test_cpu_routing_weather::…seed_fallback`. Treat them as pre-existing.
