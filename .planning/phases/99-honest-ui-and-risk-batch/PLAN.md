# Phase 99 - Honest UI and Risk Batch (WP6 + WP7)

**Status:** IMPLEMENTED in working tree; documented in this pass.
**Work packages:** WP6 (honest crisis simulation / fallback news / archived signals), WP7 (P_max-normalized evaluation, canonical publisher URLs, HITL auth-first test).
**Depends on:** Phase 97 (consensus profiles), Phase 98 (news provenance).

---

## 1. Goal

Make every surface that shows certainty tell the truth:

1. An archived consensus signal must never render as validated, and must open the evidence trail rather than the tactical Mitigation view.
2. Offline fallback news must be labelled as fallback, not counted as verified sources or as live PIHPS evidence.
3. NFR-4 must score a calibrated forecast that can actually reach 1.0, while keeping the raw product as explicit telemetry.
4. A canonical article URL must land on the publisher, never on a Google search/redirect host.
5. HITL authorization must be checked before body/UUID validation, so an unauthenticated caller gets `401`, not `422`.

---

## 2. Guardrails

- **DO NOT TOUCH** `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example`.
- Demo fixture remains intact; do not remove fallback data to make a label test pass.
- CPU routing only.
- No final docs in `%TEMP%` or `/tmp`.
- Manager coordinates; subagents write. No direct manager edits.
- Keep the BMKG warning-code mapping unchanged (`60 -> 25 / 55`, `95/97 -> 65.5 / 87.5`).
- Keep 401-first ordering: authentication is a dependency, not a branch after parsing.
- Keep the canonical publisher fallback: if a Google token cannot be decoded, return a publisher-host deep link, never a Google search URL.

---

## 3. WP6 - Honest UI

### 3.1 Simulation stream

| File:line | Change |
|---|---|
| `frontend/hooks/useCrisisSimulationStream.ts:177-178` | `isArchived` is derived from `parsed.status ?? state.status`; `isValidated` is forced `false` when archived, otherwise `parsed.validated ?? state.validated ?? false`. |
| `frontend/hooks/useCrisisSimulationStream.ts:192` | The emitted state uses `validated: isValidated`. |

Why: the previous default was `?? true`, so a payload without an explicit flag was rendered as validated. An archived signal could therefore look successful.

### 3.2 Dashboard

| File:line | Change |
|---|---|
| `frontend/components/dashboard/DashboardClient.tsx:582` | Consumes `isFallbackNews` from the hook. |
| `frontend/components/dashboard/DashboardClient.tsx:1965-1990` | `isArchived = status === 'archived' || validated === false`; archived opens `Evidence`, not `Mitigation`; the toast is `info` with the archived explanation instead of a success/savings message. |
| `frontend/components/dashboard/DashboardClient.tsx:2663-2667` | Source count reads `Sumber Cadangan (Offline)` while the fallback fixture is active. |
| `frontend/components/dashboard/DashboardClient.tsx:3000` | `isPihpsLive` excludes fallback news; offline news can no longer make the PIHPS indicator look live. |

Why: the archive path previously fell through to the tactical view and a success toast. That masked a rejection as a completed decision.

### 3.3 Fallback flag

| File:line | Change |
|---|---|
| `frontend/hooks/useNewsVerification.ts:850-854` | `isFallbackNews = newsFeed === FALLBACK_SUMATRA_NEWS`; returned by the hook. |

The identity check is exact: live or warming-but-cached real articles are not labelled fallback.

---

## 4. WP7 - Risk batch

### 4.1 P_max-normalized Brier (dual scale)

| File:line | Change |
|---|---|
| `scripts/evaluate_metrics.py:39-50` | Documents the structural cap `P_max = 1 - prod(1 - w_k) = 0.688` for the active profile. |
| `scripts/evaluate_metrics.py:164-180` | `forecast_prob = calibrate_confidence_scale(raw_prob, active_sources, SENSOR_WEIGHTS_ECONOMIC_ACTIVE)`; `y_prob` stores the normalized forecast. |
| `scripts/evaluate_metrics.py:203` | Per-scenario `forecast_probability` is reported. |
| `scripts/evaluate_metrics.py:231,272-274` | Reports `raw_brier_score` (product) and `normalized_brier_score` (scored). |
| `scripts/evaluate_metrics.py:291-305` | Methodology note: detection cut stays `0.50` on the raw consensus (equivalent normalized cut `0.727`); `overall_confidence` is telemetry, not the forecast. |

Decision: **two scales are kept, explicitly named.** NFR-4 scores the normalized forecast; the raw product remains visible so the structural error is not hidden. `overall_confidence` is not substituted because its uncorroborated-OSINT cap (`0.50`) would clip every positive in a fixture with no sensor proximity.

### 4.2 Canonical publisher URLs

| File:line | Change |
|---|---|
| `backend/app/services/news_aggregator.py:328-352` | Unwraps `google.com/url?q=`, `news.google.com/redirect?url=`, and `google.com/amp/s/<publisher>/...`. |
| `backend/app/services/news_aggregator.py:388` | Host check rejects `google.` (not only `google.com`). |
| `backend/app/services/news_aggregator.py:393-405` | Google search/landing URLs map to `_map_publisher_deep_fallback(title, source)`, never echoed downstream. |
| `backend/app/services/news_aggregator.py:459,469-472` | Async resolver uses the same host rules. |
| `backend/app/services/news_aggregator.py:206` | `_map_publisher_deep_fallback` is the publisher-host fallback. |

### 4.3 HITL auth-first

| File:line | Change |
|---|---|
| `backend/tests/test_audit_fixes.py:72-94` | Missing bearer token asserts `401`; an authenticated Dispatcher token plus a non-UUID `approval_id` asserts `422`. |
| `backend/tests/test_audit_fixes.py:13` | Imports `create_guest_token` / `ROLE_DISPATCHER` for the authenticated half. |

This preserves the API contract: authentication is evaluated before request-body validation. A `422` without a token would leak validation behavior to unauthenticated callers and break the auth-first rule.

---

## 5. Acceptance criteria

- [x] An archived payload cannot produce `validated: true`.
- [x] Archived signals open `Evidence` and show an `info` toast, never a success/savings toast.
- [x] Fallback news is labelled and cannot make PIHPS look live.
- [x] NFR-4 is scored on the normalized forecast, with raw product Brier retained as telemetry.
- [x] Detection uses the unchanged `0.50` raw consensus cut.
- [x] Canonical URLs never return a Google search/redirect host; undecodable tokens use the publisher fallback.
- [x] HITL returns `401` before `422`.
- [x] BMKG mapping untouched.

## 6. Verification plan

```powershell
cd frontend; npx tsc --noEmit
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_audit_fixes.py backend/tests/test_cross_workstream_integration.py -q
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_benchmark_eval.py backend/tests/test_evaluation_router.py -q
```

## 7. Open concerns

- The P_max normalization changes one benchmark classification: the evaluation router test asserts `true_positives == 34`, but the normalized forecast produces `35`. The expectation was not updated in this window.
- The UI honesty changes have TypeScript coverage only; no browser test asserts the archived tab/toast or the fallback label.
- `isFallbackNews` relies on object identity (`newsFeed === FALLBACK_SUMATRA_NEWS`); a cloned fallback array would defeat the label.
- The canonical URL fallback returns a publisher *search* page when no article permalink exists. That is deliberate, but it is not a permalink.
