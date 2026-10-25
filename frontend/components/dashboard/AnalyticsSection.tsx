'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import {
  TrendingUp,
  Activity,
  ShieldAlert,
  Layers,
  ArrowUpRight,
  Info,
  Anchor,
  Truck,
  Plane,
  RefreshCw,
  Clock,
  AlertTriangle,
  Filter,
  Radio,
  Newspaper,
  Flame,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CrisisState, CorridorContext, RouteRecommendation, ChokePointItem } from '@/lib/types';
import { Badge } from '@/components/base-ui/badge';
import { Button } from '@/components/base-ui/button';
import { Progress } from '@/components/base-ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/base-ui/popover';
import { Separator } from '@/components/base-ui/separator';

import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface AnalyticsSectionProps {
  selectedCrisis?: CrisisState | null;
  corridorContext?: CorridorContext | null;
  activeRoutes?: RouteRecommendation[];
  onSwitchTab?: (tab: 'map' | 'analytics' | 'reports' | 'evaluation') => void;
}

// ---------------------------------------------------------------------------
// M7-P3 dispatcher ops block: corridor vulnerability ranking + terminal board.
// Read-only: GET /weather/spatial-polygons + /intermodal/chokepoints only.
// No approvals:write / fleet:write calls, no simulation rebuild, no RED synth.
// ---------------------------------------------------------------------------

type FusedWeatherProps = {
  corridor_id?: string;
  corridor_segment?: string;
  hazard_type?: string;
  delay_hours?: number;
  estimated_delay_hours?: number;
  advisory_action?: string;
  affected_modalities?: string[];
  confidence?: number;
  severity?: string;
  region?: string;
  name?: string;
};

interface RankRow {
  corridor_id: string;
  segment: string;
  hazard: string;
  delay_h: number;
  advisory: string;
  modalities: string[];
  confidence: number;
  hits: number;
  news_count: number;
}

const ADVISORY_RANK: Record<string, number> = {
  HOLD_DEPARTURE: 3,
  REROUTE_RECOMMENDED: 2,
  CONSIDER_DELAY: 1,
  PROCEED_WITH_CAUTION: 0
};

const ADVISORY_LABEL: Record<string, string> = {
  HOLD_DEPARTURE: 'HOLD',
  REROUTE_RECOMMENDED: 'RERUTE',
  CONSIDER_DELAY: 'TUNDA',
  PROCEED_WITH_CAUTION: 'HATI-HATI'
};

function advisoryBadge(advisory: string): string {
  switch (advisory) {
    case 'HOLD_DEPARTURE':
      return 'bg-blue-500/15 text-blue-300 border-blue-400/30';
    case 'REROUTE_RECOMMENDED':
      return 'bg-sky-500/15 text-sky-300 border-sky-400/30';
    case 'CONSIDER_DELAY':
      return 'bg-purple-500/15 text-purple-300 border-purple-400/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-400/30';
  }
}

function terminalBadge(status: string): string {
  switch (status) {
    case 'BLOCKED':
    case 'RESTRICTED':
      return 'bg-orange-500/15 text-orange-300 border-orange-400/30';
    case 'CONGESTED':
      return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
    default:
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30';
  }
}

function prettifyCorridorId(id: string): string {
  return id.replace(/^sumatra_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// M7-P1 Analitik: shared filter bar (commodity/region/days) + regime banner
// + freshness strip. Filters drive api.commodities.prices refetch only;
// weather/terminal snapshots stay read-only (see M7-P3 filter bar below).
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
] as const;

const DAY_OPTIONS = [7, 14, 30] as const;

interface RegimeState {
  regime: string;
  critical_news_count: number | null;
  early_warning_count: number | null;
  commodity_volatility_score: number | null;
  primary_threat: string | null;
}

function regimeBadgeClass(regime: string): string {
  const r = regime.toUpperCase();
  if (r.includes('HIGH') || r.includes('DISRUPTION')) return 'bg-red-950/60 border-red-500/40 text-red-300';
  if (r.includes('WARNING') || r.includes('WASPADA')) return 'bg-amber-950/60 border-amber-500/40 text-amber-300';
  return 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300';
}

function regimeBadgeVariant(regime: string): 'secondary' | 'outline' | 'destructive' {
  const r = regime.toUpperCase();
  if (r.includes('HIGH') || r.includes('DISRUPTION')) return 'destructive';
  if (r.includes('WARNING') || r.includes('WASPADA')) return 'secondary';
  return 'outline';
}

function AnalyticsEmpty({ loading = false, title = 'Data tidak tersedia', message }: { loading?: boolean; title?: string; message?: string }) {
  return (
    <div
      {...(loading ? { role: 'status' as const } : {})}
      className="flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed border-white/10 text-slate-400"
    >
      <Info className="w-5 h-5 mb-2 text-slate-500" />
      <p className="text-xs font-medium text-slate-300">{loading ? 'Memuat…' : title}</p>
      {message ? <p className="text-xs text-slate-500 mt-1 max-w-xs font-sans">{message}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// U5-P3 Watermelon polish (presentational only): CSS-only animated numbers +
// skeleton blocks. No new deps. motion-safe: guards every animation so
// prefers-reduced-motion renders static. Keyframes are defined once via the
// <AnalyticsMotionStyle /> style tag rendered at the section root.
// ---------------------------------------------------------------------------

function AnalyticsMotionStyle() {
  return (
    <style>{`@keyframes analytics-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
  );
}

// CSS-only opacity pulse keyed on value: remount (key change) replays the
// motion-safe animation; reduced-motion renders the final static state.
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

// Skeleton rows matching table/cards row height. aria-hidden: the visible
// role=status text inside AnalyticsEmpty stays the E2E hook.
function LoadingSkeleton({ rows = 4, rowClassName }: { rows?: number; rowClassName?: string }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`motion-safe:animate-pulse bg-white/5 rounded-md w-full ${rowClassName ?? 'h-11'}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// M7-P2 Analitik: price disparity heatmap + spikes table.
// Bands reuse backend commodity_router thresholds (5/10/15%): <5 stabil,
// 5-10 waspada, 10-15 tinggi, >=15 kritis. Price-only signals — never RED
// for weather. No new deps (Scatterplot/TextLayer from @deck.gl/layers).
// ---------------------------------------------------------------------------

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

type BandId = 'stable' | 'warning' | 'elevated' | 'critical';

interface BandDef {
  id: BandId;
  label: string;
  range: string;
  min: number;
  max: number;
  fill: [number, number, number, number];
  dot: string;
}

const SPIKE_BANDS: BandDef[] = [
  { id: 'stable', label: 'Stabil', range: '< 5%', min: -Infinity, max: 5, fill: [100, 116, 139, 170], dot: 'bg-slate-400' },
  { id: 'warning', label: 'Waspada', range: '5–10%', min: 5, max: 10, fill: [245, 158, 11, 200], dot: 'bg-amber-400' },
  { id: 'elevated', label: 'Tinggi', range: '10–15%', min: 10, max: 15, fill: [249, 115, 22, 210], dot: 'bg-orange-400' },
  { id: 'critical', label: 'Kritis', range: '≥ 15%', min: 15, max: Infinity, fill: [239, 68, 68, 220], dot: 'bg-red-400' },
];

// Backend commodity_router thresholds: >=15 critical, >=10 high, >=5 medium.
function bandForSpike(pct: number | null): BandDef {
  if (pct !== null) {
    if (pct >= 15) return SPIKE_BANDS[3];
    if (pct >= 10) return SPIKE_BANDS[2];
    if (pct >= 5) return SPIKE_BANDS[1];
  }
  return SPIKE_BANDS[0];
}

function severityBadge(severity: string): string {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'bg-red-500/15 text-red-300 border-red-400/30';
  if (s === 'high') return 'bg-orange-500/15 text-orange-300 border-orange-400/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
}

// Display coordinates for regions present in real PIHPS data, grounded in
// PAN_SUMATRA_GAZETTEER. Unknown slugs get a deterministic hash offset near
// central Sumatra (display position only — no synthetic prices).
const REGION_COORDS: Record<string, [number, number]> = {
  medan: [98.6722, 3.5952],
  belawan: [98.6913, 3.7944],
  binjai: [98.4854, 3.6001],
  tebing_tinggi: [99.1625, 3.3285],
  tebingtinggi: [99.1625, 3.3285],
  berastagi: [98.5049, 3.1853],
  karo: [98.5049, 3.1853],
  north_sumatra: [98.6722, 3.5952],
  sumut: [98.6722, 3.5952],
  sumatera_utara: [98.6722, 3.5952],
  sumbar: [100.3631, -0.9471],
  sumatera_barat: [100.3631, -0.9471],
  riau: [101.4478, 0.5071],
  aceh: [95.3238, 5.5463],
  sumsel: [104.7754, -2.9761],
  sumatera_selatan: [104.7754, -2.9761],
  lampung: [105.2668, -5.4289],
  jambi: [103.6222, -1.6197],
  bengkulu: [102.2641, -3.7928],
};

function coordsForRegion(region: string): [number, number] {
  const slug = (region || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  const base = REGION_COORDS[slug];
  if (base) return base;
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const lon = 100.5 + (((h % 200) / 200) - 0.5) * 3;
  const lat = 1.5 + ((((h >> 8) % 200) / 200) - 0.5) * 4;
  return [Math.round(lon * 10000) / 10000, Math.round(lat * 10000) / 10000];
}

interface DisparityPoint {
  position: [number, number];
  labelPosition: [number, number];
  region: string;
  commodity: string;
  spikePct: number | null;
  band: BandId;
  latestPrice: number | null;
  count: number;
  label: string;
  fill: [number, number, number, number];
  radius: number;
}

function prettifyRegion(region: string): string {
  return (region || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ModalityChips({ mods }: { mods: string[] }) {
  if (!mods || mods.length === 0) return <span className="text-slate-500">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {mods.map((m) => {
        const key = m.toLowerCase();
        const Icon = key === 'sea' ? Anchor : key === 'air' ? Plane : Truck;
        return (
          <span key={key} title={key} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-slate-300">
            <Icon className="w-3 h-3" />
            <span className="text-xs">{key}</span>
          </span>
        );
      })}
    </span>
  );
}

export default function DashboardAnalyticsSection({
  selectedCrisis,
  corridorContext,
  activeRoutes,
  onSwitchTab
}: AnalyticsSectionProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);

  const [ricePrice, setRicePrice] = useState<number | null>(null);
  const [shallotsDelta, setShallotsDelta] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState<boolean>(true);

  // M7-P1: shared analitik filters — drive the PIHPS price fetch below.
  const [commodity, setCommodity] = useState<string>('beras');
  const [priceRegion, setPriceRegion] = useState<string>('');
  const [days, setDays] = useState<number>(7);

  // M7-P1: market regime banner state (honest empty on fetch failure).
  const [regime, setRegime] = useState<RegimeState | null>(null);
  const [regimeError, setRegimeError] = useState<boolean>(false);

  // M7-P2: price disparity heatmap + spikes table (reuses P1 commodity/priceRegion).
  const [spikes, setSpikes] = useState<SpikeItem[]>([]);
  const [spikesLoading, setSpikesLoading] = useState<boolean>(true);
  const [spikeRecordsTotal, setSpikeRecordsTotal] = useState<number>(0);
  const [regionAgg, setRegionAgg] = useState<Array<{ region: string; latest: number; count: number }>>([]);
  const [activeBands, setActiveBands] = useState<Record<BandId, boolean>>({
    stable: true, warning: true, elevated: true, critical: true,
  });
  const [legendOpen, setLegendOpen] = useState<boolean>(true);
  const disparityRef = useRef<DisparityPoint[]>([]);
  const bandsRef = useRef<Record<BandId, boolean>>({
    stable: true, warning: true, elevated: true, critical: true,
  });

  // M7-P3 state: fused weather ranking + terminal board (read-only GETs)
  // NOTE: corridorFilter/advisoryFilter are ops-scoped (corridor_id/advisory
  // dimensions on weather/terminal snapshots) — distinct from the shared P1
  // priceRegion above, which drives /prices + /spikes only.
  const [wxFeatures, setWxFeatures] = useState<GeoJSON.Feature[]>([]);
  const [wxLoading, setWxLoading] = useState<boolean>(true);
  const [wxError, setWxError] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<ChokePointItem[]>([]);
  const [termLoading, setTermLoading] = useState<boolean>(true);
  const [termError, setTermError] = useState<string | null>(null);
  const [newsCounts, setNewsCounts] = useState<Record<string, number>>({});
  const [corridorFilter, setCorridorFilter] = useState<string>('all');
  const [advisoryFilter, setAdvisoryFilter] = useState<string>('all');

  // M7-P1: URL sync (?commodity&region&days) — local state fallback when absent.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const c = sp.get('commodity');
      const r = sp.get('region');
      const d = sp.get('days');
      if (c && COMMODITY_OPTIONS.some((o) => o.value === c)) setCommodity(c);
      if (r !== null && REGION_OPTIONS.some((o) => o.value === r)) setPriceRegion(r);
      if (d && (DAY_OPTIONS as readonly number[]).includes(Number(d))) setDays(Number(d));
    } catch {
      /* local state only */
    }
    // mount-only: read initial URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Fetch real PIHPS prices for the selected M7-P1 filter combo.
  // State names (ricePrice/shallotsDelta) preserved for existing telemetry/badge wiring,
  // generalized to the selected commodity.
  useEffect(() => {
    let isMounted = true;
    async function loadPrices() {
      setIsLoadingPrices(true);
      try {
        const res = await api.commodities.prices({
          commodity,
          ...(priceRegion ? { region: priceRegion } : {}),
          limit: days,
        });
        if (!isMounted) return;
        const items = res?.items ?? [];
        if (items.length > 0) {
          setRicePrice(items[0].price_idr);
          setPriceHistory(items.map((item: { price_idr: number }) => item.price_idr).reverse());
        } else {
          setRicePrice(null);
          setPriceHistory([]);
        }
        if (items.length >= 2) {
          const latest = items[0].price_idr;
          const prev = items[1].price_idr;
          const delta = prev !== 0 ? ((latest - prev) / prev) * 100 : 0;
          setShallotsDelta(`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`);
        } else {
          setShallotsDelta(null);
        }
      } catch (err) {
        console.error('Failed to load prices for AnalyticsSection:', err);
        if (isMounted) {
          setRicePrice(null);
          setShallotsDelta(null);
          setPriceHistory([]);
        }
      } finally {
        if (isMounted) setIsLoadingPrices(false);
      }
    }
    loadPrices();
    return () => {
      isMounted = false;
    };
  }, [commodity, priceRegion, days]);

  // M7-P1: market regime banner — honest empty when fetch fails.
  useEffect(() => {
    let isMounted = true;
    async function loadRegime() {
      try {
        const res = await api.news.marketRegime() as unknown as Record<string, unknown>;
        if (!isMounted) return;
        const activeIndicators = Array.isArray(res.active_crisis_indicators) ? res.active_crisis_indicators : [];
        const critical = (res.critical_news_count ?? (activeIndicators.length > 0 ? activeIndicators.length : null)) as number | null;
        const early = (res.early_warning_count ?? null) as number | null;
        const vol = (res.commodity_volatility_score ?? null) as number | null;
        const threat = (res.primary_threat ?? (activeIndicators.length > 0 ? String(activeIndicators[0]) : null)) as string | null;
        setRegime({
          regime: String(res.regime ?? 'UNKNOWN'),
          critical_news_count: typeof critical === 'number' ? critical : null,
          early_warning_count: typeof early === 'number' ? early : null,
          commodity_volatility_score: typeof vol === 'number' ? vol : null,
          primary_threat: threat,
        });
        setRegimeError(false);
      } catch (err) {
        console.error('Failed to load market regime:', err);
        if (isMounted) {
          setRegime(null);
          setRegimeError(true);
        }
      }
    }
    loadRegime();
    return () => {
      isMounted = false;
    };
  }, []);

  // M7-P2: disparity inputs — spikes (server region-filtered) + per-region price
  // aggregates for the P1-selected commodity. Refetch on every filter change.
  useEffect(() => {
    let isMounted = true;
    async function loadDisparity() {
      setSpikesLoading(true);
      try {
        const [spikeRes, priceRes] = await Promise.all([
          api.commodities.spikes(priceRegion ? { region: priceRegion } : undefined),
          api.commodities.prices({ commodity, limit: 100 }),
        ]);
        if (!isMounted) return;
        const spikeItems: SpikeItem[] = Array.isArray(spikeRes?.spikes) ? spikeRes.spikes : [];
        const priceItems = Array.isArray(priceRes?.items) ? priceRes.items : [];
        setSpikes(spikeItems.filter((s) => !commodity || s.commodity === commodity));
        setSpikeRecordsTotal(priceItems.length);
        // Group by region: latest price (items are desc by time) + record count.
        const byRegion = new Map<string, { latest: number; count: number }>();
        for (const it of priceItems) {
          const reg = String(it.region ?? 'unknown');
          const price = Number(it.price_idr) || 0;
          const cur = byRegion.get(reg);
          if (!cur) byRegion.set(reg, { latest: price, count: 1 });
          else cur.count += 1;
        }
        setRegionAgg(Array.from(byRegion.entries()).map(([reg, v]) => ({ region: reg, latest: v.latest, count: v.count })));
      } catch (err) {
        console.error('Failed to load price disparity for AnalyticsSection:', err);
        if (isMounted) {
          setSpikes([]);
          setSpikeRecordsTotal(0);
          setRegionAgg([]);
        }
      } finally {
        if (isMounted) setSpikesLoading(false);
      }
    }
    loadDisparity();
    return () => { isMounted = false; };
  }, [commodity, priceRegion]);

  // M7-P3: read-only fetches — fused weather polygons + terminal choke board
  useEffect(() => {
    let isMounted = true;
    async function loadOps() {
      setWxLoading(true);
      setTermLoading(true);
      setWxError(null);
      setTermError(null);
      try {
        const fc = await api.weather.spatialPolygons();
        if (isMounted) setWxFeatures(Array.isArray(fc?.features) ? fc.features : []);
      } catch (err) {
        if (isMounted) setWxError(err instanceof Error ? err.message : 'Gagal memuat cuaca spasial');
      } finally {
        if (isMounted) setWxLoading(false);
      }
      try {
        const res = await api.intermodal.listChokePoints();
        if (isMounted) setTerminals(Array.isArray(res?.items) ? res.items : []);
      } catch (err) {
        if (isMounted) setTermError(err instanceof Error ? err.message : 'Gagal memuat terminal');
      } finally {
        if (isMounted) setTermLoading(false);
      }
      // Best-effort news corridor_segment counts (honest: only counted when keys exist)
      try {
        const news = await api.news.live();
        const counts: Record<string, number> = {};
        for (const item of news?.items ?? []) {
          const rec = item as Record<string, unknown>;
          const seg = [rec['corridor_segment'], rec['corridor_id'], rec['segment']]
            .find((v) => typeof v === 'string' && (v as string).length > 0) as string | undefined;
          if (seg) counts[seg] = (counts[seg] ?? 0) + 1;
        }
        if (isMounted) setNewsCounts(counts);
      } catch {
        if (isMounted) setNewsCounts({});
      }
    }
    loadOps();
    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize Mapbox & Deck.gl spatial archipelago map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [104.5, 1.8], // Center over Indonesia (Sumatra - Java corridor)
        zoom: 5.2,
        pitch: 35,
        bearing: -10,
        projection: { name: 'globe' },
        attributionControl: false,
      });

      mapRef.current = map;

      map.on('load', () => {
        map.resize();
        map.setFog({
          color: 'rgb(8, 10, 15)',
          'high-color': 'rgb(12, 16, 24)',
          'space-color': 'rgb(4, 6, 8)',
          'horizon-blend': 0.05,
        });
        try {
          const deckOverlay = new MapboxOverlay({
            interleaved: false,
            layers: []
          });

          map.addControl(deckOverlay as unknown as mapboxgl.IControl);
          deckOverlayRef.current = deckOverlay;
          updateDeckLayers();
        } catch (deckErr) {
          console.warn('Deck.gl overlay initialization error:', deckErr);
        }
      });
    } catch (err) {
      console.warn('Mapbox initialization error in AnalyticsSection:', err);
    }

    // ResizeObserver to ensure canvas fills container on layout updates / tab switches
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // M7-P2: disparity points — backend spike_pct drives band/color; regions with
  // prices but no spike render as stabil. Refs feed updateDeckLayers directly
  // so the map-load closure and filter-change effects stay race-free.
  const disparity: DisparityPoint[] = useMemo(() => {
    const spikeByRegion = new Map<string, SpikeItem>();
    for (const s of spikes) {
      const prev = spikeByRegion.get(s.region);
      if (!prev || s.spike_pct > prev.spike_pct) spikeByRegion.set(s.region, s);
    }
    const regions = new Set<string>([
      ...regionAgg.map((r) => r.region),
      ...spikes.map((s) => s.region),
    ]);
    const pts: DisparityPoint[] = [];
    regions.forEach((reg) => {
      const agg = regionAgg.find((r) => r.region === reg);
      const spike = spikeByRegion.get(reg);
      const pct = spike ? spike.spike_pct : null;
      const band = bandForSpike(pct);
      const [lon, lat] = coordsForRegion(reg);
      // Deterministic micro-offset so co-located hub regions don't fully overlap.
      let h = 0;
      for (let i = 0; i < reg.length; i += 1) h = (h * 33 + reg.charCodeAt(i)) >>> 0;
      const jLon = Math.round((lon + ((h % 17) - 8) * 0.012) * 10000) / 10000;
      const jLat = Math.round((lat + (((h >> 5) % 17) - 8) * 0.012) * 10000) / 10000;
      const label = `${prettifyRegion(reg)}${pct !== null ? ` ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}`;
      pts.push({
        position: [jLon, jLat],
        labelPosition: [jLon, jLat + 0.09],
        region: reg,
        commodity: spike ? spike.commodity : commodity,
        spikePct: pct,
        band: band.id,
        latestPrice: agg ? agg.latest : (spike ? spike.current_price : null),
        count: agg ? agg.count : 0,
        label,
        fill: band.fill,
        radius: 6000 + Math.min(Math.abs(pct ?? 0), 30) * 900,
      });
    });
    return pts;
  }, [spikes, regionAgg, commodity]);

  const aggByRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of regionAgg) m.set(r.region, r.count);
    return m;
  }, [regionAgg]);

  const filteredSpikes = useMemo(() => {
    return [...spikes]
      .filter((s) => !commodity || s.commodity === commodity)
      .sort((a, b) => b.spike_pct - a.spike_pct);
  }, [spikes, commodity]);

  const bandCounts = useMemo(() => {
    const c: Record<BandId, number> = { stable: 0, warning: 0, elevated: 0, critical: 0 };
    for (const p of disparity) c[p.band] += 1;
    return c;
  }, [disparity]);

  // Deck.gl Layer updater — M7-P2 renders the price disparity heatmap
  // (Scatterplot + labels); empty layers array when no disparity data.
  const updateDeckLayers = () => {
    if (!deckOverlayRef.current) return;
    try {
      const visible = disparityRef.current.filter((p) => bandsRef.current[p.band]);
      deckOverlayRef.current.setProps({
        layers: visible.length === 0 ? [] : [
          new ScatterplotLayer<DisparityPoint>({
            id: 'price-disparity',
            data: visible,
            getPosition: (d: DisparityPoint) => d.position,
            getRadius: (d: DisparityPoint) => d.radius,
            radiusUnits: 'meters',
            getFillColor: (d: DisparityPoint) => d.fill,
            getLineColor: [255, 255, 255, 90],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            stroked: true,
            filled: true,
            opacity: 0.85,
            pickable: true,
          }),
          new TextLayer<DisparityPoint>({
            id: 'price-disparity-labels',
            data: visible,
            getPosition: (d: DisparityPoint) => d.labelPosition,
            getText: (d: DisparityPoint) => d.label,
            getSize: 12,
            sizeUnits: 'pixels',
            getColor: [226, 232, 240, 230],
            getAlignmentBaseline: 'center',
            fontFamily: 'monospace',
            outlineWidth: 2,
            outlineColor: [8, 13, 20, 220],
          }),
        ],
      });
    } catch (err) {
      console.warn('Deck.gl disparity layer error:', err);
    }
  };

  // Keep deck refs in sync and repaint on every disparity/filter render.
  useEffect(() => {
    disparityRef.current = disparity;
    updateDeckLayers();
  });

  const toggleBand = (id: BandId) => {
    const next = { ...activeBands, [id]: !activeBands[id] };
    setActiveBands(next);
    bandsRef.current = next;
    updateDeckLayers();
  };

  useEffect(() => {
    updateDeckLayers();
  }, [selectedCrisis, corridorContext, activeRoutes]);

  // Compute bar heights safely from real priceHistory
  const maxP = priceHistory.length > 0 ? Math.max(...priceHistory) : 1;
  const minP = priceHistory.length > 0 ? Math.min(...priceHistory) * 0.95 : 0;
  const barHeights = priceHistory.map((p) =>
    maxP === minP ? '50%' : `${((p - minP) / (maxP - minP)) * 75 + 15}%`
  );

  // ---- M7-P1: derived display values ----
  const commodityLabel = COMMODITY_OPTIONS.find((o) => o.value === commodity)?.label ?? commodity;
  // Honest empty: fewer than 3 records is not a trend.
  const hasEnoughRecords = priceHistory.length >= 3;
  const di = corridorContext?.data_integrity;
  const isFallback = !!corridorContext?.is_fallback;
  const freshnessItems = [
    { label: 'BMKG', value: di?.bmkg_status ?? null },
    { label: 'TomTom', value: di?.tomtom_status ?? null },
    { label: 'PIHPS', value: di?.pihps_status ?? null },
    { label: 'ANTARA', value: null as string | null },
  ];

  // ---- M7-P3: corridor vulnerability ranking (aggregate fused hits) ----
  const rankRows: RankRow[] = useMemo(() => {
    const groups = new Map<string, GeoJSON.Feature[]>();
    for (const f of wxFeatures) {
      const p = (f.properties ?? {}) as FusedWeatherProps;
      const cid = typeof p.corridor_id === 'string' && p.corridor_id.length > 0 ? p.corridor_id : 'unknown';
      const arr = groups.get(cid) ?? [];
      arr.push(f);
      groups.set(cid, arr);
    }
    const rows: RankRow[] = [];
    groups.forEach((feats: GeoJSON.Feature[], cid: string) => {
      let delay = 0;
      let conf = 0;
      let advisory = 'PROCEED_WITH_CAUTION';
      let hazard = '—';
      let segment = '—';
      const mods: string[] = [];
      for (const f of feats) {
        const p = (f.properties ?? {}) as FusedWeatherProps;
        const d = Number(p.delay_hours ?? p.estimated_delay_hours ?? 0) || 0;
        const c = Number(p.confidence ?? 0) || 0;
        if (d >= delay) {
          delay = d;
          if (typeof p.hazard_type === 'string' && p.hazard_type) hazard = p.hazard_type;
          if (typeof p.corridor_segment === 'string' && p.corridor_segment) segment = p.corridor_segment;
        }
        if (c > conf) conf = c;
        const adv = typeof p.advisory_action === 'string' ? p.advisory_action : 'PROCEED_WITH_CAUTION';
        if ((ADVISORY_RANK[adv] ?? 0) > (ADVISORY_RANK[advisory] ?? 0)) advisory = adv;
        for (const m of p.affected_modalities ?? []) { const ms = String(m); if (mods.indexOf(ms) < 0) mods.push(ms); }
      }
      rows.push({
        corridor_id: cid,
        segment,
        hazard,
        delay_h: Math.round(delay * 10) / 10,
        advisory,
        modalities: mods,
        confidence: Math.round(conf * 100) / 100,
        hits: feats.length,
        news_count: newsCounts[cid] ?? newsCounts[segment] ?? 0
      });
    });
    // Corridor context traffic delay augments the matching corridor row only (no synthetic rows).
    if (corridorContext) {
      const extraH = Math.round(((corridorContext.traffic?.delay_minutes ?? 0) / 60) * 10) / 10;
      const match = rows.find((r) => r.corridor_id === corridorContext.corridor_id);
      if (match && extraH > 0) match.delay_h = Math.round((match.delay_h + extraH) * 10) / 10;
    }
    rows.sort((a, b) => b.delay_h - a.delay_h || b.confidence - a.confidence);
    return rows;
  }, [wxFeatures, newsCounts, corridorContext]);

  const filteredRows = useMemo(() => {
    return rankRows.filter((r) => {
      if (corridorFilter !== 'all' && r.corridor_id !== corridorFilter) return false;
      if (advisoryFilter !== 'all' && r.advisory !== advisoryFilter) return false;
      return true;
    });
  }, [rankRows, corridorFilter, advisoryFilter]);

  const regionOptions = useMemo(() => {
    const seen: string[] = [];
    for (const r of rankRows.map((x) => x.corridor_id)) {
      if (seen.indexOf(r) < 0) seen.push(r);
    }
    return seen;
  }, [rankRows]);
  const maxDelay = useMemo(() => {
    let m = 1;
    for (const r of rankRows) { if (r.delay_h > m) m = r.delay_h; }
    return m;
  }, [rankRows]);

  // ---- M7-P3: terminal choke board (aggregate only, sorted by M desc) ----
  const sortedTerminals = useMemo(() => {
    return [...terminals].sort(
      (a, b) => (b.intermodal_delay_multiplier ?? 1) - (a.intermodal_delay_multiplier ?? 1)
    );
  }, [terminals]);
  const termAgg = useMemo(() => {
    if (terminals.length === 0) return null;
    const totalQueue = terminals.reduce((s, t) => s + (t.queue_count ?? 0), 0);
    const avgDwell = terminals.reduce((s, t) => s + (t.dwelling_time_hours ?? 0), 0) / terminals.length;
    return {
      total: terminals.length,
      congested: terminals.filter((t) => t.status === 'CONGESTED').length,
      restricted: terminals.filter((t) => t.status === 'RESTRICTED' || t.status === 'BLOCKED').length,
      totalQueue,
      avgDwell: Math.round(avgDwell * 10) / 10
    };
  }, [terminals]);

  // ---- Optional at-risk cargo ticker: aggregate only, honest empty otherwise ----
  const atRisk = useMemo(() => {
    const routes = activeRoutes ?? [];
    const withValue = routes.filter((r) => typeof r.hedging?.cargo_value_idr === 'number');
    if (withValue.length === 0) return null;
    const totalValue = withValue.reduce((s, r) => s + (r.hedging?.cargo_value_idr ?? 0), 0);
    const totalSpoilage = withValue.reduce((s, r) => s + (r.hedging?.spoilage_loss_idr ?? 0), 0);
    return { count: withValue.length, totalValue, totalSpoilage };
  }, [activeRoutes]);

  return (
    <div className="w-full min-h-full lg:h-full flex flex-col gap-6 pointer-events-auto">
      <AnalyticsMotionStyle />

      {/* M7-P1: shared analitik filter bar — drives PIHPS price refetch */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-slate-200">
          <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter harga
        </span>
        <label className="flex items-center gap-1.5 text-slate-400">
          Komoditas
          <select
            value={commodity}
            onChange={(e) => setCommodity(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2 py-1.5 cursor-pointer"
          >
            {COMMODITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#0c1017]">{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-400">
          Wilayah
          <select
            value={priceRegion}
            onChange={(e) => setPriceRegion(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2 py-1.5 cursor-pointer"
          >
            {REGION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#0c1017]">{o.label}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1.5" role="group" aria-label="Rentang waktu">
          {DAY_OPTIONS.map((d) => (
            <Button
              key={d}
              variant={days === d ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className="tabular-nums text-xs"
            >
              {d} hari
            </Button>
          ))}
        </div>
      </div>

      {/* M7-P1: regime banner — honest empty when fetch fails */}
      <div className={`border rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs ${regime ? regimeBadgeClass(regime.regime) : 'bg-[#0c1017] border-white/10 text-slate-400'}`}>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Newspaper className="w-3.5 h-3.5 shrink-0" /> Rezim pasar
        </span>
        {regime ? (
          <>
            <Badge variant={regimeBadgeVariant(regime.regime)} className={`${regimeBadgeClass(regime.regime)} font-bold tracking-wide tabular-nums text-xs`}>
              {regime.regime}
            </Badge>
            <span className="tabular-nums">
              Kritis:{' '}
              {regime.critical_news_count !== null && regime.critical_news_count !== undefined ? (
                <AnimatedValue value={regime.critical_news_count}>{regime.critical_news_count}</AnimatedValue>
              ) : (
                'Data tidak tersedia'
              )}
            </span>
            <span className="tabular-nums">
              Peringatan dini:{' '}
              {regime.early_warning_count !== null && regime.early_warning_count !== undefined ? (
                <AnimatedValue value={regime.early_warning_count}>{regime.early_warning_count}</AnimatedValue>
              ) : (
                'Data tidak tersedia'
              )}
            </span>
            <span className="tabular-nums">
              Volatilitas:{' '}
              {regime.commodity_volatility_score !== null && regime.commodity_volatility_score !== undefined ? (
                <AnimatedValue value={regime.commodity_volatility_score}>{regime.commodity_volatility_score}</AnimatedValue>
              ) : (
                'Data tidak tersedia'
              )}
            </span>
            {regime.primary_threat && <span className="truncate max-w-[280px]" title={regime.primary_threat}>Ancaman: {regime.primary_threat}</span>}
          </>
        ) : (
          <AnalyticsEmpty loading={!regimeError} />
        )}
      </div>

      {/* M7-P1: freshness strip (TopNavTelemetry pattern — no new deps) */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-slate-400">
          <Radio className="w-3.5 h-3.5" /> Kesegaran data
        </span>
        {freshnessItems.map((f) => (
          <span key={f.label} className="flex items-center gap-1.5 tabular-nums">
            <span className={`w-1.5 h-1.5 rounded-full ${f.value ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span className="text-slate-400">{f.label}:</span>
            <span className="text-slate-200">{f.value ?? 'Data tidak tersedia'}</span>
          </span>
        ))}
        <Separator orientation="vertical" className="h-4" />
        <Badge variant={isFallback ? 'destructive' : 'secondary'} className={`text-xs font-bold tabular-nums ${isFallback ? 'bg-amber-950/60 border-amber-500/40 text-amber-300' : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'}`}>
          {isFallback ? 'FALLBACK' : 'LIVE'}
        </Badge>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" type="button" title="Provenans kesegaran data" className="text-xs tabular-nums">
                <Info className="w-3.5 h-3.5" /> Provenans
              </Button>
            }
          />
          <PopoverContent side="bottom" sideOffset={8} className="w-72 p-4">
            <p className="text-xs font-semibold text-white mb-2">Provenans kesegaran data</p>
            <div className="space-y-1.5">
              {freshnessItems.map((f) => (
                <p key={f.label} className="text-xs tabular-nums flex items-center justify-between gap-2">
                  <span className="text-slate-400">{f.label}</span>
                  <span className="text-slate-200">{f.value ?? 'Data tidak tersedia'}</span>
                </p>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {corridorContext?.timestamp && <span className="text-slate-500 tabular-nums w-full sm:w-auto">{corridorContext.timestamp}</span>}
      </div>

      <div className="w-full grid grid-cols-12 gap-6">

      {/* LEFT SECTION: Spatial Canvas & Real Corridor Context */}
      <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0 gap-4">

        {/* Telemetry Header */}
        <div className="flex flex-wrap justify-between items-center gap-4 bg-[#0c1017] border border-white/10 p-5 rounded-xl shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-300" />
              <h2 className="font-headline text-lg font-semibold tracking-wide text-white">
                Peta Arus Distribusi & Kerentanan Pangan
              </h2>
            </div>
            <p className="text-xs font-sans text-slate-400 mt-1">
              Pemantauan spasial aliran komoditas pangan pokok dan pergerakan harga pasar.
            </p>
          </div>

          <div className="flex items-center gap-3">
  <div className="flex items-center gap-2 px-1 py-2">
              <Activity className="w-4 h-4 text-slate-300" />
              <div>
  <span className="text-xs text-slate-400 font-medium block">Rute operasional</span>
                <span className="text-xs font-mono font-bold text-white tabular-nums">
                  {activeRoutes && activeRoutes.length > 0 ? (
                    <AnimatedValue value={activeRoutes.length}>{`${activeRoutes.length} Koridor`}</AnimatedValue>
                  ) : (
                    'Data tidak tersedia'
                  )}
                </span>
              </div>
            </div>

  <div className="flex items-center gap-2 px-1 py-2">
              <ShieldAlert className="w-4 h-4 text-slate-300" />
              <div>
  <span className="text-xs text-slate-400 font-medium block">Disrupsi aktif</span>
                <span className="text-xs font-mono font-bold text-white tabular-nums truncate max-w-[140px] block" title={selectedCrisis?.title || 'Data tidak tersedia'}>
                  {selectedCrisis ? selectedCrisis.title : 'Data tidak tersedia'}
                </span>
              </div>
            </div>

  <div className="flex items-center gap-2 px-1 py-2">
              <TrendingUp className="w-4 h-4 text-slate-300" />
              <div>
  <span className="text-xs text-slate-400 font-medium block">Delta harga</span>
                <span className="text-xs font-mono font-bold text-white tabular-nums">
                  {shallotsDelta !== null ? (
                    <AnimatedValue value={shallotsDelta}>{shallotsDelta}</AnimatedValue>
                  ) : (
                    'Data tidak tersedia'
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* MAP CANVAS VIEWPORT CONTAINER */}
        <div className="flex-1 relative rounded-xl border border-white/10 overflow-hidden bg-[#080d14] min-h-[360px]">

          {/* Mapbox Canvas */}
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

          {/* Honest Status Overlay */}
  <div className="absolute top-4 left-4 z-20 bg-[#0c1017]/90 border border-white/10 px-3.5 py-2 rounded-lg text-xs flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            <span className="text-slate-300 font-sans">
              Visualisasi Aliran Komoditas Spasial (Sumatera - Jawa)
            </span>
          </div>

          {/* M7-P2: band toggles (Button sm + aria-pressed; native title kept —
              no Portal/Popover over Mapbox to avoid portal clipping) */}
          <div className="absolute top-4 right-4 z-20 flex flex-wrap justify-end gap-1.5 max-w-[55%]">
            {SPIKE_BANDS.map((b) => (
              <Button
                key={b.id}
                type="button"
                variant={activeBands[b.id] ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => toggleBand(b.id)}
                aria-pressed={activeBands[b.id]}
                title={`${b.label} (${b.range}) — klik untuk tampil/sembunyi`}
                className={`tabular-nums motion-safe:transition-colors motion-safe:duration-150 ${
                  activeBands[b.id]
                    ? 'bg-[#0c1017]/90 border-white/20 text-slate-200'
                    : 'bg-[#0c1017]/60 border-white/10 text-slate-500 line-through'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${b.dot}`} />
                {b.label}
                <AnimatedValue value={bandCounts[b.id]} className="text-slate-500">
                  {bandCounts[b.id]}
                </AnimatedValue>
              </Button>
            ))}
          </div>

          {/* Region Metric Badge */}
  <div className="absolute bottom-4 left-4 z-20 bg-[#0c1017]/90 border border-white/10 p-4 rounded-xl text-xs space-y-2 max-w-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${ricePrice !== null ? 'bg-emerald-400' : 'bg-slate-500'}`} />
  <span className="font-semibold text-xs tracking-wide text-white">Koridor</span>
            </div>
  <div className="grid grid-cols-2 gap-x-4 pt-1 text-xs">
              <span className="text-slate-400">Harga {commodityLabel}:</span>
              <span className="text-slate-200 font-bold tabular-nums">
                {ricePrice !== null ? (
                  <AnimatedValue value={ricePrice}>{`Rp ${ricePrice.toLocaleString('id-ID')} / kg`}</AnimatedValue>
                ) : (
                  'Data tidak tersedia'
                )}
              </span>
              <span className="text-slate-400">Delta {commodityLabel}:</span>
              <span className="font-bold tabular-nums text-slate-200">
                {shallotsDelta !== null ? (
                  <AnimatedValue value={shallotsDelta} className={shallotsDelta.startsWith('+') ? 'text-amber-400' : 'text-emerald-400'}>
                    {shallotsDelta}
                  </AnimatedValue>
                ) : (
                  'Data tidak tersedia'
                )}
              </span>
            </div>
            {onSwitchTab && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSwitchTab('map')}
                className="mt-2.5 w-full text-xs tabular-nums"
              >
                Simulasi Bencana (Peta) <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {/* M7-P2: collapsible disparity legend — inline collapse kept (never a
              Portal: portal content clips/misplaces over the Mapbox canvas).
              Static chrome titles keep native title tooltips; the only Popover
              in this section is the provenance one using render-pattern. */}
          <div className="absolute bottom-4 right-4 z-20 bg-[#0c1017]/90 border border-white/10 rounded-xl text-xs w-[220px]">
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-slate-200 font-semibold cursor-pointer"
              aria-expanded={legendOpen}
              aria-controls="analytics-disparity-legend"
            >
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-slate-400" /> Disparitas harga
              </span>
              {legendOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {legendOpen && (
              <div id="analytics-disparity-legend" className="px-3 pb-3 space-y-1.5">
                {SPIKE_BANDS.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 tabular-nums">
                    <span className={`w-2.5 h-2.5 rounded-sm ${b.dot}`} />
                    <span className="text-slate-300">{b.label}</span>
                    <span className="text-slate-500 ml-auto">
                      {b.range} ·{' '}
                      <AnimatedValue value={bandCounts[b.id]}>
                        {`${bandCounts[b.id]} wilayah`}
                      </AnimatedValue>
                    </span>
                  </div>
                ))}
                <p className="text-slate-500 pt-1.5 border-t border-white/10">
                  Ambang backend 5/10/15% · sinyal harga saja, bukan cuaca.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT SECTION: Sidebar (Real PIHPS Price History & Honest Risk Ranking) */}
  <section className="col-span-12 lg:col-span-4 bg-[#0c1017] border border-white/10 p-5 flex flex-col gap-6 overflow-y-auto no-scrollbar rounded-xl">

        {/* Price History Card */}
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
  <TrendingUp className="w-4 h-4 text-slate-300" /> Harga {commodityLabel}
            </h3>
  <span className="text-xs text-slate-300 font-medium tabular-nums">
              {ricePrice !== null ? (
                <AnimatedValue value={ricePrice}>{`Rp ${ricePrice.toLocaleString('id-ID')} / kg`}</AnimatedValue>
              ) : (
                'Data tidak tersedia'
              )}
            </span>
          </div>

  <div className="border-t border-white/10 pt-4 relative flex flex-col justify-between">
  <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Tren {days} Titik Terakhir</span>
              <span className="text-slate-300">Sumber: PIHPS Bank Indonesia</span>
            </div>

            {/* Authentic Single-Dataset Bars or Honest Empty State (<3 records = no trend) */}
            {hasEnoughRecords ? (
              <div className="h-28 flex items-end gap-2 pt-2">
                {barHeights.map((h, i) => (
                  <div key={i} className="flex-1 bg-white/5 relative group h-full rounded-t-sm overflow-hidden flex flex-col justify-end items-center">
                    <div
                      className="w-full bg-white/20 border-t-2 border-white/60 hover:bg-white/30 motion-safe:transition-all motion-safe:duration-300"
                      style={{ height: h }}
                    />
  <span className="text-xs text-slate-400 tabular-nums mt-1">T-{priceHistory.length - 1 - i}</span>
                  </div>
                ))}
              </div>
            ) : isLoadingPrices ? (
              <div className="flex flex-col gap-2 py-2">
                <LoadingSkeleton rows={3} rowClassName="h-6" />
                <AnalyticsEmpty loading />
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center">
                <AnalyticsEmpty />
              </div>
            )}
          </div>
        </div>

        {/* M7-P2: lonjakan harga (spikes) — top spikes + honest empty */}
        <div className="space-y-3 flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center">
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
          <p className="text-xs text-slate-500 font-sans -mt-1 tabular-nums">
            {commodityLabel}{priceRegion ? ` · ${prettifyRegion(priceRegion)}` : ' · semua wilayah'} · baseline 30 hari · ambang 5/10/15%
          </p>

          {spikesLoading ? (
            <div className="flex flex-col gap-2">
              <LoadingSkeleton rows={4} rowClassName="h-11" />
              <AnalyticsEmpty loading />
            </div>
          ) : filteredSpikes.length === 0 || spikeRecordsTotal < 3 ? (
            <AnalyticsEmpty
              message={
                spikeRecordsTotal < 3
                  ? `Hanya ${spikeRecordsTotal} catatan harga untuk ${commodityLabel} — spike butuh ≥ 3 catatan (guard backend).`
                  : `Tidak ada lonjakan ≥ 5% untuk ${commodityLabel} pada filter ini.`
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <Table>
                <TableHeader className="h-11 bg-[#0c1017]">
                  <TableRow>
                    <TableHead className="h-11 bg-[#0c1017]">Komoditas</TableHead>
                    <TableHead className="h-11 bg-[#0c1017]">Wilayah</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] text-right">Spike</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] text-right">Harga</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] text-right">n</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSpikes.slice(0, 8).map((s) => (
                    <TableRow key={`${s.commodity}::${s.region}`} className="hover:bg-white/5">
                      <TableCell className="py-3 text-xs tabular-nums font-medium text-slate-200">{prettifyRegion(s.commodity)}</TableCell>
                      <TableCell className="py-3 text-xs tabular-nums text-slate-400">{prettifyRegion(s.region)}</TableCell>
                      <TableCell className="py-3 text-xs tabular-nums text-right">
                        <Badge variant="outline" className={`${severityBadge(s.severity)} font-bold tabular-nums`}>
                          {s.spike_pct >= 0 ? '+' : ''}{s.spike_pct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-xs tabular-nums text-right font-bold text-slate-200">
                        Rp {Math.round(s.current_price).toLocaleString('id-ID')}
                      </TableCell>
                      <TableCell className="py-3 text-xs tabular-nums text-right text-slate-400">{aggByRegion.get(s.region) ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {onSwitchTab && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSwitchTab('reports')}
              className="mt-1 w-full text-xs tabular-nums"
            >
              Lihat Laporan <FileText className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

      </section>

      </div>

      {/* M7-P3: ops filter bar (corridor/advisory apply to ranking; snapshots carry no commodity/days dimension) */}
      <div className="flex flex-wrap items-center gap-3 bg-[#0c1017] border border-white/10 px-4 py-3 rounded-xl text-xs">
        <span className="text-slate-400 font-medium">Filter ops:</span>
        <label className="flex items-center gap-2 text-slate-300">
          Koridor
          <select
            value={corridorFilter}
            onChange={(e) => setCorridorFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 cursor-pointer"
          >
            <option value="all">Semua koridor</option>
            {regionOptions.map((r) => (
              <option key={r} value={r}>{prettifyCorridorId(r)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-slate-300">
          Advisory
          <select
            value={advisoryFilter}
            onChange={(e) => setAdvisoryFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 cursor-pointer"
          >
            <option value="all">Semua</option>
            <option value="HOLD_DEPARTURE">HOLD</option>
            <option value="REROUTE_RECOMMENDED">RERUTE</option>
            <option value="CONSIDER_DELAY">TUNDA</option>
            <option value="PROCEED_WITH_CAUTION">HATI-HATI</option>
          </select>
        </label>
        <span className="text-slate-500 ml-auto">
          Snapshot read-only real-time — tanpa dimensi komoditas/hari pada endpoint cuaca & terminal.
        </span>
      </div>

      {/* M7-P3: corridor ranking + terminal board */}
      <div className="w-full grid grid-cols-12 gap-6">

        {/* Corridor vulnerability ranking */}
        <section className="col-span-12 xl:col-span-7 bg-[#0c1017] border border-white/10 rounded-xl p-5 flex flex-col gap-4 min-h-0">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-300" /> Peringkat kerentanan koridor
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {wxLoading ? (
                'memuat…'
              ) : (
                <AnimatedValue value={filteredRows.length}>{`${filteredRows.length} koridor`}</AnimatedValue>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-sans -mt-2">
            Agregat cuaca fusi spasial per koridor + delay lalu lintas konteks. Urut delay/kepercayaan tertinggi.
          </p>

          {wxLoading ? (
            <div className="flex flex-col gap-2">
              <LoadingSkeleton rows={3} rowClassName="h-[78px]" />
              <AnalyticsEmpty loading />
            </div>
          ) : wxError ? (
            <AnalyticsEmpty message={wxError} />
          ) : filteredRows.length === 0 ? (
            <AnalyticsEmpty message="Cuaca fusi tidak melaporkan gangguan high/critical saat ini." />
          ) : (
            <div className="flex flex-col gap-2.5 overflow-y-auto no-scrollbar max-h-[420px] pr-0.5">
              {filteredRows.map((row) => (
                <article key={row.corridor_id} className="border border-white/10 rounded-lg bg-white/[0.02] p-3.5 flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate" title={row.corridor_id}>
                        {prettifyCorridorId(row.corridor_id)}
                      </p>
                      <p className="text-xs text-slate-500 truncate" title={row.segment}>
                        {row.segment}{row.news_count > 0 ? ` · ${row.news_count} pemberitaan` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className={`${advisoryBadge(row.advisory)} font-mono font-bold tabular-nums`}>
                      {ADVISORY_LABEL[row.advisory] ?? row.advisory}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs tabular-nums">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-bold text-white">+{row.delay_h.toFixed(1)} jam</span>
                    </span>
                    <span className="text-slate-400">
                      bahaya <span className="text-slate-200 font-medium">{row.hazard}</span>
                    </span>
                    <span className="text-slate-400">
                      kepercayaan <span className="text-slate-200 font-bold">{(row.confidence * 100).toFixed(0)}%</span>
                    </span>
                    <ModalityChips mods={row.modalities} />
                    <span className="text-slate-500">{row.hits} titik</span>
                  </div>
                  {/* Confidence bar (VisualRiskPanel-style) */}
                  <Progress
                    value={Math.min(100, Math.max(4, (row.delay_h / maxDelay) * 100))}
                    title={`Kepercayaan ${(row.confidence * 100).toFixed(0)}% · delay ${row.delay_h.toFixed(1)} jam`}
                    className="h-1.5 bg-white/5"
                    indicatorClassName={row.advisory === 'HOLD_DEPARTURE' ? 'bg-blue-400' : row.advisory === 'REROUTE_RECOMMENDED' ? 'bg-sky-400' : row.advisory === 'CONSIDER_DELAY' ? 'bg-purple-400' : 'bg-slate-400'}
                  />
                  {onSwitchTab && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSwitchTab('map')}
                      className="self-start text-xs tabular-nums"
                    >
                      Simulasi di Peta <ArrowUpRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </article>
              ))}
            </div>
          )}
          {corridorContext && (
            <p className="text-xs text-slate-500 font-sans border-t border-white/10 pt-3">
              Konteks {corridorContext.corridor_name}: delay lalu lintas {(corridorContext.traffic?.delay_minutes ?? 0)} mnt
              {corridorContext.is_fallback ? ' (fallback)' : ''} · kepercayaan konsensus {((corridorContext.data_integrity?.consensus_confidence ?? 0) * 100).toFixed(0)}%.
            </p>
          )}
        </section>

        {/* Terminal choke board (read-only aggregate) */}
        <section className="col-span-12 xl:col-span-5 bg-[#0c1017] border border-white/10 rounded-xl p-5 flex flex-col gap-4 min-h-0">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <Anchor className="w-4 h-4 text-slate-300" /> Papan terminal & choke-point
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {termLoading ? (
                'memuat…'
              ) : (
                <AnimatedValue value={sortedTerminals.length}>{`${sortedTerminals.length} hub`}</AnimatedValue>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-sans -mt-2">
            Agregat read-only dwelling, antrean & pengali M. Tanpa data pengemudi (UU 27/2022).
          </p>

          {termLoading ? (
            <div className="flex flex-col gap-2">
              <LoadingSkeleton rows={4} rowClassName="h-11" />
              <AnalyticsEmpty loading />
            </div>
          ) : termError ? (
            <AnalyticsEmpty message={termError} />
          ) : sortedTerminals.length === 0 ? (
            <AnalyticsEmpty />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <Table>
                  <TableHeader className="h-11 bg-[#0c1017]">
                    <TableRow>
                      <TableHead className="h-11 bg-[#0c1017] min-w-[140px]">Hub</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] text-right">Dwell (jam)</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] text-right">Antre</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] text-right">M</TableHead>
                      <TableHead className="h-11 bg-[#0c1017]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTerminals.map((t) => (
                      <TableRow key={t.id} className="hover:bg-white/5">
                        <TableCell className="py-3 text-xs tabular-nums">
                          <p className="text-slate-200 font-medium leading-tight" title={`${t.id} · ${t.province}`}>{t.name}</p>
                          <p className="text-slate-500 text-xs">{t.province}</p>
                        </TableCell>
                        <TableCell className="py-3 text-xs tabular-nums text-right font-bold text-slate-200">{(t.dwelling_time_hours ?? 0).toFixed(1)}</TableCell>
                        <TableCell className="py-3 text-xs tabular-nums text-right text-slate-200">{t.queue_count ?? 0}</TableCell>
                        <TableCell className="py-3 text-xs tabular-nums text-right font-bold text-slate-200">×{(t.intermodal_delay_multiplier ?? 1).toFixed(2)}</TableCell>
                        <TableCell className="py-3 text-xs tabular-nums">
                          <Badge variant="outline" className={`${terminalBadge(t.status)} font-mono font-bold tabular-nums`}>
                            {t.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {termAgg && (
                <p className="text-xs text-slate-500 font-sans border-t border-white/10 pt-3 tabular-nums">
                  {termAgg.total} hub · {termAgg.congested} padat · {termAgg.restricted} terbatas/diblokir · antrean {termAgg.totalQueue} · rerata dwell {termAgg.avgDwell.toFixed(1)} jam.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* Optional at-risk cargo ticker (aggregate only; honest empty) */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium">
          <RefreshCw className="w-3.5 h-3.5" /> Kargo berisiko:
        </span>
        {atRisk ? (
          <span className="text-slate-200 tabular-nums">
            <AnimatedValue value={atRisk.count}>{`${atRisk.count} rute bernilai`}</AnimatedValue>
            {' · agregat '}
            <AnimatedValue value={atRisk.totalValue}>{`Rp ${atRisk.totalValue.toLocaleString('id-ID')}`}</AnimatedValue>
            {atRisk.totalSpoilage > 0 ? (
              <>
                {' · potensi susut '}
                <AnimatedValue value={Math.round(atRisk.totalSpoilage)}>{`Rp ${Math.round(atRisk.totalSpoilage).toLocaleString('id-ID')}`}</AnimatedValue>
              </>
            ) : ''} (agregat, tanpa rincian pengemudi)
          </span>
        ) : (
          <span className="text-slate-500">Belum tersedia — tidak ada nilai kargo pada rute aktif.</span>
        )}
      </div>

    </div>
  );
}
