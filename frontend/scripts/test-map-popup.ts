/**
 * Distilled map popup contract — M9 phase 176.
 *
 * Run with: node --no-warnings --experimental-strip-types scripts/test-map-popup.ts
 *
 * Pins the popup contract from DESIGN.md → "Distilled Command Surface":
 * one `.ds-popup` surface, label/value rows, a rule before the footer, a footer
 * that ALWAYS carries a source, 6-row (zone) / 4-row (cluster) budgets, and —
 * the security bar — every interpolated value escaped, so a hazard field
 * containing `<img src=x onerror=alert(1)>` renders as text.
 */
import {
  buildFirmsClusterPopup,
  buildFirmsPopup,
  buildWeatherPopup,
  escapeHtml,
  formatNumber,
  cap,
  POPUP_LIMITS,
} from '../components/map/mapPopup.ts';

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`, detail ?? '');
  }
}

function countMatches(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const weather = buildWeatherPopup({
  name: 'Waspada Dini Aceh',
  severity: 'critical',
  bmkgCode: 'BMKG-12',
  hazardType: 'banjir',
  precipitationMm24h: 84,
  floodRiskPct: 72,
  windspeedKmh: 38,
  corridorId: 'K1',
  corridorSegment: 'Belawan–Medan',
  distToCorridorKm: 2.4,
  delayHours: 3.5,
  action: 'Alih',
  modalities: ['darat', 'laut'],
  confidence: 0.82,
  observedVsForecast: 'forecast',
  source: 'BMKG / Open-Meteo',
  updatedAt: '2026-10-28T02:15:00+00:00',
});

const firms = buildFirmsPopup({
  title: 'Titik Panas VIIRS',
  frp: 12.54,
  conf: 80,
  severity: 'high',
  distToCorridorKm: 1.2,
  radiusKm: 2.5,
  nearSegment: 'Medan Hub',
  source: 'VIIRS_SNPP_NRT',
  updatedAt: '2026-10-28T02:30:00+00:00',
});

const cluster = buildFirmsClusterPopup({
  count: 7,
  maxFrp: 120.44,
  maxConfidence: 95,
  minDistKm: 0.8,
  radiusKm: 2.4,
  source: 'VIIRS_SNPP_NRT',
  updatedAt: '2026-10-28T02:30:00+00:00',
});

console.log('Structure');
{
  for (const [label, html, maxRows] of [
    ['weather', weather, POPUP_LIMITS.zone],
    ['firms single', firms, POPUP_LIMITS.zone],
    ['firms cluster', cluster, POPUP_LIMITS.cluster],
  ] as const) {
    check(`${label}: single .ds-popup surface`, countMatches(html, 'class="ds-popup"') === 1, html.slice(0, 60));
    check(`${label}: has a title`, html.includes('ds-popup__title'));
    check(`${label}: has __rows`, html.includes('ds-popup__rows'));
    check(`${label}: has a rule element`, html.includes('ds-popup__rule'));
    check(`${label}: has a footer`, html.includes('ds-popup__footer'));
    const rows = countMatches(html, 'class="ds-popup__row"');
    check(`${label}: ${rows} rows within budget ${maxRows}`, rows > 0 && rows <= maxRows);
    check(`${label}: at least 3 rows`, rows >= 3, rows);
    check(`${label}: no arrow/tip markup`, !html.includes('mapboxgl-popup-tip'));
    check(`${label}: no inline style escapes the contract`, !html.includes('style="'));
  }

  check('weather: numeric values carry the --num modifier',
    countMatches(weather, 'ds-popup__value ds-popup__value--num') === 4,
    countMatches(weather, 'ds-popup__value ds-popup__value--num'));
  check('weather: label + value classes present',
    weather.includes('ds-popup__label') && weather.includes('ds-popup__value'));

  // Every fact the old ad-hoc string showed must still be reachable.
  const facts = [
    'critical', 'BMKG-12', 'banjir', '84 mm/24j', '72%', '38 km/j',
    'K1', 'Belawan–Medan', '2.4 km', '3.5 jam', 'Alih', 'moda darat, laut',
    'confidence 0.82', 'forecast',
  ];
  const missing = facts.filter((fact) => !weather.includes(fact));
  check('weather: keeps every field (severity, presipitasi, banjir, angin, koridor, dampak, aksi, moda, confidence)', missing.length === 0, missing);
  check('weather: footer carries source', weather.includes('sumber: BMKG / Open-Meteo'));
  check('weather: footer carries freshness', weather.includes('valid_until: 2026-10-28T02:15:00+00:00'));

  const firmsFacts = ['12.5 MW', '80', 'high', '1.2 km', '2.5 km', 'Medan Hub'];
  const firmsMissing = firmsFacts.filter((fact) => !firms.includes(fact));
  check('firms single: keeps FRP, conf, severity, jarak koridor, radius, segmen', firmsMissing.length === 0, firmsMissing);
  check('firms single: footer carries source', firms.includes('sumber: VIIRS_SNPP_NRT'));

  check('firms cluster: title carries the count', cluster.includes('7 titik'));
  check('firms cluster: FRP maks / conf maks / jarak / radius', ['120.4 MW', '95', '0.8 km', '2.4 km'].every((v) => cluster.includes(v)));
  check('firms cluster: footer carries source', cluster.includes('sumber: VIIRS_SNPP_NRT'));
}

console.log('Escaping');
{
  const xss = buildWeatherPopup({
    name: '<script>alert(1)</script>',
    severity: '<img src=x onerror=alert(1)>',
    action: '<img src=x onerror=alert(1)>',
    modalities: ['<b>darat</b>'],
    corridorSegment: '"><svg onload=alert(1)>',
    source: '<script>src()</script>',
    updatedAt: '<img src=x>',
    precipitationMm24h: 10,
    floodRiskPct: 10,
    windspeedKmh: 10,
  });

  check('no raw <script> survives', !xss.includes('<script'), xss.match(/<script[^]*?<\/script>/)?.[0]);
  check('no raw <img survives', !xss.includes('<img'), xss.match(/<img[^>]*>/)?.[0]);
  check('no raw <svg survives', !xss.includes('<svg'), xss.match(/<svg[^>]*>/)?.[0]);
  check('script renders as text', xss.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  check('img/onerror renders as text', xss.includes('&lt;img src=x onerror=alert(1)&gt;'));
  check('svg payload renders as text', xss.includes('&quot;&gt;&lt;svg onload=alert(1)&gt;'));

  const payload = '<img src=x onerror=alert(1)>';
  check('escapeHtml covers & < > " \' `',
    escapeHtml(`&<>"'\`${payload}`) ===
      '&amp;&lt;&gt;&quot;&#39;&#96;&lt;img src=x onerror=alert(1)&gt;',
    escapeHtml(`&<>"'\`${payload}`));
  check('cap() escapes too', cap(payload) === '&lt;img src=x onerror=alert(1)&gt;', cap(payload));

  const firmsXss = buildFirmsPopup({ title: '<img src=x onerror=alert(1)>', nearSegment: '<script>x</script>' });
  check('firms: title payload escaped', !firmsXss.includes('<img') && !firmsXss.includes('<script'));
}

console.log('Numeric formatting');
{
  check('fixes 2 decimals to 1', formatNumber(12.54, 1) === '12.5', formatNumber(12.54, 1));
  check('drops a trailing .0', formatNumber(38.0, 1) === '38', formatNumber(38.0, 1));
  check('integers stay integers', formatNumber(72, 0) === '72', formatNumber(72, 0));
  check('string numerals are formatted', formatNumber('84.26', 1) === '84.3', formatNumber('84.26', 1));
  check('unknown is an em dash, never "?"', formatNumber(undefined) === '—' && formatNumber('?') === '—');
  check('NaN is an em dash', formatNumber(Number.NaN) === '—');
  check('non-numeric prose passes through escaped', formatNumber('nominal') === 'nominal');

  const unknown = buildWeatherPopup({});
  check('missing metrics render as em dash', unknown.includes('— mm/24j') && unknown.includes('—%') && !unknown.includes('?'));
  check('missing source still states provenance', unknown.includes('sumber: BMKG / Open-Meteo'));
  check('empty source falls back to an explicit unknown', buildWeatherPopup({ source: '' }).includes('sumber: BMKG / Open-Meteo'));
  const noSource = buildFirmsPopup({ source: '' });
  check('firms: empty source never leaves the footer blank', noSource.includes('sumber: VIIRS_SNPP_NRT'));
}

console.log('Budgets');
{
  const many = buildWeatherPopup({
    precipitationMm24h: 1, floodRiskPct: 2, windspeedKmh: 3, corridorId: 'K',
    distToCorridorKm: 4, delayHours: 5, action: 'a', modalities: ['x'],
  });
  check(`weather never exceeds ${POPUP_LIMITS.zone} rows`, countMatches(many, 'class="ds-popup__row"') <= POPUP_LIMITS.zone);
  check(`cluster never exceeds ${POPUP_LIMITS.cluster} rows`,
    countMatches(buildFirmsClusterPopup({ count: 9, maxFrp: 1, maxConfidence: 1, minDistKm: 1, radiusKm: 1 }), 'class="ds-popup__row"') <= POPUP_LIMITS.cluster);
  check('cluster count is never negative',
    buildFirmsClusterPopup({ count: -4 }).includes('0 titik'));
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll map popup contract assertions passed.');
