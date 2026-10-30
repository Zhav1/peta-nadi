import { test, expect } from '@playwright/test';
import { mockAnalitikApi } from './analitik-fixtures';
import { dispatcherSummary, mockLaporanApi } from './laporan-fixtures';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('analytics shows cached data during return refresh and keeps it after failure', async ({ page }) => {
  await mockAnalitikApi(page, { fullPoints: 20, recordsTotal: 30 });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  const priceReadout = page.getByText(/Rp [\d.,]+ \/ kg/);
  await expect(priceReadout).toBeVisible({ timeout: 25000 });
  await expect(page.getByTestId('analytics-refresh-status')).toContainText('Data terakhir diperbarui', { timeout: 25000 });

  let holdRefresh = false;
  let pendingRequests = 0;
  let releaseRequests!: () => void;
  const heldRequests = new Promise<void>((resolve) => {
    releaseRequests = resolve;
  });
  await page.route(/\/api\/v1\/commodities\/prices/, async (route) => {
    if (!holdRefresh) return route.fallback();
    pendingRequests += 1;
    await heldRequests;
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'mock analytics refresh failure' }),
    });
  });

  try {
    await page.locator('#nav-map').click();
    await expect(page.getByText('Filter harga')).toHaveCount(0);
    holdRefresh = true;
    await page.locator('#nav-analytics').click();

    // Cached chart content is immediately available, without waiting for the
    // deliberately held refresh request to complete.
    await expect(priceReadout).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('analytics-refresh-status')).toContainText('Memperbarui data analitik');
    await expect.poll(() => pendingRequests).toBeGreaterThan(0);

    releaseRequests();
    await expect(page.getByRole('alert').first()).toContainText('Data terakhir yang tersedia tetap ditampilkan', { timeout: 25000 });
    await expect(priceReadout).toBeVisible();
  } finally {
    releaseRequests();
  }
});

test('reports keeps approvals available when source health fails', async ({ page }) => {
  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    summary: () => dispatcherSummary(),
    approvals: () => ({ items: [], total: 3 }),
    failSourceHealth: true,
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav-reports')).toBeVisible({ timeout: 30000 });
  await page.locator('#nav-reports').click();
  await page.getByRole('button', { name: 'Catatan Audit Mitigasi' }).click();

  await expect(page.getByText('3 Tindakan', { exact: true })).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('Integritas sumber gagal diperbarui.', { exact: false })).toBeVisible({ timeout: 25000 });
  await expect(page.getByTestId('source-health-value')).toHaveText('—');
});

test('reports keeps source health available when approvals fail', async ({ page }) => {
  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    summary: () => dispatcherSummary(),
    failApprovals: true,
    sourceHealth: () => ({ sources: [{ status: 'healthy' }, { status: 'unhealthy' }] }),
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav-reports')).toBeVisible({ timeout: 30000 });
  await page.locator('#nav-reports').click();
  await page.getByRole('button', { name: 'Catatan Audit Mitigasi' }).click();

  await expect(page.getByText('50%', { exact: true })).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('Catatan audit gagal diperbarui.', { exact: false })).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('Data persetujuan belum tersedia')).toBeVisible();
});
