# Plan: Close Open Audit Items (2, 4, 5, 6, 8)

Source: `SYSTEM_AUDIT_AND_ROOT_CAUSE_ANALYSIS.md` (stale). Re-verified against repo at Phase 55. Items 1, 3, 7, 9, 10, 11, 12 are already fixed and out of scope.
Research: GLM 5.3 Flash (verification), MiMo V2.6 Pro (planning). Findings are from file reads by subagents; spot-check before execution.

## Decisions (user confirmed)
| ID | Decision |
|---|---|
| D1 | Flood radius toggle `[5, 8, 15]` km, default 8 |
| D2 | `exclude=toll` only if hazard is within radius+2 km of a toll/interchange node; retry without it on NoRoute |
| D3 | Keep `FALLBACK_FLEET`, but only behind an explicit "Mode Simulasi" badge/toggle (default off shows honest empty/loading) |
| D4 | Demo stage 4 opens Economic; approve/dispatch CTA opens Mitigation; no timers |
| D5 | `/spikes` = % change vs 30-day baseline, min-records guard, honest `[]` if insufficient |

## Guardrails (AGENTS.md)
- CPU solver only. Do not touch or revive `cuopt_adapter.py`.
- No hardcoded "+17.1%" or "Rp 210 Juta". Economic cards render only payload values, with empty state.
- UI: lucide SVG icons, `cursor-pointer`, glass style, 150-300ms transitions.

## Order and work packages

### WP1 (S): Footer vs drawer at 1366x768
- `DashboardClient.tsx` ~L1816-1823 and `CrisisSimulatorBar.tsx` ~L115-123: replace `lg:left-[calc(50%-30px)]` family with `lg:left-[calc((100vw-424px)/2)]` when drawer open; add `max-w-[calc(100vw-460px)]`.
- Verify: Playwright 1366x768 @100%, footer/drawer gap >= 24px.

### WP2 (M): Toll bypass
- `aiDynamicRouter.ts` L260, L311 (and `mapboxRoutingService.ts` L359): add `excludeToll` param -> `&exclude=toll`, per D2; retry without on NoRoute.
- HOLD card (~L689-694): do not reuse compromised waypoints; use `waypoints: []`, set `is_compromised` honestly.
- Radius options per D1; update hardcoded 15 at `DashboardClient.tsx` ~L988, 996, 1545; `CrisisSimulatorBar.tsx` ~L339.
- Verify: URL unit tests; Lubuk Pakam demo haversine clearance script shows no polyline inside circle.

### WP3 (M): Economic demo
- `DashboardClient.tsx` ~L1004-1014: stage 4 -> `Economic`; CTA -> `Mitigation`.
- `GuidedDemoPanel.tsx`: cards from `inflation_forecast` (commodity, pct_increase, timeframe_hours) and `economic_intelligence_finding.data`; empty state when absent.
- `EconomicTab.tsx` L89: fall back to root `ltm_episodes`; remove hardcoded chart prices (L29-31).
- Update DEMO_SCRIPT.
- Verify: tsc, build, offline demo walks Evidence -> Economic -> Mitigation.

### WP4 (M): News link integrity
- `unified_news_ingestor.py`: `_is_link_alive()` via httpx (follow redirects, 4s timeout, Semaphore(5), TTL cache). Dead = status >= 400, final path is `/`, or host changed. Timeout = `unknown` (not dead). Attach `link_alive`.
- `DashboardClient.tsx` ~L1529: dead link -> "Tautan asli kedaluwarsa" + expandable stored excerpt. Replace `/berita/49` heuristic.
- `EvidenceTab.tsx`: excerpt-first card, "Buka sumber" only when alive; remove hardcoded fallback string (~L54).
- Verify: pytest with mocked httpx (redirect-to-base, 200, timeout).

### WP5 (M, last): Mock purge
1. `social_scraper.py`: delete `MOCK_SOCIAL_POSTS` + stale comment (confirm no importers).
2. `commodity_router.py` `/spikes`: compute per D5; drop `import random`.
3. `EvaluationSection.tsx`: init `[]`, remove `?? 1.0` literals, show "Belum dihitung".
4. `useFleetVehicles.ts`: per D3, fallback fleet only when simulation toggle on; check `vehicles_router.py` offline cache first.
5. `mock_crisis_state.json` `causal_chain`: derive in `demo_router.py`; label "Rantai Sebab-Akibat (Simulasi)".
- Update `backend/tests` that assert old mocks.

## Global verification
`tsc --noEmit`, `npm run build`, `pytest backend/tests` (baseline 178), Playwright collision check, offline demo walkthrough, repo search for `MOCK_SOCIAL|FALLBACK_OUTCOMES|62000|38500` returns 0 (FALLBACK_FLEET allowed only behind the toggle).

## Execution delegation (per cmdc-subagent-dispatch)
- WP1, WP2, WP3, WP4, WP5: DeepSeek V4.1 Flash, `--yolo --tools-all --effort max`, one WP at a time; I review `git diff` and run builds after each.
- No deletions of directories/multiple files without user confirmation.

## Risks
- Radius default change alters demo visuals.
- Known tooling quirk: subagent reported `grep` returned empty in this workspace; use direct reads.
- cmdc failure/quota: I take over directly.
