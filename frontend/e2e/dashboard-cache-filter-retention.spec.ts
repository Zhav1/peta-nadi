import { test, expect } from '@playwright/test';
import { mockAnalitikApi } from './analitik-fixtures';

test('analytics filters survive section unmount and remount', async ({ page }) => {
  await mockAnalitikApi(page, { fullPoints: 20 });
  await page.goto('/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Filter harga')).toBeVisible({ timeout: 25000 });

  const region = page.getByRole('combobox', { name: 'Wilayah' });
  await region.click();
  await page.getByRole('option', { name: 'Sumut', exact: true }).click();
  await expect(page).toHaveURL(/region=sumut/);

  await page.locator('#nav-map').click();
  await expect(page.getByText('Filter harga')).toHaveCount(0);
  await page.locator('#nav-analytics').click();

  await expect(page.getByRole('combobox', { name: 'Wilayah' })).toContainText('Sumut');
  await expect(page).toHaveURL(/region=sumut/);
});
