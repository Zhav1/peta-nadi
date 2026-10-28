// Phase 176 — reduced-motion gate.
//
// DESIGN.md → "Motion": `@media (prefers-reduced-motion: reduce)` disables the
// live pulse, all transitions and all transforms, everywhere, no exceptions.
// This spec proves the rendered overlays actually honour it: the Armada and HITL
// drawers compute a ~0s transition, and no `.ds-live-pulse` animation runs.
//
// It also pins the forward direction: under normal motion the histogram is
// budgeted — exactly one live-hazard pulse per viewport, and it is 2.4s.
//
// Hermetic: every /api/ call is intercepted.

import { test, expect, type Page } from '@playwright/test';

const DISPATCHER = {
  id: 'reduced-motion-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Reduced Motion E2E',
  email: 'reduced-motion@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

const NOW = '2026-10-28T02:15:00+00:00';

async function mockDashboardApi(page: Page, cuacaCount = 2): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'reduced-motion-e2e-token');
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
        cuaca: { count: cuacaCount, total: cuacaCount, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
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
      return ok({
        status: 'success',
        total_vehicles: 1,
        updated_at: NOW,
        vehicles: [
          {
            vehicle_id: 'TRK-RM-01',
            name: 'Truk Uji Gerak',
            modality: 'truck',
            path: [[98.6776, 3.7922], [98.6712, 3.6013]],
            speed_kmh: 54,
            status: 'moving',
            company_id: 'pos_logistik',
            is_tenant_asset: true,
            tracking_mode: 'LIVE_GPS',
            last_ping_seconds_ago: 10,
            current_coords: [98.6712, 3.6013],
          },
        ],
      });
    }
    if (url.includes('/api/v1/fleet/travels')) return ok({ total: 0, items: [] });
    if (url.includes('/api/v1/bnpb/events')) return ok({ events: [], total: 0, status: 'ok', updated_at: NOW });
    if (url.includes('/api/v1/news/hitl-pending')) {
      return ok({
        count: 1,
        items: [
          {
            approval_id: 'APR-RM-1',
            incident_id: 'INC-RM-1',
            route_id: 'RUTE-RM-1',
            route_name: 'Belawan → Medan (detour)',
            status: 'PENDING_REVIEW',
            created_at: NOW,
            impact_assessment: {
              hazard_type: 'banjir',
              total_value_at_risk_idr: 12000000,
              impacted_vehicles_count: 2,
            },
            news_citation: { headline: 'Banjir merendam koridor Belawan', source: 'LKBN ANTARA', confidence_score: 0.8 },
          },
        ],
        pending_approvals: [],
      });
    }
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

/** Parse a CSS time list ("0s", "0.001ms", "2.4s") to seconds, taking the max. */
function toSeconds(value: string): number {
  return Math.max(
    0,
    ...value.split(',').map((part) => {
      const trimmed = part.trim();
      if (trimmed.endsWith('ms')) return parseFloat(trimmed) / 1000;
      if (trimmed.endsWith('s')) return parseFloat(trimmed);
      return 0;
    }),
  );
}

test('reduced motion collapses drawer transitions and the live pulse', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockDashboardApi(page);
  await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });

  // Armada drawer (right-hand slide).
  const trigger = page.getByTestId('armada-trigger');
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await trigger.click();
  const armada = page.locator('[data-slot="armada-drawer-content"]');
  await expect(armada).toBeVisible();

  const armadaMotion = await armada.evaluate((node) => {
    const cs = window.getComputedStyle(node);
    return { duration: cs.transitionDuration, animation: cs.animationName };
  });
  expect(toSeconds(armadaMotion.duration), `armada transition ${armadaMotion.duration}`).toBeLessThanOrEqual(0.001);
  expect(armadaMotion.animation).toBe('none');

  // HITL drawer (also a right-hand slide).
  await page.waitForFunction(
    () => Boolean((window as unknown as { __dsTest?: unknown }).__dsTest),
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    (window as unknown as { __dsTest?: { openHitlDrawer: () => void } }).__dsTest?.openHitlDrawer();
  });
  const hitl = page.locator('[data-slot="hitl-drawer-content"]');
  await expect(hitl).toBeVisible();

  const hitlMotion = await hitl.evaluate((node) => {
    const cs = window.getComputedStyle(node);
    return { duration: cs.transitionDuration, animation: cs.animationName };
  });
  expect(toSeconds(hitlMotion.duration), `hitl transition ${hitlMotion.duration}`).toBeLessThanOrEqual(0.001);
  expect(hitlMotion.animation).toBe('none');

  // No live-hazard pulse may be running: either absent, or explicitly disabled.
  const pulses = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ds-live-pulse')).map((node) => {
      const cs = window.getComputedStyle(node);
      return { name: cs.animationName, duration: cs.animationDuration };
    }),
  );
  for (const pulse of pulses) {
    expect(pulse.name === 'none' || toSeconds(pulse.duration) <= 0.001, JSON.stringify(pulse)).toBe(true);
  }
});

test('normal motion runs exactly one 2.4s live hazard pulse', async ({ page }) => {
  await mockDashboardApi(page);
  await page.goto('/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav-map')).toBeVisible({ timeout: 30000 });
  await page.getByTitle('Buka Legenda Peta & Rute').click();
  await expect(page.getByTestId('map-legend-panel')).toBeVisible();

  const pulses = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ds-live-pulse')).map((node) => {
      const cs = window.getComputedStyle(node);
      return {
        name: cs.animationName,
        duration: cs.animationDuration,
        hazard: node.getAttribute('data-live-hazard'),
      };
    }),
  );

  expect(pulses.length, 'exactly one live pulse per viewport').toBe(1);
  expect(pulses[0].name).toBe('ds-live-pulse');
  expect(toSeconds(pulses[0].duration)).toBeCloseTo(2.4, 2);
  expect(pulses[0].hazard).toBe('critical');
});
