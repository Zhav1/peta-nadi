// Phase-fleet production evidence captures.
//
// Deliberately NOT Playwright: drives an installed Edge/Chrome over the
// DevTools Protocol with Node 24's global WebSocket (same approach as the
// M9 phase-visual capture). Screenshots the live deployment at 1920x1080 and
// 390x844, plus one 1920x1080 frame with the Waspada Dini advisory toggled ON
// so the violet dot layer is visible.
//
// Usage:
//   node .planning/milestones/M9/phase-fleet/capture-fleet-waspada.mjs [baseUrl] [outDir]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE_URL = process.argv[2] || 'https://pre-hub.vercel.app';
const OUT_DIR =
  process.argv[3] ||
  path.resolve(process.cwd(), '.planning', 'milestones', 'M9', 'phase-fleet');
const EDGE_PATH =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9225;

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'm9-fleet-'));
const edge = spawn(
  EDGE_PATH,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1920,1080',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDevtools(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('DevTools endpoint never came up');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', (err) => reject(err));
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  return { ready, call, close: () => socket.close() };
}

const clickAdvisory = async (session, cdp) => {
  const res = await cdp.call(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const btn = [...document.querySelectorAll('button')]
          .find((b) => /Waspada Dini/i.test(b.textContent || ''));
        if (btn) btn.click();
        return Boolean(btn);
      })()`,
      returnByValue: true,
    },
    session,
  );
  await sleep(3000);
  return res.result?.value === true;
};

const shots = [
  { suffix: '1920x1080', width: 1920, height: 1080, mobile: false, after: async () => {} },
  { suffix: '390x844', width: 390, height: 844, mobile: true, after: async () => {} },
  {
    suffix: 'waspada-1920x1080',
    width: 1920,
    height: 1080,
    mobile: false,
    after: clickAdvisory,
  },
];

let exitCode = 0;
const report = [];

try {
  const version = await waitForDevtools();
  const cdp = connect(version.webSocketDebuggerUrl);
  await cdp.ready;

  for (const shot of shots) {
    const { targetId } = await cdp.call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });

    await cdp.call('Page.enable', {}, sessionId);
    await cdp.call('Runtime.enable', {}, sessionId);
    await cdp.call(
      'Emulation.setDeviceMetricsOverride',
      {
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: 1,
        mobile: shot.mobile,
      },
      sessionId,
    );

    await cdp.call('Page.navigate', { url: `${BASE_URL}/dashboard?guest=1` }, sessionId);
    await sleep(14_000);

    let advisoryClicked = null;
    if (shot.after) advisoryClicked = await shot.after(sessionId, cdp);

    const { data } = await cdp.call(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      sessionId,
    );
    const file = path.join(OUT_DIR, `${shot.suffix}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    const bytes = fs.statSync(file).size;
    report.push({ file, suffix: shot.suffix, bytes, advisoryClicked });
    console.log(`captured ${file} (${bytes} bytes)`);

    await cdp.call('Target.closeTarget', { targetId });
  }

  await cdp.call('Browser.close');
  cdp.close();
} catch (err) {
  exitCode = 1;
  console.error('capture failed:', err?.message || err);
} finally {
  try {
    edge.kill();
  } catch {
    /* already gone */
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'capture-report.json'),
    JSON.stringify({ baseUrl: BASE_URL, at: new Date().toISOString(), report }, null, 2),
  );
}

process.exit(exitCode);
