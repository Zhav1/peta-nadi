# LEARNINGS — Phase 173.6: FIRMS Day Range

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**A cache/TTL can mask a deploy; verify the upstream semantics, not just
the status code.** The endpoint returned `200`. The key was valid. The
deploy was live. Every signal a monitoring system watches said "fine" —
and the count was zero because `day_range=1` means *today (UTC) only*,
which had not been published yet. The upstream was answering a different
question than the one we thought we asked.

Two defects had to be fixed together: the day range (`1` → `2`) and the
parser (dedup → stateless). Fixing either alone leaves `count: 0` with a
plausible explanation attached, which is the most expensive kind of bug
to leave behind.

## 2. Fixes tried (what worked, with file evidence)

1. **Correct window** — `FIRMS_API_DAY_RANGE = 2`
   (`nasa_firms_adapter.py:57`). The measured ladder is recorded in-source
   at `:51-55`: `day_range=1 → 0 rows`, `day_range=2 → 140 rows`,
   CSV 24h `→ 190 rows`.
2. **Stateless counter parse** — `routing_router.py` (+55/−) no longer
   routes the count through the poller's deduplicating parser, so 140
   rows stay 140.
3. **Cross-check instead of trust** — the CSV path validates the API
   path, so a key cannot cause an under-report (the commit subject is
   exactly this claim).
4. **Regression coverage** — `test_firms_keyless_fallback.py` (+104)
   pins the empty-vs-zero distinction.

## 3. Concerns (open)

1. `day_range=2` widens the window to two UTC days; "recent" now spans a
   slightly larger set than the operator might assume.
2. The empty-vs-zero distinction is now tested, but the general pattern
   (`200` on a not-yet-published resource) recurs across upstreams and
   is not centrally handled.
3. Production moved 0 → 140, which is a point-in-time figure; no
   sustained monitoring of the count is evidenced in this phase.

## 4. Conditions (observed this window)

- Production carries a live FIRMS key, so the keyless fallback from 168
  was never exercised by this incident — the keyed path itself was the
  defect.
- Operators read a `0` hotspot count as "safe to move"; a false zero is
  a safety statement, not a display bug.

## 5. Issues found (do not repeat)

1. Reusing a stream parser for a count is a semantic mismatch: dedup
   exists to suppress repeats over time, not to answer "how many now".
2. A header-only CSV body parses cleanly to zero rows; the parser must
   distinguish "no data published" from "no events found".
3. Two defects producing one symptom meant the first fix would have
   appeared to work in some conditions and failed in others. Reproduce
   to zero, then fix every contributing path.

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
