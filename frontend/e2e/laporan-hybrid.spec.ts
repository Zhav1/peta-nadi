import { test, expect } from '@playwright/test';
import { mockLaporanApi, dispatcherSummary } from './laporan-fixtures';

// M8 Phase 3: hybrid tab loads via #nav-reports with the Phase-1 copy contract
// (no legacy "Rekonsiliasi" text), KPI strip, tier + periode charts, and the
// aggregation + rincian tables. Fully mocked: never touches live Render.
test('laporan hybrid panel loads via nav with KPI, charts, and tables', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockLaporanApi(page, { role: 'DISPATCHER', summary: () => dispatcherSummary() });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });

  // Phase-1 copy contract: legacy reconciliation subtitle is gone.
  await expect(panel).not.toContainText('Rekonsiliasi');

  // KPI strip.
  await expect(panel.getByText('Total Trip')).toBeVisible();
  await expect(panel.getByText('Biaya hemat')).toBeVisible();

  // Charts: bar per-tier + line per-periode.
  await expect(panel.getByText('Hemat per tier komoditas')).toBeVisible();
  await expect(panel.getByText('Tren hemat per periode')).toBeVisible();

  // Aggregation tables.
  await expect(panel.getByText(/Agregasi per tier/)).toBeVisible();
  await expect(panel.getByText(/Agregasi per periode/)).toBeVisible();

  // Rincian per-rit ledger (dispatcher detail scope).
  await expect(page.getByTestId('audit-table')).toBeVisible();
  await expect(panel.getByText('RIT-001')).toBeVisible();

  // Negative savings render as an honest loss, never hidden.
  await expect(panel.getByText(/Negatif = kerugian tercatat/)).toBeVisible();

  expect(pageerrors).toEqual([]);
});
