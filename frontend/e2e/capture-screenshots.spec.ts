import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const screenshotDir = path.resolve(__dirname, '../../docs/screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
});

test('01 - Onboarding Page', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotDir, '01_onboarding_hero.png') });

  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotDir, '02_onboarding_features.png') });
});

test('02 - Command Center 4D Map & Incident Radar', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3000/dashboard?section=map', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(screenshotDir, '03_command_center_map.png') });

  // Trigger Run Demo
  const runDemoBtn = page.locator('button:has-text("Run Demo")');
  if (await runDemoBtn.isVisible()) {
    await runDemoBtn.click();
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: path.join(screenshotDir, '04_incident_radar_pipeline.png') });
});

test('03 - Spatial Economic Analytics', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3000/dashboard?section=analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(screenshotDir, '05_spatial_economic_analytics.png') });
});

test('04 - Multi-Agency Simulation Sandbox', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3000/dashboard?section=simulation', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(screenshotDir, '06_simulation_agency_sandbox.png') });
});

test('05 - B2G Executive Cabinet Briefing Center', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3000/dashboard?section=reports', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(screenshotDir, '07_executive_cabinet_reports.png') });
});
