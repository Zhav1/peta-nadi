# WALKTHROUGH — Phase 168: Keyless FIRMS CSV Fallback

**Mode:** docs-only. Source and tests untouched. Test counts below are
those recorded for `e8567b1` and were **not re-run** in this pass.

## What was done

1. Read the `e8567b1` diff (8 files, +1115/−161).
2. Confirmed the old failure mode: no `NASA_FIRMS_MAP_KEY` →
   `{hotspots: [], status: "degraded"}` in `routing_router.py`.
3. Read the new adapter's URL ladder in `nasa_firms_adapter.py`:
   per-country VIIRS/MODIS templates first, then the Global templates
   (`SUOMI_VIIRS_C2_Global_{window}.csv`, `MODIS_C6_1_Global_{window}.csv`).
4. Verified the bbox filter runs server-side after parsing, so a Global
   file cannot leak non-Indonesian detections into the list.
5. Verified the response envelope gained `count` / `total` / `capped` /
   `source` / `updated_at`.
6. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Keyless path exists | `backend/app/adapters/nasa_firms_adapter.py` (+208, new file) |
| Per-country files 404 | adapter comments at `:31`, `:34` document the production 404 |
| Global fallback pinned | `SUOMI_VIIRS_C2_Global_…` / `MODIS_C6_1_Global_…` templates at `:39-43` |
| Global data bbox-filtered | server-side filter in the adapter after CSV parse |
| Envelope is tri-state | `count` / `total` / `capped` / `source` / `updated_at` in `routing_router.py` |
| Frontend consumes envelope | `lib/api.ts`, `lib/types.ts`, `TopNavTelemetry.tsx`, `DashboardClient.tsx` |
| Backend tests present | `backend/tests/test_firms_keyless_fallback.py` (284 lines at this commit) |
| Browser test present | `frontend/e2e/firms-hotspot-truth.spec.ts` (191 lines) |
| pytest | 12 passed — *recorded* |
| Playwright | 8 passed — *recorded* |

## Shape of the change

```
before:  no key ──> {hotspots: [], degraded}      (indistinguishable from quiet)

after:   keyed area API ──(fail / no key)──> per-country CSV ──(404)──>
         Global 24h CSV ──> parse ──> bbox filter ──> envelope
         {count, total, capped, source, updated_at}
```

## Deliberately NOT done

- No re-run of pytest or Playwright in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No attempt to "fix" the 404 by re-pinning a different per-country
  URL — that is exactly the assumption this phase disproved.
