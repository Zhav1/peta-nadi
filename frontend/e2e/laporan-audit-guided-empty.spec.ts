import { test, expect, type Page } from '@playwright/test';
import { mockLaporanApi, dispatcherSummary } from './laporan-fixtures';

// Audit ledger: honest-empty guided state (no seeded rows), Demo/Real
// provenance badges on a mixed ledger, and the "Buat mitigasi" CTA that
// routes back to the map. Reduced-motion safe, hermetic.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function gotoAuditLedger(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  // Stabilize: header nav must be laid out before clicking (flaky cold boot).
  await expect(page.locator('#nav-reports')).toBeVisible({ timeout: 30000 });
  await page.locator('#nav-reports').click();
  await expect(page.getByTestId('reports-erp-panel')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Catatan Audit Mitigasi' }).click();
}

test('audit guided empty: honest copy + CTA routes to map', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    summary: () => dispatcherSummary(),
    approvals: () => ({ items: [], total: 0 }),
  });
  await gotoAuditLedger(page);

  // Honest-empty guided state (not a zero table, not a spinner).
  await expect(page.getByText('Belum ada catatan persetujuan mitigasi')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/POST \/approvals/)).toBeVisible();
  await expect(page.getByText(/Mode Sandbox tamu tidak dapat mengisi audit/)).toBeVisible();

  // CTA "Buat mitigasi — buka Peta" routes back to the map section.
  await page.getByRole('button', { name: /Buat mitigasi/ }).click();
  await expect(page.locator('#nav-map')).toHaveClass(/bg-white/, { timeout: 10000 });
  await expect(page.getByTestId('reports-erp-panel')).toHaveCount(0);

  expect(pageerrors).toEqual([]);
});

test('audit mixed ledger shows Demo and Real provenance badges', async ({ page }) => {
  const pageerrors: string[] = [];
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await mockLaporanApi(page, {
    role: 'DISPATCHER',
    summary: () => dispatcherSummary(),
    approvals: () => ({
      items: [
        {
          id: 'DEMO-SEED-001',
          crisis_id: 'INC-DEMO-1',
          created_at: '2026-10-18T08:00:00Z',
          route_name: 'Medan — Tebing Tinggi via Tol',
          action: 'ACCEPT',
          approved_by: 'Dispatcher E2E',
          notes: 'Seed demonstrasi',
          sync_status: 'synced',
        },
        {
          id: 'OP-2026-042',
          crisis_id: 'INC-2026-042',
          created_at: '2026-10-19T09:30:00Z',
          route_name: 'Belawan — Medan via Jalinsum',
          action: 'REJECT',
          approved_by: 'Dispatcher E2E',
          notes: 'Jalur utama lumpuh',
          sync_status: 'synced',
        },
      ],
      total: 2,
    }),
  });
  await gotoAuditLedger(page);

  const provenance = page.getByLabel('Label keaslian data');
  await expect(provenance).toBeVisible({ timeout: 15000 });
  await expect(provenance.getByText('Demo 1')).toBeVisible();
  await expect(provenance.getByText('Real 1')).toBeVisible();
  // Per-row Demo chip only on the seeded row.
  await expect(page.getByText('INC-DEMO-1')).toBeVisible();
  await expect(page.getByText('INC-2026-042')).toBeVisible();

  expect(pageerrors).toEqual([]);
});
