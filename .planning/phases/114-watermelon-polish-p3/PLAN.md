# PLAN — Phase 114: Watermelon Polish P3

**Status:** COMPLETE ✅
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High subagents (no default subagent; no direct tool calls — all work via subagents)

## Goal

Apply Watermelon P3 motion/a11y polish to Analitik: `AnimatedValue` count-ups, `LoadingSkeleton` placeholders, and `motion-safe:` guards on every animation so reduced-motion renders the final static state.

## Scope

- `frontend/components/dashboard/AnalyticsSection.tsx:187` — no-new-deps rule: polish via utility classes + existing primitives only.
- `frontend/components/dashboard/AnalyticsSection.tsx:200` — `AnimatedValue` (`motion-safe:animate-[analytics-fade_300ms_ease]`, L212; `tabular-nums` passthrough).
- `frontend/components/dashboard/AnalyticsSection.tsx:199` — reduced-motion contract: animation resolves to the final static state.
- `frontend/components/dashboard/AnalyticsSection.tsx:221` — `LoadingSkeleton` (`rows`, `rowClassName`, `motion-safe:animate-pulse`, L227).
- `frontend/components/dashboard/AnalyticsSection.tsx:1141` — `motion-safe:transition-colors motion-safe:duration-150` on interactive rows.
- `frontend/components/dashboard/AnalyticsSection.tsx:988-1105` — `AnimatedValue` call sites (regime counts L988/L996/L1004, corridor count L1081, shallots delta L1105).

## Decisions

1. `motion-safe:` on every animation utility — no bare `animate-*`/`transition-*` in Analitik.
2. Skeleton geometry = real geometry (`h-11` rows) — no layout shift on swap.
3. `AnimatedValue` is display-only; screen readers get the final value via the `role=status` region in `AnalyticsEmpty` (L220) and static text fallbacks.

## Interfaces

- In: numeric values already in scope (`regime.*`, `activeRoutes.length`, deltas).
- Out: same DOM shape, animated; no prop/API changes, no new deps.

## Guardrails

- Xhigh orchestrator + High subagents MUST be used (no default subagent); never direct tool calls, always via subagents.
- Playwright auto-check required; E2E no-interference (Peta/Laporan/Evaluasi + `approvals:write`/`fleet:write` 403).
- Dark editorial: 12px min, `tabular-nums`, Lucide only.
- Commit via `git add .` + `git commit -m` then push for Vercel (operator-side; this docs pass does NOT commit).
