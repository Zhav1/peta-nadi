<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 87: FIRMS Radius-Area + Weather Disruption Threshold — Learnings

**Scope:** durable lessons from `b28a0db` (7 files, +572/−31). Grounded in committed hunks /
file reads. No assumptions.

---

## 1. Fixes tried (what worked, with evidence)

### 1.1 Medium clutter: disruption-only default instead of a second endpoint

- **Issue:** medium drizzle (BMKG code 60 / medium severity) cluttered the overlay — every
  advisory polygon rendered with disruption-level visual weight.
- **Fix:** single endpoint, default-on gate (`min_severity=high`, precip ≥ 50, flood ≥ 80) +
  advisory opt-in via query params (`routing_router.py` Query branch; `api.ts`
  `spatialPolygons(params?)` mirrors the defaults). No endpoint duplication, no client fork.
- **Lesson:** a default-on gate with an explicit escape hatch beats a parallel advisory
  endpoint — one contract to verify, and the escape hatch (`min_severity=medium&…=0`) is
  self-documenting in the docstring.

### 1.2 Dots too small: severity-mirrored radius-area

- **Issue:** FIRMS hotspots rendered as pin-sized dots regardless of severity (issue found:
  dots too small).
- **Fix:** monotonic `radius_km` (5.0 / 2.5 / 1.0) computed server-side per hotspot
  (`routing_router.py:229-243` region), typed additively (`types.ts` `FireHotspot.radius_km`).
- **Lesson:** area must be derived server-side next to severity (same mapping site), not
  client-guessed — otherwise dot size and severity label drift apart.

### 1.3 BMKG desc+code-only API: explicit sim-grade numeric fallback

- **Issue:** current BMKG forecast payload carries desc+code only, so numeric gates would have
  dropped every BMKG warning (no precip/flood fields).
- **Fix:** `_extract_bmkg_numbers` maps code → numerics ONLY when fields are absent
  (60 → 25.0/55.0 below-gate; 95/97 → 65.5/87.5 above-gate; wind 20.0/42.0).
- **Lesson:** the fallback values must straddle the gate deliberately (drizzle below, severe
  above) — otherwise the mapping silently re-includes what the threshold was built to exclude.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **No threshold/radius tests.** Neither the severity/precip/flood gate nor the radius mapping has a pinned unit test. | `b28a0db` stat: 0 test files touched |
| 2 | **tsc not re-run.** `CrisisMap.tsx` (+269) is the largest hunk in the commit; type status unconfirmed. | No tsc record post-`b28a0db` |
| 3 | **Single-point Medan root cause still live in this window.** OM/BMKG fusion still resolves to one point until Phase 88. | `open_meteo_adapter.py:175-178` (`medan = … or out_points[0]` fallback); `bmkg_adapter.py:24-29` (only Medan adm4 verified) |
| 4 | **Vercel edge-cache lag on verify.** Proxy sets `s-maxage=60, SWR 120s`; orchestrator context reports ~10 min stale reads observed after `b28a0db` push. | `frontend/app/api/proxy/[...path]/route.ts:61-63` (verified) + orchestrator-provided lag note (not independently measured — admit-uncertainty) |
| 5 | **Sim-fallback labeling dependency.** OM-sim features still rely on the Phase 85 projection-vs-warning contract (label + blue/purple + source/valid_until); threshold change must not reclassify sim as warning. | Phase 85 PLAN §3; `is_om` set semantics |

---

## 3. Constraints / conditions / context / env (active, user-given)

| Item | Value |
|---|---|
| Orchestration | Muse Spark orchestrator; Deepseek workers only |
| Deploy target | Prod-only verification (live BMKG/OM data required) |
| Admit-uncertainty | Unverified gates marked NOT-run, never claimed green |
| Schema | 7 keep-both merge `9ea107e` (Gate-2 pre-filter + BMKG hardening both kept) |
| Edge-cache lag | `b28a0db` observed lag (orchestrator context); in-tree proxy `s-maxage=60 + SWR 120s` — wait before re-probing post-push |
| Medan-only root cause | Single-point fusion pre-88 (Medan adm4 only; OM Medan-or-first fallback) |
| Whole-Sumatra grid requirement | Phase 88 owns island-wide coverage |
| Logistics enrichment | Phase 89 owns blue-zone enrichment |
| No commit/push in this docs task | Files only; separate step if asked |

## 4. Issues found (this stream — carried, not invented)

- Dots too small → fixed here via `radius_km` (verify visually post-deploy).
- Medium clutter → fixed here via disruption-only default (verify advisory path still full-fidelity).
- Single-point Medan → NOT fixed here; owned by Phase 88.
- Sim fallback → Phase 85 contract must hold under the new gate; re-check sim labels post-deploy.
- Popup thin → NOT fixed here; owned by Phase 89.

## 5. Re-prove recipe (next window — warm `/health` first, allow edge-cache lag)

1. Default: `GET /api/v1/weather/spatial-polygons` → only high/critical; every feature precip≥50 or flood≥80.
2. Advisory: `?min_severity=medium&min_precip=0&min_flood=0` → medium/low present.
3. Radius: `GET /api/v1/fire/hotspots` → `radius_km` ∈ {5.0, 2.5, 1.0}, monotonic with severity.
4. Map: dots scale with severity; drizzle absent by default, present via advisory toggle path.
5. `npx tsc --noEmit` → exit 0; add gate + radius unit tests before claiming green.
