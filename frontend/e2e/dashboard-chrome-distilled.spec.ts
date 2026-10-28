// Phase 175 — distilled dashboard chrome (computed-style gate).
//
// The palette ratchet (`dashboard-palette-contract.spec.ts`) proves the *source*
// carries no banned literal. This spec proves the *rendered* shell honours the
// same contract: no banned computed colour, at most one accent control per
// component group, monochrome legend infrastructure glyphs, and a 12px text
// floor across chrome.
//
// Hermetic: every /api/ call is intercepted (dispatcher fixture), so this spec
// never touches a live backend or Mapbox.

import { test, expect, type Page } from '@playwright/test';
import { DS } from '../lib/designTokens';

const DISPATCHER = {
  id: 'chrome-distilled-dispatcher-1',
  company_id: 'pos_logistik',
  org_name: 'PT Samudera Logistik Sumatra',
  name: 'Chrome Distilled E2E',
  email: 'chrome-distilled@e2e.test',
  role: 'DISPATCHER',
  permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};

const NOW = '2026-10-28T02:15:00+00:00';

async function mockDashboardApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'chrome-distilled-e2e-token');
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
        cuaca: { count: 4, total: 4, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
        waspada: { count: 9, total: 9, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
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

/** Chrome roots — the shell this phase owns. Content panes are out of scope. */
const CHROME_SELECTORS = [
  'header',
  'nav[aria-label="Bagian dasbor"]',
  '[data-testid="map-legend-panel"]',
  '[data-testid="counter-pill"]',
  'footer',
];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Banned hues as rendered rgb triplets (alpha is irrelevant to the ban). */
const BANNED_RGB = DS.bannedChrome.map((hex) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
});

/** #38b8f8 as the browser serialises it. */
const ACCENT_RGB = (() => {
  const { r, g, b } = hexToRgb(DS.accent);
  return `rgb(${r}, ${g}, ${b})`;
})();

test.beforeEach(async ({ page }) => {
  await mockDashboardApi(page);
});

test('no chrome element computes to a banned palette value', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav-map')).toBeVisible({ timeout: 30000 });
  // Open the legend so its panel is measurable.
  await page.getByTitle('Buka Legenda Peta & Rute').click();
  await expect(page.getByTestId('map-legend-panel')).toBeVisible();

  const offenders = await page.evaluate(
    ({ selectors, banned }) => {
      const parse = (value: string): string | null => {
        const m = value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
        return m ? `rgb(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3])})` : null;
      };
      const hits: string[] = [];
      const seen = new Set<Element>();
      for (const selector of selectors) {
        for (const root of Array.from(document.querySelectorAll(selector))) {
          const nodes = [root, ...Array.from(root.querySelectorAll('*'))];
          for (const node of nodes) {
            if (seen.has(node)) continue;
            seen.add(node);
            const cs = window.getComputedStyle(node);
            for (const prop of ['color', 'background-color', 'border-top-color', 'border-left-color'] as const) {
              const rgb = parse(cs.getPropertyValue(prop));
              if (rgb && banned.includes(rgb)) {
                const id = node.getAttribute('data-testid') || node.id || node.className?.toString().slice(0, 60);
                hits.push(`${selector} ${node.tagName.toLowerCase()} [${id}] ${prop}=${rgb}`);
              }
            }
          }
        }
      }
      return hits;
    },
    { selectors: CHROME_SELECTORS, banned: BANNED_RGB },
  );

  expect(offenders, `banned chrome colours:\n${offenders.join('\n')}`).toEqual([]);
});

test('at most one accent-coloured control per component group', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav-map')).toBeVisible({ timeout: 30000 });
  await page.getByTitle('Buka Legenda Peta & Rute').click();
  await expect(page.getByTestId('map-legend-panel')).toBeVisible();

  const groups = await page.evaluate(
    ({ selectors, accent }) => {
      const parse = (value: string): string | null => {
        const m = value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
        return m ? `rgb(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3])})` : null;
      };
      return selectors.map((selector) => {
        let count = 0;
        for (const root of Array.from(document.querySelectorAll(selector))) {
          for (const control of Array.from(root.querySelectorAll('button, a[role="button"], [role="tab"]'))) {
            const cs = window.getComputedStyle(control);
            const painted =
              parse(cs.color) === accent ||
              parse(cs.backgroundColor) === accent ||
              parse(cs.borderTopColor) === accent;
            if (painted) count += 1;
          }
        }
        return { selector, count };
      });
    },
    { selectors: CHROME_SELECTORS, accent: ACCENT_RGB },
  );

  for (const group of groups) {
    expect(group.count, `accent controls in ${group.selector}`).toBeLessThanOrEqual(1);
  }
});

test('legend infrastructure glyphs are monochrome, not hue-coded', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav-map')).toBeVisible({ timeout: 30000 });
  await page.getByTitle('Buka Legenda Peta & Rute').click();

  const glyphs = await page.locator('[data-legend-glyph="infra"]');
  const count = await glyphs.count();
  expect(count, 'legend must expose infrastructure glyphs').toBeGreaterThanOrEqual(4);

  const tones = await glyphs.evaluateAll((nodes) =>
    nodes.map((node) => {
      const cs = window.getComputedStyle(node);
      const read = (value: string) => {
        const m = value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
      };
      return {
        border: read(cs.borderTopColor),
        background: read(cs.backgroundColor),
      };
    }),
  );

  for (let index = 0; index < tones.length; index += 1) {
    const tone = tones[index];
    for (const channel of [tone.border, tone.background]) {
      if (!channel) continue;
      const spread = Math.max(...channel) - Math.min(...channel);
      expect(spread, `glyph ${index} channel spread ${channel.join(',')}`).toBeLessThanOrEqual(6);
    }
  }
});

test('chrome text respects the 12px floor (dense tables excepted)', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav-map')).toBeVisible({ timeout: 30000 });
  await page.getByTitle('Buka Legenda Peta & Rute').click();
  await expect(page.getByTestId('map-legend-panel')).toBeVisible();

  const offenders = await page.evaluate(
    ({ selectors }) => {
      const hits: string[] = [];
      const seen = new Set<Element>();
      for (const selector of selectors) {
        for (const root of Array.from(document.querySelectorAll(selector))) {
          const nodes = [root, ...Array.from(root.querySelectorAll('*'))];
          for (const node of nodes) {
            if (seen.has(node)) continue;
            seen.add(node);
            if (node.closest('[data-dense-table]')) continue;
            const hasOwnText = Array.from(node.childNodes).some(
              (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0,
            );
            if (!hasOwnText) continue;
            const cs = window.getComputedStyle(node);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const size = parseFloat(cs.fontSize);
            if (Number.isFinite(size) && size < 12) {
              const label = (node.textContent ?? '').trim().slice(0, 40);
              hits.push(`${selector} ${node.tagName.toLowerCase()} ${size}px → "${label}"`);
            }
          }
        }
      }
      return hits;
    },
    { selectors: CHROME_SELECTORS },
  );

  expect(offenders, `sub-12px chrome text:\n${offenders.join('\n')}`).toEqual([]);
});
