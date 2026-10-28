# LEARNINGS — Phase 174: Design Contract (Distilled Command Surface)

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Write the contract and its ratchet before the first pixel.** Every
later phase in this milestone (175 chrome, 176 overlays, 176.11 palette
revision) argues against a written text instead of against a screenshot.
That is what made the 176.11 reversal cheap: the contract was a document
to amend, not a mood to renegotiate.

The corollary: **zero visual change is a valid phase.** `1f5485c` is
+530/−0 across 7 files and moves nothing on screen. It still removed the
largest source of rework in the milestone, because it fixed vocabulary
(`--ds-*`, `designTokens.ts`) and the definition of "clean" first.

## 2. Fixes tried (what worked, with file evidence)

1. **Named surfaces instead of ad-hoc greys** — three surfaces plus two
   border opacities replace per-component judgment.
2. **One data accent** — `#38b8f8` only; a second accent was the actual
   mechanism behind the neon drift.
3. **A ban list built from shipped code** — the token baseline proved a
   panel border was literally `#1c2432`, so the list describes the
   disease rather than a preference.
4. **Ratchet with a grow-only list** — `CLEANED_FILES` starts small and
   is appended by each later phase; documented removal path is deleting
   the file, because a shrinking list un-enforces a file that still
   exists.
5. **Independent oracle in the spec** — `EXPECTED_BANNED` is re-stated
   in the test, so widening the token file cannot silently widen the
   gate.

## 3. Concerns (open)

1. `--ds-*` vars and `designTokens.ts` must be edited together.
2. Mapbox paint is an agreed exception zone (`components/map/`), which
   means the ban list is not absolute and reviewers must know the
   boundary.
3. The ratchet intentionally does not scan the whole dashboard; coverage
   only grows as files are cleaned, so "green" is not yet "clean".

## 4. Conditions (observed this window)

- The milestone needed a single visual authority; per-phase taste calls
  had already produced five-hue counters and eight-hue legends.
- Shipping UI has to outrank an aesthetic rule when a user asks for
  colour; 176.11 later proves the contract must be amendable
  (see that phase's "Operational layer palette").

## 5. Issues found (do not repeat)

1. Enforcing a ban list across a tree that still violates it teaches the
   team to ignore red gates — scope the gate to what is actually clean.
2. A ratchet list that can shrink silently disables enforcement for a
   file that still exists.
3. Rules written as adjectives ("premium", "clean") cannot be tested;
   the phase had to convert each into a value or a count.

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
