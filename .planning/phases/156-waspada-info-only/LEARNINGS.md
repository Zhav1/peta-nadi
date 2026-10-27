# LEARNINGS — Phase 156: Waspada Info-Only

**Window:** 2026-10-26/27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Default-OFF advisory** — medium drizzle hidden unless the operator
   opts in; disruption Cuaca stays default ON.
2. **Forecast no-calc path** — zone forecasts produce Evidence + causal
   only, zero route objects.
3. **Disruption-only default** — `min_severity=high` keeps BMKG 60 out of
   the default corridor path.

## 2. Concerns (open, evidenced)

1. Opt-in `medium` path is full-fidelity — operators must know advisory
   still never synthesizes incidents.
2. WIB expiry countdown depends on client clock; skew shows stale
   countdowns, never fresh validity.

## 3. Constraints (observed this window)

- Waspada info-only: no reroute, no RED, HOLD-only panel.
- YELLOW cap for advisory; forecast pinned YELLOW_CLARIFY (Phase 110).

## 4. Conditions (user-stated this window)

- Waspada = pantau saja; hold/reroute only after a real route.

## 5. Issues found (do not repeat)

1. Any advisory code path that computes a detour is a contract breach —
   forecasts carry zero `route_recommendations`, always verify.
