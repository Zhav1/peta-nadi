# Phase 179: Realtime Fusion Early Warning (Decision Record)

Source: /grill-me session, 2026-11-07. Supersedes conflicting behavior from phases 172.5–178.
Goal: honest, near-realtime early warning for Sumatra logistics dispatchers. One upstream workflow serves all users, everything stays on free tiers, and each incident is shown once with its real footprint.

## Root causes found (codebase audit)

| Symptom | Root cause | Location |
|---|---|---|
| Congestion on Malaysian roads, none in Sumatra | Global Mapbox traffic layer `mapbox-traffic-v1`; TomTom only 12 points rendered as fake ~4 km diagonal stubs | `frontend/components/map/CrisisMap.tsx` ~L1539-1610; `backend/app/adapters/tomtom_adapter.py` L134-151, L894-896 |
| "Northern Sumatra floods" too wide / stale | Hardcoded `NORTHERN_SUMATRA_FLOOD_BASINS` injected when live floods are empty; severity radius 15-35 km circles | `backend/app/services/observed_disaster_service.py` L100-227, L163-205, L405-412; `frontend/components/dashboard/DashboardClient.tsx` L1785-1872 |
| Overlapping zones | No spatial merge anywhere; consensus gate scores per article and does not fuse | `agents/tools/consensus_gate.py` L276-536 |
| Fokus button dead | `if (isRegional) return;` exits silently; >1,350 ungeocoded news rows; mapRef-not-ready guard | `DashboardClient.tsx` L3994-4006, L3079-3081; `CrisisMap.tsx` L3037 |
| Planes/hotspots/BMKG/weather missing, slow load | Browser calls sleeping Render free backend directly (30-90 s cold start); edge fallback (1800 ms) serves a baseline with 0 hotspots and 0 vehicles | `frontend/hooks/useFleetVehicles.ts` L321; `frontend/app/api/public/dashboard/route.ts` L11, L220, L549-564 |
| Irrelevant news (PLN motor listrik, helm SNI) | Gate-dropped articles re-added via `is_regional_context` keyword regex (`jalan`, `transportasi`, ...); LLM failure falls back to pass | `backend/app/routers/news_router.py` L78-102, L203-256; `backend/app/nlp/news_extractor.py` L2155, L2251 |

## Locked decisions

**D1. Infrastructure (free only)**
- Worker: migrate the backend from Render to **Koyeb free** (512 MB, Frankfurt or Washington; Singapore is not on free). Measured footprint is 110-280 MB, so it fits.
- Triggers: **cron-job.org** is the primary trigger. The endpoint must return `202` immediately (30 s free timeout) and run in the background. A ping every 30-50 min keeps Koyeb awake (it sleeps after 1 h idle). **Supabase pg_cron + pg_net** is the backup trigger.
- **Browsers never call the worker.** They read only from the Vercel edge route (backed by Supabase) and Supabase Realtime.
- The AIS WebSocket must auto-reconnect (Koyeb resets long connections at 12 h).
- Note: pg_cron does not count as Supabase activity for the 7-day pause. Worker REST writes do.

**D2. Honest fallbacks**
- Delete ALL hardcoded disaster, fleet and hotspot baselines (backend and frontend).
- When data is missing, serve the last real snapshot with an age badge. After the TTL, show "no confirmed disruption" plus a per-source health panel (OK / STALE / DOWN).

**D3. Incident model and footprint**
- Each signal keeps its real geometry: BMKG CAP kecamatan polygon; PetaBencana RW/kelurahan polygon, or report point + 300 m buffer; news geocoded to a kelurahan/kecamatan polygon (BPS/Kemendagri boundaries, stored locally); FIRMS 375 m pixel; TomTom slow segment line.
- Index to **H3 res 8** (~460 m edge). Same-hazard signals overlapping in space and within a time window merge into ONE incident. Footprint = union of corroborated parts only. Every contributing source is listed.
- Isolated, non-overlapping zones remain separate incidents.
- No severity-based radius circles.

**D4. Decision authority**
- **Deterministic fusion decides; the LLM only extracts.** The LLM outputs strict JSON (`is_disruption`, `hazard_type`, place names, road/corridor, time, severity) and writes the dispatcher summary.
- Tiers: **CONFIRMED** = at least 2 independent sources, with at least 1 official or physical (BMKG CAP, PetaBencana, FIRMS, TomTom anomaly). **WATCH** = 1 credible source, dashed outline. Anything else is not shown on the map.
- Remove the "regional" news tier. The feed shows only LLM-marked disruption-relevant items. **If the LLM fails, the article is held back** (never passed through).
- Time decay/TTL per hazard (e.g. flash flood about 6 h unless reaffirmed; traffic jam about 30 min; infrastructure damage 48 h).

**D5. Traffic (TomTom monthly freemium quotas)**
- Remove the Mapbox global traffic layer.
- (A) Network: the worker fetches **Traffic Flow Vector Tiles** (200k/month) at zoom 10-11 for tiles touching Sumatra's main roads (Jalinsum, toll, national; ~100-150 tiles), decodes them to one GeoJSON, refreshes every 60 min (~110k/month).
- (B) Precision: ~20 chokepoints via **Flow Segment Data** (20k/month) every 60 min (~14.5k/month), using the real returned geometry. Speed and delay go to fusion.
- (C) **Traffic Incident Details** (2.5k/month, so ~80/day) for corridor closures and accidents.
- Hard monthly budget guards per API, with cooldown on 403/429.
- [tidak pasti] TomTom ToS on storing/caching content. Verify before release.

**D6. Fan-out, freshness, race conditions**
- Postgres **lease lock** (`UPDATE ... SET locked_until = now()+interval WHERE locked_until < now() RETURNING`). A second trigger exits. No Upstash commands spent on locking.
- **Versioned snapshots** per layer: write the new row, then move the pointer in one transaction, guarded with `WHERE version > current` (no stale overwrite, no partial reads).
- Edge route: CDN `s-maxage≈15` + SWR, version-keyed layer URLs so Supabase egress happens once per version, not per user. Target first paint under 2 s.
- One Supabase Realtime broadcast channel carries only `{layer, version}`. Clients refetch that layer from the edge cache.
- Cadence: vessels/aircraft 60 s; BMKG, PetaBencana, news 5 min; FIRMS 3 h; traffic 60 min. Every layer shows "updated X ago".
- Keep payloads compact (Supabase free egress is 5 GB/month; watch the vessel layer size).

**D7. News relevance rubric (anything else is dropped)**
- Natural hazards affecting movement (flood, landslide, earthquake, extreme weather, wildfire/haze closing roads or airports).
- Road disruptions (closures, collapse, major lane-blocking accidents, toll gate problems, roadworks/contraflow).
- Port and sea (Belawan/Dumai/Teluk Bayur congestion, wave closures, Bakauheni/Merak ferry suspension).
- Fuel/BBM shortages and SPBU queues affecting trucks.
- Demonstrations or blockades on logistics routes.

**D8. LLM provider**
- Keep the OpenCode gateway `deepseek-v4.1-flash` for extraction, behind a keyword prefilter (target: 5-10% of articles reach the LLM). Cache by URL hash so nothing is re-processed.
- Drop the Gate-2 `mimo-v2.6-pro` review pass.

**D9. Vessels and aircraft: whole Sumatra, within limits**
- Vessels: one AISStream connection covering the **whole Sumatra bounding box incl. the Malacca Strait**, with priority port boxes (Belawan, Dumai, Teluk Bayur, Bakauheni-Merak, Palembang). In-memory store, snapshot every 60 s, cap vessel count (e.g. keep positions updated in the last 30 min) to control payload size.
- Aircraft: adsb.lol point+radius queries (max ~250 nm) tiling the whole of Sumatra (~5-6 circles), staggered so each circle refreshes every 1-2 min, with KNO/PKU/PDG/PLM/BTH prioritized. adsb.fi as fallback. Respect polite-use limits. The UI states coverage is community-sourced and limited.

**D10. Acceptance gate (scratch scripts)**
1. `probe_live.mjs` (Playwright): 5 parallel contexts on https://pre-hub.vercel.app. Records per-layer time-to-first-data and age. Pass: first paint p95 under 2000 ms (warm cache), no blank or fallback layers, and Fokus on 3 news items moves the map center.
2. `fanout_check.py`: 5 parallel triggers + 20 parallel reads. Exactly one run in `ingest_runs` did upstream fetches, and the version only goes up.
3. `fusion_golden_test.py`: a localized flood (news + PetaBencana + BMKG) gives 1 merged incident with a small footprint; the helm SNI article is dropped; the isolated zone is kept.
Plus `tsc`, lint and backend pytest.

**D11. Delivery**
- One large phase (179) covering everything. Suggested internal plan order: probe baseline, then quick fixes (fallbacks, Fokus, regional leak), then worker/snapshot/fan-out, then fusion engine, then traffic, then vessels/aircraft, then the acceptance run.

## Out of scope / invariants
- No GPU solvers or AI forecast models (purged in Phase 59). The CPU routing adapter stays.
- No paid tiers.
- No inflated metric claims in the UI.

## Open risks
- Koyeb free region (FRA/WAS) adds ~250 ms worker-to-Indonesia latency. Acceptable since browsers don't call it.
- Community ADS-B coverage over Sumatra is patchy. Empty skies may be real gaps, not bugs.
- Kelurahan-level geocoding quality from Indonesian news is uncertain. Ungeocodable articles can only be WATCH and attached to a kecamatan or not at all.
- Single large phase raises regression risk. Mitigate with per-plan verification and the acceptance scripts.
