# LEARNINGS — Phase 176.5: Mobile Map Legibility

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Look at the rendered screenshots — green tests do not prove layout.**
This phase exists because every spec passed (112 total after the fix,
and the suite was green before it) while a 390px screen showed a clipped
active tab, counters cut mid-pill, a Berita panel at nearly full width,
an overflowing dock, an unstyled Mapbox close button, and land/water
contrast near zero. None of those is a behaviour regression; they are
layout facts, and the suite was never asserting layout facts.

The practical rule: after any chrome or palette change, capture the
screen at 1920 **and** 390 and read the images. A passing suite bounds
logic, not geometry.

## 2. Fixes tried (what worked, with file evidence)

1. **Icon nav + overflow below `xl`** — a text tab row cannot fit at 390;
   replacing the row is the fix, not shrinking the font.
2. **Closed-by-default Berita bottom sheet** — a panel that costs width
   at rest should cost none until opened.
3. **Wrapping dock** — overflow avoided by structure rather than by
   cutting content.
4. **Map repaint within the sanctioned palette** — land `#0d1219`, water
   `#070a10`, coastline 6%: contrast restored without new hues.
5. **Popup close-button chrome** — closes the library-chrome gap left by
   Phase 176.

## 3. Concerns (open)

1. Closed-by-default Berita trades width for discoverability; 176.6
   immediately re-establishes which metrics must be visible at rest.
2. Below-`xl` overflow nav hides destinations behind a control; that
   control must exist at every width where the overflow applies.
3. The 175 palette reduction caused the contrast defect. Distillation
   without a contrast check can silently delete legibility.

## 4. Conditions (observed this window)

- The review was done at 390 — the width users actually hold — and at
  1920. Reports from one width did not predict the other.
- The Mapbox popup close button was still library-native because 176
  reset only `-content` and `-tip`, not the control.

## 5. Issues found (do not repeat)

1. A test suite that never asserts geometry will pass a broken layout
   forever; screenshots are the only cheap check for this class.
2. Reducing colour without measuring contrast trades "too loud" for
   "unreadable" — 176.5 had to restore land/water separation by hand.
3. Resetting a third-party component's content and tip is not resetting
   its controls; enumerate the library's injected elements.

## 6. Environment constraints (this checkout)

- Windows + PowerShell; backend interpreter is
  `backend/.venv/Scripts/python.exe` (Python 3.13.7), not bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; build before e2e, and
  `reuseExistingServer` can serve a stale build — a screenshot of a stale
  build is a screenshot of the wrong app.
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
