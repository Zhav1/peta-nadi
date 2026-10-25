import { test, expect, type Page } from '@playwright/test';

/**
 * Phase: Strict live audit of the OSINT news sidebar.
 *
 * These specs are intentionally adversarial: every assertion targets the
 * *behaviour* the product promises, not the current implementation. A red
 * test here means the live news pipeline still violates that promise.
 *
 * Contract under audit
 * --------------------
 * (a) `status: "warming"` + empty articles  -> honest warming/empty state and
 *     ZERO FALLBACK_SUMATRA_NEWS content (no fabricated Belawan/Malaka/Lau Cih/
 *     Sitinjau/Kualanamu/Belmera headlines, no FALLBACK-* ids).
 * (b) live articles with unresolvable links (bare publisher root, dummy numeric
 *     id, news.google.com/search) -> the item must be dropped, never rewritten
 *     into a `/search?q=` or `news.google.com/search` anchor.
 * (c) same article ids polled twice with a different `last_updated` -> the
 *     per-article pubDate stays frozen and the global "diperbarui" clock must
 *     not advance while the id set is unchanged.
 * (d) 10-province feed -> non-Sumut (i.e. outside Sumatera Utara) provinces are
 *     actually reachable through the sidebar search/filter.
 * (e) expanded provider set (Tribun network in Padang/Batam/Aceh/Lampung/
 *     Palembang + Detik Finance + Katadata + Republika + Antara Kepri) -> every
 *     outlet renders with its own source badge, the province filter still
 *     narrows the feed, and no item is rewritten into a `/search?q=` anchor.
 * (f) DB-cache token saving -> two byte-identical polls must be served from the
 *     client cache: the second poll performs no `/api/v1/news/verify` call, no
 *     LLM call, no cache-busting re-fetch beyond the regular poll, and every
 *     per-article text stays frozen.
 *
 * The dashboard is served from the standalone Next bundle; the backend is not
 * running, so every network dependency used by the sidebar is stubbed here.
 */

const DASHBOARD_URL = '/dashboard?guest=1';

// Distinctive tokens from every FALLBACK_SUMATRA_NEWS fixture (Belawan port,
// Selat Malaka marine warning, Lau Cih market, Sitinjau Lauik landslide,
// Kualanamu weather, Belmera toll). They are chosen to be literal substrings of
// the rendered copy so a leaked fixture cannot slip through as a false pass.
const FALLBACK_MARKERS = [
  'Operasional Terminal Petikemas Belawan',
  'Selat Malaka',
  'Lau Cih',
  'Sitinjau Lauik',
  'Kualanamu',
  'Tol Belmera',
];

const FALLBACK_ID = 'FALLBACK-BLW-01';

type MockArticle = Record<string, unknown>;

function newsArticle(overrides: MockArticle = {}): MockArticle {
  return {
    id: 'audit-article-1',
    source: 'ANTARA Sumut',
    source_tier: 'TIER_1_OFFICIAL',
    title: 'Banjir lumpuh jalan nasional di Belawan',
    summary: 'Banjir merendam badan jalan nasional dan memutus arus kendaraan logistik di Belawan.',
    pubDate: new Date().toISOString(),
    latitude: 3.7845,
    longitude: 98.6923,
    severity: 'high',
    incident_type: 'flood',
    zone_tier: 'RED_CONFIRMED',
    link_alive: 'alive',
    ...overrides,
  };
}

function livePayload(articles: MockArticle[], lastUpdated = new Date().toISOString()) {
  return {
    status: 'live',
    articles,
    items: articles,
    count: articles.length,
    total: articles.length,
    last_updated: lastUpdated,
  };
}

/** Stub the non-news shell endpoints the dashboard needs to settle. */
async function mockDashboardShell(page: Page) {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.route('**/api/v1/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  // Referenced from phase57-pilot-hardening.spec.ts:421 — keeps the HITL gate
  // from opening over the news sidebar.
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

/** The left "Berita" sidebar (the only aside that owns the Berita heading). */
function newsSidebar(page: Page) {
  return page
    .locator('aside')
    .filter({ has: page.getByRole('heading', { name: 'Berita', exact: true }) })
    .first();
}

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

test.describe('Strict live audit — news sidebar', () => {
  test('(a) warming + empty articles never renders FALLBACK_SUMATRA_NEWS', async ({ page }) => {
    await mockDashboardShell(page);
    await page.route('**/api/v1/news/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'warming',
          articles: [],
          items: [],
          count: 0,
          total: 0,
          last_updated: new Date().toISOString(),
        }),
      });
    });

    const sidebar = await openDashboard(page);
    // Let React commit the warming response before snapshotting the DOM.
    await page.waitForTimeout(1_000);

    const sidebarText = (await sidebar.innerText()).replace(/\s+/g, ' ');
    const cardCount = await articleCards(page).count();

    // 1. No fabricated Sumatra fixtures, under any wording.
    for (const marker of FALLBACK_MARKERS) {
      expect
        .soft(sidebarText, `FALLBACK_SUMATRA_NEWS marker "${marker}" rendered during warming`)
        .not.toContain(marker);
    }
    expect.soft(sidebarText, 'FALLBACK id leaked into the warming UI').not.toContain('FALLBACK-');
    expect.soft(sidebarText, `fixture id ${FALLBACK_ID} leaked into the warming UI`).not.toContain(FALLBACK_ID);
    expect.soft(sidebarText, 'offline fixture is still labelled as a live source').not.toContain(
      'Sumber Cadangan (Offline)'
    );

    // 2. An empty warming feed must not paint fixture cards.
    expect.soft(cardCount, 'warming + empty articles rendered article cards').toBe(0);

    // 3. An honest warming/empty state must be visible instead.
    await expect
      .soft(
        sidebar
          .getByText(/warming|menghangatkan|menyiapkan|memuat berita|mengambil berita|belum ada berita/i)
          .first(),
        'no warming/empty-state copy rendered for status:"warming" with zero articles'
      )
      .toBeVisible({ timeout: 5_000 });
  });

  test('(b) unresolvable source links are dropped, never rewritten to search URLs', async ({ page }) => {
    await mockDashboardShell(page);

    const GOOD_LINK =
      'https://www.antaranews.com/berita/4567890/banjir-lumpuh-jalur-lampung';
    const articles: MockArticle[] = [
      newsArticle({
        id: 'audit-bare-root',
        title: 'Banjir lumpuh akses pelabuhan di Belawan',
        link: 'https://www.antaranews.com/',
        url: 'https://www.antaranews.com/',
      }),
      newsArticle({
        id: 'audit-dummy-id',
        title: 'Banjir lumpuh jalur logistik di Medan',
        link: 'https://www.antaranews.com/berita/999999',
        url: 'https://www.antaranews.com/berita/999999',
      }),
      newsArticle({
        id: 'audit-google-search',
        title: 'Banjir lumpuh koridor timur di Palembang',
        link: 'https://news.google.com/search?q=banjir%20palembang',
        url: 'https://news.google.com/search?q=banjir%20palembang',
        latitude: -3.0123,
        longitude: 104.7754,
      }),
      newsArticle({
        id: 'audit-good-link',
        title: 'Banjir lumpuh jalur utama Lampung',
        link: GOOD_LINK,
        url: GOOD_LINK,
        latitude: -5.4292,
        longitude: 105.261,
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
    await expect(
      sidebar.getByText('Banjir lumpuh jalur utama Lampung', { exact: false }),
      'resolvable article never rendered — feed did not load mocked live payload'
    ).toBeVisible({ timeout: 30_000 });

    const hrefs = await sidebar
      .locator('a[href]')
      .evaluateAll((nodes) =>
        Array.from(new Set(nodes.map((node) => node.getAttribute('href') || '')))
      );

    const searchRewrites = hrefs.filter(
      (href) => /\/search\?q=/.test(href) || href.includes('news.google.com/search')
    );
    const bareRoots = hrefs.filter((href) => {
      try {
        const parsed = new URL(href);
        return (parsed.pathname === '/' || parsed.pathname === '') && !parsed.search;
      } catch {
        return false;
      }
    });

    expect
      .soft(searchRewrites, 'unresolvable links were rewritten into search URLs instead of dropped')
      .toEqual([]);
    expect
      .soft(bareRoots, 'bare publisher roots were rendered as article links instead of dropped')
      .toEqual([]);
    expect.soft(hrefs, 'resolvable permalink was not preserved').toContain(GOOD_LINK);
  });

  test('(c) identical article ids freeze per-article pubDate and the global updated clock', async ({ page }) => {
    await mockDashboardShell(page);

    const HEADLINE = 'Banjir lumpuh jalur utama di Belawan';
    const LINK = 'https://www.antaranews.com/berita/4567890/banjir-lumpuh-belawan';
    const firstPubDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const secondPubDate = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const firstUpdated = new Date().toISOString();
    const secondUpdated = new Date(Date.now() + 45_000).toISOString();

    let livePolls = 0;
    await page.route('**/api/v1/news/live', async (route) => {
      livePolls += 1;
      const isFirst = livePolls === 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          livePayload(
            [
              newsArticle({
                id: 'audit-stable-id',
                title: HEADLINE,
                link: LINK,
                url: LINK,
                pubDate: isFirst ? firstPubDate : secondPubDate,
              }),
            ],
            isFirst ? firstUpdated : secondUpdated
          )
        ),
      });
    });

    const sidebar = await openDashboard(page);
    const card = articleCards(page).filter({ hasText: HEADLINE }).first();
    await expect(card, 'mocked live article never rendered').toBeVisible({ timeout: 30_000 });

    const pubStamp = card.locator('span.text-slate-400.truncate').first();
    await expect(pubStamp, 'per-article pubDate span not found').toBeVisible({ timeout: 10_000 });
    const pubBefore = (await pubStamp.innerText()).trim();

    const updatedLabel = sidebar.getByText(/diperbarui/i).first();
    await expect
      .soft(updatedLabel, 'no global "diperbarui" clock rendered in the news sidebar')
      .toBeVisible({ timeout: 5_000 });
    const updatedBefore = (await updatedLabel.count()) > 0 ? (await updatedLabel.innerText()).trim() : '';
    expect
      .soft(updatedBefore, 'global "diperbarui" clock is empty before the second poll')
      .not.toBe('');

    // Wait for the hook's 30s poll to deliver the second (same-id) payload.
    await expect
      .poll(() => livePolls, { timeout: 45_000, message: 'second /api/v1/news/live poll never fired' })
      .toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(1_000);

    const pubAfter = (await pubStamp.innerText()).trim();
    expect
      .soft(
        pubAfter,
        `per-article pubDate advanced while the id set was unchanged: "${pubBefore}" -> "${pubAfter}" (feed was re-derived instead of frozen)`
      )
      .toBe(pubBefore);

    if (updatedBefore) {
      const updatedAfter = (await updatedLabel.innerText()).trim();
      expect
        .soft(
          updatedAfter,
          `global "diperbarui" clock advanced with an identical id set: "${updatedBefore}" -> "${updatedAfter}"`
        )
        .toBe(updatedBefore);
    }
  });

  test('(d) multi-province feed exposes non-Sumut provinces (Kepri + Lampung)', async ({ page }) => {
    await mockDashboardShell(page);

    const provinces: Array<{ province: string; city: string; lat: number; lon: number }> = [
      { province: 'Aceh', city: 'Banda Aceh', lat: 5.5483, lon: 95.3238 },
      { province: 'Sumut', city: 'Medan', lat: 3.5952, lon: 98.6722 },
      { province: 'Sumbar', city: 'Padang', lat: -0.9471, lon: 100.4172 },
      { province: 'Riau', city: 'Pekanbaru', lat: 0.5071, lon: 101.4478 },
      { province: 'Kepri', city: 'Batam', lat: 1.1301, lon: 104.0529 },
      { province: 'Jambi', city: 'Jambi', lat: -1.6101, lon: 103.6131 },
      { province: 'Sumsel', city: 'Palembang', lat: -2.9761, lon: 104.7754 },
      { province: 'Babel', city: 'Pangkal Pinang', lat: -2.1316, lon: 106.1169 },
      { province: 'Bengkulu', city: 'Bengkulu', lat: -3.7928, lon: 102.2608 },
      { province: 'Lampung', city: 'Bandar Lampung', lat: -5.4292, lon: 105.261 },
    ];

    const articles = provinces.map(({ province, city, lat, lon }, index) =>
      newsArticle({
        id: `audit-prov-${index + 1}`,
        title: `${province}: banjir lumpuh jalan nasional di ${city}`,
        summary: `Banjir merendam jalan nasional di ${city} dan memutus arus kendaraan logistik.`,
        location_name: `${city}, ${province}`,
        latitude: lat,
        longitude: lon,
        severity: province === 'Kepri' || province === 'Lampung' ? 'critical' : 'high',
        link: `https://www.antaranews.com/berita/456789${index}/banjir-${province.toLowerCase()}`,
      })
    );

    await page.route('**/api/v1/news/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(livePayload(articles)),
      });
    });

    const sidebar = await openDashboard(page);
    const search = sidebar.getByPlaceholder('Cari berita atau lokasi...');
    await expect(search, 'news search/filter input not found').toBeVisible({ timeout: 30_000 });

    // Every province in the mocked feed must survive the client display gate.
    await expect
      .soft(articleCards(page), 'mocked multi-province feed was not fully rendered')
      .toHaveCount(provinces.length, { timeout: 30_000 });

    // Kepri (non-Sumut) must be reachable through the filter.
    await search.fill('Kepri');
    await expect
      .soft(
        sidebar.getByText('Kepri: banjir lumpuh jalan nasional di Batam', { exact: false }),
        'Kepri item is not reachable through the news filter/search'
      )
      .toBeVisible({ timeout: 10_000 });
    expect
      .soft(await sidebar.getByText('Aceh: banjir lumpuh jalan nasional di Banda Aceh', { exact: false }).count())
      .toBe(0);

    // Lampung (non-Sumut) must be reachable through the filter.
    await search.fill('Lampung');
    await expect
      .soft(
        sidebar.getByText('Lampung: banjir lumpuh jalan nasional di Bandar Lampung', { exact: false }),
        'Lampung item is not reachable through the news filter/search'
      )
      .toBeVisible({ timeout: 10_000 });
    expect
      .soft(await sidebar.getByText('Aceh: banjir lumpuh jalan nasional di Banda Aceh', { exact: false }).count())
      .toBe(0);
  });

  test('(e) expanded providers render every outlet and the province filter still narrows', async ({ page }) => {
    await mockDashboardShell(page);

    // Tribun's city editions carry the province in the outlet name, so the
    // sidebar must render the provider badge verbatim while the headline stays
    // province-searchable. The national outlets are interleaved to prove the
    // feed is not silently collapsed onto a single source.
    const providers: Array<{
      source: string;
      headline: string;
      location: string;
      lat: number;
      lon: number;
      link: string;
    }> = [
      {
        source: 'Tribun Padang',
        headline: 'Banjir lumpuh jalan nasional di Padang',
        location: 'Padang, Sumbar',
        lat: -0.9471,
        lon: 100.4172,
        link: 'https://www.tribunnews.com/regional/4567801/banjir-lumpuh-jalan-nasional-padang',
      },
      {
        source: 'Tribun Batam',
        headline: 'Banjir lumpuh akses pelabuhan di Batam',
        location: 'Batam, Kepri',
        lat: 1.1301,
        lon: 104.0529,
        link: 'https://www.tribunnews.com/regional/4567802/banjir-lumpuh-akses-pelabuhan-batam',
      },
      {
        source: 'Tribun Aceh',
        headline: 'Banjir lumpuh jalur utama di Banda Aceh',
        location: 'Banda Aceh, Aceh',
        lat: 5.5483,
        lon: 95.3238,
        link: 'https://www.tribunnews.com/regional/4567803/banjir-lumpuh-jalur-utama-banda-aceh',
      },
      {
        source: 'Tribun Lampung',
        headline: 'Banjir lumpuh jalan lintas di Bandar Lampung',
        location: 'Bandar Lampung, Lampung',
        lat: -5.4292,
        lon: 105.261,
        link: 'https://www.tribunnews.com/regional/4567804/banjir-lumpuh-jalan-lintas-bandar-lampung',
      },
      {
        source: 'Tribun Palembang',
        headline: 'Banjir lumpuh jalur logistik di Palembang',
        location: 'Palembang, Sumsel',
        lat: -2.9761,
        lon: 104.7754,
        link: 'https://www.tribunnews.com/regional/4567805/banjir-lumpuh-jalur-logistik-palembang',
      },
      {
        source: 'Detik Finance',
        headline: 'Banjir lumpuh arus barang di Medan',
        location: 'Medan, Sumut',
        lat: 3.5952,
        lon: 98.6722,
        link: 'https://finance.detik.com/berita-ekonomi-bisnis/d-6789012/banjir-lumpuh-arus-barang-medan',
      },
      {
        source: 'Katadata',
        headline: 'Banjir lumpuh jalur distribusi di Pekanbaru',
        location: 'Pekanbaru, Riau',
        lat: 0.5071,
        lon: 101.4478,
        link: 'https://katadata.co.id/berita/ekonomi/6789013/banjir-lumpuh-jalur-distribusi-pekanbaru',
      },
      {
        source: 'Republika',
        headline: 'Banjir lumpuh akses jalan nasional di Jambi',
        location: 'Jambi, Jambi',
        lat: -1.6101,
        lon: 103.6131,
        link: 'https://www.republika.co.id/berita/s9xyz123/banjir-lumpuh-akses-jalan-nasional-jambi',
      },
      {
        source: 'Antara Kepri',
        headline: 'Banjir lumpuh jalur pelabuhan di Tanjungpinang',
        location: 'Tanjungpinang, Kepri',
        lat: 0.9186,
        lon: 104.4467,
        link: 'https://www.antaranews.com/berita/4567895/banjir-lumpuh-jalur-pelabuhan-tanjungpinang',
      },
    ];

    const articles = providers.map(({ source, headline, location, lat, lon, link }, index) =>
      newsArticle({
        id: `audit-provider-${index + 1}`,
        source,
        source_tier: 'TIER_2_AUTHORITATIVE_PRESS',
        title: headline,
        summary: `${headline}. Air merendam badan jalan dan memutus arus kendaraan logistik di ${location}.`,
        location_name: location,
        latitude: lat,
        longitude: lon,
        link,
        url: link,
      })
    );

    await page.route('**/api/v1/news/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(livePayload(articles)),
      });
    });

    const sidebar = await openDashboard(page);

    // 1. Every outlet survives the client display gate — no provider is dropped.
    await expect
      .soft(articleCards(page), 'expanded provider feed was not fully rendered')
      .toHaveCount(providers.length, { timeout: 30_000 });

    // 2. Each outlet owns a visible source badge (not collapsed to ANTARA/BERITA).
    for (const provider of providers) {
      await expect
        .soft(
          sidebar.getByText(provider.source, { exact: true }).first(),
          `source badge "${provider.source}" never rendered in the news sidebar`
        )
        .toBeVisible({ timeout: 10_000 });
    }

    // 3. No unresolvable link was rewritten into a search anchor.
    const hrefs = await sidebar
      .locator('a[href]')
      .evaluateAll((nodes) =>
        Array.from(new Set(nodes.map((node) => node.getAttribute('href') || '')))
      );
    expect
      .soft(
        hrefs.filter((href) => /\/search\?q=/.test(href) || href.includes('news.google.com/search')),
        'a provider link was rewritten into a search URL instead of being dropped'
      )
      .toEqual([]);

    // 4. The province filter still narrows the expanded provider set.
    const search = sidebar.getByPlaceholder('Cari berita atau lokasi...');
    await expect(search, 'news search/filter input not found').toBeVisible({ timeout: 10_000 });

    await search.fill('Batam');
    await expect
      .soft(
        sidebar.getByRole('heading', { name: 'Banjir lumpuh akses pelabuhan di Batam' }),
        'Batam provider item is not reachable through the news filter/search'
      )
      .toBeVisible({ timeout: 10_000 });
    expect
      .soft(
        await sidebar
          .getByRole('heading', { name: 'Banjir lumpuh jalan nasional di Padang' })
          .count(),
        'Padang item leaked through a Batam-only filter'
      )
      .toBe(0);

    await search.fill('Palembang');
    await expect
      .soft(
        sidebar.getByRole('heading', { name: 'Banjir lumpuh jalur logistik di Palembang' }),
        'Palembang provider item is not reachable through the news filter/search'
      )
      .toBeVisible({ timeout: 10_000 });
    expect
      .soft(
        await sidebar
          .getByRole('heading', { name: 'Banjir lumpuh akses pelabuhan di Batam' })
          .count(),
        'Batam item leaked through a Palembang-only filter'
      )
      .toBe(0);

    // 5. Clearing the filter restores the full provider feed.
    await search.fill('');
    await expect
      .soft(articleCards(page), 'clearing the filter did not restore the full provider feed')
      .toHaveCount(providers.length, { timeout: 10_000 });

    // 6. Still no fabricated Sumatra fixtures anywhere in the expanded feed.
    const sidebarText = (await sidebar.innerText()).replace(/\s+/g, ' ');
    for (const marker of FALLBACK_MARKERS) {
      expect
        .soft(sidebarText, `FALLBACK_SUMATRA_NEWS marker "${marker}" rendered with new providers`)
        .not.toContain(marker);
    }
    expect.soft(sidebarText, 'FALLBACK id leaked with the expanded provider set').not.toContain('FALLBACK-');
  });

  test('(f) identical re-poll is served from cache: no re-verify, no LLM call, text frozen', async ({ page }) => {
    await mockDashboardShell(page);

    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    const frozenUpdated = new Date(Date.now() - 90_000).toISOString();
    const articles: MockArticle[] = [
      newsArticle({
        id: 'audit-cache-1',
        source: 'Tribun Batam',
        title: 'Banjir lumpuh akses pelabuhan di Batam',
        link: 'https://www.tribunnews.com/regional/4567811/banjir-lumpuh-akses-pelabuhan-batam',
        url: 'https://www.tribunnews.com/regional/4567811/banjir-lumpuh-akses-pelabuhan-batam',
        location_name: 'Batam, Kepri',
        latitude: 1.1301,
        longitude: 104.0529,
        pubDate: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      }),
      newsArticle({
        id: 'audit-cache-2',
        source: 'Katadata',
        title: 'Banjir lumpuh jalur distribusi di Pekanbaru',
        link: 'https://katadata.co.id/berita/ekonomi/6789021/banjir-lumpuh-jalur-distribusi-pekanbaru',
        url: 'https://katadata.co.id/berita/ekonomi/6789021/banjir-lumpuh-jalur-distribusi-pekanbaru',
        location_name: 'Pekanbaru, Riau',
        latitude: 0.5071,
        longitude: 101.4478,
        pubDate: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
      }),
      newsArticle({
        id: 'audit-cache-3',
        source: 'Antara Kepri',
        title: 'Banjir lumpuh jalur pelabuhan di Tanjungpinang',
        link: 'https://www.antaranews.com/berita/4567896/banjir-lumpuh-jalur-pelabuhan-tanjungpinang',
        url: 'https://www.antaranews.com/berita/4567896/banjir-lumpuh-jalur-pelabuhan-tanjungpinang',
        location_name: 'Tanjungpinang, Kepri',
        latitude: 0.9186,
        longitude: 104.4467,
        pubDate: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
      }),
    ];

    // Byte-identical body on every poll: this is the DB/CDN cache hit shape.
    const cachedBody = JSON.stringify(livePayload(articles, frozenUpdated));
    let livePolls = 0;
    const liveUrls: string[] = [];
    await page.route('**/api/v1/news/live', async (route) => {
      livePolls += 1;
      liveUrls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: cachedBody,
      });
    });

    const sidebar = await openDashboard(page);
    const cards = articleCards(page);
    await expect(cards, 'cached live feed never rendered').toHaveCount(articles.length, { timeout: 30_000 });
    await page.waitForTimeout(1_000);

    // Baseline: per-article text of the first (cache-warm) render.
    const textBefore = await cards.evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
    );
    expect(textBefore, 'per-article text snapshot is empty').toHaveLength(articles.length);

    const requestCountBefore = requests.length;

    // Second poll: the hook's 30s interval returns the same cached body.
    await expect
      .poll(() => livePolls, { timeout: 45_000, message: 'second /api/v1/news/live poll never fired' })
      .toBeGreaterThanOrEqual(2);
    // Grace window: any verification/LLM side effect would land right after the poll.
    await page.waitForTimeout(2_000);

    const duringSecondPoll = requests.slice(requestCountBefore);

    // 1. Token-saving contract: a cache hit must never re-run verification.
    const verifyCalls = requests.filter((url) => /\/news\/verify(\/|\?|$)/.test(url));
    expect
      .soft(verifyCalls, 'a cache hit triggered /api/v1/news/verify instead of reusing the stored result')
      .toEqual([]);

    // 2. No LLM/agent endpoint is hit on a cache hit either.
    const llmCalls = duringSecondPoll.filter((url) =>
      /\/api\/v1\/(llm|ai|generate|completion|inference|agent)(\/|\?|$)/i.test(url)
    );
    expect
      .soft(llmCalls, 'a cache hit triggered an LLM/agent call instead of reusing the stored result')
      .toEqual([]);

    // 3. No extra data fetch beyond the regular poll: the only news endpoints hit
    //    after the cache-warm render are the periodic live/market-regime polls
    //    (and the shell's HITL polling), each exactly once.
    const newsCalls = duringSecondPoll.filter((url) => url.includes('/api/v1/news'));
    const unexpectedNewsCalls = newsCalls.filter(
      (url) => !/\/api\/v1\/news\/(live|market-regime|hitl-pending)(\/|\?|$)/.test(url)
    );
    expect
      .soft(unexpectedNewsCalls, 'the second poll issued a news request outside the cached poll set')
      .toEqual([]);
    const extraLiveFetches = newsCalls.filter((url) => /\/api\/v1\/news\/live(\/|\?|$)/.test(url));
    expect
      .soft(extraLiveFetches.length, 'the second poll re-fetched /api/v1/news/live more than once')
      .toBeLessThanOrEqual(1);

    // 4. The re-poll uses the same cache key: no cache-busting query params.
    expect
      .soft(liveUrls.length, 'second live poll never recorded a URL')
      .toBeGreaterThanOrEqual(2);
    for (const url of liveUrls) {
      const { pathname, search } = new URL(url);
      expect.soft(pathname, 'live poll URL drifted away from the cache key').toBe('/api/v1/news/live');
      expect.soft(search, 'live poll appended a cache-busting query string').toBe('');
    }

    // 5. Per-article text is frozen across the cache hit.
    const textAfter = await cards.evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
    );
    expect
      .soft(textAfter, 'per-article text changed when an identical (cached) payload was re-polled')
      .toEqual(textBefore);

    // 6. The stored rows are still the ones on screen (no empty/refetch flash).
    for (const article of articles) {
      await expect
        .soft(
          sidebar.getByText(String(article.title), { exact: false }),
          `cached article "${article.title}" dropped after the identical re-poll`
        )
        .toBeVisible({ timeout: 5_000 });
    }
  });
});
