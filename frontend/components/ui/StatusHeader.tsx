'use client';
import { FreshnessBadge } from './FreshnessBadge';

interface StatusHeaderProps {
  incidentCount: number;
  validatedCount: number;
  lastUpdated: Date | null;
}

export function StatusHeader({ incidentCount, validatedCount, lastUpdated }: StatusHeaderProps) {
  return (
    <header
      id="status-header"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
    >
      <div className="bg-slate-900/60 backdrop-blur-lg border border-white/10 rounded-2xl px-5 py-2.5 shadow-xl pointer-events-auto">
        <div className="flex items-center gap-5">
          {/* Brand */}
          <div>
            <span className="text-sm font-bold tracking-tight text-white">Peta</span>
            <span className="text-sm font-bold tracking-tight text-cyan-400">Nadi</span>
          </div>

          <div className="w-px h-4 bg-white/10" />

          {/* Incident counts */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              <span className="text-white font-semibold">{incidentCount}</span> active
            </span>
            <span className="text-slate-400">
              <span className="text-emerald-400 font-semibold">{validatedCount}</span> validated
            </span>
          </div>

          <div className="w-px h-4 bg-white/10" />

          {/* Data freshness */}
          <FreshnessBadge lastUpdated={lastUpdated} sourceLabel="Live feed" />
        </div>
      </div>
    </header>
  );
}
