const { chromium } = require('@playwright/test');

async function probe(width, height) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('https://pre-hub.vercel.app/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.keyboard.press('Escape');
  if (!(await page.getByTestId('news-sheet').isVisible().catch(() => false))) {
    await page.getByTestId('news-sheet-toggle').click();
    await page.waitForTimeout(1200);
  }
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="berita-card-"]').length > 0,
    null,
    { timeout: 45000 },
  );
  const s = page.getByTestId('news-feed-scroll');
  await s.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(500);
  const out = await s.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const cards = [...document.querySelectorAll('[data-testid^="berita-card-"]')];
    const last = cards[cards.length - 1].getBoundingClientRect();
    const banner = document.querySelector('[data-testid="guest-evaluation-banner"]').getBoundingClientRect();
    return {
      list: { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) },
      scroll: { top: el.scrollTop, h: el.scrollHeight, client: el.clientHeight, pad: getComputedStyle(el).paddingBottom },
      lastCard: { top: +last.top.toFixed(1), bottom: +last.bottom.toFixed(1) },
      banner: { top: +banner.top.toFixed(1), bottom: +banner.bottom.toFixed(1) },
      overlapPx: +(last.bottom - banner.top).toFixed(1),
      innerH: window.innerHeight,
    };
  });
  console.log(width + 'x' + height, JSON.stringify(out));
  await page.screenshot({ path: `tmp-probe-${width}.png` });
  await browser.close();
}

(async () => {
  await probe(1920, 1080);
  await probe(390, 844);
})();
