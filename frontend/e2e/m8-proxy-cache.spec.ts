import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * M8 phase 164a — proxy cache isolation + open-proxy removal.
 *
 * The audit (F12 / M8 root cause #4) found `frontend/app/api/proxy/[...path]/route.ts`
 * marking every 200 GET `public, s-maxage=60`, authenticated ones included, so a
 * shared CDN could hand one tenant's payload to another request. Phase 161's
 * `private, no-store` on `/dashboard/bootstrap` was overwritten by the proxy.
 *
 * This spec exercises the real Next route handler over HTTP and pins the matrix:
 *
 *   A. anonymous GET, allowlisted path        -> publicly cacheable (`s-maxage`)
 *   B. authenticated GET, allowlisted path    -> `private, no-store` (auth wins)
 *   C. authenticated GET, tenant path         -> `private, no-store`
 *   D. anonymous GET, tenant path             -> never public (default deny)
 *   E. cookie-only auth (`prehub_auth_token`) -> `private, no-store`
 *   F. non-GET                                -> `no-store`
 *   G. forged `x-target-base-url`             -> ignored in production (400 in dev)
 *
 * The handler cannot be imported in isolation (it depends on next/server + the
 * `@/lib/baseUrl` alias), so it is exercised through a built server:
 *
 *   cd frontend
 *   npm run build
 *   # terminal 1: any upstream that answers the two paths below
 *   # terminal 2 (production mode: forged target must be ignored)
 *   $env:API_PROXY_TARGET='http://localhost:8000'; npm start
 *   $env:M8_BASE_URL='http://localhost:3000'
 *   npx playwright test e2e/m8-proxy-cache.spec.ts --config=playwright.m8.config.ts
 *
 * Against `next dev` (NODE_ENV=development) also set `M8_PROXY_MODE=dev` so case G
 * asserts the 400 instead of "header ignored".
 *
 * The spec skips (never fails, never fabricates a pass) when the target is
 * unreachable or the proxy cannot reach its upstream. A target running the
 * pre-164a handler fails cases B–E — that is the intended post-deploy gate.
 */

const BASE_URL = (process.env.M8_BASE_URL ?? 'https://pre-hub.vercel.app').replace(/\/$/, '');
const PROXY_BASE = `${BASE_URL}/api/proxy`;
const PROXY_MODE = process.env.M8_PROXY_MODE === 'dev' ? 'dev' : 'production';

/** Allowlisted, tenant-free paths (must match ANONYMOUS_PUBLIC_CACHE_PATHS). */
const PUBLIC_PATH = '/api/v1/health';
/** A representative tenant path: fleet is scoped to the caller's company claim. */
const TENANT_PATH = '/api/v1/fleet/vehicles';

let proxyReachable = false;
let upstreamReachable = false;
let skipReason = '';

function cacheControl(res: APIResponse): string {
  return (res.headers()['cache-control'] ?? '').toLowerCase();
}

/** The one invariant that must hold for every non-public case. */
function expectNotPubliclyCacheable(header: string, label: string): void {
  expect(header, `${label} must not be publicly cacheable`).not.toContain('public');
  expect(header, `${label} must not carry a shared-cache lifetime`).not.toContain('s-maxage');
  expect(header, `${label} must disable caching`).toContain('no-store');
}

async function get(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string> = {},
): Promise<APIResponse> {
  return request.get(`${PROXY_BASE}${path}`, { headers, maxRedirects: 0, failOnStatusCode: false });
}

test.describe('M8 phase 164a — proxy cache isolation', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const health = await get(request, PUBLIC_PATH);
      proxyReachable = true;
      // The proxy answers 502 when it cannot reach its upstream. Cache headers
      // are still asserted for the private cases, but the "anonymous allowlist
      // is publicly cacheable" case needs a real 200 from upstream.
      upstreamReachable = health.status() === 200;
      if (!upstreamReachable) {
        skipReason = `proxy answered ${health.status()} (upstream unavailable) — start the backend/stub and re-run`;
      }
    } catch (err) {
      proxyReachable = false;
      skipReason = `target ${BASE_URL} unreachable: ${(err as Error).message}`;
    }
  });

  test.beforeEach(() => {
    test.skip(!proxyReachable, skipReason || `target ${BASE_URL} unreachable`);
  });

  test('A. anonymous GET to an allowlisted path may be publicly cached', async ({ request }) => {
    test.skip(!upstreamReachable, skipReason);

    const res = await get(request, PUBLIC_PATH);
    expect(res.status(), 'health is a constant dict; a 200 is the allowlist precondition').toBe(200);

    const header = cacheControl(res);
    expect(header).toContain('public');
    expect(header).toContain('s-maxage=60');
    expect(header).toContain('stale-while-revalidate=120');
    // Anonymous allowlist entries must still be keyed away from credentialed hits.
    expect((res.headers()['vary'] ?? '').toLowerCase()).toContain('authorization');
  });

  test('B. authenticated GET to the allowlisted path is private', async ({ request }) => {
    const res = await get(request, PUBLIC_PATH, { authorization: 'Bearer m8-proxy-test-token' });

    expectNotPubliclyCacheable(cacheControl(res), 'authenticated allowlisted GET');
    expect(cacheControl(res)).toContain('private');
  });

  test('C. authenticated GET to a tenant path is private, no-store', async ({ request }) => {
    const res = await get(request, TENANT_PATH, {
      authorization: 'Bearer m8-proxy-test-token',
    });

    const header = cacheControl(res);
    expectNotPubliclyCacheable(header, 'authenticated tenant GET');
    expect(header).toContain('private');
  });

  test('D. anonymous GET to a non-allowlisted path is never publicly cached', async ({ request }) => {
    const res = await get(request, TENANT_PATH);

    expectNotPubliclyCacheable(cacheControl(res), 'anonymous non-allowlisted GET');
  });

  test('E. the prehub_auth_token cookie alone forces private, no-store', async ({ request }) => {
    const res = await get(request, TENANT_PATH, {
      cookie: 'prehub_auth_token=header.payload.signature',
    });

    const header = cacheControl(res);
    expectNotPubliclyCacheable(header, 'cookie-authenticated GET');
    expect(header).toContain('private');
  });

  test('F. non-GET responses are never cached', async ({ request }) => {
    const res = await request.post(`${PROXY_BASE}${TENANT_PATH}`, {
      headers: { authorization: 'Bearer m8-proxy-test-token' },
      data: {},
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    expectNotPubliclyCacheable(cacheControl(res), 'POST');
  });

  test('G. a client-supplied x-target-base-url cannot redirect the upstream', async ({ request }) => {
    // A link-local address is a classic SSRF/open-proxy probe. Under a production
    // server the header must be ignored entirely; under `next dev` it must 400.
    const forged = { 'x-target-base-url': 'http://169.254.169.254' };

    if (PROXY_MODE === 'dev') {
      const res = await get(request, PUBLIC_PATH, forged);
      expect(res.status(), 'dev-only upstream overrides outside the loopback allowlist are rejected').toBe(400);
      expectNotPubliclyCacheable(cacheControl(res), 'rejected dev target');
      return;
    }

    test.skip(!upstreamReachable, skipReason);
    const res = await get(request, PUBLIC_PATH, forged);
    expect(res.status(), 'the forged target must not be contacted (it would fail → 502)').toBe(200);

    // Optional: when the documented local run uses the stub upstream, prove the
    // body came from the server-configured target and not from the forged one.
    const expectedMarker = process.env.M8_PROXY_STUB_MARKER;
    if (expectedMarker) {
      const body = (await res.json()) as { service?: string };
      expect(body.service, 'the response must come from the configured upstream').toBe(expectedMarker);
    }
  });
});
