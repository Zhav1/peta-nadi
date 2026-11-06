import type { RouteRecommendation } from './types';

/**
 * Phase 170 — routing provenance (SPEC decision 5).
 *
 * The hybrid engine draws geometry from three different sources. Before this
 * helper every corridor card looked equally "live"; now each one carries a
 * compact, honest badge:
 *
 *   geometri jalan   Mapbox Directions road geometry (real roads)
 *   koridor hub      CPU solver hub/arterial graph (ports, airports, sea lanes)
 *   simulasi offline straight-line interpolation, never a driveable route
 */
export type RouteProvenance = 'geometri jalan' | 'koridor hub' | 'simulasi offline';

const OFFLINE_MARKERS = /SIMULASI|OFFLINE/i;

export function routeProvenanceLabel(
  route: Pick<RouteRecommendation, 'source' | 'route_name' | 'description' | 'safety_tag' | 'corridor_type'>
): RouteProvenance {
  const combined = `${route.route_name ?? ''} ${route.description ?? ''} ${route.safety_tag ?? ''}`;
  if (route.source === 'offline-interpolated' || OFFLINE_MARKERS.test(combined)) {
    return 'simulasi offline';
  }
  if (route.source === 'solver-hub') return 'koridor hub';
  // Intermodal corridors are built from port/airport hub graphs, never from
  // Mapbox road geometry, so they read as hub corridors.
  if (route.corridor_type === 'sea_intermodal' || route.corridor_type === 'air_intermodal') {
    return 'koridor hub';
  }
  if (route.corridor_type === 'hold_staging') return 'koridor hub';
  return 'geometri jalan';
}

export function routeProvenanceTitle(label: RouteProvenance): string {
  switch (label) {
    case 'geometri jalan':
      return 'Geometri jalan live (Mapbox Directions)';
    case 'koridor hub':
      return 'Geometri koridor hub solver CPU (bukan jalan detail)';
    default:
      return 'Interpolasi garis lurus — bukan geometri jalan live';
  }
}

function geometryKey(route: RouteRecommendation): string {
  const coords: Array<[number, number]> = [];
  if (route.waypoints && route.waypoints.length > 0) {
    for (const waypoint of route.waypoints) {
      coords.push([Number(waypoint.lon.toFixed(5)), Number(waypoint.lat.toFixed(5))]);
    }
  } else if (Array.isArray((route as any).coordinates) && (route as any).coordinates.length > 0) {
    for (const pt of (route as any).coordinates) {
      if (Array.isArray(pt) && pt.length >= 2) {
        coords.push([Number(Number(pt[0]).toFixed(5)), Number(Number(pt[1]).toFixed(5))]);
      }
    }
  } else if (Array.isArray(route.legs) && route.legs.length > 0) {
    for (const leg of route.legs) {
      if (Array.isArray(leg.coordinates) && leg.coordinates.length > 0) {
        for (const pt of leg.coordinates) {
          if (Array.isArray(pt) && pt.length >= 2) {
            coords.push([Number(Number(pt[0]).toFixed(5)), Number(Number(pt[1]).toFixed(5))]);
          }
        }
      }
    }
  }

  const corridorTag = route.corridor_type ?? ((route as any).is_detour ? 'detour' : 'primary');
  const routeIdentifier = (route as any).route_id ?? route.id ?? '';

  if (coords.length === 0) {
    return `${corridorTag}:${routeIdentifier || 'empty'}:${(route as any).route_name || 'unnamed'}`;
  }
  return `${corridorTag}:${JSON.stringify(coords)}`;
}

/**
 * Drop corridors whose polyline already rendered. Mapbox `alternatives=true`
 * can return the same geometry twice; rendering both would give the operator
 * two identical cards with different prices.
 */
export function dedupeRoutesByGeometry<T extends RouteRecommendation>(routes: T[] | null | undefined): T[] {
  if (!routes || routes.length === 0) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const route of routes) {
    const key = geometryKey(route);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }
  return out;
}
