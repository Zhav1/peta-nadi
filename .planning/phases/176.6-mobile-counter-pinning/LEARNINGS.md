# LEARNINGS — Phase 176.6: Mobile Counter Pinning

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Primary metrics must be visible at rest, never behind a scroll.**
Three hazard counters — Cuaca, Waspada, Titik Panas — shared one
horizontal scroller with the legend toggles. The third counter, and
therefore a third of the situation picture, existed only to users who
guessed there was more to the right. A metric that requires an
undiscoverable gesture is, operationally, an absent metric.

The structural rule that came out of it: **"what is happening" is
pinned; "what am I filtering" scrolls.** Mixing the two in one row is
the bug, not the width of the row.

## 2. Fixes tried (what worked, with file evidence)

1. **Two rows, two jobs** — counters pinned; legend and filters moved to
   their own scrolling row. The scroller no longer hides a metric.
2. **Three equal pills** — equal width makes position learnable, so the
   third metric is reachable by muscle memory, not by reading.
3. **`aria-label` on the Berita toggle** — an icon-only control had no
   accessible name.
4. **`aria-expanded` on the same toggle** — the control now reports
   whether the sheet is open, not just that it exists.
5. **Mobile tests for the row** — 8 tests, so a future layout change that
   re-hides a counter fails instead of shipping.

## 3. Concerns (open)

1. The second row is still a scroll row; a future "primary" metric added
   there repeats this defect silently.
2. Equal-width pills at 390 leave little room for the label — 176.10 had
   to stack label-over-number because `Titik Panas` did not fit.
3. Three pinned pills is the budget. A fourth hazard class strains the
   row and needs a layout decision, not a narrower pill.

## 4. Conditions (observed this window)

- The report came from a phone at 390; the counters were reachable in
  desktop review, which is why the defect survived earlier phases.
- Users check hazard state in a glance, so a swipe is a real cost, not a
  minor inconvenience.

## 5. Issues found (do not repeat)

1. Sharing a scroller between metrics and controls puts the most
   important item last in an invisible list.
2. An icon-only toggle without `aria-label`/`aria-expanded` is invisible
   to assistive tech and ambiguous to everyone else.
3. Fixing width (pin, equal pills) moves the pressure into the label;
   plan the label treatment in the same change.

## 6. Environment constraints (this checkout)

- Windows + PowerShell; backend interpreter is
  `backend/.venv/Scripts/python.exe` (Python 3.13.7), not bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; build before e2e, and
  `reuseExistingServer` can serve a stale build — mobile specs are
  especially easy to run against an old bundle.
- Concurrent sessions share this checkout: never `git add -A` without
  authorisation; branch switches can carry another session's edits;
  port 3000 collisions poison a run.
- `DEEPSEEK_API_KEY` in `.env` is the placeholder
  `your-deepseek-api-key`; `OPENCODE_API_KEY` is real.
- Production: Vercel `pre-hub.vercel.app`, Render
  `peta-nadi.onrender.com`; `/health` reports
  `environment:"development"` because the Render blueprint is unsynced.
- Baseline backend failures: `test_impact_assessment`,
  `test_travel_fuel_guard` (×2),
  `test_cpu_routing_weather::…seed_fallback`.
- Cache TTLs can mask a deploy (FIRMS 1h, geocode 24h) — verify with a
  cache-busting key or after expiry.
