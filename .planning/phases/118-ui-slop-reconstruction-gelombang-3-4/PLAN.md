---
phase: 118
phase_name: UI Anti-Slop Reconstruction Gelombang 3 & 4
milestone: M7
milestone_name: Live News Trust, Source Breadth & Forecast Waspada Integrity
created_at: "2026-10-25T20:25:00.000Z"
status: planned
code_state: ready
framework: GSD
---

# Phase 118: UI Anti-Slop Reconstruction Gelombang 3 & 4

## Context & Objectives

Following the successful execution of Phase 115 (Foundation Base-UI Primitives & Map HUD Ribbon De-cluttering), the PreHub interface has eliminated raw `<select>` tags in the filter bar, unified the telemetry HUD into a single `h-8` Tactical Command Ribbon, and enforced strict WebGL boundary protections (`no-portal-over-mapbox`).

This Phase executes **Gelombang 3 (Analitik Bento Grid & Recharts AreaChart)** and **Gelombang 4 (Laporan Empty States, Date Range Picker & Fleet Onboarding Modal Overhaul)** as specified in [`UI_SLOP_AUDIT_AND_RECONSTRUCTION_PLAN.md`](file:///c:/Farras/DIGDAYA/peta-nadi/UI_SLOP_AUDIT_AND_RECONSTRUCTION_PLAN.md):

1. **Gelombang 3: Analitik Bento Grid & Recharts AreaChart**:
   - **Interactive Recharts AreaChart**: Replace manual vertical trend bars with an authentic `ResponsiveContainer` + `AreaChart` from `recharts` (^3.9.2). Features dynamic `#10b981` (bullish/stable) and `#ef4444` (bearish/spike) gradient fill, crosshair cursor, and dark tactical tooltips with `tabular-nums`.
   - **Bento Grid 8-4 Structural Balance**: Eliminate the asymmetric right-column void in `AnalyticsSection.tsx`. Restructure the right side into balanced, card-wrapped informational telemetry:
     - Card 1: Market Regime & Price Volatility Index (scoring stability and inflation rate).
     - Card 2: Recharts Historical Trend Curve with threshold lines.
     - Card 3: Top Commodity Spikes with honest empty guards (`< 3` records).
2. **Gelombang 4: Laporan Tab Empty States & Date Range Picker**:
   - **Aesthetic Empty States**: Replace raw text empty states on ERP Savings tab with an agency-grade `<Card>` wrapper, dark tactical cold-chain logistics illustration, and clear call-to-action button.
   - **Tactical Date Range Picker**: Replace raw HTML5 `spinbutton` date inputs on Mitigation Audit Log with a dark tactical Popover calendar date picker using Base-UI primitives and Tailwind styling.
3. **Gelombang 4: Fleet Onboarding Modal & HITL Polish**:
   - **2-Column Responsive Form**: Refactor the tall single-column form in `FleetOnboardingModal.tsx` into a responsive 2-column grid (`grid-cols-1 md:grid-cols-2 gap-4`), eliminating awkward vertical scrolling.
   - **HITL Polish**: Standardize decision buttons (`Tolak`, `Eskalasi`, `Setujui`) with consistent tactile feedback, `cursor-pointer`, and `tabular-nums`.

---

## Architectural Invariants & Constraints

1. **Zero `npx shadcn add`**: All UI primitives must be imported from `@/components/base-ui/*` (Base-UI 1.9.0) or hand-rolled with standard Tailwind classes.
2. **Deterministic CPU Routing Invariant**: Strictly preserve the pure deterministic CPU solver (`NetworkX + OR-Tools / 2-Opt`) in `backend/app/adapters/cpu_routing_adapter.py`. Never reintroduce GPU dependencies.
3. **No-Portal-Over-Mapbox Canvas Boundary**: Popovers, tooltips, and calendar dropdowns rendered inside panels that sit over or beside Mapbox GL must use `portal={false}` to prevent clipping and pointer capture bugs.
4. **Preserve Zhav1 Simplification (`6786f82`)**: Do not reintroduce synthetic red crisis polygons, fake multi-fleet simulations, or redundant telemetry clutter. Keep the clean read-only PIHPS pricing pipeline.
5. **Watermelon Design System**:
   - Backgrounds: Dark tactical slate (`#0c1017` / `#080d14`).
   - Borders: Subdued glassmorphic border (`border-white/10`).
   - Interactive elements: Mandatory `cursor-pointer`.
   - Numerics: Mandatory `tabular-nums` on all metrics, timestamps, and price figures.
   - Motion: All animations prefixed with `motion-safe:`.

---

## Work Packages

### WP1: Recharts AreaChart & Price Volatility in `AnalyticsSection.tsx`
- **Target Files**:
  - `frontend/components/dashboard/AnalyticsSection.tsx`
- **Deliverables**:
  1. Replace static manual vertical bars (`T-6`, `T-5`, etc.) with `AreaChart` from `recharts`:
     - Linear gradient fills (`#10b981` to `rgba(16, 185, 129, 0)` for stable/downward, `#ef4444` to `rgba(239, 68, 68, 0)` for surges).
     - Custom dark tactical Tooltip showing date, price in `Rp X.XXX/kg`, and percentage change with `tabular-nums`.
     - X-Axis formatted cleanly with readable date labels.
  2. Implement Market Volatility & Spread Card displaying 30-day volatility index, delta percentage, and status chip (`STABIL` / `WASPADA`).
  3. Strictly preserve URL synchronization (`?commodity=...&region=...&days=...`) and honest empty state guard (`spikeRecordsTotal < 3`).

### WP2: Bento Grid 8-4 Layout Restructuring
- **Target Files**:
  - `frontend/components/dashboard/AnalyticsSection.tsx`
- **Deliverables**:
  1. Rebalance grid container: Left column (8 cols) housing the Spatial Commodity Flow Map with overlay controls, Right column (4 cols) housing the stacked 3-tier intelligence cards.
  2. Ensure height parity across both columns using `min-h-[640px]` so no awkward whitespace appears on wide viewports (1280px - 1920px).

### WP3: Laporan Empty States & Date Range Picker
- **Target Files**:
  - `frontend/components/dashboard/MitigationTab.tsx`
  - `frontend/components/dashboard/ReportsSection.tsx`
  - `frontend/components/base-ui/date-range-picker.tsx` (new primitive)
- **Deliverables**:
  1. Build `@/components/base-ui/date-range-picker.tsx` using Base-UI `Popover` (`portal={false}`) and dark tactical calendar grid.
  2. Replace unstyled HTML5 date inputs in MitigationTab with `<DateRangePicker />`.
  3. Elevate ERP Savings empty state to use Base-UI `<Empty>` with logistics icon, explanatory typography, and action button.

### WP4: Fleet Onboarding Modal 2-Column Restructuring
- **Target Files**:
  - `frontend/components/dashboard/FleetOnboardingModal.tsx`
- **Deliverables**:
  1. Reorganize modal body from single vertical stack to 2-column grid (`grid grid-cols-1 md:grid-cols-2 gap-4`).
  2. Left Column: Tenant ID, Vehicle ID, Vehicle Type, Cargo Category, Capacity (Tons).
  3. Right Column: GPS Provider (TomTom/Teltonika), Cold-chain Sensor ID, Initial Hub, Dispatch Authorization Code.
  4. Footer: Action buttons (`Batal`, `Daftarkan Armada`) with clear visual hierarchy and `cursor-pointer`.

### WP5: Verification Gate & Regression Suite
- **Target Files**:
  - `frontend/scripts/test_phase118_ui_anti_slop.ts` (new automated test)
- **Verification Gates**:
  1. **Contract Integrity**: Automated test validating Recharts AreaChart rendering, DatePicker primitive exports, and 2-column modal structure.
  2. **Type Safety**: `npx tsc --noEmit` must pass with exactly 0 errors.
  3. **Build Validation**: `npm run build` must compile 7/7 static routes with 0 failures.
  4. **Regression Protection**: `npm test` (SpatialHashArbiter), `npm run test:fleet-scope`, and `test:corridors` must remain 100% green.

---

## Verification Checklist

- [ ] Recharts AreaChart renders smoothly with dynamic gradient without runtime console warnings.
- [ ] Analitik right column displays balanced 3-card stack without vertical void or clipping.
- [ ] Date Range Picker opens dark tactical popover without mounting portals over map canvas.
- [ ] Fleet Onboarding Modal opens in balanced 2-column layout on viewports $\ge$ 768px.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] `npm run build` succeeds cleanly (7/7 static routes).
- [ ] Working tree remains strictly local (NO `git push` executed).
