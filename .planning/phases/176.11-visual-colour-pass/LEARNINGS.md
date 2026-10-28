# LEARNINGS — Phase 176.11: Visual Colour Pass

**Window:** 2026-10-28 · Grounded facts only.

> **Superseded by 176.12:** Waspada is now violet dots `#a855f7` — the amber treatment below is the state as of 176.11.

## 1. The single most valuable lesson

**User visual feedback supersedes a self-imposed palette.** Phase 174
banned `#60a5fa` and `#a855f7`; the user then asked for a blue Cuaca,
colour-coded hazard siblings, and distinguishable modalities. The
correct response is not to defend the ban or to silently violate it.

**Update the written contract in the same change instead of leaving a
failing guard.** `a1b6e1b` ships the colours *and* `DESIGN.md`'s
"Operational layer palette" (`DESIGN.md:266`) *and* the ratchet's
`LAYER_FILES` allowlist (`dashboard-palette-contract.spec.ts:77`). Had
the UI landed alone, the palette gate would have gone red and the team
would have learned to ignore it — the exact failure mode Phase 174's own
header warns about.

## 2. Fixes tried (what worked, with file evidence)

1. **Three sibling hazard treatments** — Cuaca blue `#2f81f7`/`#60a5fa`,
   Waspada amber `#f59e0b`/`#fbbf24` dashed, Titik Panas red
   `#ef4444`/`#f87171`: one grammar, three hues, so the layers read as a
   family and remain distinguishable.
2. **Lighter map** — water `#0a121a`, land `#121b24`; the previous
   pairing was legible but too dark to read as terrain.
3. **Modality colours** — truck `#34d399`, aircraft `#a78bfa`, vessel
   `#e2e8f0`, so a mixed fleet stops reading as one mass.
4. **`Filter · N` modal** — filters leave the panel but their state stays
   visible in the trigger; facets carry counts, empty rows shown honestly.
5. **Contract amended in the same commit** — `LAYER_FILES` allowlist,
   asserted sorted and duplicate-free by the spec.

## 3. Concerns (open)

1. `LAYER_FILES` is a deliberate hole in the ban list; every addition
   must be reviewed, or the allowlist becomes the new free-for-all.
2. Modality colour is a single channel. Colour-blind users can still
   confuse truck and aircraft; a shape or icon would be the robust
   complement.
3. No Playwright ran (explicit user request); filter-modal layout is unverified.
4. Hazard hues now compete with modality hues; the palette carries more
   semantic load than the 174 contract anticipated.

## 4. Conditions (observed this window)

- The user asked for specific colours and relationships ("share Cuaca's
  highlight style in different colours") — implemented, not debated.
- Verification scoped by the user: `tsc`, build, map-popup unit; no Playwright.

## 5. Issues found (do not repeat)

1. A palette contract with no amendment path forces a choice between
   ignoring it and blocking the product; write the amendment first.
2. Zero-result facets are information; hiding them makes a narrow result
   set look like a filter failure.
3. When verification is waived, say so plainly — unverified is not verified.

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
- Cache TTLs can mask a deploy (FIRMS 1h, geocode 24h) — a colour change
  behind a 1h FIRMS cache will appear late; verify with a cache-busting
  key or after expiry.
