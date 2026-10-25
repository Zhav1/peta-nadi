---
phase: 115
phase_name: Watermelon MCP Connect
milestone: M7
milestone_name: Live News Trust, Source Breadth & Forecast Waspada Integrity
created_at: "2026-10-25T19:15:00.000Z"
status: complete
code_state: complete (unpushed)
framework: GSD
---

# Phase 115: Watermelon MCP Connect (Analitik Primitive Gaps Closure)

## Context & Objectives

Following the completion of Phase 111 (Analitik Activation M7), Phase 112 (Watermelon Chrome P1), Phase 113 (Watermelon Tables P2), and Phase 114 (Watermelon Polish P3), the PreHub Analitik dashboard surface successfully renders 6 stacked widgets for dispatchers and regulators. However, 7 primitive gaps remain unclosed in `frontend/components/base-ui/`, forcing [`AnalyticsSection.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/AnalyticsSection.tsx) to rely on raw HTML elements, bespoke spans, local component definitions, and unstandardized wrappers:

1. **Missing `Select`**: Raw HTML `<select>` elements are used at `AnalyticsSection.tsx:937` (Komoditas) and line `949` (Wilayah), causing visual styling friction with the rest of the dark command HUD.
2. **Missing `Chip`**: Freshness indicators (`AnalyticsSection.tsx:1022`) and metadata badges use bespoke `<span>` tags with manual flex and dot wrappers.
3. **Missing `Card`**: Analytics widget frames and panels use unstandardized `div` containers with repeated border and background classes.
4. **Local `Empty` (`AnalyticsEmpty`)**: Defined locally at `AnalyticsSection.tsx:172` rather than as a reusable shared primitive. Must be elevated to `@/components/base-ui/empty.tsx` while strictly preserving the `role="status"` attribute (essential Playwright E2E test hook).
5. **Local `Skeleton` (`LoadingSkeleton`)**: Defined locally at `AnalyticsSection.tsx:221` rather than as a shared primitive. Must be elevated to `@/components/base-ui/skeleton.tsx` while maintaining the default `h-11` row height and `motion-safe:animate-pulse`.
6. **Missing `Tooltip`**: Contextual titles and explanations currently rely on native browser `title="..."` attributes (lines 1009, 1035, 1196). A rich `@base-ui/react/tooltip` primitive is required, governed by the strict **No Portal over Mapbox** rule to prevent z-index clipping.
7. **Missing `Chart`**: Disparity and price spread visuals lack a standardized Base-UI container wrapping `recharts`, leading to potential chart overflow and theme dissonance.

### Core Architectural Invariants:
1. **Zero `npx shadcn add`**: All components must be sourced from Base-UI 1.9.0 primitives (`@base-ui/react`) or hand-rolled with exact Base-UI and Tailwind dark tactical contracts.
2. **`hideWhenDetached` Invariant**: Base-UI 1.9.0 does **not** include `hideWhenDetached`. Dismissal logic must never reference or assume this property.
3. **Portal-over-Mapbox Prohibition**: Popovers and Tooltips must **never** mount a portal directly over the Mapbox GL WebGL canvas layer (portal-clipping rule). Positioners must stay bounded within the panel DOM.
4. **Trigger Composition Safety**: Always implement safe `render` prop handling alongside `asChild` compatibility to avoid React runtime warnings and trigger unmounting bugs.
5. **Single-Writer Collision Prevention**: To avoid the P1/P3 race condition observed during Phase 114, edits to `AnalyticsSection.tsx` must be executed serially and atomically.
6. **Honest Empty & No RED Synthesis**: Empty states must render honest messages (`"Data tidak tersedia"`), and price disparity visuals must never fabricate synthetic red crisis polygons.

---

## Design System & UI/UX Standards (Anti-Slop & Watermelon)

- **Palette**: Dark Tactical Command HUD:
  - Surface: `#0c1017` / `#080d14`
  - Border: `border-white/10`
  - Text Primary: `text-slate-100` / `text-white`
  - Text Muted: `text-slate-400` / `text-slate-500`
  - Accent: High-contrast emerald (`#10b981`), amber (`#f59e0b`), rose (`#f43f5e`), cyan (`#06b6d4`)
- **Typography & Numerics**:
  - Minimum font size: `text-xs` (12px), zero unreadable micro-text
  - `tabular-nums` applied unconditionally to all numbers, prices, timestamps, and percentages
- **Motion & Accessibility**:
  - All animations prefixed with `motion-safe:` (e.g., `motion-safe:animate-[analytics-fade_300ms_ease]`, `motion-safe:animate-pulse`)
  - Full respect for `prefers-reduced-motion` (renders static final state)
  - `cursor-pointer` on all interactive triggers, buttons, and select options

---

## Work Packages

### WP1: Interactive Headless Primitives (`select.tsx` & `tooltip.tsx`)
- **Target Files**:
  - `frontend/components/base-ui/select.tsx`
  - `frontend/components/base-ui/tooltip.tsx`
- **Deliverables**:
  1. `select.tsx`:
     - Built on `@base-ui/react/select`: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectSeparator`.
     - Styling: `h-8 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/30`.
     - Popup: `bg-[#0c1017] border border-white/10 rounded-lg shadow-2xl p-1 z-50 text-xs backdrop-blur-xl`.
     - Item: `px-2.5 py-1.5 rounded-md hover:bg-white/10 text-slate-200 cursor-pointer flex items-center justify-between`.
  2. `tooltip.tsx`:
     - Built on `@base-ui/react/tooltip`: `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`.
     - Styling: `bg-[#121822] text-slate-100 border border-white/10 text-xs px-2.5 py-1 rounded-md shadow-xl`.
     - Invariant: Support bounded container positioning; enforce non-portal rendering when declared inside mapside panels.

### WP2: Layout, Feedback & State Primitives (`card.tsx`, `chip.tsx`, `empty.tsx`, `skeleton.tsx`)
- **Target Files**:
  - `frontend/components/base-ui/card.tsx`
  - `frontend/components/base-ui/chip.tsx`
  - `frontend/components/base-ui/empty.tsx`
  - `frontend/components/base-ui/skeleton.tsx`
- **Deliverables**:
  1. `card.tsx`:
     - Modular card container: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
     - Base styling: `bg-[#0c1017] border border-white/10 rounded-xl shadow-lg overflow-hidden`.
  2. `chip.tsx`:
     - Flexible chip/pill: `variant` ('default' | 'outline' | 'secondary' | 'status'), `size` ('sm' | 'default').
     - Styling: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium tabular-nums`.
     - Dot indicator support (`statusDot?: boolean`, color-mapped).
  3. `empty.tsx`:
     - Shared empty state: Props `loading?: boolean`, `title?: string`, `message?: string`, `icon?: LucideIcon`, `children?: React.ReactNode`.
     - Critical E2E Contract: When `loading={true}`, must render `role="status"` with visible `"Memuat…"` text.
     - Styling: `flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed border-white/10 text-slate-400`.
  4. `skeleton.tsx`:
     - Shared loading placeholder: Props `rows?: number`, `rowClassName?: string`, `className?: string`.
     - Accessible: `aria-hidden="true"`.
     - Styling: `motion-safe:animate-pulse bg-white/5 rounded-md w-full h-11`.

### WP3: Data Visualization Primitive (`chart.tsx`)
- **Target Files**:
  - `frontend/components/base-ui/chart.tsx`
- **Deliverables**:
  1. Responsive container wrapper for `recharts` (`ResponsiveContainer`, `Tooltip`, `Legend`).
  2. Dark theme tooltip formatter: `ChartTooltip`, `ChartTooltipContent` with `tabular-nums` formatting, custom color indicators, and value prefixes/suffixes (e.g., `Rp`, `%`, `kg`).
  3. Pure presentation: Does not fetch data or trigger side effects; renders given series faithfully.

### WP4: Consumer Integration in `AnalyticsSection.tsx`
- **Target Files**:
  - `frontend/components/dashboard/AnalyticsSection.tsx`
- **Deliverables**:
  1. Import all 7 new primitives from `@/components/base-ui/*`.
  2. Remove local `AnalyticsEmpty` (lines 172-183) and replace call sites (e.g. line 1012, 1200) with imported `Empty`.
  3. Remove local `LoadingSkeleton` (lines 221-232) and replace call sites with imported `Skeleton`.
  4. Replace native HTML `<select>` controls in the price filter bar (lines 937-958) with Base-UI `Select` components (`SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`).
  5. Replace bespoke freshness `<span>` elements (lines 1022-1026) with Base-UI `Chip` components.
  6. Refactor outer panels into `Card` and `CardContent` wrappers.
  7. Replace static native `title="..."` attributes with Base-UI `Tooltip`.
  8. Enforce zero layout shifts and preserve all test hooks.

### WP5: Verification Gate & Automated Test Suite
- **Target Files**:
  - `frontend/scripts/test_phase115_watermelon_mcp_connect.ts`
- **Verification Gates**:
  1. **Contract Integrity**: Automated TypeScript test script validating all 7 primitives, their props contracts, and `role="status"` hook.
  2. **Type Safety**: `npx tsc --noEmit` must pass with exactly 0 errors.
  3. **Build Validation**: `npm run build` must compile 7/7 static routes with 0 failures.
  4. **Backend Parity**: Backend `pytest` suite must remain 100% green.
  5. **Zero Portal-over-Mapbox**: Verify DOM hierarchy ensures no tooltip/popover portals overlay the map canvas.

---

## Verification Plan & Proof of Work

### Automated Test Script Specification
File: `frontend/scripts/test_phase115_watermelon_mcp_connect.ts`
Suites:
1. `Select` primitive renders with correct accessible attributes and values.
2. `Chip` primitive supports status dots, variants, and tabular numbers.
3. `Card` primitive exports all structural parts with proper dark classes.
4. `Empty` primitive renders `role="status"` and `"Memuat…"` text when loading is true.
5. `Skeleton` primitive renders pulse animation and `aria-hidden="true"`.
6. `Tooltip` primitive works without `hideWhenDetached` errors and supports local panel bounds.
7. `Chart` primitive exports tooltip content and container components without runtime errors.

### Manual Verification Checklist
- [ ] Open `https://pre-hub.vercel.app/dashboard` (or `localhost:3000/dashboard`).
- [ ] Switch to **Analitik** tab.
- [ ] Verify Komoditas and Wilayah dropdowns render as Base-UI Select with Dark Tactical popups.
- [ ] Verify Kesegaran Data strip renders clean Chips with status dots.
- [ ] Verify Empty state displays cleanly when selecting an unrepresented commodity/region.
- [ ] Verify tooltips appear on hover without flickering or clipping behind the 3D Mapbox canvas.

---

## Risk Register & Mitigations

| Risk | Impact | Probability | Mitigation Strategy |
|---|---|---|---|
| Base-UI missing `hideWhenDetached` runtime crash | HIGH | HIGH | Do not pass or use `hideWhenDetached` on any Base-UI component. |
| `role="status"` regression breaks Playwright E2E | HIGH | LOW | Explicit test case in `test_phase115_watermelon_mcp_connect.ts` asserting `role="status"`. |
| Mapbox canvas clipping tooltips/popovers | MEDIUM | MEDIUM | Render tooltips inline within panel boundaries; forbid mounting portals directly over map canvas. |
| Merge conflict in `AnalyticsSection.tsx` | HIGH | MEDIUM | Serialize all modifications; apply changes in a single atomic pass. |
| Accidental git push | CRITICAL | LOW | User constraint strictly respected: **DO NOT GIT PUSH**. All work remains local. |
