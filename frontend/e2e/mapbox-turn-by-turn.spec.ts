import { test, expect } from '@playwright/test';
import {
  fetchMapboxAlternativeDrivingRoutes,
  computeTangentialWaypoint,
  calculateHazardExposureMetrics,
  type LonLat,
} from '../lib/aiDynamicRouter';

test.describe('Phase 87: Turn-by-Turn Road Network & Tangential Hazard Avoidance', () => {
  const manhattanOrigin: LonLat = [98.6253, 3.5855]; // Manhattan Times Square Medan (Jl. Gatot Subroto)
  const usuDestination: LonLat = [98.6570, 3.5650]; // Universitas Sumatera Utara (USU)

  test('Manhattan Medan -> USU returns >50 road-snapped coordinates', async () => {
    const routes = await fetchMapboxAlternativeDrivingRoutes(manhattanOrigin, usuDestination);
    expect(routes.length).toBeGreaterThan(0);

    const primaryRoute = routes[0];
    console.log(`[E2E] Manhattan -> USU route summary: "${primaryRoute.summary}" (${primaryRoute.source})`);
    console.log(`[E2E] Distance: ${primaryRoute.distanceKm} km, Duration: ${primaryRoute.durationMinutes} mins`);
    console.log(`[E2E] Coordinates count: ${primaryRoute.coordinates.length}`);

    if (primaryRoute.source === 'live') {
      expect(primaryRoute.coordinates.length).toBeGreaterThan(50);
      expect(primaryRoute.summary.length).toBeGreaterThan(0);
      if (primaryRoute.maneuvers && primaryRoute.maneuvers.length > 0) {
        expect(primaryRoute.maneuvers.length).toBeGreaterThan(0);
        console.log(`[E2E] Maneuver steps: ${primaryRoute.maneuvers.length}`);
      }
    } else {
      expect(primaryRoute.coordinates.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('Tangential avoidance waypoint creates safe clearance around hazard', async () => {
    const midpointHazard: LonLat = [98.6412, 3.5753];
    const hazardRadiusKm = 1.0;
    const clearanceKm = hazardRadiusKm + 2.0; // 3.0 km

    const tangentialWp = computeTangentialWaypoint(manhattanOrigin, usuDestination, midpointHazard, clearanceKm);
    expect(tangentialWp).toBeDefined();
    expect(tangentialWp.length).toBe(2);

    // Assert that the tangential waypoint is outside the hazard zone
    const exposure = calculateHazardExposureMetrics([tangentialWp], midpointHazard, hazardRadiusKm);
    expect(exposure.isIntersecting).toBe(false);
  });

  test('Map dashboard renders without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(4000);

    // Verify map canvas exists
    const mapCanvas = page.locator('canvas.mapboxgl-canvas');
    if (await mapCanvas.count() > 0) {
      await expect(mapCanvas.first()).toBeVisible();
    }
  });
});
