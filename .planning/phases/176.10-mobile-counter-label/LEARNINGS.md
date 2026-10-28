# LEARNINGS — Phase 176.10: Mobile Counter Label

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**If a primary label cannot fit, change the layout, not the wording.**
The counter rendered `Titik Pa…`. The three available "fixes" were to
widen the pill, shrink the type, or rename the metric — and only one of
them addresses the actual defect. Renaming `Titik Panas` to save pixels
would have permanently degraded a hazard class's name to protect a
layout that was simply wrong.

The stacked grid gives the label the full pill width instead of making
it compete with the number for one line. Acceptance was measured:
`scrollWidth` / `clientWidth` = **99 / 99** on all three counters.

## 2. Fixes tried (what worked, with file evidence)

1. **Stack below `md`** — dot column 1; label column 2 row 1; number row
   2. The label stops sharing a line with the numeral.
2. **Leave desktop alone** — the constraint only exists at narrow
   widths; changing the desktop arrangement would have been scope creep
   with its own regression risk.
3. **Measure the fit** — 99/99 at all three pills is a checkable
   criterion, not a visual impression.
4. **Preserve accessible names** — restructuring the visual tree did not
   change what a screen reader announces, which is the part a layout
   change usually breaks.
5. **Two-file diff** — +153/−8; the fix is confined to the component and
   its coverage.

## 3. Concerns (open)

1. Two-line counters are taller; the pinned row (176.6) has to absorb
   that height at every width where the grid applies.
2. The grid uses explicit placement (column 1 / column 2 row 1 / row 2),
   so copying the pattern elsewhere requires copying the placement too.
3. A future longer hazard name fits only because of the stacked layout —
   that headroom is now load-bearing and undocumented outside this file.

## 4. Conditions (observed this window)

- The pill width is fixed by the three-equal-pills decision in 176.6;
  the label had to fit a width it did not choose.
- Truncation on a primary metric reads as broken UI even though the
  number underneath is correct.

## 5. Issues found (do not repeat)

1. Accepting `…` on a primary label defers a layout bug into a wording
   debate.
2. Shrinking type to fit a label collides with the 12px floor agreed in
   Phase 174; the floor exists to stop exactly this trade.
3. A layout fix that silently changes the accessible name is a
   regression disguised as a visual change — assert the name.

## 6. Environment constraints (this checkout)

- Windows + PowerShell; backend interpreter is
  `backend/.venv/Scripts/python.exe` (Python 3.13.7), not bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; build before e2e, and
  `reuseExistingServer` can serve a stale build — the old truncated label
  will render happily from a stale bundle.
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
