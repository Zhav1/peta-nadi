import type { FleetVehicle } from './types';

/**
 * Tenant scoping rules for the fleet workspace (issue #2).
 *
 * Platform-agnostic pure helpers shared by `useFleetVehicles` and the
 * dispatcher roster so the visibility rules can be unit-tested without React.
 */

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asLonLat(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lon, lat] = value;
  const numLon = typeof lon === 'number' ? lon : typeof lon === 'string' ? parseFloat(lon) : NaN;
  const numLat = typeof lat === 'number' ? lat : typeof lat === 'string' ? parseFloat(lat) : NaN;
  if (!isFiniteCoordinate(numLon) || !isFiniteCoordinate(numLat)) return null;
  return [numLon, numLat];
}

/**
 * The only coordinates a vehicle may be plotted at: a server-reported fix.
 *
 * Deliberately excludes corridor midpoints (dense route geometry) and any
 * hardcoded city fallback — a unit with no GPS ping has no location, and
 * inventing one is a lie that outranks any map dot. Exception: the middle of
 * an exactly-3-point `[prev, curr, next]` path triple. The backend's
 * invariant pass (telemetry_service) writes that triple with path[1] as the
 * unit's true current fix, so some maritime/air payloads (edge snapshots,
 * durable AIS caches) arrive carrying only the triple and no flat position
 * field. Returning its middle point reports the server's own position; it is
 * never a fabricated one. Longer paths are corridors, not fixes.
 */
export function getVehicleFix(vehicle: FleetVehicle): [number, number] | null {
  const currentCoords = asLonLat((vehicle as { current_coords?: unknown }).current_coords);
  if (currentCoords) return currentCoords;

  const currentLocation = asLonLat(
    (vehicle as { current_location?: { coordinates?: unknown } }).current_location?.coordinates,
  );
  if (currentLocation) return currentLocation;

  const location = (vehicle as { location?: unknown }).location;
  const locationCoords = asLonLat(
    Array.isArray(location) ? location : (location as { coordinates?: unknown } | undefined)?.coordinates,
  );
  if (locationCoords) return locationCoords;

  // Direct geometry.coordinates
  const geometryCoords = asLonLat(
    (vehicle as { geometry?: { coordinates?: unknown } }).geometry?.coordinates,
  );
  if (geometryCoords) return geometryCoords;

  // Direct coordinates array
  const directCoords = asLonLat((vehicle as { coordinates?: unknown }).coordinates);
  if (directCoords) return directCoords;

  // Fallback extraction for lat and lon (or latitude / longitude / lng)
  const vAny = vehicle as any;
  const rawLon = vAny.lon ?? vAny.longitude ?? vAny.lng;
  const rawLat = vAny.lat ?? vAny.latitude;
  const numLon = typeof rawLon === 'number' ? rawLon : typeof rawLon === 'string' ? parseFloat(rawLon) : NaN;
  const numLat = typeof rawLat === 'number' ? rawLat : typeof rawLat === 'string' ? parseFloat(rawLat) : NaN;
  if (Number.isFinite(numLon) && Number.isFinite(numLat)) {
    return [numLon, numLat];
  }

  // Server-reported [prev, curr, next] path triple with no flat position
  // field: path[1] is the current fix by the backend's own invariant pass.
  const path = (vehicle as { path?: unknown }).path;
  if (Array.isArray(path) && path.length === 3) {
    const mid = asLonLat(path[1]);
    if (mid) return mid;
  }

  return null;
}

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
