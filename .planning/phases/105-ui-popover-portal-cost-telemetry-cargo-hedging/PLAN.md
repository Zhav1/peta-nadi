---
phase: 105
phase_name: UI Popover Portal Migration, End-to-End Cost Telemetry & Reactive Cargo Hedging
milestone: M6
milestone_name: 3D Globe Native Mapbox Fleet, Street-Snapping & Impeccable Cartography
created_at: "2026-10-25T01:59:00.000Z"
status: planned
framework: GSD
---

# Phase 105: UI Popover Portal Migration, End-to-End Cost Telemetry & Reactive Cargo Hedging

## Context & Objectives
During live system inspection following Phase 104, two critical user-facing issues were identified on the dashboard:
1. **"Button Pilih Kargo (10T) Tidak Bisa Ditekan"**:
   - In `frontend/components/map/CrisisSimulatorBar.tsx`, the Cargo Tier selector (`Pilih Kargo (10T)`) was rendered inside an inline div with `absolute bottom-full`. The parent bar row (`pillsRowClass`) enforces `overflow-x-auto no-scrollbar`, causing the browser's CSS box-model (CSS Overflow Module Level 3) to strictly clip all vertical content outside the ~36px bar height.
   - While other buttons (`nodes`, `disruption`, `radius`, `speed`) were migrated to Base UI `<Popover>` with `<BasePopover.Portal>` (teleporting popover content directly to `document.body`), the Cargo selector remained an un-portalized inline element, rendering its dropdown completely invisible behind the overflow boundary.
   - Additionally, the legacy global `mousedown` listener `handleClickOutside` in `CrisisSimulatorBar.tsx` conflicts with ported popovers.

2. **"Perhitungan Biaya Rute Berstatus Belum Tersedia"**:
   - On the Map Route Callout Popover (`frontend/components/map/CrisisMap.tsx:3078-3090`), the "Biaya" metric consistently displays "Belum tersedia" even when viewing valid detour routes or baseline routes.
   - **Root Cause A**: `CrisisMap.tsx` only inspects `route.hedging?.reroute_cost_idr` and `route.economic_comparison?.reroute_total_cost_idr`. In normal conditions (no active disaster circle), `economic_comparison` is intentionally omitted (`if (hazardCenter)`).
   - **Root Cause B**: `calculateTradeoffAnalysis` in `aiDynamicRouter.ts:2184` calculates real operating costs (`additional_cost_idr` = fuel + BPJT toll + driver overtime), but `CrisisMap.tsx` does not check `route.tradeoff_analysis?.additional_cost_idr`.
   - **Root Cause C**: Backend Pydantic schema `HedgingSolveResponse` returns nested objects (`route.hedging.reroute_policy.cost_idr`), while frontend expects flat alias `route.hedging.reroute_cost_idr`.
   - **Root Cause D**: The boundary condition `costIdr > 0` rejects `costIdr === 0`, causing baseline primary routes (which have Rp 0 extra cost) to display "Belum tersedia" instead of "Rp 0 (Normal)".
   - **Root Cause E**: When hedging resolves asynchronously, `selectedRoutePopover` retains a stale route snapshot instead of reactively updating from `activeRoutes`.

3. **Connected Disconnects**:
   - `DashboardClient.tsx` re-evaluates `updateBaselineMapboxRoute` twice on commodity change due to redundant `useEffect` dependency.
   - `MitigationTab.tsx` does not receive `selectedCommodity` from the bottom simulator bar, leaving sidebar hedging cards unhydrated.

---

## Design System & UI/UX Standards (Impeccable & Anti-Slop)

- **Aesthetic**: Dark Tactical Command HUD (`#080d14` base, Glassmorphism 2.0 `backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 shadow-2xl`).
- **Interactive Rules**:
  - Base UI Portal for all popovers to eliminate clipping.
  - Strict `cursor-pointer` on all triggers and options.
  - Crisp Lucide SVG icons (`Snowflake`, `Sprout`, `Package`, `ChevronDown`, `Check`, `RotateCcw`).
  - Monospace tabular figures (`tabular-nums font-mono`) for all Rupiah and distance metrics.
  - Semantic cost states: `text-emerald-400` (positive savings/detour cost), `text-slate-300 font-bold` (Rp 0 baseline), `text-slate-400` (uncalculated).

---

## Work Packages

### WP1: Base UI Popover Migration for Cargo Selector (`CrisisSimulatorBar.tsx`)
- **Target File**: `frontend/components/map/CrisisSimulatorBar.tsx`
- **Actions**:
  1. Wrap the Cargo Tier Selector with Base UI `<Popover open={activePopover === 'cargo'} onOpenChange={(open) => setActivePopover(open ? 'cargo' : null)}>`.
  2. Use `<PopoverTrigger asChild>` wrapping the trigger button (`data-testid="cargo-tier-pill"`).
  3. Place dropdown menu inside `<PopoverContent side="top" align="center" sideOffset={8} className="w-80 p-3 rounded-lg bg-[#0c1017] border border-white/10 shadow-2xl flex flex-col gap-2 z-50 text-left">`.
  4. Remove legacy `handleClickOutside` listener from lines 116-124 to prevent event capture collisions with Base UI Portal.
  5. Ensure selection of `ikan_segar`, `cabai_merah`, `beras`, or reset cleanly closes the popover and fires `onSelectCommodity`.
- **Proof of Work**: Cargo dropdown opens reliably above the bar, escapes `overflow-x-auto` clipping, and displays 3 tiers with Lucide icons.

### WP2: Comprehensive Cost Telemetry Hierarchy & Reactive Map Popover (`CrisisMap.tsx`)
- **Target File**: `frontend/components/map/CrisisMap.tsx`
- **Actions**:
  1. In `CrisisMap.tsx:3078-3095`, update the route cost resolver:
     ```typescript
     // Resolve active route dynamically to avoid stale snapshots
     const currentRoute = activeRoutes?.[selectedRoutePopover.routeIndex] ?? selectedRoutePopover.route;
     const isBaseline = selectedRoutePopover.routeIndex === 0;
     const costIdr =
       currentRoute.hedging?.reroute_policy?.cost_idr ??
       currentRoute.hedging?.reroute_cost_idr ??
       currentRoute.economic_comparison?.reroute_total_cost_idr ??
       (currentRoute.tradeoff_analysis?.additional_cost_idr !== undefined
         ? currentRoute.tradeoff_analysis.additional_cost_idr
         : undefined);
     ```
  2. Implement semantic status rendering:
     - If `typeof costIdr === 'number' && Number.isFinite(costIdr)`:
       - If `costIdr === 0`: render `Rp 0 (Normal)` with `text-slate-200`.
       - If `costIdr > 0`: render `+Rp ${costIdr.toLocaleString('id-ID')}` with `text-emerald-300`.
     - Else: render `Belum tersedia` with `text-slate-400`.
  3. Add reactive `useEffect` synchronizing `selectedRoutePopover.route` whenever `activeRoutes` updates.
- **Proof of Work**: Normal detour route shows estimated operational cost (BBM + Tol + Lembur) instead of "Belum tersedia", baseline route shows "Rp 0 (Normal)", and cold-chain hedging reflects dynamic reefer costs.

### WP3: Backend Hedging Response Flat Field Aliasing (`routing_router.py`)
- **Target File**: `backend/app/routers/routing_router.py`
- **Actions**:
  1. In `routing_router.py:374`, when serializing `hedged` into route dictionary `r["hedging"]`, attach flat alias fields alongside nested policies:
     ```python
     d = hedged.model_dump() if hasattr(hedged, "model_dump") else dict(hedged)
     d["reroute_cost_idr"] = hedged.reroute_policy.cost_idr
     d["continue_cost_idr"] = hedged.continue_policy.cost_idr
     d["hold_cost_idr"] = hedged.hold_policy.cost_idr
     r["hedging"] = d
     ```
  2. Verify with unit tests in `backend/tests/test_routing_hedging.py`.
- **Proof of Work**: Backend returns both flat and nested hedging cost fields; pytest passes.

### WP4: Race Condition Elimination & Sidebar Commodity Hydration
- **Target Files**:
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/components/sidebar/CrisisSidebar.tsx`
  - `frontend/components/sidebar/MitigationTab.tsx`
- **Actions**:
  1. In `DashboardClient.tsx:1345`, remove `selectedCommodity` from the redundant `useEffect` dependency array, relying strictly on atomic invocation in `handleSelectCommodity`.
  2. Pass `selectedCommodity` from `DashboardClient.tsx` into `CrisisSidebar` and forward to `MitigationTab`.
  3. In `MitigationTab.tsx`, use `selectedCommodity` as fallback for `resolvedCommodity` when no vehicle is actively inspected, instantly hydrating `SpoilageHedgingCard`.
- **Proof of Work**: Selecting a cargo preset updates both map routes and sidebar mitigation cards in a single deterministic request without abort cancellations.

### WP5: Automated Verification Gate & End-to-End Proof
- **Execution Checklist**:
  1. `rtk npx tsc -p frontend/tsconfig.json --noEmit` -> 0 errors.
  2. `rtk pytest backend/tests/test_routing_hedging.py backend/tests/test_spoilage_hedging.py` -> 100% pass.
  3. Create and execute `frontend/scripts/test_phase105_popover_cost.ts` verifying:
     - Cost resolver hierarchy (hedging nested, flat, economic comparison, tradeoff analysis, and zero baseline).
     - Base UI Popover open/close state transitions.
  4. Regression suite: `test_turn_by_turn.ts` and `test_state_isolation.ts`.

---

## Deliverables Summary
| Work Package | Focus Area | Impacted Files | Verification |
|---|---|---|---|
| **WP1** | Base UI Cargo Popover | `CrisisSimulatorBar.tsx` | Popover opens above overflow container via Portal, clean 3-tier selection |
| **WP2** | Cost Telemetry & Map Popover | `CrisisMap.tsx` | Detour operational cost rendered, Rp 0 baseline supported, reactive update |
| **WP3** | Backend Hedging Aliasing | `routing_router.py` | Flat cost fields attached to hedging response |
| **WP4** | State Race & Sidebar Hydration | `DashboardClient.tsx`, `CrisisSidebar.tsx`, `MitigationTab.tsx` | Single atomic dispatch, SpoilageHedgingCard receives selected commodity |
| **WP5** | Full Verification Gate | Frontend & Backend Test Suites | 0 TypeScript errors, 100% passing tests |
