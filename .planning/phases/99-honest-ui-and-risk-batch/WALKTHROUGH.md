# Phase 99 - Walkthrough (what actually changed)

**Scope:** WP6 + WP7.
**Code state:** implemented in the working tree; this pass only adds `.planning/` documentation.
**Verified by:** TypeScript check, targeted pytest, and the manager's window log.

---

## 1. Changed files and line evidence

### 1.1 WP6 - honest UI

| File:line | Change |
|---|---|
| `frontend/hooks/useCrisisSimulationStream.ts:177-178` | Archived => `validated=false`; otherwise default is `false`, not `true`. |
| `frontend/hooks/useCrisisSimulationStream.ts:192` | Emits the computed `isValidated`. |
| `frontend/hooks/useNewsVerification.ts:850-854` | Adds exact-identity `isFallbackNews` and returns it. |
| `frontend/components/dashboard/DashboardClient.tsx:582` | Destructures `isFallbackNews`. |
| `frontend/components/dashboard/DashboardClient.tsx:1965-1990` | Archived detection, `Evidence` tab, `info` toast with archived explanation. |
| `frontend/components/dashboard/DashboardClient.tsx:2663-2667` | `Sumber Cadangan (Offline)` count while fallback is active. |
| `frontend/components/dashboard/DashboardClient.tsx:3000` | `isPihpsLive` excludes fallback news. |

### 1.2 WP7 - risk batch

| File:line | Change |
|---|---|
| `scripts/evaluate_metrics.py:39-50` | P_max rationale and formula. |
| `scripts/evaluate_metrics.py:164-180` | Normalized `forecast_prob`; `y_prob` uses it. |
| `scripts/evaluate_metrics.py:203` | `forecast_probability` per scenario. |
| `scripts/evaluate_metrics.py:231,272-274` | Raw vs normalized Brier fields. |
| `scripts/evaluate_metrics.py:291-305` | Methodology note; `overall_confidence` excluded. |
| `backend/app/services/news_aggregator.py:328-352` | Google redirect/AMP unwrapping. |
| `backend/app/services/news_aggregator.py:388,393-405` | `google.` host rejection + publisher fallback. |
| `backend/app/services/news_aggregator.py:459,469-472` | Async parity. |
| `backend/tests/test_audit_fixes.py:72-94` | `401` first, then authenticated `422`. |
| `backend/tests/test_cross_workstream_integration.py:83-110` | Direct URL, undecodable Google token, Google search rewrite, redirect unwrap. |

No change was made to `agents/llm_gateway.py`, `backend/tests/test_llm_gateway.py`, `.env.example`, or the BMKG warning-code mapping.

---

## 2. Verification results

### 2.1 Window-reported counts (manager log)

| WP | Reported result |
|---|---|
| WP2 (Brier context) | 41 passed, 1 failed (Brier) |
| WP6 | `tsc` PASS |
| Risk batch (WP7) | 14 passed |

### 2.2 Re-run during this docs pass

| Command | Result |
|---|---|
| `cd frontend; npx tsc --noEmit` | **exit 0**, no diagnostics |
| `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_audit_fixes.py backend/tests/test_cross_workstream_integration.py -q` | **10 passed** in 16.29 s |
| `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_benchmark_eval.py backend/tests/test_evaluation_router.py -q` | **7 passed, 1 failed** in 9.50 s |

The risk-batch subset re-run is 10, not 14; the additional four are in the broader window batch and were not re-executed here.

---

## 3. The Brier dual-scale decision

### 3.1 Problem

The consensus forecast is:

```
P = 1 - prod_k(1 - w_k * p_k)
```

With the active profile (`W 0.35, T 0.25, I 0.20, E 0.20`), even `p_k = 1.0` for every channel yields:

```
P_max = 1 - (0.65 * 0.75 * 0.80 * 0.80) = 0.688
```

Scoring that product against an NFR-4 Brier target biases every forecast low. This was the reported WP2 failure.

### 3.2 Decision

- NFR-4 scores `forecast_prob`, the consensus product normalized by the gate's own `calibrate_confidence_scale`.
- The raw product is retained as `raw_brier_score`, clearly labelled telemetry.
- The detection threshold remains `0.50` on the raw consensus; the equivalent normalized cut is `0.727`.
- `overall_confidence` is **not** substituted: its uncorroborated-OSINT cap of `0.50` would clip every positive in the benchmark fixture (no sensor proximity) to exactly `0.50`.

### 3.3 Observed side effect

`test_evaluation_router.py::test_get_benchmark_report` asserts `true_positives == 34`; the run produced `35` (`assert 35 == 34`). The confusion matrix still sums to 60, so this is a classification-boundary move caused by normalization, not a broken fixture. The expected constant was not updated in this window.

**This is an open failure, not a pass.** It must be resolved by deciding which label/cut is correct and updating the test or the scoring, with the decision recorded.

---

## 4. Behavior deltas an operator will see

1. A signal with no explicit `validated` flag is now unverified, not validated.
2. An archived signal opens `Evidence` with an informational toast; it no longer opens `Mitigation` with a success/savings message.
3. Offline news is counted as `Sumber Cadangan (Offline)` and cannot light the PIHPS indicator.
4. The evaluation report shows both scored (normalized) and raw Brier numbers, plus a per-scenario `forecast_probability`.
5. Google search links are rewritten to a publisher-host search/fallback page; redirect wrappers resolve to the publisher article.
6. An unauthenticated HITL call returns `401` even with an invalid body.

## 5. Demo integrity

- The fallback fixture is unchanged; only its label and its effect on the PIHPS indicator changed.
- No demo route, fixture payload, or replay script was edited.
- `tsc --noEmit` is clean, so the dashboard still compiles.

## 6. Residual risks

1. **Open benchmark-router failure** (`TP 35 != 34`) described above.
2. **No browser test** for the archived tab/toast or the fallback label; only TypeScript.
3. **Object-identity fallback flag** can be defeated by cloning the fixture array.
4. **Brier scale confusion** remains a documentation risk: any consumer that reads only `brier_score` must know it is normalized; any consumer that reads `raw_brier_score` must not compare it to the NFR-4 target.
5. **Canonical fallback is a search page**, not an article permalink, when the Google token cannot be decoded.
