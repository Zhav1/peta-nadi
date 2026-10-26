import { test, expect } from '@playwright/test';
import { mockDispatcherAuth } from './analitik-fixtures';

// Analitik heatmap + tooltip + BNPB gate: 4 heatmap headings, KPI strip,
// base-ui rich tooltip on hover, Babel/Kepri region options, BNPB
// stale/UNAVAILABLE chip, ?commodity&region&days URL merge, zero pageerror,
// #nav-* tab cycle. Honest-empty tolerant (headings/KPI/filters render even
// when spikes or BNPB feeds are empty). GET-only, no map canvas.
test('analitik-heatmap-tooltip-bnpb', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  // DISPATCHER shim: the guest hard-block disables #nav-reports, which this
  // gate's tab cycle needs. Guest behavior is covered by
  // guest-laporan-hardblock.spec.ts instead.
  await mockDispatcherAuth(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // 1. Four heatmap headings (static chrome, data-independent).
  await expect(page.getByText('Peta panas lonjakan wilayah × komoditas')).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('Ko-okurensi bencana × komoditas')).toBeVisible();
  await expect(page.getByText('Korelasi harga antar-komoditas')).toBeVisible();
  await expect(page.getByText('Streak mingguan per komoditas')).toBeVisible();

  // 2. KPI strip (7 pills, honest-empty n/a when data is short).
  const kpiList = page.getByRole('list', { name: 'Indikator analitik' });
  await expect(kpiList).toBeVisible();
  await expect(kpiList.getByText('Risiko komposit')).toBeVisible();
  await expect(kpiList.getByRole('listitem').first()).toBeVisible();

  // 3. Babel/Kepri backfill options in the Wilayah filter (Base-UI Select:
  // options render on open, so open the trigger then assert role=option).
  const wilayah = page.getByLabel(/Wilayah/);
  await expect(wilayah).toBeVisible();
  await wilayah.click();
  await expect(page.getByRole('option', { name: 'Babel' })).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'Kepri' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // 4. ?commodity&region&days merged into the URL (?section preserved).
  const url = new URL(page.url());
  expect(url.searchParams.get('section')).toBe('analytics');
  expect(url.searchParams.get('commodity')).toBeTruthy();
  expect(url.searchParams.get('days')).toMatch(/^(7|14|30)$/);

  // 5. BNPB block: heading + one of UNAVAILABLE / STALE / live count chip.
  await expect(page.getByText('Peringatan kebencanaan BNPB')).toBeVisible();
  const bodyText = (await page.textContent('body')) ?? '';
  expect(/BNPB UNAVAILABLE|STALE|kejadian/.test(bodyText)).toBeTruthy();

  // 6. Rich tooltip: hovering a KPI pill (always rendered) shows the
  // base-ui tooltip popup (data-slot="tooltip-content").
  await kpiList.getByRole('listitem').first().hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toBeVisible({ timeout: 8000 });

  // 7. No map canvas while analytics is active.
  await expect(page.locator('main canvas:visible')).toHaveCount(0);

  // 8. Zero page errors.
  expect(pageerrors).toEqual([]);

  // 9. Tab cycle: Peta Operasi -> Laporan -> Evaluasi -> Analitik.
  const tabs = ['map', 'reports', 'evaluation', 'analytics'];
  for (const id of tabs) {
    await page.locator(`#nav-${id}`).click();
    await page.waitForTimeout(2500);
    await expect(page.locator('main')).toBeVisible();
  }
  await expect(page.getByText('Filter harga')).toBeVisible();
  expect(pageerrors).toEqual([]);
});
