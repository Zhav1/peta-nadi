# WALKTHROUGH — Phase 173.6: FIRMS Day Range

**Mode:** docs-only. Source and tests untouched. Test and production
figures are those recorded for `299b4f9` / `c250a09`; they were **not
re-run** in this pass.

## What was done

1. Read the `299b4f9` diff (3 files, +192/−16).
2. Traced the reported symptom: valid key → `count: 0, status: "empty"`.
3. Confirmed root cause #1 in `nasa_firms_adapter.py:51-57`: the area
   API's `day_range` counts *calendar* days back from today, and
   `day_range=1` is **today only, not yet published** → header-only 200
   → zero rows.
4. Confirmed the measured ladder recorded in-source at `:51-55`:
   `day_range=1 → 0 rows`, `day_range=2 → 140 rows`, CSV 24h `→ 190 rows`.
5. Confirmed root cause #2: the counter path shared the poller's dedup
   parser, so even **140 real rows** collapsed to `0`.
6. Confirmed the fix: `FIRMS_API_DAY_RANGE = 2` (`:57`), a stateless
   parser for the counter, and a CSV cross-check in `routing_router.py`.
7. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Day range raised | `FIRMS_API_DAY_RANGE = 2` at `nasa_firms_adapter.py:57` |
| Semantics recorded | comment at `:51-55` — `day_range` counts calendar days back from today |
| Measured ladder | `1 → 0`, `2 → 140`, CSV 24h `→ 190` rows (in-source) |
| Second defect | counter reused the poller's dedup parser |
| Stateless parse | counter path in `routing_router.py` (+55/−) |
| Cross-check | CSV path validates the API path in the same commit |
| Regression test | `backend/tests/test_firms_keyless_fallback.py` (+104) |
| Production result | 0 → 140 — *recorded* |
| Merge | `c250a09` (R1.1) |

## Two defects, one symptom

```
defect 1:  day_range=1 ──> "today (UTC) only" ──> not published ──> 200 + header-only
                                                                   ──> parse ──> 0 rows

defect 2:  API returns 140 rows ──> dedup parser (poller semantics)
                                   ──> counter sees 0

symptom:   count: 0, status: "empty"   (looks identical to a quiet world)
```

## Deliberately NOT done

- No re-run of pytest or a production probe in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No attempt to reuse the dedup parser with a "raw count" flag — the
  counter path is stateless by design, not conditionally stateful.
- No change to the keyless CSV path from Phase 168.
