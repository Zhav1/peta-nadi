# PLAN — Phase 111: Analitik Activation M7

**Status:** COMPLETE ✅
**Date:** 2026-10-25
**Window:** Xhigh orchestrator + High subagents (no default subagent; no direct tool calls — all work via subagents)

## Goal

Activate the Analitik surface (M7) as a read-only, regulator+dispatcher stacked view: 6 widgets on existing APIs with commodity/province/range filters, Globot Deck layer + gods-eye chips, no Cesium, honest empty states, no RED synthesis, no simulation rebuild, no PII.

## Scope

- `frontend/components/dashboard/AnalyticsSection.tsx` — `DashboardAnalyticsSection` (L360): 6 widgets bound to existing endpoints only (`api.commodities.prices`, `api.commodities.spikes`, corridor context, regime/market feeds).
- `frontend/lib/api.ts` — `commodities.prices` (L155) + `commodities.spikes` (L158–174) GET reuse; no new backend routes.
- Filters: 4 commodities × 8 provinces × 7/14/30d ranges. Ops-scoped `corridorFilter`/`advisoryFilter` (corridor_id/advisory) stay separate from price-scoped `priceRegion`.
- Map: existing Globot Deck `ScatterplotLayer`/`TextLayer` + gods-eye chips. No Cesium dependency introduced.

## Decisions

1. Read-only: Analitik never POSTs; dispatcher writes stay in Peta/Laporan/Evaluasi approval flows.
2. Honest empty: series with < 3 records render `AnalyticsEmpty` (`Data tidak tersedia`), never interpolated or synthesized.
3. No RED synthesis: YELLOW/RED zone semantics untouched; forecast tags stay HOLD-only per Phase 110 contract.
4. No simulation rebuild: Simulasi Bencana canonical engine (`CrisisSimulatorBar` → SSE) is out of scope.
5. No PII: UU 27/2022 sweep holds — no NIK, names, or unencrypted personal data in widgets or exports.

## Interfaces

- In: `GET /api/v1/commodities/prices?commodity&region&days`, `GET /api/v1/commodities/spikes?region`, corridor context, market-regime feed.
- Out: read-only widgets; `role=status` live region inside `AnalyticsEmpty` preserved as the E2E hook (L220).
- Props: `AnalyticsSectionProps` (L41) — crisis/corridor context in, no callbacks that mutate.

## Guardrails

- Xhigh orchestrator + High subagents MUST be used (no default subagent); never direct tool calls, always via subagents.
- Playwright auto-check required after changes; E2E no-interference: Peta/Laporan/Evaluasi + `approvals:write`/`fleet:write` 403 paths must keep passing.
- Dark editorial: 12px min functional type, `tabular-nums` on all numerics, Lucide icons only (no emoji).
- Commit via `git add .` + `git commit -m` then push for Vercel (operator-side; this docs pass does NOT commit).
