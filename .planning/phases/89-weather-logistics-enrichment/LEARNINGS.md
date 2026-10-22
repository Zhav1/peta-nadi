<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 89: Weather Logistics Enrichment — Learnings

**Scope:** durable lessons from `530b07d` (4 files, +301/−6). Grounded in committed hunks /
file reads. No assumptions.

---

## 1. Fixes tried (what worked, with evidence)

### 1.1 Popup thin: full logistics card per feature

- **Issue (popup thin):** blue-zone clicks showed a bare polygon with severity at best — no
  hazard type, no threatened corridor, no delay, no action.
- **Fix:** server-side enrichment (hazard-type, corridor intersect, delay, advisory action,
  modalities, confidence) + `CrisisMap.tsx` popup/legend rendering (+25) + TopNav sample
  (+46) + `DashboardClient` passthrough (+39).
- **Lesson:** popup richness must be computed server-side next to the fusion facts (spine
  distance, severity) — client-side derivation from lon/lat would duplicate the spine tables
  and drift.

### 1.2 One-circle-fits-all: geometry switch by hazard type

- **Issue:** flood circles for landslide-prone hills misstate the threatened footprint.
- **Fix:** hill-spine node proximity (5 curated Bukit Barisan nodes) selects
  `generate_landslide_geometry`; flood/marine/storm keep their own generators.
- **Lesson:** a 5-node curated switch beats an elevation raster here — reviewable in one
  screen, zero new data dependency, and the node list is the obvious edit point when
  operators name more slide-prone passes (e.g. Kelok 9, Malalak — NOT added, named only as
  candidates).

### 1.3 Delay without a 16-cell table: base × severity

- **Evidence:** `_HAZARD_BASE_DELAY` (14/10/18/14) × `_SEVERITY_MULT` (1.2/1.0/0.7/0.4).
- **Lesson:** multiplicative form keeps severity re-tuning to one dict; any future
  per-corridor factor multiplies in without restructuring.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **No enrichment tests.** Hazard typing, corridor-leg assignment, delay math, geometry-switch branch all unpinned. | `530b07d` stat: 0 test files touched |
| 2 | **tsc not re-run** after popup/legend/TopNav edits. | No run record this window |
| 3 | **Corridor legs are spine-only (10 legs).** Zones far from the spine (e.g. east-coast Dumai, island Batam) get nearest-leg attribution that may read oddly — distance field mitigates, naming may still confuse. | `_SPINE_SEGMENT_CORRIDORS` 10 entries; `_dist_to_spine_km` companion field |
| 4 | **Hill-spine list is West-Sumatra-only** (Bukittinggi/Sitinjau/Solok/Padang/Kerinci). Northern (Takengon/Kutacane) and southern (Baturaja/Lahat) slide terrain has no switch node yet. | `_HILL_SPINE_NODES` 5 entries |
| 5 | **Edge-cache lag on verify** — same as 87/88 (proxy `s-maxage=60 + SWR 120s`; ~10 min observed lag per orchestrator context, unmeasured). | `route.ts:61-63` + orchestrator note |

---

## 3. Constraints / conditions / context / env (active, user-given)

| Item | Value |
|---|---|
| Orchestration | Muse Spark orchestrator; Deepseek workers only |
| Deploy target | Prod-only verification (live fused data + map render required) |
| Admit-uncertainty | Unverified gates marked NOT-run, never claimed green |
| Schema | 7 keep-both merge `9ea107e` |
| Edge-cache lag | Allow stale reads post-push before re-probing |
| Logistics enrichment | Satisfied in-code by this phase; verification pending |
| Corroborator-only | Enrichment never synthesizes RED (Phase 85 contract holds) |
| No commit/push in this docs task | Files only; separate step if asked |

## 4. Issues found (closed / carried)

- Popup thin → fixed in-code here (verify full card on prod map click).
- Dots too small → Phase 87 (separate path, unaffected).
- Medium clutter → Phase 87 gate applies before enrichment; confirm enriched set is still disruption-only on prod.
- Single-point Medan → Phase 88 grid feeds enrichment; confirm multi-province enriched zones (not just Medan hill nodes).
- Sim fallback → enriched OM-grid features must keep projection labeling (Phase 85 contract); re-check post-deploy.

## 5. Re-prove recipe (next window — warm `/health` first, allow edge-cache lag)

1. `GET /api/v1/weather/spatial-polygons` → every feature carries hazard-type, corridor leg + distance, delay_h, advisory action, modalities, confidence.
2. Delay spot-check: critical flood = 16.8h, low flood = 5.6h (base × multiplier).
3. Sitinjau Lauik heavy-precip feature → landslide geometry branch.
4. Prod map: blue-zone click shows full logistics card; legend documents enriched fields; TopNav sample renders.
5. `npx tsc --noEmit` → exit 0; add enrichment unit tests (typing + leg + delay + switch matrix) before claiming green.
