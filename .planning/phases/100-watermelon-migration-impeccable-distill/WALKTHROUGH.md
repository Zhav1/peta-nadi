# Phase 100 - Walkthrough (what actually changed)

**Scope:** G1 dock unification, 48-file codemod, five boost units, watermelon wiring, AgentStatusWidget fix.
**Code state:** implemented in the working tree (55+ files per git diff/status); this pass only adds `.planning/` documentation.
**Verified by:** `tsc`, production build, `impeccable detect`, Playwright diag.

---

## 1. Changed files and line evidence

### 1.1 G1 - dock math + header + simulator + toast install

| File:line | Change |
|---|---|
| `frontend/lib/mapDockLayout.ts` | Unified dock math: `left-1/2 + -translate-x-1/2`, `lg` shift `calc((100%-390px)/2)`, `420px` everywhere, `resolveAlertQueueClasses`. |
| `frontend/components/dispatcher/DispatcherAlertQueue.tsx` | Recentered via `isCrisisDrawerOpen`; header distilled to `Peringatan`. |
| `frontend/components/crisis/CrisisSimulatorBar.tsx` | No-wrap opaque single dock. |
| `frontend/app/layout.tsx` | Global Sonner `Toaster` mounted. |
| `frontend/package.json` | Installed `sonner@2.0.8` + `@base-ui/react@1.9.0`. |

### 1.2 Mechanical codemod (48 files)

| Pattern | Action |
|---|---|
| `text-[9/10/11px]` | Replaced with `text-xs` (100+ hits). |
| recharts `fontSize` < 12 | Raised to `12`. |
| `shadow-[0_0_*]` | Removed. |
| `backdrop-blur` | Removed. |
| inert `animate-in` tokens | Removed (no `tailwindcss-animate` installed). |

### 1.3 Boost unit - popovers

Converted to the watermelon `Popover` block: `TopNavTelemetry`, `IntermodalTerminalPopover`, `CrisisSimulatorBar`, CrisisMap search/layer. Cursor-anchored context/route popovers kept `fixed`, restyled onto the block.

### 1.4 Boost unit - dialogs

Converted to the `AlertDialog` block: `AuthModal`, `FleetOnboardingModal`, `RouteDetailModal`, `HitlDecisionDrawer` (fixed-right via Base primitives), `CrisisSidebar` (non-modal shell).

### 1.5 Boost unit - tables

Converted to the `Table` block: `DispatcherAlertQueue`, `ReportsSection`, `AnalyticsSection`, `TenantFleetRoster`, `ERPSavingsPanel`.

### 1.6 Boost unit - toast

Sonner compat shim `notifyToast` kept its signature so ~30 call sites stayed unchanged; the fixed `top-20 z-[9999]` container was deleted.

### 1.7 Boost unit - onboard / charts / UI leftovers

Eyebrows reverted per kicker ban; `GlassPanel.tsx` DELETED after the `SourceHealthBanner` swap; `FreshnessBadge` / `StatusHeader` quieted.

### 1.8 Watermelon scaffold

| Path | Content |
|---|---|
| `components.json` | Scaffold config. |
| `components/base-ui/` | 8 primitives. |
| `components/watermelon/` | `popover-1`, `data-table-1`, `dialog-1`. |

Dark hex tokens shipped with the scaffold. Zero app-code usage at scaffold time; fully wired by end of window.

### 1.9 Direct fix

`AgentStatusWidget`: last hand-built `absolute top-full` popover converted to `Popover`.

No code edits were made outside the files above plus the scaffold; no backend files changed.

---

## 2. Verification results

| Command | Result |
|---|---|
| `npx tsc --noEmit` (frontend) | **0 errors** |
| production build | **7/7** |
| `impeccable detect` | **empty list** |
| Playwright diag | **1 passed** |

Playwright 404 asset errors observed are pre-existing.

---

## 3. Fixes tried and why they changed

1. **First approach:** `@base-ui-components/react@1.0.0-rc.0`. **Problem:** package deprecated. **Replaced by:** `@base-ui/react@1.9.0`.
2. **First approach:** `npx shadcn add`. **Problem:** would pull Radix/motion/CSS-vars, conflicting with the Base stack. **Replaced by:** manual scaffold (`components.json` + `components/base-ui/` + `components/watermelon/`).
3. **First approach:** `Positioner` with `hideWhenDetached`. **Problem:** prop missing in 1.9.0. **Replaced by:** prop removed.
4. **First approach:** plain `npx tsc --noEmit`. **Problem:** stale `tsconfig.tsbuildinfo` produced a false failure. **Replaced by:** `--incremental false` run.
5. **First approach:** PowerShell with `&&` / `head`. **Problem:** both fail under the Windows PowerShell shell. **Replaced by:** `;` chaining + `Select-Object`.
6. **First approach:** `python -c` inline quoting. **Problem:** quoting breaks in this shell. **Replaced by:** script file, then deleted.

---

## 4. Behavior deltas an operator will see

1. Alert queue stays centered whether the crisis drawer is open or closed; header reads `Peringatan`.
2. Simulator bar is a single opaque dock that no longer wraps or grows.
3. All text is at least `text-xs`; sub-12px microtype is gone.
4. Glow shadows and backdrop-blur are gone; surfaces are quieter.
5. Popovers, dialogs, and tables share one block each instead of hand-built variants.
6. Toasts route through Sonner; the old fixed triple-stack container is gone (rapid bursts now stack).
7. HITL drawer no longer dismisses on outside click (AlertDialog semantics).
8. `GlassPanel.tsx` is gone; `SourceHealthBanner` carries that surface.

## 5. Pre-existing conditions preserved

- `SIMULASI` / `OFFLINE` regex and 2 `MitigationTab` comments untouched (backend detection).
- Mapbox `text-transform:uppercase` untouched (cartography).
- 27 `LIVE`/`SIAGA`/`SINKRON` pills kept as live status signal, not eyebrow decoration.

## 6. Residual risks

1. **HITL backdrop** no longer dismisses on outside click; needs owner confirm.
2. **Toast bursts** stack; Sonner `id` dedup not yet applied.
3. **Search Trigger** `div` padding clicks toggle the menu (accepted).
4. **Token boundary** split: shell `white/10` vs inner `#1c2432` until follow-up.
5. **Line-ending churn** LF-over-CRLF; review with `git diff -w`.
6. **Playwright 404s** pre-existing.
