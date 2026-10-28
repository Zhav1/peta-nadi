# LEARNINGS — Phase 175: Chrome Distillation

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Hue-per-layer does not scale.** With five counters and eight legend
entries, colour had become a naming scheme rather than an affordance:
every new layer demanded a new hue, and by the fifth one no user could
say what any colour meant. Shape + label carries meaning without
colour, and it keeps working for colour-blind users and in the
saturated, low-contrast conditions a map actually gets used in.

The second lesson: **deletion is the deliverable.** `cf2a1bb` is
+815/−507 across 9 files. A distillation phase that only adds neutral
wrappers has not distilled anything.

## 2. Fixes tried (what worked, with file evidence)

1. **One neutral pill recipe** — five hues → one recipe; active = white.
   The active state is now the only state that differs, which is exactly
   the one thing a user needs to see.
2. **Legend reduced to hazard semantics** — the hazard hues keep their
   meaning because they now mean one thing (danger) instead of "layer 4".
3. **Glyph + label instead of swatch** — the legend keeps its
   information when colour is removed.
4. **White active tab** — removes the second, competing emphasis colour.
5. **Map paint aligned to the published palette** — the map stopped
   being an independent colour system, so `DESIGN.md` became true of the
   whole surface.

## 3. Concerns (open)

1. Any new legend entry must arrive with a shape and a label; a swatch
   alone re-opens the hue-per-layer problem.
2. Static captures at 1920/390 were accepted as sufficient evidence in
   this phase, and 176.5 then found five layout defects at 390. A
   screenshot is weaker evidence than an interaction at that width.
3. Hazard hues are now load-bearing in the legend; adding a fourth
   hazard class needs a new channel (shape), not a new hue.

## 4. Conditions (observed this window)

- The screen read as "too colourful / not premium" to the user — the
  complaint was about chrome, not about data density.
- Map legibility is a downstream requirement; the palette reduction had
  to not destroy land/water separation (it came close: 176.5 measures
  near-zero contrast).

## 5. Issues found (do not repeat)

1. A colour per layer is a scalability bug that looks like a design
   choice; it fails at layer five, not layer two.
2. Reducing chrome without re-checking contrast can trade "neon" for
   "invisible" — 176.5 had to repaint land/water.
3. Before/after captures taken at two widths are not the same as
   reviewing those widths.

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
