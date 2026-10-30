import { test, expect } from '@playwright/test';
import { dispatcherSummary, mockLaporanApi } from './laporan-fixtures';

test('ERP summary stays visible while a remounted reports section refreshes', async ({ page }) => {
  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    summary: () => dispatcherSummary(),
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const trip = page.getByTestId('reports-erp-panel').getByText('RIT-001');
  await expect(trip).toBeVisible({ timeout: 25000 });
  await expect(page.getByTestId('erp-refresh-status')).toContainText('Data terakhir diperbarui');

  let holdRefresh = false;
  let releaseRefresh!: () => void;
  const heldRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route(/\/api\/v1\/erp\/summary/, async (route) => {
    if (!holdRefresh) return route.fallback();
    await heldRefresh;
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'mock ERP refresh failure' }),
    });
  });

  try {
    await page.locator('#nav-map').click();
    holdRefresh = true;
    await page.locator('#nav-reports').click();

    await expect(trip).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('erp-refresh-status')).toContainText('Memperbarui ringkasan');

    releaseRefresh();
    await expect(page.getByText(/Gagal memuat laporan.*Data terakhir yang tersedia tetap ditampilkan/)).toBeVisible({ timeout: 25000 });
    await expect(trip).toBeVisible();
  } finally {
    releaseRefresh();
  }
});
