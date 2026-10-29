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
//  2. Cached weather/news (< 2 h, `prehub.weather.v2` / `prehub.news.v2`)
//     paint before any network dependency resolves.
//  3. A newer live payload replaces an older cached payload, while an older
//     payload never moves the data timestamp backward (counters, stored
//     cache, and the news feed clock).
//  4. A snapshot seed never suppresses the mount live read: a seeded
//     fire/weather section still triggers an immediate live request.
//  5. A degraded (null-count) seeded weather summary never vetoes a good live
//     summary, and never poisons the last-good cache.

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

/** Normalized (already gated) article as stored in `prehub.news.v2`. */
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

/** A healthy, populated fire seed (`sections.fire_hotspots`), pre-fix regressed. */
function populatedFireSeed() {
  return {
    ...emptyFirePayload(),
    status: 'ok',
    count: 3,
    total: 3,
    hotspots: [
      { id: 'seed-fire-1', lat: 3.5, lon: 98.7, confidence: 90, frp: 120, severity: 'high' },
      { id: 'seed-fire-2', lat: 2.1, lon: 99.4, confidence: 85, frp: 80, severity: 'medium' },
      { id: 'seed-fire-3', lat: 0.4, lon: 101.2, confidence: 92, frp: 140, severity: 'high' },
    ],
  };
}

/** A healthy, populated polygon seed (`sections.weather_spatial_polygons`). */
function populatedPolygonSeed() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[98.5, 3.4], [99.0, 3.4], [99.0, 3.9], [98.5, 3.9], [98.5, 3.4]]],
        },
        properties: { hazard_type: 'flood', severity: 'high', corridor_id: 'sumatra_belawan_medan' },
      },
    ],
    meta: {
      status: 'ok',
      reason: null,
      total: 1,
      count: 1,
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
  /** `sections.fire_hotspots.data` seed (defaults to a healthy empty payload). */
  fireSeed?: unknown;
  /** `sections.weather_spatial_polygons.data` seed (defaults to a healthy empty payload). */
  polygonSeed?: unknown;
}

function bootstrapPayload(opts: BootstrapOptions) {
  const sections: Record<string, unknown> = {
    incidents: { status: 'ok', data: { items: [], total: 0 } },
    corridor_context: { status: 'ok', data: corridorPayload() },
    weather_summary: { status: 'ok', data: opts.summary },
    weather_spatial_polygons: { status: 'ok', data: opts.polygonSeed ?? emptyPolygonsPayload() },
    fire_hotspots: { status: 'ok', data: opts.fireSeed ?? emptyFirePayload() },
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
  /** GET /api/v1/fire/hotspots response (defaults to the healthy empty payload). */
  fireLive?: unknown;
  /** GET /api/v1/weather/spatial-polygons response (defaults to the empty payload). */
  polygonsLive?: unknown;
  bootstrapGate?: Promise<void>;
  summaryGate?: Promise<void>;
  newsGate?: Promise<void>;
  fireGate?: Promise<void>;
  polygonsGate?: Promise<void>;
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
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      if (mocks.polygonsGate) await mocks.polygonsGate;
      return ok(mocks.polygonsLive ?? emptyPolygonsPayload());
    }
    if (url.includes('/api/v1/fire/hotspots')) {
      if (mocks.fireGate) await mocks.fireGate;
      return ok(mocks.fireLive ?? emptyFirePayload());
    }
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
        localStorage.setItem('prehub.news.v2', JSON.stringify({ v: 2, at: Date.now(), data: value.news }));
      }
      if (value.weather) {
        localStorage.setItem(
          'prehub.weather.v2',
          JSON.stringify({ v: 2, at: Date.now(), data: value.weather }),
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
  const raw = await page.evaluate(() => localStorage.getItem('prehub.weather.v2'));
  try {
    return (JSON.parse(raw ?? '') as { data?: { generated_at?: string } })?.data?.generated_at ?? null;
  } catch {
    return null;
  }
}

async function storedNewsLastUpdated(page: Page): Promise<string | null> {
  const raw = await page.evaluate(() => localStorage.getItem('prehub.news.v2'));
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

  test('a seeded fire/weather section still triggers an immediate live refresh on mount', async ({ page }) => {
    const fireGate = gate();
    const polygonsGate = gate();
    const generatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const summary = summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }, generatedAt);
    // The maximum risk seed: healthy sections with data, so the pre-fix client
    // skipped both mount reads until the first 300 s / 120 s poll tick.
    await mockDashboardApi(page, {
      bootstrap: bootstrapPayload({ summary, fireSeed: populatedFireSeed(), polygonSeed: populatedPolygonSeed() }),
      summary,
      newsLive: { status: 'warming', articles: [], items: [], total: 0, count: 0, last_updated: generatedAt },
      fireGate: fireGate.wait,
      polygonsGate: polygonsGate.wait,
    });

    // Set up the request watchers before navigation: the mount read must be
    // immediate, not deferred to a poll interval.
    const fireRequest = page.waitForRequest(
      (req) => req.url().includes('/api/v1/fire/hotspots'),
      { timeout: 30_000 },
    );
    const polygonsRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/weather/spatial-polygons') &&
        req.url().includes('min_severity=high'),
      { timeout: 30_000 },
    );

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await fireRequest;
    await polygonsRequest;

    // Watchers first, then release: a fulfilled response can arrive before the
    // next waitForResponse setup otherwise.
    const fireResponse = page.waitForResponse(
      (res) => res.url().includes('/api/v1/fire/hotspots'),
      { timeout: 30_000 },
    );
    const polygonsResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/weather/spatial-polygons') &&
        res.url().includes('min_severity=high'),
      { timeout: 30_000 },
    );

    // The live envelopes settle and overwrite the painted seeds.
    fireGate.release();
    polygonsGate.release();
    await fireResponse;
    await polygonsResponse;
  });

  test('a degraded seeded weather summary never vetoes a good live summary', async ({ page }) => {
    const summaryGate = gate();
    // Degraded snapshot: `generated_at` = wall-clock now with null counts.
    const degradedSummary = summaryPayload(
      { count: null, status: 'degraded' },
      { count: null, status: 'degraded' },
      new Date().toISOString(),
    );
    // Good live fusion: real counts with an older `generated_at`.
    const liveStamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const liveSummary = summaryPayload({ count: 7, status: 'ok' }, { count: 12, status: 'ok' }, liveStamp);
    await mockDashboardApi(page, {
      bootstrap: bootstrapPayload({ summary: degradedSummary, includeMarketRegime: false }),
      summary: liveSummary,
      newsLive: { status: 'warming', articles: [], items: [], total: 0, count: 0, last_updated: liveStamp },
      summaryGate: summaryGate.wait,
    });

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // The incomplete seed paints nothing (counters stay unknown) and it is
    // never cached — so it cannot veto the live summary below.
    await expect(page.getByTestId('counter-cuaca')).toHaveText('—', { timeout: 60_000 });
    expect(await storedWeatherGeneratedAt(page)).toBeNull();

    summaryGate.release();
    await page.waitForResponse((res) => res.url().includes('/weather/summary'), { timeout: 30_000 });

    // The good live summary wins despite its older fusion stamp.
    await expect(page.getByTestId('counter-cuaca')).toHaveText('7', { timeout: 30_000 });
    await expect(page.getByTestId('counter-waspada')).toHaveText('12');
    await expect.poll(() => storedWeatherGeneratedAt(page), { timeout: 30_000 }).toBe(liveStamp);
  });

  test('a wall-clock seeded news clock never freezes a newer live feed', async ({ page }) => {
    const bootstrapGate = gate();
    const newsGate = gate();
    const articleTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Seed stamp is wall-clock now — more than 10 min ahead of the article data.
    const seedArticle = rawNewsArticle({
      id: 'news-seed-clock-1',
      title: 'Banjir lumpuh jalur utama Belawan',
      link: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
      url: GOOD_LINK('4567890', 'banjir-lumpuh-belawan'),
    });
    const liveArticles = [
      seedArticle,
      rawNewsArticle({
        id: 'news-live-clock-2',
        title: 'Longsor tutup jalur lintas barat',
        summary: 'Longsor menutup badan jalan lintas barat dan antrean kendaraan mengular.',
        latitude: -0.9492,
        longitude: 100.3543,
        link: GOOD_LINK('4567891', 'longsor-tutup-jalur-barat'),
        url: GOOD_LINK('4567891', 'longsor-tutup-jalur-barat'),
      }),
    ];
    await mockDashboardApi(page, {
      // Live `last_updated` = the article data clock (max published_at),
      // older than the wall-clock seed stamp.
      bootstrap: bootstrapPayload({
        newsArticles: [seedArticle],
        newsLastUpdated: new Date().toISOString(),
        summary: summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }, articleTs),
      }),
      summary: summaryPayload({ count: 5, status: 'ok' }, { count: 27, status: 'ok' }, articleTs),
      newsLive: liveNewsPayload(liveArticles, articleTs),
      bootstrapGate: bootstrapGate.wait,
      newsGate: newsGate.wait,
    });

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Seed paints first (its stamp is repaired down to the article clock).
    bootstrapGate.release();
    await expect(page.getByTestId('berita-card-news-seed-clock-1')).toBeVisible({ timeout: 60_000 });

    // The changed article set with a same-or-newer data clock must replace
    // the feed — the fabricated seed stamp must not freeze it.
    newsGate.release();
    await expect(page.getByTestId('berita-card-news-live-clock-2')).toBeVisible({ timeout: 60_000 });
  });
});
