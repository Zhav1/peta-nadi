# Phase 100 - Learnings

**Rule:** only decisions and observations evidenced by the diff, the tests, or the window log.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| One dock math owns all overlap | `frontend/lib/mapDockLayout.ts` (`resolveAlertQueueClasses`, `420px`, `calc((100%-390px)/2)`) | Drawer open/closed can no longer diverge. |
| Distill queue header to `Peringatan` | `frontend/components/dispatcher/DispatcherAlertQueue.tsx` | One focal point; subtitle noise removed. |
| Simulator is a no-wrap opaque single dock | `frontend/components/crisis/CrisisSimulatorBar.tsx` | Wrapping growth eliminated. |
| Floor type at `text-xs` | 48-file codemod, 100+ hits | Sub-12px microtype gone. |
| Floor recharts `fontSize` at 12 | codemod | Chart labels meet the same floor. |
| Remove glow shadows and backdrop-blur | codemod | Quieter surfaces, cheaper compositing. |
| Remove inert `animate-in` tokens | codemod (no `tailwindcss-animate` installed) | Dead classes no longer imply motion. |
| Popovers go through the `Popover` block | TopNavTelemetry, IntermodalTerminalPopover, CrisisSimulatorBar, CrisisMap search/layer | One popover behavior; cursor-anchored keep `fixed`, restyled. |
| Dialogs go through the `AlertDialog` block | AuthModal, FleetOnboardingModal, RouteDetailModal, HitlDecisionDrawer, CrisisSidebar shell | One dialog behavior; HITL gains AlertDialog semantics. |
| Tables go through the `Table` block | DispatcherAlertQueue, ReportsSection, AnalyticsSection, TenantFleetRoster, ERPSavingsPanel | One table behavior. |
| Toast goes through Sonner compat shim | `notifyToast`, ~30 call sites unchanged, `z-[9999]` container deleted | Call sites untouched; old triple-stack gone. |
| Eyebrow/kicker above heading is a ban | eyebrows reverted in onboard/charts/UI pass | Headings stand alone. |
| Delete `GlassPanel.tsx` after swap | `SourceHealthBanner` swap | One glass surface, not two. |
| Manual scaffold over `shadcn add` | `components.json` + `components/base-ui/` + `components/watermelon/` | No Radix/motion/CSS-vars conflict with Base stack. |
| Pin `@base-ui/react@1.9.0` | `frontend/package.json`, `sonner@2.0.8` | Deprecated RC package removed from the tree. |
| Keep Mapbox uppercase | Mapbox style (`text-transform:uppercase`) | Cartography labels preserved. |
| Keep `SIMULASI`/`OFFLINE` regex + MitigationTab comments | backend detection dependency | Detection keeps working. |
| Never install `watermelon-ui` from npm | squatter package | Supply-chain trap avoided. |

## 2. Fixes tried and why they changed

1. **First approach:** `@base-ui-components/react@1.0.0-rc.0`. **Problem:** deprecated. **Replaced by:** `@base-ui/react@1.9.0`.
2. **First approach:** `npx shadcn add`. **Problem:** pulls Radix/motion/CSS-vars, conflicts with Base stack. **Replaced by:** manual scaffold.
3. **First approach:** `Positioner hideWhenDetached`. **Problem:** missing in 1.9.0. **Replaced by:** prop removed.
4. **First approach:** plain `tsc` with warm buildinfo. **Problem:** stale `tsconfig.tsbuildinfo` false failure. **Replaced by:** `--incremental false`.
5. **First approach:** PowerShell `&&` / `head`. **Problem:** fails on Windows PowerShell. **Replaced by:** `;` + `Select-Object`.
6. **First approach:** `python -c` inline. **Problem:** quoting breaks. **Replaced by:** script file, then deleted.

## 3. Concerns (open, evidenced)

1. **HITL backdrop** no longer dismisses on outside click; needs owner confirm before any change.
2. **Toast bursts** stack; Sonner `id` dedup is the candidate fix.
3. **Search Trigger** `div` padding clicks toggle the menu (accepted, not fixed).
4. **Shell-vs-inner token split** (`white/10` vs `#1c2432`) deferred to follow-up.
5. **LF-over-CRLF churn** in diffs; `git diff -w` required for review.
6. **Playwright 404 asset errors** pre-existing; diag itself is 1 passed.

## 4. Mistakes not to repeat

- **Do not hand-roll another overlay.** Route through Popover / AlertDialog / Table blocks.
- **Do not ship sub-12px type.** Floor is `text-xs` / recharts 12.
- **Do not add glow `shadow-[0_0_*]` or `backdrop-blur` for emphasis.** Distill instead.
- **Do not leave `animate-in` without the plugin installed.** It is inert and misleading.
- **Do not stack fixed `z-[9999]` toast containers.** One Sonner `Toaster` in `app/layout.tsx`.
- **Do not put a kicker/eyebrow above a heading.** It is banned; it was added then reverted once already.
- **Do not nest `bg-[#121822]` cards inside same-tone shells.** Use the token boundary pass.
- **Do not `npx shadcn add` into the Base stack.** Scaffold manually.
- **Do not install `watermelon-ui` from npm.** It is a squatter.
- **Do not touch Mapbox uppercase or the `SIMULASI`/`OFFLINE` regex.** One is cartography, the other is backend detection.
- **Do not use `&&` / `head` / `python -c` in PowerShell here.** Use `;`, `Select-Object`, script files.
- **Do not trust a red `tsc` with warm buildinfo.** Re-run with `--incremental false`.
- **Do not use `Positioner hideWhenDetached` on `@base-ui/react@1.9.0`.** It does not exist.
- **Do not review this window's diff without `-w`.** Line-ending churn hides real changes.

## 5. Constraints carried into this phase

- Windows repo `D:\College\Pidi.id`, branch `main`; frontend Next 14.2.35, React 18, Tailwind 3.4 in `frontend/`.
- Opencode session with Muse Spark orchestrator + explore/general worker subagents; Impeccable skill (`DESIGN.md` authority, Operate mode).
- PowerShell shell: no `&&`, no `head`; `python -c` quoting breaks — use script files.
- Impeccable philosophy (clarify + distill, quieter, spatial restraint, one focal point); dispatcher-wins-dashboard / calm-wins-landing; curated-list-wins then watermelon-completely; strict zoned grid; 3-goal milestone slice.
- Feasible-hybrid execution (no Deepseek/GLM model IDs exist here; no `/goal` / `/boost` tools — mapped to planning milestone).
- Globot `AGENTS.md`: small reviewable changes, `pnpm build`, no mock-as-live.
- Docs only in this pass: no code edits outside `.planning/phases/100-watermelon-migration-impeccable-distill/`; facts only, no speculative content.
