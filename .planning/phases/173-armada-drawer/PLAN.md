# PLAN — Phase 173: Armada Drawer

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `69840d4` — `feat(m9-173): armada drawer, unknown-location honesty, tenant-scoped roster`

## Objective

Make the fleet drawer exist, and make it truthful. The roster component
was present in the tree but never mounted; a visibility flag toggled
nothing; vehicles without coordinates were drawn over Medan; and two
counts of the same fleet disagreed on screen.

## Scope IN

- `frontend/components/fleet/TenantFleetRoster.tsx` (+561): the drawer is
  restored with roster list + vehicle detail, headlined
  `{total} unit · {live} live GPS` (`:283`).
- Mount fix in `frontend/components/dashboard/DashboardClient.tsx`:
  `TenantFleetRoster` is actually rendered; `isRosterVisible` now gates
  something real.
- `frontend/components/map/FleetVehicleLayer.tsx` (+35/−): removes the
  Medan coordinate fallback; a vehicle with no position is not plotted.
- Unknown location honesty: `Lokasi belum tersedia` (`TenantFleetRoster.tsx:527`)
  instead of a fabricated Medan position.
- `backend/app/routers/travels_router.py` (+19/−): closes the tenant
  widening path so a roster read cannot pull another tenant's vehicles.
- `frontend/lib/fleetScope.ts` (new, +36): pure, React-free tenant
  scoping helpers shared by `useFleetVehicles` and the roster.
- Tests: `backend/tests/test_vehicles_tenant_scope.py` (new, 114 lines),
  `frontend/e2e/fleet-roster.spec.ts` (new, 285 lines).

## Scope OUT

- No change to GPS ingestion or fleet telemetry plumbing.
- No new tenancy model.
- No map-provider work.

## Decisions locked

1. **"Imported" is not "rendered".** A component counts as shipped only
   when it is mounted in the JSX tree.
2. One count, one definition: the header uses `{total} unit · {live} live GPS`
   so totals and live figures cannot drift apart across badges.
3. A missing coordinate is stated, not substituted. Medan is a real city
   and therefore the worst possible default.
4. Tenant scoping is enforced server-side (`travels_router.py`), not
   only in the client helper.

## Risk notes

- Removing the Medan fallback means some vehicles now render nowhere.
  That is the correct outcome — a vehicle at a guessed position is a
  false operational picture — but it makes coordinate ingestion quality
  visible for the first time.
