/* eslint-disable @typescript-eslint/no-require-imports -- Node's test harness is CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');
const SingleFlightRequest = class {
  active = null;
  begin() {
    if (this.active && !this.active.signal.aborted) return null;
    this.active = new AbortController();
    return this.active;
  }
  finish(controller) {
    if (this.active === controller) this.active = null;
  }
  abort() {
    this.active?.abort();
    this.active = null;
  }
};

function makeRuntime() {
  const slots = [];
  const intervals = [];
  const timeouts = [];
  let cursor = 0;
  let pendingEffects = [];
  let result;
  const visibilityListeners = new Set();

  const depsEqual = (left, right) =>
    left != null && right != null && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { type: 'state', value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[index];
      assert.equal(slot.type, 'state');
      return [slot.value, (next) => {
        slot.value = typeof next === 'function' ? next(slot.value) : next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { type: 'ref', value: { current: initial } };
      assert.equal(slots[index].type, 'ref');
      return slots[index].value;
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !depsEqual(slots[index].deps, deps)) {
        slots[index] = { type: 'callback', deps, value: callback };
      }
      assert.equal(slots[index].type, 'callback');
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const slot = slots[index];
      if (!slot || !depsEqual(slot.deps, deps)) {
        pendingEffects.push({
          index,
          previousCleanup: slot?.cleanup,
          effect,
          deps,
        });
      }
      if (slot) assert.equal(slot.type, 'effect');
    },
  };

  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setInterval = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    intervals.push(timer);
    return timer;
  };
  global.clearInterval = (timer) => { if (timer) timer.cleared = true; };
  global.setTimeout = (callback, delay, ...args) => {
    const timer = { callback, delay, args, cleared: false };
    timeouts.push(timer);
    queueMicrotask(() => { if (!timer.cleared) callback(...args); });
    return timer;
  };
  global.clearTimeout = (timer) => { if (timer) timer.cleared = true; };

  return {
    react,
    intervals,
    timeouts,
    visibilityListeners,
    render(hook, ...args) {
      cursor = 0;
      pendingEffects = [];
      result = hook(...args);
      for (const pending of pendingEffects) pending.previousCleanup?.();
      for (const pending of pendingEffects) {
        const cleanup = pending.effect();
        slots[pending.index] = {
          type: 'effect',
          deps: pending.deps,
          cleanup: typeof cleanup === 'function' ? cleanup : null,
        };
      }
      return result;
    },
    emitVisibility(visible) {
      for (const listener of visibilityListeners) listener(visible);
    },
    get result() { return result; },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    },
  };
}

function loadHook(relativePath, runtime, dependencies) {
  const filename = path.join(frontendRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'react') return runtime.react;
    if (request === '@/lib/dashboardMemoryCache') return { SingleFlightRequest };
    if (request === '@/lib/visibility') {
      return {
        isDocumentVisible: () => true,
        subscribeVisibility: (listener) => {
          runtime.visibilityListeners.add(listener);
          return () => runtime.visibilityListeners.delete(listener);
        },
      };
    }
    if (request === '@/lib/publicCache') {
      return {
        PUBLIC_CACHE_TTL_MS: 1,
        PUBLIC_NEWS_CACHE_KEY: 'test-news',
        readPublicCache: () => null,
        writePublicCache: () => {},
      };
    }
    if (Object.hasOwn(dependencies, request)) return dependencies[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    loaded._compile(compiled, filename);
  } finally {
    Module._load = originalLoad;
  }
  return loaded.exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushAsync() {
  for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

function bootstrapDependencies(runtime, api, authRef = { current: { user: { id: 'user-a', company_id: 'co-a' }, role: 'DISPATCHER' } }) {
  return {
    '@/lib/api': { api },
    '@/lib/authContext': { useAuth: () => authRef.current },
  };
}

test('bootstrap scheduled tick skips pending body read and finite failure releases initial loading', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const fourth = deferred();
  const pendingResponses = [first, second, third, fourth];
  const requests = [];
  const authRef = { current: { user: { id: 'user-a', company_id: 'co-a' }, role: 'DISPATCHER' } };
  const api = { dashboard: { bootstrap: (_params, signal) => {
    const pending = pendingResponses[requests.length];
    requests.push({ signal, pending });
    return pending.promise;
  } } };
  const hook = loadHook('hooks/useDashboardBootstrap.ts', runtime, bootstrapDependencies(runtime, api, authRef)).useDashboardBootstrap;

  let current = runtime.render(hook);
  const timer = runtime.intervals.find((entry) => entry.delay === 60_000);
  assert.ok(timer, 'bootstrap poll should retain its 60-second cadence');
  timer.callback();
  assert.equal(requests.length, 1, 'tick skips while the API promise, including JSON parsing, is pending');
  assert.equal(requests[0].signal.aborted, false, 'scheduled tick must not cancel current read');

  first.resolve({ computed_at: new Date().toISOString(), stale: false });
  await flushAsync();
  current = runtime.render(hook);
  assert.equal(current.isLoading, false);
  timer.callback();
  assert.equal(requests.length, 2, 'a subsequent tick can start after finally releases the gate');
  second.reject(new Error('mock finite failure'));
  await flushAsync();
  current = runtime.render(hook);
  assert.equal(current.isLoading, false);
  assert.match(current.error, /mock finite failure/);

  timer.callback();
  assert.equal(requests.length, 3);
  authRef.current = { user: { id: 'user-b', company_id: 'co-b' }, role: 'DISPATCHER' };
  runtime.render(hook);
  assert.equal(requests[2].signal.aborted, true, 'identity change aborts the obsolete bootstrap read');
  assert.equal(requests.length, 4, 'identity change starts a fresh bootstrap read');
});

test('fleet 10-second tick skips an in-flight initial read and retries after settlement', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const pendingResponses = [first, second, third];
  const requests = [];
  const authRef = { current: { user: { id: 'guest', company_id: null }, role: 'GUEST' } };
  const api = { fleet: { vehicles: (_modality, _companyId, _geometry, signal) => {
    const pending = pendingResponses[requests.length];
    requests.push({ signal, pending });
    return pending.promise;
  } } };
  const dependencies = {
    '@/lib/api': { api, getBaseUrl: () => '', getAuthToken: () => null },
    '@/lib/authContext': { useAuth: () => authRef.current },
    '@/lib/fleetScope': { isLiveTracked: () => false, selectTenantVehicles: (vehicles) => vehicles },
    '@/lib/corridorSnappingService': { corridorSnappingService: {} },
  };
  const hook = loadHook('hooks/useFleetVehicles.ts', runtime, dependencies).useFleetVehicles;

  runtime.render(hook);
  const timer = runtime.intervals.find((entry) => entry.delay === 10_000);
  assert.ok(timer, 'fleet poll should retain its 10-second cadence');
  assert.equal(requests.length, 1, 'initial fetch starts once');
  timer.callback();
  assert.equal(requests.length, 1, 'scheduled fleet tick skips the active request');
  assert.equal(requests[0].signal.aborted, false, 'scheduled fleet tick must not abort the initial read');

  first.resolve({ vehicles: [] });
  await flushAsync();
  timer.callback();
  assert.equal(requests.length, 2, 'the gate releases after API payload parsing settles');
  assert.equal(requests[1].signal.aborted, false);

  authRef.current = { user: { id: 'user-b', company_id: 'co-b' }, role: 'DISPATCHER' };
  runtime.render(hook);
  assert.equal(requests[1].signal.aborted, true, 'identity change aborts the obsolete fleet read');
  assert.equal(requests.length, 3, 'identity change starts a fresh fleet read');
});

test('fleet finite initial failures stop loading after the existing retry budget', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  let calls = 0;
  const api = { fleet: { vehicles: async () => {
    calls += 1;
    throw new Error('fleet unavailable');
  } } };
  const dependencies = {
    '@/lib/api': { api, getBaseUrl: () => '', getAuthToken: () => null },
    '@/lib/authContext': { useAuth: () => ({ user: { id: 'guest', company_id: null }, role: 'GUEST' }) },
    '@/lib/fleetScope': { isLiveTracked: () => false, selectTenantVehicles: (vehicles) => vehicles },
    '@/lib/corridorSnappingService': { corridorSnappingService: {} },
  };
  const hook = loadHook('hooks/useFleetVehicles.ts', runtime, dependencies).useFleetVehicles;

  let current = runtime.render(hook);
  await flushAsync();
  current = runtime.render(hook);
  assert.equal(calls, 3, 'fleet preserves its bounded three-attempt initial retry budget');
  assert.equal(current.isLoading, false, 'finite fleet failure must stop the loading state');
  assert.match(current.error, /fleet unavailable/);
});

test('incidents poll and visibility resume skip a matching pending request; finite failure settles loading', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const pendingResponses = [first, second, third];
  const requests = [];
  const authRef = { current: { user: { id: 'user-a', company_id: 'co-a' }, role: 'DISPATCHER' } };
  const api = { incidents: { list: (_params, signal) => {
    const pending = pendingResponses[requests.length];
    requests.push({ signal, pending });
    return pending.promise;
  } } };
  const dependencies = {
    '@/lib/api': { api },
    '@/lib/authContext': { useAuth: () => authRef.current },
  };
  const hook = loadHook('hooks/useIncidents.ts', runtime, dependencies).useIncidents;

  let current = runtime.render(hook);
  const timer = runtime.intervals.find((entry) => entry.delay === 15_000);
  assert.ok(timer, 'incidents poll should retain its 15-second cadence');
  timer.callback();
  runtime.emitVisibility(true);
  assert.equal(requests.length, 1, 'timer and visibility resume both skip while the request is pending');
  assert.equal(requests[0].signal.aborted, false);

  first.reject(new Error('incidents unavailable'));
  await flushAsync();
  current = runtime.render(hook);
  assert.equal(current.loading, false, 'finite initial failure must stop the loading state');
  assert.match(current.error, /incidents unavailable/);
  timer.callback();
  assert.equal(requests.length, 2, 'poll can retry once the failed read settles');
  authRef.current = { user: { id: 'user-b', company_id: 'co-b' }, role: 'DISPATCHER' };
  runtime.render(hook);
  assert.equal(requests[1].signal.aborted, true, 'identity change aborts the obsolete incidents read');
  assert.equal(requests.length, 3, 'identity change starts a fresh incidents read');
  assert.equal(requests[2].signal.aborted, false);
  runtime.unmount();
  assert.equal(requests[2].signal.aborted, true, 'unmount aborts the current incidents read');
});

test('corridor finite initial failure settles loading and retains the fallback context', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  const pending = deferred();
  const api = { corridor: { context: () => pending.promise } };
  const dependencies = {
    '@/lib/api': { api },
    '@/lib/authContext': { useAuth: () => ({ user: { id: 'guest', company_id: null }, role: 'GUEST' }) },
  };
  const hook = loadHook('hooks/useCorridorContext.ts', runtime, dependencies).useCorridorContext;

  let current = runtime.render(hook);
  pending.reject(new Error('corridor unavailable'));
  await flushAsync();
  current = runtime.render(hook);
  assert.equal(current.isLoading, false, 'finite corridor failure must stop the loading state');
  assert.match(current.error, /corridor unavailable/);
  assert.ok(current.corridorContext, 'fallback context remains available after failure');
});

test('corridor poll and visibility resume skip a matching pending request and cleanup aborts it', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  const first = deferred();
  const requests = [];
  const authRef = { current: { user: { id: 'guest', company_id: null }, role: 'GUEST' } };
  const api = { corridor: { context: (_corridorId, signal) => {
    requests.push({ signal });
    return first.promise;
  } } };
  const dependencies = {
    '@/lib/api': { api },
    '@/lib/authContext': { useAuth: () => authRef.current },
  };
  const hook = loadHook('hooks/useCorridorContext.ts', runtime, dependencies).useCorridorContext;

  runtime.render(hook);
  const timer = runtime.intervals.find((entry) => entry.delay === 30_000);
  assert.ok(timer, 'corridor poll should retain its 30-second cadence');
  timer.callback();
  runtime.emitVisibility(true);
  assert.equal(requests.length, 1, 'timer and visibility resume skip the active read');
  assert.equal(requests[0].signal.aborted, false);

  authRef.current = { user: { id: 'user-b', company_id: 'co-b' }, role: 'DISPATCHER' };
  runtime.render(hook);
  assert.equal(requests[0].signal.aborted, true, 'identity change aborts the obsolete corridor read');
  assert.equal(requests.length, 2, 'identity change starts a fresh corridor read');
  runtime.unmount();
  assert.equal(requests[1].signal.aborted, true, 'unmount aborts the current request');
  first.reject(new Error('aborted on cleanup'));
  await flushAsync();
});

test('news finite initial failures settle loading without discarding the warming state', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  const api = { news: {
    live: async () => { throw new Error('news unavailable'); },
    marketRegime: async () => { throw new Error('regime unavailable'); },
  } };
  const dependencies = {
    '@/lib/api': { api },
    '@/lib/authContext': { useAuth: () => ({ user: { id: 'guest', company_id: null }, role: 'GUEST' }) },
  };
  const hook = loadHook('hooks/useNewsVerification.ts', runtime, dependencies).useNewsVerification;

  let current = runtime.render(hook);
  await flushAsync();
  current = runtime.render(hook);
  assert.equal(current.isLoading, false, 'settled news failures must stop the loading state');
  assert.equal(current.status, 'warming');
});

test('news live and regime requests share one gate across poll and visibility ticks', async (t) => {
  const runtime = makeRuntime();
  t.after(() => runtime.unmount());
  const live = deferred();
  const regime = deferred();
  const liveSignals = [];
  const regimeSignals = [];
  const authRef = { current: { user: { id: 'guest', company_id: null }, role: 'GUEST' } };
  const api = { news: {
    live: (signal) => { liveSignals.push(signal); return live.promise; },
    marketRegime: (signal) => { regimeSignals.push(signal); return regime.promise; },
  } };
  const dependencies = {
    '@/lib/api': { api },
    '@/lib/authContext': { useAuth: () => authRef.current },
  };
  const hook = loadHook('hooks/useNewsVerification.ts', runtime, dependencies).useNewsVerification;

  let current = runtime.render(hook);
  const timer = runtime.intervals.find((entry) => entry.delay === 30_000);
  assert.ok(timer, 'news poll should retain its 30-second cadence');
  timer.callback();
  runtime.emitVisibility(true);
  assert.equal(liveSignals.length, 1, 'news poll skips an in-flight pair');
  assert.equal(regimeSignals.length, 1, 'market regime shares the news poll gate');
  assert.equal(liveSignals[0].aborted, false);

  live.resolve({ articles: [] });
  regime.resolve({ regime: 'NORMAL', critical_news_count: 0, early_warning_count: 0 });
  await flushAsync();
  current = runtime.render(hook);
  assert.equal(current.isLoading, false, 'settled news requests release initial loading');
  timer.callback();
  assert.equal(liveSignals.length, 2, 'next poll begins after both response bodies settle');
  assert.equal(regimeSignals.length, 2);

  authRef.current = { user: { id: 'user-b', company_id: 'co-b' }, role: 'DISPATCHER' };
  runtime.render(hook);
  assert.equal(liveSignals[1].aborted, true, 'identity change aborts the obsolete news request');
  assert.equal(liveSignals.length, 3, 'identity change starts a fresh news read');
  assert.equal(regimeSignals.length, 3);
  runtime.unmount();
  assert.equal(liveSignals[2].aborted, true, 'unmount aborts the current news request');
});
