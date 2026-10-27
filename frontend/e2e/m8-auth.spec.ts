import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * M8 phase 161 — auth session durability.
 *
 * Verifies the client-side half of the phase contract against a real deployment
 * or a local dev server:
 *
 * 1. The mirrored `prehub_auth_token` cookie is a ~7-day sliding cookie, Secure
 *    on HTTPS (it must outlive the ~1h Supabase access token).
 * 2. A stale/garbage app token (localStorage + cookie) is recovered from the
 *    Supabase session on reload — the app re-applies a valid token instead of
 *    silently becoming a guest or bouncing to `?guest=1`.
 * 3. Logout in one tab clears the session in another tab.
 *
 * Credentials come from env only (`M8_<ROLE>_EMAIL` / `M8_<ROLE>_PASSWORD`), and
 * nothing here writes business data. When no account env is present every test
 * is skipped, not failed.
 *
 * Run (from frontend/):
 *   npx playwright test e2e/m8-auth.spec.ts --config=playwright.m8.config.ts
 *
 * Local dev server:
 *   $env:M8_BASE_URL='http://localhost:3000'
 *   npx playwright test e2e/m8-auth.spec.ts --config=playwright.m8.config.ts
 */

const BASE_URL = process.env.M8_BASE_URL ?? 'https://pre-hub.vercel.app';
const IS_HTTPS = BASE_URL.startsWith('https://');
const COOKIE_NAME = 'prehub_auth_token';
const SEVEN_DAYS_SECONDS = 604800;
const INVALID_TOKEN = 'invalid.token.value';

interface Credentials {
  role: 'DISPATCHER' | 'REGULATOR' | 'GUEST';
  email: string;
  password: string;
}

/** First configured account wins; the assertions are role-agnostic. */
function accountCredentials(): Credentials | null {
  const candidates: Array<{ role: Credentials['role']; email?: string; password?: string }> = [
    { role: 'DISPATCHER', email: process.env.M8_DISPATCHER_EMAIL, password: process.env.M8_DISPATCHER_PASSWORD },
    { role: 'GUEST', email: process.env.M8_GUEST_EMAIL, password: process.env.M8_GUEST_PASSWORD },
    { role: 'REGULATOR', email: process.env.M8_REGULATOR_EMAIL, password: process.env.M8_REGULATOR_PASSWORD },
  ];
  const found = candidates.find((c) => c.email && c.password);
  return found ? { role: found.role, email: found.email as string, password: found.password as string } : null;
}

interface JwtClaims {
  sub?: string;
  email?: string;
  exp?: number;
  app_metadata?: { role?: string };
  user_metadata?: { role?: string; company_id?: string };
}

function decodeJwt(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JwtClaims;
  } catch {
    return null;
  }
}

function isJwt(value: string | null): boolean {
  return typeof value === 'string' && value.split('.').length === 3 && decodeJwt(value) !== null;
}

async function authCookie(context: BrowserContext) {
  const cookies = await context.cookies(BASE_URL);
  return cookies.find((c) => c.name === COOKIE_NAME) ?? null;
}

async function readAppToken(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('prehub_auth_token'));
}

async function openAuthModal(page: Page): Promise<void> {
  const closeBtn = page.locator('#close-auth-modal-btn');
  if (await closeBtn.isVisible().catch(() => false)) return;
  await page.locator('#auth-persona-badge-btn').click();
  await expect(closeBtn).toBeVisible({ timeout: 30000 });
}

async function loginThroughUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const badge = page.locator('#auth-persona-badge-btn');
  // The dashboard chunk is client-only; a cold dev server can take well over a
  // minute to compile + hydrate. Keep this generous so the gate tests auth, not
  // the dev server's first compile.
  await expect(badge).toBeVisible({ timeout: 180000 });

  await openAuthModal(page);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const submit = page.getByRole('button', { name: 'Masuk ke Dashboard' });
  await expect(submit).toBeEnabled({ timeout: 30000 });
  await submit.click();

  // Success = the modal closed and a JWT was persisted. Phase 161 applies the
  // session optimistically, so this must not wait for /auth/me.
  await expect(page.locator('#close-auth-modal-btn')).toBeHidden({ timeout: 180000 });
  await page.waitForFunction(
    () => {
      const token = window.localStorage.getItem('prehub_auth_token');
      return typeof token === 'string' && token.split('.').length === 3;
    },
    undefined,
    { timeout: 60000, polling: 100 },
  );
}

async function waitForRecoveredSession(page: Page, expectedSub: string | undefined): Promise<string> {
  let recovered = '';
  await expect
    .poll(
      async () => {
        const token = await readAppToken(page);
        if (!isJwt(token)) return null;
        if (expectedSub && decodeJwt(token as string)?.sub !== expectedSub) return null;
        recovered = token as string;
        return token;
      },
      { timeout: 90000, intervals: [250, 500, 1000] },
    )
    .not.toBeNull();
  return recovered;
}

async function logoutThroughUi(page: Page): Promise<void> {
  await openAuthModal(page);
  const logout = page.getByRole('button', { name: 'Keluar dari Sesi' });
  await expect(logout).toBeVisible({ timeout: 30000 });
  await logout.click();
  await expect
    .poll(async () => await readAppToken(page), { timeout: 30000, intervals: [200, 500] })
    .toBeNull();
}

test.describe('M8 phase 161 — auth session durability', () => {
  test.describe.configure({ mode: 'serial' });

  test('login mirrors a 7-day, Secure-on-HTTPS auth cookie', async ({ page, context }) => {
    const creds = accountCredentials();
    test.skip(!creds, 'No M8_<ROLE>_EMAIL / M8_<ROLE>_PASSWORD configured — skipping.');

    await loginThroughUi(page, creds!.email, creds!.password);

    await expect.poll(async () => (await authCookie(context))?.value ?? null, {
      timeout: 30000,
      intervals: [200, 500],
    }).not.toBeNull();

    const cookie = await authCookie(context);
    expect(cookie).not.toBeNull();
    expect(isJwt(cookie!.value)).toBe(true);

    const appToken = await readAppToken(page);
    expect(appToken).toBe(cookie!.value);

    // ~7 days from now (allow a small clock/rounding window).
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(cookie!.expires).toBeGreaterThan(nowSeconds + SEVEN_DAYS_SECONDS - 3600);
    expect(cookie!.expires).toBeLessThan(nowSeconds + SEVEN_DAYS_SECONDS + 3600);
    expect(cookie!.sameSite).toBe('Lax');
    expect(cookie!.path).toBe('/');

    if (IS_HTTPS) {
      expect(cookie!.secure).toBe(true);
    }
  });

  test('recovers a stale app token from the Supabase session (no silent guest)', async ({
    page,
    context,
  }) => {
    const creds = accountCredentials();
    test.skip(!creds, 'No M8_<ROLE>_EMAIL / M8_<ROLE>_PASSWORD configured — skipping.');

    await loginThroughUi(page, creds!.email, creds!.password);

    const validToken = await readAppToken(page);
    const claims = validToken ? decodeJwt(validToken) : null;
    expect(claims?.sub).toBeTruthy();

    // Simulate a stale/garbage app token the way a broken refresh would leave it:
    // localStorage and the middleware cookie no longer carry a usable JWT, while
    // Supabase's own session storage is still valid.
    await page.evaluate((invalid) => {
      window.localStorage.setItem('prehub_auth_token', invalid);
      document.cookie = `prehub_auth_token=${invalid}; path=/; max-age=604800; samesite=lax`;
    }, INVALID_TOKEN);

    const authMeStatuses: number[] = [];
    page.on('response', (res) => {
      if (/\/api\/v1\/auth\/(me|session)/.test(res.url())) authMeStatuses.push(res.status());
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    const recovered = await waitForRecoveredSession(page, claims?.sub);
    expect(recovered).not.toBe(INVALID_TOKEN);

    // The mirror was rewritten (7-day refresh) …
    await expect.poll(async () => (await authCookie(context))?.value ?? null, {
      timeout: 30000,
      intervals: [200, 500],
    }).toBe(recovered);

    // … and the app is genuinely authenticated, not a flagged guest preview.
    await expect(page.locator('#guest-evaluation-banner')).toBeHidden({ timeout: 60000 });
    await expect(page.locator('#close-auth-modal-btn')).toBeHidden({ timeout: 15000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.get('guest'), { timeout: 60000, intervals: [500, 1000] })
      .toBeNull();

    const badgeText = ((await page.locator('#auth-persona-badge-btn').textContent()) ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const expectedRole = (claims?.app_metadata?.role ?? claims?.user_metadata?.role ?? 'GUEST').toUpperCase();
    expect(badgeText).toContain(expectedRole);

    // The backend must accept the recovered token. Assert directly instead of
    // relying on the app's background reconciliation, which is intentionally
    // optimistic and may still be in flight on a cold backend.
    const apiBase = process.env.M8_API_BASE_URL ?? 'https://peta-nadi.onrender.com';
    const meResponse = await page.request.get(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${recovered}` },
      timeout: 120000,
      failOnStatusCode: false,
    });
    expect(meResponse.status()).toBe(200);
    const meProfile = (await meResponse.json()) as { role?: string };
    expect((meProfile.role ?? '').toUpperCase()).toBe(expectedRole);

    // Keep the app-path statuses as diagnostics only.
    test.info().annotations.push({
      type: 'authMeStatuses',
      description: authMeStatuses.join(',') || 'none',
    });
  });

  test('logout in one tab clears the session in another tab', async ({ page, context }) => {
    const creds = accountCredentials();
    test.skip(!creds, 'No M8_<ROLE>_EMAIL / M8_<ROLE>_PASSWORD configured — skipping.');

    await loginThroughUi(page, creds!.email, creds!.password);
    const token = await readAppToken(page);
    expect(isJwt(token)).toBe(true);

    const secondTab = await context.newPage();
    await secondTab.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => await readAppToken(secondTab), {
      timeout: 90000,
      intervals: [250, 500, 1000],
    }).toBe(token);

    await logoutThroughUi(secondTab);

    // Cross-tab `storage` sync: the first tab must drop the token and cookie.
    await expect
      .poll(async () => await readAppToken(page), { timeout: 30000, intervals: [200, 500] })
      .toBeNull();
    await expect.poll(async () => await authCookie(context), {
      timeout: 30000,
      intervals: [200, 500],
    }).toBeNull();

    await secondTab.close();
  });
});
