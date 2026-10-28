# LEARNINGS — Phase 168: Keyless FIRMS CSV Fallback

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**Verify the real upstream URL before pinning it.** The documented
per-country extract (`…/SUOMI_VIIRS_C2_Indonesia_24h.csv`, and the MODIS
twin) returns **404 in production**. It reads as a supported path, so it
survives design review and only fails at runtime — where a 404 was being
absorbed into "no hotspots".

The companion lesson is structural: **prefer bbox-filtering global data
over trusting per-country files.** Global 24h files demonstrably exist;
country extracts may not. A server-side bbox turns a guaranteed-available
file into a correct country view, whereas a country URL turns a
plausible path into an outage.

## 2. Fixes tried (what worked, with file evidence)

1. **Keyless public CSV adapter** — `nasa_firms_adapter.py` adds a path
   that needs no `NASA_FIRMS_MAP_KEY`; the keyed area API remains
   preferred when a key is present.
2. **URL ladder with a real fallback** — per-country templates tried
   first (`:31`, `:34`), Global templates pinned at `:39-43`. The 404 is
   documented in-source so the next reader does not "restore" it.
3. **Server-side bbox** — Global rows are filtered to Indonesian bounds
   before they reach the list or the count.
4. **Envelope, not array** — `count` / `total` / `capped` / `source` /
   `updated_at` replaced a bare `hotspots` array, so partial and
   fallback-sourced answers are self-describing.

## 3. Concerns (open)

1. The Global file grows with global fire activity; parse cost is not
   constant. Not measured in this phase.
2. `capped` exists but the exact cap value was not re-verified in this
   docs pass.
3. The fallback is intentionally quiet in the UI. `source` is the only
   way an operator or on-call engineer can tell which upstream answered.

## 4. Conditions (observed this window)

- The product must keep showing Titik Panas when the ops team has no
  NASA key provisioned — a key should improve the data, not gate it.
- The UI must never present a degraded list as a verified empty one.

## 5. Issues found (do not repeat)

1. `{hotspots: [], status: "degraded"}` conflated "no key" with "no
   fires"; a consumer reading `hotspots.length` saw `0`.
2. Trusting a documented-but-404 URL cost a production investigation;
   any newly pinned external path needs one live request before merge.
3. A bare array cannot express provenance. Endpoints that may switch
   upstream must return an envelope from day one.

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
