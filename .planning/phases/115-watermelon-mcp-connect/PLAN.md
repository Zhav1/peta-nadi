# PLAN — Phase 115: Watermelon MCP Connect

**Status:** PLANNED ⏳ (gaps + risks logged this window; connection work not started)
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High subagents (no default subagent; no direct tool calls — all work via subagents)

## Goal

Close the remaining Watermelon primitive gaps for Analitik (Select, Chip, Card, Empty, Skeleton, Tooltip, Chart) via Watermelon MCP — without `npx shadcn add`, without Portal-over-Mapbox, and without re-triggering the P1/P3 same-file collision.

## Scope (planned)

- Source missing primitives from Watermelon MCP catalog into `@/components/base-ui/*` (hand-rolled, base-ui-consistent if MCP lacks a slot).
- Consumers: `AnalyticsSection.tsx` filter bars (Select), chip rows (Chip), widget frames (Card), honest-empty (Empty), loading (Skeleton), static titles (Tooltip), disparity visuals (Chart).
- Explicit non-goals: no Cesium, no new backend routes, no RED-synthesis semantics change, no PII surface.

## Decisions (carried constraints)

1. `npx shadcn add` is BANNED — primitives come from Watermelon MCP or hand-rolled base-ui-consistent blocks.
2. Base-UI 1.9.0: `hideWhenDetached` is MISSING — popover/tooltip dismissal must not depend on it.
3. No Portal/Popover/Tooltip over the Mapbox canvas (portal-clipping rule, Phase 112 L1130).
4. Lock the `asChild`-safe trigger pattern; the `asChild` vs render-prop warning stays a review gate.
5. One writer per file at a time (P1/P3 collision rule, Phase 114).

## Interfaces (planned)

- In: existing Analitik states (`commodity`, `priceRegion`, `corridorFilter`, `days`, spikes/rank payloads).
- Out: drop-in primitive swaps; same DOM roles (`role=status` E2E hook in Empty preserved), same `tabular-nums`/`text-xs` chrome.

## Guardrails

- Xhigh orchestrator + High subagents MUST be used (no default subagent); never direct tool calls, always via subagents.
- Playwright auto-check required; E2E no-interference (Peta/Laporan/Evaluasi + `approvals:write`/`fleet:write` 403).
- Dark editorial: 12px min, `tabular-nums`, Lucide only; `motion-safe:` on every animation.
- Commit via `git add .` + `git commit -m` then push for Vercel (operator-side; this docs pass does NOT commit).
