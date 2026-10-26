import { test, expect } from '@playwright/test';
import { mockAnalitikApi } from './analitik-fixtures';

// Spike honest-empty contract: <3 price records shows the backend-guard
// message (never an empty table), while ≥3 records with no spikes shows the
// true-zero message (never the guard). Hermetic, reduced-motion safe.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('spike guard message when fewer than 3 price records', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockAnalitikApi(page, { fullPoints: 2, recordsTotal: 2, spikes: () => [] });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  await expect(page.getByText('Lonjakan harga')).toBeVisible({ timeout: 25000 });
  // Spike table (row 4a) renders no table in the guard state — the shared
  // empty message appears in the donut + table slots instead. Scope to the
  // "Lonjakan harga" section: heatmap/korelasi tables elsewhere are untouched.
  const spikeSection = page.locator('section').filter({ hasText: 'Lonjakan harga' });
  await expect(spikeSection.getByText(/Hanya 2 catatan harga.*guard backend/).first()).toBeVisible({ timeout: 25000 });
  await expect(spikeSection.locator('table')).toHaveCount(0);

  expect(pageerrors).toEqual([]);
});

test('spike true-zero message when records suffice but no spikes fire', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockAnalitikApi(page, { fullPoints: 7, recordsTotal: 30, spikes: () => [] });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  await expect(page.getByText('Lonjakan harga')).toBeVisible({ timeout: 25000 });
  // True zero: records exist, threshold simply not breached.
  // (Shared by the donut + table empty states — assert the first.)
  await expect(page.getByText(/Tidak ada lonjakan ≥ 5%/).first()).toBeVisible({ timeout: 25000 });
  // Guard copy must NOT appear when records suffice.
  await expect(page.getByText(/guard backend/)).toHaveCount(0);

  expect(pageerrors).toEqual([]);
});

test('spike table renders when spikes exist (no empty copy)', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  const spike = {
    commodity: 'beras',
    region: 'north_sumatra',
    current_price: 13500,
    baseline_price: 11000,
    spike_pct: 22.7,
    severity: 'critical',
    status: 'CONFIRMED',
    detected_at: new Date().toISOString(),
  };
  await mockAnalitikApi(page, { fullPoints: 30, recordsTotal: 30, spikes: () => [spike] });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  await expect(page.locator('main table').first()).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('+22.7%').first()).toBeVisible();

  expect(pageerrors).toEqual([]);
});
