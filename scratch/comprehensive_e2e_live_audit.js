const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function liveAudit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const auditLog = {
    network_errors: [],
    console_errors: [],
    tests: {},
  };

  page.on('console', msg => {
    if (msg.type() === 'error') {
      auditLog.console_errors.push(msg.text());
    }
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      auditLog.network_errors.push({
        url: res.url(),
        status: res.status(),
      });
    }
  });

  console.log('[1/6] Navigating to Landing Page (http://localhost:3000)...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  auditLog.tests.landing_page = {
    title: await page.title(),
    has_cta: !!(await page.$('text=Launch Command Center')),
  };

  console.log('[2/6] Navigating to Dashboard (http://localhost:3000/dashboard)...');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const currentUrl = page.url();
  auditLog.tests.dashboard_load = {
    final_url: currentUrl,
    has_guest_flag: currentUrl.includes('guest=1'),
    has_map: !!(await page.$('.mapboxgl-map, canvas')),
  };

  console.log('[3/6] Testing Navigation Tabs (Analitik, Simulasi, Laporan, Evaluasi)...');
  const tabs = [
    { name: 'Analitik', selector: 'button:has-text("Analitik")' },
    { name: 'Simulasi', selector: 'button:has-text("Simulasi")' },
    { name: 'Laporan', selector: 'button:has-text("Laporan")' },
    { name: 'Evaluasi', selector: 'button:has-text("Evaluasi")' },
    { name: 'Peta Operasi', selector: 'button:has-text("Peta Operasi")' },
  ];

  auditLog.tests.tabs = {};
  for (const tab of tabs) {
    const btn = await page.$(tab.selector);
    if (btn) {
      await btn.click();
      await page.waitForTimeout(2000);
      const visibleText = await page.$eval('main, #root, body', el => el.innerText);
      auditLog.tests.tabs[tab.name] = {
        clicked: true,
        text_length: visibleText.length,
        has_error: visibleText.includes('Application error') || visibleText.includes('Unhandled Runtime Error'),
      };
    } else {
      auditLog.tests.tabs[tab.name] = { clicked: false, error: 'Button not found' };
    }
  }

  console.log('[4/6] Testing RUN DEMO flow...');
  // Back to map
  const mapBtn = await page.$('button:has-text("Peta Operasi")');
  if (mapBtn) await mapBtn.click();
  await page.waitForTimeout(2000);

  const runDemoBtn = await page.$('footer button:has-text("RUN DEMO"), button:has-text("Run Demo")');
  if (runDemoBtn) {
    await runDemoBtn.click();
    await page.waitForTimeout(3000);

    const guidedPanel = await page.$('[class*="GuidedDemoPanel"], [class*="animate-in slide-in-from-bottom"]');
    auditLog.tests.run_demo = {
      button_clicked: true,
      guided_panel_visible: !!guidedPanel,
    };

    if (guidedPanel) {
      const panelText = await guidedPanel.innerText();
      auditLog.tests.run_demo.panel_stage_0 = panelText;

      // Click advance
      const advanceBtn = await page.$('button:has-text("Mulai Simulasi Disrupsi"), button:has-text("Langkah Berikutnya")');
      if (advanceBtn) {
        await advanceBtn.click();
        await page.waitForTimeout(3000);
        auditLog.tests.run_demo.advanced_to_stage_1 = true;
      }
    }
  } else {
    auditLog.tests.run_demo = { button_clicked: false, error: 'RUN DEMO button not found' };
  }

  console.log('[5/6] Testing Sidebar & Economic Tab...');
  const econTabBtn = await page.$('button:has-text("Dampak Ekonomi")');
  if (econTabBtn) {
    await econTabBtn.click();
    await page.waitForTimeout(2000);
    const sidebar = await page.$('aside');
    auditLog.tests.economic_tab = {
      found: true,
      content: sidebar ? (await sidebar.innerText()) : 'Sidebar not found',
    };
  } else {
    auditLog.tests.economic_tab = { found: false, note: 'Sidebar closed or tab not rendered' };
  }

  console.log('[6/6] Testing 100% Zoom Desktop Layout Clearance...');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(2000);
  const footerEl = await page.$('footer');
  const footerBox = footerEl ? await footerEl.boundingBox() : null;
  const sidebarEl = await page.$('aside');
  const sidebarBox = sidebarEl ? await sidebarEl.boundingBox() : null;

  let collisionDetected = false;
  if (footerBox && sidebarBox) {
    // Check horizontal overlap
    const footerRight = footerBox.x + footerBox.width;
    const sidebarLeft = sidebarBox.x;
    collisionDetected = footerRight > sidebarLeft;
  }

  auditLog.tests.layout_1366 = {
    footer_box: footerBox,
    sidebar_box: sidebarBox,
    collision_detected: collisionDetected,
  };

  await browser.close();

  const outDir = path.join(__dirname, '..', '.e2e-artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'live_audit_summary.json'), JSON.stringify(auditLog, null, 2));
  console.log('Live audit completed! Saved to .e2e-artifacts/live_audit_summary.json');
  console.log(JSON.stringify(auditLog, null, 2));
}

liveAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
