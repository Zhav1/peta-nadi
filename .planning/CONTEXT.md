# CONTEXT — Phase 12: UI/UX Refinement & Runtime State Fixes

## Problem Description
Based on visual feedback from dashboard staging, three UI/UX regressions were identified:

1. **Top Status Bar & Widget Overlap**:
   - `CrisisSidebar` is currently positioned at `top-4 right-4` (`absolute top-4`), which places it at y=16px, directly overlapping the fixed top header navbar (`fixed top-0 h-16`, y=0 to 64px) and obscuring top-right header controls (`UTC+00:00`).
   - The left tactical column in `DashboardClient.tsx` has insufficient spacing/padding, causing the National Logistics Health gauge card to clip under the micro-telemetry ticker bar.

2. **Abrupt Left Sidebar Hover Expansion**:
   - The left `<aside>` navigation sidebar expands from `w-20` to `w-64` on hover, but lacks standard smooth CSS easing functions (`ease-in-out`), making the expansion feel abrupt and harsh over the map viewport.

3. **Demo Trigger Hardening**:
   - Action buttons in `GuidedDemoPanel.tsx` (such as "Run Demo" and "Load Replay") lack explicit `type="button"` attributes and event guards (`preventDefault` / `stopPropagation`), risking form submissions or unhandled reloads/crashes in certain browser contexts.
   - `useDemoState.ts` needs hardened error handling around demo initialization to prevent unhandled promise rejections.

## Technical Design Decisions
- **Sidebar Position**: Update `CrisisSidebar.tsx` container class to `top-20 right-6 max-h-[calc(100vh-12rem)]`. This places the panel 80px from the top (giving 16px clearance below the 64px fixed header navbar) and caps height so it stays above the bottombar controls.
- **Sidebar Easing**: Apply `transition-all duration-300 ease-in-out` on `<aside>` and `transition-opacity duration-300 ease-in-out` on text labels.
- **Button Safety**: Ensure all buttons in `GuidedDemoPanel.tsx` explicitly set `type="button"` and handle clicks safely.
