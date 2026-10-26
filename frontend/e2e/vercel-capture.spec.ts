import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Read-only production captures. The demo flow creates a preview scenario;
// this test never submits an approval or changes production data.
const BASE = 'https://pre-hub.vercel.app';
const screenshotDir = path.resolve(__dirname, '../../docs/screenshots');

test('capture Vercel map, warning, route choices, and provenance', async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('#run-demo-btn')).toBeVisible({ timeout: 90000 });
  await page.locator('.mapboxgl-canvas').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-01-dashboard.png') });

  // Open the built-in warning preview. Do not invoke any route approval,
  // override, or dispatch action.
  await page.locator('#run-demo-btn').click();
  const advance = page.locator('#guided-demo-advance-btn');
  await expect(advance).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(10000);
  await expect(advance).toBeEnabled({ timeout: 60000 });
  await advance.click();
  await expect(page.getByRole('heading', { name: /Tahap 2 dari 5/ })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Selesai', { exact: true })).toBeVisible({ timeout: 20000 });
  await advance.click();
  await expect(page.getByRole('heading', { name: /Tahap 3 dari 5/ })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-02-peta-peringatan.png') });

  // Open a route detail from the map and compare previews only. The clicks do
  // not commit a route or send an approval to the production backend.
  await page.mouse.click(1060, 610);
  const policyPreview = page.getByText('Pratinjau Dampak Kebijakan (Economic & Spoilage Trade-off Preview)');
  if (!(await policyPreview.isVisible().catch(() => false))) {
    await page.mouse.click(1120, 600);
  }
  await expect(policyPreview).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /CONTINUE/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /REROUTE/ }).first()).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-03-perbandingan-lanjut-alihkan.png') });

  // Capture the source-provenance portion of the same route evidence modal.
  const provenance = page.getByText(/Transparansi Sumber Data \(Audit Provenance\)/i);
  await expect(provenance).toBeVisible({ timeout: 15000 });
  await provenance.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-04-evidence-chain.png') });

});

test('capture Vercel approval history and evaluation dashboard', async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('#nav-reports')).toBeVisible({ timeout: 90000 });

  await page.locator('#nav-reports').click();
  await expect(page.getByRole('button', { name: 'Catatan Audit Mitigasi' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Catatan Audit Mitigasi' }).click();
  await expect(page.getByRole('heading', { name: 'Catatan Audit Mitigasi Logistik Pangan' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Memuat catatan audit...')).toBeHidden({ timeout: 90000 });
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-05-approval-history.png') });

  await page.locator('#nav-evaluation').click();
  await expect(page.getByText('Evaluasi Empiris & Tolok Ukur Validasi')).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-06-evaluasi.png') });
});
