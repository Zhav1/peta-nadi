# Phase 95 — P3: UI / Observability

**Workstream:** P3 (honest rendering, health truth, alert fan-out)
**Status:** IMPLEMENTED in commit `20c7fa5`. Documentation uncommitted.
**Pre-fix revision:** `20c7fa5^`

---

## 1. Why this phase exists

The UI printed stand-in numbers as if they were model output (`0.92` / `0.91`
confidence, `confidence × 0.94` "Terkalibrasi Brier", a canned delay array,
invented Antara/Kompas citations, Rp 14.5 M / 6.2 M / 3.85 M costs,
`TRK-MEDAN-08` / `Pekanbaru` / `85 km`). Separately, `/health/sources`
hardcoded `healthy`, the agent worker synthesized `0.85` / `0.95` confidences,
and the validated-alert notification POSTed to a route that did not exist.

**Evidence**

| Pre-fix fact | File:line at `20c7fa5^` |
|---|---|
| `confidence = overall_confidence or 0.92`; `disruptionProb = confidence × 0.94` labelled "Terkalibrasi Brier" | `frontend/components/sidebar/EvidenceTab.tsx:62-63` |
| Canned delay series `[20, 30, 25, 50, 70, 90, 120]` | `EvidenceTab.tsx:425-426` |
| `confidence or 0.91` in Mitigation | `frontend/components/sidebar/MitigationTab.tsx:883` |
| `confidence or 0.92` in the sidebar header | `frontend/components/sidebar/CrisisSidebar.tsx:49` |
| `TRK-MEDAN-08`, `Pekanbaru`, `85 km`, `2.5 h` defaults | `MitigationTab.tsx:1070`, `:1094`; `SpoilageHedgingCard.tsx:31-34` |
| Fabricated cost `14500000 / 6200000 / 3850000` | `frontend/components/map/CrisisMap.tsx:2937-2940` |
| `r.distance_km.toFixed(0)` with no null guard | `CrisisMap.tsx` route-label block (pre) |
| Hardcoded `healthy` source rows | `backend/app/routers/health.py:44-46`, `:117` |
| Worker defaults `0.85` for findings and `0.95` for decision support | `backend/app/workers/agent_worker.py` (pre) |
| Agent 6 POSTed to `http://localhost:8000/api/notify` and swallowed the failure | `agents/nodes/decision_support.py:196` |
| Simulation hook forced `severity:'critical'`, `region:'north_sumatra'`, `overall_confidence: parsed.validated ? 0.94 : 0.65`, and dropped agent findings | `frontend/hooks/useCrisisSimulationStream.ts:59-60`, `:139` |

---

## 2. Defect register (UI-D* / OBS-D*)

| ID | Defect | Pre-fix evidence | Fixed at |
|---|---|---|---|
| UI-D1 | Fabricated confidence and "Brier" probability | `EvidenceTab.tsx:62-63`, `MitigationTab.tsx:883`, `CrisisSidebar.tsx:49` (pre) | `EvidenceTab.tsx:65-75` (`hasConfidence`, `disruptionProb = null`), `:245-278` ("Belum tersedia"), `MitigationTab.tsx:884-890`, `CrisisSidebar.tsx:54-58`, `:76`; `ConfidenceBar` accepts `null` (`EvidenceTab.tsx:39-57`) |
| UI-D2 | Canned delay chart when no history existed | `EvidenceTab.tsx:425-426` (pre) | `EvidenceTab.tsx:78-93` (stored history, else `congestion_forecast` horizons), `:480-536` (empty state) |
| UI-D3 | Invented Antara/Kompas citations with no stored source | `MitigationTab.tsx` fallback array (pre) | `MitigationTab.tsx:980-1011` (only payload citations), `:1031` (`BELUM ADA SITASI`), `:1064` (explicit copy) |
| UI-D4 | Fabricated commodity/vehicle/OD/cost defaults in hedging + compliance | `MitigationTab.tsx:1070`, `:1094`; `SpoilageHedgingCard.tsx:31-34` (pre) | `SpoilageHedgingCard.tsx:18-25` (all props required), `:66-73` (no client-side cost matrix; explicit error), `:242` (button disabled); `MitigationTab.tsx:1101-1192` (render only when commodity/vehicle/OD/tonnage/distance/hours exist), `:1273-1277` (compliance empty state) |
| UI-D5 | Map effect could throw on null `distance_km`/`eta_minutes`; cost fell back to invented Rupiah | `CrisisMap.tsx:2937-2940` and route-label block (pre) | `CrisisMap.tsx:2050-2067` (finite checks + "Belum terverifikasi"), `:2943-2957` (ETA/distance guards), `:2964-2971` (cost only from `hedging`/`economic_comparison`, else "Belum tersedia") |
| UI-D6 | Crisis A's DSS queue/vehicle could render under crisis B; a slow response could overwrite B | `DashboardClient.tsx` pre-fix (no invalidation) | `DashboardClient.tsx:528-535` (`crisisSelectionReqRef`, `clearImpactAssessment`), `:1455-1456`, `:1467-1490`, `:1513` (late-response guard), `:1636`, `:1906`, `:2192`, `:2448` |
| UI-D7 | PostGIS hazard geometry (WKB/WKT/hex) was not drawable; invalid rings reached Mapbox/deck.gl | `DashboardClient` had no `crisisHazardZones`; map passed `z.polygon` raw | `frontend/lib/polygonGeom.ts:223-244` (`toLonLatRing`), `DashboardClient.tsx:739-800` (validated zones), `CrisisMap.tsx:1813-1845` (skip invalid rings), `frontend/lib/layers.ts:97-110` (filter before deck.gl) |
| OBS-D1 | `/health/sources` returned hardcoded `healthy` / `verified_active_adapter` | `health.py:44-46`, `:117` (pre) | `health.py:42-90` (`_SOURCE_SPECS` + required env key), `:94-123` (single Redis pipeline), `:126-175` (Redis → DB mirror → capability gate; absence = `unknown`) |
| OBS-D2 | Worker synthesized confidences (`0.85` findings, `0.95` decision) and looked for non-existent `consensus_gate_finding` | `agent_worker.py` pre-fix | `agent_worker.py:39-58` (`NODE_FINDING_KEYS`), `:62-120` (`resolve_node_result` for findings, gate, decision, archive), `:167-181` (used per node), `:262-278` (terminal status loop skips absent keys) |
| OBS-D3 | Validated-alert notification target did not exist; failure was swallowed; no in-process delivery | `decision_support.py:196` (pre) | `notification_service.py:15-33` (missing-env status), `:38-83` (`notify_validated_alert`, never raises; `sent`/`failed`/`degraded_log_only`); `decision_support.py:166-176` (canonical alert payload), `:211-250` (direct call, `degraded_sources`), `:240-250` (WebSocket fan-out); `alert_fanout.py:30-84`; `main.py:367-437` (listener, replay, pump, unregister); `agent_router.py:106-137` (`/api/notify` internal route); `agent_worker.py:200-216` (SSE always carries `alert`, `notification_status`, `degraded_sources`) |
| OBS-D4 | Simulation hook overwrote targeted severity/region, invented `0.94`, and dropped findings/citations/forecast from the SSE result | `useCrisisSimulationStream.ts:59-60`, `:139` (pre) | `useCrisisSimulationStream.ts:9-19` (`normalizeSeverity`, `finiteOrNull`), `:79-93` (payload region slug + severity), `:158-215` (forwards `overall_confidence`, findings, `congestion_forecast`, `hazard_polygons`, citations, `impact_profile`, `evidence`, …) |
| OBS-D5 | Region rendered as a raw slug in the UI | `CrisisSidebar.tsx` / `EconomicTab.tsx` `.replace(/_/g,' ')` (pre) | `frontend/lib/region.ts:79-128` (`toRegionSlug`, `regionSlugFromLatLon`, `normalizeRegion`); `CrisisSidebar.tsx:103`, `EconomicTab.tsx:72` |

---

## 3. Contract changes

1. **Absent is not zero.** `EvidenceTab`, `MitigationTab`, `CrisisSidebar`,
   `CrisisMap` render `Belum tersedia` / `Belum terverifikasi` when a value is
   missing or non-finite. No component may supply a confidence, cost, ETA,
   distance, citation or commodity from a literal.
2. **Health is evidence-based.** `GET /api/v1/health/sources` returns six
   entries (`BMKG`, `TomTom`, `AISstream`, `NASA FIRMS`, `Social OSINT`,
   `Supabase Write`) with `status ∈ {healthy, degraded, down, disabled,
   unknown}`, `last_seen`, and a `note` naming the missing env key
   (`health.py:42-90`, `:126-175`).
3. **Agent telemetry carries real numbers.** `resolve_node_result` maps
   `consensus_gate → overall_confidence/validated/consensus_breakdown` and
   `decision_support → overall_confidence/decision_support_output`;
   unknown nodes return `0.0` + empty summary, not `0.85`
   (`agent_worker.py:62-120`).
4. **Alert fan-out contract.** Three delivery paths for the same payload:
   durable Redis stream `lrip:stream:validated_alerts`,
   in-process `/ws/crisis/{id}` (`validated_alert` event, last-alert replay,
   bounded queue), and the terminal SSE `simulation_complete.alert`.
   No global broadcast; alerts are scoped by `crisis_id`
   (`alert_fanout.py:1-20`, `:30-84`; `main.py:367-437`;
   `agent_worker.py:200-216`).
5. **Notification outcome is structured.** `{status, configured, missing,
   degraded_sources}`; missing WhatsApp env is `degraded_log_only`, never a
   crash (`notification_service.py:24-83`).
6. **Simulation payload is typed snake_case with camelCase aliases accepted.**
   OD, cargo, BKHIT, weight, modality, radius and severity/region come from the
   caller; the hook only defaults when omitted
   (`useCrisisSimulationStream.ts:25-50`, `:79-93`).

---

## 4. Fail-today / pass-after verification

There are **no component unit tests** in `frontend/package.json` (only
`test_arbiter.ts` and `test_fleet_scope.ts`). Therefore UI-D1…D7 have static
pass-after checks, not executed behavioral tests. This is a P4 obligation.

| Check | Fail today (static, pre-fix) | Pass after | Evidence |
|---|---|---|---|
| Fabricated data constants | `0.92`, `0.91`, `0.94`, `[20,30,…,120]`, `14500000`, `3850000`, `TRK-MEDAN-08` present as values | Only comments and paint opacities match; no data literals | command in §5; current matches: `EvidenceTab:66,72` (comments), `CrisisSidebar:55` (comment), `CrisisMap:872,1011` (`line-opacity`/`circle-opacity`) |
| `toFixed` on nullable route metrics | `CrisisMap.tsx` route-label block (pre) | finite checks at `CrisisMap.tsx:2050-2067`, `:2943-2957` | `tsc --noEmit` would also fail any remaining `possibly null` call under current types |
| Health honesty | `health.py:44-46` hardcoded `healthy` | `_build_source_entry` demotes missing keys (`health.py:126-175`) | static read + no automated test |
| Alert delivery | `decision_support.py:196` POSTs to a 404 | direct service call + `/api/notify` + WS + SSE | `agent_router.py:106-137`, `main.py:367-437`; no test |
| Worker confidence | `0.85` / `0.95` literals | `resolve_node_result` | `agent_worker.py:62-120`; no test |

**Executed checks (this session)**

```powershell
cd D:\College\Pidi.id\frontend
npx tsc --noEmit          # exit 0
npm test                  # SpatialHashArbiter: 3/3 PASS, exit 0
```

`npm test` output:

```
✅ PASS: Normal candidate decluttering
✅ PASS: Executed pathological inputs without throwing RangeError
✅ ALL SPATIAL HASH ARBITER TESTS PASSED (100% CLEAN)!
```

---

## 5. Acceptance gate

```powershell
cd D:\College\Pidi.id\frontend
npx tsc --noEmit
```

```powershell
cd D:\College\Pidi.id\frontend
$files = @(
  'components/sidebar/EvidenceTab.tsx',
  'components/sidebar/MitigationTab.tsx',
  'components/sidebar/CrisisSidebar.tsx',
  'components/map/CrisisMap.tsx',
  'components/sidebar/SpoilageHedgingCard.tsx',
  'hooks/useCrisisSimulationStream.ts'
)
foreach ($f in $files) {
  Select-String -Path $f -Pattern '0\.92|0\.91|0\.94|14500000|3850000|TRK-MEDAN-08|\[20, 30, 25, 50, 70, 90, 120\]'
}
```

Gate:

1. `tsc --noEmit` exits 0.
2. No fabricated **data** literal remains in the audited files (comment and
   paint-opacity matches are allowed and enumerated).
3. Backend contracts (health, worker telemetry, fan-out) are present but not
   behaviorally tested until P4.

**Result in this session:** tsc exit 0; static audit clean; `npm test` 3/3.

---

## 6. Out of scope / open

- No React unit tests; UI honesty is enforced by review + static grep until the
  P4 E2E pack lands.
- `disruptionProb` is permanently `null` because `CrisisState` has no calibrated
  probability field (`EvidenceTab.tsx:74`). Adding one is a product decision.
- `resolve_node_result` has no test; a future node rename silently returns
  `0.0`.
- `alert_fanout` has no test; queue-full behaviour drops the event for that
  subscriber.
- `get_stm_state` can still raise `WRONGTYPE` on a pre-migration Redis hash
  (documented in the P0 open items).
