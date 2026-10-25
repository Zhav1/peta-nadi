'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Empty as AnalyticsEmpty } from '@/components/base-ui/empty';
import { fmtRp } from './AnalyticsTip';

function shortDate(t: string): string {
  try {
    return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
  } catch {
    return t;
  }
}

function fullDate(t: string): string {
  try {
    return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return t;
  }
}

function TrendTooltip({ active, payload, meta }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-[#0c1017] border border-white/15 rounded-lg px-3 py-2 text-xs shadow-xl tabular-nums">
      <p className="mb-1 font-semibold text-white">
        {meta.commodity} · {d.full}
      </p>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-slate-400">Harga</span>
        <span className="font-medium text-slate-100">{fmtRp(d.harga)} / kg</span>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-slate-400">Δ prev</span>
        <span className="font-medium text-slate-100">
          {d.deltaPct == null
            ? 'titik pertama'
            : `${d.deltaPct >= 0 ? '+' : ''}${d.deltaPct.toFixed(1)}%`}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-slate-400">Wilayah</span>
        <span className="font-medium text-slate-100">{meta.region}</span>
      </div>
      <p className="mt-1 border-t border-white/10 pt-1 text-[11px] text-slate-500">
        Sumber: PIHPS Bank Indonesia
      </p>
    </div>
  );
}

/**
 * Deret waktu harga → garis + area. Time series kontinu: garis
 * memperlihatkan arah + momentum antar titik; bar diskrit menyembunyikan
 * kontinuitas tren sehingga diganti di dashboard campuran.
 */
export function PriceTrendChart({
  prices,
  times,
  commodityLabel,
  regionLabel,
  loading,
}: {
  prices: number[];
  times: string[];
  commodityLabel: string;
  regionLabel: string;
  loading: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const data = useMemo(
    () =>
      prices.map((p, i) => {
        const t = times[i];
        const prev = i > 0 ? prices[i - 1] : null;
        const deltaPct =
          prev != null && prev !== 0 ? ((p - prev) / Math.abs(prev)) * 100 : null;
        return {
          label: t ? shortDate(t) : `T-${prices.length - 1 - i}`,
          full: t ? fullDate(t) : `T-${prices.length - 1 - i}`,
          harga: p,
          deltaPct,
        };
      }),
    [prices, times],
  );

  const avg = useMemo(
    () => (data.length > 0 ? data.reduce((s, d) => s + d.harga, 0) / data.length : 0),
    [data],
  );

  if (loading) {
    return (
      <div className="h-64 rounded-lg bg-white/5 motion-safe:animate-pulse" aria-hidden="true" />
    );
  }

  // Honest empty: <3 records is not a trend (MIN_RECORDS_GUARD).
  if (data.length < 3) {
    return <AnalyticsEmpty />;
  }

  if (!mounted) {
    return (
      <div className="h-64 rounded-lg bg-white/5 motion-safe:animate-pulse" aria-hidden="true" />
    );
  }

  return (
    <div
      className="h-64 w-full tabular-nums"
      role="img"
      aria-label={`Tren harga ${commodityLabel}: ${data.length} titik`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="analyticsTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) =>
              Math.abs(v) >= 1000
                ? `${(v / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}rb`
                : String(v)
            }
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={['auto', 'auto']}
          />
          <Tooltip
            content={<TrendTooltip meta={{ commodity: commodityLabel, region: regionLabel }} />}
            cursor={{ stroke: 'rgba(255,255,255,0.15)' }}
          />
          <ReferenceLine
            y={avg}
            stroke="#64748b"
            strokeDasharray="4 3"
            label={{ value: 'rata-rata', position: 'insideTopRight', fill: '#64748b', fontSize: 11 }}
          />
          <Area type="monotone" dataKey="harga" name="Harga" fill="url(#analyticsTrendFill)" stroke="transparent" />
          <Line
            type="monotone"
            dataKey="harga"
            name="Harga"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
