# LEARNINGS — Phase 176.9: Guest Banner Dock

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Overlap must be prevented by layout structure, not by measured
padding.** Phase 176.8 measured the banner's occlusion into a CSS
variable and reserved that space. The measurement was correct in the
box it measured and wrong in the box that mattered: it used the viewport
while the mobile sheet extended past it, leaving a **17.6px** overlap
and a clipped footer.

Phase 176.9 replaced the number with a column: header → filters →
`min-h-0` scroll list → docked banner → footer. Siblings cannot overlap
siblings. **A measurement can be wrong; a structure cannot be
off-by-seventeen-pixels.**

## 2. Fixes tried (what worked, with file evidence)

1. **Dock instead of float** — the banner occupies a slot in the column
   rather than hovering above content.
2. **`min-h-0` on the scroll region** — without it a flex child refuses
   to shrink and the original overflow returns; with it, the list absorbs
   the pressure.
3. **One ordering for two containers** — desktop panel and mobile sheet
   share the same column definition, so the two cannot drift.
4. **Delete, don't disable** — the `ResizeObserver` and clearance
   padding were removed (recorded at `GuestEvaluationBanner.tsx:19`); an
   inert workaround gets re-enabled by the next reader.
5. **Small, reviewable diff** — 8 files, +163/−17; the fix is dominated
   by deletion, which is what makes it trustworthy.

## 3. Concerns (open)

1. `min-h-0` is load-bearing and easy to drop in a refactor; removing it
   restores the bug with no test necessarily catching it.
2. Column ordering is now a contract. Inserting an element between the
   list and the banner changes the arithmetic implicitly.
3. The mobile sheet and the desktop panel share structure but not every
   constraint; a change validated on one width still needs the other.

## 4. Conditions (observed this window)

- The defect was reported against the mobile sheet specifically; desktop
  looked acceptable, which is why a viewport-relative measurement seemed
  reasonable when written.
- A guest banner that covers the last card is a conversion and a trust
  problem, not only a cosmetic one.

## 5. Issues found (do not repeat)

1. Measuring clearance relative to the viewport fails whenever the
   scrolling container is not the viewport.
2. Leaving the superseded measurement code in place invites a regression;
   the workaround must be deleted with the fix.
3. Two containers rendering the same panel will diverge unless they
   share one structural definition.

## 6. Environment constraints (this checkout)

- Windows + PowerShell; backend interpreter is
  `backend/.venv/Scripts/python.exe` (Python 3.13.7), not bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; build before e2e, and
  `reuseExistingServer` can serve a stale build — a stale build will
  happily show the old floating banner.
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
