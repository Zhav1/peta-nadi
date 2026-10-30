'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  Info,
  Filter,
  Flame,
  FileText
} from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardRequestSignals, dashboardDataKey, dashboardIdentityKey } from '@/lib/dashboardMemoryCache';
import { useDashboardCachedResource } from '@/hooks/useDashboardCachedResource';
import { useAuth } from '@/lib/authContext';
import type { CrisisState, CorridorContext, RouteRecommendation } from '@/lib/types';
import { Badge } from '@/components/base-ui/badge';
import { Card } from '@/components/base-ui/card';
import { Chip } from '@/components/base-ui/chip';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/base-ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/base-ui/tooltip';
import { Empty } from '@/components/base-ui/empty';
import { Skeleton } from '@/components/base-ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';
import {
  pearson,
  coeffVar,
  wowChange,
  disparitas,
  pctNaik,
  streakNaik,
  alignByDate,
  risikoComposite,
} from '@/lib/priceStats';
import { PriceHeatmap } from '@/components/dashboard/analytics/PriceHeatmap';
import { PriceTrendChart } from '@/components/dashboard/analytics/PriceTrendChart';
import { SpikeShareDonut } from '@/components/dashboard/analytics/SpikeShareDonut';
import { BencanaHeatmap, type BencanaRow } from '@/components/dashboard/analytics/BencanaHeatmap';
import { CorrelationMatrix, type CorrCell } from '@/components/dashboard/analytics/CorrelationMatrix';
import { TimeHeatstrip, type HeatStripRow } from '@/components/dashboard/analytics/TimeHeatstrip';
import { KpiStrip, fmtSigned, type Kpi } from '@/components/dashboard/analytics/KpiStrip';
import { AnalyticsTip, TipRow, TipTitle, TipSource, fmtRp } from '@/components/dashboard/analytics/AnalyticsTip';

interface AnalyticsSectionProps {
  selectedCrisis?: CrisisState | null;
  corridorContext?: CorridorContext | null;
  activeRoutes?: RouteRecommendation[];
  onSwitchTab?: (tab: 'map' | 'analytics' | 'reports' | 'evaluation') => void;
}

// ---------------------------------------------------------------------------
// Analitik (simplified): shared filter bar (commodity/region/days) + price
// trend + spikes table, single full-width column (no map canvas).
// Read-only: GET prices + spikes only.
// ---------------------------------------------------------------------------

const COMMODITY_OPTIONS = [
  { value: 'beras', label: 'Beras' },
  { value: 'cabai_merah', label: 'Cabai Merah' },
  { value: 'bawang_merah', label: 'Bawang Merah' },
  { value: 'minyak_goreng', label: 'Minyak Goreng' },
] as const;

const REGION_OPTIONS = [
  { value: '', label: 'Semua' },
  { value: 'sumut', label: 'Sumut' },
  { value: 'sumbar', label: 'Sumbar' },
  { value: 'riau', label: 'Riau' },
  { value: 'aceh', label: 'Aceh' },
  { value: 'sumsel', label: 'Sumsel' },
  { value: 'lampung', label: 'Lampung' },
  { value: 'jambi', label: 'Jambi' },
  { value: 'bengkulu', label: 'Bengkulu' },
  { value: 'babel', label: 'Babel' },
  { value: 'kepri', label: 'Kepri' },
] as const;

// URL/state slugs (sumut, sumbar, …) stay unchanged; backend expects DB region
// codes, so map slugs → DB codes at fetch time. '' → undefined (no filter).
const REGION_TO_DB: Record<string, string> = {
  sumut: 'north_sumatra',
  sumbar: 'west_sumatra',
  riau: 'riau',
  aceh: 'aceh',
  sumsel: 'south_sumatra',
  lampung: 'lampung',
  jambi: 'jambi',
  bengkulu: 'bengkulu',
  babel: 'bangka_belitung',
  kepri: 'kepulauan_riau',
};

const REGION_FULL_NAMES: Record<string, string> = {
  sumut: 'Sumatera Utara',
  sumbar: 'Sumatera Barat',
  riau: 'Riau',
  aceh: 'Aceh',
  sumsel: 'Sumatera Selatan',
  lampung: 'Lampung',
  jambi: 'Jambi',
  bengkulu: 'Bengkulu',
  babel: 'Bangka Belitung',
  kepri: 'Kepulauan Riau',
};

function regionToDb(slug: string): string | undefined {
  if (!slug) return undefined;
  return REGION_TO_DB[slug];
}

function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError';
}

const DAY_OPTIONS = [7, 14, 30] as const;

// Semua komoditas untuk matriks lintas-komoditas (heatmap/korelasi/streak).
const ALL_COMMODITIES = COMMODITY_OPTIONS.map((o) => o.value);

interface AnalyticsFilters {
  commodity: string;
  priceRegion: string;
  days: number;
}

function readInitialAnalyticsFilters(): AnalyticsFilters {
  const defaults: AnalyticsFilters = { commodity: 'beras', priceRegion: '', days: 7 };
  if (typeof window === 'undefined') return defaults;
  const params = new URLSearchParams(window.location.search);
  const commodity = params.get('commodity');
  const priceRegion = params.get('region');
  const days = Number(params.get('days'));
  return {
    commodity: commodity && COMMODITY_OPTIONS.some((option) => option.value === commodity) ? commodity : defaults.commodity,
    priceRegion: priceRegion !== null && REGION_OPTIONS.some((option) => option.value === priceRegion) ? priceRegion : defaults.priceRegion,
    days: (DAY_OPTIONS as readonly number[]).includes(days) ? days : defaults.days,
  };
}

interface PricePoint {
  price: number;
  time: string;
}

function withinHours(iso: string | undefined | null, hours: number, nowMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t <= hours * 3600_000;
}

function withinDays(iso: string | undefined | null, days: number, nowMs: number): boolean {
  return withinHours(iso, days * 24, nowMs);
}

function AnalyticsMotionStyle() {
  return (
    <style>{`@keyframes analytics-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
  );
}

function AnimatedValue({
  value,
  className,
  children,
}: {
  value: string | number | null | undefined;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      key={String(value ?? 'empty')}
      className={`inline-block motion-safe:animate-[analytics-fade_300ms_ease] tabular-nums ${className ?? ''}`}
    >
      {children ?? value}
    </span>
  );
}

interface SpikeItem {
  commodity: string;
  region: string;
  current_price: number;
  baseline_price: number;
  spike_pct: number;
  severity: string;
  status: string;
  detected_at: string;
}

interface AnalyticsPrices {
  ricePrice: number | null;
  priceHistory: number[];
  priceTimes: string[];
}

interface AnalyticsSpikes {
  spikes: SpikeItem[];
  recordsTotal: number;
}

interface AnalyticsMultiSeries {
  series: Record<string, PricePoint[]>;
  fallback: boolean;
  warning: string | null;
}

interface AnalyticsDisasterSummary {
  weatherCount: number | null;
  fireCount: number | null;
  fireFresh: boolean;
  sourceErrors: string[];
}

interface AnalyticsBnpbEvent {
  source: string;
  event_type: string;
  severity: string;
  lat: string | number;
  lon: string | number;
  radius_km?: number;
  title: string;
  ts: string;
  dedup_key: string;
}

interface AnalyticsBnpb {
  events: AnalyticsBnpbEvent[];
  updatedAt: string | null;
  available: boolean;
}

const EMPTY_PRICE_HISTORY: number[] = [];
const EMPTY_PRICE_TIMES: string[] = [];
const EMPTY_SPIKES: SpikeItem[] = [];
const EMPTY_SERIES: Record<string, PricePoint[]> = {};
const EMPTY_BNPB_EVENTS: AnalyticsBnpbEvent[] = [];

function severityBadge(severity: string): string {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'bg-red-500/15 text-red-300 border-red-400/30';
  if (s === 'high') return 'bg-red-500/15 text-red-300 border-red-400/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
}

function prettifyRegion(region: string): string {
  return (region || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFullDate(t: string): string {
  try {
    return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return t;
  }
}

function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  } catch {
    return '';
  }
}

export default function DashboardAnalyticsSection({
  selectedCrisis,
  corridorContext,
  activeRoutes,
  onSwitchTab
}: AnalyticsSectionProps) {
  // Props retained for DashboardClient wiring; this simplified view renders
  // price trend + spikes only and intentionally ignores them.
  void selectedCrisis;
  void corridorContext;
  void activeRoutes;

  const { user, role } = useAuth();
  const identityScope = dashboardIdentityKey({ id: user?.id, role, companyId: user?.company_id });
  const requestSignalsRef = useRef(new DashboardRequestSignals());
  const requestSignals = requestSignalsRef.current;
  useEffect(() => {
    requestSignals.activate();
    return () => requestSignals.dispose();
  }, [requestSignals]);
  const [initialFilters] = useState(readInitialAnalyticsFilters);
  const [commodity, setCommodity] = useState(initialFilters.commodity);
  const [priceRegion, setPriceRegion] = useState(initialFilters.priceRegion);
  const [days, setDays] = useState(initialFilters.days);

  const pricesKey = dashboardDataKey(identityScope, 'analytics.prices', { commodity, priceRegion, days });
  const pricesResource = useDashboardCachedResource<AnalyticsPrices>(pricesKey, async () => {
    const signal = requestSignalsRef.current.signal('analytics.prices', pricesKey);
    const res = await api.commodities.prices({ commodity, region: regionToDb(priceRegion), limit: days }, signal);
    const items = res?.items ?? [];
    return {
      ricePrice: items[0]?.price_idr ?? null,
      priceHistory: items.map((item) => item.price_idr).reverse(),
      priceTimes: items.map((item) => item.time).reverse(),
    };
  });
  const ricePrice = pricesResource.data?.ricePrice ?? null;
  const priceHistory = pricesResource.data?.priceHistory ?? EMPTY_PRICE_HISTORY;
  const priceTimes = pricesResource.data?.priceTimes ?? EMPTY_PRICE_TIMES;
  const isLoadingPrices = pricesResource.isLoading;

  const spikesKey = dashboardDataKey(identityScope, 'analytics.spikes', { commodity });
  const spikesResource = useDashboardCachedResource<AnalyticsSpikes>(spikesKey, async () => {
    const signal = requestSignalsRef.current.signal('analytics.spikes', spikesKey);
    const [spikeRes, priceRes] = await Promise.all([
      api.commodities.spikes(undefined, signal),
      api.commodities.prices({ commodity, limit: 100 }, signal),
    ]);
    return {
      spikes: Array.isArray(spikeRes?.spikes) ? spikeRes.spikes : [],
      recordsTotal: Array.isArray(priceRes?.items) ? priceRes.items.length : 0,
    };
  });
  const spikes = spikesResource.data?.spikes ?? EMPTY_SPIKES;
  const spikesLoading = spikesResource.isLoading;
  const spikeRecordsTotal = spikesResource.data?.recordsTotal ?? 0;

  // Lintas-komoditas: keep each region-filter result separately in the memory cache.
  const multiKey = dashboardDataKey(identityScope, 'analytics.multi-series', { priceRegion });
  const multiResource = useDashboardCachedResource<AnalyticsMultiSeries>(multiKey, async () => {
    const mapped = regionToDb(priceRegion);
    const signal = requestSignalsRef.current.signal('analytics.multi-series', multiKey);
    const fetchSeries = async (c: string, region?: string) => {
      try {
        const res = await api.commodities.prices({ commodity: c, region, limit: 60 }, signal);
        const items: PricePoint[] = (res?.items ?? []).map((item) => ({ price: item.price_idr, time: item.time })).reverse();
        return { commodity: c, items, error: null as string | null };
      } catch (err) {
        if (isAbortError(err) || signal.aborted) throw err;
        return { commodity: c, items: [] as PricePoint[], error: err instanceof Error ? err.message : 'Gagal memuat deret harga.' };
      }
    };

    const results = await Promise.all(ALL_COMMODITIES.map((value) => fetchSeries(value, mapped)));
    const merged: Record<string, PricePoint[]> = Object.fromEntries(results.map(({ commodity: value, items }) => [value, items]));
    const failures = results.filter((result) => result.error).map((result) => result.error as string);
    let usedFallback = false;
    if (mapped) {
      const thin = ALL_COMMODITIES.filter((value) => (merged[value] ?? []).length < 14);
      const aggregateResults = await Promise.all(thin.map((value) => fetchSeries(value)));
      for (const result of aggregateResults) {
        if (result.error) failures.push(result.error);
        if (result.items.length >= 14 && result.items.length > (merged[result.commodity] ?? []).length) {
          merged[result.commodity] = result.items;
          usedFallback = true;
        }
      }
    }
    return {
      series: merged,
      fallback: usedFallback,
      warning: failures.length > 0 ? 'Sebagian deret harga tidak berhasil diperbarui.' : null,
    };
  });
  const multiSeries = multiResource.data?.series ?? EMPTY_SERIES;
  const multiLoading = multiResource.isLoading;
  const multiFallback = multiResource.data?.fallback ?? false;

  const disasterKey = dashboardDataKey(identityScope, 'analytics.disaster-summary');
  const disasterResource = useDashboardCachedResource<AnalyticsDisasterSummary>(disasterKey, async () => {
    const signal = requestSignalsRef.current.signal('analytics.disaster-summary', disasterKey);
    const handleError = (error: unknown) => {
      if (isAbortError(error) || signal.aborted) throw error;
      return error;
    };
    const [wx, fire] = await Promise.all([
      api.weather.spatialPolygons(undefined, signal).then(
        (response) => ({ ok: true as const, count: response?.features?.length ?? 0 }),
        (error: unknown) => ({ ok: false as const, count: null, error: handleError(error) }),
      ),
      api.fire.hotspots(signal).then(
        (response) => ({ ok: true as const, response }),
        (error: unknown) => ({ ok: false as const, response: null, error: handleError(error) }),
      ),
    ]);
    const nowMs = Date.now();
    const hotspots = fire.ok ? fire.response.hotspots ?? [] : [];
    return {
      weatherCount: wx.ok ? wx.count : null,
      fireCount: fire.ok && fire.response.status !== 'degraded' ? hotspots.length : null,
      fireFresh: fire.ok && hotspots.length > 0 && hotspots.some((hotspot) => !hotspot.ts || withinHours(hotspot.ts, 48, nowMs)),
      sourceErrors: [!wx.ok ? 'BMKG' : null, !fire.ok ? 'FIRMS' : null].filter((name): name is string => name !== null),
    };
  });
  const weatherCount = disasterResource.data?.weatherCount ?? null;
  const fireCount = disasterResource.data?.fireCount ?? null;
  const fireFresh = disasterResource.data?.fireFresh ?? false;
  const bencanaLoading = disasterResource.isLoading;

  const bnpbKey = dashboardDataKey(identityScope, 'analytics.bnpb');
  const bnpbResource = useDashboardCachedResource<AnalyticsBnpb>(bnpbKey, async () => {
    const signal = requestSignalsRef.current.signal('analytics.bnpb', bnpbKey);
    const response = await api.bnpb.events({ limit: 20 }, signal);
    return {
      events: Array.isArray(response?.events) ? response.events : [],
      updatedAt: response?.updated_at ?? null,
      available: response?.status === 'ok',
    };
  });
  const bnpbEvents = bnpbResource.data?.events ?? EMPTY_BNPB_EVENTS;
  const bnpbLoading = bnpbResource.isLoading;
  const bnpbUpdatedAt = bnpbResource.data?.updatedAt ?? null;
  const bnpbAvailable = bnpbResource.data?.available ?? false;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('commodity', commodity);
      if (priceRegion) url.searchParams.set('region', priceRegion);
      else url.searchParams.delete('region');
      url.searchParams.set('days', String(days));
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore — local state remains source of truth */
    }
  }, [commodity, priceRegion, days]);

  const bnpbStale = useMemo(() => {
    if (!bnpbUpdatedAt) return false;
    try {
      return Date.now() - new Date(bnpbUpdatedAt).getTime() > 24 * 3600 * 1000;
    } catch {
      return false;
    }
  }, [bnpbUpdatedAt]);

  const analyticsResources = [pricesResource, spikesResource, multiResource, disasterResource, bnpbResource];
  const analyticsIsRefreshing = analyticsResources.some((resource) => resource.isRefreshing);
  const analyticsErrors = [
    ...analyticsResources.map((resource) => resource.error).filter((error): error is string => Boolean(error)),
    ...(disasterResource.data?.sourceErrors.length
      ? [`Sumber bencana tidak tersedia: ${disasterResource.data.sourceErrors.join(', ')}.`]
      : []),
    ...(multiResource.data?.warning ? [multiResource.data.warning] : []),
  ];
  const analyticsUpdatedAt = analyticsResources.reduce<number | null>(
    (latest, resource) => resource.updatedAt === null ? latest : Math.max(latest ?? 0, resource.updatedAt),
    null,
  );

  const commodityLabel = COMMODITY_OPTIONS.find((o) => o.value === commodity)?.label ?? commodity;
  const lastTime = priceTimes.length > 0 ? priceTimes[priceTimes.length - 1] : null;

  const trendRegionLabel = priceRegion
    ? (REGION_OPTIONS.find((o) => o.value === priceRegion)?.label ?? prettifyRegion(priceRegion))
    : 'Semua';

  const filteredSpikes = useMemo(() => {
    const mapped = regionToDb(priceRegion);
    return [...spikes]
      .filter((s) => !commodity || s.commodity === commodity)
      .filter((s) => !mapped || s.region === mapped)
      .sort((a, b) => b.spike_pct - a.spike_pct);
  }, [spikes, commodity, priceRegion]);

  // Shared honest-empty copy for spike consumers (donut + table guard).
  const spikeEmptyMessage =
    spikeRecordsTotal < 3
      ? `Data ${commodityLabel} kurang — butuh ≥ 3 catatan.`
      : `Tidak ada lonjakan ≥ 5% untuk ${commodityLabel} pada filter ini.`;
  const spikeEmptyFull =
    spikeRecordsTotal < 3
      ? `Hanya ${spikeRecordsTotal} catatan harga untuk ${commodityLabel} — spike butuh ≥ 3 catatan (guard backend).`
      : `Tidak ada lonjakan ≥ 5% untuk ${commodityLabel} pada filter ini (ambang 5/10/15%, baseline 30 hari).`;

  const nowMs = useMemo(() => Date.now(), []);

  // Spike maksimum 30 hari per komoditas (ko-okurensi bencana).
  const maxSpikeByCommodity = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spikes) {
      if (!withinDays(s.detected_at, 30, nowMs)) continue;
      const prev = m.get(s.commodity);
      if (prev == null || s.spike_pct > prev) m.set(s.commodity, s.spike_pct);
    }
    return m;
  }, [spikes, nowMs]);

  const perCommoditySpikes = useMemo(() => {
    const rec: Record<string, number | null> = {};
    for (const c of ALL_COMMODITIES) rec[c] = maxSpikeByCommodity.get(c) ?? null;
    return rec;
  }, [maxSpikeByCommodity]);

  // ---- 7 KPI (useMemo dari GETs yang ada; null = honest-empty bila <3) ----
  const kpis: Kpi[] = useMemo(() => {
    const enough = priceHistory.length >= 3;
    const maxSpike = filteredSpikes.length > 0 ? filteredSpikes[0].spike_pct : null;
    const cv = enough ? coeffVar(priceHistory) : null;
    const wow = enough ? wowChange(priceHistory) : null;
    const naik = enough ? pctNaik(priceHistory) : null;
    const streak = enough ? streakNaik(priceHistory) : null;
    const disp = enough ? disparitas(priceHistory) : null;
    const risiko = enough ? risikoComposite(maxSpike, cv) : null;

    const freshSpike = filteredSpikes.some((s) => withinHours(s.detected_at, 48, nowMs));
    const bnpbFresh = bnpbAvailable && bnpbEvents.some((e) => withinHours(e.ts, 48, nowMs));
    const bencanaActive = bnpbFresh || (weatherCount ?? 0) > 0 || fireFresh;
    const overlap: boolean | null = !enough && filteredSpikes.length === 0 ? null : freshSpike && bencanaActive;

    const toneOf = (v: number | null, hi: number, mid: number): Kpi['tone'] => {
      if (v == null) return 'neutral';
      if (v >= hi) return 'critical';
      if (v >= mid) return 'high';
      if (v >= mid / 2) return 'warn';
      return 'neutral';
    };

    return [
      {
        key: 'risiko',
        label: 'Risiko harga',
        display: risiko != null ? `${risiko}/100` : 'n/a',
        value: risiko,
        tone: risiko == null ? 'neutral' : risiko >= 70 ? 'critical' : risiko >= 40 ? 'high' : risiko >= 20 ? 'warn' : 'neutral',
        hint: 'Skor gabungan spike & CV (0–100); ≥70 kritis.',
      },
      {
        key: 'naik',
        label: 'Porsi naik',
        display: fmtSigned(naik),
        value: naik,
        tone: naik == null ? 'neutral' : naik >= 60 ? 'warn' : 'neutral',
        hint: 'Porsi pergerakan harian naik pada deret filter aktif.',
      },
      {
        key: 'wow',
        label: 'WoW — Perubahan sepekan',
        display: fmtSigned(wow),
        value: wow,
        tone: toneOf(wow, 15, 10),
        hint: 'Rata-rata 7 hari terakhir vs 7 hari sebelumnya. Butuh ≥14 titik.',
      },
      {
        key: 'cv',
        label: 'Volatilitas (CV)',
        display: fmtSigned(cv),
        value: cv,
        tone: cv == null ? 'neutral' : cv >= 10 ? 'high' : cv >= 5 ? 'warn' : 'neutral',
        hint: 'std/mean deret filter aktif. ≥10% tinggi, ≥5% waspada.',
      },
      {
        key: 'streak',
        label: 'Naik beruntun',
        display: streak != null ? `${streak} titik` : 'n/a',
        value: streak,
        tone: streak == null ? 'neutral' : streak >= 5 ? 'critical' : streak >= 3 ? 'high' : streak >= 1 ? 'warn' : 'neutral',
        hint: 'Kenaikan beruntun di ujung deret filter aktif.',
      },
      {
        key: 'disparitas',
        label: 'Disparitas',
        display: fmtSigned(disp),
        value: disp,
        tone: disp == null ? 'neutral' : disp >= 20 ? 'high' : disp >= 10 ? 'warn' : 'neutral',
        hint: 'Spread (maks-min)/rata-rata deret filter aktif.',
      },
      {
        key: 'overlap',
        label: 'Bencana bersamaan',
        display: overlap == null ? 'n/a' : overlap ? 'Overlap' : 'Aman',
        value: overlap,
        tone: overlap == null ? 'neutral' : overlap ? 'critical' : 'neutral',
        hint: 'Spike ≤48 jam berdampingan kejadian BNPB/BMKG/FIRMS aktif.',
      },
    ];
  }, [priceHistory, filteredSpikes, bnpbEvents, bnpbAvailable, weatherCount, fireFresh, nowMs]);

  // ---- PriceHeatmap: Wilayah x Komoditas (semua spike, tak tergantung filter) ----
  const heatRegions = useMemo(() => {
    const vals = Array.from(new Set(spikes.map((s) => s.region).filter(Boolean))).sort();
    return vals.map((v) => ({ value: v, label: prettifyRegion(v) }));
  }, [spikes]);

  const heatCells = useMemo(
    () => spikes.map((s) => ({ commodity: s.commodity, region: s.region, spikePct: s.spike_pct })),
    [spikes],
  );

  // ---- BencanaHeatmap: BNPB/BMKG/FIRMS x komoditas ----
  const bencanaRows: BencanaRow[] = useMemo(() => {
    const bnpbRecent = bnpbAvailable ? bnpbEvents.filter((e) => withinDays(e.ts, 30, nowMs)) : [];
    const bnpbActive = bnpbRecent.length;
    const nullRec = (): Record<string, number | null> => {
      const r: Record<string, number | null> = {};
      for (const c of ALL_COMMODITIES) r[c] = null;
      return r;
    };
    return [
      {
        source: 'BNPB',
        count30d: bnpbAvailable ? bnpbActive : null,
        fresh48h: bnpbAvailable && bnpbEvents.some((e) => withinHours(e.ts, 48, nowMs)),
        perCommodity: bnpbActive > 0 ? { ...perCommoditySpikes } : nullRec(),
        note: 'Feed BNPB DIBI',
      },
      {
        source: 'BMKG',
        count30d: weatherCount,
        fresh48h: (weatherCount ?? 0) > 0,
        perCommodity: (weatherCount ?? 0) > 0 ? { ...perCommoditySpikes } : nullRec(),
        note: 'Snapshot poligon disruptif high/critical',
      },
      {
        source: 'FIRMS',
        count30d: fireCount,
        fresh48h: fireFresh,
        perCommodity: (fireCount ?? 0) > 0 ? { ...perCommoditySpikes } : nullRec(),
        note: 'Hotspot VIIRS NRT',
      },
    ];
  }, [bnpbEvents, bnpbAvailable, weatherCount, fireCount, fireFresh, perCommoditySpikes, nowMs]);

  // ---- CorrelationMatrix: Pearson antar-komoditas, overlap ≥10 ----
  const corrCells: CorrCell[] = useMemo(() => {
    const aligned = alignByDate(
      ALL_COMMODITIES.map((c) => {
        const pts = multiSeries[c] ?? [];
        return { times: pts.map((p) => p.time), prices: pts.map((p) => p.price) };
      }),
    );
    const cells: CorrCell[] = [];
    for (let i = 0; i < ALL_COMMODITIES.length; i++) {
      for (let j = i + 1; j < ALL_COMMODITIES.length; j++) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (const row of aligned) {
          const a = row.values[i];
          const b = row.values[j];
          if (a != null && b != null) {
            xs.push(a);
            ys.push(b);
          }
        }
        cells.push({ a: ALL_COMMODITIES[i], b: ALL_COMMODITIES[j], r: pearson(xs, ys, 10), n: xs.length });
      }
    }
    return cells;
  }, [multiSeries]);

  // ---- TimeHeatstrip: 4 pekan x komoditas + streak ----
  const heatstripRows: HeatStripRow[] = useMemo(() => {
    const rows: HeatStripRow[] = [];
    for (const c of ALL_COMMODITIES) {
      const pts = multiSeries[c] ?? [];
      if (pts.length < 14) continue;
      // Bucket per pekan kalender (ISO week) dari 4 pekan terakhir berdata.
      const byWeek = new Map<string, number[]>();
      for (const p of pts) {
        const d = new Date(p.time);
        if (Number.isNaN(d.getTime())) continue;
        const monday = new Date(d);
        const dow = (d.getDay() + 6) % 7;
        monday.setDate(d.getDate() - dow);
        const key = monday.toISOString().slice(0, 10);
        const arr = byWeek.get(key) ?? [];
        arr.push(p.price);
        byWeek.set(key, arr);
      }
      const keys = Array.from(byWeek.keys()).sort().slice(-4);
      if (keys.length < 2) continue;
      const means = keys.map((k) => {
        const arr = byWeek.get(k) ?? [];
        return arr.reduce((s, v) => s + v, 0) / Math.max(arr.length, 1);
      });
      const weeks = keys.map((k, idx) => {
        if (idx === 0) {
          return {
            key: k,
            label: (() => {
              try {
                return new Date(k).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
              } catch {
                return k.slice(5);
              }
            })(),
            changePct: null as number | null,
            up: null as boolean | null,
          };
        }
        const prev = means[idx - 1];
        const cur = means[idx];
        const ch = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
        return {
          key: k,
          label: (() => {
            try {
              return new Date(k).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
            } catch {
              return k.slice(5);
            }
          })(),
          changePct: ch,
          up: ch != null ? ch > 0 : null,
        };
      });
      let streak = 0;
      for (let i = weeks.length - 1; i >= 1; i--) {
        if (weeks[i].up) streak++;
        else break;
      }
      rows.push({ commodity: c, weeks, streak });
    }
    return rows;
  }, [multiSeries]);

  return (
    <div className="w-full min-h-full lg:h-full flex flex-col gap-6 pointer-events-auto">
      <AnalyticsMotionStyle />

      {/* Shared analitik filter bar — drives PIHPS price refetch */}
      <div className="relative z-30 bg-[#0c1017] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs shadow-xl">
        <span className="flex items-center gap-1.5 font-semibold text-slate-200">
          <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter harga
        </span>

        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-xs">Komoditas</span>
          <Select
            value={commodity}
            onValueChange={(val) => {
              if (val) setCommodity(val);
            }}
            items={COMMODITY_OPTIONS}
            modal={false}
          >
            <SelectTrigger aria-label="Komoditas" className="h-8 min-w-[140px] bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2.5 py-1.5 cursor-pointer">
              <SelectValue placeholder="Pilih komoditas" />
            </SelectTrigger>
            <SelectContent portal={false}>
              {COMMODITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs cursor-pointer">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-xs">Wilayah</span>
          <Select
            value={priceRegion}
            onValueChange={(val) => setPriceRegion(val ?? '')}
            items={REGION_OPTIONS}
            modal={false}
          >
            <SelectTrigger aria-label="Wilayah" className="h-8 min-w-[120px] bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2.5 py-1.5 cursor-pointer">
              <SelectValue placeholder="Semua wilayah" />
            </SelectTrigger>
            <SelectContent portal={false}>
              {REGION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs cursor-pointer">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="Rentang waktu">
          {DAY_OPTIONS.map((d) => {
            const isActive = days === d;
            const pillTip = `${d} hari terakhir`;
            return (
              <AnalyticsTip
                key={d}
                trigger={
                  <button
                    type="button"
                    aria-pressed={isActive}
                    aria-label={pillTip}
                    onClick={() => setDays(d)}
                    className={`rounded-full border backdrop-blur text-xs tabular-nums font-medium h-8 px-3 cursor-pointer motion-safe:transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                      isActive
                        ? 'border-white/20 bg-white text-black'
                        : 'border-white/20 bg-white/10 text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {d} hari
                  </button>
                }
                content={
                  <div className="min-w-44 space-y-0.5">
                    <TipTitle>Rentang {d} hari</TipTitle>
                    <TipRow k="Deret" v={`${d} titik terakhir`} />
                    <TipRow k="Sumber" v="PIHPS Bank Indonesia" />
                  </div>
                }
              />
            );
          })}
        </div>

        <div className="ml-auto hidden sm:flex items-center gap-2">
          <Chip variant="outline" size="sm" statusDot status="online">
            PIHPS Live
          </Chip>
        </div>
      </div>

      {/* 7 KPI Analitik — useMemo dari GETs yang ada */}
      <KpiStrip kpis={kpis} loading={spikesLoading || isLoadingPrices} />
      <div className="min-h-5 text-xs" aria-live="polite" data-testid="analytics-refresh-status">
        {analyticsIsRefreshing && <p className="text-slate-400">Memperbarui data analitik…</p>}
        {!analyticsIsRefreshing && analyticsUpdatedAt !== null && (
          <p className="text-slate-500">
            Data terakhir diperbarui {new Date(analyticsUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {analyticsErrors.length > 0 && (
          <p role="alert" className="text-amber-300">
            Sebagian data tidak dapat diperbarui. Data terakhir yang tersedia tetap ditampilkan. {analyticsErrors.join(' ')}
          </p>
        )}
      </div>

      {/* Mixed dashboard grid (map canvas removed): tren 8 + donat 4 · heatmap 6+6 · korelasi 6+6 · tabel 8 + BNPB 4 */}
      <div className="w-full grid grid-cols-12 gap-4">

        {/* Row 1a: tren harga garis+area (deret waktu kontinu) */}
        <Card className="col-span-12 lg:col-span-8 p-4 flex flex-col gap-3 min-w-0">
        <div className="space-y-3">
          <div className="flex justify-between items-end gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-300" /> Harga {commodityLabel}
            </h3>
            <span className="text-xs text-slate-300 font-medium tabular-nums flex flex-col items-end gap-0.5">
              {ricePrice !== null ? (
                <>
                  <AnimatedValue value={ricePrice}>{`Rp ${ricePrice.toLocaleString('id-ID')} / kg`}</AnimatedValue>
                  {lastTime ? (
                    <span className="text-xs text-slate-500">{formatFullDate(lastTime)}</span>
                  ) : null}
                </>
              ) : (
                'Data tidak tersedia'
              )}
            </span>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <span>Tren {Math.min(days, priceHistory.length)} Titik Terakhir</span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Informasi grafik tren harga"
                        className="text-slate-400 hover:text-slate-200 cursor-pointer inline-flex items-center bg-transparent border-0 p-0 focus:outline-none"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    }
                  />
                  <TooltipContent side="top" portal={false}>
                    Grafik historis harga harian {commodityLabel} berdasarkan data PIHPS Bank Indonesia.
                  </TooltipContent>
                </Tooltip>
              </span>
              <span className="text-slate-300">Sumber: PIHPS Bank Indonesia</span>
            </div>
            <PriceTrendChart
              prices={priceHistory}
              times={priceTimes}
              commodityLabel={commodityLabel}
              regionLabel={trendRegionLabel}
              loading={isLoadingPrices}
            />
          </div>
        </div>
        </Card>

        {/* Row 1b: distribusi spike per wilayah (donat part-to-whole) */}
        <section className="col-span-12 lg:col-span-4 bg-[#0c1017] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-slate-400" /> Distribusi spike per wilayah
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {spikesLoading ? (
                'memuat…'
              ) : (
                <AnimatedValue value={filteredSpikes.length}>{`${filteredSpikes.length} spike`}</AnimatedValue>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-sans -mt-1 tabular-nums">
            {commodityLabel} · spike maks per wilayah · ambang 5/10/15%
          </p>
          <SpikeShareDonut
            spikes={filteredSpikes}
            loading={spikesLoading}
            recordsTotal={spikeRecordsTotal}
            emptyMessage={spikeEmptyMessage}
          />
        </section>

        {/* Row 2a: heatmap harga lintas wilayah x komoditas (intensitas 2D) */}
        <section className="col-span-12 lg:col-span-6 bg-[#0c1017] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" /> Peta panas lonjakan wilayah × komoditas
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {spikesLoading ? 'memuat…' : `${heatCells.length} sel`}
            </span>
          </div>
          <p
            className="text-xs text-slate-500 font-sans -mt-1 tabular-nums"
            title="Spike% maksimum 30 hari · ambang 5/10/15% · semua wilayah & komoditas"
          >
            Spike maksimum 30 hari per wilayah
          </p>
          <PriceHeatmap
            cells={heatCells}
            commodities={[...COMMODITY_OPTIONS]}
            regions={heatRegions}
            loading={spikesLoading}
          />
        </section>

        {/* Row 2b: heatmap ko-okurensi bencana x komoditas */}
        <section className="col-span-12 lg:col-span-6 bg-[#0c1017] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-slate-400" /> Ko-okurensi bencana × komoditas
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {bencanaLoading || bnpbLoading ? 'memuat…' : '30 hari · flag 48 jam'}
            </span>
          </div>
          <p
            className="text-xs text-slate-500 font-sans -mt-1 tabular-nums"
            title="BNPB/BMKG/FIRMS aktif × spike komoditas"
          >
            Bencana aktif × spike komoditas
          </p>
          <BencanaHeatmap
            rows={bencanaRows}
            commodities={[...COMMODITY_OPTIONS]}
            loading={bencanaLoading || bnpbLoading}
          />
        </section>

        {/* Row 3a: matriks korelasi (diverging symmetric matrix) */}
        <section className="col-span-12 xl:col-span-6 bg-[#0c1017] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <h3 className="text-sm font-semibold tracking-wide text-white">Korelasi harga antar-komoditas</h3>
          <p
            className="text-xs text-slate-500 font-sans -mt-1 tabular-nums"
            title="Pearson −1…1 · |r|>0.7 ditandai · n<10 tidak dihitung (bukan 0) · ambang 10 tetap"
          >
            Hubungan harga antar barang
          </p>
          <CorrelationMatrix
            commodities={[...COMMODITY_OPTIONS]}
            cells={corrCells}
            loading={multiLoading}
            regionActive={Boolean(priceRegion)}
            windowDays={days}
            onShowAll={() => setPriceRegion('')}
          />
        </section>

        {/* Row 3b: streak mingguan (arah pekan + streak) */}
        <section className="col-span-12 xl:col-span-6 bg-[#0c1017] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <h3 className="text-sm font-semibold tracking-wide text-white">Streak mingguan per komoditas</h3>
          <p
            className="text-xs text-slate-500 font-sans -mt-1 tabular-nums"
            title="4 pekan terakhir · WoW rata-rata pekan · butuh ≥14 titik (kurang = data kurang, bukan 0)"
          >
            4 pekan terakhir{multiFallback ? ' · agregat Sumatera' : ''}
          </p>
          <TimeHeatstrip
            rows={heatstripRows}
            commodities={[...COMMODITY_OPTIONS]}
            loading={multiLoading}
            fallbackActive={multiFallback}
            minPoints={14}
          />
        </section>

        {/* Row 4a: tabel lonjakan harga (detail top-8) */}
        <section className="col-span-12 lg:col-span-8 bg-[#0c1017] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-slate-400" /> Lonjakan harga
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {spikesLoading ? (
                'memuat…'
              ) : (
                <AnimatedValue value={filteredSpikes.length}>{`${filteredSpikes.length} spike`}</AnimatedValue>
              )}
            </span>
          </div>
          <p
            className="text-xs text-slate-500 font-sans -mt-1 tabular-nums"
            title={`${commodityLabel}${priceRegion ? ` · ${prettifyRegion(priceRegion)}` : ' · semua wilayah'} · baseline 30 hari · ambang 5/10/15%`}
          >
            {commodityLabel}{priceRegion ? ` · ${prettifyRegion(priceRegion)}` : ' · semua wilayah'} · baseline 30 hari
          </p>

          {spikesLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton rows={4} rowClassName="h-11" />
              <Empty loading />
            </div>
          ) : filteredSpikes.length === 0 || spikeRecordsTotal < 3 ? (
            <div title={spikeEmptyFull}>
              {/* The "fewer than 3 records" guard is VISIBLE, not hover-only: it is
                  the honesty claim that stops a 0-spike table from reading as data. */}
              <Empty message={spikeRecordsTotal < 3 ? spikeEmptyFull : spikeEmptyMessage} />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <Table>
                <TableHeader className="h-11 bg-[#0c1017]">
                  <TableRow>
                    <TableHead className="h-11 bg-[#0c1017]">Komoditas</TableHead>
                    <TableHead className="h-11 bg-[#0c1017]">Wilayah</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] text-right">Spike</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] text-right">Harga</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSpikes.slice(0, 8).map((s) => {
                    const spikeTip = `${prettifyRegion(s.commodity)} · ${prettifyRegion(s.region)}: ${s.spike_pct >= 0 ? '+' : ''}${s.spike_pct.toFixed(1)}% (${s.severity})`;
                    return (
                      <TableRow key={`${s.commodity}::${s.region}`} className="hover:bg-white/5">
                        <TableCell className="py-3 text-xs tabular-nums font-medium text-slate-200">
                          <AnalyticsTip
                            trigger={
                              <div
                                role="img"
                                aria-label={spikeTip}
                                tabIndex={0}
                                className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                              >
                                {prettifyRegion(s.commodity)}
                              </div>
                            }
                            content={
                              <div className="min-w-48 space-y-0.5">
                                <TipTitle>Lonjakan {prettifyRegion(s.commodity)}</TipTitle>
                                <TipRow k="Wilayah" v={prettifyRegion(s.region)} />
                                <TipRow k="Harga" v={fmtRp(s.current_price)} />
                                <TipRow k="Baseline 30 hari" v={fmtRp(s.baseline_price)} />
                                <TipRow k="Spike" v={`${s.spike_pct >= 0 ? '+' : ''}${s.spike_pct.toFixed(1)}%`} />
                                <TipRow k="Severity" v={s.severity} />
                                <TipRow k="Status" v={s.status} />
                                <TipRow k="Terdeteksi" v={formatFullDate(s.detected_at)} />
                                <TipSource>PIHPS Bank Indonesia · ambang 5/10/15%</TipSource>
                              </div>
                            }
                          />
                        </TableCell>
                        <TableCell className="py-3 text-xs tabular-nums text-slate-400">{prettifyRegion(s.region)}</TableCell>
                        <TableCell className="py-3 text-xs tabular-nums text-right">
                          <Badge variant="outline" className={`${severityBadge(s.severity)} font-bold tabular-nums`}>
                            {s.spike_pct >= 0 ? '+' : ''}{s.spike_pct.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-xs tabular-nums text-right font-bold text-slate-200">
                          Rp {Math.round(s.current_price).toLocaleString('id-ID')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('reports')}
              className="group relative mt-1 w-full overflow-hidden rounded-lg border border-white/20 bg-white/10 backdrop-blur px-3 py-2 text-xs tabular-nums font-medium text-white/80 hover:text-white hover:bg-white/15 cursor-pointer motion-safe:transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-60"
            >
              <span aria-hidden="true" className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:translate-x-full motion-safe:transition-transform motion-safe:duration-700" />
              <span className="relative flex items-center justify-center gap-1.5">
                Lihat Laporan <FileText className="w-3.5 h-3.5" />
              </span>
            </button>
          )}
        </section>

        {/* Row 4b: panel BNPB ringkas (kolom sempit → daftar, bukan tabel) */}
        <section className="col-span-12 lg:col-span-4 bg-[#0c1017] border border-white/10 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              Peringatan kebencanaan BNPB
            </h3>
            <span className="flex items-center gap-1.5">
              {bnpbLoading ? (
                <span className="text-xs font-mono text-slate-400 tabular-nums">memuat…</span>
              ) : !bnpbAvailable ? (
                <Badge variant="outline" className="bg-slate-500/15 text-slate-300 border-slate-400/30 text-xs tabular-nums">
                  BNPB UNAVAILABLE
                </Badge>
              ) : bnpbStale ? (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-400/30 text-xs tabular-nums">
                  STALE &gt;24h
                </Badge>
              ) : (
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {`${bnpbEvents.length} kejadian`}
                </span>
              )}
            </span>
          </div>
          <p
            className="text-xs text-slate-500 font-sans -mt-1 tabular-nums"
            title="Sumber: BNPB DIBI/bnpb.go.id · cache 1 jam"
          >
            Sumber: BNPB DIBI · cache 1 jam
          </p>

          {bnpbLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton rows={3} rowClassName="h-11" />
              <Empty loading />
            </div>
          ) : !bnpbAvailable || bnpbEvents.length === 0 ? (
            <div title={!bnpbAvailable ? 'Feed BNPB belum tersedia — poller 1 jam mencoba ulang (tidak memengaruhi harga/spike).' : undefined}>
              <Empty
                message={
                  !bnpbAvailable
                    ? 'Feed BNPB belum tersedia.'
                    : 'Tidak ada kejadian BNPB di Sumatera pada jendela ini.'
                }
              />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {bnpbEvents.slice(0, 8).map((e) => (
                <li key={e.dedup_key} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <AnalyticsTip
                    trigger={
                      <div
                        role="img"
                        aria-label={e.title}
                        tabIndex={0}
                        className="truncate rounded text-xs font-medium tabular-nums text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                      >
                        {e.title}
                      </div>
                    }
                    content={
                      <div className="min-w-48 max-w-64 space-y-0.5">
                        <TipTitle>{e.title}</TipTitle>
                        <TipRow k="Jenis" v={e.event_type} />
                        <TipRow k="Severity" v={e.severity} />
                        <TipRow k="Radius" v={e.radius_km != null ? `${Number(e.radius_km)} km` : '—'} />
                        <TipRow k="Waktu" v={formatFullDate(e.ts)} />
                        <TipSource>BNPB DIBI/bnpb.go.id · cache 1 jam</TipSource>
                      </div>
                    }
                  />
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs tabular-nums">
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-400">
                      <Badge variant="outline" className={`${severityBadge(e.severity)} font-bold tabular-nums`}>
                        {e.severity}
                      </Badge>
                      <span className="truncate">{e.event_type}</span>
                    </span>
                    <span className="shrink-0 text-slate-300">
                      {e.radius_km != null ? `${Number(e.radius_km)} km` : '—'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>

    </div>
  );
}
