'use client';

import React from 'react';
import { Badge } from '@/components/base-ui/badge';
import { AnalyticsTip, TipRow, TipTitle } from './AnalyticsTip';

export interface Kpi {
  key: string;
  label: string;
  /** tampilan utama, mis. "+3.2%" atau "n/a" */
  display: string;
  /** null = honest-empty (denominator<3) */
  value: number | boolean | null;
  /** nada badge severity */
  tone: 'critical' | 'high' | 'warn' | 'neutral';
  hint: string;
}

const TONE: Record<Kpi['tone'], string> = {
  critical: 'bg-red-500/15 text-red-300 border-red-400/30',
  high: 'bg-red-500/15 text-red-300 border-red-400/30',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  neutral: 'text-slate-400',
};

function fmtSigned(v: number | null, suffix = '%'): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}${suffix}`;
}

/** 7 KPI Analitik — tabular-nums text-xs, honest-empty bila denominator<3. */
export function KpiStrip({ kpis, loading }: { kpis: Kpi[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-white/5 motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="list" aria-label="Indikator analitik">
      {kpis.map((k) => {
        const empty = k.value == null;
        const tip = `${k.label}: ${empty ? 'data kurang' : k.display} — ${k.hint}`;
        return (
          <AnalyticsTip
            key={k.key}
            trigger={
              <div
                role="listitem"
                aria-label={tip}
                title={k.hint}
                tabIndex={0}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <p className="text-[11px] font-medium text-slate-400">{k.label}</p>
                <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-100">
                  {empty ? <span className="font-medium text-slate-500">n/a</span> : k.display}
                </p>
                <div className="mt-1">
                  <Badge variant="outline" className={`${TONE[k.tone]} text-[11px] tabular-nums`}>
                    {empty ? 'data kurang' : k.tone === 'neutral' ? 'terpantau' : k.tone}
                  </Badge>
                </div>
              </div>
            }
            content={
              <div className="min-w-44 max-w-60 space-y-0.5">
                <TipTitle>{k.label}</TipTitle>
                <TipRow k="Nilai" v={empty ? 'n/a (data kurang)' : k.display} />
                <TipRow k="Status" v={empty ? 'data kurang' : k.tone === 'neutral' ? 'terpantau' : k.tone} />
                <p className="pt-1 text-[11px] leading-snug text-slate-400">{k.hint}</p>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

export { fmtSigned };
