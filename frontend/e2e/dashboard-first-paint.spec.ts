// Unit D — dashboard first paint: public-first bootstrap, last-good caches,
// timestamp precedence.
//
// Hermetic: every /api/ call is intercepted, so this spec never touches a
// live backend. Discovery without a dev server:
//   npx playwright test --list e2e/dashboard-first-paint.spec.ts
// Full run needs the frontend server (see playwright.config.ts webServer).
//
// What is pinned here:
//  1. A delayed public bootstrap still paints the shell + counter/news
//     skeletons first, fires with `sections=public`, then fills in.
//  2. Cached weather/news (< 2 h, `prehub.weather.v1` / `prehub.news.v1`)
//     paint before any network dependency resolves.
//  3. A newer live payload replaces an older cached payload, while an older
//     payload never moves the data timestamp backward (counters, stored
//     cache, and the news feed clock).

import { test, expect, type Page } from '@playwright/test';

const DASHBOARD_URL = '/dashboard?guest=1';
const BBOX = [94, -6, 108, 6];
const SOURCE = 'BMKG Stasiun Klimatologi & Geofisika + Open-Meteo NWP (ECMWF/GFS)';

type MockArticle = Record<string, unknown>;

/** Manual gate: the route stays pending until `release()` — no wall-clock races. */
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

function bucket(count: number | null, status: string, reason: string | null = null) {
  return {
    count,
    total: count,
    status,
    reason,
    source: SOURCE,
    valid_until: '2026-10-27T08:15:00+00:00',
    window_hours: 24,
  };
}

function summaryPayload(
  cuaca: { count: number | null; status: string },
  waspada: { count: number | null; status: string },
  generatedAt: string,
) {
  return {
    bbox: BBOX,
    generated_at: generatedAt,
    cuaca: bucket(cuaca.count, cuaca.status),
    waspada: bucket(waspada.count, waspada.status),
  };
}

/** Raw backend-shaped article (goes through the hook's trust gates). */
function rawNewsArticle(overrides: MockArticle = {}): MockArticle {
  const pubDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    id: 'first-paint-raw-1',
    source: 'ANTARA Sumut',
    source_tier: 'TIER_1_OFFICIAL',
    title: 'Banjir lumpuh jalur utama Belawan',
    summary: 'Banjir merendam badan jalan dan memutus arus kendaraan logistik di Belawan.',
    pubDate,
    published_at: pubDate,
    latitude: 3.7845,
    longitude: 98.6923,
    severity: 'high',
    incident_type: 'flood',
    zone_tier: 'RED_CONFIRMED',
    link_alive: 'alive',
    ...overrides,
  };
}

const GOOD_LINK = (id: string, slug: string) => `https://www.antaranews.com/berita/${id}/${slug}`;

/** Normalized (already gated) article as stored in `prehub.news.v1`. */
function cachedNewsItem(id: string, headline: string, updatedIso: string): MockArticle {
  return {
    id,
    source_type: 'OFFICIAL_NEWS',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'ANTARA Sumut',
    headline,
    summary: `${headline} — ringkasan.`,
    location_name: 'Belawan',
    province: 'Sumatera Utara',
    lat: 3.7845,
    lon: 98.6923,
    pubDate: updatedIso,
    published_at: updatedIso,
    severity: 'high',
    incident_type: 'flood',
    hazardType: 'flood',
    temporal_phase: 'active_disruption',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.9,
    display_confidence: {
      value: 0.9,
      label: 'Terkonfirmasi multi-sumber',
      basis: 'multi_source',
      tier: 'TIER_1_OFFICIAL',
    },
    link: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
    url: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
    link_alive: 'alive',
    zone_tier: 'RED_CONFIRMED',
    relevance_tier: 'crisis',
  };
}

function liveNewsPayload(articles: MockArticle[], lastUpdated: string) {
  return {
    status: 'live',
    articles,
    items: articles,
    count: articles.length,
    total: articles.length,
    last_updated: lastUpdated,
  };
}

function corridorPayload() {
  return {
    corridor_id: 'sumatra_belawan_medan',
    corridor_name: 'Koridor Arteri Utama Belawan–Medan–Tebing Tinggi',
    timestamp: new Date().toISOString(),
    is_fallback: true,
    fallback_reasons: ['e2e fixture'],
    weather: {
      status: 'MODERATE_RAIN',
      rainfall_mm: 68.5,
      visibility: '7 km',
      alert_summary: 'Peringatan Dini BMKG',
      code: 60,
      location: 'Medan-Belawan',
    },
    traffic: {
      congestion_level_pct: 74.2,
      delay_minutes: 35,
      active_incidents: 2,
      flow_speed_kmh: 22.5,
      status: 'HEAVY_CONGESTION',
      checkpoints: [],
    },
    commodity_prices: {
      chili_price: 48500,
      rice_price: 14200,
      cooking_oil_price: 18500,
      price_anomaly_detected: true,
      inflation_trend_pct: 12.8,
      commodities: [],
    },
    data_integrity: {
      bmkg_status: 'ONLINE',
      tomtom_status: 'ONLINE',
      pihps_status: 'ONLINE',
      consensus_confidence: 0.92,
    },
  };
}

function emptyFirePayload() {
  return {
    hotspots: [],
    count: 0,
    total: 0,
    capped: false,
    status: 'empty',
    reason: 'Tidak ada titik panas',
    source: 'nasa-firms-csv',
    updated_at: new Date().toISOString(),
    window_hours: 24,
  };
}

function emptyPolygonsPayload() {
  return {
    type: 'FeatureCollection',
    features: [],
    meta: {
      status: 'empty',
      reason: 'Tidak ada zona aktif',
      total: 0,
      count: 0,
      capped: false,
      updated_at: new Date().toISOString(),
    },
  };
}

interface BootstrapOptions {
  newsArticles?: MockArticle[] | null;
  newsLastUpdated?: string | null;
  includeMarketRegime?: boolean;
  summary: unknown;
}

function bootstrapPayload(opts: BootstrapOptions) {
  const sections: Record<string, unknown> = {
    incidents: { status: 'ok', data: { items: [], total: 0 } },
    corridor_context: { status: 'ok', data: corridorPayload() },
    weather_summary: { status: 'ok', data: opts.summary },
    weather_spatial_polygons: { status: 'ok', data: emptyPolygonsPayload() },
    fire_hotspots: { status: 'ok', data: emptyFirePayload() },
  };
  if (opts.newsArticles && opts.newsLastUpdated) {
    sections.news = {
      status: 'ok',
      data: liveNewsPayload(opts.newsArticles, opts.newsLastUpdated),
    };
  }
  if (opts.includeMarketRegime !== false) {
    sections.news_market_regime = {
      status: 'ok',
      data: {
        regime: 'NORMAL',
        active_crisis_indicators: [],
        commodity_volatility_score: 0,
        critical_news_count: 0,
        early_warning_count: 0,
      },
    };
  }
  return {
    schema_version: 1,
    computed_at: new Date().toISOString(),
    stale: false,
    role: 'GUEST',
    company_id: null,
    modality: 'truck',
    sections,
  };
}

interface ApiMocks {
  bootstrap: unknown;
  summary: unknown;
  newsLive: unknown;
  bootstrapGate?: Promise<void>;
  summaryGate?: Promise<void>;
  newsGate?: Promise<void>;
}

/** Single /api/ dispatcher: auth/shell fixtures + the contracts under test. */
async function mockDashboardApi(page: Page, mocks: ApiMocks) {
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/dashboard/bootstrap')) {
      if (mocks.bootstrapGate) await mocks.bootstrapGate;
      return ok(mocks.bootstrap);
    }
    if (url.includes('/api/v1/weather/summary')) {
      if (mocks.summaryGate) await mocks.summaryGate;
      return ok(mocks.summary);
    }
    if (url.includes('/api/v1/news/live')) {
      if (mocks.newsGate) await mocks.newsGate;
      return ok(mocks.newsLive);
    }
    if (url.includes('/api/v1/auth/me') || url.includes('/api/v1/auth/session')) return ok({});
    if (url.includes('/api/v1/news/market-regime')) {
      return ok({
        regime: 'NORMAL',
        active_crisis_indicators: [],
        commodity_volatility_score: 0,
        critical_news_count: 0,
        early_warning_count: 0,
      });
    }
    if (url.includes('/api/v1/news/hitl-pending')) {
      return ok({ count: 0, items: [], pending_approvals: [] });
    }
    if (url.includes('/api/v1/weather/spatial-polygons')) return ok(emptyPolygonsPayload());
    if (url.includes('/api/v1/fire/hotspots')) return ok(emptyFirePayload());
    if (url.includes('/api/v1/corridor/context')) return ok(corridorPayload());
    return ok({
      status: 'ok',
      items: [],
      total: 0,
      vehicles: [],
      events: [],
      segments: [],
      sources: [],
      spikes: [],
      count: 0,
    });
  });
}

async function seedPublicCache(
  page: Page,
  opts: { news?: { feed: MockArticle[]; meta: null; lastUpdated: string }; weather?: unknown },
) {
  await page.addInitScript((value) => {
    try {
      if (value.news) {
        localStorage.setItem('prehub.news.v1', JSON.stringify({ v: 1, at: Date.now(), data: value.news }));
      }
      if (value.weather) {
        localStorage.setItem(
          'prehub.weather.v1',
          JSON.stringify({ v: 1, at: Date.now(), data: value.weather }),
        );
      }
    } catch {
      /* ignore */
    }
  }, opts);
}

/** The left "Berita" sidebar (the only aside that owns the Berita heading). */
function newsSidebar(page: Page) {
  return page
    .locator('aside')
    .filter({ has: page.getByRole('heading', { name: 'Berita', exact: true }) })
    .first();
}

async function storedWeatherGeneratedAt(page: Page): Promise<string | null> {
  const raw = await page.evaluate(() => localStorage.getItem('prehub.weather.v1'));
  try {
    return (JSON.parse(raw ?? '') as { data?: { generated_at?: string } })?.data?.generated_at ?? null;
  } catch {
    return null;
  }
}

async function storedNewsLastUpdated(page: Page): Promise<string | null> {
  const raw = await page.evaluate(() => localStorage.getItem('prehub.news.v1'));
  try {
    return (JSON.parse(raw ?? '') as { data?: { lastUpdated?: string } })?.data?.lastUpdated ?? null;
  } catch {
    return null;
  }
}

test.describe('Unit D — dashboard first paint', () => {
  test('shell and counter skeleton paint before a delayed public bootstrap', async ({ page }) => {
    const bootstrapGate = gate();
    const summaryGate = gate();
    const generatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const seedArticle = rawNewsArticle({
      id: 'seed-first-paint-1',
      title: 'Banjir lumpuh jalur utama Belawan',
      link: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
      url: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
    });
    const summary = summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }, generatedAt);
    await mockDashboardApi(page, {
      bootstrap: bootstrapPayload({ newsArticles: [seedArticle], newsLastUpdated: generatedAt, summary }),
      summary,
      newsLive: { status: 'warming', articles: [], items: [], total: 0, count: 0, last_updated: generatedAt },
      bootstrapGate: bootstrapGate.wait,
      summaryGate: summaryGate.wait,
    });

    const bootstrapRequest = page.waitForRequest(
      (req) => req.url().includes('/dashboard/bootstrap'),
      { timeout: 60_000 },
    );
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // The bootstrap fires public-first (auth-blind) on mount.
    const req = await bootstrapRequest;
    expect(new URL(req.url()).searchParams.get('sections')).toBe('public');

    // Shell + skeletons paint while the snapshot is still gated: unknown
    // counters read "—" (never a fabricated 0), news waits for live/seed.
    const sidebar = newsSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 60_000 });
    await expect(sidebar.getByText('Menunggu feed live').first()).toBeVisible();
    await expect(page.getByTestId('counter-cuaca')).toHaveText('—');
    await expect(page.getByTestId('counter-waspada')).toHaveText('—');

    bootstrapGate.release();
    summaryGate.release();
    await page.waitForResponse((res) => res.url().includes('/dashboard/bootstrap'), { timeout: 30_000 });

    await expect(page.getByTestId('counter-cuaca')).toHaveText('5', { timeout: 30_000 });
    await expect(page.getByTestId('counter-waspada')).toHaveText('27');
    await expect(page.getByTestId('berita-card-seed-first-paint-1')).toBeVisible({ timeout: 30_000 });
  });

  test('cached weather and news paint before the network resolves', async ({ page }) => {
    const bootstrapGate = gate();
    const summaryGate = gate();
    const generatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const cachedArticle = cachedNewsItem('cached-news-1', 'Banjir lumpuh jalur utama Belawan', generatedAt);
    const summary = summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }, generatedAt);
    await seedPublicCache(page, {
      news: { feed: [cachedArticle], meta: null, lastUpdated: generatedAt },
      weather: summary,
    });
    await mockDashboardApi(page, {
      bootstrap: bootstrapPayload({
        newsArticles: [
          rawNewsArticle({
            id: 'cached-news-1',
            title: 'Banjir lumpuh jalur utama Belawan',
            link: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
            url: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
          }),
        ],
        newsLastUpdated: generatedAt,
        summary,
      }),
      summary,
      // Live returns the identical payload so post-resolution asserts stay stable.
      newsLive: liveNewsPayload(
        [
          rawNewsArticle({
            id: 'cached-news-1',
            title: 'Banjir lumpuh jalur utama Belawan',
            link: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
            url: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
          }),
        ],
        generatedAt,
      ),
      bootstrapGate: bootstrapGate.wait,
      summaryGate: summaryGate.wait,
    });

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Last-good cache paints while bootstrap + summary are still gated.
    await expect(page.getByTestId('counter-cuaca')).toHaveText('5', { timeout: 60_000 });
    await expect(page.getByTestId('counter-waspada')).toHaveText('27');
    await expect(page.getByTestId('berita-card-cached-news-1')).toBeVisible();

    bootstrapGate.release();
    summaryGate.release();
    await page.waitForResponse((res) => res.url().includes('/dashboard/bootstrap'), { timeout: 30_000 });

    await expect(page.getByTestId('counter-cuaca')).toHaveText('5', { timeout: 30_000 });
    await expect(page.getByTestId('counter-waspada')).toHaveText('27');
    await expect(page.getByTestId('berita-card-cached-news-1')).toBeVisible({ timeout: 30_000 });
  });

  test('a newer live payload replaces an older cached payload', async ({ page }) => {
    const summaryGate = gate();
    const newsGate = gate();
    const oldAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const newAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oldSummary = summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }, oldAt);
    const newSummary = summaryPayload({ count: 9, status: 'ok' }, { count: 31, status: 'ok' }, newAt);
    const oldArticle = cachedNewsItem('news-cache-old-a', 'Banjir lumpuh jalur utama Belawan', oldAt);
    const newRawArticle = rawNewsArticle({
      id: 'news-live-new-b',
      title: 'Longsor tutup jalur lintas barat',
      summary: 'Longsor menutup badan jalan lintas barat dan antrean kendaraan mengular.',
      latitude: -0.9492,
      longitude: 100.3543,
      link: GOOD_LINK('4567891', 'longsor-tutup-jalur-barat'),
      url: GOOD_LINK('4567891', 'longsor-tutup-jalur-barat'),
    });
    await seedPublicCache(page, {
      news: { feed: [oldArticle], meta: null, lastUpdated: oldAt },
      weather: oldSummary,
    });
    // No bootstrap news/regime seed: the first hook load is the live network
    // read, so the test isolates live-vs-cache precedence.
    await mockDashboardApi(page, {
      bootstrap: bootstrapPayload({ summary: oldSummary, includeMarketRegime: false }),
      summary: newSummary,
      newsLive: liveNewsPayload([newRawArticle], newAt),
      summaryGate: summaryGate.wait,
      newsGate: newsGate.wait,
    });

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Older cache paints first while live is gated.
    await expect(page.getByTestId('counter-cuaca')).toHaveText('5', { timeout: 60_000 });
    await expect(page.getByTestId('counter-waspada')).toHaveText('27');
    await expect(page.getByTestId('berita-card-news-cache-old-a')).toBeVisible();

    summaryGate.release();
    newsGate.release();

    // Newer payloads win on every surface: counters, stored cache, feed clock.
    await expect(page.getByTestId('counter-cuaca')).toHaveText('9', { timeout: 30_000 });
    await expect(page.getByTestId('counter-waspada')).toHaveText('31');
    await expect
      .poll(() => storedWeatherGeneratedAt(page), { timeout: 30_000 })
      .toBe(newAt);
    await expect(page.getByTestId('berita-card-news-live-new-b')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => storedNewsLastUpdated(page), { timeout: 30_000 }).toBe(newAt);
  });

  test('an older payload never moves the timestamp backward', async ({ page }) => {
    const summaryGate = gate();
    const newsGate = gate();
    const oldAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const newAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oldSummary = summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }, oldAt);
    const newSummary = summaryPayload({ count: 9, status: 'ok' }, { count: 31, status: 'ok' }, newAt);
    const newArticle = cachedNewsItem('news-cache-new-b', 'Longsor tutup jalur lintas barat', newAt);
    const oldRawArticle = rawNewsArticle({
      id: 'news-live-old-a',
      title: 'Banjir lumpuh jalur utama Belawan',
      link: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
      url: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
    });
    await seedPublicCache(page, {
      news: { feed: [newArticle], meta: null, lastUpdated: newAt },
      weather: newSummary,
    });
    await mockDashboardApi(page, {
      bootstrap: bootstrapPayload({ summary: oldSummary, includeMarketRegime: false }),
      summary: oldSummary,
      newsLive: liveNewsPayload([oldRawArticle], oldAt),
      summaryGate: summaryGate.wait,
      newsGate: newsGate.wait,
    });

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Newer cache paints first while live is gated.
    await expect(page.getByTestId('counter-cuaca')).toHaveText('9', { timeout: 60_000 });
    await expect(page.getByTestId('counter-waspada')).toHaveText('31');
    await expect(page.getByTestId('berita-card-news-cache-new-b')).toBeVisible();

    summaryGate.release();
    newsGate.release();

    // Older bootstrap seed + older live payloads arrive — nothing moves.
    await page.waitForResponse((res) => res.url().includes('/weather/summary'), { timeout: 30_000 });
    await page.waitForResponse((res) => res.url().includes('/news/live'), { timeout: 60_000 });
    await page.waitForTimeout(1_500);

    await expect(page.getByTestId('counter-cuaca')).toHaveText('9');
    await expect(page.getByTestId('counter-waspada')).toHaveText('31');
    expect(await storedWeatherGeneratedAt(page)).toBe(newAt);
    await expect(page.getByTestId('berita-card-news-cache-new-b')).toBeVisible();
    await expect(page.getByTestId('berita-card-news-live-old-a')).toHaveCount(0);
    expect(await storedNewsLastUpdated(page)).toBe(newAt);
  });
});
