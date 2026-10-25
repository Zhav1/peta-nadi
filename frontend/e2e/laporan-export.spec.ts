import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { mockLaporanApi, dispatcherSummary, regulatorSummary } from './laporan-fixtures';

// M8 Phase 3: dispatcher JSON export carries filters_applied + scope + generated_at.
test('laporan JSON download contains filters_applied and scope', async ({ page }) => {
  await mockLaporanApi(page, { role: 'DISPATCHER', summary: () => dispatcherSummary() });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-json').click(),
  ]);
  const file = await download.path();
  expect(file).toBeTruthy();
  const payload = JSON.parse(fs.readFileSync(file as string, 'utf-8')) as Record<string, unknown>;

  expect(payload['scope']).toBe('DISPATCHER_DETAIL');
  expect(payload['generated_at']).toBeTruthy();
  const applied = payload['filters_applied'] as Record<string, unknown>;
  expect(applied).toMatchObject({ tier: 'ALL', status: 'ALL', granularity: 'weekly' });
  expect(applied).toHaveProperty('periode');
  expect(applied).toHaveProperty('search');
  expect(Array.isArray(payload['trips'])).toBe(true);
});

// M8 Phase 3: regulator sees aggregate-only CSV and no per-rit Aktual actions.
test('laporan regulator export is aggregate-only with no aktual buttons', async ({ page }) => {
  await mockLaporanApi(page, { role: 'REGULATOR', summary: () => regulatorSummary() });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-reports').click();

  const panel = page.getByTestId('reports-erp-panel');
  await expect(panel).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Agregat per perusahaan')).toBeVisible({ timeout: 15000 });

  // No per-rit Aktual actions on the regulator scope (rincian section hidden).
  await expect(panel.getByRole('button', { name: 'Aktual', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('audit-table')).toHaveCount(0);

  // Regulator CSV carries per-company aggregates, never per-rit rows.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-csv').click(),
  ]);
  const file = await download.path();
  expect(file).toBeTruthy();
  const csv = fs.readFileSync(file as string, 'utf-8');
  expect(csv.split('\n')[0]).toContain('company_id');
  expect(csv).toContain('pos_logistik');
  expect(csv).not.toContain('RIT-');
});
