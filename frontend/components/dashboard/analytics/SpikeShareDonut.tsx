'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Empty as AnalyticsEmpty } from '@/components/base-ui/empty';
import { spikeBand } from './AnalyticsTip';

function severityColor(v: number): string {
  if (v >= 15) return '#ef4444';
  if (v >= 10) return '#f97316';
  if (v >= 5) return '#f59e0b';
  return '#64748b';
}

function prettify(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-[#0c1017] border border-white/15 rounded-lg px-3 py-2 text-xs shadow-xl tabular-nums">
      <p className="mb-1 font-semibold text-white">{d.name}</p>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-slate-400">Spike maks</span>
        <span className="font-medium text-slate-100">+{d.value.toFixed(1)}%</span>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-slate-400">Status</span>
        <span className="font-medium text-slate-100">{spikeBand(d.value)}</span>
      </div>
      <p className="mt-1 border-t border-white/10 pt-1 text-[11px] text-slate-500">
        Sumber: PIHPS Bank Indonesia · ambang 5/10/15%
      </p>
    </div>
  );
}

/**
 * Part-to-whole kategorikal → donat: pangsa spike maksimum per wilayah.
 * Warna sel mengikuti ramp severity 5/10/15% (sinkron badge + heatmap),
 * legenda kategorikal swatch + nilai di bawahnya.
 */
export function SpikeShareDonut({
  spikes,
  loading,
  recordsTotal,
  emptyMessage,
}: {
  spikes: Array<{ region: string; spike_pct: number }>;
  loading: boolean;
  recordsTotal: number;
  emptyMessage: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const slices = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spikes) {
      if (!s.region) continue;
      const prev = m.get(s.region);
      if (prev == null || s.spike_pct > prev) m.set(s.region, s.spike_pct);
    }
    return Array.from(m.entries())
      .map(([region, value]) => ({ name: prettify(region), value }))
      .sort((a, b) => b.value - a.value);
  }, [spikes]);

  if (loading || !mounted) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className="h-48 rounded-lg bg-white/5 motion-safe:animate-pulse" />
        <div className="h-4 rounded bg-white/5 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (slices.length === 0 || recordsTotal < 3) {
    return <AnalyticsEmpty message={emptyMessage} />;
  }

  const ariaSummary = slices.map((s) => `${s.name} +${s.value.toFixed(1)}%`).join(', ');

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-48 w-full tabular-nums"
        role="img"
        aria-label={`Distribusi spike per wilayah: ${ariaSummary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<DonutTooltip />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={2}
              stroke="#0c1017"
              strokeWidth={2}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={severityColor(s.value)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold tabular-nums text-white">{slices.length}</span>
          <span className="text-[11px] tabular-nums text-slate-400">wilayah spike</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1" aria-label="Rincian spike per wilayah">
        {slices.map((s) => (
          <li
            key={s.name}
            className="flex items-center gap-2 text-xs tabular-nums"
            title={`${s.name}: +${s.value.toFixed(1)}% (${spikeBand(s.value)})`}
          >
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-white/10"
              style={{ backgroundColor: severityColor(s.value) }}
            />
            <span className="flex-1 truncate text-slate-300">{s.name}</span>
            <span className="font-bold text-slate-100">+{s.value.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
