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

