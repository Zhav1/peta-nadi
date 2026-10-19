# Phase 74 Summary: Agent Verification Gate, Hazard-Specific Geometry & 48h Freshness Lockdown

**Status:** COMPLETE ✅ | **Date:** 2026-10-19 | **Files:** 10 modified (6 backend, 4 frontend)

## What & Why

Three live user-reported defects, one root-cause family (the news-to-map chain trusted surface text too easily):
1. **Academic article promoted to RED** — bare `"banjir"` inside `PHYSICAL_BLOCKAGE_PREDICATES` canceled the opinion-exclusion veto. Fixed by removing bare hazard nouns from the blockage list, adding `NON_INCIDENT_DISCOURSE_MARKERS`, and enforcing a 4-check `run_agent_verification_gate` (freshness / discourse / spatial / impact-corroborated).
2. **Identical 16/20 km circles for every hazard** — fixed with agent-decided `compute_hazard_zone_geometry_and_radius` (landslide 2.8–3.5 km wedge → earthquake 12.0 km) wired extractor → API → `buildHazardSpecificZoneGeometry` map rendering, backend polygon preferred.
3. **May 2024 article shown as "latest at 4 AM today"** — fixed with `MAX_NEWS_AGE_HOURS = 48` + archival URL date-path gate + true-`published_at` preservation + `when:2d` source constraint + client-side mirror guard.

## Key Numbers

- 4 gate checks, 10 hazard radii, 48h window, `schema_version: 3` (auto re-verifies all legacy v1/v2 rows on read).
- 0 migrations (JSONB-only), 0 LLM contract changes, 0 new Supabase columns.

## User-Visible Result

- Opinion/policy/solution pieces no longer appear on the map; true blockages still go RED.
- Each hazard draws its physics-correct footprint; regency warnings stay regional (7.2–9.0 km).
- Stale/archival news never surfaces as "latest"; Evidence tab shows the 4-check audit per item.
