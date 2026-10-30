import { test, expect } from '@playwright/test';
import { dispatcherSummary, mockLaporanApi } from './laporan-fixtures';

test('audit approvals stay visible while a remounted reports section refreshes', async ({ page }) => {
  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    summary: () => dispatcherSummary(),
    approvals: () => ({
      total: 1,
      items: [{
        id: 'approval-cache-1',
        incident_id: 'INC-CACHE-01',
        route_name: 'Rute uji cache',
        action: 'ACCEPT',
        created_at: '2026-10-30T08:00:00Z',
      }],
    }),
  });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();
  await page.getByRole('button', { name: 'Catatan Audit Mitigasi' }).click();
  await expect(page.getByTestId('reports-refresh-status')).toContainText('Data terakhir diperbarui', { timeout: 25000 });
  await expect(page.getByText('INC-CACHE-01')).toBeVisible();

  let holdRefresh = false;
  let releaseRefresh!: () => void;
  const heldRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route(/\/api\/v1\/approvals/, async (route) => {
    if (!holdRefresh) return route.fallback();
    await heldRefresh;
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'mock approvals refresh failure' }),
    });
  });

  try {
    await page.locator('#nav-map').click();
    holdRefresh = true;
    await page.locator('#nav-reports').click();
    await page.getByRole('button', { name: 'Catatan Audit Mitigasi' }).click();

    await expect(page.getByText('INC-CACHE-01')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('reports-refresh-status')).toContainText('Memperbarui data laporan');

    releaseRefresh();
    await expect(page.getByText('Catatan audit gagal diperbarui.', { exact: false })).toBeVisible({ timeout: 25000 });
    await expect(page.getByText('INC-CACHE-01')).toBeVisible();
  } finally {
    releaseRefresh();
  }
});
