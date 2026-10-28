import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Phase 176.8/176.9 (M9) — Berita card legibility + guest banner docking.
 *
 * The R2 production capture showed the honesty label cut to
 * `TIER 2 · PERS · Belum terver…` and `Jalur: Terputus total · Pangan` ellipsised.
 * "Belum terverifikasi" replaced the fake 86% and is the single most important
 * string on the card, so it must render in full at every width.
 *
 * Phase 176.9 removed the floating guest banner: it is now a `shrink-0` row in
 * the panel's flex column, below the only scroll container. These tests prove the
 * structure — no card can intersect the banner at top/middle/bottom on desktop,
 * and on phones the sheet, banner and footer all stay inside the viewport.
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
  // Phase M9-visual: this spec never touches the filter controls, so moving the
  // tier/category/province block into NewsFilterModal needs no selector change
  // here. Reviewed by inspection; not executed in the visual pass.
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

/** Scroll the feed to a fraction of its range: 0 = top, 0.5 = middle, 1 = bottom. */
async function scrollFeedTo(page: Page, fraction: number) {
  const scroller = page.getByTestId('news-feed-scroll');
  await scroller.evaluate((el, f) => {
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * f);
  }, fraction);
  await page.waitForTimeout(250);
}

type OverlapProbe = {
  hits: string[];
  visibleCards: number;
  listBottom: number;
  bannerTop: number;
  bannerBottom: number;
  innerHeight: number;
};

/**
 * Structural proof that the docked banner cannot cover the feed: for every card
 * that is actually visible inside the scroll viewport, its clipped rectangle
 * must not intersect the banner rectangle.
 */
async function probeBannerOverlap(page: Page): Promise<OverlapProbe> {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="news-feed-scroll"]') as HTMLElement | null;
    const banner = document.querySelector('[data-testid="guest-evaluation-banner"]') as HTMLElement | null;
    if (!scroller || !banner) throw new Error('feed scroller or guest banner missing');
    const s = scroller.getBoundingClientRect();
    const b = banner.getBoundingClientRect();
    const cards = Array.from(
      scroller.querySelectorAll<HTMLElement>('[data-testid^="berita-card-"]')
    );
    const hits: string[] = [];
    let visibleCards = 0;
    for (const card of cards) {
      const c = card.getBoundingClientRect();
      const top = Math.max(c.top, s.top);
      const bottom = Math.min(c.bottom, s.bottom);
      if (bottom - top <= 0) continue; // scrolled out of the viewport: not visible
      visibleCards += 1;
      const overlaps =
        top < b.bottom && bottom > b.top && c.left < b.right && c.right > b.left;
      if (overlaps) {
        hits.push(
          `${card.getAttribute('data-testid')} visible ${top.toFixed(1)}..${bottom.toFixed(1)} vs banner ${b.top.toFixed(1)}..${b.bottom.toFixed(1)}`
        );
      }
    }
    return {
      hits,
      visibleCards,
      listBottom: s.bottom,
      bannerTop: b.top,
      bannerBottom: b.bottom,
      innerHeight: window.innerHeight,
    };
  });
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

  test('no card intersects the guest banner at top, middle or bottom scroll', async ({ page }) => {
    await openDashboard(page, longFeedArticles());
    await waitForFonts(page);

    const banner = page.getByTestId('guest-evaluation-banner');
    await expect(banner).toBeVisible();
    const bannerBox = await boxOf(banner);
    // Docked below the feed — not floating over it.
    const scrollerBox = await boxOf(page.getByTestId('news-feed-scroll'));
    expect(bannerBox.y, 'banner top starts below the feed viewport').toBeGreaterThanOrEqual(
      scrollerBox.y + scrollerBox.height - 1
    );
    expect(bannerBox.y + bannerBox.height, 'banner ends inside the viewport').toBeLessThanOrEqual(
      1080 + 1
    );

    for (const [label, fraction] of [
      ['top', 0],
      ['middle', 0.5],
      ['bottom', 1],
    ] as const) {
      await scrollFeedTo(page, fraction);
      const probe = await probeBannerOverlap(page);
      expect(probe.visibleCards, `no card visible at ${label} scroll`).toBeGreaterThan(0);
      expect(
        probe.hits,
        `guest banner covers cards at ${label} scroll: ${probe.hits.join('; ')}`
      ).toEqual([]);
      expect(
        probe.listBottom,
        `feed viewport bottom passes the banner at ${label} scroll`
      ).toBeLessThanOrEqual(probe.bannerTop + 1);
    }
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
] as const) {
  test.describe(`mobile ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('sheet, banner and footer fit the viewport; cards stay clear', async ({ page }) => {
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

      // --- Phase 176.9 structural fit: nothing may extend past the viewport ---
      const scroller = page.getByTestId('news-feed-scroll');
      const banner = page.getByTestId('guest-evaluation-banner');
      const footerLink = page.getByTestId('news-footer-data');
      await expect(banner).toBeVisible();
      await expect(footerLink).toBeVisible();

      const scrollerBox = await boxOf(scroller);
      const bannerBox = await boxOf(banner);
      const footerBox = await boxOf(footerLink);

      expect(
        scrollerBox.y + scrollerBox.height,
        'feed viewport bottom extends past innerHeight'
      ).toBeLessThanOrEqual(viewport.height + 1);

      // Banner fully inside the viewport.
      expect(bannerBox.y, 'banner top above the viewport').toBeGreaterThanOrEqual(0);
      expect(bannerBox.y + bannerBox.height, 'banner bottom past innerHeight').toBeLessThanOrEqual(
        viewport.height + 1
      );
      expect(bannerBox.x, 'banner left of the viewport').toBeGreaterThanOrEqual(0);
      expect(bannerBox.x + bannerBox.width, 'banner right past innerWidth').toBeLessThanOrEqual(
        viewport.width + 1
      );

      // Footer link ("Transparansi Data") fully on screen.
      expect(footerBox.y, 'footer link top above the viewport').toBeGreaterThanOrEqual(0);
      expect(footerBox.y + footerBox.height, 'footer link bottom past innerHeight').toBeLessThanOrEqual(
        viewport.height + 1
      );

      // At max scroll the last card sits above the banner and no card intersects it.
      await scrollFeedTo(page, 1);
      const last = await boxOf(cards.last());
      const listAtBottom = await boxOf(scroller);
      const visibleBottom = Math.min(last.y + last.height, listAtBottom.y + listAtBottom.height);
      expect(visibleBottom, 'mobile last card overlaps the guest banner').toBeLessThanOrEqual(
        bannerBox.y + 1
      );

      const probe = await probeBannerOverlap(page);
      expect(probe.visibleCards, 'no card visible at max scroll').toBeGreaterThan(0);
      expect(probe.hits, `mobile banner covers cards: ${probe.hits.join('; ')}`).toEqual([]);

      // --- No horizontal overflow at this width ---
      const pageMetrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        pageMetrics.scrollWidth,
        'document overflows horizontally'
      ).toBeLessThanOrEqual(pageMetrics.innerWidth + 1);

      const sheetMetrics = await page.getByTestId('news-sheet').evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(sheetMetrics.scrollWidth, 'Berita sheet overflows horizontally').toBeLessThanOrEqual(
        sheetMetrics.clientWidth + 1
      );
    });
  });
}
