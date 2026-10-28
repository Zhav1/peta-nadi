# WALKTHROUGH — Phase 170: Small-Town Routing

**Mode:** docs-only. Source and tests untouched. Test counts are those
recorded for `bb9b61b`; they were **not re-run** in this pass.

## What was done

1. Read the `bb9b61b` diff (13 files, +1225/−144).
2. Confirmed the three failure modes in code:
   snapping had no maximum distance, origin and destination could resolve
   to the same node, and `DashboardClient` ignored `status: "no_route"`.
3. Verified `MAX_SNAP_KM = 75.0` at `cpu_routing_adapter.py:68` and the
   guard at `:689`, including the Indonesian rejection message.
4. Verified the second-nearest retry requires a ≥ 15 km separation
   before it is attempted.
5. Verified the `no_route` payload now carries a reason and
   `reason_code`, and that `k_alternatives: 3` is returned.
6. Read `frontend/lib/routeProvenance.ts` (new) for the three badge
   classes: `geometri jalan`, `koridor hub`, `simulasi offline`.
7. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Snap cap | `MAX_SNAP_KM = 75.0` (`cpu_routing_adapter.py:68`), enforced at `:689` |
| Cap justification | 38.6 km median hub spacing — *recorded* |
| Second-nearest retry | attempted only at ≥ 15 km separation |
| Distinct-node guard | origin ≠ destination enforced post-snap |
| No-route surfaced | reason + `reason_code` in `routing_router.py`; rendered in `DashboardClient.tsx` |
| Provenance UI | `frontend/lib/routeProvenance.ts` (+70, new) wired into `RouteDetailModal.tsx` |
| Alternatives | `k_alternatives: 3` |
| Backend test present | `backend/tests/test_routing_snap_guards.py` (187 lines) |
| Browser test present | `frontend/e2e/small-town-routing.spec.ts` (267 lines) |
| pytest | 25 passed — *recorded* |
| Playwright | 5 passed — *recorded* |

## Shape of the change

```
before:  origin ──> nearest node (any distance) ──┐
         dest   ──> nearest node (any distance) ──┴─> may be the SAME node
         failure ──> status:"no_route" ──> swallowed by DashboardClient

after:   origin ──> nearest within 75 km ──(retry if 2nd ≥ 15 km away)──>
         dest   ──> nearest within 75 km ──> distinct-node guard ──>
         route + provenance badge + up to 3 alternatives
         failure ──> reason + reason_code ──> rendered
```

## Deliberately NOT done

- No re-run of pytest or Playwright in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No tightening of the 75 km cap — it is a coverage decision, and the
  provenance badge is the honesty mechanism, not the radius.
