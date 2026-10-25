import { test, expect } from '@playwright/test';
import { mockLaporanApi, dispatcherSummary } from './laporan-fixtures';

// M8 Phase 3: PATCH actuals via the UI (mocked 200) triggers a summary refetch
// and the KPI strip reflects the refreshed totals.
test('laporan aktual PATCH refreshes the KPI strip', async ({ page }) => {
  let summaryCalls = 0;
  const before = dispatcherSummary();
  const after = dispatcherSummary({ costSavedIdr: 3000000 });
  let patchedBody: unknown = null;

  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    summary: () => {
      summaryCalls += 1;
      return summaryCalls === 1 ? before : after;
    },
    onPatchTravel: (_url, body) => {
      patchedBody = body;
      return { id: 'RIT-001', status: 'delivered' };
    },
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });
  // Baseline KPI from the first summary call.
  await expect(panel.getByText('Rp 1.350.000')).toBeVisible({ timeout: 15000 });

  // Open the aktual modal for the first trip and submit valid actuals.
  await panel.getByRole('button', { name: 'Aktual', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: /Catat aktual/ });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await dialog.getByPlaceholder('cth. 7.5').fill('7.5');
  await dialog.getByPlaceholder('cth. 120').fill('115');
  await dialog.getByRole('button', { name: 'Simpan aktual' }).click();

  // Modal closes and the refetched summary repaints the KPI.
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(panel.getByText('Rp 3.000.000')).toBeVisible({ timeout: 15000 });

  // The PATCH carried numeric actuals (client-side >0 validation passed).
  expect(patchedBody).toMatchObject({ actual_time_hours: 7.5, actual_fuel_liters: 115 });
});
