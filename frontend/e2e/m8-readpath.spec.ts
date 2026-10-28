import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * M8 phase 163b — dashboard read path (bootstrap snapshot + lazy sections).
 *
 * Read-only. It logs in through the real AuthModal with the DISPATCHER test
 * account (env only), then proves three things on a fresh `/dashboard` mount:
 *
 * 1. `GET /api/v1/dashboard/bootstrap` is called and the first data render
 *    follows it (one auth-aware read instead of the ~25-30 endpoint fan-out).
 * 2. The backend API request count is materially below the phase-160 baseline
 *    (DISPATCHER: 91 total requests / 28 to the API host, canonical run 08:48).
 * 3. Analitik / Laporan / Evaluasi do not fetch until their tab is clicked —
 *    they used to be mounted and CSS-hidden, so they fired on first paint.
 *
 * Skips (never fails) when `M8_DISPATCHER_EMAIL` / `M8_DISPATCHER_PASSWORD` are
 * absent. Nothing here writes business data.
 *
 * Measure against a production deployment or a production build
 * (`npm run build && npm start`): `next dev` double-invokes effects under React
 * StrictMode and would double every mount request, making the count meaningless.
 *
 * Run (from frontend/, against production or a live local stack):
 *   npx playwright test e2e/m8-readpath.spec.ts --config=playwright.m8.config.ts
 *
 *   # local dev server (needs M8_API_BASE_URL too if the API is not same-origin)
 *   $env:M8_BASE_URL='http://localhost:3000'
 *   npx playwright test e2e/m8-readpath.spec.ts --config=playwright.m8.config.ts
 */

const BASE_URL = process.env.M8_BASE_URL ?? 'https://pre-hub.vercel.app';

/** Phase-160 canonical run (08:48, DISPATCHER): 91 total / 28 to the API host. */
const BASELINE_TOTAL_REQUESTS = 91;
const BASELINE_API_REQUESTS = 28;

/** Targets: one bootstrap + auth/me + weather summary + HITL + fleet (+retries). */
const MAX_API_REQUESTS_FIRST_MOUNT = 15;

interface Credentials {
  email: string;
  password: string;
}

function dispatcherCredentials(): Credentials | null {
  const email = process.env.M8_DISPATCHER_EMAIL;
  const password = process.env.M8_DISPATCHER_PASSWORD;
  return email && password ? { email, password } : null;
}

/** Backend API traffic, host-agnostic (works for Render, proxy and localhost). */
function isApiRequest(request: Request): boolean {
  try {
    const { pathname } = new URL(request.url());
    return pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

const TAB_ONLY_PATTERNS: Record<'analytics' | 'reports' | 'evaluation', RegExp> = {
  // AnalyticsSection: commodities (prices/spikes) + BNPB + weather/fire tallies.
  analytics: /\/api\/v1\/(commodities\/|bnpb\/)/,
  // ReportsSection: approvals + source health.
  reports: /\/api\/v1\/(approvals|health\/sources)/,
  // EvaluationSection: benchmark / test matrix / corridor efficiency / outcomes.
  evaluation: /\/api\/v1\/(evaluation\/|outcomes)/,
};

type Recorder = {
  requests: Request[];
  apiRequests: () => Request[];
  stop: () => void;
};

function startRecorder(page: Page): Recorder {
  const requests: Request[] = [];
  const onRequest = (request: Request) => requests.push(request);
  page.on('request', onRequest);
  return {
    requests,
    apiRequests: () => requests.filter(isApiRequest),
    stop: () => page.off('request', onRequest),
  };
}

async function loginThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const badge = page.locator('#auth-persona-badge-btn');
  // Client-only dashboard chunk: a cold dev compile can exceed a minute.
  await expect(badge).toBeVisible({ timeout: 180000 });

  const closeBtn = page.locator('#close-auth-modal-btn');
  if (!(await closeBtn.isVisible().catch(() => false))) {
    await badge.click();
  }
  await expect(closeBtn).toBeVisible({ timeout: 30000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const submit = page.getByRole('button', { name: 'Masuk ke Dashboard' });
  await expect(submit).toBeEnabled({ timeout: 30000 });
  await submit.click();

  // Success = modal closed + JWT persisted (phase 161 applies it optimistically).
  await expect(closeBtn).toBeHidden({ timeout: 180000 });
  await page.waitForFunction(
    () => {
      const token = window.localStorage.getItem('prehub_auth_token');
      return typeof token === 'string' && token.split('.').length === 3;
    },
    undefined,
    { timeout: 60000, polling: 100 },
  );
  await expect(badge).toContainText('DISPATCHER', { timeout: 60000 });
}

/**
 * First meaningful data: the OSINT wire header reports an article count
 * (seeded by `sections.news`) or a world-truth hazard counter leaves "—"
 * (M9 freshness surface). Both are real backend values, not mount placeholders.
 */
async function waitForFirstDashboardData(page: Page, timeoutMs: number): Promise<string> {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? '';
      if (/Sumber Terverifikasi/.test(text)) return true;
      const counters = Array.from(document.querySelectorAll('[data-testid^="counter-"]'));
      if (
        counters.some((el) => {
          const value = (el.textContent ?? '').trim();
          return value.length > 0 && value !== '—';
        })
      ) {
        return true;
      }
      // The fleet modality pills are real backend values on the default map view
      // (e.g. "Semua 13", "Kapal 8", "Udara 5"). They remain visible when weather
      // or news sources are degraded, so they are a better first-data signal than
      // a section that is now lazy-mounted.
      return Array.from(document.querySelectorAll('button')).some((el) => {
        const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        return /^(Semua|Truk|Kapal|Udara)\s*[1-9]\d*/.test(label);
      });
    },
    undefined,
    { timeout: timeoutMs, polling: 200 },
  );

  const body = (await page.locator('body').innerText()).slice(0, 4000);
  if (/Sumber Terverifikasi/.test(body)) return 'news_verified_sources';

  const fleetText = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button')).find((button) => {
      const label = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
      return /^(Semua|Truk|Kapal|Udara)\s*[1-9]\d*/.test(label);
    });
    return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
  });
  if (fleetText) return `fleet_pill:${fleetText}`;

  const counters = await page.locator('[data-testid^="counter-"]').allInnerTexts();
  return `hazard_counter:${counters.join('|')}`;
}

test.describe('M8 phase 163b — dashboard bootstrap read path', () => {
  test('first mount uses the bootstrap snapshot and lazy-mounts the sections', async ({ page }) => {
    test.setTimeout(420000);

    const creds = dispatcherCredentials();
    test.skip(
      !creds,
      'M8_DISPATCHER_EMAIL / M8_DISPATCHER_PASSWORD not set — skipping the read-path measurement.',
    );

    await loginThroughUi(page, creds!.email, creds!.password);

    // ---- Fresh authenticated mount: count requests from navigation start -----
    const recorder = startRecorder(page);
    let bootstrapStatus: number | null = null;
    let bootstrapAtMs: number | null = null;
    const mountStart = Date.now();
    const onResponse = (response: import('@playwright/test').Response) => {
      if (!/\/api\/v1\/dashboard\/bootstrap/.test(response.url())) return;
      if (bootstrapStatus !== null) return;
      bootstrapStatus = response.status();
      bootstrapAtMs = Date.now() - mountStart;
    };
    page.on('response', onResponse);

    await page.goto(`${BASE_URL.replace(/\/$/, '')}/dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    });
    await expect(page.locator('#auth-persona-badge-btn')).toBeVisible({ timeout: 180000 });

    const firstDataSignal = await waitForFirstDashboardData(page, 180000);
    const firstDataMs = Date.now() - mountStart;

    recorder.stop();
    page.off('response', onResponse);

    const allRequests = [...recorder.requests];
    const apiRequests = allRequests.filter(isApiRequest);
    const bootstrapCalls = apiRequests.filter((r) =>
      /\/api\/v1\/dashboard\/bootstrap/.test(r.url()),
    ).length;
    const distinctApi = new Set(apiRequests.map((r) => r.url())).size;

    const summary = {
      base_url: BASE_URL,
      first_data_ms: firstDataMs,
      first_data_signal: firstDataSignal,
      bootstrap_status: bootstrapStatus,
      bootstrap_at_ms: bootstrapAtMs,
      bootstrap_calls: bootstrapCalls,
      total_requests: allRequests.length,
      api_requests: apiRequests.length,
      distinct_api_requests: distinctApi,
      baseline_total_requests: BASELINE_TOTAL_REQUESTS,
      baseline_api_requests: BASELINE_API_REQUESTS,
      api_urls: Array.from(new Set(apiRequests.map((r) => new URL(r.url()).pathname))).sort(),
    };
    test.info().annotations.push({
      type: 'm8-readpath',
      description: JSON.stringify(summary),
    });
    // eslint-disable-next-line no-console
    console.log(`[m8-readpath] ${JSON.stringify(summary)}`);

    // 1) The snapshot endpoint is the read path. Before the phase-165 deploy it
    // may be absent on the target, so the 200 is a hard gate only when
    // M8_REQUIRE_BOOTSTRAP=1; the call itself is always required.
    expect(bootstrapCalls, 'the bootstrap endpoint must be called on first mount').toBeGreaterThan(0);
    if (process.env.M8_REQUIRE_BOOTSTRAP === '1') {
      expect(bootstrapStatus, 'bootstrap must answer 200').toBe(200);
    } else if (bootstrapStatus !== 200) {
      test.info().annotations.push({
        type: 'bootstrap-soft',
        description: `status=${bootstrapStatus ?? 'no_response'} — endpoint not deployed on this target; phase 165 sets M8_REQUIRE_BOOTSTRAP=1`,
      });
    }
    expect(firstDataSignal).toBeTruthy();

    // 2) Materially below the phase-160 fan-out.
    expect(
      apiRequests.length,
      `API requests on first mount (baseline ${BASELINE_API_REQUESTS} to the API host)`,
    ).toBeLessThanOrEqual(MAX_API_REQUESTS_FIRST_MOUNT);
    expect(
      allRequests.length,
      `total requests on first mount (phase-160 baseline ${BASELINE_TOTAL_REQUESTS})`,
    ).toBeLessThan(BASELINE_TOTAL_REQUESTS);

    // 3) Lazy sections: nothing from Analitik / Laporan / Evaluasi before a click.
    const beforeTabs = recorder.apiRequests().filter((r) =>
      Object.values(TAB_ONLY_PATTERNS).some((pattern) => pattern.test(r.url())),
    );
    expect(
      beforeTabs.map((r) => new URL(r.url()).pathname),
      'section-only endpoints must not fire before their tab is opened',
    ).toEqual([]);

    for (const tab of ['analytics', 'reports', 'evaluation'] as const) {
      const navButton = page.locator(`#nav-${tab}`);
      await expect(navButton, `nav tab ${tab} must be enabled for DISPATCHER`).toBeEnabled({
        timeout: 30000,
      });

      const sectionRequest = page.waitForRequest(
        (request) => TAB_ONLY_PATTERNS[tab].test(request.url()),
        { timeout: 120000 },
      );
      await navButton.click();
      const fired = await sectionRequest;
      test.info().annotations.push({
        type: `lazy-${tab}`,
        description: new URL(fired.url()).pathname,
      });
    }

    // Switching back to the map keeps the dashboard usable (no full remount).
    await page.locator('#nav-map').click();
    await expect(page.locator('#nav-map')).toBeVisible();
  });
});
