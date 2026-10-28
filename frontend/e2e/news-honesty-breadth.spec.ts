import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 172 (M9) — Berita honesty + breadth.
 * Phase 172.5 (M9) — two display tiers, one unchanged hazard gate.
 *
 * SPEC decision 7: confidence is tier + calibrated consensus; the static
 * 0.86/0.94 tier constant is NEVER displayed as confidence, and an
 * uncorroborated article reads "Belum terverifikasi".
 * SPEC decision 8: the read path guarantees breadth, so the sidebar groups by
 * province, offers a chip per province, and names provinces with no qualifying
 * 48h article instead of hiding the gap. 172.5 adds `crisis` (gate-passing) and
 * `regional` (display-only context) so a nearly-empty crisis page still shows an
 * honest regional picture — the regional card is labelled, never dressed as a
 * hazard.
 *
 * Hermetic: `/api/v1/news/live` and the shell endpoints are stubbed; the
 * backend is not running.
 */

const DASHBOARD_URL = '/dashboard?guest=1';

type MockArticle = Record<string, unknown>;

const NOW = new Date().toISOString();

function newsArticle(overrides: MockArticle = {}): MockArticle {
  return {
    id: 'breadth-1',
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
    ...overrides,
  };
}

function livePayload(articles: MockArticle[], meta: Record<string, unknown> | null = null) {
  return {
    status: 'live',
    articles,
    items: articles,
    count: articles.length,
    total: articles.length,
    last_updated: NOW,
    ...(meta ? { meta } : {}),
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

async function openDashboard(page: Page) {
  const firstLiveResponse = page.waitForResponse(
    (res) => res.url().includes('/api/v1/news/live'),
    { timeout: 60_000 }
  );
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await firstLiveResponse;
  const sidebar = newsSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 60_000 });
  return sidebar;
}

// ---------------------------------------------------------------------------
// 1. province chips + sticky grouping headers + per-province filtering
// ---------------------------------------------------------------------------

test('(a) province chips group the feed and narrow it', async ({ page }) => {
  await mockDashboardShell(page);

  const articles: MockArticle[] = [
    newsArticle({
      id: 'aceh-1',
      source: 'Tribun Aceh',
      province: 'Aceh',
      title: 'Banjir lumpuh jalur utama di Banda Aceh',
      latitude: 5.5483,
      longitude: 95.3238,
      link: 'https://www.tribunnews.com/regional/4567901/banjir-banda-aceh',
    }),
    newsArticle({
      id: 'aceh-2',
      source: 'Tribun Aceh',
      province: 'Aceh',
      title: 'Longsor tutup jalan lintas di Aceh Besar',
      incident_type: 'landslide',
      latitude: 5.3667,
      longitude: 95.5333,
      link: 'https://www.tribunnews.com/regional/4567902/longsor-aceh-besar',
    }),
    newsArticle({
      id: 'sumut-1',
      source: 'Detik Sumut',
      province: 'Sumatera Utara',
      title: 'Banjir rendam jalur logistik di Medan',
      latitude: 3.5952,
      longitude: 98.6722,
      link: 'https://www.detik.com/sumut/berita/d-6789001/banjir-medan',
    }),
    newsArticle({
      id: 'sumut-2',
      source: 'Detik Sumut',
      province: 'Sumatera Utara',
      title: 'Antrean truk panjang di Pelabuhan Belawan',
      incident_type: 'port_closure',
      latitude: 3.7845,
      longitude: 98.6923,
      link: 'https://www.detik.com/sumut/berita/d-6789002/antrean-belawan',
    }),
    newsArticle({
      id: 'lampung-1',
      source: 'Tribun Lampung',
      province: 'Lampung',
      title: 'Banjir putus jalan lintas di Bandar Lampung',
      latitude: -5.4292,
      longitude: 105.261,
      link: 'https://www.tribunnews.com/regional/4567903/banjir-bandar-lampung',
    }),
  ];

  await page.route('**/api/v1/news/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        livePayload(articles, {
          province_counts: { Aceh: 2, 'Sumatera Utara': 2, Lampung: 1 },
          provinces_present: ['Aceh', 'Sumatera Utara', 'Lampung'],
          provinces_missing: ['Bengkulu'],
          source_counts: { 'Tribun Aceh': 2, 'Detik Sumut': 2, 'Tribun Lampung': 1 },
          truncated: false,
          max_per_source: 12,
          budget: 150,
        })
      ),
    });
  });

  const sidebar = await openDashboard(page);
  await expect(articleCards(page)).toHaveCount(articles.length, { timeout: 30_000 });

  // A chip exists per province in the window.
  await expect(sidebar.getByTestId('news-province-chip-aceh')).toBeVisible();
  await expect(sidebar.getByTestId('news-province-chip-sumatera-utara')).toBeVisible();
  await expect(sidebar.getByTestId('news-province-chip-lampung')).toBeVisible();

  // Grouping headers carry the honest per-province count.
  await expect(sidebar.getByTestId('news-province-count-aceh')).toContainText('2 artikel');
  await expect(sidebar.getByTestId('news-province-count-sumatera-utara')).toContainText('2 artikel');
  await expect(sidebar.getByTestId('news-province-count-lampung')).toContainText('1 artikel');

  // Filtering by one province narrows the list and keeps the search box working.
  await sidebar.getByTestId('news-province-chip-sumatera-utara').click();
  await expect(articleCards(page)).toHaveCount(2, { timeout: 10_000 });
  await expect(
    sidebar.getByRole('heading', { name: 'Banjir rendam jalur logistik di Medan' })
  ).toBeVisible();
  expect(
    await sidebar.getByRole('heading', { name: 'Banjir putus jalan lintas di Bandar Lampung' }).count()
  ).toBe(0);

  const search = sidebar.getByPlaceholder('Cari berita atau lokasi...');
  await search.fill('Belawan');
  await expect(articleCards(page)).toHaveCount(1, { timeout: 10_000 });
  await search.fill('');

  await sidebar.getByTestId('news-province-chip-all').click();
  await expect(articleCards(page)).toHaveCount(articles.length, { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 2 + 3. confidence honesty
// ---------------------------------------------------------------------------

test('(b) an uncorroborated Tier-2 card never shows 86% and says Belum terverifikasi', async ({ page }) => {
  await mockDashboardShell(page);

  const articles: MockArticle[] = [
    newsArticle({
      id: 'unverified-tier2',
      source_tier: 'TIER_2_AUTHORITATIVE_PRESS',
      confidence_score: 0.86,
      title: 'Banjir lumpuh jalan nasional di Banda Aceh',
      link: 'https://www.antaranews.com/berita/4567911/banjir-banda-aceh',
    }),
  ];

  await page.route('**/api/v1/news/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(livePayload(articles)),
    });
  });

  const sidebar = await openDashboard(page);
  const card = sidebar.getByTestId('berita-card-unverified-tier2');
  await expect(card).toBeVisible({ timeout: 30_000 });

  const confidence = card.getByTestId('berita-confidence-unverified-tier2');
  await expect(confidence).toContainText('Belum terverifikasi');
  await expect(confidence).toContainText('TIER 2');
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  expect(text, 'the static Tier-2 constant was rendered as confidence').not.toContain('86%');
});

test('(c) a corroborated card shows its calibrated percentage', async ({ page }) => {
  await mockDashboardShell(page);

  const articles: MockArticle[] = [
    newsArticle({
      id: 'corroborated-sensor',
      source: 'Tribun Sumbar',
      province: 'Sumatera Barat',
      source_tier: 'TIER_2_AUTHORITATIVE_PRESS',
      confidence_score: 0.86,
      title: 'Banjir lumpuh jalur distribusi di Padang',
      latitude: -0.9471,
      longitude: 100.4172,
      link: 'https://www.tribunnews.com/regional/4567912/banjir-padang',
      display_confidence: {
        value: 0.78,
        label: 'Terverifikasi sensor',
        basis: 'sensor_corroborated',
        tier: 'TIER_2_AUTHORITATIVE_PRESS',
      },
    }),
  ];

  await page.route('**/api/v1/news/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(livePayload(articles)),
    });
  });

  const sidebar = await openDashboard(page);
  const card = sidebar.getByTestId('berita-card-corroborated-sensor');
  await expect(card).toBeVisible({ timeout: 30_000 });

  const confidence = card.getByTestId('berita-confidence-corroborated-sensor');
  await expect(confidence).toContainText('78%');
  await expect(confidence).toContainText('Terverifikasi sensor');
  expect((await card.innerText()).replace(/\s+/g, ' ')).not.toContain('86%');
});

// ---------------------------------------------------------------------------
// 4. an empty province is named, never hidden
// ---------------------------------------------------------------------------

test('(d) a province with no 48h article shows the honest empty label', async ({ page }) => {
  await mockDashboardShell(page);

  const articles: MockArticle[] = [
    newsArticle({
      id: 'aceh-only',
      source: 'Tribun Aceh',
      province: 'Aceh',
      title: 'Banjir lumpuh jalur utama di Banda Aceh',
      link: 'https://www.tribunnews.com/regional/4567921/banjir-banda-aceh',
    }),
  ];

  await page.route('**/api/v1/news/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        livePayload(articles, {
          province_counts: { Aceh: 1 },
          provinces_present: ['Aceh'],
          provinces_missing: ['Bengkulu', 'Lampung'],
          truncated: false,
        })
      ),
    });
  });

  const sidebar = await openDashboard(page);
  await expect(articleCards(page)).toHaveCount(1, { timeout: 30_000 });

  const missing = sidebar.getByTestId('news-provinces-missing');
  await expect(missing).toBeVisible();
  await expect(missing).toContainText('Bengkulu');
  await expect(missing).toContainText('Lampung');
  await expect(missing).toContainText('Tidak ada artikel 48 jam');
});

// ---------------------------------------------------------------------------
// 6. Phase 172.5 — crisis / regional display tiers
// ---------------------------------------------------------------------------

test('(e) tier chips split crisis from regional, label context, keep crisis first', async ({ page }) => {
  await mockDashboardShell(page);

  const articles: MockArticle[] = [
    // Regional rows are listed FIRST on purpose: the sidebar must still render
    // the crisis block ahead of context inside each province group.
    newsArticle({
      id: 'tier-regional-aceh',
      relevance_tier: 'regional',
      zone_tier: 'DROPPED_IRRELEVANT',
      source: 'Tribun Aceh',
      province: 'Aceh',
      title: 'Antrean truk di Pelabuhan Banda Aceh',
      summary: 'Antrean truk mengular di pelabuhan dan menunda distribusi barang.',
      latitude: 5.5483,
      longitude: 95.3238,
      link: 'https://www.tribunnews.com/regional/4567931/antrean-truk-banda-aceh',
    }),
    newsArticle({
      id: 'tier-crisis-new',
      relevance_tier: 'crisis',
      source: 'Tribun Aceh',
      province: 'Aceh',
      title: 'Banjir lumpuh jalan nasional di Banda Aceh',
      latitude: 5.5483,
      longitude: 95.3238,
      link: 'https://www.tribunnews.com/regional/4567932/banjir-banda-aceh',
    }),
    newsArticle({
      id: 'tier-crisis-old',
      relevance_tier: 'crisis',
      source: 'Tribun Aceh',
      province: 'Aceh',
      title: 'Longsor tutup jalur lintas di Aceh Besar',
      incident_type: 'landslide',
      latitude: 5.3667,
      longitude: 95.5333,
      link: 'https://www.tribunnews.com/regional/4567933/longsor-aceh-besar',
    }),
    newsArticle({
      id: 'tier-regional-sumut',
      relevance_tier: 'regional',
      zone_tier: 'DROPPED_IRRELEVANT',
      source: 'Detik Sumut',
      province: 'Sumatera Utara',
      title: 'Kapal dan truk tertahan cuaca di Pelabuhan Belawan',
      summary: 'Cuaca buruk menahan kapal dan truk di pelabuhan Belawan.',
      latitude: 3.7845,
      longitude: 98.6923,
      link: 'https://www.detik.com/sumut/berita/d-6789101/kapal-truk-belawan',
    }),
  ];

  await page.route('**/api/v1/news/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        livePayload(articles, {
          province_counts: { Aceh: 3, 'Sumatera Utara': 1 },
          provinces_present: ['Aceh', 'Sumatera Utara'],
          provinces_missing: ['Bengkulu'],
          source_counts: { 'Tribun Aceh': 3, 'Detik Sumut': 1 },
          truncated: false,
          max_per_source: 12,
          budget: 150,
          crisis_count: 2,
          regional_count: 2,
          tier_counts: { crisis: 2, regional: 2 },
        })
      ),
    });
  });

  const sidebar = await openDashboard(page);
  await expect(articleCards(page)).toHaveCount(articles.length, { timeout: 30_000 });

  const renderedIds = () =>
    articleCards(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid') || '')
    );

  // Semua (default) shows both tiers, crisis first inside the province group.
  await expect(sidebar.getByTestId('news-tier-all')).toBeVisible();
  await expect(sidebar.getByTestId('news-tier-crisis')).toBeVisible();
  await expect(sidebar.getByTestId('news-tier-regional')).toBeVisible();
  expect(await renderedIds(), 'crisis block must precede regional context').toEqual([
    'berita-card-tier-crisis-new',
    'berita-card-tier-crisis-old',
    'berita-card-tier-regional-aceh',
    'berita-card-tier-regional-sumut',
  ]);

  // A regional card is labelled as context, and never dressed as a hazard zone.
  const regionalCard = sidebar.getByTestId('berita-card-tier-regional-aceh');
  await expect(regionalCard.getByTestId('berita-tier-label-tier-regional-aceh')).toBeVisible();
  await expect(regionalCard.getByTestId('berita-tier-label-tier-regional-aceh')).toHaveText('Regional');
  expect(
    await sidebar
      .getByTestId('berita-card-tier-crisis-new')
      .getByTestId('berita-tier-label-tier-crisis-new')
      .count(),
    'a crisis card must not carry the neutral regional label'
  ).toBe(0);

  // Krisis chip: only gate-passing rows.
  await sidebar.getByTestId('news-tier-crisis').click();
  await expect(articleCards(page)).toHaveCount(2, { timeout: 10_000 });
  expect(await renderedIds()).toEqual([
    'berita-card-tier-crisis-new',
    'berita-card-tier-crisis-old',
  ]);

  // Regional chip: only context rows, still labelled.
  await sidebar.getByTestId('news-tier-regional').click();
  await expect(articleCards(page)).toHaveCount(2, { timeout: 10_000 });
  expect(await renderedIds()).toEqual([
    'berita-card-tier-regional-aceh',
    'berita-card-tier-regional-sumut',
  ]);
  await expect(
    sidebar.getByTestId('berita-tier-label-tier-regional-sumut')
  ).toBeVisible();

  // Back to Semua: the full page returns.
  await sidebar.getByTestId('news-tier-all').click();
  await expect(articleCards(page)).toHaveCount(articles.length, { timeout: 10_000 });

  // Province chips (172) still compose with the tier chips (172.5).
  await sidebar.getByTestId('news-province-chip-aceh').click();
  await expect(articleCards(page)).toHaveCount(3, { timeout: 10_000 });
  await sidebar.getByTestId('news-tier-crisis').click();
  await expect(articleCards(page)).toHaveCount(2, { timeout: 10_000 });
  await sidebar.getByTestId('news-province-chip-all').click();
  await expect(articleCards(page)).toHaveCount(2, { timeout: 10_000 });
  await sidebar.getByTestId('news-tier-all').click();
  await expect(articleCards(page)).toHaveCount(articles.length, { timeout: 10_000 });
});
