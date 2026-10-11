# Implementation Plan: System Audit & Solutions (Full End-to-End)

Resolves all findings documented in [`SYSTEM_AUDIT_AND_SOLUTIONS_PLAN.md`](file:///d:/College/Pidi.id/SYSTEM_AUDIT_AND_SOLUTIONS_PLAN.md), targeting routing geometry, backend agent node mapping, simulation execution UX, hazard avoidance, and system telemetry integrity.

---

## 1. Phase Breakdown & Key Changes

### Phase 1: Coordinate Fixes & Geometric Detour Algorithm
- **Files**:
  - [`frontend/lib/mapboxRoutingService.ts`](file:///d:/College/Pidi.id/frontend/lib/mapboxRoutingService.ts)
  - [`frontend/lib/aiDynamicRouter.ts`](file:///d:/College/Pidi.id/frontend/lib/aiDynamicRouter.ts)
- **Actions**:
  1. Fix `tebingtinggi` coords from `[98.9560, 3.5680]` to true coordinates `[99.1621, 3.3251]`. Add separate Perbaungan and Sei Rampah hub nodes.
  2. Add bypass junction nodes to `HIGHWAY_JUNCTION_NODES`: `galang_junction` (`[98.9050, 3.4450]`), `dolok_masihul_jct` (`[99.0480, 3.3850]`), `pantai_cermin_coastal` (`[99.0350, 3.6420]`), `bangun_purba_jct` (`[98.8500, 3.3800]`).
  3. Implement **Orthogonal / Tangential Avoidance Vector Generator** in `aiDynamicRouter.ts`: When Mapbox routes intersect the hazard circle, compute perpendicular left/right offsets at `(radiusKm + 6.0 km)` to guarantee clean bypass generation rather than falling back to compromised waypoints.

---

### Phase 2: Backend Demo Endpoint & Node ID Alias Normalization
- **Files**:
  - [`backend/app/main.py`](file:///d:/College/Pidi.id/backend/app/main.py)
  - [`backend/app/routers/demo_router.py`](file:///d:/College/Pidi.id/backend/app/routers/demo_router.py)
  - [`agents/nodes/route_optimization.py`](file:///d:/College/Pidi.id/agents/nodes/route_optimization.py)
- **Actions**:
  1. Add `/api` prefix mounting in `backend/app/main.py`: `app.include_router(demo_router.router, prefix="/api")` so `/api/demo/start` and `/api/demo/status` succeed without 404.
  2. Add bidirectional alias dictionary in `agents/nodes/route_optimization.py`:
     - `belawan` <-> `belawan_port`
     - `medan` <-> `medan_kim`
     - `tebingtinggi` <-> `tebing_tinggi_hub`
     - `siantar` <-> `siantar_hub`
     - Convert whitespace/hyphens to underscores during fuzzy node lookup.

---

### Phase 3: RUN DEMO Synchronization & Single Source of Truth Route State
- **Files**:
  - [`frontend/components/dashboard/DashboardClient.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx)
  - [`frontend/hooks/useDemoState.ts`](file:///d:/College/Pidi.id/frontend/hooks/useDemoState.ts)
  - [`frontend/components/sidebar/MitigationTab.tsx`](file:///d:/College/Pidi.id/frontend/components/sidebar/MitigationTab.tsx)
- **Actions**:
  1. Synchronize RUN DEMO Lubuk Pakam shockwave coords with clean bypass waypoints so demo lines visually avoid the flood zone.
  2. Unify route state precedence in `DashboardClient.tsx`:
     Ensure `currentMapRoutes` overrides outdated routes (`selectedCrisis?.route_recommendations`), updating both when operator approves via HITL.
  3. Update approved route stroke color to `#00f0ff` (cyan) across both state containers.

---

### Phase 4: Simulation Page UX Overhaul ("Terapkan Skenario Terpadu")
- **Files**:
  - [`frontend/components/dashboard/SimulationSection.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/SimulationSection.tsx)
  - [`frontend/components/dashboard/DashboardClient.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx)
- **Actions**:
  1. Keep user on the Simulation tab upon clicking "Terapkan Skenario Terpadu".
  2. Show a 600ms loading deployment state, followed by an active summary card with explicit action buttons:
     - `[Lihat Dampak di Peta 4D]`
     - `[Tinjau di Laporan Eksekutif]`
  3. Sync slider values (`dishubDiversion`, `closureHours`) directly to active route recommendations and corridor context in `DashboardClient.tsx`.

---

### Phase 5: Telemetry Health Fallback & Modality Sync
- **Files**:
  - [`backend/app/routers/health.py`](file:///d:/College/Pidi.id/backend/app/routers/health.py)
  - [`frontend/components/dashboard/DashboardClient.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx)
- **Actions**:
  1. In `backend/app/routers/health.py`, when Supabase `data_sources` table is empty or unreachable, return `"healthy"` for locally verified poller adapters (BMKG, TomTom, PIHPS, Open-Meteo), eliminating the "0% Integritas" bug.
  2. Link `fleetModalityFilter` in top navigation to `selectedModality` in bottom floating control bar.

---

## 2. Verification Plan
- **Backend Lint & Test**:
  - Run `rtk pytest backend/tests` or test demo and health endpoints via `curl`.
- **Frontend Build & Linter**:
  - Run `rtk npm run build` (or Next.js typecheck).
- **Interactive Verification**:
  - Verify `tebingtinggi` route calculation via Mapbox.
  - Verify "Terapkan Skenario Terpadu" stays on page and offers explicit action cards.
  - Verify RUN DEMO stage 2 steers clear of the Lubuk Pakam hazard circle.
