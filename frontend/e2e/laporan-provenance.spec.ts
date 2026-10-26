import { test, expect } from '@playwright/test';
import { mockLaporanApi, dispatcherSummary } from './laporan-fixtures';

// M8 Phase 4: backend ledger provenance (SK / efficiency / reefer / economy)
// renders in the rincian per-rit table instead of "belum diinput".
test('laporan rincian renders SK badge, economy, fallback chip, and reefer line', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockLaporanApi(page, { role: 'DISPATCHER', summary: () => dispatcherSummary() });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });
  const audit = page.getByTestId('audit-table');
  await expect(audit).toBeVisible({ timeout: 15000 });

  // RIT-001 (measured, ESDM SK): economy km/L + SK badge + rate line.
  await expect(panel.getByText('SK-E2E-2026-001')).toBeVisible();
  await expect(panel.getByText('3,38 km/L').first()).toBeVisible();
  await expect(panel.getByText('Rp 6.800/L').first()).toBeVisible();

  // RIT-003 (fallback + reefer): fallback chip + reefer burn line.
  await expect(panel.getByText('fallback').first()).toBeVisible();
  await expect(panel.getByText(/reefer 2 L\/jam/)).toBeVisible();

  // RIT-002 (unmeasured): honest "belum diinput", excluded from the average.
  await expect(panel.getByText('belum diinput', { exact: true })).toBeVisible();
  await expect(panel.getByText(/rit belum diinput dikecualikan/)).toBeVisible();

  expect(pageerrors).toEqual([]);
});
