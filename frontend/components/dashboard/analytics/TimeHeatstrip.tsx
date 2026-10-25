'use client';

import { Empty as AnalyticsEmpty } from '@/components/base-ui/empty';
import { HeatLegend } from './heatScale';
import { AnalyticsTip, TipRow, TipTitle, TipSource } from './AnalyticsTip';

export interface HeatWeek {
  key: string; // mis. "W32"
  label: string; // mis. "04/08"
  changePct: number | null; // WoW mean; null = data kurang
  up: boolean | null;
}

export interface HeatStripRow {
  commodity: string;
  weeks: HeatWeek[];
  streak: number;
}

/** Weeks x Komoditas: arah mingguan + streak kenaikan beruntun. */
export function TimeHeatstrip({
  rows,
  commodities,
  loading,
}: {
  rows: HeatStripRow[];
  commodities: Array<{ value: string; label: string }>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 rounded-md bg-white/5 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <AnalyticsEmpty message="Streak mingguan butuh ≥ 14 titik harga per komoditas." />;
  }

  const label = (v: string) => commodities.find((c) => c.value === v)?.label ?? v;
  const weekKeys = rows[0]?.weeks.map((w) => ({ key: w.key, label: w.label })) ?? [];

  const cellBg = (w: HeatWeek): string => {
    if (w.changePct == null || w.up == null) return 'rgba(255,255,255,0.03)';
    const a = 0.3 + 0.7 * Math.min(Math.sqrt(Math.abs(w.changePct) / 10), 1);
    return w.up ? `rgba(239,68,68,${a.toFixed(2)})` : `rgba(16,185,129,${a.toFixed(2)})`;
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-xs" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="p-1 text-left text-[11px] font-medium text-slate-500">Komoditas</th>
              {weekKeys.map((w) => (
                <th key={w.key} className="p-1 text-center text-[11px] tabular-nums font-medium text-slate-400">
                  {w.label}
                </th>
              ))}
              <th className="p-1 text-center text-[11px] font-medium text-slate-400">Streak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.commodity}>
                <td className="p-1 text-[11px] tabular-nums text-slate-300">{label(r.commodity)}</td>
                {r.weeks.map((w) => {
                  const tip =
                    w.changePct == null
                      ? `${label(r.commodity)} ${w.label}: data kurang`
                      : `${label(r.commodity)} ${w.label}: ${w.changePct >= 0 ? '+' : ''}${w.changePct.toFixed(1)}% WoW`;
                  return (
                    <td key={w.key} className="p-0">
                      <AnalyticsTip
                        trigger={
                          <div
                            role="img"
                            aria-label={tip}
                            title={tip}
                            tabIndex={0}
                            className="flex h-9 items-center justify-center rounded-md border border-white/10 text-[11px] tabular-nums text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                            style={{ backgroundColor: cellBg(w) }}
                          >
                            {w.changePct == null ? (
                              <span className="text-slate-600">–</span>
                            ) : (
                              `${w.changePct >= 0 ? '▲ +' : '▼ '}${w.changePct.toFixed(1)}%`
                            )}
                          </div>
                        }
                        content={
                          <div className="min-w-44 space-y-0.5">
                            <TipTitle>{label(r.commodity)} · pekan {w.label}</TipTitle>
                            <TipRow k="WoW rata-rata" v={w.changePct == null ? 'data kurang' : `${w.changePct >= 0 ? '+' : ''}${w.changePct.toFixed(1)}%`} />
                            <TipRow k="Arah" v={w.up == null ? '—' : w.up ? 'naik' : 'turun'} />
                            <TipRow k="Streak komoditas" v={`${r.streak} minggu`} />
                            <TipSource>PIHPS Bank Indonesia · butuh ≥ 14 titik</TipSource>
                          </div>
                        }
                      />
                    </td>
                  );
                })}
                <td className="p-0">
                  <AnalyticsTip
                    trigger={
                      <div
                        role="img"
                        aria-label={`${label(r.commodity)}: ${r.streak} minggu naik beruntun`}
                        title={`${label(r.commodity)}: ${r.streak} minggu naik beruntun`}
                        tabIndex={0}
                        className={`flex h-9 items-center justify-center rounded-md border text-[11px] tabular-nums font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                          r.streak >= 3
                            ? 'border-red-400/30 bg-red-500/15 text-red-300'
                            : r.streak >= 1
                              ? 'border-amber-400/30 bg-amber-500/15 text-amber-300'
                              : 'border-white/10 text-slate-400'
                        }`}
                      >
                        {r.streak} mggu
                      </div>
                    }
                    content={
                      <div className="min-w-44 space-y-0.5">
                        <TipTitle>Streak · {label(r.commodity)}</TipTitle>
                        <TipRow k="Naik beruntun" v={`${r.streak} minggu`} />
                        <TipRow k="Status" v={r.streak >= 3 ? 'kritis (≥3)' : r.streak >= 1 ? 'waspada' : 'terpantau'} />
                        <TipSource>PIHPS Bank Indonesia · 4 pekan terakhir</TipSource>
                      </div>
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HeatLegend
        items={[
          { swatch: 'rgba(239,68,68,0.8)', label: 'pekan naik' },
          { swatch: 'rgba(16,185,129,0.8)', label: 'pekan turun' },
          { swatch: 'rgba(255,255,255,0.03)', label: 'data kurang' },
        ]}
      />
    </div>
  );
}
