<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 85 / Plan 01 — Weather + FIRMS Overlay (Phase B)

**Goal:** two independent map overlays (weather advisory polygons, FIRMS fire dots+heat) that corroborate
but never escalate on their own — plus the honest-degraded plumbing (MAP_KEY provision, health, poller)
that keeps the UI truthful when the key is absent.

**Status:** implemented locally, committed on `main` inside `b443352`, pending deploy/verification
(MAP_KEY not yet provisioned on Render at commit time).

## 1. Objective

- **Q3 (2 toggles, corroborator-only):** weather polygons + FIRMS dots+heat as independent overlay toggles,
  default ON. Neither synthesizes RED alone: weather uses a blue/purple advisory palette (never RED
  semantics); fire enters consensus only as `fire-as-I` — corroborating the SAME I channel, never a solo
  fifth vote, never solo RED (weights W0.35/T0.35/I0.30/E0.20 preserved, I counted at most once).
- **Q3(A) weather click contract:** every polygon carries `source` + `valid_until` (+6 h) for provenance clicks;
  `open-meteo-sim` labeled `PROYEKSI …` (projection), BMKG labeled `PERINGATAN …` (warning).
- **Q3(B) FIRMS click contract:** every hotspot carries FRP + conf + dist-to-corridor-km (+ near_segment)
  from adapter through `/fire/hotspots` to the map tooltip.
- **Q6 (provision + poller):** 3 h-cadence FIRMS background poller into `lrip:events:nasa_firms` (Redis 24 h
  dedup, adapter-level); without `NASA_FIRMS_MAP_KEY` the whole chain stays honest-degraded (gray Karhutla
  toggle, `butuh MAP_KEY`, 200-with-`degraded` — never 500, never fake points, DB never resurrects healthy).

## 2. Scope

### In scope (committed in `b443352`, diff `1c51619..b443352`)

| File | Lines | Change |
|---|---|---|
| `backend/app/services/weather_fusion_service.py` | diff hunk (palette + provenance) | Blue/purple advisory palette (critical/high → blue `rgba(59,130,246,0.35)`/`#3b82f6`; medium/low → purple `rgba(168,85,247,0.30)`/`#a855f7`), replacing red/amber; `source` + `valid_until` (+6 h) on every feature; `open-meteo-sim` recognized as projection (`is_om` set gains `open-meteo`, `open-meteo-sim`) |
| `backend/app/adapters/nasa_firms_adapter.py` | hunk (`dedup_key` block) | Parsed events gain `frp`, `conf`, `dist_to_corridor_km`, `near_segment` (Q3(B) click contract at the source) |
| `backend/app/routers/routing_router.py` | `:15`, `:115-228` | New `GET /fire/hotspots`: key-absent → 200 `degraded` + empty; Redis-cache-first (`SOURCE_CACHE_PREFIX nasa_firms`, 3 h TTL) with short-timeout live-fetch fallback; severity from FRP (>500 critical; >100 or <5 km corridor → high) else confidence 95/80/60 heat weight; raw-row backfill for pre-Q3 cached events; never 500 on missing key |
| `agents/tools/consensus_gate.py` | `:104-133`, `:140-165`, `:187-232` | `fire-as-I`: `fire_finding` from `fire/wildfire/nasa_firms_finding` (+ normalized wildfire-event fallback, honest 0.7/0.55, no invented confidence); I channel takes the stronger corroborator (OSINT vs fire, single vote); `active_sources` counts I once; `fire_corroboration` reported OUTSIDE `consensus_breakdown` so the 4-channel W/T/I/E contract stands |
| `backend/app/main.py` | `:136-180`, `:243`, `:252` | `_poll_firms_loop` (3 h cadence, key-absent → honest-degraded + `degraded` health, events → `lrip:events:nasa_firms` capped 1000 + 3 h cache); wired into `lifespan` start + shutdown |
| `backend/app/routers/health.py` | `:41-46`, `:80-110` | FIRMS defaults to `degraded` + `butuh MAP_KEY` note when key absent; DB rows cannot resurrect FIRMS to healthy without the key (both branches) |
| `frontend/components/dashboard/TopNavTelemetry.tsx` | `:24-34`, `:53-62`, `:423-466` | Two independent toggles (Cuaca blue, Karhutla orange), default ON, live counts; degraded Karhutla renders gray with `—` count + `butuh MAP_KEY` tooltip |
| `.env.example` | `:53-61` | `NASA_FIRMS_MAP_KEY` provision path documented (Render env dashboard-only + `.env.local` locally, never commit) |
| `render.yaml` | `:45-46` | `NASA_FIRMS_MAP_KEY` `sync: false` (secret stays dashboard-only) |
| `backend/app/config.py` | `:30` | `nasa_firms_map_key: str = ""` (absent = honest-degraded everywhere) |

### Out of scope

- Map-layer rendering of FIRMS dots+heat / weather polygons in `CrisisMap.tsx` beyond the toggles
  (toggle props added; layer wiring is deploy-verify work — Phase 86).
- News-Precision Gate-2 (Phase 84), deploy/verification (Phase 86).
- Actual MAP_KEY provisioning on the Render dashboard (operator action, not code).
- New tests for FIRMS/consensus-fire paths — none added this window.

## 3. Decisions Q1–Q7 + prod-only correction (as evidenced in-tree)

- **Q3 (SPEC-LOCKED markers Q3 / Q3(A) / Q3(B) in diffs):** two toggles, corroborator-only. Fire never a
  fifth consensus vote (`consensus_gate.py:140-165` single-I selection, `:187-196` single count,
  `:215-232` fire reported outside breakdown); weather never RED (`weather_fusion_service` palette).
- **Q6 (SPEC-LOCKED Q6 markers):** 3 h poller + honest-degraded chain (adapter → endpoint → health →
  toggle). A missing key degrades, never fabricates (`main.py:150-153`, `health.py:41-46`,
  `routing_router.py:126-138`).
- **Q1/Q2+Q7:** Phase 84. **Q4/Q5:** no SPEC-LOCKED marker in committed diffs — not documented here.
- **Prod-only correction:** FIRMS/overlay verification is prod-only (needs real MAP_KEY + satellite data;
  local runs stay degraded by design). Same skip-local-then-flip rule as Gate-2: no local specs assert
  live hotspots.

## 4. Walkthrough (what was implemented this window)

1. Recolored weather polygons to advisory semantics (blue critical/high, purple medium/low) and attached
   `source` + `valid_until` (+6 h) to every feature; `open-meteo-sim` now labeled projection, not warning.
2. Extended FIRMS parse output with the click-contract fields (`frp/conf/dist_to_corridor_km/near_segment`)
   at the adapter, so downstream layers never recompute them.
3. Added `GET /fire/hotspots` (cache-first, live-fetch fallback, FRP-derived severity, 200-`degraded`
   without key) — the endpoint the Karhutla toggle will poll.
4. Taught consensus `fire-as-I` with the single-vote invariant and out-of-breakdown transparency object;
   calibration tests asserting the 4-channel contract keep passing structurally (re-run pending, §5).
5. Added the 3 h FIRMS poller to app lifespan with honest-degraded no-key behavior and Redis plumbing.
6. Made `/sources` health key-aware in both default and DB branches — a stale DB `healthy` row cannot mask
   a missing key.
7. Added the two top-nav toggles (default ON, counts, degraded gray state) and documented the MAP_KEY
   provision path in `.env.example` + `render.yaml` (`sync: false`).

## 5. Verification gates

| Gate | Command / probe | Expected | Status this window |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.json` | exit 0 | NOT re-run after `b443352` |
| Consensus calibration | `pytest backend/tests/test_consensus_calibration.py backend/tests/test_phase76_news_spatial_consensus.py -q` | pass (4-channel contract intact, `fire_corroboration` extra key tolerated) | NOT re-run — re-prove first (extra key may break strict assertions) |
| FIRMS degraded | `GET /api/v1/fire/hotspots` without key → 200 `degraded` + `[]` | `status: degraded`, `butuh MAP_KEY` | NOT probed — needs prod (local has no key by design) |
| FIRMS live | Same with key (post-provisioning) → hotspots with frp/conf/dist | `status: ok`, click fields present | BLOCKED on operator MAP_KEY provisioning |
| Weather palette | `GET /api/v1/routing/spatial-weather` (or overlay source) | blue/purple fills, `source` + `valid_until` present | NOT probed this window |
