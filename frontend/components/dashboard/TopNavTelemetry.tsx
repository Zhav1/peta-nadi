'use client';

import React from 'react';
import { Zap, Truck, CloudRain } from 'lucide-react';
import { IntermodalTerminalPopover } from '@/components/dashboard/IntermodalTerminalPopover';

interface TopNavTelemetryProps {
  cuOptInfo?: { solver: string; compute_time_ms: number; savings_pct: number } | null;
  corridorContext?: import('@/lib/types').CorridorContext | null;
  isLoading?: boolean;
  onOpenHitl?: () => void;
  pendingHitlCount?: number;
}

export const TopNavTelemetry: React.FC<TopNavTelemetryProps> = ({
  cuOptInfo = { solver: 'NetworkX Graph Matrix', compute_time_ms: 3.2, savings_pct: 18.5 },
  corridorContext,
  isLoading = false,
  onOpenHitl,
  pendingHitlCount = 0,
}) => {
  const bmkgRainfall = corridorContext?.weather?.rainfall_mm ?? 45.0;
  const tomtomDelayMin = corridorContext?.traffic?.delay_minutes ?? 25;
  const tomtomIndex = corridorContext?.traffic?.congestion_level_pct ?? 62.5;

  return (
    <div className="relative flex items-center gap-1.5 text-xs font-mono select-none">
      {/* 1. Routing Compute Latency */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-[#0c1017] border-white/10 text-emerald-400 shrink-0"
        title="Latensi solver optimasi rute mitigasi"
      >
        <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>RUTE: {cuOptInfo?.compute_time_ms ?? 3.2}ms</span>
      </div>

      {/* 2. TomTom Traffic Delay */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-[#0c1017] border-white/10 text-amber-400 shrink-0"
        title={`Pantauan keterlambatan arteri TomTom: +${tomtomDelayMin}m (${tomtomIndex}%)`}
      >
        <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        {isLoading && !corridorContext ? (
          <span>LALULINTAS: ...</span>
        ) : (
          <span>LALULINTAS: +{tomtomDelayMin}m</span>
        )}
      </div>

      {/* 3. BMKG Rainfall */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-[#0c1017] border-white/10 text-sky-400 shrink-0"
        title="Intensitas curah hujan stasiun BMKG terdekat"
      >
        <CloudRain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        {isLoading && !corridorContext ? (
          <span>BMKG: ...</span>
        ) : (
          <span>BMKG: {bmkgRainfall} mm/j</span>
        )}
      </div>

      {/* 4. Pan-Sumatra Intermodal Choke-Points Popover */}
      <IntermodalTerminalPopover />

      {/* 5. Globot HITL Review Drawer Trigger */}
      {onOpenHitl && (
        <button
          type="button"
          onClick={onOpenHitl}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/50 hover:text-white transition shadow-sm"
          title="Buka Panel Tinjauan Keputusan Operator (HITL)"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>HITL REVIEW</span>
          {pendingHitlCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-bold text-[10px]">
              {pendingHitlCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
};
