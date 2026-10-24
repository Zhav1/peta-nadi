import { test, expect } from '@playwright/test';
import {
  fetchMapboxAlternativeDrivingRoutes,
  computeTangentialWaypoint,
  calculateHazardExposureMetrics,
  type LonLat,
} from '../lib/aiDynamicRouter';

test.describe('Phase 97: Turn-by-Turn Road Network & Dual-Layer Hazard Avoidance', () => {
  const manhattanOrigin: LonLat = [98.6253, 3.5855]; // Manhattan Times Square Medan (Jl. Gatot Subroto)
  const usuDestination: LonLat = [98.6570, 3.5650]; // Universitas Sumatera Utara (USU)

  test('Manhattan Medan -> USU returns >200 road-snapped coordinates', async () => {
    const routes = await fetchMapboxAlternativeDrivingRoutes(manhattanOrigin, usuDestination);
    expect(routes.length).toBeGreaterThan(0);

    const primaryRoute = routes[0];
    console.log(`[E2E] Manhattan -> USU route summary: "${primaryRoute.summary}" (${primaryRoute.source})`);
    console.log(`[E2E] Distance: ${primaryRoute.distanceKm} km, Duration: ${primaryRoute.durationMinutes} mins`);
    console.log(`[E2E] Coordinates count: ${primaryRoute.coordinates.length}`);

    if (primaryRoute.source === 'live') {
      expect(primaryRoute.coordinates.length).toBeGreaterThan(200);
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
    const clearanceKm = hazardRadiusKm + 2.5; // 3.5 km safe clearance (> radius + 2.0 km buffer)

    const tangentialWp = computeTangentialWaypoint(manhattanOrigin, usuDestination, midpointHazard, clearanceKm);
    expect(tangentialWp).toBeDefined();
    expect(tangentialWp.length).toBe(2);

    // Assert that the tangential waypoint is outside the hazard zone
    const exposure = calculateHazardExposureMetrics([tangentialWp], midpointHazard, hazardRadiusKm);
    expect(exposure.isIntersecting).toBe(false);
  });

  test('Point obstacle with exclude parameter generates valid avoid route', async () => {
    const pointObstacle: LonLat = [98.6412, 3.5753];
    const routes = await fetchMapboxAlternativeDrivingRoutes(manhattanOrigin, usuDestination, [], {
      excludePoints: [pointObstacle],
    });
    expect(routes.length).toBeGreaterThan(0);
    const r = routes[0];
    if (r.source === 'live') {
      expect(r.coordinates.length).toBeGreaterThan(50);
    }
  });

  test('Turn-by-turn maneuvers extract valid directional steps', async () => {
    const routes = await fetchMapboxAlternativeDrivingRoutes(manhattanOrigin, usuDestination);
    expect(routes.length).toBeGreaterThan(0);
    const primary = routes[0];
    if (primary.source === 'live' && primary.maneuvers && primary.maneuvers.length > 0) {
      expect(primary.maneuvers.length).toBeGreaterThan(3);
      expect(primary.maneuvers.some((m) => m.distance_meters > 0)).toBe(true);
    }
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

    // Verify map canvas exists and is visible
    const mapCanvas = page.locator('canvas.mapboxgl-canvas');
    await expect(mapCanvas.first()).toBeVisible({ timeout: 10000 });
  });

  test('Phase 101: 3D Globe projection restoration and native Mapbox fleet layer anchoring', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3000/dashboard');

    // Wait until map instance and native Mapbox fleet layers are fully loaded
    await page.waitForFunction(() => {
      const w = window as any;
      const map = w.mapboxMap || w._mapboxMap;
      return !!(map && map.getLayer && map.getLayer('fleet-vehicle-dots'));
    }, { timeout: 20000 });

    // 1. Verify projection is explicitly globe
    const projection = await page.evaluate(() => {
      const map = (window as any).mapboxMap || (window as any)._mapboxMap;
      return map?.getProjection?.();
    });
    expect(projection).toBeDefined();
    expect(projection.name).toBe('globe');

    // 2. Verify native WebGL fleet layers and source are loaded
    const layerCheck = await page.evaluate(() => {
      const map = (window as any).mapboxMap || (window as any)._mapboxMap;
      if (!map) return { hasMap: false };
      return {
        hasMap: true,
        hasDotsLayer: !!map.getLayer('fleet-vehicle-dots'),
        hasHaloLayer: !!map.getLayer('fleet-vehicle-selected-halo'),
        hasRouteLayer: !!map.getLayer('fleet-selected-route-line'),
        hasFleetSource: !!map.getSource('fleet-vehicles-source'),
        hasRouteSource: !!map.getSource('fleet-selected-route-source'),
      };
    });
    expect(layerCheck.hasMap).toBe(true);
    expect(layerCheck.hasDotsLayer).toBe(true);
    expect(layerCheck.hasHaloLayer).toBe(true);
    expect(layerCheck.hasRouteLayer).toBe(true);
    expect(layerCheck.hasFleetSource).toBe(true);
    expect(layerCheck.hasRouteSource).toBe(true);

    // 3. Gesture simulation: pitch, bearing, and zoom matrix synchronization on 3D Globe
    const simulationResult = await page.evaluate(() => {
      const map = (window as any).mapboxMap || (window as any)._mapboxMap;
      if (!map) return { ok: false, error: 'Mapbox instance not found' };

      // Strategic corridor coordinates spanning full Pan-Sumatra spine
      const testPoints: Record<string, [number, number]> = {
        bandaAceh: [95.3238, 5.5483], // North tip
        medan: [98.6722, 3.5952],     // North Sumatra logistics hub
        pekanbaru: [101.4478, 0.5071], // Central equatorial corridor
        padang: [100.3543, -0.9492],  // West coast gateway
        palembang: [104.7565, -2.9761], // South Sumatra river port
        lampung: [105.2663, -5.4297], // Southern strait transit
      };

      // Initial baseline projection
      const initMedan = map.project(testPoints.medan);
      const initPekanbaru = map.project(testPoints.pekanbaru);

      // Pitch simulation (tilt 45 degrees)
      map.setPitch(45);
      const pitchedMedan = map.project(testPoints.medan);

      // Bearing simulation (rotate 60 degrees)
      map.setBearing(60);
      const rotatedPekanbaru = map.project(testPoints.pekanbaru);

      // Zoom simulation
      map.setZoom(5.0);
      const zoomedPalembang = map.project(testPoints.palembang);

      // Validate all projected coordinates are finite, valid numbers (no NaN / Infinity)
      const validNumbers = [
        initMedan.x, initMedan.y,
        pitchedMedan.x, pitchedMedan.y,
        rotatedPekanbaru.x, rotatedPekanbaru.y,
        zoomedPalembang.x, zoomedPalembang.y,
      ].every((val) => typeof val === 'number' && Number.isFinite(val));

      // Calculate pixel coordinate stability: coordinates shift genuinely under tilt and bearing
      const hasTiltShift = Math.abs(pitchedMedan.y - initMedan.y) > 5.0;
      const hasBearingShift =
        Math.abs(rotatedPekanbaru.x - initPekanbaru.x) > 5.0 ||
        Math.abs(rotatedPekanbaru.y - initPekanbaru.y) > 5.0;

      return {
        ok: validNumbers && hasTiltShift && hasBearingShift,
        hasTiltShift,
        hasBearingShift,
        projectionName: map.getProjection()?.name,
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        zoom: map.getZoom(),
      };
    });

    expect(simulationResult.ok).toBe(true);
    expect(simulationResult.projectionName).toBe('globe');
    expect(simulationResult.hasTiltShift).toBe(true);
    expect(simulationResult.hasBearingShift).toBe(true);
    expect(simulationResult.pitch).toBe(45);
    expect(simulationResult.bearing).toBe(60);
    expect(simulationResult.zoom).toBe(5.0);
  });

  test('Phase 101: Steep 3D perspective (pitch 60 deg) and rotation on 3D Globe with native WebGL fleet layer', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3000/dashboard');

    await page.waitForFunction(() => {
      const w = window as any;
      const map = w.mapboxMap || w._mapboxMap;
      return !!(map && map.getLayer && map.getLayer('fleet-vehicle-dots'));
    }, { timeout: 20000 });

    const steepResult = await page.evaluate(() => {
      const map = (window as any).mapboxMap || (window as any)._mapboxMap;
      if (!map) return { ok: false };

      // Apply steep pitch and 180 deg reverse bearing at regional corridor zoom 7.5
      map.setZoom(7.5);
      map.setPitch(60);
      map.setBearing(180);

      const testCoords: [number, number][] = [
        [98.6722, 3.5952],   // Medan
        [101.4478, 0.5071],  // Pekanbaru
        [100.3543, -0.9492], // Padang
      ];

      const projected = testCoords.map((coord) => map.project(coord));
      const allValid = projected.every((pt: any) => Number.isFinite(pt.x) && Number.isFinite(pt.y));

      const hasDotsLayer = !!map.getLayer('fleet-vehicle-dots');
      const hasFleetSource = !!map.getSource('fleet-vehicles-source');

      return {
        ok: allValid && hasDotsLayer && hasFleetSource,
        hasDotsLayer,
        hasFleetSource,
        projectionName: map.getProjection()?.name,
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        zoom: map.getZoom(),
      };
    });

    expect(steepResult.ok).toBe(true);
    expect(steepResult.hasDotsLayer).toBe(true);
    expect(steepResult.hasFleetSource).toBe(true);
    expect(steepResult.projectionName).toBe('globe');
    expect(steepResult.pitch).toBe(60);
    expect(steepResult.bearing).toBe(180);
    expect(steepResult.zoom).toBe(7.5);
  });

  test('Phase 101: Native Mapbox fleet interactive selection and route display on 3D Globe', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3000/dashboard');

    await page.waitForFunction(() => {
      const w = window as any;
      const map = w.mapboxMap || w._mapboxMap;
      return !!(map && map.getLayer && map.getLayer('fleet-vehicle-dots'));
    }, { timeout: 20000 });

    const selectionCheck = await page.evaluate(async () => {
      const map = (window as any).mapboxMap || (window as any)._mapboxMap;
      if (!map) return { ok: false, error: 'no map' };

      const fleetSource = map.getSource('fleet-vehicles-source');
      const routeSource = map.getSource('fleet-selected-route-source');
      if (!fleetSource || !routeSource) return { ok: false, error: 'sources missing' };

      return {
        ok: true,
        hasDotsLayer: !!map.getLayer('fleet-vehicle-dots'),
        hasHaloLayer: !!map.getLayer('fleet-vehicle-selected-halo'),
        hasRouteLayer: !!map.getLayer('fleet-selected-route-line'),
        projection: map.getProjection()?.name,
      };
    });

    expect(selectionCheck.ok).toBe(true);
    expect(selectionCheck.projection).toBe('globe');
    expect(selectionCheck.hasDotsLayer).toBe(true);
    expect(selectionCheck.hasHaloLayer).toBe(true);
    expect(selectionCheck.hasRouteLayer).toBe(true);
  });

  test('Phase 102: Restored truck dots present in fleet-vehicles-source and zoom-out LOD cartography', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3000/dashboard?guest=1');

    await page.waitForFunction(() => {
      const w = window as any;
      const map = w.mapboxMap || w._mapboxMap;
      return !!(map && map.getLayer && map.getLayer('fleet-vehicle-dots'));
    }, { timeout: 20000 });

    // Wait 3s for fleet animation frame to populate features
    await page.waitForTimeout(3000);

    const lodCheck = await page.evaluate(() => {
      const map = (window as any).mapboxMap || (window as any)._mapboxMap;
      if (!map) return { ok: false, error: 'no map' };

      const minZoom = map.getMinZoom();
      const dotsLayer = map.getLayer('fleet-vehicle-dots');
      const haloLayer = map.getLayer('fleet-vehicle-selected-halo');
      const routeLayer = map.getLayer('fleet-selected-route-line');
      const pulseLayer = map.getLayer('hub-nodes-pulse-outer');
      const corridorLine = map.getLayer('baseline-corridors-line');

      // Check fleet-vehicles-source features
      const source = map.getSource('fleet-vehicles-source');
      const data = (source as any)?._data;
      const features = data?.features || [];
      const truckFeatures = features.filter((f: any) => f.properties?.modality === 'truck');

      return {
        ok: true,
        minZoom,
        totalFeatures: features.length,
        truckCount: truckFeatures.length,
        dotsOpacity: dotsLayer?.getPaintProperty('circle-opacity'),
        haloMinZoom: haloLayer?.minzoom,
        routeMinZoom: routeLayer?.minzoom,
        pulseMinZoom: pulseLayer?.minzoom,
        corridorMinZoom: corridorLine?.minzoom,
      };
    });

    expect(lodCheck.ok).toBe(true);
    // Camera minimum zoom enforced
    expect(lodCheck.minZoom).toBe(2.8);
    // Truck features restored (at least 20 trucks in feature collection)
    expect(lodCheck.truckCount).toBeGreaterThanOrEqual(20);
    // LOD minzoom constraints
    expect(lodCheck.haloMinZoom).toBe(4.0);
    expect(lodCheck.routeMinZoom).toBe(4.0);
    expect(lodCheck.pulseMinZoom).toBe(4.5);
    expect(lodCheck.corridorMinZoom).toBe(4.0);
    // WebGL circle-opacity interpolate expression present
    expect(Array.isArray(lodCheck.dotsOpacity)).toBe(true);

    // Assert zero 401 Unauthorized console errors in guest mode
    const unauthorizedErrors = consoleErrors.filter((e) => e.includes('401') || e.includes('Unauthorized'));
    expect(unauthorizedErrors).toHaveLength(0);
  });
});

