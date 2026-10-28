# LEARNINGS — Phase 176: Branded Tooltips & Motion

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Mapbox popups render outside React, so they need global CSS and manual
escaping.** A popup's HTML is injected by the mapping library into its
own container. React's scoping, JSX escaping, and component styles all
stop at that boundary. Two consequences, both load-bearing here:

- styling must be global (`.ds-popup`, plus resets for
  `.mapboxgl-popup-content` / `-tip`), or it silently does nothing;
- content must be escaped by hand, because there is no JSX to do it.
  Hence `mapPopup.ts` as pure builders that pass every field through
  `escapeHtml` and clip it with `cap` before insertion.

## 2. Fixes tried (what worked, with file evidence)

1. **Pure string builders** — weather / FIRMS point / FIRMS cluster are
   testable without a map instance; XSS payloads render as literal text.
2. **Clip before escape** — `cap()` bounds length, so a hostile or
   pathological field cannot become an unbounded layout.
3. **One anatomy for three popup kinds** — label 62%, rule, footer 38%,
   320px max; the three read as one object.
4. **Library resets alongside the class** — `.mapboxgl-popup-content`
   and `-tip` neutralised, otherwise the default white card shows
   through the branded one.
5. **Motion budget + a single pulse** — 120–300ms, one curve, one 2.4s
   live indicator; more than one simultaneous pulse reads as an alarm.
6. **Reduced motion off switch** — not a shortened duration; users who
   ask for no motion get none.
7. **Overlay contract applied to four surfaces at once** — HITL, route
   modal, fleet drawer, auth, so overlays cannot drift family by family.

## 3. Concerns (open)

1. The library's own close button was not covered; 176.5 found it as an
   unstyled white square. Any library-injected element is in scope.
2. `escapeHtml` protects inserted text, but a future builder concatenating
   raw fragments would bypass it; the invariant is per-interpolation.
3. One 2.4s pulse is a budget, not an enforced limit; nothing counts
   pulses at runtime.

## 4. Conditions (observed this window)

- Popups are the primary way users read a zone; an unstyled library card
  reads as a bug even when the numbers are right.
- Motion should explain a state change (drawer arrives, modal opens), not
  decorate a static screen.

## 5. Issues found (do not repeat)

1. Styling a third-party-injected DOM from a React-scoped stylesheet is a
   no-op you cannot see in tests.
2. Escaping at the call site is a rule people forget; escaping inside the
   builder is a property of the builder.
3. "Add a pulse" without a budget ends with several pulsing elements
   competing for the same attention.

## 6. Environment constraints (this checkout)

- Windows + PowerShell; backend interpreter is
  `backend/.venv/Scripts/python.exe` (Python 3.13.7), not bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; build before e2e, and
  `reuseExistingServer` can serve a stale build.
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
