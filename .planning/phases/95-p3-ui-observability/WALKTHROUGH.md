# Phase 95 — P3 Walkthrough (what was actually implemented)

**Code commit:** `20c7fa5` (2026-10-23).
**This documentation pass changed code:** no — `.planning/` files only.
**Working tree:** docs left uncommitted.

---

## 1. Honest rendering

### 1.1 Confidence and calibration

- `EvidenceTab.tsx:65-75`: `hasConfidence` requires a finite value `> 0`;
  `disruptionProb` is `null` because `CrisisState` carries no calibrated Brier
  score.
- `EvidenceTab.tsx:39-57`: `ConfidenceBar` accepts `null`, renders a slate bar
  and `—` instead of `0%`.
- `EvidenceTab.tsx:245-278`: the two cards read "Belum tersedia" and
  "Belum ada skor Brier terkalibrasi".
- `MitigationTab.tsx:884-890`: same null policy; renders
  "Keyakinan belum tersedia".
- `CrisisSidebar.tsx:54-58`, `:76`: neutral severity chip when severity is
  absent; "Keyakinan belum tersedia" when confidence is absent.

### 1.2 Delay evidence

`EvidenceTab.tsx:78-93`:

1. Use `crisis.evidence.delay_history` when present.
2. Otherwise use `crisis.congestion_forecast['6h'|'12h'|'24h'|'48h'].delay_min`.
3. If neither exists, render "Histori & prakiraan keterlambatan belum
   tersedia." (`:517-523`).

The label switches between "Histori Keterlambatan Koridor" and "Prakiraan
Keterlambatan Koridor" based on the source (`:477-486`).

### 1.3 News citations

`MitigationTab.tsx:980-1066`:

- `verified_news_citations` first, else `news_attributions`; otherwise `[]`.
- Badge: `TERVERIFIKASI` only when citations exist **and**
  `crisis.validated`; otherwise `BELUM DIVERIFIKASI` or `BELUM ADA SITASI`
  (`:1010-1032`).
- No synthetic Antara/Kompas fallback remains; empty state at `:1064`.

### 1.4 Hedging and compliance

- `SpoilageHedgingCard.tsx:18-25`: every prop is required (no defaults).
- On solver failure, the client-side cost matrix was deleted; the card stores
  an error and renders no Rupiah figures (`:66-73`, `:124-130`).
- Apply button is disabled without data (`:238-247`).
- `MitigationTab.tsx:1101-1192`: the hedging card mounts only when commodity,
  vehicle id, origin, destination, tonnage, detour distance and detour hours are
  all real; otherwise an explicit empty state.
- `MitigationTab.tsx:1273-1277`: compliance inspector mounts only with vehicle,
  OD, traversed roads and tonnage; otherwise an explicit empty state.

### 1.5 Map guards and hazard geometry

- Route labels: `CrisisMap.tsx:2050-2067` checks `distance_km` and
  `eta_minutes` for null/non-finite before `toFixed`/`Math.round`.
- Popover: `CrisisMap.tsx:2943-2957` renders "Belum terverifikasi" /
  "Jarak belum terverifikasi".
- Cost: `CrisisMap.tsx:2964-2971` reads only
  `hedging.reroute_cost_idr` or `economic_comparison.reroute_total_cost_idr`;
  otherwise "Belum tersedia". The 14.5 M / 6.2 M / 3.85 M fallbacks are gone.
- `frontend/lib/polygonGeom.ts:223-244`: `toLonLatRing` accepts GeoJSON,
  Feature/FeatureCollection, ring arrays, WKT/EWKT, WKB hex; returns a closed
  `[lon, lat]` ring or `null`.
- `DashboardClient.tsx:739-800`: `crisisHazardZones` validates each
  `selectedCrisis.hazard_polygons` entry and synthesizes a `DisasterZone`.
- `CrisisMap.tsx:1813-1845`: invalid rings are skipped before
  `setData`; `frontend/lib/layers.ts:97-110` filters them before deck.gl.

## 2. Stale state isolation

`DashboardClient.tsx`:

- `:528-535`: `crisisSelectionReqRef` counter + `clearImpactAssessment()`
  clears `impactAssessmentData`, `selectedImpactedVehicle`, and the dismissal
  flag.
- `:1455-1456`: every crisis selection clears first, then captures a request id.
- `:1471-1490`: DSS response and its vehicle are applied only if the id is still
  current; a failed assessment clears rather than leaving partial data.
- `:1513`: dynamic route recomputation is also id-guarded.
- `:1636`, `:1906`, `:2192`, `:2448`: demo completion, simulation start, audit
  trail open, and simulation clear all call the same reset.

## 3. Region display

- `frontend/lib/region.ts:79-91` `toRegionSlug` (alias table + province bbox
  fallback is `regionSlugFromLatLon` at `:94-110`).
- `normalizeRegion` at `:113-128` renders a human label.
- Used by `CrisisSidebar.tsx:103`, `EconomicTab.tsx:72`, and the simulation
  payload (`useCrisisSimulationStream.ts:79-93`).

## 4. Observability

### 4.1 Health (`backend/app/routers/health.py`)

- `_SOURCE_SPECS` (`:42-90`): BMKG, TomTom, AISstream, NASA FIRMS,
  Social OSINT, Supabase Write — each with a Redis key and required Settings
  attribute.
- `_read_redis_health` (`:94-123`): one pipeline, includes the
  `lrip:health:source:social` fallback.
- `_build_source_entry` (`:126-175`): Redis row → DB mirror → capability gate.
  A missing key forces `degraded` (or `disabled` for Twitter) and can never be
  masked by a stale `ok`.
- 30 s in-process cache retained (`:16`, `:195`).

### 4.2 Agent telemetry (`backend/app/workers/agent_worker.py`)

- `NODE_FINDING_KEYS` (`:39-58`) maps each node to its actual state key.
- `resolve_node_result` (`:62-120`):
  - `consensus_gate` → `overall_confidence`, `validated`,
    `consensus_breakdown` channel list;
  - `decision_support` → `overall_confidence`, truncated
    `decision_support_output`;
  - `archive` → `0.0` + archive message;
  - other nodes → `<node>_finding` confidence/summary, `0.0` if absent.
- Used per node (`:167-181`) and in the terminal status loop (`:262-278`),
  which now skips nodes whose required key is absent instead of inventing
  numbers.

### 4.3 Validated-alert delivery

- `agents/nodes/decision_support.py:166-176`: one canonical `alert_payload`
  (`crisis_id`, `incident_id`, `supabase_id`, `title`, `summary`,
  `overall_confidence`, `causal_chain`, timestamp).
- Redis stream `lrip:stream:validated_alerts` with list fallback; failures are
  named (`redis_validated_alerts`) at `:178-207`.
- Direct notification service call (`:211-238`), result embedded in the alert
  and `degraded_sources` merged.
- WebSocket fan-out (`:240-250`).
- `backend/app/services/alert_fanout.py`: per-crisis queues (max 16, `:30`),
  last-alert cache (max 256, `:31`, `:68-71`), `broadcast_validated_alert`
  never raises (`:57-84`).
- `backend/app/main.py:367-437`: `/ws/crisis/{crisis_id}` registers a listener,
  replays the last alert, pumps `validated_alert` frames, unregisters in
  `finally`.
- `backend/app/workers/agent_worker.py:200-216`: terminal SSE event carries
  `alert`, `notification_status`, `degraded_sources`, `overall_confidence`.
- `backend/app/routers/agent_router.py:106-137`: `POST /api/v1/notify` and
  `POST /api/notify` for internal callers; returns
  `{status, sent, configured, missing, degraded_sources}`.
- `backend/app/services/notification_service.py:24-83`:
  `whatsapp_config_status()` + `notify_validated_alert()`; missing config is
  `degraded_log_only`, never an exception.

### 4.4 Simulation hook (`frontend/hooks/useCrisisSimulationStream.ts`)

- `normalizeSeverity` (`:9-13`) and `finiteOrNull` (`:16-19`).
- Payload region slug + severity from the caller (`:79-93`), camelCase aliases
  still typed (`:25-50`).
- Result mapping (`:158-215`) forwards `overall_confidence` (no `0.94`/`0.65`
  synthesis), `is_simulated`, slugs, findings, `congestion_forecast`,
  `hazard_polygons`, `inflation_forecast`, citations, `impact_profile`,
  `verification_audit`, `evidence`, etc.

---

## 5. Files changed by the commit (P3 subset)

| File | Lines changed |
|---|---|
| `backend/app/routers/health.py` | 253 |
| `backend/app/workers/agent_worker.py` | 160 |
| `agents/nodes/decision_support.py` | 115 |
| `backend/app/services/notification_service.py` | 66 |
| `backend/app/services/alert_fanout.py` | 84 (new) |
| `backend/app/main.py` | 127 (shared with P0) |
| `backend/app/routers/agent_router.py` | 38 (shared with P2) |
| `frontend/components/sidebar/MitigationTab.tsx` | 351 |
| `frontend/components/sidebar/EvidenceTab.tsx` | 181 |
| `frontend/components/dashboard/DashboardClient.tsx` | 158 |
| `frontend/hooks/useCrisisSimulationStream.ts` | 104 |
| `frontend/components/sidebar/SpoilageHedgingCard.tsx` | 104 |
| `frontend/components/map/CrisisMap.tsx` | 70 |
| `frontend/lib/types.ts` | 49 |
| `frontend/components/sidebar/CrisisSidebar.tsx` | 23 |
| `frontend/lib/layers.ts` | 10 |
| `frontend/components/sidebar/EconomicTab.tsx` | 3 |
| `frontend/lib/polygonGeom.ts` | 249 (new) |
| `frontend/lib/region.ts` | 126 (new) |

---

## 6. Test commands and results (run in this session)

### 6.1 TypeScript

```powershell
cd D:\College\Pidi.id\frontend
npx tsc --noEmit
```

**Result:** exit code 0 (no type errors).

### 6.2 SpatialHash arbiter (the only frontend test script)

```powershell
npm test
```

**Result (exit 0):**

```
✅ PASS: Normal candidate decluttering
✅ PASS: Executed pathological inputs without throwing RangeError
✅ ALL SPATIAL HASH ARBITER TESTS PASSED (100% CLEAN)!
```

This does not exercise the UI honesty changes.

### 6.3 Static fabricated-data audit

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

**Result:**

| File | Matches |
|---|---|
| `EvidenceTab.tsx` | 2 — both comments (`:66`, `:72`) documenting the removed fallbacks |
| `CrisisSidebar.tsx` | 1 — comment (`:55`) |
| `CrisisMap.tsx` | 2 — `line-opacity: 0.95` (`:872`), `circle-opacity: 0.95` (`:1011`) |
| `MitigationTab.tsx` | 0 |
| `SpoilageHedgingCard.tsx` | 0 |
| `useCrisisSimulationStream.ts` | 0 |

No fabricated **data** literal remains in the audited components.

### 6.4 Backend suites

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider
# 33 passed
```

No P3-specific backend test exists.

---

## 7. Not implemented / not verified here

- No component tests, no Playwright assertion for the "Belum tersedia" copy,
  no test for `resolve_node_result`, `alert_fanout`, `/api/notify`, or the
  WebSocket `validated_alert` frame.
- `disruptionProb` is intentionally permanently `null` until a calibrated
  probability is added to `CrisisState`.
- Alert fan-out is per-process; cross-worker consumers must tail the Redis
  stream (documented in `alert_fanout.py:1-20`).
- The `SpoilageHedgingCard` has no client-side fallback by design; an offline
  hedging endpoint now shows an empty state rather than a cost estimate.
