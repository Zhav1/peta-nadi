import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { mockDispatcherAuth } from './analitik-fixtures';

// Read-only captures. The demo flow creates a preview scenario; this spec never
// submits an approval, commits a route, or dispatches a vehicle.
//
// contract updated 2026-10-28: captures assert the build under test (the server
// Playwright starts) instead of a hard-coded deployment. The deployed build had
// already guest-locked #nav-reports and replaced the "Pratinjau Dampak Kebijakan"
// evidence headline, so this spec was reporting the deployment's drift, not ours.
// Deployment captures remain available:
//   CAPTURE_BASE_URL=https://pre-hub.vercel.app npx playwright test e2e/vercel-capture.spec.ts
const BASE = (process.env.CAPTURE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const screenshotDir = path.resolve(__dirname, '../../docs/screenshots');

const CRISIS_ID = 'capture-demo-crisis';

const routeRecommendation = {
  id: 'capture-route-0',
  route_name: 'Koridor Darat Pengalihan Bebas Hambatan',
  description: 'Jalur alternatif tol Medan-Tebing Tinggi aman dari disrupsi',
  distance_km: 84.5,
  eta_minutes: 88,
  fuel_increase_pct: 12.0,
  viable: true,
  is_compromised: false,
  safety_status: 'SAFE_DETOUR',
  safety_tag: 'JALUR AMAN',
  waypoints: [
    { lat: 3.7922, lon: 98.6776 },
    { lat: 3.3285, lon: 99.1625 },
  ],
};

/** Hermetic demo: start at stage 0, poll to stage 3, advance to stage 4. */
async function mockDemoFlow(page: Page) {
  await page.route(/\/directions\/v5\/mapbox/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        routes: [
          {
            distance: 142000,
            duration: 10800,
            geometry: {
              coordinates: [
                [98.6776, 3.7922],
                [99.1625, 3.3285],
              ],
            },
            legs: [{ summary: 'Koridor Uji', annotation: { congestion: ['low', 'low'] } }],
          },
        ],
      }),
    });
  });

  await page.route('**/api/demo/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ crisis_id: CRISIS_ID, stage: 0, total_stages: 5 }),
    });
  });

  await page.route(new RegExp(`/api/demo/status/${CRISIS_ID}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        crisis_id: CRISIS_ID,
        stage: 3,
        status: 'validated',
        full_crisis_state: {
          crisis_id: CRISIS_ID,
          title: 'Disrupsi Koridor Belawan - Tebing Tinggi',
          type: 'flood',
          status: 'validated',
          lat: 3.1,
          lon: 98.5,
          overall_confidence: 0.94,
          validated: true,
          region: 'north_sumatra',
          decision_support_output: 'Rute pengalihan aman teridentifikasi.',
          route_recommendations: [routeRecommendation],
        },
      }),
    });
  });

  await page.route(new RegExp(`/api/demo/advance/${CRISIS_ID}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ crisis_id: CRISIS_ID, stage: 4, stage_name: 'Dispatch & Mitigasi' }),
    });
  });
}

test('capture Vercel map, warning, route choices, and provenance', async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockDemoFlow(page);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('#run-demo-btn')).toBeVisible({ timeout: 90000 });
  await page.locator('.mapboxgl-canvas').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-01-dashboard.png') });

  // Open the built-in warning preview. Do not invoke any route approval,
  // override, or dispatch action.
  await page.locator('#run-demo-btn').click();
  await expect(page.locator('#guided-demo-advance-btn')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(10000);
  // The demo/start response plus status polling lands on the validated-warning
  // stage and opens the crisis panel.
  await expect(page.getByRole('heading', { name: /Tahap 3 dari 5|Tahap 4 dari 5/ })).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-02-peta-peringatan.png') });

  // contract updated 2026-10-28: route evidence opens from the stable corridor
  // card in the mitigation surface, not from guessed map pixel coordinates.
  await page.getByRole('button', { name: 'Mitigasi & Rute' }).click({ timeout: 15000 });
  await page.locator('#route-option-0').click({ timeout: 30000 });

  // contract updated 2026-10-28: laporan overhaul renamed the economic preview
  // to "Pratinjau kebijakan (Hold vs Reroute)" and the provenance block to
  // "Sumber data"; the evidence modal itself is unchanged.
  const dialog = page.getByRole('dialog', { name: /Detail rute dan verifikasi operator/i });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  const policyPreview = dialog.getByText(
    /Pratinjau kebijakan \(Hold vs Reroute\)|Analisis Ekonomi: Reroute vs\. Tahan Muatan/
  );
  await expect(policyPreview).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByRole('button', { name: /CONTINUE/ }).first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: /REROUTE/ }).first()).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-03-perbandingan-lanjut-alihkan.png') });

  // Capture the source-provenance portion of the same route evidence modal.
  const provenance = dialog.getByText('Sumber data', { exact: true });
  await expect(provenance).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByTestId('route-provenance-modal')).toBeVisible();
  await provenance.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDir, 'vercel-04-evidence-chain.png') });
});

test('capture Vercel approval history and evaluation dashboard', async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  // contract updated 2026-10-28: reports/evaluation are authenticated surfaces
  // (guest hard-block); pose as a dispatcher, as the other reporting specs do.
  await mockDispatcherAuth(page);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('#nav-reports')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('#nav-reports')).toBeEnabled({ timeout: 90000 });

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
