# PLAN — Phase 168: Keyless FIRMS CSV Fallback

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `e8567b1` — `feat(m9-168): keyless NASA FIRMS CSV fallback + tri-state hotspot contract`

## Objective

Remove the API key as a single point of failure for Titik Panas. Until
this phase, an unset `NASA_FIRMS_MAP_KEY` made `routing_router.py` return
`{hotspots: [], status: "degraded"}` — an empty world and an empty list
that the UI could not tell apart from a quiet one.

## Scope IN

- New adapter (`backend/app/adapters/nasa_firms_adapter.py`, +208): keyless
  public CSV path against NASA FIRMS static files, used when the keyed
  area API is unavailable.
- Per-country URL rejected: `…/csv/SUOMI_VIIRS_C2_Indonesia_24h.csv` and
  the MODIS equivalent returned **404 in production**, so the adapter
  falls back to the **Global 24h** files and bbox-filters server-side.
- Tri-state envelope in `backend/app/routers/routing_router.py`:
  `count` / `total` / `capped` / `source` / `updated_at`, so the caller
  knows how many rows exist, how many were returned, which upstream
  produced them, and how old they are.
- Frontend (`lib/api.ts`, `lib/types.ts`,
  `components/dashboard/TopNavTelemetry.tsx`,
  `components/dashboard/DashboardClient.tsx`): render `count` with the
  envelope's provenance instead of assuming a bare array.
- Tests: `backend/tests/test_firms_keyless_fallback.py`,
  `frontend/e2e/firms-hotspot-truth.spec.ts`.

## Scope OUT

- No change to the keyed area API when a key *is* configured; it stays
  the preferred path.
- No new hotspot source, no threshold or clustering change.
- No commit to the frontend build config.

## Decisions locked

1. A missing key is a configuration *degradation*, not a data fact. It
   must not be expressible as `count: 0`.
2. Never trust a documented per-country file path. The Indonesia
   variant is 404; the Global file plus a server-side bbox is the
   working route.
3. The envelope carries `source` and `updated_at` because two upstreams
   can now feed the same endpoint; the UI must not imply keyed freshness
   when the CSV path answered.
4. `capped` is exposed rather than hidden — a truncated list must say so.

## Risk notes

- The Global 24h CSV is larger than a country extract; bbox filtering is
  correctness-critical, not an optimisation. A dropped filter would let
  Malaysian or Australian detections appear as Indonesian hotspots.
- The fallback is silent by design (the screen must not scare the
  operator), so `source` in the envelope is the only audit trail.
