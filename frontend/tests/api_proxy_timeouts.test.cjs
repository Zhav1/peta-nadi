const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@/lib/baseUrl') {
    return path.join(frontendRoot, 'lib', 'baseUrl.ts');
  }
  if (request === './baseUrl' && parent?.filename.endsWith(`${path.sep}lib${path.sep}api.ts`)) {
    return path.join(frontendRoot, 'lib', 'baseUrl.ts');
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

const { api } = require('../lib/api.ts');
const { GET: proxyGet } = require('../app/api/proxy/[...path]/route.ts');
const originalFetch = global.fetch;
const originalWindow = global.window;
const originalNodeEnv = process.env.NODE_ENV;
const originalProxyTarget = process.env.API_PROXY_TARGET;
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

function installFastTimers() {
  let nextId = 0;
  const pending = new Map();
  global.setTimeout = (callback, _delay, ...args) => {
    const id = ++nextId;
    const immediate = setImmediate(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      callback(...args);
    });
    pending.set(id, immediate);
    return id;
  };
  global.clearTimeout = (id) => {
    const immediate = pending.get(id);
    if (immediate) clearImmediate(immediate);
    pending.delete(id);
  };
}

function restoreGlobals() {
  global.fetch = originalFetch;
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
  if (originalWindow === undefined) delete global.window;
  else global.window = originalWindow;
  if (originalProxyTarget === undefined) delete process.env.API_PROXY_TARGET;
  else process.env.API_PROXY_TARGET = originalProxyTarget;
  if (originalApiBaseUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiBaseUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
}

test.afterEach(restoreGlobals);
test.after(() => {
  Module._resolveFilename = originalResolveFilename;
  delete require.extensions['.ts'];
});

test('API read deadline covers JSON body and retries one direct timeout only', async () => {
  installFastTimers();
  process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000';
  global.window = { location: { hostname: 'example.test' } };
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const response = new Response('{}');
    response.json = () => new Promise(() => {});
    return response;
  };

  await assert.rejects(api.news.live(), (error) => error?.code === 'API_TIMEOUT');
  assert.equal(calls, 2, 'a timed-out body gets one direct retry and no proxy fallback');
});

test('a write whose response body stalls is timed out without replay', async () => {
  installFastTimers();
  process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000';
  global.window = { location: { hostname: 'example.test' } };
  let calls = 0;
  let method;
  global.fetch = async (_url, init) => {
    calls += 1;
    method = init.method;
    const response = new Response('{}');
    response.json = () => new Promise(() => {});
    return response;
  };

  await assert.rejects(api.news.verify('test claim'), (error) => error?.code === 'API_TIMEOUT');
  assert.equal(method, 'POST');
  assert.equal(calls, 1, 'a write with response headers must never be replayed');
});

test('network failure preserves same-origin proxy fallback', async () => {
  process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000';
  global.window = { location: { hostname: 'example.test' } };
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) throw new TypeError('network unavailable');
    return new Response('{"source":"proxy"}');
  };

  assert.deepEqual(await api.news.live(), { source: 'proxy' });
  assert.equal(urls.length, 2);
  assert.match(urls[0], /^http:\/\/127\.0\.0\.1:8000/);
  assert.match(urls[1], /^\/api\/proxy/);
});

test('caller abort during JSON body consumption is not retried or proxied', async () => {
  process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000';
  global.window = { location: { hostname: 'example.test' } };
  const caller = new AbortController();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const response = new Response('{}');
    response.json = () => new Promise(() => {});
    return response;
  };

  const pending = api.news.live(caller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  caller.abort();
  await assert.rejects(pending, (error) => error?.name === 'AbortError');
  assert.equal(calls, 1);
});

test('optional analytics and report signals abort their shared API fetches', async () => {
  process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000';
  const cases = [
    { call: (signal) => api.commodities.prices({ region: 'Riau' }, signal), path: '/api/v1/commodities/prices?region=Riau' },
    { call: (signal) => api.commodities.spikes({ region: 'Riau' }, signal), path: '/api/v1/commodities/spikes?region=Riau' },
    { call: (signal) => api.weather.spatialPolygons(undefined, signal), path: '/api/v1/weather/spatial-polygons?' },
    { call: (signal) => api.weather.summary(signal), path: '/api/v1/weather/summary' },
    { call: (signal) => api.fire.hotspots(signal), path: '/api/v1/fire/hotspots' },
    { call: (signal) => api.bnpb.events({ limit: 7 }, signal), path: '/api/v1/bnpb/events?limit=7' },
    { call: (signal) => api.approvals.list('incident-1', signal), path: '/api/v1/approvals?incident_id=incident-1' },
    { call: (signal) => api.sourceHealth.get(signal), path: '/api/v1/health/sources' },
    { call: (signal) => api.erp.summary('company-1', signal), path: '/api/v1/erp/summary?company_id=company-1' },
  ];

  for (const { call, path: expectedPath } of cases) {
    const caller = new AbortController();
    let capturedUrl;
    let upstreamSignal;
    let calls = 0;
    global.fetch = (url, init) => {
      calls += 1;
      capturedUrl = String(url);
      upstreamSignal = init.signal;
      return new Promise(() => {});
    };

    const pending = call(caller.signal);
    await new Promise((resolve) => setImmediate(resolve));
    caller.abort();
    await assert.rejects(pending, (error) => error?.name === 'AbortError');
    assert.equal(calls, 1, `${expectedPath} must not retry a caller abort`);
    assert.ok(capturedUrl.includes(expectedPath), `${capturedUrl} should include ${expectedPath}`);
    assert.equal(upstreamSignal.aborted, true, `${expectedPath} must forward cancellation`);
  }
});

test('proxy returns 504 when upstream response body stalls', async () => {
  installFastTimers();
  process.env.NODE_ENV = 'development';
  process.env.API_PROXY_TARGET = 'http://127.0.0.1:8000';
  global.fetch = async () => {
    const response = new Response('{}', { headers: { 'content-type': 'application/json' } });
    response.text = () => new Promise(() => {});
    return response;
  };

  const req = new (require('next/server').NextRequest)('http://localhost/api/proxy/health');
  const response = await proxyGet(req, { params: { path: ['api', 'v1', 'health'] } });
  assert.equal(response.status, 504);
  assert.match(await response.text(), /timed out/i);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('proxy aborts upstream work and distinguishes an incoming client disconnect', async () => {
  process.env.NODE_ENV = 'development';
  process.env.API_PROXY_TARGET = 'http://127.0.0.1:8000';
  const client = new AbortController();
  let upstreamSignal;
  global.fetch = (_url, init) => {
    upstreamSignal = init.signal;
    const response = new Response('{}', { headers: { 'content-type': 'application/json' } });
    response.text = () => new Promise(() => {});
    return Promise.resolve(response);
  };

  const NextRequest = require('next/server').NextRequest;
  const req = new NextRequest('http://localhost/api/proxy/health', { signal: client.signal });
  const pending = proxyGet(req, { params: { path: ['api', 'v1', 'health'] } });
  await new Promise((resolve) => setImmediate(resolve));
  client.abort();
  const response = await pending;
  assert.equal(response.status, 499);
  assert.equal(upstreamSignal.aborted, true);
});

test('proxy does not apply the response-body deadline to SSE streams', async () => {
  installFastTimers();
  process.env.NODE_ENV = 'development';
  process.env.API_PROXY_TARGET = 'http://127.0.0.1:8000';
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: ready\n\n'));
    },
  });
  global.fetch = async () => new Response(source, {
    headers: { 'content-type': 'text/event-stream' },
  });

  const req = new (require('next/server').NextRequest)('http://localhost/api/proxy/events');
  const response = await proxyGet(req, { params: { path: ['api', 'v1', 'events'] } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const reader = response.body.getReader();
  const firstChunk = await reader.read();
  assert.match(new TextDecoder().decode(firstChunk.value), /data: ready/);
  await reader.cancel();
});
