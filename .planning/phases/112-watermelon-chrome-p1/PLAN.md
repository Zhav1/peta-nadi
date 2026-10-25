# PLAN — Phase 112: Watermelon Chrome P1

**Status:** COMPLETE ✅
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High subagents (no default subagent; no direct tool calls — all work via subagents)

## Goal

Restyle Analitik chrome to Watermelon P1 primitives: Badge, Button, Popover, Separator, and the `AnalyticsEmpty` honest-empty block — dark editorial, 12px min, `tabular-nums`, Lucide only.

## Scope

- `frontend/components/dashboard/AnalyticsSection.tsx:30-35` — base-ui imports: `Badge` (L30), `Button` (L31), `Progress` (L32, P2-shared), `Table/*` (L33, P2-shared), `Popover/PopoverContent/PopoverTrigger` (L34), `Separator` (L35).
- Regime badge (L982: variant + class by `regime.regime`, `font-bold tracking-wide tabular-nums text-xs`).
- Freshness/provenance `Popover` (L1032–1051: `PopoverTrigger` wraps outline `Button` L1035, `PopoverContent side="bottom" sideOffset={8} w-72 p-4` L1040).
- Vertical `Separator` (L1028: `orientation="vertical" h-4`) between filter chips and provenance badge.
- `AnalyticsEmpty` (L172) as the single honest-empty block reused by all widgets.

## Decisions

1. Base-ui primitives over bespoke divs — one chrome language across Analitik.
2. Popover (not native `title`) only for provenance/freshness detail; static chrome titles keep native `title` tooltips (L1196).
3. No Portal/Popover over Mapbox canvas (L1130: portal clipping) — chrome popovers live in sidebar/panel DOM only.
4. Numbers always `tabular-nums text-xs`; regime counts via `AnimatedValue` (P3) inside `Badge` rows (L988–1004).

## Interfaces

- In: `regime` object (`regime`, `critical_news_count`, `early_warning_count`, `commodity_volatility_score`), freshness fields list, `corridorContext.timestamp`.
- Out: read-only badges/popovers; `PopoverTrigger` uses `asChild`-safe trigger pattern — see Phase 115 risk (`asChild` vs render warning).
- No new props leaked: chrome consumes existing `AnalyticsSectionProps` (L41) context.

## Guardrails

- Xhigh orchestrator + High subagents MUST be used (no default subagent); never direct tool calls, always via subagents.
- Playwright auto-check required; E2E no-interference (Peta/Laporan/Evaluasi + `approvals:write`/`fleet:write` 403).
- Dark editorial: 12px min, `tabular-nums`, Lucide only; `motion-safe:` guards every animation (P3).
- Commit via `git add .` + `git commit -m` then push for Vercel (operator-side; this docs pass does NOT commit).
