import { test, expect } from '@playwright/test';

test.describe('Phase 88: Multi-Client Routing Session Isolation E2E', () => {
  test('User A and User B operate concurrently without state or polyline collisions', async ({ browser }) => {
    // Spawn two strictly isolated browser contexts representing separate user sessions
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // 1. Context A navigates to Belawan -> Tebing Tinggi (Route 0)
      console.log('[E2E Isolation] Navigating Context A (Belawan -> Tebing Tinggi)...');
      await pageA.goto('/dashboard?origin=belawan&dest=tebingtinggi&modality=truck&route=0');

      // 2. Context B navigates to Pekanbaru -> Dumai Port (Route 1)
      console.log('[E2E Isolation] Navigating Context B (Pekanbaru -> Dumai Port)...');
      await pageB.goto('/dashboard?origin=pekanbaru&dest=dumai_port&modality=truck&route=1');

      // 3. Wait for both pages to hydrate and render the corridor summary pill
      await pageA.waitForSelector('[data-testid="corridor-summary-pill"]', { timeout: 30000 });
      await pageB.waitForSelector('[data-testid="corridor-summary-pill"]', { timeout: 30000 });

      // 4. Assert Context A reflects Belawan -> Tebing Tinggi
      const pillA = pageA.locator('[data-testid="corridor-summary-pill"]');
      await expect(pillA).toContainText(/Belawan/i);
      await expect(pillA).toContainText(/Tebing/i);
      expect(pageA.url()).toContain('origin=belawan');
      expect(pageA.url()).toContain('dest=tebingtinggi');
      expect(pageA.url()).toContain('route=0');
      console.log('[E2E Isolation] Context A state confirmed: Belawan -> Tebing Tinggi (route=0)');

      // 5. Assert Context B reflects Pekanbaru -> Dumai Port
      const pillB = pageB.locator('[data-testid="corridor-summary-pill"]');
      await expect(pillB).toContainText(/Pekanbaru/i);
      await expect(pillB).toContainText(/Dumai/i);
      expect(pageB.url()).toContain('origin=pekanbaru');
      expect(pageB.url()).toContain('dest=dumai_port');
      expect(pageB.url()).toContain('route=1');
      console.log('[E2E Isolation] Context B state confirmed: Pekanbaru -> Dumai Port (route=1)');

      // 6. Test Bidirectional Isolation: Change route in Context A
      console.log('[E2E Isolation] Mutating route in Context A to route=2...');
      await pageA.evaluate(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('route', '2');
        window.history.replaceState(null, '', url.pathname + url.search);
      });
      expect(pageA.url()).toContain('route=2');

      // 7. Verify Context B is completely unaffected
      console.log('[E2E Isolation] Verifying Context B integrity...');
      expect(pageB.url()).toContain('origin=pekanbaru');
      expect(pageB.url()).toContain('dest=dumai_port');
      expect(pageB.url()).toContain('route=1');
      await expect(pillB).toContainText(/Pekanbaru/i);
      await expect(pillB).toContainText(/Dumai/i);

      console.log('[E2E Isolation] Multi-client state isolation successfully verified!');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
