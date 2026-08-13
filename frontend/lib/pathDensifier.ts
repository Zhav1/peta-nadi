export type LonLat = [number, number];

const EARTH_RADIUS_KM = 6371.0;
const DEFAULT_MAX_SEGMENT_KM = 45;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(start: LonLat, end: LonLat): number {
  const [lon1, lat1] = start;
  const [lon2, lat2] = end;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function normalizeLongitude(lon: number): number {
  const wrapped = ((lon + 180) % 360 + 360) % 360;
  return wrapped - 180;
}

export function shortestDeltaLongitude(startLon: number, endLon: number): number {
  let delta = endLon - startLon;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/**
 * Densifies a array of LonLat waypoints along Great Circle arcs.
 * Prevents straight-line clipping across terrain and antimeridian jump glitches.
 */
export function densifyPath(path: LonLat[], maxSegmentKm = DEFAULT_MAX_SEGMENT_KM): LonLat[] {
  if (!Array.isArray(path) || path.length < 2) return path;

  const densified: LonLat[] = [path[0]];

  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    const segmentDistanceKm = haversineKm(start, end);
    const steps = Math.max(1, Math.ceil(segmentDistanceKm / maxSegmentKm));
    const deltaLon = shortestDeltaLongitude(start[0], end[0]);
    const deltaLat = end[1] - start[1];

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const interpolatedLon = normalizeLongitude(start[0] + deltaLon * t);
      const interpolatedLat = start[1] + deltaLat * t;
      densified.push([interpolatedLon, interpolatedLat]);
    }
  }

  return densified;
}

export function densifyPathMap(
  pathMap: Record<string, LonLat[]>,
  maxSegmentKm = DEFAULT_MAX_SEGMENT_KM
): Record<string, LonLat[]> {
  const output: Record<string, LonLat[]> = {};
  Object.entries(pathMap || {}).forEach(([routeId, path]) => {
    output[routeId] = densifyPath(path, maxSegmentKm);
  });
  return output;
}
