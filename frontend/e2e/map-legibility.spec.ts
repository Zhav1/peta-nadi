// Phase 176.5 — base-map legibility + popup chrome.
//
// Two gates:
//   1. The map instance is actually painting land and water at the separated
//      Phase 176.5 values (read back with `getPaintProperty`, not from source),
//      so Sumatra's silhouette is readable at 390 and 1920.
//   2. The Mapbox close affordance is an overlay control: transparent surface,
//      20×20 / 10px radius / 12px glyph, no white box, visible keyboard focus.
//
// Hermetic: every /api/ call is intercepted. The map style itself comes from
// Mapbox (same as map-tooltip-contract.spec.ts).

import { test, expect, type Page } from '@playwright/test';
import { MAP_BASE_PAINT } from '../lib/mapBasePaint';

const DISPATCHER = {
  id: 'map-legibility-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Map Legibility E2E',
  email: 'map-legibility@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

const NOW = '2026-10-28T02:15:00+00:00';

const WEATHER_PROPS = {
  name: 'Waspada Dini Aceh',
  severity: 'critical',
  bmkg_code: 'BMKG-12',
  hazard_type: 'banjir',
  precipitation_mm_24h: 84,
  flood_risk_pct: 72,
  windspeed_kmh: 38,
  corridor_id: 'K1',
  corridor_segment: 'Belawan–Medan',
  dist_to_corridor_km: 2.4,
  delay_hours: 3.5,
  advisory_action: 'Alih',
  affected_modalities: '["darat","laut"]',
  confidence: 0.82,
  observed_vs_forecast: 'forecast',
  source: 'BMKG / Open-Meteo',
  valid_until: NOW,
};

interface BasePaint {
  ready: boolean;
  land: string | null;
  water: string | null;
  waterway: string | null;
  coastline: string | null;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function alphaOf(value: string): number {
  const m = value.match(/rgba?\([^)]*,\s*([0-9.]+)\s*\)/);
  if (m) return Number(m[1]);
  return value === 'transparent' ? 0 : 1;
}

async function mockDashboardApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'map-legibility-e2e-token');
    } catch {
      /* ignore */
    }
  });

  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) return ok(DISPATCHER);
    if (url.includes('/api/v1/weather/summary')) {
      return ok({
        bbox: [94, -6, 108, 6],
        generated_at: NOW,
        cuaca: { count: 2, total: 2, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
        waspada: { count: 5, total: 5, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
      });
    }
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      return ok({ type: 'FeatureCollection', features: [], metadata: { status: 'ok', count: 0, total: 0, capped: false, updated_at: NOW } });
    }
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok({ hotspots: [], total: 0, status: 'ok', reason: null, source: 'cache', updated_at: NOW, window_hours: 24 });
    }
    if (url.includes('/api/v1/fleet/vehicles')) {
      return ok({ status: 'success', total_vehicles: 0, updated_at: NOW, vehicles: [] });
    }
    if (url.includes('/api/v1/fleet/travels')) return ok({ total: 0, items: [] });
    if (url.includes('/api/v1/bnpb/events')) return ok({ events: [], total: 0, status: 'ok', updated_at: NOW });
    if (url.includes('/api/v1/news/hitl-pending')) return ok({ count: 0, items: [], pending_approvals: [] });
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

async function waitForBasePaint(page: Page): Promise<BasePaint> {
  await page.waitForFunction(
    () => {
      const hook = (window as unknown as { __crisisMapTest?: { getBasePaint?: () => BasePaint } }).__crisisMapTest;
      const paint = hook?.getBasePaint?.();
      return Boolean(paint?.ready && paint.water && paint.land);
    },
    undefined,
    { timeout: 120000 },
  );
  return page.evaluate(() => {
    const hook = (window as unknown as { __crisisMapTest: { getBasePaint: () => BasePaint } }).__crisisMapTest;
    return hook.getBasePaint();
  });
}

test.beforeEach(async ({ page }) => {
  await mockDashboardApi(page);
});

test('land and water are painted at separated values, coastline at 6% white', async ({ page }) => {
  await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
  const paint = await waitForBasePaint(page);

  // The map instance really carries the literals, not merely the source file.
  expect(paint.land?.toLowerCase()).toBe(MAP_BASE_PAINT.land);
  expect(paint.water?.toLowerCase()).toBe(MAP_BASE_PAINT.water);
  expect(paint.waterway?.toLowerCase()).toBe(MAP_BASE_PAINT.waterway);
  // Mapbox may serialise the colour with spaces; assert the value, not spacing.
  expect(paint.coastline?.replace(/\s+/g, '')).toBe(MAP_BASE_PAINT.coastline.replace(/\s+/g, ''));
  expect(alphaOf(paint.coastline ?? ''), 'rendered coastline alpha').toBeCloseTo(0.06, 2);

  // And the separation is measurable, not a one-digit nudge.
  const distance = colorDistance(MAP_BASE_PAINT.land, MAP_BASE_PAINT.water);
  expect(distance, `land/water colour distance (${distance.toFixed(2)})`).toBeGreaterThan(8);
  expect(alphaOf(MAP_BASE_PAINT.coastline), 'coastline alpha').toBeCloseTo(0.06, 2);
});

test('popup close button is overlay chrome, transparent and keyboard-visible', async ({ page }) => {
  await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
  await waitForBasePaint(page);

  await page.evaluate((props) => {
    const hook = (window as unknown as {
      __crisisMapTest: { openWeatherPopup: (p: Record<string, unknown>) => void };
    }).__crisisMapTest;
    hook.openWeatherPopup(props);
  }, WEATHER_PROPS);

  const popup = page.locator('.ds-popup').first();
  await expect(popup).toBeVisible({ timeout: 15000 });

  const close = page.locator('.mapboxgl-popup-close-button').first();
  await expect(close).toBeVisible();

  // Mapbox focuses the close control on open for keyboard users; blur first so
  // the measured glyph is the resting 50% tone, not the focused 100% tone.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(50);

  const style = await close.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      background: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      width: cs.width,
      height: cs.height,
      radius: cs.borderTopLeftRadius,
      fontSize: cs.fontSize,
      color: cs.color,
      borderWidth: cs.borderTopWidth,
      boxShadow: cs.boxShadow,
    };
  });

  expect(alphaOf(style.background), 'close background alpha').toBeLessThan(0.2);
  expect(style.background).not.toBe('rgb(255, 255, 255)');
  expect(style.backgroundImage).toBe('none');
  expect(style.width).toBe('20px');
  expect(style.height).toBe('20px');
  expect(style.radius).toBe('10px');
  expect(style.fontSize).toBe('12px');
  expect(parseFloat(style.borderWidth), 'no border artifact').toBe(0);

  // Glyph tone is the 50% overlay text, not a black UA button glyph.
  expect(alphaOf(style.color)).toBeCloseTo(0.5, 1);

  // Keyboard focus is visible (2px outline, not the UA default).
  await close.focus();
  const focus = await close.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
  });
  expect(parseFloat(focus.width), 'focus outline width').toBeGreaterThanOrEqual(2);
  expect(focus.style, 'focus outline style').not.toBe('none');
});
