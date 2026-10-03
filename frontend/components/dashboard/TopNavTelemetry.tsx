'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Zap, Truck, CloudRain, ChevronDown } from 'lucide-react';
import { AgentStatusWidget } from '@/components/dashboard/AgentStatusWidget';
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
  const [activePopover, setActivePopover] = useState<'solver' | 'tomtom' | 'bmkg' | 'status' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePopover = (type: 'solver' | 'tomtom' | 'bmkg' | 'status') => {
    setActivePopover((prev) => (prev === type ? null : type));
  };

  const bmkgRainfall = corridorContext?.weather?.rainfall_mm ?? 45.0;
  const tomtomDelayMin = corridorContext?.traffic?.delay_minutes ?? 25;
  const tomtomIndex = corridorContext?.traffic?.congestion_level_pct ?? 62.5;

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 text-xs font-mono select-none">
      {/* 1. Swarm Agent Health Widget */}
      <AgentStatusWidget />

      {/* 2. Routing Optimizer Solver Telemetry */}
      <div className="relative">
        <button
          onClick={() => togglePopover('solver')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
            activePopover === 'solver'
              ? 'bg-white/10 border-white/30 text-emerald-300'
              : 'bg-[#0c1017] border-white/10 text-emerald-400 hover:border-white/20'
          }`}
          title="Telemetri Solver Rute NetworkX"
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>ROUTER: {cuOptInfo?.compute_time_ms ?? 3.2}ms</span>
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {activePopover === 'solver' && (
          <div className="absolute top-full left-0 mt-2 w-80 p-4 rounded-xl bg-[#0c1017] border border-white/10 shadow-2xl z-50 text-slate-200">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 mb-2.5">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="font-sans font-bold text-sm text-emerald-400">PreHub Routing Matrix Engine</span>
            </div>
            <div className="space-y-2 text-xs font-sans">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Waktu Komputasi Graf:</span>
                <span className="font-mono font-bold text-emerald-300">{cuOptInfo?.compute_time_ms ?? 3.2} ms</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Status Solver Engine:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold">NETWORKX DIJKSTRA</span>
              </div>
              <p className="text-xs text-slate-400 pt-2 border-t border-white/10 leading-relaxed">
                Algoritma graf NetworkX memproyeksikan matriks biaya rute mitigasi antar-hub logistik dengan pembobotan hazard real-time.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. TomTom Traffic Stream Telemetry */}
      <div className="relative">
        <button
          onClick={() => togglePopover('tomtom')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
            activePopover === 'tomtom'
              ? 'bg-white/10 border-white/30 text-amber-300'
              : 'bg-[#0c1017] border-white/10 text-amber-400 hover:border-white/20'
          }`}
          title="Telemetri Kemacetan Lalu Lintas TomTom"
        >
          <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {isLoading && !corridorContext ? (
            <span>TOMTOM: ...</span>
          ) : (
            <span>TOMTOM: +{tomtomDelayMin}m ({tomtomIndex}%)</span>
          )}
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {activePopover === 'tomtom' && (
          <div className="absolute top-full left-0 mt-2 w-80 p-4 rounded-xl bg-[#0c1017] border border-white/10 shadow-2xl z-50 text-slate-200">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 mb-2.5">
              <Truck className="w-4 h-4 text-amber-400" />
              <span className="font-sans font-bold text-sm text-amber-400">TomTom Traffic Flow Stream</span>
            </div>
            <div className="space-y-2 text-xs font-sans">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Keterlambatan Rata-rata:</span>
                <span className="font-mono font-bold text-amber-300">+{tomtomDelayMin} Menit</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Indeks Kemacetan Segmen:</span>
                <span className="font-mono font-bold text-amber-300">{tomtomIndex}%</span>
              </div>
              <p className="text-xs text-slate-400 pt-2 border-t border-white/10 leading-relaxed">
                Stream data TomTom mendeteksi penumpukan volume armada logistik akibat penutupan lajur tol dan genangan air.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 4. BMKG Station Weather Warning Telemetry */}
      <div className="relative">
        <button
          onClick={() => togglePopover('bmkg')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
            activePopover === 'bmkg'
              ? 'bg-white/10 border-white/30 text-sky-300'
              : 'bg-[#0c1017] border-white/10 text-sky-400 hover:border-white/20'
          }`}
          title="Observasi Cuaca Stasiun BMKG"
        >
          <CloudRain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          {isLoading && !corridorContext ? (
            <span>BMKG: ...</span>
          ) : (
            <span>BMKG: {bmkgRainfall} mm/j</span>
          )}
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {activePopover === 'bmkg' && (
          <div className="absolute top-full left-0 mt-2 w-80 p-4 rounded-xl bg-[#0c1017] border border-white/10 shadow-2xl z-50 text-slate-200">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 mb-2.5">
              <CloudRain className="w-4 h-4 text-sky-400" />
              <span className="font-sans font-bold text-sm text-sky-400">BMKG Weather Observation</span>
            </div>
            <div className="space-y-2 text-xs font-sans">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Intensitas Presipitasi:</span>
                <span className="font-mono font-bold text-sky-300">{bmkgRainfall} mm/jam</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Status Stasiun:</span>
                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-mono font-bold">OPERASIONAL</span>
              </div>
              <p className="text-xs text-slate-400 pt-2 border-t border-white/10 leading-relaxed">
                Stasiun Meteorologi Maritim BMKG Belawan mendeteksi anomali hujan lebat di pesisir timur Sumatra.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 5. Pan-Sumatra Intermodal Choke-Points Popover */}
      <IntermodalTerminalPopover />
    </div>
  );
};
