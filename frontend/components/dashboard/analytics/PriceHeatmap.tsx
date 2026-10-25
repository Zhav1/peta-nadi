'use client';

import React from 'react';
import { Empty as AnalyticsEmpty } from '@/components/base-ui/empty';
import { spikeRamp, HeatLegend } from './heatScale';
import { AnalyticsTip, TipRow, TipTitle, TipSource, spikeBand } from './AnalyticsTip';

export interface PriceCell {
  commodity: string;
  region: string;
  spikePct: number;
}

/** Wilayah x Komoditas: sel = spike% maksimum pasangan tsb. */
export function PriceHeatmap({
  cells,
  commodities,
  regions,
  loading,
}: {
  cells: PriceCell[];
  commodities: Array<{ value: string; label: string }>;
  regions: Array<{ value: string; label: string }>;
  loading: boolean;
}) {
  const lookup = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) {
      const k = `${c.region}::${c.commodity}`;
      const prev = m.get(k);
      if (prev == null || c.spikePct > prev) m.set(k, c.spikePct);
    }
    return m;
  }, [cells]);

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-9 rounded-md bg-white/5 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (cells.length === 0) {
    return <AnalyticsEmpty message="Belum ada spike ≥ 5% pada 30 hari terakhir untuk pasangan wilayah × komoditas ini." />;
  }

  const prettify = (s: string) =>
    s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-xs" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="p-1 text-left text-[11px] font-medium text-slate-500">Wilayah</th>
              {commodities.map((c) => (
                <th key={c.value} className="p-1 text-center text-[11px] font-medium text-slate-400">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.value}>
                <td className="p-1 text-[11px] tabular-nums text-slate-400">{r.label}</td>
                {commodities.map((c) => {
                  const v = lookup.get(`${r.value}::${c.value}`) ?? null;
                  const { bg, fg } = spikeRamp(v);
                  const tip =
                    v == null
                      ? `${r.label} × ${c.label}: tanpa spike ≥ 5%`
                      : `${r.label} × ${c.label}: +${v.toFixed(1)}% (${spikeBand(v)})`;
                  return (
                    <td key={c.value} className="p-0">
                      <AnalyticsTip
                        trigger={
                          <div
                            role="img"
                            aria-label={tip}
                            title={tip}
                            tabIndex={0}
                            className="flex h-9 items-center justify-center rounded-md border border-white/10 text-[11px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                            style={{ backgroundColor: v == null ? 'rgba(255,255,255,0.03)' : bg, color: fg }}
                          >
                            {v == null ? <span className="text-slate-600">–</span> : `+${v.toFixed(1)}%`}
                          </div>
                        }
                        content={
                          <div className="min-w-44 space-y-0.5">
                            <TipTitle>{r.label} × {c.label}</TipTitle>
                            <TipRow k="Spike maks 30 hari" v={v == null ? 'tanpa spike ≥ 5%' : `+${v.toFixed(1)}%`} />
                            <TipRow k="Status" v={spikeBand(v)} />
                            <TipRow k="Ambang" v="5/10/15%" />
                            <TipSource>PIHPS Bank Indonesia · baseline 30 hari</TipSource>
                          </div>
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HeatLegend
        items={[
          { swatch: 'rgba(239,68,68,0.85)', label: '≥ 15% kritis' },
          { swatch: 'rgba(249,115,22,0.75)', label: '≥ 10% tinggi' },
          { swatch: 'rgba(245,158,11,0.6)', label: '≥ 5% waspada' },
          { swatch: 'rgba(255,255,255,0.03)', label: prettify('tanpa spike') },
        ]}
      />
    </div>
  );
}
