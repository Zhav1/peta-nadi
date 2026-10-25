# PLAN — Phase 113: Watermelon Tables P2

**Status:** COMPLETE ✅
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High subagents (no default subagent; no direct tool calls — all work via subagents)

## Goal

Restyle Analitik tabular surfaces to Watermelon P2 primitives: `Table` block rows at `h-11` touch height + `Progress` meters — dark editorial, `tabular-nums`, Lucide only.

## Scope

- `frontend/components/dashboard/AnalyticsSection.tsx:33` — `Table/TableBody/TableCell/TableHead/TableHeader/TableRow` imports.
- `frontend/components/dashboard/AnalyticsSection.tsx:32` — `Progress` import.
- Spikes/disparity table (M7-P2, L384 note): rows driven by P1 `commodity`/`priceRegion`; rank rows memo (L878–882) filtered by ops-scoped `corridorFilter`.
- Row geometry: `h-11` (44px) rows incl. skeleton rows (`LoadingSkeleton` default `h-11`, L227).
- `Progress` meters for volatility/spread magnitudes; `w-full text-xs tabular-nums` track styling (L1187 pattern).

## Decisions

1. One table language: all Analitik rank/spike rows use the `Table` block — no bespoke `<div>` grids.
2. Filter-bar ownership split (integration-heal outcome): price bars (`commodity`/`priceRegion`, L377/L950) drive `/prices`+`/spikes`; the Koridor bar (`corridorFilter`, L409) drives rank rows only (L878).
3. Skeleton rows match real row height (`h-11`) so loading swaps without layout shift.
4. `Progress` is presentational (read-only value), never an input.

## Interfaces

- In: `rankRows` memo, spikes payload (`api.commodities.spikes`, `lib/api.ts:158-174`), `corridorFilter`/`priceRegion` states.
- Out: read-only tables/meters; empty → `AnalyticsEmpty`, never zero-filled rows.
- No new endpoints; no POST.

## Guardrails

- Xhigh orchestrator + High subagents MUST be used (no default subagent); never direct tool calls, always via subagents.
- Playwright auto-check required; E2E no-interference (Peta/Laporan/Evaluasi + `approvals:write`/`fleet:write` 403).
- Dark editorial: 12px min, `tabular-nums`, Lucide only; `motion-safe:` on row transitions (L1141).
- Commit via `git add .` + `git commit -m` then push for Vercel (operator-side; this docs pass does NOT commit).
