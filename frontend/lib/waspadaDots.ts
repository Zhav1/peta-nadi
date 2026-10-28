/**
 * Waspada Dini point derivation.
 *
 * The advisory arrives as an AREA (one polygon per forecast zone) but is drawn
 * as a violet DOT — the same "one marker per thing" language as the Titik Panas
 * detections. This module reduces each polygon to one point and copies its
 * properties verbatim, so the map popup, the click target and the confidence
 * provenance are identical to the source feature.
 *
 * Deliberately import-free so `scripts/test_waspada_dots.ts` can run it in Node
 * without a bundler.
 */

/** Area centroid of a polygon, as [lon, lat]. */
export function polygonCentroid(
  geometry: GeoJSON.Geometry | null | undefined,
): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates as [number, number];
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  }

  let ring: [number, number][] | undefined;
  if (geometry.type === 'Polygon') ring = geometry.coordinates[0] as [number, number][];
  else if (geometry.type === 'MultiPolygon') {
    ring = geometry.coordinates[0]?.[0] as [number, number][];
  }
  if (!ring || ring.length === 0) return null;

  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = ring.length > 1 && first[0] === last[0] && first[1] === last[1];
  const pts = closed ? ring.slice(0, -1) : ring;
  if (pts.length === 0) return null;

  if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  // Degenerate (zero-area) ring: fall back to the mean vertex so a sliver still
  // gets a clickable marker instead of vanishing.
  if (Math.abs(twiceArea) < 1e-12) {
    const sum = pts.reduce<[number, number]>(
      (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
      [0, 0],
    );
    return [sum[0] / pts.length, sum[1] / pts.length];
  }

  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

/** Severity bucket that the Waspada dots represent (the advisory/forecast tier). */
export const WASPADA_SEVERITY = 'medium';

/**
 * One Point feature per advisory zone. Non-advisory features (active
 * disruption) are skipped: those are the blue Cuaca area, not a forecast dot.
 */
export function waspadaDotsFromFeatures(
  features: GeoJSON.Feature[] | null | undefined,
): GeoJSON.Feature<GeoJSON.Point>[] {
  if (!Array.isArray(features)) return [];
  const dots: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const feature of features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (String(props.severity ?? '').toLowerCase() !== WASPADA_SEVERITY) continue;
    const centroid = polygonCentroid(feature.geometry as GeoJSON.Geometry | null);
    if (!centroid) continue;
    dots.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centroid },
      properties: { ...props, waspada_dot: true },
    });
  }
  return dots;
}
