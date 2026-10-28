# LEARNINGS — Phase 176.8: News Legibility & Cache

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**Never let a pseudo-precision or honesty label be ellipsised.** A card
that said `Belum terverifikasi` was rendered as `Belum terveri…`. That
label exists precisely to tell the user how much to trust the item; cut
it and the user is left with a fragment that looks like a rendering
bug and reads like a non-answer. If the text does not fit, the layout
changes — not the claim.

**And: bump a cache namespace when a response contract changes.** After
176.7 normalised `regency` → `kabupaten`, the 24h Redis TTL outlived the
deploy, so `search:v2` kept answering with the retired `type:"regency"`
for a full day. The fix is not a purge; it is a version segment
(`GEOCODE_CACHE_VERSION = "v3"`) that is never read for an older value.

## 2. Fixes tried (what worked, with file evidence)

1. **Wrap, don't ellipsise** — the confidence value takes a second line;
   the truncating ancestor was removed rather than overridden.
2. **Measured occlusion into a CSS variable** — the banner reports its
   own height and the feed reserves it. Worked for the desktop case;
   failed once the container exceeded the viewport (176.9).
3. **Namespace bump with a proof** — `geocode_router.py:35` sets `v3`;
   versioned `search`/`reverse` prefixes; tests assert `v2` is never
   read. The in-file comment records the exact failure mode so the next
   contract change bumps it again.
4. **Config drift made explicit** — `playwright.vercel.config.ts`
   `testMatch` committed, prod-only spec ignored locally.

## 3. Concerns (open)

1. The CSS-variable clearance is a measurement and therefore wrong
   whenever the measured box is not the box that actually overflows.
   176.9 measures a 17.6px residual overlap and deletes the machinery.
2. `v2` keys stay in Redis until TTL expiry; orphaned data is acceptable,
   but a future "cleanup" that deletes them early must not resurrect
   reads.
3. The confidence label's new second line changes card height; any fixed
   row height downstream will clip it again.

## 4. Conditions (observed this window)

- The review was of live cards, not test fixtures — both defects were
  invisible to the suite.
- A deploy is not a data reset: Redis survives it, so any shape change to
  a cached payload needs an explicit invalidation story.

## 5. Issues found (do not repeat)

1. An ellipsis on an honesty or precision label silently changes its
   meaning; truncation there is a correctness bug, not a style issue.
2. Measuring clearance from the viewport fails when the scroller is not
   the viewport — overlap should be prevented by structure.
3. Changing a cached response's shape without bumping the namespace is a
   built-in 24h regression window.

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
- Cache TTLs can mask a deploy (FIRMS 1h, geocode 24h) — this phase is
  the worked example; verify with a cache-busting key or after expiry.
