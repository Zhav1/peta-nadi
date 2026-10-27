/**
 * Role visibility matrix for the fleet workspace (issue #2).
 *
 * Run with: node --no-warnings --experimental-strip-types scripts/test_fleet_scope.ts
 *
 * Pins the rule that a DISPATCHER only ever sees their own tenant's assets and
 * that projected (ROUTE_ESTIMATED) units never masquerade as live map tracks,
 * while REGULATOR / GUEST keep the macro view.
 */
import {
  isLiveTracked,
  isTenantAsset,
  scopeDispatcherFleet,
  selectTenantVehicles,
  partitionByTracking,
} from '../lib/fleetScope.ts';
import type { FleetVehicle } from '../lib/types.ts';

type Role = 'DISPATCHER' | 'REGULATOR' | 'GUEST';

function vehicle(overrides: Partial<FleetVehicle> & { vehicle_id: string }): FleetVehicle {
  return {
    name: overrides.vehicle_id,
    modality: 'truck',
    path: [[98.67, 3.59], [98.68, 3.6]],
    speed_kmh: 55,
    status: 'moving',
    company_id: 'pos_logistik',
    is_tenant_asset: true,
    tracking_mode: 'LIVE_GPS',
    signal_status: 'LIVE_STREAM',
    telemetry_source: 'TMS_GPS_WEBHOOK',
    ...overrides,
  };
}

const fleet: FleetVehicle[] = [
  // Own tenant, live GPS
  vehicle({ vehicle_id: 'OWN-LIVE-01', company_id: 'pos_logistik', is_tenant_asset: true }),
  // Own tenant, projected route (no hardware fix yet)
  vehicle({
    vehicle_id: 'OWN-PROJ-01',
    company_id: 'pos_logistik',
    is_tenant_asset: true,
    tracking_mode: 'ROUTE_ESTIMATED',
    signal_status: 'SIMULATION_CACHE',
    telemetry_source: 'ROUTE_DEAD_RECKONING',
  }),
  // Another tenant's truck (must never appear)
  vehicle({ vehicle_id: 'OTHER-TENANT-01', company_id: 'jne_sumut', is_tenant_asset: false }),
  // Macro maritime asset tagged non-tenant by the server
  vehicle({
    vehicle_id: 'AIS-MACRO-01',
    modality: 'maritime',
    company_id: 'pelindo_belawan',
    is_tenant_asset: false,
    mmsi: '525000101',
  }),
  // Mock corridor unit (client FALLBACK_FLEET shape) — never tenant-tagged
  vehicle({
    vehicle_id: 'TRK-005-BANDA-ACEH-MEDAN',
    company_id: undefined,
    is_tenant_asset: false,
    tracking_mode: 'ROUTE_ESTIMATED',
    signal_status: 'SIMULATION_CACHE',
    telemetry_source: 'ROUTE_ESTIMATED',
  }),
];

/** Mirrors the role branching inside useFleetVehicles.
 * Dispatcher roster stays tenant-scoped; the map/pills add public
 * situational vessels (maritime/air, non-tenant) so Kapal/Udara never read 0.
 * Trucks from other tenants never leak. */
function viewForRole(role: Role, companyId?: string | null) {
  if (role === 'DISPATCHER') {
    const { all, live, projected } = scopeDispatcherFleet(fleet, companyId);
    if (!companyId) {
      return { tenantAll: all, mapFleet: [], roster: all, projected, situational: [] };
    }
    const situational = fleet.filter(
      (v) =>
        (v.modality === 'maritime' || v.modality === 'air') &&
        !all.some((t) => t.vehicle_id === v.vehicle_id)
    );
    // Map-bound slice is live tenant units + situational vessels.
    return { tenantAll: all, mapFleet: [...live, ...situational], roster: all, projected, situational };
  }
  // REGULATOR / GUEST: full macro visibility, no tenant filter.
  return { tenantAll: fleet, mapFleet: fleet, roster: fleet, projected: [], situational: [] };
}

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`, detail ?? '');
  }
}

console.log('Role matrix: DISPATCHER + company_id=pos_logistik');
{
  const v = viewForRole('DISPATCHER', 'pos_logistik');
  const ids = v.tenantAll.map((x) => x.vehicle_id).sort();
  check('sees both own assets', ids.join(',') === 'OWN-LIVE-01,OWN-PROJ-01', ids);
  check('does not see other tenant truck', !ids.includes('OTHER-TENANT-01'), ids);
  check('roster excludes macro maritime (vessels ride in map only)', !ids.includes('AIS-MACRO-01'), ids);
  check('does not see mock corridor unit', !ids.includes('TRK-005-BANDA-ACEH-MEDAN'), ids);
  check(
    'map slice is live tenant + situational vessels (no cross-tenant trucks)',
    v.mapFleet.some((x) => x.vehicle_id === 'OWN-LIVE-01') &&
      v.mapFleet.some((x) => x.vehicle_id === 'AIS-MACRO-01') &&
      !v.mapFleet.some((x) => x.vehicle_id === 'OTHER-TENANT-01') &&
      !v.mapFleet.some((x) => x.vehicle_id === 'TRK-005-BANDA-ACEH-MEDAN'),
    v.mapFleet.map((x) => x.vehicle_id)
  );
  check(
    'projected unit is inspection-only (PROYEKSI roster)',
    v.projected.length === 1 && v.projected[0].vehicle_id === 'OWN-PROJ-01',
    v.projected.map((x) => x.vehicle_id)
  );
  check(
    'every roster row carries the tenant claim',
    v.roster.every((x) => isTenantAsset(x, 'pos_logistik'))
  );
}

console.log('Role matrix: DISPATCHER without company_id claim');
{
  const v = viewForRole('DISPATCHER', null);
  check('honest empty tenant view', v.tenantAll.length === 0, v.tenantAll);
  check('honest empty map', v.mapFleet.length === 0, v.mapFleet);
  check('honest empty roster', v.roster.length === 0, v.roster);
}

console.log('Role matrix: REGULATOR (macro view)');
{
  const v = viewForRole('REGULATOR', 'bapanas');
  check('keeps full macro fleet', v.mapFleet.length === fleet.length, v.mapFleet.length);
  check(
    'macro includes maritime + other tenants',
    v.mapFleet.some((x) => x.vehicle_id === 'AIS-MACRO-01') &&
      v.mapFleet.some((x) => x.vehicle_id === 'OTHER-TENANT-01')
  );
}

console.log('Role matrix: GUEST (sandbox macro view)');
{
  const v = viewForRole('GUEST', 'demo_sandbox');
  check('keeps full macro fleet', v.mapFleet.length === fleet.length, v.mapFleet.length);
}

console.log('Helper invariants');
{
  check('selectTenantVehicles(null claim) is empty', selectTenantVehicles(fleet, null).length === 0);
  check(
    'partitionByTracking separates projections',
    partitionByTracking(fleet).projected.every((v) => v.tracking_mode === 'ROUTE_ESTIMATED')
  );
  check(
    'isTenantAsset trusts server tag',
    isTenantAsset({ ...fleet[0], company_id: 'mismatch', is_tenant_asset: true }, 'pos_logistik') === true
  );
  check(
    'isTenantAsset rejects non-tenant macro',
    isTenantAsset(fleet[3], 'pos_logistik') === false
  );
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll fleet role-matrix assertions passed.');
