import { expect, test, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// M9 R2 / R2.1 production verification. Read-only: no login, no mutation, no stubs.
// Runs against the deployed origin from playwright.vercel.config.ts
// (baseURL = https://pre-hub.vercel.app, no webServer).
const OUT_DIR = path.resolve(__dirname, '../../.planning/milestones/M9/phaseR2.1');

const EMPTY_BERITA_WARMING = 'Belum ada berita live terverifikasi';
const HONEST_LABEL = 'Belum terverifikasi';
const COUNTER_IDS = ['counter-cuaca', 'counter-waspada', 'counter-titik-panas'] as const;
const EDGE_TOLERANCE = 1; // px, sub-pixel layout rounding

/** Best-effort dismissal of first-visit overlays (auth modal / onboarding). */
async function dismissOverlays(page: Page): Promise<void> {
  const closers = [
    '#close-auth-modal-btn',
    '[data-testid="onboarding-close"]',
    '[aria-label="Tutup"]',
    '[aria-label="Close"]',
  ];
  for (const sel of closers) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  // Escape closes any remaining dialog without ever submitting a form.
  await page.keyboard.press('Escape').catch(() => {});
}

/**
 * Phase 176.5 makes the Berita panel a closed-by-default bottom sheet below
 * `md`. Every assertion here is about the panel, so open it first when the
 * viewport collapsed it.
 */
async function openDashboard(page: Page, width: number, height: number): Promise<void> {
  const res = await page.goto('/dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  expect(res, 'dashboard navigation returned no response').not.toBeNull();
  expect(res!.status(), `GET /dashboard -> ${res!.status()}`).toBe(200);
  await page.setViewportSize({ width, height });
  await dismissOverlays(page);

  const sheet = page.getByTestId('news-sheet');
  if (width < 768) {
    // Phase 176.5 collapses the sheet by default below `md`; the toggle is
    // mounted once hydration has run, so wait for it instead of racing it.
    const toggle = page.getByTestId('news-sheet-toggle');
    await expect(toggle, `news sheet toggle missing at ${width}px`).toBeVisible({ timeout: 30000 });
    await toggle.click();
  }
  await expect(sheet, `news sheet not visible at ${width}px`).toBeVisible({ timeout: 30000 });

  // Give the live news feed its first poll to resolve.
  await expect
    .poll(async () => page.locator('[data-testid^="berita-card-"]').count(), { timeout: 45000 })
    .toBeGreaterThan(0);

  // The panel must never be showing the "no verified live news" empty state.
  const emptyState = page.getByText(EMPTY_BERITA_WARMING, { exact: false });
  expect(await emptyState.count(), 'Berita panel is showing the empty state').toBe(0);
}

/** R2.1 assertion 1 — the honesty label is real text and fully inside its card. */
async function assertFirstCardLegibility(page: Page, width: number): Promise<void> {
  const firstCard = page.locator('[data-testid^="berita-card-"]').first();
  const confidence = firstCard.locator('[data-testid^="berita-confidence-"]');
  await expect(confidence, `first card at ${width}px has no confidence block`).toHaveCount(1);
  await expect(
    confidence,
    `first card at ${width}px is missing the literal "${HONEST_LABEL}"`,
  ).toContainText(HONEST_LABEL);

  // The label itself, not the tier badge above it.
  const label = confidence.getByText(HONEST_LABEL, { exact: true });
  await expect(label, `"${HONEST_LABEL}" is not a distinct element`).toHaveCount(1);
  await expect(label, `"${HONEST_LABEL}" is not visible at ${width}px`).toBeVisible();
  await firstCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const cardBox = await firstCard.boundingBox();
  const labelBox = await label.boundingBox();
  expect(cardBox, 'first card has no layout box').not.toBeNull();
  expect(labelBox, `"${HONEST_LABEL}" has no layout box`).not.toBeNull();
  const c = cardBox!;
  const l = labelBox!;

  // Fully inside the card — all four edges, computed geometry (not a screenshot).
  expect(l.x, `label left edge escapes the card at ${width}px`).toBeGreaterThanOrEqual(
    c.x - EDGE_TOLERANCE,
  );
  expect(l.y, `label top edge escapes the card at ${width}px`).toBeGreaterThanOrEqual(
    c.y - EDGE_TOLERANCE,
  );
  expect(l.x + l.width, `label right edge escapes the card at ${width}px`).toBeLessThanOrEqual(
    c.x + c.width + EDGE_TOLERANCE,
  );
  expect(l.y + l.height, `label bottom edge escapes the card at ${width}px`).toBeLessThanOrEqual(
    c.y + c.height + EDGE_TOLERANCE,
  );
}

/** R2.1 assertion 3 — the three hazard counters render a real number, never `—`. */
async function assertCountersLive(page: Page, width: number): Promise<void> {
  for (const id of COUNTER_IDS) {
    const counter = page.getByTestId(id);
    await expect(counter, `${id} missing at ${width}px`).toBeAttached({ timeout: 60000 });
    await expect(counter, `${id} is not visible at ${width}px`).toBeVisible();
    // The counters hydrate from /weather/summary and /fire/hotspots: wait for
    // the live envelope, but never rewrite a genuine `—` into a pass.
    await expect
      .poll(async () => (await counter.innerText()).trim(), {
        timeout: 60000,
        message: `${id} still shows the unknown placeholder at ${width}px`,
      })
      .not.toBe('—');
    const text = (await counter.innerText()).trim();
    expect(text, `${id} is empty at ${width}px`).not.toBe('');
    expect(text, `${id} renders the unknown placeholder at ${width}px`).not.toBe('—');
    expect(text, `${id} is not a number at ${width}px`).toMatch(/^[0-9][0-9.,]*$/);
  }
}

/**
 * R2.1 assertion 2 — the floating guest banner never covers a Berita card.
 * Measured at scroll-bottom: the only state where the last card can reach the
 * banner, and the state the panel's `--guest-banner-clearance` padding exists
 * for.
 */
async function assertLastCardClearsGuestBanner(page: Page, width: number): Promise<void> {
  const scroller = page.getByTestId('news-feed-scroll');
  const banner = page.getByTestId('guest-evaluation-banner');
  await expect(banner, `guest banner missing at ${width}px`).toBeVisible();

  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);

  const listBox = await scroller.boundingBox();
  const bannerBox = await banner.boundingBox();
  expect(listBox, 'news feed scroll container has no layout box').not.toBeNull();
  expect(bannerBox, 'guest banner has no layout box').not.toBeNull();

  const lastCard = page.locator('[data-testid^="berita-card-"]').last();
  await expect(lastCard).toBeVisible();
  const cardBox = await lastCard.boundingBox();
  expect(cardBox, 'last Berita card has no layout box').not.toBeNull();

  // Clip to the scroll viewport: that is the part a human can actually see.
  const visibleBottom = Math.min(cardBox!.y + cardBox!.height, listBox!.y + listBox!.height);

  expect(
    visibleBottom,
    `last visible card bottom (${visibleBottom.toFixed(1)}) overlaps the guest banner top (${bannerBox!.y.toFixed(1)}) at ${width}px`,
  ).toBeLessThanOrEqual(bannerBox!.y + EDGE_TOLERANCE);
}

async function capture(page: Page, width: number): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(OUT_DIR, `live-dashboard-${width}.png`),
    fullPage: false,
  });
}

test('R2.1 legibility at 1920x1080: honest label inside the first card + live counters', async ({
  page,
}) => {
  await openDashboard(page, 1920, 1080);
  await assertFirstCardLegibility(page, 1920);
  await assertCountersLive(page, 1920);
  await capture(page, 1920);
});

test('R2.1 banner clearance at 1920x1080: last card clears the guest banner', async ({ page }) => {
  await openDashboard(page, 1920, 1080);
  await assertLastCardClearsGuestBanner(page, 1920);
});

test('R2.1 legibility at 390x844: honest label inside the first card + live counters', async ({
  page,
}) => {
  await openDashboard(page, 390, 844);
  await assertFirstCardLegibility(page, 390);
  await assertCountersLive(page, 390);
  await capture(page, 390);
});

test('R2.1 banner clearance at 390x844: last card clears the guest banner', async ({ page }) => {
  await openDashboard(page, 390, 844);
  await assertLastCardClearsGuestBanner(page, 390);
});
