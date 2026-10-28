import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * M8 Phase 160 — production baseline harness.
 *
 * Read-only: it logs in through the real AuthModal, records token claims, counts
 * first-mount network fan-out, and verifies the session survives a reload. It
 * never submits an approval, commits a route, or writes business data.
 *
 * Credentials come from env (M8_<ROLE>_EMAIL / M8_<ROLE>_PASSWORD) and are never
 * written to source or to the artifacts. Full JWTs and passwords are never
 * logged: only decoded claims, token length, and redacted error text.
 *
 * Run:
 *   npx playwright test e2e/m8-baseline.spec.ts --config=playwright.m8.config.ts
 *
 * See e2e/m8/README.md for the full env matrix.
 */

const BASE_URL = process.env.M8_BASE_URL ?? 'https://pre-hub.vercel.app';
const ARTIFACT_DIR =
  process.env.M8_ARTIFACT_DIR ??
  path.resolve(__dirname, '../../.planning/phases/160-baseline-audit-state-repair/artifacts');

const ROLE_ORDER = ['DISPATCHER', 'REGULATOR', 'GUEST'] as const;
type AccountKey = (typeof ROLE_ORDER)[number];

const EXPECTED_COMPANY: Record<AccountKey, string> = {
  DISPATCHER: 'pos_logistik',
  REGULATOR: 'bapanas',
  GUEST: 'demo_sandbox',
};

interface JwtClaims {
  exp: number;
  iat: number;
  sub?: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string; provider?: string };
  user_metadata?: { role?: string; company_id?: string };
  [key: string]: unknown;
}

interface UrlBucket {
  url: string;
  method: string;
  resourceType: string;
  count: number;
}

interface AccountBaseline {
  account: AccountKey;
  email_masked: string;
  expected_company_id: string;
  started_at: string;
  login_ms: number | null;
  login_signal: string | null;
  login_error: string | null;
  login_breakdown_ms: {
    supabase_signin: number | null;
    backend_auth_me: number | null;
  };
  supabase_auth_responses: Array<Record<string, unknown>>;
  token: {
    present: boolean;
    length: number;
    exp: number | null;
    iat: number | null;
    lifetime_s: number | null;
    exp_iso: string | null;
    iat_iso: string | null;
    role_claim_app_metadata: string | null;
    role_claim_user_metadata: string | null;
    company_id_claim: string | null;
    email_claim: string | null;
    role_matches_expected: boolean | null;
    company_matches_expected: boolean | null;
  };
  dashboard: {
    ready_ms: number | null;
    first_data_ms: number | null;
    first_data_signal: string | null;
    signal_fallback_used: boolean;
    request_total: number;
    request_distinct: number;
    requests_by_host: Record<string, number>;
    top_urls: UrlBucket[];
  };
  session: {
    post_login_url: string | null;
    post_login_guest_param_present: boolean | null;
    guest_flag_cleared_by_app: boolean | null;
    clean_nav_url: string | null;
    clean_nav_guest_param_present: boolean | null;
    auth_restore_ms: number | null;
    auth_me_status: number | null;
    role_badge_text: string | null;
    guest_banner_visible: boolean | null;
    token_present_after_restore: boolean | null;
    same_subject_after_restore: boolean | null;
    exp_after_restore: number | null;
    survived_clean_nav: boolean | null;
    reload_url: string | null;
    reload_guest_param_present: boolean | null;
    reload_restored_ms: number | null;
    survived_reload: boolean | null;
  };
  page_errors: string[];
  console_errors: string[];
  notes: string[];
}

const RESULTS: AccountBaseline[] = [];
const RUN_STARTED_AT = new Date();

function secretValues(): string[] {
  const out: string[] = [];
  for (const role of ROLE_ORDER) {
    const pw = process.env[`M8_${role}_PASSWORD`];
    if (pw) out.push(pw);
  }
  return out;
}

/** Redacts JWTs and any known test password from captured text. */
function redact(input: string): string {
  let out = input;
  for (const secret of secretValues()) {
    if (secret && secret.length >= 3) {
      out = out.split(secret).join('[redacted]');
    }
  }
  out = out.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-jwt]');
  out = out.replace(/([?&](?:access_token|apikey|api_key|token)=)[^&]+/gi, '$1[redacted]');
  return out.slice(0, 500);
}

function decodeJwt(token: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('token is not a three-part JWT');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload) as JwtClaims;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const head = local.slice(0, Math.min(3, local.length));
  return `${head}${'*'.repeat(Math.max(2, local.length - head.length))}@${domain}`;
}

function accountEnv(role: AccountKey): { email: string; password: string } | null {
  const email = process.env[`M8_${role}_EMAIL`];
  const password = process.env[`M8_${role}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

function selectedAccounts(): AccountKey[] {
  const raw = process.env.M8_ACCOUNTS;
  if (!raw) return [...ROLE_ORDER];
  const wanted = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => (ROLE_ORDER as readonly string[]).includes(s));
  return ROLE_ORDER.filter((r) => wanted.includes(r));
}

/** Optional Fast-4G emulation (Chromium only) for the first-data measurement. */
async function applyThrottle(page: Page): Promise<void> {
  if (process.env.M8_THROTTLE !== 'fast4g') return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
    uploadThroughput: Math.round((750 * 1024) / 8),
  });
}

type RequestRecorder = {
  stop: () => void;
  snapshot: () => AccountBaseline['dashboard'];
};

function startRequestRecorder(page: Page, startedAt: number): RequestRecorder {
  const entries: Array<{ url: string; method: string; resourceType: string }> = [];
  const onRequest = (req: import('@playwright/test').Request) => {
    entries.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
    });
  };
  page.on('request', onRequest);
  return {
    stop: () => page.off('request', onRequest),
    snapshot: () => {
      const byUrl = new Map<string, UrlBucket>();
      const byHost: Record<string, number> = {};
      for (const entry of entries) {
        const key = `${entry.method} ${entry.url}`;
        const existing = byUrl.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          byUrl.set(key, { ...entry, count: 1 });
        }
        let host = 'unknown';
        try {
          const parsed = new URL(entry.url);
          host = parsed.host || parsed.protocol.replace(':', '') || 'unknown';
        } catch {
          /* keep unknown */
        }
        byHost[host] = (byHost[host] ?? 0) + 1;
      }
      const top = Array.from(byUrl.values())
        .sort((a, b) => b.count - a.count || a.url.localeCompare(b.url))
        .slice(0, 15)
        .map((b) => ({ ...b, url: redact(b.url) }));
      return {
        ready_ms: null,
        first_data_ms: Math.max(0, Date.now() - startedAt),
        first_data_signal: null,
        signal_fallback_used: false,
        request_total: entries.length,
        request_distinct: byUrl.size,
        requests_by_host: byHost,
        top_urls: top,
      };
    },
  };
}

/**
 * Waits for a data-driven dashboard signal. Primary: the news wire reports a
 * verified-source count ("N Sumber Terverifikasi"). Fallback: the Mapbox canvas
 * is painted. Returns the signal that fired.
 */
async function waitForDashboardData(
  page: Page,
  timeoutMs: number,
): Promise<{ signal: string; fallback: boolean }> {
  try {
    await page.waitForFunction(
      () => /Sumber Terverifikasi/.test(document.body?.innerText ?? ''),
      undefined,
      { timeout: timeoutMs, polling: 250 },
    );
    return { signal: 'news_verified_sources', fallback: false };
  } catch {
    await page.locator('.mapboxgl-canvas').first().waitFor({ state: 'visible', timeout: 15000 });
    return { signal: 'mapbox_canvas_fallback', fallback: true };
  }
}

/**
 * Waits until a fresh mount has re-verified the session: the stored JWT is
 * present, /auth/me answered 200, and the role badge shows the expected role.
 */
async function waitForAuthRestore(
  page: Page,
  expectedRole: AccountKey,
  authMeStatuses: number[],
  timeoutMs: number,
): Promise<{ ms: number; badge: string; url: string; authMeStatus: number | null } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page
      .evaluate(() => {
        const token = window.localStorage.getItem('prehub_auth_token');
        const badge = (document.querySelector('#auth-persona-badge-btn')?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        return { hasToken: typeof token === 'string' && token.split('.').length === 3, badge, url: location.href };
      })
      .catch(() => null);
    const meStatus = authMeStatuses.length > 0 ? authMeStatuses[authMeStatuses.length - 1] : null;
    if (state && state.hasToken && meStatus === 200 && state.badge.toUpperCase().includes(expectedRole)) {
      return { ms: Date.now() - start, badge: state.badge, url: state.url, authMeStatus: meStatus };
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function openAuthModal(page: Page): Promise<void> {
  const closeBtn = page.locator('#close-auth-modal-btn');
  if (await closeBtn.isVisible().catch(() => false)) return;
  await page.locator('#auth-persona-badge-btn').click();
  await expect(closeBtn).toBeVisible({ timeout: 20000 });
}

async function loginThroughUi(
  page: Page,
  email: string,
  password: string,
): Promise<{
  loginMs: number;
  signal: string;
  error: string | null;
  supabaseSigninMs: number | null;
  authMeMs: number | null;
}> {
  await openAuthModal(page);

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const submit = page.getByRole('button', { name: 'Masuk ke Dashboard' });
  await expect(submit).toBeEnabled({ timeout: 15000 });

  // Split the login into its two network legs so the baseline shows whether the
  // cost is Supabase sign-in or the backend profile fetch.
  let t0 = 0;
  let supabaseSigninMs: number | null = null;
  let authMeMs: number | null = null;
  const onResponse = (res: import('@playwright/test').Response) => {
    if (t0 === 0) return;
    if (/\/auth\/v1\/token/.test(res.url()) && supabaseSigninMs === null) {
      supabaseSigninMs = Date.now() - t0;
    }
    if (/\/api\/v1\/auth\/(me|session)/.test(res.url()) && authMeMs === null) {
      authMeMs = Date.now() - t0;
    }
  };
  page.on('response', onResponse);

  t0 = Date.now();
  await submit.click();

  // Success = the modal unmounts AND the app has persisted a JWT for /auth/me
  // reconciliation. Any visible error alert ends the wait with its exact text.
  // The error locator is scoped to the modal status block: the dashboard behind
  // the dialog also renders red text (age badges), which must never be mistaken
  // for a login error.
  const modalError = page.locator('div.mx-6.mt-4.text-red-300 span').first();
  let errorText: string | null = null;
  let success = false;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const modalOpen = await page.locator('#close-auth-modal-btn').isVisible().catch(() => false);
    if (!modalOpen) {
      success = true;
      break;
    }
    if (await modalError.isVisible().catch(() => false)) {
      errorText = await modalError.innerText({ timeout: 2000 }).catch(() => null);
      if (errorText) break;
    }
    await page.waitForTimeout(100);
  }
  const loginMs = Date.now() - t0;
  page.off('response', onResponse);

  if (!success) {
    return {
      loginMs,
      signal: 'failed',
      error: redact(errorText ?? 'auth modal stayed open with no visible error text'),
      supabaseSigninMs,
      authMeMs,
    };
  }

  await page.waitForFunction(
    () => {
      const token = window.localStorage.getItem('prehub_auth_token');
      return typeof token === 'string' && token.split('.').length === 3;
    },
    undefined,
    { timeout: 30000, polling: 100 },
  );

  return {
    loginMs,
    signal: 'auth_modal_closed_and_token_persisted',
    error: null,
    supabaseSigninMs,
    authMeMs,
  };
}

interface CaptureOptions {
  account: AccountKey;
  email: string;
  password: string;
}

async function captureAccountBaseline(page: Page, opts: CaptureOptions): Promise<AccountBaseline> {
  const result: AccountBaseline = {
    account: opts.account,
    email_masked: maskEmail(opts.email),
    expected_company_id: EXPECTED_COMPANY[opts.account],
    started_at: new Date().toISOString(),
    login_ms: null,
    login_signal: null,
    login_error: null,
    login_breakdown_ms: { supabase_signin: null, backend_auth_me: null },
    supabase_auth_responses: [],
    token: {
      present: false,
      length: 0,
      exp: null,
      iat: null,
      lifetime_s: null,
      exp_iso: null,
      iat_iso: null,
      role_claim_app_metadata: null,
      role_claim_user_metadata: null,
      company_id_claim: null,
      email_claim: null,
      role_matches_expected: null,
      company_matches_expected: null,
    },
    dashboard: {
      ready_ms: null,
      first_data_ms: null,
      first_data_signal: null,
      signal_fallback_used: false,
      request_total: 0,
      request_distinct: 0,
      requests_by_host: {},
      top_urls: [],
    },
    session: {
      post_login_url: null,
      post_login_guest_param_present: null,
      guest_flag_cleared_by_app: null,
      clean_nav_url: null,
      clean_nav_guest_param_present: null,
      auth_restore_ms: null,
      auth_me_status: null,
      role_badge_text: null,
      guest_banner_visible: null,
      token_present_after_restore: null,
      same_subject_after_restore: null,
      exp_after_restore: null,
      survived_clean_nav: null,
      reload_url: null,
      reload_guest_param_present: null,
      reload_restored_ms: null,
      survived_reload: null,
    },
    page_errors: [],
    console_errors: [],
    notes: [],
  };

  page.on('pageerror', (err) => {
    if (result.page_errors.length < 10) result.page_errors.push(redact(err.message));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && result.console_errors.length < 10) {
      result.console_errors.push(redact(msg.text()));
    }
  });
  page.on('response', async (res) => {
    if (!/\/auth\/v1\/token/.test(res.url())) return;
    const body = await res.json().catch(() => null);
    result.supabase_auth_responses.push({
      status: res.status(),
      error: body?.error ?? null,
      error_code: body?.error_code ?? null,
      msg: body?.msg ?? null,
      error_description: body?.error_description ?? null,
    });
  });

  // /auth/me is the app's own session verification. Its status is the honest
  // "authenticated, not downgraded" signal after a fresh mount.
  const authMeStatuses: number[] = [];
  page.on('response', (res) => {
    if (/\/api\/v1\/auth\/(me|session)/.test(res.url())) {
      authMeStatuses.push(res.status());
    }
  });

  await applyThrottle(page);

  // 1) Cold entry to /dashboard. Unauthenticated visits are degraded to ?guest=1.
  const navStart = Date.now();
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 150000 });
  await expect(page.locator('#auth-persona-badge-btn')).toBeVisible({ timeout: 150000 });
  result.dashboard.ready_ms = Date.now() - navStart;
  result.notes.push(`initial_url=${redact(page.url())}`);

  // 2) Login through the real AuthModal (submit → authenticated dashboard).
  const login = await loginThroughUi(page, opts.email, opts.password);
  result.login_ms = login.loginMs;
  result.login_signal = login.signal;
  result.login_error = login.error;
  result.login_breakdown_ms = {
    supabase_signin: login.supabaseSigninMs,
    backend_auth_me: login.authMeMs,
  };
  if (login.error) {
    RESULTS.push(result);
    throw new Error(
      `[${opts.account}] login failed after ${login.loginMs}ms: ${login.error} | supabase=${JSON.stringify(
        result.supabase_auth_responses,
      )}`,
    );
  }

  const roleBadge = page.locator('#auth-persona-badge-btn');
  await expect(roleBadge).toContainText(opts.account, { timeout: 30000 });

  // 3) Token claims (never the token itself).
  const token = await page.evaluate(() => window.localStorage.getItem('prehub_auth_token'));
  if (!token) throw new Error(`[${opts.account}] no prehub_auth_token after login`);
  const claims = decodeJwt(token);
  const tokenRoleApp = claims.app_metadata?.role ?? null;
  const tokenRoleUser = claims.user_metadata?.role ?? null;
  const tokenCompany = claims.user_metadata?.company_id ?? null;
  result.token = {
    present: true,
    length: token.length,
    exp: claims.exp ?? null,
    iat: claims.iat ?? null,
    lifetime_s: claims.exp && claims.iat ? claims.exp - claims.iat : null,
    exp_iso: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
    iat_iso: claims.iat ? new Date(claims.iat * 1000).toISOString() : null,
    role_claim_app_metadata: tokenRoleApp,
    role_claim_user_metadata: tokenRoleUser,
    company_id_claim: tokenCompany,
    email_claim: claims.email ? maskEmail(claims.email) : null,
    role_matches_expected: (tokenRoleApp ?? tokenRoleUser) === opts.account,
    company_matches_expected: tokenCompany === EXPECTED_COMPANY[opts.account],
  };
  if (!result.token.role_matches_expected) {
    result.notes.push(
      `role claim mismatch: expected ${opts.account}, app_metadata=${tokenRoleApp}, user_metadata=${tokenRoleUser}`,
    );
  }
  if (!result.token.company_matches_expected) {
    result.notes.push(
      `company_id claim mismatch: expected ${EXPECTED_COMPANY[opts.account]}, got ${tokenCompany}`,
    );
  }
  if (tokenRoleUser === null) {
    result.notes.push('user_metadata.role is absent; role only present in app_metadata.role');
  }

  // 4) Post-login state: the middleware's ?guest=1 flag should be cleared.
  const postLoginUrl = page.url();
  const postLoginGuestParam = new URL(postLoginUrl).searchParams.get('guest');
  result.session.post_login_url = redact(postLoginUrl);
  result.session.post_login_guest_param_present = postLoginGuestParam !== null;
  result.session.guest_flag_cleared_by_app = postLoginGuestParam === null;
  if (postLoginGuestParam !== null) {
    result.notes.push(
      'post-login URL still carries guest=1; the app did not clear the middleware guest flag after login',
    );
  }

  // 5) Fresh mount with an existing session on the canonical URL: count the
  //    first-mount fan-out and measure time to first data. The clean URL is
  //    required because middleware treats ?guest=1 as an allowed guest visit,
  //    which would bypass the cookie check this step is meant to exercise.
  authMeStatuses.length = 0;
  const recorder = startRequestRecorder(page, Date.now());
  const mountStart = Date.now();
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'commit', timeout: 150000 });
  await expect(page.locator('#auth-persona-badge-btn')).toBeVisible({ timeout: 150000 });

  const dataSignal = await waitForDashboardData(page, 120000);
  const firstDataMs = Date.now() - mountStart;
  const dashboardSnapshot = recorder.snapshot();
  recorder.stop();

  result.dashboard = {
    ...dashboardSnapshot,
    ready_ms: null,
    first_data_ms: firstDataMs,
    first_data_signal: dataSignal.signal,
    signal_fallback_used: dataSignal.fallback,
  };

  // 6) Session survival on the clean navigation: no guest downgrade, role
  //    restored, /auth/me 200, and the same JWT subject.
  const restore = await waitForAuthRestore(page, opts.account, authMeStatuses, 120000);
  const cleanNavUrl = page.url();
  const cleanNavGuestParam = new URL(cleanNavUrl).searchParams.get('guest');
  const guestBannerVisible = await page
    .locator('#guest-evaluation-banner')
    .isVisible()
    .catch(() => false);
  const tokenAfterRestore = await page.evaluate(() => window.localStorage.getItem('prehub_auth_token'));

  let sameSubject: boolean | null = null;
  let expAfterRestore: number | null = null;
  if (tokenAfterRestore) {
    const claimsAfter = decodeJwt(tokenAfterRestore);
    sameSubject = Boolean(claimsAfter.sub) && claimsAfter.sub === claims.sub;
    expAfterRestore = claimsAfter.exp ?? null;
  }

  const survivedCleanNav =
    restore !== null &&
    cleanNavGuestParam === null &&
    tokenAfterRestore !== null &&
    sameSubject !== false &&
    guestBannerVisible === false;

  result.session.clean_nav_url = redact(cleanNavUrl);
  result.session.clean_nav_guest_param_present = cleanNavGuestParam !== null;
  result.session.auth_restore_ms = restore?.ms ?? null;
  result.session.auth_me_status = restore?.authMeStatus ?? null;
  result.session.role_badge_text = redact(restore?.badge ?? '');
  result.session.guest_banner_visible = guestBannerVisible;
  result.session.token_present_after_restore = tokenAfterRestore !== null;
  result.session.same_subject_after_restore = sameSubject;
  result.session.exp_after_restore = expAfterRestore;
  result.session.survived_clean_nav = survivedCleanNav;

  if (!survivedCleanNav) {
    result.notes.push(
      `clean-navigation session check failed: restore=${restore ? 'ok' : 'timed out'}, guest_param=${
        cleanNavGuestParam ?? 'none'
      }, banner=${guestBannerVisible}, me=${result.session.auth_me_status ?? 'none'}`,
    );
  }

  // 7) Literal reload check of the now-clean URL.
  authMeStatuses.length = 0;
  const reloadStart = Date.now();
  await page.reload({ waitUntil: 'commit', timeout: 150000 });
  await expect(page.locator('#auth-persona-badge-btn')).toBeVisible({ timeout: 150000 });
  const reloadRestore = await waitForAuthRestore(page, opts.account, authMeStatuses, 120000);
  const reloadUrl = page.url();
  const reloadGuestParam = new URL(reloadUrl).searchParams.get('guest');
  const reloadToken = await page.evaluate(() => window.localStorage.getItem('prehub_auth_token'));
  const survivedReload =
    reloadRestore !== null && reloadGuestParam === null && reloadToken !== null;

  result.session.reload_url = redact(reloadUrl);
  result.session.reload_guest_param_present = reloadGuestParam !== null;
  result.session.reload_restored_ms = reloadRestore?.ms ?? null;
  result.session.survived_reload = survivedReload;
  result.notes.push(`reload_total_ms=${Date.now() - reloadStart}`);

  RESULTS.push(result);

  expect(result.token.exp, 'token must carry exp').toBeGreaterThan(0);
  expect(result.login_ms, 'login duration must be measured').toBeGreaterThan(0);
  expect(result.dashboard.request_total, 'first-mount request count must be > 0').toBeGreaterThan(0);
  expect(result.dashboard.first_data_signal, 'a dashboard data signal must fire').toBeTruthy();
  expect(
    result.session.survived_clean_nav,
    'session must survive a clean /dashboard mount without a guest downgrade',
  ).toBe(true);
  expect(
    result.session.survived_reload,
    'session must survive a page reload without a guest downgrade',
  ).toBe(true);

  return result;
}

for (const role of selectedAccounts()) {
  test(`baseline — ${role} login, token claims, first-mount fan-out, session survival`, async ({
    page,
  }) => {
    test.setTimeout(600000);

    const creds = accountEnv(role);
    if (!creds) {
      test.skip(
        true,
        `M8_${role}_EMAIL / M8_${role}_PASSWORD not set — skipping ${role} baseline capture.`,
      );
      return;
    }

    await captureAccountBaseline(page, { account: role, email: creds.email, password: creds.password });
  });
}

test.afterAll(() => {
  if (RESULTS.length === 0) return;
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const stamp = RUN_STARTED_AT.toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(ARTIFACT_DIR, `m8-baseline-${stamp}.json`);
  const mdPath = path.join(ARTIFACT_DIR, `m8-baseline-${stamp}.md`);

  const payload = {
    run_started_at: RUN_STARTED_AT.toISOString(),
    run_finished_at: new Date().toISOString(),
    base_url: BASE_URL,
    throttle: process.env.M8_THROTTLE ?? 'off',
    accounts: RESULTS,
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const rows = RESULTS.map((r) => {
    const s = r.session;
    return [
      `| ${r.account} | ${r.login_ms ?? 'n/a'} ms (${
        r.login_breakdown_ms.supabase_signin ?? 'n/a'
      } + ${r.login_breakdown_ms.backend_auth_me ?? 'n/a'}) | ${r.dashboard.first_data_ms ?? 'n/a'} ms (${
        r.dashboard.first_data_signal ?? 'n/a'
      }) | ${r.dashboard.request_total} (${r.dashboard.request_distinct} distinct) | ${
        r.token.exp ?? 'n/a'
      } / ${r.token.iat ?? 'n/a'} (${r.token.lifetime_s ?? 'n/a'}s) | ${
        r.token.role_claim_app_metadata ?? 'n/a'
      } / ${r.token.company_id_claim ?? 'n/a'} | ${s.survived_clean_nav ? 'yes' : 'no'} | ${
        s.survived_reload ? 'yes' : 'no'
      } | ${s.guest_flag_cleared_by_app ? 'yes' : 'no'} |`,
    ].join('');
  });

  const md = [
    '# M8 baseline — harness artifact',
    '',
    `- Run started: ${payload.run_started_at}`,
    `- Run finished: ${payload.run_finished_at}`,
    `- Base URL: ${payload.base_url}`,
    `- Throttle: ${payload.throttle}`,
    '',
    '| Account | Login (supabase + /auth/me) | First data | Requests | exp / iat (lifetime) | role / company | Session (clean mount) | Session (reload) | ?guest=1 cleared after login |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    'Full machine-readable detail (including top-15 request URLs):',
    `- \`${path.basename(jsonPath)}\``,
    '',
  ].join('\n');
  fs.writeFileSync(mdPath, md, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`[m8-baseline] artifacts written:\n  ${jsonPath}\n  ${mdPath}`);
});
