---
phase: 106
phase_name: Dual-Metric Operational Cost & First-Principles Trip Economics (A/B Variant C)
milestone: M6
milestone_name: 3D Globe Native Mapbox Fleet, Street-Snapping & Impeccable Cartography
created_at: "2026-10-25T03:15:00.000Z"
status: completed
framework: GSD
---

# Phase 106: Dual-Metric Operational Cost & First-Principles Trip Economics (A/B Variant C)

## Context & Objectives
During live system testing of the Banda Aceh $\rightarrow$ Tembilahan corridor (1,517 km, 32 hours 16 mins) with `Cold Chain (10T)` cargo, the map route popover displayed:
```
Biaya: Rp 0 (Normal) | Detour terverifikasi
```
This triggered severe cognitive confusion for the user: *"Kok 0??? Itu metrik perhitungannya udah jalan semua kan? BBM, tier kargo, cuaca BMKG, jalanan dll?"*

### Root Cause Analysis & Empirical Truth:
1. **Full Metric Suite is Operational**: All underlying sensors and calculation models (BMKG precipitation radar `68.5 mm/j`, Mapbox traffic `+35m`, Biosolar $3{,}5\text{ km/L}$ @ Rp 6.800/L, BPJT tolls, reefer diesel genset Rp 45.000/h, driver labor Rp 50.000/h) are fully functional.
2. **Semantic Framing Flaw ($\Delta\text{Cost}$ vs $\text{Total Cost}$)**:
   - The map popover displayed **marginal detour additional cost** ($\Delta\text{Cost}$).
   - Since Route 0 is the primary baseline route, its marginal detour distance is 0 km, producing $\Delta\text{Cost} = \text{Rp } 0$.
   - However, the UI labeled this simply as **"Biaya"**, omitting the real total trip cost ($\approx\text{Rp } 6{,}01\text{ Juta}$ for fuel + labor + reefer genset).
3. **Misleading Safety Sub-Badge**:
   - `aiDynamicRouter.ts:1933` assigned `safety_status = 'SAFE_DETOUR'` to the normal primary route, causing the popover to render `"Detour terverifikasi"` on a baseline route that was never detoured.

### Objectives for Phase 106:
Implement **A/B Variant C (Dual-Metric Operational Cost)**:
1. Compute authentic first-principles total operational trip cost ($\text{BBM} + \text{Supir} + \text{Genset Reefer} + \text{Tol}$) across all routes.
2. Present **Dual Metric** on the map callout popover:
   - Primary Route: `Est. Total: Rp 6,01 Jt` with badge `Jalur Utama Acuan (Δ Rp 0)`.
   - Detour Route: `Est. Total: Rp 9,06 Jt` with badge `+Rp 3,05 Jt (Detour)`.
3. Correct safety status for normal routes from `"Detour terverifikasi"` to **`"Jalur utama bebas hambatan"`**.
4. Synchronize dual-cost breakdown in `RouteDetailModal.tsx` for complete dispatcher auditability.

---

## Design System & UI/UX Standards (Impeccable & Anti-Slop)

- **Aesthetic**: Dark Tactical Command HUD (`#080d14` base, Glassmorphism 2.0 `backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 shadow-2xl`).
- **Typography & Formatting**:
  - Tabular monospace numbers (`tabular-nums font-mono`) for all Rupiah amounts.
  - Compact format: `Rp X,XX Jt` (for > Rp 1.000.000) with full tooltip, or standard formatted IDR.
  - Hierarchy:
    - Label: `text-[11px] font-sans text-slate-400 block uppercase tracking-wider` $\rightarrow$ `Est. Operasional`
    - Value: `text-sm font-bold font-mono text-emerald-300` $\rightarrow$ `Rp 6.012.647` (or `Rp 6,01 Jt`)
    - Sub-badge: `text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10` $\rightarrow$ `Acuan (Δ Rp 0)`
- **Invariants**:
  - ❌ **NO MAGIC NUMBERS**: Zero distance-ternary toll guessing. Tolls are strictly derived from actual BPJT segments or kept at Rp 0 if unrouted.
  - ❌ **NO AI SLOP**: Pure Lucide SVG icons (`Fuel`, `Clock`, `Snowflake`, `ShieldCheck`).

---

## Work Packages

### WP1: First-Principles Trip Operational Cost Engine
- **Target Files**:
  - `frontend/lib/tripCostCalculator.ts` (new helper module)
  - `frontend/lib/aiDynamicRouter.ts`
- **Actions**:
  1. Create `calculateTotalTripCost({ distanceKm, durationMinutes, commodity, vehicleGolongan, tollCostIdr })`:
     - Fuel: `(distanceKm / 3.5) * 6800`
     - Labor: `(durationMinutes / 60) * 50000`
     - Reefer Genset: if `isColdChain(commodity)`: `(durationMinutes / 60) * 45000`, else `0`
     - Toll: `tollCostIdr ?? 0`
     - Total: `fuel + labor + reefer + toll`
  2. In `aiDynamicRouter.ts`, attach `total_operational_cost_idr` and `operational_cost_breakdown` to every generated route (`landPrimary`, `landDetour`, `intermodalRoad`, etc.).
  3. Ensure deterministic CPU execution with zero external network dependency.
- **Proof of Work**: Unit test verifies Banda Aceh $\rightarrow$ Tembilahan (1,517 km, 32.267h, Cold Chain) yields exact operational baseline $\text{Rp } 6.012.647 \pm 100$.

---

### WP2: Dual-Metric Popover Rendering & Safety Status Correction
- **Target File**: `frontend/components/map/CrisisMap.tsx`
- **Actions**:
  1. In `CrisisMap.tsx:3090-3145`, update the popover cost display:
     - Header: Change `Biaya` to `Est. Operasional`.
     - Value:
       - If `total_operational_cost_idr` is available: render `formatIDR(currentRoute.total_operational_cost_idr)` in `text-emerald-300 font-bold font-mono`.
       - If baseline route (Index 0): append badge `Acuan (Δ Rp 0)` in `text-slate-400`.
       - If detour route (Index > 0): append badge `+Rp ${formatIDR(additionalCost)}` in `text-emerald-400 bg-emerald-500/10 border border-emerald-500/20`.
  2. Fix safety status rendering on lines 3133-3142:
     - If `routeIndex === 0` and `!route.is_compromised`: render `Jalur utama bebas hambatan` with green dot.
     - If `routeIndex === 0` and `route.is_compromised`: render `Terdampak bencana` with red dot.
     - If `routeIndex > 0` and `route.safety_status === 'SAFE_DETOUR'`: render `Detour terverifikasi` with emerald dot.
- **Proof of Work**: Visual inspection on Banda Aceh $\rightarrow$ Tembilahan shows `Est. Operasional: Rp 6.012.647` with `Acuan (Δ Rp 0)` and subtitle `Jalur utama bebas hambatan`.

---

### WP3: Primary Route Safety Status Invariant Alignment
- **Target File**: `frontend/lib/aiDynamicRouter.ts`
- **Actions**:
  1. In `aiDynamicRouter.ts:1933`, update `landPrimary` object definition:
     ```typescript
     safety_status: isPrimaryCompromised || isPrimaryOffline ? 'COMPROMISED' : 'CLEAR',
     ```
  2. Ensure enum compatibility in `frontend/lib/types.ts` (`RouteRecommendation.safety_status` already includes `'CLEAR'`).
- **Proof of Work**: `landPrimary.safety_status` returns `'CLEAR'` when uncompromised; regression tests pass.

---

### WP4: RouteDetailModal Dual-Cost Synchronization
- **Target File**: `frontend/components/sidebar/RouteDetailModal.tsx`
- **Actions**:
  1. In `Section 3: Dampak + Uncertainty / Rincian Biaya`, add an authentic breakdown card:
     - **Total Estimasi Biaya Rit:** `Rp X.XXX.XXX`
     - Breakdown rows:
       - BBM Biosolar ($3{,}5\text{ km/L}$): `Rp X.XXX.XXX`
       - Upah Supir Operasional: `Rp X.XXX.XXX`
       - Bahan Bakar Genset Reefer: `Rp X.XXX.XXX` (jika cold chain)
       - Tarif Tol BPJT: `Rp X.XXX`
     - **Tambahan Biaya Pengalihan:** `+Rp X` (atau `Rp 0 (Jalur Normal Acuan)`).
- **Proof of Work**: Opening `RouteDetailModal` displays complete first-principles cost breakdown alongside detour delta.

---

### WP5: Automated Verification Gate & Regression Check
- **Execution Checklist**:
  1. `rtk npx tsc -p frontend/tsconfig.json --noEmit` -> 0 errors.
  2. `rtk pytest backend/tests/test_routing_hedging.py backend/tests/test_spoilage_hedging.py` -> 100% pass.
  3. Create and execute `frontend/scripts/test_phase106_dual_metric.ts` verifying:
     - First-principles math on Banda Aceh $\rightarrow$ Tembilahan.
     - Dual-metric display resolution (baseline vs detour).
     - Safety status mapping (`CLEAR` vs `SAFE_DETOUR`).
  4. Regression suite: `test_turn_by_turn.ts`, `test_state_isolation.ts`, and `test_phase105_popover_cost.ts`.

---

## Deliverables Summary
| Work Package | Focus Area | Impacted Files | Verification |
|---|---|---|---|
| **WP1** | First-Principles Trip Cost Engine | `tripCostCalculator.ts`, `aiDynamicRouter.ts` | Exact mathematical cost calculation (BBM + Supir + Genset + Tol) |
| **WP2** | Dual-Metric Map Popover & Status | `CrisisMap.tsx` | `Est. Operasional` header, Total + Delta badges, `Jalur utama bebas hambatan` |
| **WP3** | Primary Route Safety Invariant | `aiDynamicRouter.ts` | `landPrimary.safety_status` set to `'CLEAR'` |
| **WP4** | RouteDetailModal Cost Sync | `RouteDetailModal.tsx` | Full trip operational cost breakdown rendered in sidebar |
| **WP5** | Full Verification Gate | Frontend & Backend Test Suites | 0 TypeScript errors, 100% passing automated test suite |
