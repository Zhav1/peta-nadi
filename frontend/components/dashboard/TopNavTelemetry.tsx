'use client';

import React from 'react';
import { Zap, Truck, CloudRain } from 'lucide-react';
import { IntermodalTerminalPopover } from '@/components/dashboard/IntermodalTerminalPopover';

interface TopNavTelemetryProps {
  cuOptInfo?: { solver: string; compute_time_ms: number; savings_pct: number } | null;
  corridorContext?: import('@/lib/types').CorridorContext | null;
  isLoading?: boolean;
}

export const TopNavTelemetry: React.FC<TopNavTelemetryProps> = ({
  cuOptInfo = { solver: 'NetworkX Graph Matrix', compute_time_ms: 3.2, savings_pct: 18.5 },
  corridorContext,
  isLoading = false,
}) => {
  const bmkgRainfall = corridorContext?.weather?.rainfall_mm ?? 45.0;
  const tomtomDelayMin = corridorContext?.traffic?.delay_minutes ?? 25;
  const tomtomIndex = corridorContext?.traffic?.congestion_level_pct ?? 62.5;

  return (
    <div className="relative flex items-center gap-2 text-xs font-mono select-none">
      {/* 1. Routing Compute Latency */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-[#0c1017] border-white/10 text-emerald-400"
        title="Latensi solver optimasi rute mitigasi"
      >
        <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>RUTE: {cuOptInfo?.compute_time_ms ?? 3.2}ms</span>
      </div>

      {/* 2. TomTom Traffic Delay */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-[#0c1017] border-white/10 text-amber-400"
        title="Pantauan keterlambatan lalu lintas arteri TomTom"
      >
        <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        {isLoading && !corridorContext ? (
          <span>LALULINTAS: ...</span>
        ) : (
          <span>LALULINTAS: +{tomtomDelayMin}m ({tomtomIndex}%)</span>
        )}
      </div>

      {/* 3. BMKG Rainfall */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-[#0c1017] border-white/10 text-sky-400"
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
    </div>
  );
};
