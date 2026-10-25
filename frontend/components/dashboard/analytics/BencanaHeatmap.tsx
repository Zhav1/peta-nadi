'use client';

import React from 'react';
import { Badge } from '@/components/base-ui/badge';
import { Empty as AnalyticsEmpty } from '@/components/base-ui/empty';
import { HeatLegend } from './heatScale';
import { AnalyticsTip, TipRow, TipTitle, TipSource, spikeBand } from './AnalyticsTip';

export interface BencanaRow {
  source: 'BNPB' | 'BMKG' | 'FIRMS';
  /** jumlah kejadian aktif 30 hari terakhir (null = sumber tak tersedia) */
  count30d: number | null;
  /** ada kejadian ≤ 48 jam terakhir? */
  fresh48h: boolean;
  /** ko-okurensi per komoditas: spike% maksimum saat sumber aktif (null = tak ada) */
  perCommodity: Record<string, number | null>;
  note?: string;
}

const SOURCE_LABEL: Record<BencanaRow['source'], string> = {
  BNPB: 'BNPB · insiden',
  BMKG: 'BMKG · cuaca disruptif',
  FIRMS: 'FIRMS · karhutla',
};

function cellBg(v: number | null, active: boolean): string {
  if (!active || v == null) return 'rgba(255,255,255,0.03)';
  const a = 0.3 + 0.7 * Math.min(Math.sqrt(Math.abs(v) / 30), 1);
  if (v >= 15) return `rgba(239,68,68,${a.toFixed(2)})`;
  if (v >= 10) return `rgba(249,115,22,${a.toFixed(2)})`;
  return `rgba(245,158,11,${a.toFixed(2)})`;
}

/** Baris sumber bencana x kolom komoditas: ko-okurensi 30d + flag overlap 48h. */
export function BencanaHeatmap({
  rows,
  commodities,
  loading,
}: {
  rows: BencanaRow[];
  commodities: Array<{ value: string; label: string }>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-11 rounded-md bg-white/5 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0 || rows.every((r) => r.count30d == null)) {
    return (
      <AnalyticsEmpty message="Sumber bencana (BNPB/BMKG/FIRMS) tak tersedia saat ini — ko-okurensi tidak dihitung, bukan nol." />
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-xs" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="p-1 text-left text-[11px] font-medium text-slate-500">Sumber</th>
              {commodities.map((c) => (
                <th key={c.value} className="p-1 text-center text-[11px] font-medium text-slate-400">
                  {c.label}
                </th>
              ))}
              <th className="p-1 text-center text-[11px] font-medium text-slate-400">Overlap 48j</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = (r.count30d ?? 0) > 0;
              return (
                <tr key={r.source}>
                  <td className="p-1 text-[11px] tabular-nums text-slate-300">
                    <span className="flex items-center gap-1.5">
                      {SOURCE_LABEL[r.source]}
                      <span className="text-slate-500 tabular-nums">
                        {r.count30d == null ? 'n/a' : `${r.count30d} kejadian`}
                      </span>
                    </span>
                  </td>
                  {commodities.map((c) => {
                    const v = r.perCommodity[c.value] ?? null;
                    const tip =
                      r.count30d == null
                        ? `${r.source}: sumber tak tersedia`
                        : v == null
                          ? `${r.source} × ${c.label}: tanpa ko-okurensi 30 hari`
                          : `${r.source} × ${c.label}: spike +${v.toFixed(1)}% (${spikeBand(v)}) saat sumber aktif`;
                    return (
                      <td key={c.value} className="p-0">
                        <AnalyticsTip
                          trigger={
                            <div
                              role="img"
                              aria-label={tip}
                              title={tip}
                              tabIndex={0}
                              className="flex h-9 items-center justify-center rounded-md border border-white/10 text-[11px] tabular-nums text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                              style={{ backgroundColor: cellBg(v, active) }}
                            >
                              {r.count30d == null ? (
                                <span className="text-slate-600">n/a</span>
                              ) : v == null ? (
                                <span className="text-slate-600">–</span>
                              ) : (
                                `+${v.toFixed(1)}%`
                              )}
                            </div>
                          }
                          content={
                            <div className="min-w-44 space-y-0.5">
                              <TipTitle>{r.source} × {c.label}</TipTitle>
                              <TipRow k="Kejadian 30 hari" v={r.count30d == null ? 'sumber tak tersedia' : `${r.count30d} kejadian`} />
                              <TipRow k="Ko-okurensi" v={v == null ? 'tanpa ko-okurensi' : `+${v.toFixed(1)}% (${spikeBand(v)})`} />
                              <TipRow k="Overlap 48j" v={r.fresh48h ? 'Overlap' : 'Aman'} />
                              {r.note ? <TipRow k="Catatan" v={r.note} /> : null}
                              <TipSource>{r.source === 'BNPB' ? 'BNPB DIBI/bnpb.go.id' : r.source === 'BMKG' ? 'BMKG' : 'FIRMS VIIRS NRT'}</TipSource>
                            </div>
                          }
                        />
                      </td>
                    );
                  })}
                  <td className="p-0">
                    <div className="flex h-9 items-center justify-center">
                      {r.count30d == null ? (
                        <span className="text-[11px] text-slate-600 tabular-nums">n/a</span>
                      ) : (
                        <AnalyticsTip
                          trigger={
                            <span
                              role="img"
                              aria-label={
                                r.fresh48h
                                  ? `${r.source}: kejadian ≤ 48 jam berdampingan dengan spike harga`
                                  : `${r.source}: tidak ada kejadian ≤ 48 jam yang berdampingan spike`
                              }
                              title={
                                r.fresh48h
                                  ? 'Kejadian ≤ 48 jam berdampingan dengan spike harga'
                                  : 'Tidak ada kejadian ≤ 48 jam yang berdampingan spike'
                              }
                              tabIndex={0}
                              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                            >
                              <Badge
                                variant="outline"
                                className={
                                  r.fresh48h
                                    ? 'bg-red-500/15 text-red-300 border-red-400/30 text-[11px] tabular-nums'
                                    : 'text-slate-400 text-[11px] tabular-nums'
                                }
                              >
                                {r.fresh48h ? 'Overlap' : 'Aman'}
                              </Badge>
                            </span>
                          }
                          content={
                            <div className="min-w-44 space-y-0.5">
                              <TipTitle>Overlap 48j · {r.source}</TipTitle>
                              <TipRow k="Status" v={r.fresh48h ? 'Overlap' : 'Aman'} />
                              <TipRow k="Kejadian 30 hari" v={`${r.count30d} kejadian`} />
                              <TipSource>{r.source === 'BNPB' ? 'BNPB DIBI/bnpb.go.id' : r.source === 'BMKG' ? 'BMKG' : 'FIRMS VIIRS NRT'}</TipSource>
                            </div>
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <HeatLegend
        items={[
          { swatch: 'rgba(239,68,68,0.85)', label: 'ko-okurensi + spike kritis' },
          { swatch: 'rgba(255,255,255,0.03)', label: 'tanpa ko-okurensi' },
        ]}
      />
    </div>
  );
}
