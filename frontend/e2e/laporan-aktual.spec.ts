import { test, expect } from '@playwright/test';
import { mockLaporanApi, dispatcherSummary } from './laporan-fixtures';

// M8 Phase 5: single 'Selesaikan Trip' action (PATCH actuals + POST hedging via
// the modal, mocked 200) triggers a summary refetch and the KPI strip reflects
// the refreshed totals with the solved policy label.
test('laporan aktual PATCH + hedging POST refreshes the KPI strip', async ({ page }) => {
  const before = dispatcherSummary();
  const afterBase = dispatcherSummary({ costSavedIdr: 3000000 });
  // Refetched snapshot carries the solved policy on RIT-001 (button -> label).
  const after = {
    ...afterBase,
    trips: afterBase.trips.map((t) => (t.id === 'RIT-001' ? { ...t, hedging_policy: 'Lanjut' } : t)),
  };
  let patchedBody: unknown = null;
  let hedgingCalls = 0;

  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    // Flag-based (not call-count): StrictMode double-mount refetches must
    // still see the baseline until the PATCH lands.
    summary: () => (patchedBody === null ? before : after),
    onPatchTravel: (_url, body) => {
      patchedBody = body;
      return { id: 'RIT-001', status: 'delivered' };
    },
    onPostHedging: (url, _body) => {
      hedgingCalls += 1;
      return { status: 'ok', travel_id: 'RIT-001', hedging_policy: 'Lanjut', url };
    },
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });
  // Baseline KPI from the first summary call.
  await expect(panel.getByText('Rp 1.350.000')).toBeVisible({ timeout: 15000 });

  // Open the Selesaikan Trip modal for the first trip and submit valid actuals.
  await panel.getByRole('button', { name: 'Selesaikan Trip' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Selesaikan Trip RIT-001/ });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await dialog.getByPlaceholder('cth. 7.5').fill('7.5');
  await dialog.getByPlaceholder('cth. 25').fill('25');
  await dialog.getByRole('button', { name: 'Simpan aktual' }).click();

  // Hybrid step-2: PATCH + hedging success shows inline verification.
  await expect(dialog.getByText(/Aktual \+ hedging tersimpan/)).toBeVisible({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Selesai' }).click();

  // Modal closes and the refetched summary repaints the KPI + policy label.
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(panel.getByText('Rp 3.000.000')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('Lanjut', { exact: true })).toBeVisible({ timeout: 15000 });

  // The PATCH carried numeric actuals (client-side >0 validation passed) and
  // the chained hedging POST fired once.
  expect(patchedBody).toMatchObject({ actual_time_hours: 7.5, actual_fuel_liters: 25 });
  expect(hedgingCalls).toBe(1);
});
