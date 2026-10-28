// Phase 176 — distilled map tooltip contract (computed-style gate).
//
// The node script (`scripts/test-map-popup.ts`) proves the *builders* escape and
// budget their output. This spec proves the *rendered* popup honours the
// tooltip contract from DESIGN.md: a single `.ds-popup` surface, label/value
// rows, a rule before the footer, a footer that names its source, 320px max
// width and 12px body text.
//
// The map itself needs WebGL + a Mapbox style over the network, which is not a
// contract this spec owns. So it drives the exact handler a real click uses via
// the narrow hook CrisisMap installs under `?e2e=1` / NEXT_PUBLIC_E2E=1 — same
// builder, same `mapboxgl.Popup`, same global CSS.
//
// Hermetic: every /api/ call is intercepted, so nothing hits a live backend.

import { test, expect, type Page } from '@playwright/test';

const DISPATCHER = {
  id: 'map-tooltip-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Map Tooltip E2E',
  email: 'map-tooltip@e2e.test',
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

const FIRMS_CLUSTER_PROPS = {
  cluster_count: 7,
  max_frp: 120.4,
  max_confidence: 95,
  min_dist_km: 0.8,
  radius_km: 2.4,
  source: 'VIIRS_SNPP_NRT',
  ts: NOW,
};

const FIRMS_SINGLE_PROPS = {
  title: 'Titik Panas VIIRS',
  frp: 12.5,
  conf: 80,
  severity: 'high',
  dist_to_corridor_km: 1.2,
  radius_km: 2.5,
  near_segment: 'Medan Hub',
  source: 'VIIRS_SNPP_NRT',
  ts: NOW,
};

async function mockDashboardApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'map-tooltip-e2e-token');
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
    if (url.includes('/api/v1/bnpb/events')) return ok({ events: [], total: 0, status: 'ok', updated_at: NOW });
    if (url.includes('/api/v1/news/hitl-pending')) return ok({ count: 0, items: [], pending_approvals: [] });
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

/** Wait for the map-popup hook, then open the popup through the real handler. */
async function openPopup(
  page: Page,
  kind: 'openWeatherPopup' | 'openFirmsPopup',
  props: Record<string, unknown>,
): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __crisisMapTest?: unknown }).__crisisMapTest),
    undefined,
    { timeout: 90000 },
  );
  await page.evaluate(
    ({ kind, props }) => {
      const hooks = (window as unknown as {
        __crisisMapTest?: Record<string, (p: Record<string, unknown>) => void>;
      }).__crisisMapTest;
      hooks?.[kind]?.(props);
    },
    { kind, props },
  );
  await expect(page.locator('.ds-popup').first()).toBeVisible({ timeout: 15000 });
}

interface PopupStyle {
  maxWidth: number;
  fontSize: number;
  background: string;
  borderWidth: number;
  borderRadius: number;
  rowFontSize: number;
  labelOpacity: string;
  footerOpacity: string;
}

async function measurePopup(page: Page): Promise<PopupStyle> {
  return page.evaluate(() => {
    const popup = document.querySelector('.ds-popup') as HTMLElement | null;
    if (!popup) throw new Error('no .ds-popup rendered');
    const root = getComputedStyle(popup);
    const row = popup.querySelector('.ds-popup__label') as HTMLElement | null;
    const footer = popup.querySelector('.ds-popup__footer') as HTMLElement | null;
    return {
      maxWidth: parseFloat(root.maxWidth),
      fontSize: parseFloat(root.fontSize),
      background: root.backgroundColor,
      borderWidth: parseFloat(root.borderTopWidth),
      borderRadius: parseFloat(root.borderTopLeftRadius),
      rowFontSize: row ? parseFloat(getComputedStyle(row).fontSize) : 0,
      labelOpacity: row ? getComputedStyle(row).color : '',
      footerOpacity: footer ? getComputedStyle(footer).color : '',
    };
  });
}

test.beforeEach(async ({ page }) => {
  await mockDashboardApi(page);
});

test('weather zone popup renders the distilled tooltip contract', async ({ page }) => {
  await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
  await openPopup(page, 'openWeatherPopup', WEATHER_PROPS);

  const popup = page.locator('.ds-popup').first();
  await expect(popup).toHaveCount(1);

  const rows = popup.locator('.ds-popup__row');
  expect(await rows.count(), 'zone rows').toBeGreaterThanOrEqual(3);
  expect(await rows.count(), '6-row budget').toBeLessThanOrEqual(6);

  await expect(popup.locator('.ds-popup__rule')).toHaveCount(1);
  await expect(popup.locator('.ds-popup__footer')).toContainText('sumber:');
  await expect(popup.locator('.ds-popup__footer')).toContainText('BMKG');

  // Facts survive the rewrite.
  await expect(popup).toContainText('critical');
  await expect(popup).toContainText('84 mm/24j');
  await expect(popup).toContainText('72%');
  await expect(popup).toContainText('38 km/j');
  await expect(popup).toContainText('Belawan–Medan');
  await expect(popup).toContainText('Alih');

  const style = await measurePopup(page);
  expect(style.maxWidth, 'overlay max width').toBeLessThanOrEqual(320);
  expect(style.fontSize, 'tooltip body text').toBe(12);
  expect(style.rowFontSize, 'label text').toBe(12);
  expect(style.background).toBe('rgb(12, 16, 23)');
  expect(style.borderWidth).toBe(1);
  expect(style.borderRadius).toBe(10);
  expect(style.labelOpacity).toContain('0.62');
  expect(style.footerOpacity).toContain('0.38');

  // No arrow ornament, no white Mapbox box.
  const tip = await page.evaluate(() => {
    const node = document.querySelector('.mapboxgl-popup-tip') as HTMLElement | null;
    const content = document.querySelector('.mapboxgl-popup-content') as HTMLElement | null;
    return {
      tipDisplay: node ? getComputedStyle(node).display : 'none',
      contentBackground: content ? getComputedStyle(content).backgroundColor : '',
      contentPadding: content ? getComputedStyle(content).paddingTop : '',
    };
  });
  expect(tip.tipDisplay).toBe('none');
  expect(tip.contentBackground).toBe('rgba(0, 0, 0, 0)');
  expect(tip.contentPadding).toBe('0px');
});

test('firms cluster popup keeps the 4-row cluster budget', async ({ page }) => {
  await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
  await openPopup(page, 'openFirmsPopup', FIRMS_CLUSTER_PROPS);

  const popup = page.locator('.ds-popup').first();
  await expect(popup.locator('.ds-popup__name')).toContainText('7 titik');
  const rows = popup.locator('.ds-popup__row');
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  expect(await rows.count()).toBeLessThanOrEqual(4);
  await expect(popup.locator('.ds-popup__footer')).toContainText('sumber: VIIRS_SNPP_NRT');

  const style = await measurePopup(page);
  expect(style.maxWidth).toBeLessThanOrEqual(320);
  expect(style.fontSize).toBe(12);
});

test('firms single-detection popup escapes hostile feature strings', async ({ page }) => {
  await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
  await openPopup(page, 'openFirmsPopup', {
    ...FIRMS_SINGLE_PROPS,
    title: '<img src=x onerror=alert(1)>',
    near_segment: '<script>alert(1)</script>',
  });

  const popup = page.locator('.ds-popup').first();
  await expect(popup).toContainText('<img src=x onerror=alert(1)>');
  await expect(popup).toContainText('<script>alert(1)</script>');
  // Rendered as text, never as an element.
  expect(await popup.locator('img, script').count()).toBe(0);
  await expect(popup.locator('.ds-popup__footer')).toContainText('sumber: VIIRS_SNPP_NRT');
});
