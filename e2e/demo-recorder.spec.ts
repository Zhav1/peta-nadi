import { test, expect } from '@playwright/test';

/**
 * PetaNadi 90-Second Demo Automation Script (Root & Frontend Runner)
 * 
 * Target URL: http://localhost:3000/dashboard
 * Note: Uses 'domcontentloaded' instead of 'networkidle' because WebSocket / polling streams remain active.
 */

test('Record 90-Second PetaNadi Product Pitch Demo', async ({ page }) => {
  // Set viewport to crisp 1080p Desktop Full HD
  await page.setViewportSize({ width: 1920, height: 1080 });

  // 1. Navigate to Command Center
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000); // Allow Mapbox canvas to render

  // Segment 1: Hazard Polygon & 4D Spatiotemporal Mesh (0:00 - 0:15)
  const presentBtn = page.locator('button:has-text("PRESENT")');
  if (await presentBtn.isVisible()) {
    await presentBtn.click();
  }
  await page.waitForTimeout(10000); // Allow camera fly-to and initial speech

  // Segment 2: Direct 2-Node Route Picking & RUN DEMO (0:15 - 0:40)
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

  const reportsTab = page.locator('button:has-text("REPORTS")');
  if (await reportsTab.isVisible()) {
    await reportsTab.click();
    await page.waitForTimeout(5000);
  }

  expect(page.url()).toContain('/dashboard');
});
