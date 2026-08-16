import { test } from '@playwright/test';
import * as path from 'path';

test('Diagnose Dashboard', async ({ page }) => {
  page.on('console', msg => console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log('[BROWSER PAGE ERROR]:', err.stack || err.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.resolve(__dirname, '../../docs/screenshots/diag_dashboard.png') });
});
