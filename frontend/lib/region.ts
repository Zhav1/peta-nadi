/**
 * Region label normalization for crisis surfaces.
 *
 * The simulation payload/backend speaks slugs (`north_sumatra`), while every
 * user-facing card and map popup should read a human province name. Known
 * regions map explicitly; unknown slugs fall back to title case and already
 * human labels pass through untouched.
 */

const REGION_DISPLAY: Record<string, string> = {
  north_sumatra: 'Sumatera Utara',
  sumatera_utara: 'Sumatera Utara',
  north_sumatra_utara: 'Sumatera Utara',
  south_sumatra: 'Sumatera Selatan',
  sumatera_selatan: 'Sumatera Selatan',
  west_sumatra: 'Sumatera Barat',
  sumatera_barat: 'Sumatera Barat',
  riau: 'Riau',
  jambi: 'Jambi',
  bengkulu: 'Bengkulu',
  lampung: 'Lampung',
  aceh: 'Aceh',
  bangka_belitung: 'Kepulauan Bangka Belitung',
  kepulauan_bangka_belitung: 'Kepulauan Bangka Belitung',
  babel: 'Kepulauan Bangka Belitung',
  kepulauan_riau: 'Kepulauan Riau',
  kepri: 'Kepulauan Riau',
  national: 'Nasional',
  indonesia: 'Indonesia',
};

/** Default region when the payload omits one (backend simulation default). */
export const DEFAULT_REGION = 'north_sumatra';

/**
 * Canonical backend slug per human label / legacy alias. The backend agent
 * contract is slug-only (`north_sumatra`), so any display label that leaks into
 * a payload (e.g. from a card header or a URL) is folded back to its slug here.
 */
const REGION_SLUG_ALIASES: Record<string, string> = {
  north_sumatra: 'north_sumatra',
  sumatera_utara: 'north_sumatra',
  north_sumatra_utara: 'north_sumatra',
  south_sumatra: 'south_sumatra',
  sumatera_selatan: 'south_sumatra',
  west_sumatra: 'west_sumatra',
  sumatera_barat: 'west_sumatra',
  kepulauan_riau: 'kepulauan_riau',
  kepri: 'kepulauan_riau',
  bangka_belitung: 'bangka_belitung',
  kepulauan_bangka_belitung: 'bangka_belitung',
  babel: 'bangka_belitung',
  aceh: 'aceh',
  riau: 'riau',
  jambi: 'jambi',
  bengkulu: 'bengkulu',
  lampung: 'lampung',
  national: 'national',
  indonesia: 'indonesia',
};

/**
 * Coarse province bounding boxes (lat/lon) used to stamp a map click or drawn
 * polygon with the region it actually happened in. Ordered most-specific-first;
 * Sumatra provinces overlap at the seams, so the first match wins.
 */
const REGION_BOUNDS: Array<{
  slug: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}> = [
  { slug: 'aceh', minLat: 1.9, maxLat: 6.1, minLon: 94.9, maxLon: 98.4 },
  { slug: 'lampung', minLat: -6.1, maxLat: -3.9, minLon: 103.4, maxLon: 106.1 },
  { slug: 'bengkulu', minLat: -5.5, maxLat: -2.0, minLon: 101.0, maxLon: 104.1 },
  { slug: 'jambi', minLat: -2.6, maxLat: -0.7, minLon: 101.0, maxLon: 104.6 },
  { slug: 'south_sumatra', minLat: -5.1, maxLat: -1.5, minLon: 102.0, maxLon: 106.5 },
  { slug: 'west_sumatra', minLat: -3.5, maxLat: 0.6, minLon: 98.4, maxLon: 100.9 },
  { slug: 'riau', minLat: -0.2, maxLat: 2.6, minLon: 99.7, maxLon: 103.6 },
  { slug: 'kepulauan_riau', minLat: -0.5, maxLat: 3.5, minLon: 103.5, maxLon: 109.0 },
  { slug: 'bangka_belitung', minLat: -3.5, maxLat: -1.0, minLon: 105.0, maxLon: 108.6 },
  { slug: 'north_sumatra', minLat: -0.2, maxLat: 4.6, minLon: 95.9, maxLon: 100.6 },
];

/** Fold a display label or legacy alias to the backend region slug. */
export function toRegionSlug(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (REGION_SLUG_ALIASES[key]) return REGION_SLUG_ALIASES[key];
  // Unknown slug-like values pass through; free text cannot be a backend slug.
  return /^[a-z0-9_]+$/.test(key) ? key : '';
}

/**
 * Resolve the region slug for a map click / polygon centroid. Falls back to
 * {@link DEFAULT_REGION} outside the Pan-Sumatra operating area so the payload
 * always carries a valid slug.
 */
export function regionSlugFromLatLon(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return DEFAULT_REGION;

  for (const box of REGION_BOUNDS) {
    if (lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon) {
      return box.slug;
    }
  }
  return DEFAULT_REGION;
}

function titleCaseSlug(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function normalizeRegion(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return REGION_DISPLAY[DEFAULT_REGION];

  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (REGION_DISPLAY[key]) return REGION_DISPLAY[key];

  // Slug-like input (`north_sumatra`) gets title-cased; free text is preserved.
  if (/^[a-z0-9_]+$/.test(raw)) {
    const pretty = titleCaseSlug(raw);
    return pretty || REGION_DISPLAY[DEFAULT_REGION];
  }
  return raw;
}
