import { chromium } from '@playwright/test';

const DISPATCHER = {
  id: 'probe-1', company_id: 'pos_logistik', org_name: 'PT Samudera Logistik Sumatra', name: 'Probe',
  email: 'probe@e2e.test', role: 'DISPATCHER',
  permissions: ['fleet:read', 'fleet:write', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
  is_offline_guest: false,
};
const NOW = '2026-10-28T02:15:00+00:00';

async function mock(page) {
  await page.addInitScript(() => { try { localStorage.setItem('prehub_auth_token', 'probe-token'); } catch {} });
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) return ok(DISPATCHER);
    if (url.includes('/api/v1/weather/summary')) return ok({
      bbox: [94, -6, 108, 6], generated_at: NOW,
      cuaca: { count: 2, total: 2, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
      waspada: { count: 5, total: 5, status: 'ok', reason: null, source: 'BMKG', valid_until: NOW, window_hours: 24 },
    });
    if (url.includes('/api/v1/weather/spatial-polygons')) return ok({ type: 'FeatureCollection', features: [], metadata: { status: 'ok', count: 0, total: 0, capped: false, updated_at: NOW } });
    if (url.includes('/api/v1/fire/hotspots')) return ok({ hotspots: [], total: 0, status: 'ok', reason: null, source: 'cache', updated_at: NOW, window_hours: 24 });
    if (url.includes('/api/v1/fleet/vehicles')) return ok({ status: 'success', total_vehicles: 0, updated_at: NOW, vehicles: [] });
    if (url.includes('/api/v1/fleet/travels')) return ok({ total: 0, items: [] });
    if (url.includes('/api/v1/bnpb/events')) return ok({ events: [], total: 0, status: 'ok', updated_at: NOW });
    if (url.includes('/api/v1/news/hitl-pending')) return ok({ count: 0, items: [], pending_approvals: [] });
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}

const browser = await chromium.launch();
for (const [width, height] of [[320, 700], [360, 740], [390, 844], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await mock(page);
  await page.goto('http://localhost:3000/dashboard?e2e=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="counter-strip"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => {
    const out = {};
    for (const id of ['cuaca', 'waspada', 'titik-panas']) {
      const label = document.querySelector(`[data-testid="hazard-label-${id}"]`);
      const chip = document.querySelector(`[data-testid="counter-${id}"]`);
      const pill = chip.closest('button');
      const pb = pill.getBoundingClientRect();
      out[id] = {
        text: label.textContent,
        scroll: label.scrollWidth, client: label.clientWidth,
        pillW: +pb.width.toFixed(1), pillX: +pb.x.toFixed(1), pillH: +pb.height.toFixed(1),
        pillTop: +pb.top.toFixed(1), chipTop: +chip.getBoundingClientRect().top.toFixed(1),
        labelTop: +label.getBoundingClientRect().top.toFixed(1),
        chipLeft: +chip.getBoundingClientRect().left.toFixed(1),
        labelLeft: +label.getBoundingClientRect().left.toFixed(1),
        chipFont: getComputedStyle(chip).fontSize,
      };
    }
    return out;
  });
  console.log(width + 'x' + height + ' ' + JSON.stringify(data));
  if (width === 390 || width === 1920) await page.screenshot({ path: `C:/Users/VICTUS/AppData/Local/Temp/opencode/probe-${width}.png` });
  await ctx.close();
}
await browser.close();
