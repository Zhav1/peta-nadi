import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mockAnalitikApi } from './analitik-fixtures';

// Palette 3+neutral contract for Analitik/Laporan: computed styles in the
// visible analytics + reports sections must never resolve to orange #f97316
// or cyan #22d3ee, while the trend line keeps its sky #38b8f8 stroke.
// Source grep pins the contract at the file level. Reduced-motion safe.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const ANALITIK_SOURCES = [
  'components/dashboard/AnalyticsSection.tsx',
  'components/dashboard/ReportsSection.tsx',
  'components/dashboard/ERPSavingsPanel.tsx',
  'components/dashboard/LaporanHybridPanel.tsx',
  'components/dashboard/LaporanFilterBar.tsx',
  'components/dashboard/LaporanCharts.tsx',
  'components/dashboard/analytics/heatScale.tsx',
  'components/dashboard/analytics/PriceTrendChart.tsx',
  'components/dashboard/analytics/PriceHeatmap.tsx',
  'components/dashboard/analytics/CorrelationMatrix.tsx',
  'components/dashboard/analytics/TimeHeatstrip.tsx',
  'components/dashboard/analytics/BencanaHeatmap.tsx',
  'components/dashboard/analytics/SpikeShareDonut.tsx',
  'components/dashboard/analytics/KpiStrip.tsx',
];

test('analitik/laporan sources contain no orange #f97316 or cyan #22d3ee', async () => {
  const root = path.resolve(__dirname, '..');
  const offenders: string[] = [];
  for (const rel of ANALITIK_SOURCES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      offenders.push(`${rel} (missing file)`);
      continue;
    }
    const src = fs.readFileSync(abs, 'utf-8').toLowerCase();
    if (src.includes('#f97316') || src.includes('#22d3ee')) offenders.push(rel);
  }
  expect(offenders).toEqual([]);
});

test('analitik computed styles: no orange/cyan, trend line keeps #38b8f8', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockAnalitikApi(page, { fullPoints: 20 });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });
  // Stabilize: wait for the trend tooltip anchor (data-slot) before scanning.
  await page.waitForFunction(
    () => document.querySelectorAll('.recharts-line-curve').length > 0,
    { timeout: 25000 },
  );

  // Trend line keeps the sky stroke (attribute or computed style).
  const trendStroke = await page.evaluate(() => {
    const el = document.querySelector('.recharts-line-curve');
    if (!el) return null;
    return el.getAttribute('stroke') ?? getComputedStyle(el as Element).stroke ?? null;
  });
  expect((trendStroke ?? '').toLowerCase()).toContain('#38b8f8');

  // Visible analytics-section subtree: no element may compute to orange/cyan.
  const hits = await page.evaluate(() => {
    const bad: string[] = [];
    const isTarget = (v: string) => {
      const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      const [, r, g, b] = m.map(Number);
      return (r === 249 && g === 115 && b === 22) || (r === 34 && g === 211 && b === 238);
    };
    for (const el of Array.from(document.querySelectorAll('main *')) as HTMLElement[]) {
      // getClientRects (not offsetParent: null for SVG elements even when
      // laid out) — skips the display:none map/eval/report containers.
      if (el.getClientRects().length === 0 || getComputedStyle(el).position === 'fixed') continue; // hidden map chrome / fixed portals
      const cs = getComputedStyle(el);
      for (const prop of [cs.color, cs.backgroundColor, cs.borderTopColor]) {
        if (isTarget(prop)) {
          bad.push(`${el.tagName}.${(el.className as string).toString().slice(0, 60)} :: ${prop}`);
          break;
        }
      }
      if (bad.length >= 10) break;
    }
    return bad;
  });
  expect(hits).toEqual([]);

  expect(pageerrors).toEqual([]);
});
