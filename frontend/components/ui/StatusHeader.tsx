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
 <div className="bg-[#0c1017] border border-[#1c2432] rounded-lg px-5 py-2 shadow-xl pointer-events-auto">
 <div className="flex items-center gap-5">
 {/* Brand */}
 <div>
 <span className="text-sm font-bold tracking-tight text-white">Peta</span>
 <span className="text-sm font-bold tracking-tight text-cyan-400">Nadi</span>
 </div>

 <div className="w-px h-4 bg-white/10" />

 {/* Incident counts */}
 <div className="flex items-center gap-3 text-xs tabular-nums">
 <span className="text-slate-400">
 <span className="text-slate-200 font-medium tabular-nums">{incidentCount}</span> aktif
 </span>
 <span className="text-slate-400">
 <span className="text-slate-200 font-medium tabular-nums">{validatedCount}</span> valid
 </span>
 </div>

 <div className="w-px h-4 bg-white/10" />

 {/* Data freshness */}
 <FreshnessBadge lastUpdated={lastUpdated} sourceLabel="Data" />
 </div>
 </div>
 </header>
 );
}
