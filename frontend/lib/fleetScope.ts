import type { FleetVehicle } from './types';

/**
 * Tenant scoping rules for the fleet workspace (issue #2).
 *
 * Platform-agnostic pure helpers shared by `useFleetVehicles` and the
 * dispatcher roster so the visibility rules can be unit-tested without React.
 */

/** True hardware/telematics tracking — never a dead-reckoned projection. */
export function isLiveTracked(vehicle: FleetVehicle): boolean {
  return vehicle.tracking_mode === 'LIVE_GPS';
}

/** True when the vehicle is a projected (dead-reckoned) corridor position. */
export function isProjected(vehicle: FleetVehicle): boolean {
  return vehicle.tracking_mode === 'ROUTE_ESTIMATED';
}

/**
 * Tenant ownership resolution for the current caller.
 * `is_tenant_asset` is authoritative (the server tags it from the JWT claim);
 * the explicit company_id is the fallback for older payloads.
 */
export function isTenantAsset(vehicle: FleetVehicle, companyId?: string | null): boolean {
  if (!companyId) return false;
  if (vehicle.is_tenant_asset === true) return true;
  return vehicle.company_id === companyId;
}

/**
 * Dispatcher view = tenant assets only. Returns an empty array when the session
 * carries no company_id claim (honest empty, never a mock/fleet-wide fill).
 */
export function selectTenantVehicles(
  vehicles: FleetVehicle[],
  companyId?: string | null
): FleetVehicle[] {
  if (!companyId) return [];
  return vehicles.filter((v) => isTenantAsset(v, companyId));
}

export interface TrackingPartition {
  live: FleetVehicle[];
  projected: FleetVehicle[];
}

/** Splits a fleet into LIVE_GPS and ROUTE_ESTIMATED buckets. */
export function partitionByTracking(vehicles: FleetVehicle[]): TrackingPartition {
  const live: FleetVehicle[] = [];
  const projected: FleetVehicle[] = [];
  for (const v of vehicles) {
    if (isProjected(v)) projected.push(v);
    else if (isLiveTracked(v)) live.push(v);
  }
  return { live, projected };
}

/**
 * Everything the dispatcher is allowed to see in the fleet workspace.
 * `live` is map-bound; `projected` is roster/inspection-only (PROYEKSI badge).
 */
export function scopeDispatcherFleet(
  vehicles: FleetVehicle[],
  companyId?: string | null
): TrackingPartition & { all: FleetVehicle[] } {
  const all = selectTenantVehicles(vehicles, companyId);
  const { live, projected } = partitionByTracking(all);
  return { all, live, projected };
}
