# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-recorder.spec.ts >> Record 90-Second PetaNadi Product Pitch Demo
- Location: e2e\demo-recorder.spec.ts:9:5

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.waitForLoadState: Test timeout of 120000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - img "PetaNadi" [ref=e8]
          - generic [ref=e9]: PetaNadi
          - link "◄ Onboard" [ref=e10] [cursor=pointer]:
            - /url: /
        - navigation [ref=e12]:
          - button "MAP 4D" [ref=e13] [cursor=pointer]
          - button "ANALYTICS" [ref=e14] [cursor=pointer]
          - button "SIMULATION" [ref=e15] [cursor=pointer]
          - button "REPORTS" [ref=e16] [cursor=pointer]
      - generic [ref=e18]:
        - 'button "CUOPT: 3.2ms (+18.5%)" [ref=e20] [cursor=pointer]'
        - 'button "TOMTOM: +35m (74.2%)" [ref=e27] [cursor=pointer]'
        - 'button "BMKG: 68.5 mm/j" [ref=e37] [cursor=pointer]'
        - 'button "SUMUT: ACTIVE" [ref=e44] [cursor=pointer]'
    - main [ref=e49]:
      - generic [ref=e50]:
        - generic "PetaNadi crisis intelligence map" [ref=e53]:
          - generic:
            - region "Map" [ref=e54]
            - img "Map marker" [ref=e55] [cursor=pointer]:
              - generic [ref=e60]: Pelabuhan Belawan
            - img "Map marker" [ref=e61] [cursor=pointer]:
              - generic [ref=e68]: Hub Utama Medan
            - img "Map marker" [ref=e69] [cursor=pointer]:
              - generic [ref=e76]: Hub Logistik Binjai
            - img "Map marker" [ref=e77] [cursor=pointer]:
              - generic [ref=e84]: Interchange Tebing Tinggi
            - img "Map marker" [ref=e85] [cursor=pointer]:
              - generic [ref=e92]: Pematang Siantar
          - generic [ref=e93]:
            - button "Zoom in" [ref=e94] [cursor=pointer]
            - button "Zoom out" [ref=e96] [cursor=pointer]
            - button "Reset bearing to north" [ref=e98]
        - complementary [ref=e100]:
          - generic [ref=e101]:
            - generic [ref=e102]:
              - paragraph [ref=e103]: NATIONAL LOGISTICS HEALTH
              - button "Sembunyikan Sidebar" [ref=e104] [cursor=pointer]
            - generic [ref=e108]:
              - generic [ref=e109]: "92"
              - generic [ref=e114]:
                - paragraph [ref=e115]: OPTIMAL
                - paragraph [ref=e116]: North Sumatra Corridor
                - paragraph [ref=e117]: 92% Flow Integrity
          - generic [ref=e118]:
            - generic [ref=e119]:
              - generic [ref=e120]:
                - generic [ref=e121]: LOGISTICS-TO-GDP
                - generic [ref=e122]: ↘ 8.2%
              - paragraph [ref=e123]: 14.2%
              - paragraph [ref=e124]: "Target: < 14.0% National Baseline"
            - generic [ref=e125]:
              - generic [ref=e126]:
                - generic [ref=e127]: FOOD INFLATION
                - generic [ref=e128]: PIHPS Baseline
              - paragraph [ref=e129]: 7.14%
              - paragraph [ref=e130]: PIHPS Anomaly Stream Active
            - generic [ref=e131]:
              - generic [ref=e132]:
                - generic [ref=e133]: ACTIVE SHOCKS
                - generic [ref=e134]: LIVE
              - paragraph [ref=e135]: 0 ACTIVE
              - paragraph [ref=e136]: Belawan-Medan Corridor Monitored
          - generic [ref=e137]:
            - generic [ref=e138]:
              - generic [ref=e139]: "BMKG Radar:"
              - generic [ref=e140]: ONLINE
            - generic [ref=e141]:
              - generic [ref=e142]: "AISstream Vessel Feed:"
              - generic [ref=e143]: ONLINE
            - generic [ref=e144]:
              - generic [ref=e145]: "PIHPS Price Stream:"
              - generic [ref=e146]: ONLINE
        - generic:
          - generic [ref=e148]:
            - button "truck" [ref=e150] [cursor=pointer]
            - button "Rute Asal & Tujuan" [ref=e160] [cursor=pointer]
            - button "Simulasi Bencana" [ref=e168] [cursor=pointer]
            - button "15km" [ref=e175] [cursor=pointer]
          - generic [ref=e180]:
            - button "past" [ref=e181] [cursor=pointer]
            - button "present" [ref=e182] [cursor=pointer]
            - button "future" [ref=e183] [cursor=pointer]
            - button "predict" [ref=e184] [cursor=pointer]
            - button "▶ Run Demo" [ref=e186] [cursor=pointer]:
              - generic [ref=e187]: ▶
              - text: Run Demo
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * PetaNadi 90-Second Demo Automation Script (Root Runner)
  5  |  * 
  6  |  * Target URL: http://localhost:3000/dashboard (or Docker endpoint)
  7  |  */
  8  | 
  9  | test('Record 90-Second PetaNadi Product Pitch Demo', async ({ page }) => {
  10 |   await page.setViewportSize({ width: 1920, height: 1080 });
  11 | 
  12 |   // Navigate to Command Center
  13 |   await page.goto('http://localhost:3000/dashboard');
> 14 |   await page.waitForLoadState('networkidle');
     |              ^ Error: page.waitForLoadState: Test timeout of 120000ms exceeded.
  15 |   await page.waitForTimeout(2000);
  16 | 
  17 |   // Segment 1: Hazard Polygon & 4D Spatiotemporal Mesh (0:00 - 0:15)
  18 |   const presentBtn = page.locator('button:has-text("PRESENT")');
  19 |   if (await presentBtn.isVisible()) {
  20 |     await presentBtn.click();
  21 |   }
  22 |   await page.waitForTimeout(10000);
  23 | 
  24 |   // Segment 2: Direct 2-Node Route Picking & RUN DEMO (0:15 - 0:40)
  25 |   const runDemoBtn = page.locator('button:has-text("Run Demo")');
  26 |   if (await runDemoBtn.isVisible()) {
  27 |     await runDemoBtn.click();
  28 |   }
  29 |   await page.waitForTimeout(15000);
  30 | 
  31 |   // Segment 3: Alternative Route Selection & Fleet Movement (0:40 - 1:05)
  32 |   const bestTab = page.locator('button:has-text("Best")');
  33 |   if (await bestTab.isVisible()) {
  34 |     await bestTab.click();
  35 |   }
  36 |   await page.waitForTimeout(15000);
  37 | 
  38 |   // Segment 4: Deploy Action Plan & Cabinet Briefing Reports (1:05 - 1:30)
  39 |   const deployBtn = page.locator('button:has-text("DEPLOY UNIFIED ACTION PLAN")');
  40 |   if (await deployBtn.isVisible()) {
  41 |     await deployBtn.click();
  42 |     await page.waitForTimeout(3000);
  43 |   }
  44 | 
  45 |   const reportsTab = page.locator('button:has-text("REPORTS")');
  46 |   if (await reportsTab.isVisible()) {
  47 |     await reportsTab.click();
  48 |     await page.waitForTimeout(5000);
  49 |   }
  50 | 
  51 |   expect(page.url()).toContain('/dashboard');
  52 | });
  53 | 
```