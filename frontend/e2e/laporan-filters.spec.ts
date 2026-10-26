import { test, expect } from '@playwright/test';
import { mockLaporanApi, dispatcherSummary } from './laporan-fixtures';

// M8 Phase 3: global tier + search filters narrow the aggregation + rincian tables.
test('laporan tier and search filters narrow the table', async ({ page }) => {
  await mockLaporanApi(page, { role: 'DISPATCHER', summary: () => dispatcherSummary() });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });
  await expect(panel.getByText(/Agregasi per tier \(3 Trip terfilter\)/)).toBeVisible({ timeout: 15000 });

  // Tier filter: Base-UI Select (canonical Analitik pattern) — dry (beras) narrows 3 -> 1.
  await panel.locator('[data-slot="select-trigger"]', { hasText: 'Semua tier' }).click();
  await page.getByRole('option', { name: /Kering/ }).click();
  await expect(panel.getByText(/Agregasi per tier \(1 Trip terfilter\)/)).toBeVisible();
  await expect(panel.getByText('RIT-001')).toBeVisible();
  await expect(panel.getByText('RIT-002')).toBeHidden();
  await expect(panel.getByText('RIT-003')).toBeHidden();

  // Reset restores all three.
  await page.getByRole('button', { name: 'Reset Filter' }).click();
  await expect(panel.getByText(/Agregasi per tier \(3 Trip terfilter\)/)).toBeVisible();

  // Search narrows to the matching truck only.
  await page.getByPlaceholder('Cari ID Trip, truk, rute, komoditas...').fill('5678');
  await expect(panel.getByText('RIT-002')).toBeVisible();
  await expect(panel.getByText('RIT-001')).toBeHidden();
  await expect(panel.getByText('RIT-003')).toBeHidden();
});
