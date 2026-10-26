import { test, expect } from '@playwright/test';
import { mockDispatcherAuth } from './analitik-fixtures';

// Temporary M7 regression gate for the simplified AnalyticsSection (deleted after run).
test('m7-analytics-regression-gate', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  // DISPATCHER shim: the guest hard-block disables #nav-reports, which this
  // gate's tab cycle needs. Guest behavior is covered by
  // guest-laporan-hardblock.spec.ts instead.
  await mockDispatcherAuth(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // 1. Filter bar (Komoditas / Wilayah / days)
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('Komoditas', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Wilayah', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /7 hari/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /14 hari/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /30 hari/ })).toBeVisible();

  // 2. Analitik is a full-width single column with NO map canvas (the map lives
  // on the Peta Operasi tab only). The stale "Visualisasi Aliran Komoditas
  // Spasial" heading is gone: assert it is absent and no canvas is visible
  // while the analytics section is active.
  await expect(page.getByText('Visualisasi Aliran Komoditas Spasial')).toHaveCount(0);
  await expect(page.locator('main canvas:visible')).toHaveCount(0);

  // 3. Price trend card: heading + value or honest empty
  await expect(page.getByText(/Harga Beras/)).toBeVisible();
  const body1 = (await page.textContent('body')) ?? '';
  expect(body1.includes('Rp') || body1.includes('Data tidak tersedia')).toBeTruthy();

  // 4. Spikes: heading + Table or honest empty
  await expect(page.getByText('Lonjakan harga')).toBeVisible();
  const bodyText = (await page.textContent('body')) ?? '';
  const hasSpikeTable = (await page.locator('table').count()) > 0;
  const hasHonestEmpty =
    bodyText.includes('Data tidak tersedia') ||
    bodyText.includes('Tidak ada lonjakan') ||
    bodyText.includes('catatan harga');
  expect(hasSpikeTable || hasHonestEmpty).toBeTruthy();

  // 5. Zero page errors
  expect(pageerrors).toEqual([]);

  // 6. Tab switching: Peta Operasi -> Laporan -> Evaluasi -> Analitik
  const tabs: Array<[string, string]> = [
    ['map', 'Peta Operasi'],
    ['reports', 'Laporan'],
    ['evaluation', 'Evaluasi'],
    ['analytics', 'Analitik'],
  ];
  for (const [id] of tabs) {
    await page.locator(`#nav-${id}`).click();
    await page.waitForTimeout(2500);
    await expect(page.locator('main')).toBeVisible();
  }
  await expect(page.getByText('Filter harga')).toBeVisible();
  expect(pageerrors).toEqual([]);
});
