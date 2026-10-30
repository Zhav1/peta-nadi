'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { SingleFlightRequest } from '@/lib/dashboardMemoryCache';
import { isDocumentVisible, subscribeVisibility } from '@/lib/visibility';
import {
  PUBLIC_CACHE_TTL_MS,
  PUBLIC_NEWS_CACHE_KEY,
  readPublicCache,
  writePublicCache,
} from '@/lib/publicCache';

import type { HazardImpactProfile, AffectedLocationNode, VerificationAudit, ForecastTag, NewsLivePayload } from '@/lib/types';

/** Honest confidence contract (Phase 172 / M9, SPEC decision 7). */
export interface NewsDisplayConfidence {
  /** Calibrated consensus value, or null when nothing corroborates the claim. */
  value: number | null;
  label: 'Terverifikasi sensor' | 'Terkonfirmasi multi-sumber' | 'Satu sumber' | 'Belum terverifikasi' | string;
  basis: 'sensor_corroborated' | 'multi_source' | 'single_source' | 'unverified' | string;
  tier: string;
}

/** Read-time breadth metadata of the returned page (Phase 172 / M9). */
export interface NewsBreadthMeta {
  source_counts?: Record<string, number>;
  province_counts?: Record<string, number>;
  truncated?: boolean;
  provinces_present?: string[];
  provinces_missing?: string[];
  max_per_source?: number;
  budget?: number;
  total?: number;
  /** Display tiers (Phase 172.5 / M9). */
  tier_counts?: { crisis?: number; regional?: number };
  crisis_count?: number;
  regional_count?: number;
  tier_note?: string;
  confidence_note?: string;
}

/**
 * Display tier (Phase 172.5 / M9). `crisis` passes the hazard gate; `regional`
 * is honest regional context that never claims crisis relevance.
 */
export type NewsRelevanceTier = 'crisis' | 'regional';

export interface NewsItem {
  id: string;
  source_type: 'OFFICIAL_NEWS' | 'BMKG_WEATHER' | 'PIHPS_MARKET' | 'MEDSOS_OSINT';
  source_tier?: 'TIER_1_OFFICIAL' | 'TIER_2_AUTHORITATIVE_PRESS';
  source_name?: string;
  headline: string;
  summary: string;
  location_name?: string;
  /**
   * Canonical province bucket ("Aceh", "Sumatera Barat", … or the area-wide
   * "Sumatera" when nothing resolved). Never a guessed province.
   */
  province?: string;
  lat?: number;
  lon?: number;
  pubDate?: string;
  /** Raw upstream publish time (ISO/date string) kept for per-article WIB rendering. */
  published_at?: string;
  category?: string;
  incident_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  temporal_phase?: 'forecast_early_warning' | 'active_disruption' | 'clearing_recovery';
  lead_time_hours?: number;
  commodities_affected?: string[];
  ground_truth_metrics?: { lane_status?: string; water_level_cm?: number };
  verification_status: 'UNVERIFIED_GRASSROOTS' | 'CORROBORATED_OFFICIAL' | 'MARKET_IMPACT_CONFIRMED' | 'REJECTED_UNFOUNDED';
  /**
   * @deprecated for display — this is the extractor's static tier constant
   * (0.86 / 0.94). Render `display_confidence` instead.
   */
  confidence_score: number;
  /** Honest display contract: label + calibrated value (or null). */
  display_confidence?: NewsDisplayConfidence;

  /**
   * Display tier (Phase 172.5 / M9). `crisis` passed the hazard gate; `regional`
   * is display-only regional context and is rendered with a neutral label. A
   * legacy payload without the field is crisis (the pre-172.5 contract).
   */
  relevance_tier?: NewsRelevanceTier;

  attributions?: Array<{ source_name: string; url?: string; credibility_score?: number }>;
  originNode?: string;
  destNode?: string;
  hazardType?: 'flood' | 'landslide' | 'congestion' | 'port_closure' | 'wildfire' | 'marine_wave' | 'road_closure' | 'earthquake' | 'volcanic_eruption' | 'other_disruption';
  commodity_name?: string;
  economic_note?: string;
  link?: string;
  url?: string;
  link_alive?: 'alive' | 'dead' | 'unknown';
  zone_tier?: 'RED_CONFIRMED' | 'YELLOW_CLARIFY' | 'DROPPED_IRRELEVANT';
  /** Early-warning forecast marker (mirrors backend). zone_tier stays YELLOW_CLARIFY. */
  forecast_tag?: ForecastTag | null;
  /** ISO timestamp after which the forecast tag is hidden (article stays admitted). */
  forecast_valid_until?: string | null;
  tier_reason?: string;
  custom_hazard_label?: string;
  impact_profile?: HazardImpactProfile;
  is_geocoded?: boolean;
  location_precision?: string;
  corridor_segment?: string;
  corridor_nodes?: string[];
  affected_locations?: AffectedLocationNode[];
  radius_km?: number;
  geometry_polygon?: [number, number][];
  verification_audit?: VerificationAudit;
}

// ---------------------------------------------------------------------------
// Province buckets + honest confidence (Phase 172 / M9, SPEC decisions 7 + 8)
// ---------------------------------------------------------------------------

/** The ten Sumatra provinces, in display order, plus the area-wide bucket. */
export const SUMATRA_PROVINCE_ORDER = [
  'Aceh',
  'Sumatera Utara',
  'Sumatera Barat',
  'Riau',
  'Kepulauan Riau',
  'Jambi',
  'Sumatera Selatan',
  'Bangka Belitung',
  'Bengkulu',
  'Lampung',
] as const;

export const AREA_WIDE_PROVINCE = 'Sumatera';

const PROVINCE_ALIASES: Record<string, string> = {
  aceh: 'Aceh',
  sumut: 'Sumatera Utara',
  'sumatera utara': 'Sumatera Utara',
  sumbar: 'Sumatera Barat',
  'sumatera barat': 'Sumatera Barat',
  riau: 'Riau',
  kepri: 'Kepulauan Riau',
  'kepulauan riau': 'Kepulauan Riau',
  jambi: 'Jambi',
  sumsel: 'Sumatera Selatan',
  'sumatera selatan': 'Sumatera Selatan',
  babel: 'Bangka Belitung',
  'bangka belitung': 'Bangka Belitung',
  bengkulu: 'Bengkulu',
  lampung: 'Lampung',
  sumatera: AREA_WIDE_PROVINCE,
  sumatra: AREA_WIDE_PROVINCE,
  nasional: AREA_WIDE_PROVINCE,
};

/**
 * Canonical province bucket for grouping/filtering. An article with no resolved
 * province belongs to the area-wide bucket — the UI never guesses a province.
 */
export function normalizeProvince(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return AREA_WIDE_PROVINCE;
  return PROVINCE_ALIASES[value.toLowerCase()] || value;
}

/** URL/testid-safe slug for a province (`Sumatera Utara` -> `sumatera-utara`). */
export function provinceSlug(province: string): string {
  return province
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Coerce a payload `display_confidence` into the display contract.
 *
 * Missing/unusable input degrades to the honest "Belum terverifikasi" — the
 * static `confidence_score` (0.86/0.94) is NEVER used as a fallback value.
 */
export function normalizeDisplayConfidence(
  raw: unknown,
  sourceTier?: string
): NewsDisplayConfidence {
  const tier = typeof sourceTier === 'string' && sourceTier ? sourceTier : 'TIER_2_AUTHORITATIVE_PRESS';
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!source) {
    return { value: null, label: 'Belum terverifikasi', basis: 'unverified', tier };
  }
  const numeric = source.value == null ? NaN : Number(source.value);
  const value = Number.isFinite(numeric) && numeric > 0 && numeric <= 1 ? numeric : null;
  const label =
    typeof source.label === 'string' && source.label.trim()
      ? source.label
      : value == null
        ? 'Belum terverifikasi'
        : 'Terkonfirmasi multi-sumber';
  const basis = typeof source.basis === 'string' && source.basis.trim() ? source.basis : 'unverified';
  const resolvedTier = typeof source.tier === 'string' && source.tier.trim() ? source.tier : tier;
  return { value, label, basis, tier: resolvedTier };
}

/**
 * Coerce a payload `relevance_tier` into the display tier (Phase 172.5).
 * Absent/unknown → `crisis`: the pre-172.5 contract only ever served gate-passing
 * rows, so a legacy payload cannot be silently downgraded to "regional".
 */
export function normalizeRelevanceTier(raw: unknown): NewsRelevanceTier {
  return raw === 'regional' ? 'regional' : 'crisis';
}

/** Short, human tier badge. The raw token stays available via `title`. */
export function displayTierLabel(tier: string | undefined): string {  const value = String(tier || '').toUpperCase();
  if (value === 'TIER_1_OFFICIAL') return 'TIER 1 · RESMI';
  if (value === 'TIER_2_AUTHORITATIVE_PRESS') return 'TIER 2 · PERS';
  return value || 'TIER 2 · PERS';
}

export interface MarketRegimeData {

  regime: 'NORMAL' | 'ELEVATED' | 'CRISIS' | 'EARLY_WARNING_ACTIVE' | 'HIGH_DISRUPTION_RISK';
  active_crisis_indicators?: string[];
  commodity_volatility_score?: number;
  critical_news_count?: number;
  early_warning_count?: number;
}

/**
 * Resolves a news permalink to the publisher's real article URL.
 *
 * M1 trust-fix decision "Drop unresolvable": this function never invents a
 * publisher search URL. When the input is empty, a root homepage, a Google News
 * aggregator/search URL, a synthetic test ID, a bare `/search` page, or an Antara
 * `/berita/` path without its numeric article ID, it returns '' — the caller MUST
 * drop the item instead of rendering a link.
 *
 * Empty string is used rather than null because sidebar consumers outside the
 * live-feed pipeline (EvidenceTab/MitigationTab) still type the result as string;
 * the live pipeline converts '' to null and filters the article out.
 */
export function normalizeNewsPermalink(rawUrl?: string, _headline?: string, _source?: string): string {
  const cleanUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!cleanUrl) return '';

  const withScheme = /^https?:\/\//i.test(cleanUrl)
    ? cleanUrl
    : `https://${cleanUrl.replace(/^\/+/, '')}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return '';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  if (!parsed.hostname) return '';

  // Google News aggregator/search URLs are redirectors, not publisher permalinks.
  if (parsed.hostname === 'news.google.com' || parsed.hostname.endsWith('.news.google.com')) return '';

  // Root homepage or any publisher search page is not an article.
  if (parsed.pathname === '/' || parsed.pathname === '') return '';
  if (/(^|\/)search(\/|$)/i.test(parsed.pathname)) return '';

  // Synthetic/dummy numeric test IDs that lack a true news slug.
  const DUMMY_IDS = ['543210', '532190', '571234', '562341', '123456', '999999'];
  const hasDummyId = DUMMY_IDS.some((id) => new RegExp(`/${id}(?:/|$)`).test(parsed.pathname));
  if (hasDummyId && !/\/\d{6}\/[a-z0-9-]+/i.test(parsed.pathname)) return '';

  // Antara `/berita/slug` without its numeric article ID resolves to a 404.
  if (/(^|\.)antaranews\.com$/i.test(parsed.hostname)
    && parsed.pathname.includes('/berita/')
    && !/\/berita\/\d{5,8}\//i.test(parsed.pathname)) {
    return '';
  }

  return parsed.toString();
}

/**
 * Client-side 48-hour freshness + discourse defense-in-depth guard.
 * Mirrors backend verification gate so stale/archival/opinion items never render zones.
 */
export function validateClientNewsFreshnessAndDiscourse(
  title: string,
  summary: string,
  link: string,
  rawPubDate: string
): { valid: boolean; reason?: 'archival_url' | 'stale_pubdate' | 'opinion_discourse'; formattedPubDate?: string } {
  const safeLink = typeof link === 'string' ? link : '';
  const safeTitle = typeof title === 'string' ? title : '';
  const safeSummary = typeof summary === 'string' ? summary : '';
  const safePub = typeof rawPubDate === 'string' ? rawPubDate : '';

  // 1. Archival URL check: embedded YYYY or YYYY/MM/DD older than 48h.
  if (safeLink) {
    const fullMatch = safeLink.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$|-)/);
    if (fullMatch) {
      const y = Number(fullMatch[1]);
      const m = Number(fullMatch[2]);
      const d = Number(fullMatch[3]);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const embeddedMs = Date.UTC(y, m - 1, d);
        if (Number.isFinite(embeddedMs) && Date.now() - embeddedMs > 48 * 3600 * 1000) {
          return { valid: false, reason: 'archival_url' };
        }
      }
    } else if (/\/(20(?:1\d|2[0-5]))\//.test(safeLink)) {
      // Year-only archival slug (2010–2025): in 2026+ this is always >48h old.
      return { valid: false, reason: 'archival_url' };
    }
  }

  // 2. Timestamp age check: rawPubDate older than 48h.
  let formattedPubDate: string | undefined;
  if (safePub) {
    const parsedMs = Date.parse(safePub);
    if (Number.isFinite(parsedMs) && !Number.isNaN(parsedMs)) {
      const ageMs = Date.now() - parsedMs;
      if (ageMs > 48 * 3600 * 1000) {
        return { valid: false, reason: 'stale_pubdate' };
      }
      const d = new Date(parsedMs);
      let timeWib = '';
      try {
        timeWib = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(d);
      } catch {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        timeWib = `${hh}:${mm}`;
      }
      const ageHours = Math.floor(ageMs / 3600000);
      if (ageMs < 0) {
        formattedPubDate = `Hari ini, ${timeWib} WIB`;
      } else if (ageHours < 1) {
        formattedPubDate = `Baru saja (${timeWib} WIB)`;
      } else if (ageHours < 24) {
        formattedPubDate = `${ageHours} jam lalu (Hari ini, ${timeWib} WIB)`;
      } else {
        formattedPubDate = `Kemarin, ${timeWib} WIB (${ageHours} jam lalu)`;
      }
    }
  }

  // 3. Academic / policy / solution / prevention-ceremonial discourse check
  // (without active closure phrase). Mirrors backend NON_INCIDENT_DISCOURSE_MARKERS
  // + PREVENTION_CEREMONIAL_MARKERS (M5 Phase A Q1): mitigasi/pemetaan/
  // sosialisasi/apel-siaga without a physical blockage is never a zone.
  const combined = `${safeTitle} ${safeSummary}`.toLowerCase();
  const academicMarkers = [
    'akademisi',
    'solusi banjir',
    'pemulihan hulu das',
    'dukung perekonomian',
    'pertumbuhan ekonomi',
    'guru besar',
    'seminar',
    'wacana',
    'pascabencana',
    'pasca-bencana',
    'pascabanjir',
    'pascagempa',
    'pembangunan tanggul',
    'tanggul darurat',
    'jembatan darurat',
    'posko darurat',
    'tenda darurat',
    'perbaikan',
    'renovasi',
    'rehabilitasi',
    'rekonstruksi',
    'normalisasi sungai',
    'peletakan batu',
    'mitigasi',
    'mitigasi bencana',
    'pemetaan',
    'pemetaan rawan',
    'pemetaan risiko',
    'apel siaga',
    'apel-siaga',
    'gladi',
    'kesiapsiagaan',
    'simulasi bencana',
    'simulasi',
    'edukasi',
    'sosialisasi',
  ];
  const closurePhrases = ['lumpuh', 'putus', 'tutup total', 'amblas', 'tidak bisa dilalui'];
  const hasAcademic = academicMarkers.some((m) => combined.includes(m));
  const hasClosure = closurePhrases.some((p) => combined.includes(p));
  if (hasAcademic && !hasClosure) {
    return { valid: false, reason: 'opinion_discourse', formattedPubDate };
  }

  return { valid: true, formattedPubDate };
}

// ---------------------------------------------------------------------------
// Forecast (Prakiraan-Waspada Dini) — client mirror of the backend contract.
//
// Backend sends `forecast_tag = 'FORECAST_WASPADA'` + `forecast_valid_until`
// (ISO) for early-warning articles/zones, and keeps `zone_tier` at
// YELLOW_CLARIFY. The tag is a 24h display window: once it lapses the tag is
// hidden, but the article itself is NOT removed — the 48h freshness/discourse
// admission gate above is a separate concern and stays untouched.
// ---------------------------------------------------------------------------

export const FORECAST_TAG: ForecastTag = 'FORECAST_WASPADA';
export const FORECAST_TTL_MS = 24 * 60 * 60 * 1000;

/** Mirrors backend derivation when the tag is missing on an early-warning item. */
export function deriveForecastTag(
  rawTag: unknown,
  temporalPhase?: string | null
): ForecastTag | undefined {
  if (rawTag === FORECAST_TAG) return FORECAST_TAG;
  if (typeof rawTag === 'string' && rawTag.trim().toUpperCase() === FORECAST_TAG) return FORECAST_TAG;
  if (temporalPhase === 'forecast_early_warning') return FORECAST_TAG;
  return undefined;
}

/**
 * Backend `forecast_valid_until` wins. When absent, derive it from the article
 * publish time + 24h so an early-warning item still expires. Returns undefined
 * when neither timestamp is parseable (never invent an expiry).
 */
export function deriveForecastValidUntil(
  rawValidUntil: unknown,
  publishedAt?: string | null
): string | undefined {
  if (typeof rawValidUntil === 'string' && rawValidUntil.trim()) {
    const parsed = Date.parse(rawValidUntil.trim());
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (typeof publishedAt === 'string' && publishedAt.trim()) {
    const parsed = Date.parse(publishedAt.trim());
    if (Number.isFinite(parsed)) return new Date(parsed + FORECAST_TTL_MS).toISOString();
  }
  return undefined;
}

/**
 * True while a forecast tag is still within its 24h window. An unknown expiry
 * keeps the tag (honest: no timestamp means no evidence it lapsed).
 */
export function isForecastActive(
  tag: unknown,
  validUntil?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (tag !== FORECAST_TAG) return false;
  if (!validUntil) return true;
  const parsed = Date.parse(validUntil);
  if (!Number.isFinite(parsed)) return true;
  return parsed > nowMs;
}

/** Timestamp precedence for the last-good cache (Unit D). Unparseable → 0. */
function safeNewsTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Newest article publish time in a normalized feed (fallback data clock). */
function maxFeedArticleTimestamp(feed: NewsItem[]): number {
  let max = 0;
  for (const item of feed) {
    const ts = safeNewsTimestamp(item.published_at ?? item.pubDate);
    if (ts > max) max = ts;
  }
  return max;
}

/**
 * A `last_updated` more than this far ahead of the article data clock cannot
 * describe the returned articles (a wall-clock snapshot seed, or a rebuild
 * stamp). It is distrusted and the article data clock is used instead — that
 * stamp would otherwise freeze the feed against every real newer payload.
 */
const NEWS_LAST_UPDATED_MAX_SKEW_MS = 10 * 60 * 1000;

/**
 * Distrusts a seed/live `last_updated` that is clearly ahead of the returned
 * article set's own clock. Falls back to `maxFeedArticleTimestamp` when the
 * stamp parses but the skew exceeds the limit above.
 */
function distrustSkewedLastUpdated(
  lastUpdated: string | null,
  articleTs: number
): string | null {
  if (!lastUpdated) return null;
  const stampTs = safeNewsTimestamp(lastUpdated);
  if (stampTs <= 0 || articleTs <= 0) return lastUpdated;
  if (stampTs - articleTs > NEWS_LAST_UPDATED_MAX_SKEW_MS) {
    return new Date(articleTs).toISOString();
  }
  return lastUpdated;
}

/** Versioned `prehub.news.v2` payload: normalized feed + its data clock. */
interface CachedNewsPayload {
  feed: NewsItem[];
  meta: NewsBreadthMeta | null;
  lastUpdated: string | null;
}

export interface UseNewsVerificationOptions {
  /**
   * Bootstrap seed (`sections.news.data`). Goes through the same normalisation
   * as a live poll, so the seed can never bypass the trust gates. When present
   * the first network read is skipped.
   */
  initialNews?: NewsLivePayload | null;
  /** Bootstrap seed (`sections.news_market_regime.data`). */
  initialMarketRegime?: MarketRegimeData | null;
  /** False while the bootstrap snapshot is still loading (M8 phase 163b). */
  enabled?: boolean;
}

export function useNewsVerification(options?: UseNewsVerificationOptions) {
  const { user, role } = useAuth();
  const identityKey = JSON.stringify([user?.id ?? 'guest', role, user?.company_id ?? null]);
  // M1 trust-fix "Strict live-only": no offline fixture. The feed starts empty and
  // only ever contains articles that came from the live backend and resolved to a
  // real publisher permalink.
  const enabled = options?.enabled ?? true;
  const seedNews = options?.initialNews ?? null;
  const seedRegime = options?.initialMarketRegime ?? null;

  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  // Breadth meta of the last accepted payload (provinces present/missing, caps).
  const [newsMeta, setNewsMeta] = useState<NewsBreadthMeta | null>(null);

  const [marketRegime, setMarketRegime] = useState<MarketRegimeData>({
    regime: 'NORMAL',
    critical_news_count: 0,
    early_warning_count: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'live' | 'warming' | 'idle'>('warming');
  // Global timestamp: backend `last_updated`, advanced only when the article set changes.
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // Timestamp of the last poll that actually returned a usable live feed (last-good snapshot).
  const [lastGoodAt, setLastGoodAt] = useState<string | null>(null);
  // Mirror of `lastUpdated` for the timestamp-precedence check below. A ref
  // (not the state) because `load()` resolves across renders.
  const lastUpdatedRef = useRef<string | null>(null);
  const lastArticleSignatureRef = useRef<string | null>(null);
  const requestGateRef = useRef(new SingleFlightRequest());
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;
  // The bootstrap seed is consumed exactly once, by the first load() after the
  // snapshot settles (the seed arrives in the same render that flips `enabled`).
  const seedConsumedRef = useRef(false);
  const seedRef = useRef<{ news: NewsLivePayload | null; regime: MarketRegimeData | null }>({
    news: seedNews,
    regime: seedRegime,
  });
  seedRef.current = { news: seedNews, regime: seedRegime };

  // Unit D last-good cache: hydrate the public feed on mount so first paint
  // shows cached news (< 2 h) instead of a skeleton. Independent of `enabled`
  // (the bootstrap may still be in flight). Cached content is never labelled
  // live: status stays `warming` until a seed/live payload passes the gates.
  useEffect(() => {
    const cached = readPublicCache<CachedNewsPayload>(PUBLIC_NEWS_CACHE_KEY, PUBLIC_CACHE_TTL_MS);
    if (!cached || !Array.isArray(cached.feed) || cached.feed.length === 0) return;
    const valid = cached.feed.filter(
      (item) => item && typeof item.id === 'string' && (item.link || item.url)
    );
    if (valid.length === 0) return;
    lastArticleSignatureRef.current = valid.map((n) => n.id).sort().join('|');
    setNewsFeed(valid);
    setNewsMeta(cached.meta ?? null);
    if (typeof cached.lastUpdated === 'string' && cached.lastUpdated) {
      setLastUpdated(cached.lastUpdated);
      lastUpdatedRef.current = cached.lastUpdated;
    }
    setStatus('warming');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const requestGate = requestGateRef.current;
    let isMounted = true;

    async function load(seed?: { news: NewsLivePayload | null; regime: MarketRegimeData | null }) {
      const controller = requestGate.begin();
      if (!controller) return;
      try {
        let newsResult: PromiseSettledResult<unknown>;
        let regimeResult: PromiseSettledResult<unknown>;
        if (seed) {
          // Snapshot seed: no network, but the exact same normalisation pipeline
          // (permalink/freshness/discourse gates) still runs below.
          newsResult = seed.news
            ? { status: 'fulfilled', value: seed.news }
            : { status: 'rejected', reason: new Error('no bootstrap news section') };
          regimeResult = seed.regime
            ? { status: 'fulfilled', value: seed.regime }
            : { status: 'rejected', reason: new Error('no bootstrap regime section') };
        } else {
          [newsResult, regimeResult] = await Promise.allSettled([
            api.news.live(controller.signal),
            api.news.marketRegime(controller.signal)
          ]);
        }

        if (!isMounted || controller.signal.aborted || identityKeyRef.current !== identityKey) return;

        if (newsResult.status === 'fulfilled') {
          const res = newsResult.value as {
            status?: string;
            articles?: any[];
            items?: any[];
            last_updated?: string;
            meta?: NewsBreadthMeta | null;
          };

          const backendLastUpdated = typeof res.last_updated === 'string' && res.last_updated.trim().length > 0
            ? res.last_updated
            : null;

          const rawArticles = res.articles || res.items || [];
          if (rawArticles && rawArticles.length > 0) {
            const ALLOWED_INCIDENT_TYPES = new Set([
              'flood', 'port_closure', 'marine_wave', 'road_closure', 'landslide',
              'earthquake', 'volcanic_eruption', 'wildfire', 'congestion', 'other_disruption',
            ]);
            const normalizeIncidentType = (raw: unknown): string => {
              const v = typeof raw === 'string' ? raw.trim() : '';
              if (!v) return 'other_disruption';
              if (v === 'port_congestion') return 'port_closure';
              if (v === 'supply_buffer' || v === 'logistics_news') return 'other_disruption';
              if (ALLOWED_INCIDENT_TYPES.has(v)) return v;
              // Legacy backend aliases → preserve semantics, never blindly coerce to flood.
              if (v === 'port_operations') return 'port_closure';
              if (v === 'market_monitoring' || v === 'weather_radar' || v === 'price_shock') return 'other_disruption';
              return 'other_disruption';
            };
            const normalizeHazardType = (raw: unknown, incident: string): NewsItem['hazardType'] => {
              const v = typeof raw === 'string' ? raw.trim() : '';
              const cand = v || incident;
              if (cand === 'flood' || cand === 'landslide' || cand === 'congestion' || cand === 'port_closure' ||
                cand === 'wildfire' || cand === 'marine_wave' || cand === 'road_closure' ||
                cand === 'earthquake' || cand === 'volcanic_eruption' || cand === 'other_disruption') {
                return cand;
              }
              return 'other_disruption';
            };
            const mapped: NewsItem[] = rawArticles.map((a: any): NewsItem | null => {
              const src = a.source || a.source_name || 'ANTARA';
              const isWeather = /bmkg|cuaca|gelombang|hujan|angin/i.test(src) || a.incident_type === 'marine_wave' || /cuaca|gelombang/i.test(a.title || a.headline || '');
              const isMarket = /pihps|bi\.go\.id|harga|bank indonesia|pasar/i.test(src) || a.incident_type === 'price_shock' || /harga|pangan/i.test(a.title || a.headline || '');
              const isOfficial = !isWeather && !isMarket && (a.source_tier === 'TIER_1_OFFICIAL' || /antara|bnpb|kemenhub|bulog/i.test(src));

              const headline = a.title || a.headline || 'Laporan Lapangan';
              const rawLink = typeof a.link === 'string' && a.link.length > 0 ? a.link : (typeof a.url === 'string' && a.url.length > 0 ? a.url : undefined);
              const sourceLink = normalizeNewsPermalink(rawLink, headline, src);
              // M1 "Drop unresolvable": no real publisher permalink → never render the item.
              if (!sourceLink) return null;
              const linkAlive: 'alive' | 'dead' | 'unknown' =
                a.link_alive === 'dead' || a.link_alive === 'alive' ? a.link_alive : 'unknown';

              const gtm = a.ground_truth_metrics && typeof a.ground_truth_metrics === 'object' ? a.ground_truth_metrics : {};
              const zone_tier = (a.zone_tier || gtm.zone_tier) as NewsItem['zone_tier'] | undefined;
              const tier_reason = (a.tier_reason || gtm.tier_reason || a.zone_reason) as string | undefined;
              const custom_hazard_label = (a.custom_hazard_label || gtm.custom_hazard_label || a.hazard_label) as string | undefined;
              const impact_profile = (a.impact_profile || gtm.impact_profile) as NewsItem['impact_profile'];
              const is_geocoded = (a.is_geocoded ?? gtm.is_geocoded) as boolean | undefined;
              const location_precision = (a.location_precision || gtm.location_precision) as string | undefined;
              const severity = (a.severity || 'medium') as NewsItem['severity'];

              const normalizedIncident = normalizeIncidentType(a.incident_type);
              const normalizedHazard = normalizeHazardType(a.hazardType || a.hazard_type, normalizedIncident);

              // Contract mirror: forecast_tag may arrive explicitly, or be derived
              // from temporal_phase='forecast_early_warning'.
              const forecastTagRaw = deriveForecastTag(a.forecast_tag ?? gtm.forecast_tag, a.temporal_phase);

              // Legacy articles without zone_tier: critical/high → RED, else YELLOW with Indonesian reason.
              // Forecasts never escalate to RED — the contract pins them to YELLOW_CLARIFY.
              let resolvedTier = zone_tier;
              let resolvedReason = tier_reason;
              if (!resolvedTier) {
                if (forecastTagRaw) {
                  resolvedTier = 'YELLOW_CLARIFY';
                  resolvedReason = resolvedReason || 'Prakiraan waspada dini: potensi gangguan belum terkonfirmasi sebagai bencana aktif; pantau sebelum pengalihan penuh.';
                } else if (severity === 'critical' || severity === 'high') {
                  resolvedTier = 'RED_CONFIRMED';
                  resolvedReason = resolvedReason || 'Berita berkekuatan tinggi dari sumber resmi; diklasifikasikan sebagai Zona Merah terkonfirmasi menunggu verifikasi lanjutan.';
                } else {
                  resolvedTier = 'YELLOW_CLARIFY';
                  resolvedReason = resolvedReason || 'Sinyal intensitas rendah–menengah; masuk Zona Kuning untuk klarifikasi dan pemantauan lanjutan.';
                }
              } else if (forecastTagRaw && resolvedTier !== 'DROPPED_IRRELEVANT') {
                resolvedTier = 'YELLOW_CLARIFY';
                resolvedReason = resolvedReason || 'Prakiraan waspada dini: potensi gangguan belum terkonfirmasi sebagai bencana aktif; pantau sebelum pengalihan penuh.';
              }

              const latRaw = a.latitude ?? a.lat ?? gtm.latitude ?? gtm.lat;
              const lonRaw = a.longitude ?? a.lon ?? a.lng ?? gtm.longitude ?? gtm.lon;
              const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : undefined;
              const lon = lonRaw != null && lonRaw !== '' ? Number(lonRaw) : undefined;
              const corridor_nodes = Array.isArray(a.corridor_nodes) ? a.corridor_nodes : (Array.isArray(gtm.corridor_nodes) ? gtm.corridor_nodes : undefined);
              const rawAffected = Array.isArray(a.affected_locations) ? a.affected_locations : (Array.isArray(gtm.affected_locations) ? gtm.affected_locations : undefined);
              const affected_locations: AffectedLocationNode[] | undefined =
                rawAffected && rawAffected.length > 0
                  ? rawAffected
                      .filter((loc: any) => loc && typeof loc.name === 'string' && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude)))
                      .map((loc: any) => ({
                        name: String(loc.name),
                        latitude: Number(loc.latitude),
                        longitude: Number(loc.longitude),
                        ...(loc.corridor_segment ? { corridor_segment: String(loc.corridor_segment) } : {}),
                        ...(loc.location_precision ? { location_precision: String(loc.location_precision) } : {}),
                        ...(loc.radius_km != null && Number.isFinite(Number(loc.radius_km)) ? { radius_km: Number(loc.radius_km) } : {}),
                        ...(Array.isArray(loc.geometry_polygon) ? { geometry_polygon: loc.geometry_polygon as [number, number][] } : {}),
                      }))
                  : undefined;
              const radius_km = (a.radius_km ?? gtm.radius_km) != null && Number.isFinite(Number(a.radius_km ?? gtm.radius_km))
                ? Number(a.radius_km ?? gtm.radius_km)
                : undefined;
              const geometry_polygon = (Array.isArray(a.geometry_polygon) ? a.geometry_polygon : Array.isArray(gtm.geometry_polygon) ? gtm.geometry_polygon : undefined) as [number, number][] | undefined;
              const verification_audit = (a.verification_audit ?? gtm.verification_audit) as VerificationAudit | undefined;
              const rawPubValue = a.pubDate || a.pub_date || a.published_at;
              const publishedAtRaw = typeof rawPubValue === 'string' && rawPubValue.trim().length > 0
                ? rawPubValue.trim()
                : undefined;
              const rawPub = publishedAtRaw || 'Terkini';
              const summaryText = a.summary || a.title || '';
              // 24h forecast window; an expired tag is hidden here but the article
              // still passes the untouched 48h admission gate below.
              const forecastValidUntil = forecastTagRaw
                ? deriveForecastValidUntil(a.forecast_valid_until ?? gtm.forecast_valid_until, publishedAtRaw)
                : undefined;
              const forecastActive = forecastTagRaw
                ? isForecastActive(forecastTagRaw, forecastValidUntil)
                : false;
              const freshness = validateClientNewsFreshnessAndDiscourse(headline, summaryText, sourceLink, String(rawPub));

              return {
                id: a.id || `NEWS-${Math.random().toString(36).substr(2, 6)}`,
                source_type: (isWeather ? 'BMKG_WEATHER' : isMarket ? 'PIHPS_MARKET' : isOfficial ? 'OFFICIAL_NEWS' : 'MEDSOS_OSINT') as NewsItem['source_type'],
                source_tier: (a.source_tier || (isOfficial ? 'TIER_1_OFFICIAL' : 'TIER_2_AUTHORITATIVE_PRESS')) as NewsItem['source_tier'],
                source_name: src,
                headline: headline,
                summary: summaryText,
                location_name: a.corridor_segment || (a.corridor_nodes && a.corridor_nodes[0]) || a.region || a.location_name || 'Koridor Sumatera',
                lat: Number.isFinite(lat) ? lat : undefined,
                lon: Number.isFinite(lon) ? lon : undefined,
                pubDate: freshness.formattedPubDate || publishedAtRaw,
                published_at: publishedAtRaw,
                category: a.category || 'DISASTER_LOGISTICS',
                incident_type: normalizedIncident,
                hazardType: normalizedHazard,
                severity: severity,
                temporal_phase: (a.temporal_phase || 'active_disruption') as NewsItem['temporal_phase'],
                lead_time_hours: a.lead_time_hours ? Number(a.lead_time_hours) : 0,
                commodities_affected: a.commodities_affected || ['Beras'],
                ground_truth_metrics: a.ground_truth_metrics || { lane_status: a.lane_status || 'CLEAR' },
                verification_status: (isOfficial ? 'CORROBORATED_OFFICIAL' : 'UNVERIFIED_GRASSROOTS') as NewsItem['verification_status'],
                confidence_score: Number(a.confidence_score || a.relevance_score || 0.90),
                commodity_name: Array.isArray(a.commodities_affected) ? a.commodities_affected.join(', ') : a.commodities_affected || 'Komoditas Pokok',
                originNode: a.originNode || a.origin_node,
                destNode: a.destNode || a.dest_node,
                link: sourceLink,
                url: sourceLink,
                link_alive: linkAlive,
                province: normalizeProvince(a.province ?? a.region),
                display_confidence: normalizeDisplayConfidence(
                  a.display_confidence,
                  a.source_tier || (isOfficial ? 'TIER_1_OFFICIAL' : 'TIER_2_AUTHORITATIVE_PRESS')
                ),
                zone_tier: resolvedTier,
                relevance_tier: normalizeRelevanceTier(a.relevance_tier),

                forecast_tag: forecastActive ? forecastTagRaw : undefined,
                forecast_valid_until: forecastActive ? forecastValidUntil : undefined,
                tier_reason: resolvedReason,
                custom_hazard_label: custom_hazard_label,
                impact_profile: impact_profile,
                is_geocoded: is_geocoded,
                location_precision: location_precision,
                corridor_segment: a.corridor_segment || gtm.corridor_segment,
                corridor_nodes: corridor_nodes,
                affected_locations: affected_locations,
                radius_km: radius_km,
                geometry_polygon: geometry_polygon,
                verification_audit: verification_audit,
              } as NewsItem;
            }).filter((n): n is NewsItem => {
              if (!n) return false;
              // Phase 172.5: a regional row is deliberately gate-rejected — it is
              // display context, not a hazard — so it is admitted here and labelled
              // as such, while every other DROPPED_IRRELEVANT row stays hidden.
              if (n.zone_tier === 'DROPPED_IRRELEVANT' && n.relevance_tier !== 'regional') return false;
              if (n.is_geocoded === false) return false;
              if (!n.link && !n.url) return false;
              if (n.lat == null || n.lon == null || !Number.isFinite(n.lat) || !Number.isFinite(n.lon)) return false;
              // M5 Phase A Q1 client mirror: hard Sumatra island bbox
              // 94-108E / -6.5..6.5N — out-of-Sumatra never renders a zone
              // (matches the backend strict Sumatra bbox).
              if (n.lat < -6.5 || n.lat > 6.5 || n.lon < 94 || n.lon > 108) return false;
              const check = validateClientNewsFreshnessAndDiscourse(
                n.headline || '',
                n.summary || '',
                n.link || n.url || '',
                n.published_at || n.pubDate || 'Terkini'
              );
              if (!check.valid) return false;
              return true;
            });
            if (mapped.length > 0) {
              // Unit D cache precedence: never replace a newer cached feed with
              // an older seed/live payload, and never move the freshness clock
              // backward. The article-ID set remains the feed identity: an
              // unchanged set is frozen (the existing CDN-replay contract), so
              // a replay cannot re-derive per-article timestamps or advance the
              // global clock. A changed set is accepted only when its data
              // timestamp is same-or-newer than the painted feed.
              const signature = mapped.map((n) => n.id).sort().join('|');
              const signatureChanged = signature !== lastArticleSignatureRef.current;
              const articleTs = maxFeedArticleTimestamp(mapped);
              // The feed clock is trusted only when it agrees with the article
              // data it stamps: a wall-clock seed stamp (or a fusion rebuild
              // stamp) must never freeze a changed feed.
              const trustedLastUpdated = distrustSkewedLastUpdated(backendLastUpdated, articleTs);
              const incomingTs = trustedLastUpdated
                ? safeNewsTimestamp(trustedLastUpdated)
                : articleTs;
              const currentTs = safeNewsTimestamp(lastUpdatedRef.current);
              const hasCurrent = lastUpdatedRef.current != null;
              let accept: boolean;
              if (!hasCurrent) {
                accept = true;
              } else if (!signatureChanged) {
                accept = false;
              } else if (incomingTs <= 0 || currentTs <= 0) {
                accept = true;
              } else {
                accept = incomingTs >= currentTs;
              }
              if (accept) {
                const nextMeta = res.meta && typeof res.meta === 'object' ? res.meta : null;
                const nextStamp = trustedLastUpdated ?? (articleTs > 0 ? new Date(articleTs).toISOString() : null);
                lastArticleSignatureRef.current = signature;
                setLastGoodAt(new Date().toISOString());
                setNewsFeed(mapped);
                // meta always travels with the article set it describes.
                setNewsMeta(nextMeta);
                if (nextStamp) {
                  setLastUpdated(nextStamp);
                  lastUpdatedRef.current = nextStamp;
                }
                // Public data only (the news feed is public); written after the
                // permalink/freshness/discourse gates above already passed.
                writePublicCache<CachedNewsPayload>(PUBLIC_NEWS_CACHE_KEY, {
                  feed: mapped,
                  meta: nextMeta,
                  lastUpdated: nextStamp ?? lastUpdatedRef.current,
                });
              }
              setStatus('live');
            } else {
              // Strict live-only: keep last-good articles (if any) and report warming.
              // Never substitute an offline fixture.
              setStatus('warming');
            }

          } else {
            setStatus('warming');
          }
        } else {
          setStatus('warming');
        }

        if (regimeResult.status === 'fulfilled' && regimeResult.value) {
          setMarketRegime(regimeResult.value as unknown as MarketRegimeData);
        }
      } catch (err) {
        if (isMounted && !controller.signal.aborted && identityKeyRef.current === identityKey) {
          setStatus('warming');
        }
        logger_err(err);
      } finally {
        requestGate.finish(controller);
        if (isMounted && !controller.signal.aborted && identityKeyRef.current === identityKey) setIsLoading(false);
      }
    }
    
    function logger_err(err: unknown) {
      // Network failure: last-good articles stay mounted; status flips to warming.
    }

    // First load consumes the bootstrap seed exactly once, then the poll owns
    // freshness. No seed (guest/failed bootstrap) → normal network read.
    const pendingSeed = seedRef.current;
    const seed =
      !seedConsumedRef.current && (pendingSeed.news || pendingSeed.regime)
        ? pendingSeed
        : undefined;
    seedConsumedRef.current = true;
    void load(seed);

    const interval = setInterval(() => {
      // A backgrounded tab must not poll the 0.1-CPU backend.
      if (!isDocumentVisible()) return;
      void load();
    }, 30000);
    const unsubscribe = subscribeVisibility((visible) => {
      if (visible) void load();
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubscribe();
      requestGate.abort();
    };
  }, [enabled, identityKey]);

  return { newsFeed, marketRegime, isLoading, status, lastUpdated, lastGoodAt, meta: newsMeta };
}
