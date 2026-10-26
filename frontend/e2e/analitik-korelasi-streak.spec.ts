import { test, expect } from '@playwright/test';
import { mockAnalitikApi } from './analitik-fixtures';

// Korelasi matrix: shows n=X/10 + progressbar + CTA; streak section shows
// the fallback banner when the region filter is thin (<14 points) and the
// honest-empty copy (never a fake 0) when data is short. Hermetic.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('korelasi shows overlap n/10, progress, and CTA on thin filter', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  // Thin region path that the aggregate fallback cannot rescue (8 < 14):
  // 5 pts per commodity behind the region filter, 8-pt aggregate behind it.
  await mockAnalitikApi(page, { fullPoints: 8, thinPoints: 5 });
  await page.goto('/dashboard?section=analytics&region=sumut', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  // Overlap readout with the hard threshold denominator.
  const overlap = page.getByText(/Overlap maks n=\d+\/10/);
  await expect(overlap).toBeVisible({ timeout: 25000 });
  await expect(overlap).toContainText('n=5/10');

  // Progressbar pinned to the 10-point threshold.
  const bar = page.getByRole('progressbar', { name: /Progres overlap korelasi/ });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuemax', '10');
  await expect(bar).toHaveAttribute('aria-valuenow', '5');

  // Thin-filter CTA offers the escape hatch (extend window or clear region).
  await expect(page.getByText('butuh 5 titik lagi')).toBeVisible();
  const cta = page.getByRole('button', { name: 'pilih Semua wilayah' });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page.getByText(/Overlap maks n=8\/10/)).toBeVisible({ timeout: 15000 });

  expect(pageerrors).toEqual([]);
});

test('streak fallback banner renders on thin filter; honest-empty without fallback data', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockAnalitikApi(page, { fullPoints: 20, thinPoints: 5 });
  await page.goto('/dashboard?section=analytics&region=sumut', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  // Streak section: fallback banner explains the aggregate backfill.
  await expect(page.getByText('Streak mingguan per komoditas')).toBeVisible({ timeout: 25000 });
  await expect(page.getByText(/Fallback agregat Sumatera aktif/)).toBeVisible({ timeout: 25000 });

  expect(pageerrors).toEqual([]);
});

test('streak honest-empty when every series is short (no fake zero)', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  // 2 points everywhere: no fallback can rescue it (<14 even in aggregate).
  await mockAnalitikApi(page, { fullPoints: 2, thinPoints: 2 });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  await expect(page.getByText('Streak mingguan per komoditas')).toBeVisible({ timeout: 25000 });
  // Honest-empty: the heatstrip empty state names the threshold and refuses
  // a fabricated zero ("Bedakan: data kurang ... bukan 0 mggu").
  await expect(page.getByText(/Streak mingguan butuh ≥ 14 titik/).first()).toBeVisible({ timeout: 25000 });
  await expect(page.getByText(/Bedakan:/).first()).toBeVisible();

  expect(pageerrors).toEqual([]);
});
