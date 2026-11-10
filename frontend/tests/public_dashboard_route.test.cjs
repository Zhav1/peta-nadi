/* eslint-disable @typescript-eslint/no-require-imports -- Node's test harness is CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');

function compileToCjs(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
}

/** Loads a real .ts module, resolving `@/…` (and other keys) from `resolvers`. */
function loadModuleWithResolvers(filename, resolvers) {
  const compiled = compileToCjs(fs.readFileSync(filename, 'utf8'), filename);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(resolvers, request)) return resolvers[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    loaded._compile(compiled, filename);
  } finally {
    Module._load = originalLoad;
  }
  return loaded.exports;
}

// The real snapshot normalizer is a pure module (type-only imports) — use it.
const publicSnapshotPath = path.join(frontendRoot, 'lib', 'publicSnapshot.ts');
const publicSnapshot = loadModuleWithResolvers(publicSnapshotPath, {});

const baseUrlMock = {
  PRODUCTION_API_BASE_URL: 'https://backend.example.com',
  sanitizeBaseUrl: (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.trim().replace(/\/+$/, '');
  },
};

function makePayload({ computedAt, sectionOverrides = {}, stale = false, version = 7 } = {}) {
  return {
    schema_version: 1,
    snapshot_key: 'sumatra_mainland',
    computed_at: computedAt,
    stale,
    shadow_mode: false,
    role: 'GUEST',
    version,
    source_freshness: {},
    coverage: {
      mainland_provinces: ['Aceh'],
      province_coverage_status: 'complete',
      road_coverage_status: 'partial',
    },
    sections: {
      news: {
        status: 'stale',
        data: { status: 'stale', total: 1, last_updated: '2026-01-01T00:00:00Z', meta: null, items: [{ id: 'n1', headline: 'Jalur tertutup' }] },
        error: 'Budget sumber habis',
        observed_at: '2026-01-01T00:00:00Z',
        valid_until: '2026-01-01T01:00:00Z',
      },
      weather_summary: {
        status: 'degraded',
        data: null,
        error: 'Provider habis',
      },
      fire_hotspots: {
        status: 'ok',
        data: { status: 'empty', count: 0, total: 0, capped: false, reason: null, hotspots: [], source: 'nasa-firms-api', window_hours: 24, updated_at: '2026-01-01T00:00:00Z' },
      },
      ...sectionOverrides,
    },
  };
}

function withEnv(overrides, fn) {
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'API_PROXY_TARGET', 'NEXT_PUBLIC_API_URL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  return Promise.resolve(fn()).finally(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

/**
 * Loads one fresh route module per case so the module-level inflight /
 * lastKnownGood state never leaks between tests. `fetchImpl` must stay
 * installed while the GET call runs, so `runWithFetch` wraps the assertion.
 */
function loadRoute() {
  return loadModuleWithResolvers(path.join(frontendRoot, 'app', 'api', 'public', 'dashboard', 'route.ts'), {
    '@/lib/baseUrl': baseUrlMock,
    '@/lib/publicSnapshot': publicSnapshot,
    '@/lib/types': {},
  });
}

async function runWithFetch(fetchImpl, fn) {
  const savedFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    return await fn(loadRoute());
  } finally {
    global.fetch = savedFetch;
  }
}

async function callGet(route, url = 'http://localhost:3000/api/public/dashboard') {
  return route.GET(new Request(url));
}

test('fresh snapshot row is served with its real sections and ok state', async () => {
  const nowIso = new Date().toISOString();
  const row = {
    snapshot_key: 'sumatra_mainland',
    schema_version: 1,
    computed_at: nowIso,
    payload: makePayload({ computedAt: nowIso, stale: false }),
  };
  let supabaseCalled = false;
  await runWithFetch(async (input) => {
    if (String(input).includes('/rest/v1/public_dashboard_snapshots')) {
      supabaseCalled = true;
      return { ok: true, status: 200, json: async () => [row] };
    }
    throw new Error('backend fallback must not run when a row serves');
  }, async (route) => {
    await withEnv(
      {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SUPABASE_URL: 'https://supa.example.com',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
      async () => {
        const res = await callGet(route);
        assert.equal(res.status, 200);
        assert.equal(supabaseCalled, true);
        assert.equal(res.headers.get('X-Public-Snapshot-State'), 'ok');
        assert.match(res.headers.get('Cache-Control'), /s-maxage=15/);
        const body = await res.json();
        assert.equal(body.computed_at, nowIso);
        assert.equal(body.stale, false);
        assert.equal(body.version, 7);
        assert.equal(body.sections.news.data.items.length, 1);
        assert.equal(body.sections.news.status, 'stale');
        assert.equal(body.sections.weather_summary.status, 'degraded');
        assert.equal(body.sections.weather_summary.data, null);
      }
    );
  });
});

test('an old stale row is still served honestly with real data and no fabricated empty', async () => {
  const oldIso = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const row = {
    snapshot_key: 'sumatra_mainland',
    schema_version: 1,
    computed_at: oldIso,
    payload: makePayload({ computedAt: oldIso, stale: true }),
  };
  await runWithFetch(async (input) => {
    if (String(input).includes('/rest/v1/public_dashboard_snapshots')) {
      return { ok: true, status: 200, json: async () => [row] };
    }
    throw new Error('backend fallback must not run when an (old) row exists');
  }, async (route) => {
    await withEnv(
      {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SUPABASE_URL: 'https://supa.example.com',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
      async () => {
        const res = await callGet(route);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('X-Public-Snapshot-State'), 'stale');
        // Stale-but-real is at least as cacheable as a fresh payload under SWR.
        const cc = res.headers.get('Cache-Control') ?? '';
        const maxAge = Number(/s-maxage=(\d+)/.exec(cc)?.[1] ?? NaN);
        assert.ok(Number.isFinite(maxAge) && maxAge >= 15, `stale s-maxage (${cc}) must be >= fresh`);
        const body = await res.json();
        assert.equal(body.computed_at, oldIso);
        assert.equal(body.stale, true);
        assert.equal(body.reason, undefined, 'empty-envelope reason must not leak onto a real row');
        assert.equal(body.sections.news.data.items.length, 1, 'real section data survives the age gate');
        assert.equal(body.sections.news.error, 'Budget sumber habis');
      }
    );
  });
});

test('zero rows falls back once and only once to the honest empty envelope', async () => {
  let backendCalls = 0;
  await runWithFetch(async (input) => {
    if (String(input).includes('/rest/v1/public_dashboard_snapshots')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    backendCalls += 1;
    throw new Error('backend unreachable');
  }, async (route) => {
    await withEnv(
      {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SUPABASE_URL: 'https://supa.example.com',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
      async () => {
        const res = await callGet(route);
        assert.equal(res.status, 200);
        assert.equal(backendCalls, 1, 'exactly one backend fallback attempt on zero rows');
        assert.equal(res.headers.get('X-Public-Snapshot-State'), 'degraded');
        const body = await res.json();
        assert.equal(body.reason, 'supabase_and_backend_unreachable');
        assert.equal(body.computed_at, null);
        assert.equal(body.stale, true);
        // The fabricated empty envelope stays an explicit last resort.
        assert.equal(body.sections.news.data.length, 0);
        // A transient empty answer must not blank guests at the edge for long.
        assert.match(res.headers.get('Cache-Control'), /s-maxage=5/);
      }
    );
  });
});

test('a row whose section is degraded with null data is served unblanked', async () => {
  const nowIso = new Date().toISOString();
  const row = {
    snapshot_key: 'sumatra_mainland',
    schema_version: 1,
    computed_at: nowIso,
    payload: makePayload({
      computedAt: nowIso,
      sectionOverrides: {
        weather_summary: { status: 'degraded', data: null, error: 'OpenMeteo habis' },
      },
    }),
  };
  await runWithFetch(async (input) => {
    if (String(input).includes('/rest/v1/public_dashboard_snapshots')) {
      return { ok: true, status: 200, json: async () => [row] };
    }
    throw new Error('backend fallback must not run when a row serves');
  }, async (route) => {
    await withEnv(
      {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SUPABASE_URL: 'https://supa.example.com',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
      async () => {
        const res = await callGet(route);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.sections.weather_summary.status, 'degraded', 'degraded status passes through untouched');
        assert.equal(body.sections.weather_summary.data, null);
        assert.equal(body.sections.weather_summary.error, 'OpenMeteo habis');
        assert.notEqual(body.reason, 'supabase_and_backend_unreachable');
        // The other sections in the same row still carry real data.
        assert.equal(body.sections.news.data.items.length, 1);
      }
    );
  });
});
