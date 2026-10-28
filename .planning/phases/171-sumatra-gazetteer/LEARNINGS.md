# LEARNINGS — Phase 171: Sumatra Gazetteer

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**Never guess coordinates.** 23 rows — Natuna, Belitung Timur, and 21
kecamatan — could not be placed, and the phase shipped without them. A
fabricated coordinate is not a small inaccuracy: it silently reroutes a
trip, mislabels a hazard, and looks exactly as confident as a real one.
An absent row produces a visible miss; a guessed row produces an
invisible error.

The operating lesson is that the dataset boundary is a decision to be
written down, not a gap to be closed before shipping.

## 2. Fixes tried (what worked, with file evidence)

1. **Real catalogue instead of slug matching** — 2,096 records in
   `sumatra_admin_gazetteer.json` (118 kabupaten, 34 kota, 1,944
   kecamatan), built from wilayah.id + OSM + Wikidata.
2. **Reproducible build** — `scripts/build_sumatra_gazetteer.py`
   (+1,294, new) generates the JSON; the dataset is auditable rather
   than hand-curated.
3. **Fuzzy + diacritic-insensitive matching** in `gazetteer_data.py`
   (+281), with `aliases` stored per record so canonical names stay
   clean.
4. **Honest offline state for `desa`** — `geocode_router.py` (+152)
   defers to Nominatim and states that it is offline instead of failing
   or inventing a result.
5. **Coverage asserted, not assumed** — `test_gazetteer_coverage.py`
   (146 lines) and a 10/10 city spot-check within 15 km.

## 3. Concerns (open)

1. 23 rows remain unplaced. Any future "completion" pass must add
   sources, not interpolation.
2. `desa` coverage is network-dependent by design; the offline state is
   honest but means village-level search is unavailable in the field.
3. The 2,096 figure is a snapshot of three upstreams; upstream admin
   changes (splits, renames) will drift it, and nothing currently warns
   on drift.

## 4. Conditions (observed this window)

- Field use happens with poor or no connectivity; the offline set is the
  product, and the network path is an enhancement.
- Operators type what they say out loud — aliases and diacritics matter
  more than exact spelling.

## 5. Issues found (do not repeat)

1. Slug-only search is a data-model leak: it exposes storage keys as the
   user interface.
2. A tiny catalogue cannot be fixed by better matching — both the data
   and the matcher were wrong here.
3. Counting the dataset from the file (2,096) rather than trusting a
   build log is what let the 118/34/1,944 split be stated with
   confidence.

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
