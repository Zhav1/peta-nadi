'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CommodityTierGroup, PeriodBucket } from '@/lib/types';
import { formatJtM } from '@/lib/laporanAggregations';

// M8 Phase 2: pure presentational charts for Laporan. No fetching, no side
// effects. Empty arrays render an overlay note instead of crashing recharts.

const TIER_LABEL: Record<string, string> = {
  ultra: 'Ultra',
  cold: 'Dingin',
  semi: 'Semi',
  dry: 'Kering',
  Lainnya: 'Lainnya',
};

function formatFullIDR(value?: number | null): string {
  const n = Number(value ?? 0);
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0c1017] border border-white/15 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{String(label ?? '')}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-slate-200 tabular-nums">
          {p.name}: <strong className="text-emerald-300">{formatFullIDR(p.value)}</strong>
          {p.payload?.tripCount != null && (
            <span className="text-slate-500"> • {p.payload.tripCount} Trip</span>
          )}
        </p>
      ))}
    </div>
  );
}

// Stable identities: recharts 3 stores axis/tooltip settings inside its own
// Redux store and re-dispatches on every identity change. Object/element
// literals passed inline are recreated on every parent render, which makes the
// store notify → axis re-render → re-dispatch cycle self-sustaining
// (React #185 "Maximum update depth exceeded", via recharts' internal
// react-redux notifyNestedSubs). Keep every object/element/array prop
// module-level.
const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 } as const;
const X_TICK = { fill: '#94a3b8', fontSize: 11 } as const;
const X_AXIS_LINE = { stroke: 'rgba(255,255,255,0.1)' } as const;
const Y_TICK = { fill: '#64748b', fontSize: 11 } as const;
const BAR_CURSOR = { fill: 'rgba(255,255,255,0.04)' } as const;
const LINE_CURSOR = { stroke: 'rgba(255,255,255,0.15)' } as const;
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const LINE_DOT = { r: 2.5, fill: '#10b981' } as const;
const ACTIVE_DOT = { r: 4 } as const;
const GRID_STROKE = 'rgba(255,255,255,0.08)' as const;
const GRID_DASHARRAY = '3 3' as const;

// Separate identity-stable tooltip elements per chart to prevent cross-store
// collision in recharts v3's internal Redux slices.
const TIER_TOOLTIP_CONTENT = <ChartTooltip />;
const PERIOD_TOOLTIP_CONTENT = <ChartTooltip />;

const EMPTY_TIER_DATA: Array<{ tier: string; Hemat: number; tripCount: number }> = [];
const EMPTY_PERIOD_DATA: Array<{ periode: string; Hemat: number; tripCount: number }> = [];

function yAxisTickFormatter(v: number): string {
  return formatJtM(v);
}

function EmptyOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <p className="text-xs text-slate-500">{message}</p>
    </div>
  );
}

interface LaporanChartsProps {
  tierGroups: CommodityTierGroup[];
  periodBuckets: PeriodBucket[];
  granularityLabel: string;
}

export default function LaporanCharts({ tierGroups, periodBuckets, granularityLabel }: LaporanChartsProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const tierDataRef = useRef(EMPTY_TIER_DATA);
  const tierData = useMemo(() => {
    if (!tierGroups || tierGroups.length === 0) {
      tierDataRef.current = EMPTY_TIER_DATA;
      return EMPTY_TIER_DATA;
    }
    const next = tierGroups.map((g) => ({
      tier: TIER_LABEL[g.tier] ?? g.tier,
      Hemat: Math.round(g.totalSavedIdr),
      tripCount: g.tripCount,
    }));
    const prev = tierDataRef.current;
    if (
      prev.length === next.length &&
      prev.every((p, i) => p.tier === next[i].tier && p.Hemat === next[i].Hemat && p.tripCount === next[i].tripCount)
    ) {
      return prev;
    }
    tierDataRef.current = next;
    return next;
  }, [tierGroups]);

  const periodDataRef = useRef(EMPTY_PERIOD_DATA);
  const periodData = useMemo(() => {
    if (!periodBuckets || periodBuckets.length === 0) {
      periodDataRef.current = EMPTY_PERIOD_DATA;
      return EMPTY_PERIOD_DATA;
    }
    const next = periodBuckets.map((b) => ({
      periode: b.label,
      Hemat: Math.round(b.totalSavedIdr),
      tripCount: b.tripCount,
    }));
    const prev = periodDataRef.current;
    if (
      prev.length === next.length &&
      prev.every((p, i) => p.periode === next[i].periode && p.Hemat === next[i].Hemat && p.tripCount === next[i].tripCount)
    ) {
      return prev;
    }
    periodDataRef.current = next;
    return next;
  }, [periodBuckets]);

  const hasTier = tierData.some((d) => d.Hemat !== 0 || d.tripCount > 0);
  const hasPeriod = periodData.length > 0 && periodData.some((d) => d.Hemat !== 0 || d.tripCount > 0);

  if (!mounted) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="h-4 w-36 rounded bg-white/5 motion-safe:animate-pulse" />
            <div className="mt-1 h-3 w-48 rounded bg-white/5 motion-safe:animate-pulse" />
          </div>
          <div className="h-64 p-4">
            <div className="h-full rounded-lg bg-white/5 motion-safe:animate-pulse" aria-hidden="true" />
          </div>
        </div>
        <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <div className="h-4 w-36 rounded bg-white/5 motion-safe:animate-pulse" />
              <div className="mt-1 h-3 w-48 rounded bg-white/5 motion-safe:animate-pulse" />
            </div>
            <div className="h-3 w-16 rounded bg-white/5 motion-safe:animate-pulse" />
          </div>
          <div className="h-64 p-4">
            <div className="h-full rounded-lg bg-white/5 motion-safe:animate-pulse" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Bar per-tier */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-xs font-medium text-slate-200">Hemat per tier komoditas</h3>
          <p className="text-xs text-slate-500">Agregat hemat bersih (IDR) per tier</p>
        </div>
        <div className="relative h-64 px-2 py-3">
          {!hasTier && <EmptyOverlay message="Belum ada data tier pada filter ini." />}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tierData} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray={GRID_DASHARRAY} stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="tier" tick={X_TICK} axisLine={X_AXIS_LINE} tickLine={false} />
              <YAxis
                tickFormatter={yAxisTickFormatter}
                tick={Y_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={TIER_TOOLTIP_CONTENT} cursor={BAR_CURSOR} isAnimationActive={false} />
              <Bar dataKey="Hemat" fill="#10b981" radius={BAR_RADIUS} maxBarSize={44} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line/Area per-periode */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium text-slate-200">Tren hemat per periode</h3>
            <p className="text-xs text-slate-500">Granularitas {granularityLabel}</p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">{periodData.length} bucket</span>
        </div>
        <div className="relative h-64 px-2 py-3">
          {!hasPeriod && <EmptyOverlay message="Belum ada data periode pada filter ini." />}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={periodData} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="laporanHematFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray={GRID_DASHARRAY} stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="periode" tick={X_TICK} axisLine={X_AXIS_LINE} tickLine={false} />
              <YAxis
                tickFormatter={yAxisTickFormatter}
                tick={Y_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={PERIOD_TOOLTIP_CONTENT} cursor={LINE_CURSOR} isAnimationActive={false} />
              <Area
                type="monotone"
                dataKey="Hemat"
                name="Hemat"
                fill="url(#laporanHematFill)"
                stroke="transparent"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="Hemat"
                name="Hemat"
                stroke="#10b981"
                strokeWidth={2}
                dot={LINE_DOT}
                activeDot={ACTIVE_DOT}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
