<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 89 / Plan 01 — Weather Logistics Enrichment

**Goal:** turn thin blue disruption zones into decision-grade logistics cards — every feature
carries hazard-type, corridor intersection, delay estimate, advisory action, affected
modalities, and confidence, with geometry switched by hazard type; popup + legend + TopNav
sample render it.

**Status:** IMPLEMENTED-LOCALLY-PUSHED in `530b07d` on `main`
(`feat(weather): enrich blue disruption zones with hazard-type, corridor intersect, delay, advisory action, modalities, confidence + geometry switch; CrisisMap popup + legend + TopNav sample`).

## 1. Objective

- **Hazard-type classification:** heavy-precip features typed as flood / landslide /
  marine_wave / severe_storm (hill-spine proximity nodes: Bukittinggi, Sitinjau Lauik,
  Padang, Solok, Kerinci switch precip to landslide geometry).
- **Corridor intersection:** per-feature corridor leg via `_SPINE_SEGMENT_CORRIDORS`
  (10 spine legs over 11 spine points: Banda Aceh–Medan … Bakauheni–Panjang) + spine-distance
  (`_dist_to_spine_km`) so zones name the threatened leg, not just a coordinate.
- **Delay estimate:** `_HAZARD_BASE_DELAY` (flood 14h / landslide 10h / marine_wave 18h /
  severe_storm 14h) × `_SEVERITY_MULT` (critical 1.2 / high 1.0 / medium 0.7 / low 0.4).
- **Advisory action + modalities + confidence:** per-feature recommended action, affected
  modalities, and confidence — all advisory (corroborator-only; no RED synthesis, Phase 85
  contract preserved).
- **Geometry switch:** `generate_flood_geometry` / `generate_landslide_geometry` /
  `generate_incident_geometry` selected by hazard type instead of one-size-fits-all circles.
- **Frontend:** `CrisisMap.tsx` popup + legend render the enriched fields; `TopNavTelemetry.tsx`
  sample surfaces a disruption example; `DashboardClient.tsx` passes the enriched shape through.

## 2. Scope

### In scope (committed in `530b07d`, 4 files, +301/−6)

| File | Lines | Change |
|---|---|---|
| `backend/app/services/weather_fusion_service.py` | +197/− | `_HILL_SPINE_NODES` (5), `_SPINE_SEGMENT_CORRIDORS` (10 legs), `_SEVERITY_MULT`, `_HAZARD_BASE_DELAY`, `_haversine_km`; per-feature enrichment (hazard-type, corridor intersect, delay, advisory action, modalities, confidence); geometry switch across flood/landslide/generic generators |
| `frontend/components/dashboard/DashboardClient.tsx` | +39 | Enriched-shape passthrough for overlay features |
| `frontend/components/dashboard/TopNavTelemetry.tsx` | +46 | Disruption sample surfacing |
| `frontend/components/map/CrisisMap.tsx` | +25 | Popup + legend rendering of enriched fields |

### Out of scope

- Threshold (Phase 87) and grid (Phase 88) — consumed as-is from below commits.
- Consensus escalation from enriched zones (still corroborator-only; no RED synthesis).
- MAP_KEY / adm4-confirmation operator actions.
- New enrichment tests — none added this window.

## 3. Decisions (as evidenced in-tree)

- **Multiplicative delay, not additive table:** base-per-hazard × severity multiplier keeps
  the matrix to 4×4 constants instead of 16 hand-tuned cells; severity changes propagate
  uniformly.
- **Hill-spine switch by named nodes, not elevation raster:** 5 curated Bukit Barisan nodes
  flip heavy-precip geometry to landslide — cheap, reviewable, no DEM dependency.
- **Corridor legs named end-to-end:** `_SPINE_SEGMENT_CORRIDORS` labels read as operator
  language ("Padang–Bukittinggi") rather than corridor IDs, so popups need no lookup.
- **Advisory-only preserved:** enrichment adds decision context without touching the
  Phase 85 corroborator-only contract (weather never RED, fire-as-I untouched).

## 4. Walkthrough (what was implemented this window)

1. Added hill-spine nodes + segment-corridor mapping + delay/multiplier tables + haversine.
2. Classified each fused feature by hazard type (spine proximity → landslide).
3. Attached corridor intersect (nearest leg + distance), delay (base × severity), advisory
  action, modalities, confidence.
4. Switched polygon geometry generator by hazard type.
5. Rendered enriched fields in map popup + legend and TopNav sample; passed shape through
  `DashboardClient`.

## 5. Verification gates

| Gate | Command / probe | Expected | Status this window |
|---|---|---|---|
| Prod enrichment | `GET /api/v1/weather/spatial-polygons` | every feature has hazard-type, corridor leg, delay, action, modalities, confidence | NOT probed — needs prod + post-cache wait |
| Landslide switch | feature near Sitinjau Lauik under heavy precip | landslide geometry (not flood circle) | NOT probed — same |
| Delay math | critical flood vs low flood | 14×1.2=16.8h vs 14×0.4=5.6h | NOT probed — same |
| Map popup | prod map click on blue zone | full logistics card (not thin popup) | NOT probed — same |
| tsc/pytest | `npx tsc --noEmit`, backend suite | green | NOT re-run after `530b07d` |
