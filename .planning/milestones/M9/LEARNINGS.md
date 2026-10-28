# M9 — Milestone Learnings

**Milestone:** M9 "Operational Truth & Distilled Command Surface" · **Phases:** 167 → 176.12 (21 folders) · **Window:** 2026-10-27 → 2026-10-28
**Rollouts:** R1 → R1.1 → R2 → R2.1 → R2.2 → R2.3 → visual → fleet · **Spec:** `SPEC.md` · **Ledger:** `PROGRESS.md`, `COMPLETION.md`
Cross-phase synthesis only; phase-local detail stays in `.planning/phases/<phase>/LEARNINGS.md`. Anything not evidenced is marked **unverified**.

---

## A. Context and environment actually encountered

1. **Windows + PowerShell everywhere.** No `&&`, no `grep`, no heredocs in the shell used for every phase; the workaround was separate statements plus `Select-String`.
2. **Backend interpreter is never a bare `python`.** It is `backend/.venv/Scripts/python.exe` (Python 3.13.7); a bare `python` resolves to a different environment and produces import errors that look like code defects.
3. **Playwright serves the prebuilt bundle.** `webServer` runs `frontend/.next/standalone/server.js`, so a suite measured before `cd frontend; npm run build` measures the previous source tree. `reuseExistingServer` makes it worse: it serves a stale build happily, and the run is green against code that no longer exists.
4. **Two milestones coexisted.** M8 "Fast & Durable" (160–166) was already committed and independently valid; M9 was numbered after it (167–176.12). M8 was left intact — including `160-baseline-audit-state-repair/` and `BASELINE.md` — and nothing was renumbered or absorbed. The reconciliation lives in `SPEC.md` and `ROADMAP.md`.
5. **Concurrent sessions shared one checkout.** Observed, not theorised: branch switches carried another session's uncommitted edits; `git add -A` was avoided for the whole milestone until the user authorised it for this commit; killing whatever held port 3000 poisoned another session's Playwright run. Mitigation: stage explicit paths, tag before merge, read `git status --porcelain` before every commit.
6. **Free subagent model quota was exhausted mid-run;** a fallback model finished the work. Evidence density is therefore uneven across phases — absent evidence is recorded as absent, never reconstructed.
7. **`.env` facts (checked by length/shape; values not printed):** `DEEPSEEK_API_KEY` is the placeholder `your-deepseek-api-key` (21 chars); `OPENCODE_API_KEY` is real (`oc_s…`, 51 chars); `NASA_FIRMS_MAP_KEY` exists (`8a46…`, 32 chars), so 168's keyless path was never exercised by the 173.6 incident.
8. **Production:** frontend `pre-hub.vercel.app` (Vercel), backend `peta-nadi.onrender.com` (Render). `/health` reports `environment:"development"` because the Render service is not synced from `render.yaml`.
9. **Baseline backend failures pre-date M9** and are not regressions: `test_impact_assessment` (wall-clock latency budget), `test_travel_fuel_guard` ×2 (Starlette constant drift), `test_cpu_routing_weather::…seed_fallback` (needs a live TomTom cache). Baseline 516 passed / 4 failed of 520 — `.planning/milestones/M9/r1-pytest.txt`.

---

## B. Issues found and their root causes

- **167** — Counters were derived from `advisoryFeatures` (what is drawn) and answered "how many are on screen", not "how many exist"; every toggle silently rewrote a factual claim. Unknown rendered as `0`.
- **168** — The documented per-country FIRMS CSV returns **404 in production**, and the 404 was absorbed into "no hotspots". A bare `hotspots: []` array cannot express degraded-versus-empty.
- **169** — `_CORRIDOR_SPINE`, written to *order* requests, had become the predicate for what *exists*; off-corridor zones vanished with no error. `GRID_KEEP_RADIUS_KM = 60` deleted nine provinces of grid points. TTL equal to the poll interval manufactured a visible gap every cycle.
- **170** — Unbounded nearest-node snapping returned nodes in other provinces; origin and destination could collapse to one node (zero-length route); a retry without a distance floor returned the same junction under a new id; and a correct `status: "no_route"` was swallowed by the frontend into a blank panel.
- **171** — OSM Indonesia carries **two incompatible `admin_level` schemes** (newer: kabupaten/kota = 5, kecamatan = 6; older: kecamatan = 7, sometimes kabupaten = 6). Querying only 6/7 returned 1,298 elements with zero kabupaten for Sumbar/Sumut. Slug-only matching leaked storage keys into the UI.
- **172** — The visible symptom (Aceh dominance) pointed at the feeds; measurement said **149 of the 150 newest articles were dropped by the crisis gate**. `base_conf = 0.94 if TIER_1 else 0.86` labelled a tier constant as confidence. A missing province defaulted to `"Sumatera Utara"`, converting absence into a false assertion.
- **172.5** — "0 crisis" and "0 news" rendered identically; the gate had no named destination for the ~99% it rejected.
- **173** — `TenantFleetRoster` was imported, typed and exported but **mounted nowhere**; `isRosterVisible` toggled nothing. A missing coordinate was substituted with Medan — fabricated data that renders as data.
- **173.5** — `phase57-pilot-hardening.spec.ts` was already red at HEAD (8 failures); only specs near current work were run, so every "tests pass" claim was a subset claim.
- **173.6** — `FIRMS_API_DAY_RANGE = 1` means **today (UTC) only**, and NASA had not published today: a 200 with a header-only body parsed as a truthful zero. The count also passed through the poller's **deduplicating** parser, whose job is suppressing repeats, not answering "how many now".
- **174** — No written contract existed, so "distilled" was renegotiated per screen; the ban list had to be derived from shipped code (a panel border was literally `#1c2432`), not from preference.
- **175** — Hue-per-layer did not scale: five counters and eight legend entries turned colour into a naming scheme, and the palette reduction then caused a 390 px contrast defect.
- **176** — Mapbox popups render outside React, so component styles, JSX escaping and scoping all stop at the boundary; unescaped fields were an XSS sink and library chrome (`.mapboxgl-popup-content`) showed through.
- **176.5** — 112 specs were green while a 390 px screen showed a clipped active tab, counters cut mid-pill, an overflowing dock, an unstyled close button and near-zero land/water contrast. The suite asserts logic, not geometry.
- **176.6** — Three hazard counters shared one horizontal scroller with the legend, so a third of the situation picture existed only for users who guessed there was more to the right.
- **176.7** — Province bucket `"Bangka Belitung"` vs official `"Kepulauan Bangka Belitung"` classified real news as "not Sumatra" and dropped it silently; `regency` vs `kabupaten` was the same failure in another column.
- **176.8** — The honesty label (`Belum terverifikasi`) was ellipsised to `Belum terveri.`, and clearance was measured against the **viewport** while the scroller extended past it. A 24 h Redis TTL outlived a contract change, so `search:v2` kept serving retired `type:"regency"` for a day.
- **176.9** — Measured padding still left **17.6 px** of overlap plus a clipped footer, because the mobile sheet overflowed its own box. R2.2 then caught a **duplicated React mount**: `<GuestEvaluationBanner />` in both `page.tsx:24` and `DashboardClient.tsx:4119`, introduced because the local green run was measured against a tree where the other session had already deleted one mount — uncommitted at merge time.
- **176.10** — A fixed-width equal-pill row truncated the primary label to `Titik Pa.`; the three "fixes" on offer were widen, shrink type below the 12 px floor, or rename the metric — all wrong.
- **176.11** — User visual feedback overrode the 174 palette; shipping colour without amending `DESIGN.md` and the ratchet allowlist would have turned the gate red and taught the team to ignore it.
- **176.12** — A `['zoom']` expression nested inside a `case` branch made `addLayer` throw for `circle-stroke-opacity`; the throw sat inside a silent `try/catch`, so the fleet layer never existed while counters reading the same array kept counting. TypeScript cannot see this class of error.

---

## C. Rules to avoid repeating them

1. **Counters read world truth, never UI state.** A number that is a fact must not be derived from a filtered or visible array.
2. **Degraded is `null`/`—`, never `0`.** Zero is a measurement; unknown is not. Same rule bans defaulting a missing province to the most common name.
3. **Never nest `['zoom']`.** Legal only at the top level of a `step`/`interpolate`; TypeScript will not catch it.
4. **Validate paint with style-spec, and never swallow `addLayer` errors.** A caught layer failure is an invisible outage — log it and surface it.
5. **Verify upstream URL and semantics before pinning them.** One live request per new external path before merge; a documented endpoint can 404, and a 200 can mean "not published yet".
6. **Compute the daily API budget before widening coverage.** Write the number down: sharing one snapshot took 16,704 → 8,352 calls/day.
7. **A priority list may order work; it must never filter existence.** If a constant decides what is queried *first*, it must not decide what is real.
8. **No silent early returns on failure paths.** If the backend emits a `status`, the frontend renders it or refuses.
9. **Provenance must be visible whenever data or geometry is approximated:** 75 km snaps get a badge, regional news gets a tier label, fallback sources get a `source` field.
10. **Measure before theorising.** Run the diagnostic (`/news/yield`) before tuning a quota; 149/150 explained what a feed-bias theory did not.
11. **Add a labelled tier instead of weakening a precision gate.** Precision is a safety property; breadth is bought with a label, not a lower threshold.
12. **One canonical province name plus explicit aliases, applied at every matcher.** Fixing one matcher leaves the others dropping the same rows.
13. **Normalise vocabulary at the contract boundary** (`regency`→`kabupaten`, `city`→`kota`, `district`→`kecamatan`); storage names must never reach the API.
14. **Bump the cache namespace whenever a cached response contract changes.** A 24 h TTL is a built-in day-long regression window.
15. **Prevent overlap by layout, not by measurement.** A measurement can be wrong by 17 px; sibling order in one column cannot overlap.
16. **Never ellipsise a precision or honour label.** If it does not fit, change the layout — not the claim, and never the type below the 12 px floor.
17. **Re-run the full suite before assuming a green baseline.** Frozen specs drift; a subset run is a subset claim.
18. **Look at screenshots at 1920 and 390 after any chrome, palette or layout change.** Green tests do not prove layout; static captures are weaker evidence than an interaction at that width.
19. **Primary metrics must be visible at rest.** "What is happening" is pinned, "what am I filtering" scrolls; never mix the two in one row.
20. **Update the written design contract when user feedback overrides it** — same commit as the UI, ratchet allowlist amended.
21. **Audit JSX mounts, not imports.** A symbol in the bundle proves the compiler is happy, not that a user can see anything.
22. **Never fabricate a coordinate, a location or a count.** An unplaceable row is dropped and counted; a guessed row is an invisible error.

---

## D. Open items and their exact status

| # | Item | Status |
|---|---|---|
| 1 | `/health` reports `environment:"development"` on Render | **Open, cosmetic.** `render.yaml` exists; the service is not synced from the blueprint. Not fixed by M9. |
| 2 | Riau and Kepulauan Riau have no articles in the 48 h window | **Open, upstream.** `/news/live` present 8/10 provinces at R2.2 smoke (9/10 at R2.1); honest empty state and chip fallback render. Not a gate or layout defect. |
| 3 | `cuaca.count` sometimes reads `1` | **Open, supply.** One qualifying disruption zone at probe; `status:"ok"`. The counter is truthful; do not pad it. |
| 4 | 4 baseline backend failures | **Open, pre-existing.** `test_impact_assessment`, `test_travel_fuel_guard` ×2, `test_cpu_routing_weather::…seed_fallback`. Red before phase 167 and unrelated to M9 paths. |
| 5 | 23 gazetteer rows unplaceable (Natuna, Belitung Timur, 21 kecamatan) | **Open as a dataset boundary.** Natuna and Belitung Timur resolve with `type:"kabupaten"`; the 21 kecamatan are dropped, not interpolated. Needs new sources, not maths. |
| 6 | BMKG province-level DigitalForecast | **Deferred.** Documented endpoints 301 away and no public province contract. |
| 7 | `/news/live` returns `truncated: true` | **Open by design.** Budget 150; 37–39 articles survived at probe, so nothing observable is lost. |
| 8 | `.planning/STATE.md` body | **Was stale** (still described M8 phase 165); front matter and Current Position updated in the M9 documentation pass. |

---

## E. Handoff checklist for the next context window

1. **Read the contract before touching UI:** `SPEC.md` (M9 decisions) → `DESIGN.md` (§ Distilled Command Surface, § Operational layer palette, § Banned in dashboard UI chrome) → `.planning/milestones/M9/COMPLETION.md`.
2. **Establish the environment:** confirm `backend\.venv\Scripts\python.exe` (3.13.7) and reproduce the baseline with `backend\.venv\Scripts\python.exe -m pytest backend/tests -q` (expect 516 passed / 4 failed).
3. **Rebuild before any Playwright run:** `cd frontend; npm run build`, then confirm no stale `server.js` is reused (`frontend/playwright.config.ts`, `reuseExistingServer`).
4. **Check the shared checkout:** `git status --porcelain` and `git log --oneline -5`; other sessions' edits may be present — stage explicit paths, never `git add -A` without authorisation.
5. **Guard production:** record the `https://pre-hub.vercel.app` ETag before any deploy, and remember cache TTLs mask deploys (FIRMS 1 h, geocode 24 h).
6. **Fix `/health`:** derive the environment from `RENDER=true` in `backend/app/config.py`, or sync the Render service from `render.yaml`.
7. **Close the news gap:** audit feed liveness for Riau/Kepulauan Riau via `/api/v1/news/yield` (`backend/app/services/news_yield.py`); admit feeds only after HTTP 200 + parseable XML, the 176.7 method.
8. **Reduce the backend baseline:** open `backend/tests/test_impact_assessment.py`, `test_travel_fuel_guard.py` and `test_cpu_routing_weather.py`; fix the assertion or declare the environmental dependency — never widen a timeout silently.
9. **Finish the gazetteer honestly:** add sources for the 21 unplaceable kecamatan in `scripts/build_sumatra_gazetteer.py`; never interpolate a centroid.
10. **Re-run the evidence set before closing anything:** full frontend suite (120 passed / 9 skipped at 176.8), `tsc --noEmit`, `next build`, and the four production assertions in `frontend/e2e/r2-production-capture.spec.ts`.

---

## F. Evidence index (all under `.planning/milestones/M9/`)

| Artifact | What it proves |
|---|---|
| `r1-pytest.txt` | Backend baseline: 516 passed / 4 failed / 11 warnings in 335 s, with the four failures named. |
| `env-proof-run1.txt` | Environment proof captured from the run that produced the R1 numbers. |
| `phase173.5-before.txt` | Frozen-suite red state at HEAD before reconciliation. |
| `phase173.5-after.txt` / `phase173.5-run-verify.txt` | `phase57-pilot-hardening`: 12 passed after the fix. |
| `full-suite-after.txt` | 93 passed / 9 skipped after 173.5. |
| `phase174-full-suite.txt` | 97 passed / 9 skipped after the design contract. |
| `phase174-token-baseline.txt` | The shipped-code hex inventory the ban list was derived from. |
| `phase176.8-full-suite.txt` | 120 passed / 9 skipped (12.2 min) before R2.1. |
| `phase176.9-full-suite.txt` | 121 passed / 9 skipped (13.2 min) after the banner dock. |
| `R1-DEPLOY.md`, `R1.1-DEPLOY.md`, `R2-DEPLOY.md` | Rollout records for the first three waves. |
| `phaseR2.1/`, `phaseR2.2/` | Live captures at 1920×1080 and 390×844, production assertion logs, geometry measurements, API smoke. |
| `phase176.10/live-1920.png`, `live-390.png` | Mobile counter labels readable at rest after R2.3. |
| `phase-visual/`, `phase-fleet/` | After-captures plus the capture scripts and `capture-report.json` for the colour pass and fleet regression. |
| `vercel-capture-run1.txt` → `vercel-capture-after.txt` | 2 passed on the capture spec across the R2 cycle. |
| `COMPLETION.md` | Per-complaint, per-commit, per-test close-out with the R2.1 → R2.2 chain and named rollback tags. |

**Method note.** Every green number above was produced after `cd frontend; npm run build`
on the same tree it describes. Numbers measured before a build (or against a reused
server) were discarded rather than reported — that discipline is the single most
transferable habit this milestone produced.
