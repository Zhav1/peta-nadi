# PLAN — Phase 170: Small-Town Routing

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `bb9b61b` — `feat(m9-170): snap guards, no-route surfacing, route provenance, shared weather snapshot`

## Objective

Make routing usable outside the big hubs, and make every approximation
visible. Small-town origins and destinations were being snapped onto
nodes far away — sometimes onto the *same* node — and a failure returned
`status: "no_route"` that the dashboard never displayed.

## Scope IN

- `backend/app/adapters/cpu_routing_adapter.py` (+187): `MAX_SNAP_KM = 75.0`
  (`:68`), justified against a **38.6 km median hub spacing**; a
  second-nearest retry is attempted only when it is **≥ 15 km** from the
  origin candidate, so two nearby points cannot collapse onto one node.
- Distinct-node guard: origin and destination may no longer resolve to
  the same node.
- `backend/app/routers/routing_router.py`: `status: "no_route"` now
  carries a human-readable reason and a machine-readable `reason_code`;
  `k_alternatives: 3`.
- `frontend/components/dashboard/DashboardClient.tsx`: stops swallowing
  `status: "no_route"` — the reason renders.
- `frontend/lib/routeProvenance.ts` (new, +70) plus
  `RouteDetailModal.tsx` / `MitigationTab.tsx`: provenance badges —
  `geometri jalan` / `koridor hub` / `simulasi offline`.
- `backend/app/services/weather_fusion_service.py`: shared weather
  snapshot reused by the routing path.
- Tests: `backend/tests/test_routing_snap_guards.py`,
  `frontend/e2e/small-town-routing.spec.ts`.

## Scope OUT

- No new routing engine or graph source.
- No change to hazard-aware cost weighting.
- No change to the weather providers.

## Decisions locked

1. **No silent early returns on failure paths.** Every `no_route` must
   explain itself in the payload and on screen.
2. A snap radius must be justified against measured geometry (38.6 km
   median hub spacing → 75 km tolerance), not picked as a round number.
3. **Provenance must be visible whenever geometry is approximated.**
   A hub-corridor route is not the same product as a real road geometry.
4. Alternative routes are a first-class output (`k_alternatives: 3`),
   because a single failed snap previously meant no answer at all.

## Risk notes

- 75 km is deliberately generous. It keeps small towns routable but
  admits coarse geometry; the provenance badge is what makes that
  acceptable rather than misleading.
- The 15 km second-nearest threshold is a heuristic; towns whose two
  nearest nodes are closer than that still have no distinct-node route
  and must surface `no_route` honestly.
