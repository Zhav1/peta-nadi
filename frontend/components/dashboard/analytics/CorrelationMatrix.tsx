'use client';

import React from 'react';
import { Empty as AnalyticsEmpty } from '@/components/base-ui/empty';
import { corrRamp, HeatLegend } from './heatScale';
import { AnalyticsTip, TipRow, TipTitle, TipSource } from './AnalyticsTip';

export interface CorrCell {
  a: string;
  b: string;
  r: number | null;
  n: number;
}

/** Matriks korelasi Pearson -1..1; |r|>0.7 ring tegas, n<10 honest-empty. */
export function CorrelationMatrix({
  commodities,
  cells,
  loading,
  regionActive = false,
  windowDays = 30,
  onShowAll,
}: {
  commodities: Array<{ value: string; label: string }>;
  cells: CorrCell[];
  loading: boolean;
  /** True bila filter wilayah sempit aktif — CTA menyarankan Semua wilayah. */
  regionActive?: boolean;
  /** Jendela hari aktif untuk CTA perpanjang window. */
  windowDays?: number;
  /** Reset filter ke Semua wilayah (dipakai CTA fallback). */
  onShowAll?: () => void;
}) {
  const lookup = React.useMemo(() => {
    const m = new Map<string, CorrCell>();
    for (const c of cells) m.set(`${c.a}::${c.b}`, c);
    return m;
  }, [cells]);

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="h-9 rounded-md bg-white/5 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (cells.length === 0) {
    return <AnalyticsEmpty message="Korelasi butuh ≥ 10 titik tanggal bersama per pasangan — data belum cukup." />;
  }

  const short = (v: string) => commodities.find((c) => c.value === v)?.label ?? v;
  const maxN = cells.reduce((m, c) => Math.max(m, c.n ?? 0), 0);
  const validCount = cells.filter((c) => c.r != null).length;
  const progressPct = Math.min(100, Math.round((maxN / 10) * 100));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-xs" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="p-1" />
              {commodities.map((c) => (
                <th key={c.value} className="p-1 text-center text-[11px] font-medium text-slate-400">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {commodities.map((row) => (
              <tr key={row.value}>
                <td className="p-1 text-[11px] font-medium text-slate-400">{row.label}</td>
                {commodities.map((col) => {
                  if (row.value === col.value) {
                    const selfTip = `${short(row.value)}: korelasi diri (r=1.00)`;
                    return (
                      <td key={col.value} className="p-0">
                        <AnalyticsTip
                          trigger={
                            <div
                              role="img"
                              aria-label={selfTip}
                              title={selfTip}
                              tabIndex={0}
                              className="flex h-9 items-center justify-center rounded-md border border-white/20 bg-white/10 text-[11px] tabular-nums text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                            >
                              1.00
                            </div>
                          }
                          content={
                            <div className="min-w-44 space-y-0.5">
                              <TipTitle>{short(row.value)} × {short(col.value)}</TipTitle>
                              <TipRow k="Pearson r" v="1.00 (diagonal)" />
                              <TipSource>PIHPS Bank Indonesia</TipSource>
                            </div>
                          }
                        />
                      </td>
                    );
                  }
                  const cell =
                    lookup.get(`${row.value}::${col.value}`) ??
                    lookup.get(`${col.value}::${row.value}`);
                  const { bg, fg, strong } = corrRamp(cell?.r ?? null);
                  const tip = !cell
                    ? `${short(row.value)} × ${short(col.value)}: tanpa overlap`
                    : cell.r == null
                      ? `${short(row.value)} × ${short(col.value)}: n=${cell.n} < 10 — tak dihitung`
                      : `${short(row.value)} × ${short(col.value)}: r=${cell.r.toFixed(2)} (n=${cell.n})${Math.abs(cell.r) > 0.7 ? ' · kuat' : ''}`;
                  return (
                    <td key={col.value} className="p-0">
                      <AnalyticsTip
                        trigger={
                          <div
                            role="img"
                            aria-label={tip}
                            title={tip}
                            tabIndex={0}
                            className={`flex h-9 items-center justify-center rounded-md border text-[11px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                              strong ? 'border-white/40 font-bold' : 'border-white/10'
                            }`}
                            style={{ backgroundColor: cell?.r == null ? 'rgba(255,255,255,0.03)' : bg, color: fg }}
                          >
                            {cell?.r == null ? (
                              <span className="text-slate-600">n&lt;10</span>
                            ) : (
                              cell.r.toFixed(2)
                            )}
                          </div>
                        }
                        content={
                          <div className="min-w-44 space-y-0.5">
                            <TipTitle>{short(row.value)} × {short(col.value)}</TipTitle>
                            <TipRow k="Pearson r" v={cell?.r == null ? 'tak dihitung (n<10)' : cell.r.toFixed(2)} />
                            <TipRow k="Titik bersama" v={`n=${cell?.n ?? 0}`} />
                            <TipRow k="Kekuatan" v={cell?.r == null ? 'data kurang' : Math.abs(cell.r) > 0.7 ? 'kuat (|r|>0.7)' : 'lemah/sedang'} />
                            <TipSource>PIHPS Bank Indonesia · butuh ≥ 10 titik bersama</TipSource>
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
          { swatch: 'rgba(239,68,68,0.85)', label: 'positif kuat (|r|>0.7)' },
          { swatch: 'rgba(100,116,139,0.85)', label: 'negatif kuat (|r|>0.7)' },
          { swatch: 'rgba(255,255,255,0.03)', label: 'n<10 tak dihitung' },
        ]}
      />
      {/* UX n aktual + progres ke 10 + cara baca + CTA — threshold 10 tetap. */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs tabular-nums">
        <div
          className="flex items-center justify-between gap-2 text-slate-300"
          title={`Overlap maks n=${maxN}/10 · ${validCount}/${cells.length} pasangan terhitung · syarat 10${maxN < 10 ? ` · kurang ${10 - maxN} titik` : ' · tercapai'}`}
        >
          <span>
            {validCount} dari {cells.length} pasangan terhitung
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={maxN}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-label={`Progres overlap korelasi ${maxN} dari 10`}
        >
          <div
            className="h-full rounded-full bg-red-400/80 motion-safe:transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p
          className="mt-1.5 text-[11px] leading-relaxed text-slate-500"
          title="Cara baca: r mendekati +1 berarti kedua komoditas naik-turun bersama; mendekati −1 berarti berlawanan arah; |r|>0.7 ditandai ring tegas. n<10 tak dihitung (bukan 0)."
        >
          r +1 searah · −1 berlawanan · |r|&gt;0.7 kuat.
          {maxN < 10 ? (
            <>
              {' '}Perpanjang window ({windowDays} hari → 30 hari) atau{' '}
              {onShowAll ? (
                <button
                  type="button"
                  onClick={onShowAll}
                  className="cursor-pointer font-medium text-slate-200 underline decoration-white/30 underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded"
                >
                  pilih Semua wilayah
                </button>
              ) : (
                'pilih Semua wilayah'
              )}
              {' '}untuk menambah titik bersama.{regionActive ? ' Filter wilayah sempit mengurangi overlap.' : ''}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
