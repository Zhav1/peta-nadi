import along from '@turf/along';
import bearing from '@turf/bearing';
import length from '@turf/length';
import { lineString, point } from '@turf/helpers';

export interface InterpolatedVehicleState {
  currentPosition: [number, number]; // [lng, lat]
  bearing: number;                   // 0 to 360 degrees
  progress: number;                  // 0.0 to 1.0
  totalDistanceKm: number;
}

/**
 * Calculates current vehicle position and bearing along a GeoJSON LineString route.
 */
export function calculateRouteProgressPosition(
  coordinates: number[][],
  progressRatio: number
): InterpolatedVehicleState {
  if (!coordinates || coordinates.length < 2) {
    const fallback = coordinates[0] || [98.67, 3.58];
    return {
      currentPosition: [fallback[0], fallback[1]],
      bearing: 0,
      progress: progressRatio,
      totalDistanceKm: 0,
    };
  }

  try {
    const line = lineString(coordinates);
    const totalKm = length(line, { units: 'kilometers' });
    if (totalKm <= 0) {
      const pos = coordinates[0];
      return {
        currentPosition: [pos[0], pos[1]],
        bearing: 0,
        progress: progressRatio,
        totalDistanceKm: 0,
      };
    }

    const clampedProgress = Math.max(0, Math.min(1, progressRatio));
    const currentDistanceKm = totalKm * clampedProgress;

    // Position at current distance
    const currentPt = along(line, currentDistanceKm, { units: 'kilometers' });
    const currentPos = currentPt.geometry.coordinates as [number, number];

    // Look ahead 20 meters (0.02 km) to calculate forward azimuth bearing
    const lookAheadKm = Math.min(totalKm, currentDistanceKm + 0.02);
    const nextPt = along(line, lookAheadKm, { units: 'kilometers' });
    const nextPos = nextPt.geometry.coordinates as [number, number];

    // Calculate bearing
    const rawBearing = bearing(point(currentPos), point(nextPos));
    const normalizedBearing = (rawBearing + 360) % 360;

    return {
      currentPosition: currentPos,
      bearing: normalizedBearing,
      progress: clampedProgress,
      totalDistanceKm: totalKm,
    };
  } catch {
    const fallback = coordinates[0] || [98.67, 3.58];
    return {
      currentPosition: [fallback[0], fallback[1]],
      bearing: 0,
      progress: progressRatio,
      totalDistanceKm: 0,
    };
  }
}

/**
 * Projects a forward geodesic endpoint coordinate [lon, lat] from a start point,
 * bearing in degrees (0-360), speed in km/h, and a time scale in hours using spherical geodesy.
 */
export function projectBearingEndpoint(
  startLngLat: [number, number],
  bearingDeg: number,
  speedKmh: number,
  scaleHours: number = 0.05 // ~3 minutes forward projection
): [number, number] {
  const [lon0, lat0] = startLngLat;
  const distanceKm = Math.max(0.5, speedKmh * scaleHours);
  const R = 6371.0; // Earth mean radius in km

  const delta = distanceKm / R;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (lat0 * Math.PI) / 180;
  const lambda1 = (lon0 * Math.PI) / 180;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  const lat2 = (phi2 * 180) / Math.PI;
  const lon2 = (lambda2 * 180) / Math.PI;
  return [lon2, lat2];
}
