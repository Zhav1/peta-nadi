'use client';

/** Skala bersama heatmap Analitik (gods-eye sqrt-alpha + ramp Globot). */

/** Ramp kategorikal ambang 5/10/15% — sinkron dengan badge severity (3+neutral: red/amber/slate). */
export function spikeRamp(v: number | null): { bg: string; fg: string; alpha: number } {
  if (v == null) return { bg: 'transparent', fg: '#64748b', alpha: 0 };
  const a = 0.25 + 0.75 * Math.min(Math.sqrt(Math.abs(v) / 30), 1);
  if (v >= 15) return { bg: `rgba(239,68,68,${a.toFixed(2)})`, fg: '#fecaca', alpha: a };
  if (v >= 10) return { bg: `rgba(239,68,68,${a.toFixed(2)})`, fg: '#fecaca', alpha: a };
  if (v >= 5) return { bg: `rgba(245,158,11,${a.toFixed(2)})`, fg: '#fde68a', alpha: a };
  return { bg: 'rgba(100,116,139,0.12)', fg: '#94a3b8', alpha: 0.12 };
}

/** Ramp korelasi: positif merah, negatif slate netral (|r|>0.7 tegas). Biru hanya untuk garis tren. */
export function corrRamp(r: number | null): { bg: string; fg: string; strong: boolean } {
  if (r == null) return { bg: 'transparent', fg: '#64748b', strong: false };
  const strong = Math.abs(r) > 0.7;
  const a = (0.2 + 0.8 * Math.min(Math.sqrt(Math.abs(r)), 1)).toFixed(2);
  if (r >= 0) return { bg: `rgba(239,68,68,${a})`, fg: '#fecaca', strong };
  return { bg: `rgba(100,116,139,${a})`, fg: '#cbd5e1', strong };
}

export function HeatLegend({
  items,
}: {
  items: Array<{ swatch: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums text-slate-400">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-sm border border-white/10"
            style={{ backgroundColor: it.swatch }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
