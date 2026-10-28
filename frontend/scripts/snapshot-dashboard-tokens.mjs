#!/usr/bin/env node
/**
 * Dashboard token baseline — M9 phase 174.
 *
 * Prints the computed background-color, color and border-color of the
 * dashboard shell, the top nav and one panel. Run it before and after a UI
 * phase and diff the output: identical output proves zero visual change on the
 * chrome that matters, without trusting a screenshot diff.
 *
 *   node scripts/snapshot-dashboard-tokens.mjs [baseUrl]
 *
 * Requires a running app (Playwright's webServer boots the standalone bundle):
 *   npm run build && node .next/standalone/server.js
 *
 * All /api/ traffic is answered locally with 503 {} so the probe never reaches
 * a live backend and the result does not depend on remote data. Auth is left
 * empty on purpose: guest chrome is the stable, deterministic surface.
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.argv[2] ?? process.env.DASHBOARD_BASE_URL ?? 'http://localhost:3000';
const PATHNAME = '/dashboard?section=map';
const VIEWPORT = { width: 1920, height: 1080 };

/** probe name → selector (+ climb to the element that owns the surface). */
const PROBES = [
  { name: 'shell', selector: 'main', climb: 1 },
  { name: 'top-nav', selector: 'header', climb: 0 },
  { name: 'panel', selector: 'aside', climb: 0 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );

  const response = await page.goto(`${BASE_URL}${PATHNAME}`, { waitUntil: 'domcontentloaded' });
  if (!response) throw new Error(`no response from ${BASE_URL}${PATHNAME}`);
  await page.waitForSelector('header', { timeout: 60_000 });
  // Let entry transitions and the map shell settle before reading styles.
  await page.waitForTimeout(1_000);

  const rows = await page.evaluate((probes) => {
    return probes.map((probe) => {
      let el = document.querySelector(probe.selector);
      for (let i = 0; i < probe.climb && el; i += 1) el = el.parentElement;
      if (!(el instanceof HTMLElement)) {
        return { name: probe.name, selector: probe.selector, missing: true };
      }
      const cs = getComputedStyle(el);
      return {
        name: probe.name,
        selector: probe.selector,
        missing: false,
        background: cs.backgroundColor,
        color: cs.color,
        borderColor: cs.borderTopColor,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle}`,
        radius: cs.borderTopLeftRadius,
        fontSize: cs.fontSize,
      };
    });
  }, PROBES);

  console.log('# Dashboard token baseline — M9 phase 174');
  console.log(`url: ${BASE_URL}${PATHNAME}`);
  console.log(`http: ${response.status()}`);
  console.log(`viewport: ${VIEWPORT.width}x${VIEWPORT.height}`);
  console.log(`captured: ${new Date().toISOString()}`);
  console.log('auth: guest (no token injected)');
  console.log('');
  console.log(
    '| probe | selector | background-color | color | border-color | border | radius | font-size |',
  );
  console.log('|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    if (row.missing) {
      console.log(`| ${row.name} | \`${row.selector}\` | NOT FOUND | — | — | — | — | — |`);
      continue;
    }
    console.log(
      `| ${row.name} | \`${row.selector}\` | ${row.background} | ${row.color} | ${row.borderColor} | ${row.border} | ${row.radius} | ${row.fontSize} |`,
    );
  }

  const missing = rows.filter((row) => row.missing).map((row) => row.name);
  if (missing.length > 0) {
    console.error(`\nFAIL: probes not found: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
