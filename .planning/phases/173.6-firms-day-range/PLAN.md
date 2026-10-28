# PLAN — Phase 173.6: FIRMS Day Range

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `299b4f9` — `fix(m9-173.6): FIRMS API cross-check so a key cannot under-report hotspots`; merged as `c250a09` (`R1.1`)

## Objective

Explain a production contradiction: with a **valid** FIRMS key, the
hotspot endpoint reported `count: 0, status: "empty"`. Nothing was
broken, nothing errored — the system confidently reported a quiet world.

## Root cause (two independent defects, same symptom)

1. **`day_range=1` means "today (UTC) only" and is not yet published.**
   The upstream answers `200` with a header-only CSV, which parses to
   zero rows. A success status with no data is not evidence of no fires.
2. **The counter reused the poller's dedup parser.** Even when the API
   returned **140 real rows**, the deduplicating path reduced them to
   `0` for the counter's purposes.

Either defect alone produces `count: 0`. Fixing one would have left the
bug alive behind a plausible explanation.

## Scope IN

- `backend/app/adapters/nasa_firms_adapter.py` (+49/−):
  `FIRMS_API_DAY_RANGE = 2` (`:57`), with the measured ladder recorded
  in-source at `:51-55`: `day_range=1 → 0 rows`, `day_range=2 → 140 rows`,
  CSV 24h file `→ 190 rows`.
- `backend/app/routers/routing_router.py` (+55/−): stateless parse for
  the counter path, plus a CSV cross-check so a key cannot under-report.
- `backend/tests/test_firms_keyless_fallback.py` (+104): regression
  coverage for the empty-vs-zero distinction.

## Scope OUT

- No change to the keyless CSV path established in 168.
- No change to hotspot thresholds or rendering.
- No new upstream.

## Decisions locked

1. **A status code is not a data guarantee.** `200` with a header-only
   body is a "not published yet" signal, not an empty world.
2. The counter must be **stateless**. A dedup parser is correct for a
   stream and wrong for a count.
3. Cross-check, don't trust: the CSV path validates the API path, so a
   key cannot silently reduce the reported count.
4. Record the measured ladder in-source, so the next reader knows why
   `2` and not `1`.

## Result

Production count moved **0 → 140**.

## Risk notes

- `day_range=2` widens the window to two UTC days. That is the smallest
  value that returns published data; it does not change the meaning of
  "recent" for the operator as much as it changes availability.
