import { test, expect, type Page } from '@playwright/test';

// Guest hard-block for Laporan: nav is disabled + aria-disabled, deep-link
// ?section=reports bounces to the map with the login modal and a Mode
// Sandbox toast, and ReportsSection never mounts. Reduced-motion safe,
// hermetic (no token set, all /api/ sunk).
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function mockGuestApi(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', items: [], total: 0, sources: [] }) });
  });
}

test('guest laporan hard-block: nav disabled, deep-link bounces to map + modal + toast', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockGuestApi(page);
  await page.goto('/dashboard?section=reports', { waitUntil: 'domcontentloaded' });

  // 1. Nav Laporan is hard-disabled with an accessible reason.
  const navReports = page.locator('#nav-reports');
  await expect(navReports).toBeVisible({ timeout: 25000 });
  await expect(navReports).toBeDisabled();
  await expect(navReports).toHaveAttribute('aria-disabled', 'true');
  await expect(navReports).toHaveAttribute('title', /terkunci/i);

  // 2. The audit ledger never mounts for guests.
  await expect(page.getByTestId('reports-erp-panel')).toHaveCount(0);
  await expect(page.getByText('Catatan Audit Mitigasi')).toHaveCount(0);

  // 3. Deep-link bounces to the map: Peta Operasi tab active, login modal
  // open, and the Mode Sandbox toast fired. (The in-reports lock card
  // stays hidden by design — guests are bounced to the map container.)
  await expect(page.locator('#nav-map')).toHaveClass(/bg-white/, { timeout: 15000 });
  await expect(page.getByText('Laporan terkunci — Mode Sandbox')).not.toBeVisible();
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Mode Sandbox: Laporan terkunci').first()).toBeVisible({ timeout: 15000 });

  // 4. Clicking the disabled nav keeps the block (no navigation side-effects).
  await navReports.click({ force: true });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('reports-erp-panel')).toHaveCount(0);
  await expect(page.locator('#nav-map')).toHaveClass(/bg-white/);

  expect(pageerrors).toEqual([]);
});
