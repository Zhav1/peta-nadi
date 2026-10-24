# Phase 100 - Watermelon Migration Impeccable Distill

**Status:** IMPLEMENTED in working tree; documented in this pass.
**Work packages:** G1 (dock-math unification), mechanical codemod (48 files), five parallel boost units (popovers / dialogs / tables / toast / onboard-charts-ui), watermelon scaffold wiring, AgentStatusWidget direct fix.
**Depends on:** Phase 99 (honest UI and risk batch).

---

## 1. Goal

Remove every hand-built overlay and quiet every loud surface under Impeccable rules:

1. One dock math owns all dispatcher overlap: `mapDockLayout.ts` with `left-1/2 + -translate-x-1/2`, `lg` shift `calc((100%-390px)/2)`, `420px` everywhere, `resolveAlertQueueClasses`.
2. No sub-12px type, no glow shadows, no backdrop-blur, no inert `animate-in` tokens remain in the 48-file codemod scope.
3. All popovers route through the watermelon `Popover` block; all dialogs through the `AlertDialog` block; all tables through the `Table` block; all toasts through the Sonner compat shim.
4. The watermelon scaffold (`components.json` + `components/base-ui/` + `components/watermelon/`) goes from zero app-code usage to fully wired.
5. Final gate is green: `tsc` 0 errors, build 7/7, `impeccable detect` clean, Playwright diag 1 passed.

---

## 2. Guardrails

- **DO NOT TOUCH** outside `frontend/` except scaffold config (`components.json`); no backend changes in this window.
- No mock-as-live: per Globot `AGENTS.md`, small reviewable changes, `pnpm build`, no mock data presented as live.
- Impeccable philosophy: clarify + distill, quieter, spatial restraint, one focal point.
- `dispatcher-wins-dashboard` / `calm-wins-landing`; curated-list-wins then watermelon-completely.
- Strict zoned grid for overlap; 3-goal milestone slice.
- Feasible-hybrid execution: no Deepseek/GLM model IDs exist here, no `/goal` / `/boost` tools — mapped to planning milestone.
- Keep `SIMULASI` / `OFFLINE` regex and the 2 `MitigationTab` comments (backend detection depends on them).
- Keep Mapbox `text-transform:uppercase` (cartography, not UI eyebrow).
- Review diffs with `git diff -w` (LF-over-CRLF churn present).
- No `npx shadcn add` (would pull Radix/motion/CSS-vars, conflicts with Base stack).

---

## 3. G1 - Dock-math unification

| File:line | Change |
|---|---|
| `frontend/lib/mapDockLayout.ts` | Single owner of dock math: `left-1/2 + -translate-x-1/2`, `lg` shift `calc((100%-390px)/2)`, `420px` everywhere, `resolveAlertQueueClasses`. |
| `frontend/components/dispatcher/DispatcherAlertQueue.tsx` | Recentered via `isCrisisDrawerOpen`; header distilled to `Peringatan`. |
| `frontend/components/crisis/CrisisSimulatorBar.tsx` | No-wrap opaque single dock. |
| `frontend/app/layout.tsx` | Global Sonner `Toaster` mounted. |
| `frontend/package.json` | Adds `sonner@2.0.8` + `@base-ui/react@1.9.0`. |

Why: COLUMN2 previously had 7 absolute layers; the queue never shifted (410px vs 420px divergence); the simulator wrapped and grew; the demo panel used a divergent offset. One math module removes the divergence.

---

## 4. Mechanical codemod (48 files)

| Pattern | Replacement |
|---|---|
| `text-[9/10/11px]` | `text-xs` |
| recharts `fontSize` < 12 | `12` |
| `shadow-[0_0_*]` | removed |
| `backdrop-blur` | removed |
| inert `animate-in` tokens | removed (no `tailwindcss-animate` installed) |

Result: `tsc` 0 errors after the codemod.

---

## 5. Five parallel boost units

### 5.1 Popovers to Popover block

`TopNavTelemetry`, `IntermodalTerminalPopover`, `CrisisSimulatorBar`, CrisisMap search/layer popovers. Cursor-anchored context/route popovers kept `fixed` positioning, restyled onto the block. Last hand-built `absolute top-full` popover (`AgentStatusWidget`) converted direct in this window.

### 5.2 Dialogs to AlertDialog block

`AuthModal`, `FleetOnboardingModal`, `RouteDetailModal`, `HitlDecisionDrawer` (fixed-right via Base primitives), `CrisisSidebar` (non-modal shell).

### 5.3 Tables to Table block

`DispatcherAlertQueue`, `ReportsSection`, `AnalyticsSection`, `TenantFleetRoster`, `ERPSavingsPanel`.

### 5.4 Toast to Sonner compat shim

`notifyToast` signature kept; ~30 call sites unchanged; fixed `top-20 z-[9999]` container deleted.

### 5.5 Onboard / charts / UI leftovers

Eyebrows reverted per kicker ban; `GlassPanel.tsx` DELETED after `SourceHealthBanner` swap; `FreshnessBadge` / `StatusHeader` quieted.

---

## 6. Watermelon scaffold wiring

| Path | Content |
|---|---|
| `components.json` | Scaffold config. |
| `components/base-ui/` | 8 primitives. |
| `components/watermelon/` | `popover-1`, `data-table-1`, `dialog-1`. |
| Dark hex tokens | Shipped with scaffold. |

State at scaffold time: zero app-code usage. State at end of this window: fully wired via the five boost units above.

---

## 7. Acceptance criteria

- [x] One dock math; `420px` everywhere; queue recenters on drawer state.
- [x] 48-file codemod applied; `tsc` 0.
- [x] Popovers / dialogs / tables / toast all on blocks/shim; no hand-built overlay remains (AgentStatusWidget fixed).
- [x] Watermelon scaffold fully wired.
- [x] `tsc` 0, build 7/7, `impeccable detect` empty, Playwright diag 1 passed.
- [x] `GlassPanel.tsx` deleted; kicker eyebrows reverted.
- [x] `SIMULASI`/`OFFLINE` regex + MitigationTab comments intact; Mapbox uppercase intact.

## 8. Verification plan

```powershell
cd frontend; npx tsc --noEmit
pnpm build
npx impeccable detect
npx playwright test --diag
```

Observed in this window: `tsc` 0 errors; build 7/7; `impeccable detect` empty list; Playwright diag 1 passed.

## 9. Forward plan for next window

1. **Shell-vs-inner token pass.** Outer shell uses `white/10`; inner cards use `#1c2432`. Unify the boundary in one pass.
2. **Toast burst dedup.** Rapid `setToast` bursts now stack; evaluate Sonner `id` dedup.
3. **HITL backdrop confirm.** Backdrop no longer dismisses on outside click (AlertDialog semantics); needs owner confirmation before any behavior change.
4. **Full Playwright overlap sweep** at 1366/768 covering drawer open/closed x queue/simulator/demo-panel states.
5. **Landing onboard polish** (remaining calm-wins-landing items).

## 10. Open concerns

- HITL backdrop no longer dismisses on outside click (AlertDialog semantics — needs owner confirm).
- Rapid `setToast` bursts now stack (consider Sonner `id` dedup).
- Search Trigger `div` padding clicks toggle the menu (accepted in this window).
- Shell-vs-inner token boundary (`white/10` vs `#1c2432`) deferred to follow-up.
- Line-ending churn LF-over-CRLF (review with `git diff -w`).
- Playwright 404 asset errors pre-existing.
