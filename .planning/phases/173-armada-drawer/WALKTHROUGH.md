# WALKTHROUGH — Phase 173: Armada Drawer

**Mode:** docs-only. Source and tests untouched. Test counts are those
recorded for `69840d4`; they were **not re-run** in this pass.

## What was done

1. Read the `69840d4` diff (7 files, +977/−115).
2. Confirmed the four defects: `TenantFleetRoster` imported but not
   mounted, `isRosterVisible` gating nothing, `FleetVehicleLayer`
   falling back to Medan coordinates, and header-vs-badge count
   disagreement.
3. Verified the drawer header string `{scopedVehicles.length} unit ·
   {liveCount} live GPS` at `TenantFleetRoster.tsx:283`.
4. Verified the honesty string `Lokasi belum tersedia` at
   `TenantFleetRoster.tsx:527`.
5. Read `frontend/lib/fleetScope.ts` (new) — pure scoping helpers with no
   React dependency, shared by the hook and the roster.
6. Confirmed tenant widening is closed in
   `backend/app/routers/travels_router.py` (+19/−), not only in the
   client.
7. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Drawer mounted | `DashboardClient.tsx` renders `TenantFleetRoster` |
| Labelled header | `TenantFleetRoster.tsx:283` — `{n} unit · {m} live GPS` |
| Unknown location stated | `TenantFleetRoster.tsx:527` — `Lokasi belum tersedia` |
| Medan fallback removed | `FleetVehicleLayer.tsx` (+35/−) no longer substitutes coordinates |
| Scoping is pure/testable | `frontend/lib/fleetScope.ts` (+36, new) |
| Server-side scoping | `travels_router.py` (+19/−) closes tenant widening |
| Backend test | `backend/tests/test_vehicles_tenant_scope.py` (114 lines, new) |
| Browser test | `frontend/e2e/fleet-roster.spec.ts` (285 lines, new) |
| pytest | 50 passed — *recorded* |
| Playwright | 6 + 10 passed — *recorded* |

## Shape of the change

```
before:  TenantFleetRoster imported ──> never mounted   (invisible)
         isRosterVisible ────────────> toggles nothing
         vehicle without coords ─────> plotted at Medan
         header count  ≠  badge count

after:   drawer mounted ──> roster + detail
         header: {total} unit · {live} live GPS   (one definition)
         no coordinates ──> "Lokasi belum tersedia", not plotted
         scoping: fleetScope.ts (client) + travels_router.py (server)
```

## Deliberately NOT done

- No re-run of pytest or Playwright in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No attempt to repair coordinate ingestion — this phase made the
  absence visible, it did not backfill positions.
