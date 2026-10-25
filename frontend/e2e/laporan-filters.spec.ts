import { test, expect } from '@playwright/test';
import { mockLaporanApi, dispatcherSummary } from './laporan-fixtures';

// M8 Phase 3: global tier + search filters narrow the aggregation + rincian tables.
test('laporan tier and search filters narrow the table', async ({ page }) => {
  await mockLaporanApi(page, { role: 'DISPATCHER', summary: () => dispatcherSummary() });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });
  await expect(panel.getByText(/Agregasi per tier \(3 rit terfilter\)/)).toBeVisible({ timeout: 15000 });

  // Tier filter: dry (beras) narrows 3 -> 1.
  await page.locator('select[title="Filter tier komoditas"]').selectOption('dry');
  await expect(panel.getByText(/Agregasi per tier \(1 rit terfilter\)/)).toBeVisible();
  await expect(panel.getByText('RIT-001')).toBeVisible();
  await expect(panel.getByText('RIT-002')).toBeHidden();
  await expect(panel.getByText('RIT-003')).toBeHidden();

  // Reset restores all three.
  await page.getByRole('button', { name: 'Reset Filter' }).click();
  await expect(panel.getByText(/Agregasi per tier \(3 rit terfilter\)/)).toBeVisible();

  // Search narrows to the matching truck only.
  await page.getByPlaceholder('Cari ID rit, truk, rute, komoditas...').fill('5678');
  await expect(panel.getByText('RIT-002')).toBeVisible();
  await expect(panel.getByText('RIT-001')).toBeHidden();
  await expect(panel.getByText('RIT-003')).toBeHidden();
});
