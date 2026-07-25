import { test, expect } from '@playwright/test';

/**
 * PetaNadi 90-Second Demo Automation Script
 * 
 * Runs an automated 60 FPS screen walkthrough matching DEMO_SCRIPT_90S.md:
 * - 0:00-0:15: Zoom to North Sumatra hazard polygon
 * - 0:15-0:40: Perform 2-Node Picking (Belawan -> Siantar)
 * - 0:40-1:05: Select Alternative Route & observe 60 FPS WebGL Fleet
 * - 1:05-1:30: Deploy Action Plan & open Executive Cabinet Report PDF
 */

test('Record 90-Second PetaNadi Product Pitch Demo', async ({ page }) => {
  // Set viewport to crisp 1080p Desktop Full HD
  await page.setViewportSize({ width: 1920, height: 1080 });

  // 1. Navigate to Command Center
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Segment 1: Hazard Polygon & 4D Spatiotemporal Mesh (0:00 - 0:15)
  // Click Present filter to ensure live flood hazard is visible
  const presentBtn = page.locator('button:has-text("PRESENT")');
  if (await presentBtn.isVisible()) {
    await presentBtn.click();
  }
  await page.waitForTimeout(10000); // Allow camera fly-to and speech

  // Segment 2: Direct 2-Node Route Picking (0:15 - 0:40)
  // Trigger Run Demo or click nodes
  const runDemoBtn = page.locator('button:has-text("Run Demo")');
  if (await runDemoBtn.isVisible()) {
    await runDemoBtn.click();
  }
  await page.waitForTimeout(15000);

  // Segment 3: Alternative Route Selection & Fleet Movement (0:40 - 1:05)
  const bestTab = page.locator('button:has-text("Best")');
  if (await bestTab.isVisible()) {
    await bestTab.click();
  }
  await page.waitForTimeout(15000);

  // Segment 4: Deploy Action Plan & Cabinet Briefing Reports (1:05 - 1:30)
  const deployBtn = page.locator('button:has-text("DEPLOY UNIFIED ACTION PLAN")');
  if (await deployBtn.isVisible()) {
    await deployBtn.click();
    await page.waitForTimeout(3000);
  }

  // Switch to Reports tab
  const reportsTab = page.locator('button:has-text("REPORTS")');
  if (await reportsTab.isVisible()) {
    await reportsTab.click();
    await page.waitForTimeout(5000);
  }

  expect(page.url()).toContain('/dashboard');
});
