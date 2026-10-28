# LEARNINGS — Phase 176.7: Feed Supply & Type Vocabulary

**Window:** 2026-10-28 · Grounded facts only.

## 1. The single most valuable lesson

**One canonical name per province, with explicit aliases.** The bucket
was `"Bangka Belitung"`; the official name is `"Kepulauan Bangka
Belitung"`. The mismatch classified a real province's news as "not a
Sumatra province" and dropped it. Nothing logged, nothing failed — the
panel simply had fewer cards.

The second, equally load-bearing: **a vocabulary mismatch silently drops
data.** `regency` versus `kabupaten` is the same failure in a different
column. Neither bug would ever surface as an exception, which is why
neither was found by tests — they were found by auditing live breadth
against the list of provinces that should exist.

## 2. Fixes tried (what worked, with file evidence)

1. **Evidence-gated supply** — 8 feeds accepted only after HTTP 200 and
   parseable XML; 10 candidates rejected. Verified present in the tree:
   the alias string now appears in `news_extractor.py`,
   `news_router.py`, `geocoding_service.py`, `news_aggregator.py`, and
   `gazetteer_data.py`.
2. **Alias at every matcher, not one** — extractor, router, geocoder.
   Fixing one leaves the other two dropping the same rows.
3. **Type vocabulary normalised at the boundary** — `regency` →
   `kabupaten`, `city` → `kota`, `district` → `kecamatan`, applied at
   the API boundary and in the generator so the internal vocabulary
   cannot leak into responses.
4. **Breadth measured, not assumed** — the audit compared "provinces
   with source coverage" against "provinces with returned articles",
   which is the only way this class of bug appears.

## 3. Concerns (open)

1. Three matchers carry the alias by hand. A fourth matching path added
   later will drop the same rows, silently.
2. Feed liveness decays; 10 rejected candidates is a measured reminder
   that a probed feed is only good at probe time.
3. Any future province rename repeats this whole class of defect.

## 4. Conditions (observed this window)

- Users judge the news panel by whether their own province appears; 7/10
  reads as "the feed is broken", and for three provinces it was.
- Cache TTLs (geocode 24h) can keep serving pre-fix results after deploy,
  so a corrected alias may not be visible immediately.

## 5. Issues found (do not repeat)

1. An official name and an internal bucket key drifting apart is a
   silent data-loss bug; alias it explicitly at every comparison.
2. Mixed vocabularies (`regency` vs `kabupaten`) across a boundary drop
   rows without error — normalise at the boundary.
3. Adding feeds without probing them converts a visible gap into
   invisible empty cards.

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
- Cache TTLs can mask a deploy (FIRMS 1h, geocode 24h) — a corrected
  province alias is exactly the kind of fix a 24h cache hides; verify
  with a cache-busting key or after expiry.
