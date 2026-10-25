'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Info,
  Filter,
  Flame,
  FileText
} from 'lucide-react';
import { api } from '@/lib/api';
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
};

function regionToDb(slug: string): string | undefined {
  if (!slug) return undefined;
  return REGION_TO_DB[slug];
}

const DAY_OPTIONS = [7, 14, 30] as const;

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

function severityBadge(severity: string): string {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'bg-red-500/15 text-red-300 border-red-400/30';
  if (s === 'high') return 'bg-orange-500/15 text-orange-300 border-orange-400/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
}

function prettifyRegion(region: string): string {
  return (region || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDayMonth(t: string): string {
  try {
    return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
  } catch {
    return t;
  }
}

function formatFullDate(t: string): string {
  try {
    return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return t;
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

  const [ricePrice, setRicePrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [priceTimes, setPriceTimes] = useState<string[]>([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState<boolean>(true);

  const [commodity, setCommodity] = useState<string>('beras');
  const [priceRegion, setPriceRegion] = useState<string>('');
  const [days, setDays] = useState<number>(7);

  const [spikes, setSpikes] = useState<SpikeItem[]>([]);
  const [spikesLoading, setSpikesLoading] = useState<boolean>(true);
  const [spikeRecordsTotal, setSpikeRecordsTotal] = useState<number>(0);

  // URL sync (?commodity&region&days) — local state fallback when absent.
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

  // Fetch real PIHPS prices for the selected filter combo.
  useEffect(() => {
    let isMounted = true;
    async function loadPrices() {
      setIsLoadingPrices(true);
      try {
        const mapped = regionToDb(priceRegion);
        const res = await api.commodities.prices({
          commodity,
          region: mapped,
          limit: days,
        });
        if (!isMounted) return;
        const items = res?.items ?? [];
        if (items.length > 0) {
          setRicePrice(items[0].price_idr);
          setPriceHistory(items.map((item: { price_idr: number; time: string }) => item.price_idr).reverse());
          setPriceTimes(items.map((item: { price_idr: number; time: string }) => item.time).reverse());
        } else {
          setRicePrice(null);
          setPriceHistory([]);
          setPriceTimes([]);
        }
      } catch (err) {
        console.error('Failed to load prices for AnalyticsSection:', err);
        if (isMounted) {
          setRicePrice(null);
          setPriceHistory([]);
          setPriceTimes([]);
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

  // Spikes (server region-filtered) + record-total guard source.
  useEffect(() => {
    let isMounted = true;
    async function loadSpikes() {
      setSpikesLoading(true);
      try {
        const mapped = regionToDb(priceRegion);
        const [spikeRes, priceRes] = await Promise.all([
          api.commodities.spikes(mapped ? { region: mapped } : undefined),
          api.commodities.prices({ commodity, limit: 100 }),
        ]);
        if (!isMounted) return;
        const spikeItems: SpikeItem[] = Array.isArray(spikeRes?.spikes) ? spikeRes.spikes : [];
        const priceItems = Array.isArray(priceRes?.items) ? priceRes.items : [];
        setSpikes(spikeItems.filter((s) => !commodity || s.commodity === commodity));
        setSpikeRecordsTotal(priceItems.length);
      } catch (err) {
        console.error('Failed to load spikes for AnalyticsSection:', err);
        if (isMounted) {
          setSpikes([]);
          setSpikeRecordsTotal(0);
        }
      } finally {
        if (isMounted) setSpikesLoading(false);
      }
    }
    loadSpikes();
    return () => {
      isMounted = false;
    };
  }, [commodity, priceRegion]);

  const commodityLabel = useMemo(() => {
    return COMMODITY_OPTIONS.find((o) => o.value === commodity)?.label || commodity;
  }, [commodity]);

  // Honest display guard: < 3 price history points cannot form a meaningful
  // trend line; render honest Empty state instead of 1-2 lonely bars.
  const hasEnoughRecords = priceHistory.length >= 3;

  // Single dataset bar heights (PIHPS historical daily closes)
  const maxP = priceHistory.length > 0 ? Math.max(...priceHistory) * 1.05 : 1;
  const minP = priceHistory.length > 0 ? Math.min(...priceHistory) * 0.95 : 0;
  const barHeights = useMemo(() => {
    if (priceHistory.length === 0 || maxP === minP) return [];
    return priceHistory.map((p) => {
      const pct = Math.max(8, Math.min(100, Math.round(((p - minP) / (maxP - minP)) * 100)));
      return `${pct}%`;
    });
  }, [priceHistory, maxP, minP]);

  // Green vs red day-over-day delta bars (honest, standard financial histogram)
  const barColors = useMemo(() => {
    return priceHistory.map((p, i) => {
      if (i === 0) return { bg: '#94a3b8', border: '#cbd5e1' }; // first day: neutral slate
      const prev = priceHistory[i - 1];
      if (p > prev) return { bg: '#ef4444', border: '#f87171' }; // up = red (inflation / price spike)
      if (p < prev) return { bg: '#10b981', border: '#34d399' }; // down = green (deflation / price drops)
      return { bg: '#94a3b8', border: '#cbd5e1' }; // flat = slate
    });
  }, [priceHistory]);

  const lastTime = priceTimes.length > 0 ? priceTimes[priceTimes.length - 1] : null;

  const filteredSpikes = useMemo(() => {
    return [...spikes].sort((a, b) => Math.abs(b.spike_pct) - Math.abs(a.spike_pct));
  }, [spikes]);

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
            <SelectTrigger className="h-8 min-w-[140px] bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2.5 py-1.5 cursor-pointer">
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
            <SelectTrigger className="h-8 min-w-[120px] bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2.5 py-1.5 cursor-pointer">
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
            return (
              <button
                key={d}
                type="button"
                aria-pressed={isActive}
                aria-label={`${d} hari terakhir`}
                onClick={() => setDays(d)}
                className={`rounded-full border backdrop-blur text-xs tabular-nums font-medium h-8 px-3 cursor-pointer motion-safe:transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                  isActive
                    ? 'border-white/20 bg-white text-black'
                    : 'border-white/20 bg-white/10 text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {d} hari
              </button>
            );
          })}
        </div>

        <div className="ml-auto hidden sm:flex items-center gap-2">
          <Chip variant="outline" size="sm" statusDot status="online">
            PIHPS Live
          </Chip>
        </div>
      </div>

      <div className="w-full grid grid-cols-12 gap-6">

      {/* CONTENT SECTION: full-width single column (map canvas removed) */}
      <section className="col-span-12 flex flex-col gap-6 overflow-y-auto no-scrollbar">

        {/* Price History Card */}
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex justify-between items-end">
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

          <div className="border-t border-white/10 pt-4 relative flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-slate-400">
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

            {/* Authentic Single-Dataset Bars or Honest Empty State (<3 records = no trend) */}
            {hasEnoughRecords ? (
              <div className="h-28 flex items-end gap-2 pt-2">
                {barHeights.map((h, i) => {
                  const t = priceTimes[i];
                  const dateLabel = t ? formatDayMonth(t) : `T-${priceHistory.length - 1 - i}`;
                  const tooltipText = t
                    ? `${dateLabel}: Rp ${priceHistory[i].toLocaleString('id-ID')}`
                    : `T-${priceHistory.length - 1 - i}: Rp ${priceHistory[i].toLocaleString('id-ID')}`;
                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`Harga ${tooltipText}`}
                            className="flex-1 bg-white/5 relative group h-full rounded-t-sm overflow-hidden flex flex-col justify-end items-center cursor-pointer p-0 border-0 text-left focus:outline-none"
                          >
                            <div
                              className="w-full border-t-2 motion-safe:transition-all motion-safe:duration-300"
                              style={{ height: h, backgroundColor: `${barColors[i].bg}33`, borderColor: barColors[i].border }}
                            />
                            <span className="text-xs text-slate-400 tabular-nums mt-1">{dateLabel}</span>
                          </button>
                        }
                      />
                      <TooltipContent side="top" portal={false}>
                        {tooltipText}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ) : isLoadingPrices ? (
              <div className="flex flex-col gap-2 py-2">
                <Skeleton rows={3} rowClassName="h-6" />
                <Empty loading />
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center">
                <Empty />
              </div>
            )}
          </div>
        </Card>

        {/* Lonjakan harga (spikes) — top spikes + honest empty */}
        <Card className="p-5 flex-1 flex flex-col gap-4 min-h-0">
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
              <Skeleton rows={4} rowClassName="h-11" />
              <Empty loading />
            </div>
          ) : filteredSpikes.length === 0 || spikeRecordsTotal < 3 ? (
            <Empty
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
                    </TableRow>
                  ))}
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
        </Card>

      </section>

      </div>

    </div>
  );
}
