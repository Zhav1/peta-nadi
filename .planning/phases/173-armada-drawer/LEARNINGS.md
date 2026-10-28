# LEARNINGS — Phase 173: Armada Drawer

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**"Imported" is not "rendered".** `TenantFleetRoster` was in the import
list, in the bundle, and in code review — and mounted nowhere.
`isRosterVisible` existed and toggled nothing. Imports, exports, types,
and tests all agreed the feature shipped; the screen disagreed.

The practical rule: **audit JSX mounts, not imports.** A symbol being
present in a module graph proves the compiler is happy, not that a user
can see anything.

The second lesson is the Medan fallback: a missing coordinate was
substituted with a real city. That is worse than a blank, because it
looks like data. `Lokasi belum tersedia` is the honest rendering.

## 2. Fixes tried (what worked, with file evidence)

1. **Mounted the drawer** — `DashboardClient.tsx` now renders
   `TenantFleetRoster`, so `isRosterVisible` controls a real surface.
2. **One count, one label** — `{scopedVehicles.length} unit · {liveCount}
   live GPS` (`TenantFleetRoster.tsx:283`), replacing two badges that
   disagreed about the same fleet.
3. **No fabricated position** — `FleetVehicleLayer.tsx` (+35/−) drops the
   Medan default; the roster states `Lokasi belum tersedia`
   (`:527`).
4. **Shared, testable scoping** — `frontend/lib/fleetScope.ts` (+36, new)
   is React-free, so the visibility rules are unit-testable and cannot
   diverge between hook and roster.
5. **Server-side closure** — `travels_router.py` (+19/−) closes the tenant
   widening path; a client helper alone was never going to be a boundary.

## 3. Concerns (open)

1. Removing the Medan fallback exposes how many vehicles lack
   coordinates. Expect a visible drop in plotted units; that is data
   quality surfacing, not a regression.
2. `{total} unit` vs `{live} live GPS` is now the single definition —
   any new badge that counts differently re-opens this bug.
3. `fleetScope.ts` is pure and shared, but a caller can still bypass it;
   the server guard in `travels_router.py` is the actual boundary.

## 4. Conditions (observed this window)

- Dispatchers open the drawer to answer "which of my trucks are moving
  right now"; a count they cannot reconcile destroys trust in the panel.
- Tenant isolation is non-negotiable — a roster that can widen across
  tenants is a data-leak surface, not a UI bug.

## 5. Issues found (do not repeat)

1. A dead visibility flag (`isRosterVisible`) is a review smell: a
   boolean whose two states render identically should be deleted or
   wired.
2. Two components counting the same set will drift; derive both from one
   value.
3. Defaulting coordinates to a major city is the geographic version of
   defaulting a province to "Sumatera Utara" (Phase 172) — same class of
   fabricated fact.

## 6. Environment constraints (this checkout)

- Windows + PowerShell. Backend interpreter is
  `backend/.venv/Scripts/python.exe`, not a bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; a build must run before e2e.
- Concurrent sessions share this checkout: never `git add -A` without
  authorisation; never kill port 3000 blindly.
- Free subagent model quota can be exhausted mid-run; keep a fallback
  model configured.
- Four backend tests fail at baseline: `test_impact_assessment`,
  `test_travel_fuel_guard` (×2), and
  `test_cpu_routing_weather::…seed_fallback`. Treat them as pre-existing.
