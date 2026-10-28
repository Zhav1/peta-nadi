// Temporary diagnostic: capture console + exceptions from production dashboard.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE_URL = process.argv[2] || 'https://pre-hub.vercel.app';
const EDGE_PATH =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
const edge = spawn(
  EDGE_PATH,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1920,1080',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDevtools(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools down');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', reject);
  });
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { ready, call, events, close: () => socket.close() };
}

let exitCode = 0;
try {
  const version = await waitForDevtools();
  const cdp = connect(version.webSocketDebuggerUrl);
  await cdp.ready;
  const { targetId } = await cdp.call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });
  await cdp.call('Page.enable', {}, sessionId);
  await cdp.call('Runtime.enable', {}, sessionId);
  await cdp.call('Log.enable', {}, sessionId);
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp.call('Page.navigate', { url: `${BASE_URL}/dashboard?guest=1` }, sessionId);
  await sleep(15000);

  const probe = await cdp.call(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const out = {};
        out.buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /Truk|Kapal|Udara|Semua/.test(t)).slice(0, 8);
        const canvas = document.querySelector('canvas.mapboxgl-canvas');
        out.hasCanvas = Boolean(canvas);
        out.canvasSize = canvas ? [canvas.width, canvas.height] : null;
        return out;
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  console.log('PROBE', JSON.stringify(probe.result?.value));

  for (const ev of cdp.events) {
    if (ev.method === 'Runtime.consoleAPICalled') {
      const type = ev.params.type;
      const text = (ev.params.args || [])
        .map((a) => a.value ?? a.description ?? '')
        .join(' ');
      if (type === 'error' || type === 'warning' || /fleet|Fleet|mapbox/i.test(text)) {
        console.log(`[console.${type}]`, text.slice(0, 500));
      }
    }
    if (ev.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', (ev.params.exceptionDetails?.exception?.description || ev.params.exceptionDetails?.text || '').slice(0, 800));
    }
    if (ev.method === 'Log.entryAdded') {
      const e = ev.params.entry;
      if (e.level === 'error') console.log('[log.error]', (e.text || '').slice(0, 500));
    }
  }
  await cdp.call('Browser.close');
  cdp.close();
} catch (err) {
  exitCode = 1;
  console.error('probe failed:', err?.message || err);
} finally {
  try { edge.kill(); } catch {}
}
process.exit(exitCode);
