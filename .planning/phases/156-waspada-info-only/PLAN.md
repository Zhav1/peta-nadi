# PLAN — Phase 156: Waspada Info-Only

**Window:** 2026-10-26/27 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `fc67632`, `1668222`

## Objective

Record the waspada info-only contract: medium-drizzle advisory
(BMKG 60-class) is display-only — default OFF, no detour calculation, no
reroute CTA, no hold_staging synthesis, HOLD-only operations panel,
separate Prakiraan counter with WIB expiry.

## Scope IN

- Default OFF toggle, info-only tooltip
  (`TopNavTelemetry.tsx:172`: "tanpa pengalihan rute").
- Forecast path: no detour/re-route calc, no reroute CTA, no hold
  synthesis; audit crisis carries zero route_recommendations
  (`DashboardClient.tsx:2272-2276`).
- Disruption-only default: `min_severity=high` excludes BMKG 60/medium;
  `medium` opt-in is full-fidelity advisory
  (`routing_router.py:102`).
- Forecast modal block + 409 HITL guard (Phase 154 / Phase 110).

## Scope OUT

- No threshold change; no commit/push.

## Decisions locked (from diffs + code reads)

1. Advisory can never synthesize a RED or a physical incident.
2. Forecast validity is time-boxed (WIB expiry countdown), never open.
3. `forecast_mode` disables the E commodity channel (a commodity mention
   is not a PIHPS anomaly).
