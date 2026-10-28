import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Phase 176.8 (M9) — Berita card legibility + guest banner clearance.
 *
 * The R2 production capture showed the honesty label cut to
 * `TIER 2 · PERS · Belum terver…` and `Jalur: Terputus total · Pangan` ellipsised.
 * "Belum terverifikasi" replaced the fake 86% and is the single most important
 * string on the card, so it must render in full at every width.
 *
 * Also guards the floating guest banner: it sat on top of the last card in the
 * news feed. The panel now reserves the banner's measured clearance, so the
 * last card can always be scrolled clear of it.
 *
 * Hermetic: `/api/v1/news/live` is stubbed (fixtures mirror
 * news-honesty-breadth.spec.ts); the backend is not running.
 */

const DASHBOARD_URL = '/dashboard?guest=1';

type MockArticle = Record<string, unknown>;

const NOW = new Date().toISOString();

function newsArticle(overrides: MockArticle = {}): MockArticle {
  return {
    id: 'legibility-1',
    source: 'LKBN ANTARA Aceh',
    source_tier: 'TIER_2_AUTHORITATIVE_PRESS',
    title: 'Banjir lumpuh jalan nasional di Banda Aceh',
    summary: 'Banjir merendam badan jalan nasional dan memutus arus kendaraan logistik.',
    province: 'Aceh',
    pubDate: NOW,
    published_at: NOW,
    latitude: 5.5483,
    longitude: 95.3238,
    severity: 'high',
    incident_type: 'flood',
    zone_tier: 'RED_CONFIRMED',
    link_alive: 'alive',
    confidence_score: 0.86,
    commodity_name: 'Pangan',
    commodities_affected: ['Pangan'],
    ...overrides,
  };
}

/** Eight uncorroborated Tier-2 rows: long enough to force a real scroll. */
function longFeedArticles(): MockArticle[] {
  return Array.from({ length: 8 }, (_, index) =>
    newsArticle({
      id: `legibility-${index + 1}`,
      title: `Banjir lumpuh jalan nasional di Banda Aceh — laporan ${index + 1}`,
      link: `https://www.antaranews.com/berita/45679${index}/banjir-banda-aceh`,
    })
  );
}

function livePayload(articles: MockArticle[]) {
  return {
    status: 'live',
    articles,
    items: articles,
    count: articles.length,
    total: articles.length,
    last_updated: NOW,
    meta: {
      province_counts: { Aceh: articles.length },
      provinces_present: ['Aceh'],
      provinces_missing: [],
      truncated: false,
    },
  };
}

async function mockDashboardShell(page: Page) {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.route('**/api/v1/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.route('**/api/v1/news/hitl-pending*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, items: [], pending_approvals: [] }),
    });
  });
  await page.route('**/api/v1/news/market-regime', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        regime: 'NORMAL',
        active_crisis_indicators: [],
        commodity_volatility_score: 0,
        critical_news_count: 0,
        early_warning_count: 0,
      }),
    });
  });
}

function newsSidebar(page: Page) {
  return page
    .locator('aside')
    .filter({ has: page.getByRole('heading', { name: 'Berita', exact: true }) })
    .first();
}

/** The Berita card container frozen by news-live-audit.spec.ts. */
function articleCards(page: Page) {
  return newsSidebar(page).locator('div.p-3.rounded-lg.border');
}

async function openDashboard(page: Page, articles: MockArticle[]) {
  await mockDashboardShell(page);
  await page.route('**/api/v1/news/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(livePayload(articles)),
    });
  });

  const firstLiveResponse = page.waitForResponse(
    (res) => res.url().includes('/api/v1/news/live'),
    { timeout: 60_000 }
  );
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await firstLiveResponse;
  // Phones/tablets open with the Berita sheet collapsed: open it so the panel
  // (and its cards) are visible for measurement.
  if ((page.viewportSize()?.width ?? 1920) < 768) {
    await page.getByTestId('news-sheet-toggle').click();
  }
  const sidebar = newsSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 60_000 });
  await expect(articleCards(page)).toHaveCount(articles.length, { timeout: 30_000 });
  return sidebar;
}

/** Fonts settle after first paint; measure only once the text is final. */
async function waitForFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(150);
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, 'element must have a layout box').not.toBeNull();
  return box as Box;
}

async function assertNoHorizontalClip(locator: Locator, label: string) {
  const metrics = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(metrics.clientWidth, `${label} has no measurable width`).toBeGreaterThan(0);
  expect(metrics.scrollWidth, `${label} is clipped horizontally`).toBeLessThanOrEqual(
    metrics.clientWidth + 1
  );
}

/** The badge and every ancestor up to the card must not ellipsise. */
async function assertNoEllipsisAncestor(card: Locator, value: Locator, label: string) {
  const valueHandle = await value.elementHandle();
  const offenders = await card.evaluate((cardEl, node) => {
    if (!node) return ['missing value element'];
    const out: string[] = [];
    let current: Element | null = node;
    while (current && current !== cardEl.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.textOverflow === 'ellipsis') {
        out.push(`${current.tagName}.${current.className} text-overflow:ellipsis`);
      }
      current = current.parentElement;
    }
    return out;
  }, valueHandle);
  expect(offenders, `${label} has an ellipsis-clipping ancestor`).toEqual([]);
}

async function scrollFeedToBottom(page: Page) {
  const scroller = page.getByTestId('news-feed-scroll');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(200);
}

test.describe('desktop 1920x1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('confidence, route and location values render in full', async ({ page }) => {
    await openDashboard(page, longFeedArticles());
    await waitForFonts(page);

    const cards = articleCards(page);
    for (let i = 0; i < 3; i += 1) {
      const card = cards.nth(i);
      const cardBox = await boxOf(card);
      const cardBottom = cardBox.y + cardBox.height;

      // 1. Confidence: tier badge + honest label, never ellipsised.
      const confidence = card.locator('[data-testid^="berita-confidence-"]');
      await assertNoHorizontalClip(confidence, `card ${i} confidence`);
      const confidenceBox = await boxOf(confidence);
      expect(confidenceBox.y + confidenceBox.height, `card ${i} confidence bottom`).toBeLessThanOrEqual(
        cardBottom + 1
      );
      await expect(confidence).toContainText('TIER 2 · PERS');
      await expect(confidence).toContainText('Belum terverifikasi');
      await assertNoEllipsisAncestor(card, confidence, `card ${i} confidence`);

      // 2. Route row: `Terputus Total · Pangan` wraps instead of truncating.
      const route = card.locator('[data-testid^="berita-route-"]');
      await assertNoHorizontalClip(route, `card ${i} route`);
      const routeBox = await boxOf(route);
      expect(routeBox.y + routeBox.height, `card ${i} route bottom`).toBeLessThanOrEqual(
        cardBottom + 1
      );
      await expect(route).toContainText('Terputus Total');
      await expect(route).toContainText('Pangan');

      // 3. Location is the only value allowed to clamp (2 lines + title).
      const location = card.locator('[data-testid^="berita-lokasi-"]');
      await assertNoHorizontalClip(location, `card ${i} location`);
      const locationBox = await boxOf(location);
      expect(locationBox.y + locationBox.height, `card ${i} location bottom`).toBeLessThanOrEqual(
        cardBottom + 1
      );
      expect(await location.getAttribute('title')).toBeTruthy();
    }
  });

  test('"Belum terverifikasi" is fully painted inside the card', async ({ page }) => {
    await openDashboard(page, longFeedArticles());
    await waitForFonts(page);

    const card = articleCards(page).first();
    const label = card.getByText('Belum terverifikasi', { exact: true });
    await expect(label).toBeVisible();

    const cardBox = await boxOf(card);
    const labelBox = await boxOf(label);
    expect(labelBox.width, 'label has zero width').toBeGreaterThan(0);
    expect(labelBox.x, 'label left inside card').toBeGreaterThanOrEqual(cardBox.x - 1);
    expect(labelBox.x + labelBox.width, 'label right inside card').toBeLessThanOrEqual(
      cardBox.x + cardBox.width + 1
    );
    expect(labelBox.y, 'label top inside card').toBeGreaterThanOrEqual(cardBox.y - 1);
    expect(labelBox.y + labelBox.height, 'label bottom inside card').toBeLessThanOrEqual(
      cardBox.y + cardBox.height + 1
    );

    // The rendered string is complete — no `Belum terver…`.
    expect((await card.innerText()).replace(/\s+/g, ' ')).toContain('Belum terverifikasi');
  });

  test('the last card never intersects the guest banner', async ({ page }) => {
    await openDashboard(page, longFeedArticles());
    await waitForFonts(page);

    const banner = page.getByTestId('guest-evaluation-banner');
    await expect(banner).toBeVisible();

    await scrollFeedToBottom(page);

    const lastCard = articleCards(page).last();
    const cardBox = await boxOf(lastCard);
    const bannerBox = await boxOf(banner);

    const cardBottom = cardBox.y + cardBox.height;
    expect(cardBottom, 'last card overlaps the guest banner').toBeLessThanOrEqual(
      bannerBox.y + 1
    );
    expect(await page.evaluate(() => document.documentElement.dataset.guestBanner)).toBe('open');
  });
});

test.describe('mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Berita sheet keeps the same legibility and banner clearance', async ({ page }) => {
    await openDashboard(page, longFeedArticles());
    await waitForFonts(page);

    // openDashboard already opened the sheet at this width; confirm the panel.
    await expect(page.getByTestId('news-sheet')).toBeVisible();
    await waitForFonts(page);

    const cards = articleCards(page);
    for (let i = 0; i < 3; i += 1) {
      const card = cards.nth(i);
      const cardBox = await boxOf(card);
      const cardBottom = cardBox.y + cardBox.height;

      const confidence = card.locator('[data-testid^="berita-confidence-"]');
      await assertNoHorizontalClip(confidence, `mobile card ${i} confidence`);
      const confidenceBox = await boxOf(confidence);
      expect(confidenceBox.y + confidenceBox.height, `mobile card ${i} confidence bottom`).toBeLessThanOrEqual(
        cardBottom + 1
      );
      await expect(confidence).toContainText('TIER 2 · PERS');
      await expect(confidence).toContainText('Belum terverifikasi');
      await assertNoEllipsisAncestor(card, confidence, `mobile card ${i} confidence`);

      const route = card.locator('[data-testid^="berita-route-"]');
      await assertNoHorizontalClip(route, `mobile card ${i} route`);
      const routeBox = await boxOf(route);
      expect(routeBox.y + routeBox.height, `mobile card ${i} route bottom`).toBeLessThanOrEqual(
        cardBottom + 1
      );
    }

    // The honest label is visibly whole on mobile too.
    const label = cards.first().getByText('Belum terverifikasi', { exact: true });
    await expect(label).toBeVisible();
    const firstCardBox = await boxOf(cards.first());
    const labelBox = await boxOf(label);
    expect(labelBox.x + labelBox.width, 'mobile label right inside card').toBeLessThanOrEqual(
      firstCardBox.x + firstCardBox.width + 1
    );

    // Banner clearance holds with the sheet open.
    const banner = page.getByTestId('guest-evaluation-banner');
    await expect(banner).toBeVisible();
    await scrollFeedToBottom(page);

    const lastCard = articleCards(page).last();
    const lastCardBox = await boxOf(lastCard);
    const bannerBox = await boxOf(banner);
    expect(lastCardBox.y + lastCardBox.height, 'mobile last card overlaps the guest banner').toBeLessThanOrEqual(
      bannerBox.y + 1
    );
  });
});
