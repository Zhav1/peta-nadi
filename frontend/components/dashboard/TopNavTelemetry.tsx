'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Zap, Truck, CloudRain, ChevronDown } from 'lucide-react';
import { AgentStatusWidget } from '@/components/dashboard/AgentStatusWidget';

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
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2 text-xs font-mono font-bold select-none">
      {/* 1. Swarm Agent Live Health Widget */}
      <AgentStatusWidget />

      {/* 2. Routing Optimizer Solver Telemetry */}
      <div className="relative">
        <button
          onClick={() => togglePopover('solver')}
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all duration-200 hover:border-emerald-400/60 ${
            activePopover === 'solver'
              ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-[#0c0e12]/80 border-white/10 text-emerald-400 hover:bg-slate-900/80'
          }`}
          title="NetworkX Routing Solver Telemetry"
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
          <span>ROUTER: {cuOptInfo?.compute_time_ms ?? 3.2}ms</span>
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {activePopover === 'solver' && (
          <div className="absolute top-full right-0 mt-2 w-80 p-4 rounded-2xl bg-[#0c0e12]/95 border border-emerald-500/30 backdrop-blur-xl shadow-2xl z-50 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-2.5 mb-2.5">
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
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">NETWORKX DIJKSTRA</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-2 border-t border-white/5 leading-relaxed">
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
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all duration-200 hover:border-amber-400/60 ${
            activePopover === 'tomtom'
              ? 'bg-amber-950/80 border-amber-400 text-amber-300 ring-2 ring-amber-500/20'
              : 'bg-[#0c0e12]/80 border-white/10 text-amber-400 hover:bg-slate-900/80'
          }`}
          title="TomTom Live Traffic Congestion Telemetry"
        >
          <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {isLoading && !corridorContext ? (
            <span className="animate-pulse">TOMTOM: ...</span>
          ) : (
            <span>TOMTOM: +{tomtomDelayMin}m ({tomtomIndex}%)</span>
          )}
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {activePopover === 'tomtom' && (
          <div className="absolute top-full right-0 mt-2 w-80 p-4 rounded-2xl bg-[#0c0e12]/95 border border-amber-500/30 backdrop-blur-xl shadow-2xl z-50 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 border-b border-amber-500/20 pb-2.5 mb-2.5">
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
              <p className="text-[11px] text-slate-400 pt-2 border-t border-white/5 leading-relaxed">
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
          className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all duration-200 hover:border-cyan-400/60 ${
            activePopover === 'bmkg'
              ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 ring-2 ring-cyan-500/20'
              : 'bg-[#0c0e12]/80 border-white/10 text-cyan-400 hover:bg-slate-900/80'
          }`}
          title="BMKG Station Weather Observation"
        >
          <CloudRain className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          {isLoading && !corridorContext ? (
            <span className="animate-pulse">BMKG: ...</span>
          ) : (
            <span>BMKG: {bmkgRainfall} mm/j</span>
          )}
          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {activePopover === 'bmkg' && (
          <div className="absolute top-full right-0 mt-2 w-80 p-4 rounded-2xl bg-[#0c0e12]/95 border border-cyan-500/30 backdrop-blur-xl shadow-2xl z-50 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2.5 mb-2.5">
              <CloudRain className="w-4 h-4 text-cyan-400" />
              <span className="font-sans font-bold text-sm text-cyan-400">BMKG Weather Observation</span>
            </div>
            <div className="space-y-2 text-xs font-sans">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Intensitas Presipitasi:</span>
                <span className="font-mono font-bold text-cyan-300">{bmkgRainfall} mm/jam</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Status Stasiun:</span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold">OPERASIONAL</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-2 border-t border-white/5 leading-relaxed">
                Stasiun Meteorologi Maritim BMKG Belawan mendeteksi anomali hujan lebat di pesisir timur Sumatra.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
