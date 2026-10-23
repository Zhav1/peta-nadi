# Phase 99 - Learnings

**Rule:** only decisions and observations evidenced by the diff, the tests, or the window log.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| Never default `validated` to `true` | `frontend/hooks/useCrisisSimulationStream.ts:177-178` | A missing validation flag renders as unverified. |
| Archived signals are always unvalidated | same lines | `status=archived` overrides any stale `validated` field. |
| Archived signals open `Evidence`, not `Mitigation` | `frontend/components/dashboard/DashboardClient.tsx:1965-1971` | A rejection cannot look like a tactical success. |
| Archived toast is `info`, not `success` | `DashboardClient.tsx:1979-1990` | No savings language on a rejected signal. |
| Label fallback news and exclude it from PIHPS-live | `DashboardClient.tsx:2663-2667,3000`; `useNewsVerification.ts:850-854` | Offline data is visible as offline. |
| Score the normalized forecast for NFR-4 | `scripts/evaluate_metrics.py:164-180` | Forecast can reach 1.0; raw product is no longer the scored quantity. |
| Keep raw product Brier as telemetry | `scripts/evaluate_metrics.py:231,272-274` | The structural gap stays visible instead of being hidden by normalization. |
| Keep detection at `0.50` raw (equiv. `0.727` normalized) | `scripts/evaluate_metrics.py:291-305` | Existing detection semantics are preserved; the scale change is documented. |
| Reject any `google.` host, not just `google.com` | `news_aggregator.py:388` | Country domains and redirect hosts cannot leak downstream. |
| Unwrap redirect/AMP wrappers before host checks | `news_aggregator.py:346-361` | The real publisher host is what gets validated. |
| Keep a publisher fallback for undecodable tokens | `news_aggregator.py:206,393-405` | The UI gets a publisher link, not a Google search URL. |
| HITL auth runs before body validation | `backend/tests/test_audit_fixes.py:72-94` | Missing token => `401`; authenticated invalid UUID => `422`. |

## 2. Fixes tried and why they changed

1. **First approach:** `validated: parsed.validated ?? state.validated ?? true`. **Problem:** absence of evidence became evidence of validation. **Replaced by:** `?? false`, with archived forced to `false`.
2. **First approach:** a single success toast and `setActiveTab('Mitigation')` after every simulation. **Problem:** an archived/rejected signal produced the same success UI as an accepted one. **Replaced by:** archived-aware tab/toast branching.
3. **First approach:** count every news item as a verified source and let any news item light PIHPS. **Problem:** the offline fixture looked live. **Replaced by:** `isFallbackNews` label and exclusion.
4. **First approach:** score `raw_prob` directly. **Problem:** `P_max = 0.688` made the NFR-4 Brier target unreachable for a perfect forecast. **Replaced by:** `calibrate_confidence_scale` normalization, with raw retained as telemetry.
5. **First approach:** treat `overall_confidence` as the forecast. **Problem:** its `0.50` uncorroborated-OSINT cap would clip every positive in the benchmark fixture. **Rejected:** keep it as telemetry only.
6. **First approach:** rely on the Google CBMi/Batchexecute decode. **Problem:** Batchexecute is an internal endpoint whose payload shape can drift; an undecodable token previously returned a Google search URL. **Replaced by:** deterministic publisher-host fallback plus a test that asserts no `google.` host for the undecodable case.

## 3. Concerns (open, evidenced)

1. **Benchmark-router test is red.** `test_get_benchmark_report` expects `true_positives == 34`; the normalized run produced `35`. No decision has been recorded on which is correct.
2. **No browser-level UI test** for archived tab/toast or fallback labels. TypeScript passing does not prove the rendered state.
3. **`isFallbackNews` uses object identity.** A cloned/serialized copy of the fixture would not be labelled.
4. **Two Brier scales coexist.** Any report that prints one without the other can mislead; the field names are the only guard.
5. **Canonical fallback is a publisher search page** when no permalink can be recovered. It is honest but not a permalink.
6. **Auth-first is tested, not enforced by a shared helper.** A future endpoint could reorder validation; the test protects this route only.

## 4. Mistakes not to repeat

- **Do not let archive/rejection UI reuse the success path.** Archived => Evidence + info; never Mitigation + savings + green toast.
- **Do not default a security/validation flag to `true`.** `?? true` turns missing data into a claim.
- **Do not count fallback data as live.** Label it and exclude it from live indicators.
- **Do not put body/UUID validation before authentication.** `401` must win over `422`; otherwise unauthenticated callers learn validation behavior.
- **Do not let Batchexecute be the only URL resolver.** It is an internal, drift-prone endpoint; keep a deterministic publisher fallback.
- **Do not compare a raw product Brier to a normalized NFR-4 target.** Name the scale in every report.
- **Do not silently change a benchmark expectation to make a test green.** The `34 -> 35` move needs a label/cut decision, not a constant edit.
- **Do not change the BMKG code mapping** (`60 -> 25 / 55`, `95/97 -> 65.5 / 87.5`) as a side effect of unrelated work.

## 5. Constraints carried into this phase

- DeepSeek subagents only, to keep the manager context uncluttered.
- Manager-only coordination; no direct manager edits.
- `git add .` then `git commit -m "docs(phases): pilot-to-real interference fixes + risk batch + walkthroughs"`, then `git push origin main` for Vercel visibility.
- Continue phase numbering from the observed maximum (96); no reused numbers.
- Final docs under `.planning/phases/`; no `%TEMP%`/`/tmp` artefacts.
- Keep the demo fixture intact and CPU routing only.
- Workflow constraint: **grill first, then boost** - interrogate scope/edge cases before broad implementation, and record what was verified versus what was only reported.
- `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example` are off-limits.
