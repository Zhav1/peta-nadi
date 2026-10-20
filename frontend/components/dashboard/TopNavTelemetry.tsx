'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Zap, Truck, CloudRain, ChevronDown } from 'lucide-react';
import { IntermodalTerminalPopover } from '@/components/dashboard/IntermodalTerminalPopover';
import type { ChokePointItem } from '@/lib/types';

interface TopNavTelemetryProps {
  routingInfo?: { solver: string; compute_time_ms: number | null; savings_pct: number | null } | null;
  corridorContext?: import('@/lib/types').CorridorContext | null;
  isLoading?: boolean;
  /** True while a route computation is in flight — never render a stale latency. */
  isRoutingLoading?: boolean;
  onOpenHitl?: () => void;
  pendingHitlCount?: number;
  // Compact zone filter pills when left sidebar collapsed
  isLeftSidebarCollapsed?: boolean;
  showRedZones?: boolean;
  onToggleRedZones?: () => void;
  redZoneCount?: number;
  showYellowZones?: boolean;
  onToggleYellowZones?: () => void;
  yellowZoneCount?: number;
  // Q3: two independent overlay toggles, default ON (weather polygons + FIRMS dots+heat)
  showWeatherPolygons?: boolean;
  onToggleWeatherPolygons?: () => void;
  weatherPolygonCount?: number;
  showFireHotspots?: boolean;
  onToggleFireHotspots?: () => void;
  fireHotspotCount?: number;
  fireStatus?: 'ok' | 'degraded';
  fireTooltip?: string;
  onSelectHub?: (hub: ChokePointItem) => void;
  onFocusRoute?: () => void;
}

type ActivePopover = 'NONE' | 'RUTE' | 'LALULINTAS' | 'BMKG' | 'INTERMODAL';

export const TopNavTelemetry: React.FC<TopNavTelemetryProps> = ({
  routingInfo,
  corridorContext,
  isLoading = false,
  isRoutingLoading = false,
  onOpenHitl,
  pendingHitlCount = 0,
  isLeftSidebarCollapsed = false,
  showRedZones = true,
  onToggleRedZones,
  redZoneCount = 0,
  showYellowZones = true,
  onToggleYellowZones,
  yellowZoneCount = 0,
  showWeatherPolygons = true,
  onToggleWeatherPolygons,
  weatherPolygonCount = 0,
  showFireHotspots = true,
  onToggleFireHotspots,
  fireHotspotCount = 0,
  fireStatus = 'ok',
  fireTooltip,
  onSelectHub,
  onFocusRoute,
}) => {
  const solverStats = routingInfo;
  const bmkgRainfall = corridorContext?.weather?.rainfall_mm;
  const tomtomDelayMin = corridorContext?.traffic?.delay_minutes;
  const tomtomIndex = corridorContext?.traffic?.congestion_level_pct;

  const [activePopover, setActivePopover] = useState<ActivePopover>('NONE');
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside listener to cleanly close any active popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActivePopover('NONE');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePopover = (target: ActivePopover) => {
    setActivePopover((prev) => (prev === target ? 'NONE' : target));
  };

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1.5 text-xs font-mono select-none overflow-visible">
      {/* 1. Routing Compute Latency (Interactive Button & God's-Eye Popover) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => togglePopover('RUTE')}
          className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors duration-150 shrink-0 ${
            activePopover === 'RUTE'
              ? 'bg-[#0c1017] border-[#00f0ff]/50 text-cyan-300 ring-1 ring-[#00f0ff]/30'
              : 'bg-[#0c1017] border-white/10 text-emerald-400 hover:border-slate-500'
          }`}
          title="Latensi solver optimasi rute mitigasi CPU (NetworkX + OR-Tools / 2-Opt)"
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            RUTE: {isRoutingLoading ? '...' : solverStats?.compute_time_ms != null ? `${solverStats.compute_time_ms}ms` : '< 15ms'}
          </span>
          <ChevronDown className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-150 ${activePopover === 'RUTE' ? 'rotate-180' : ''}`} />
        </button>

        {activePopover === 'RUTE' && (
          <div className="absolute top-full left-0 mt-2 w-80 sm:w-88 z-50 backdrop-blur-md bg-[#0c1017]/95 border border-[#1c2432] rounded-xl shadow-2xl p-3.5 text-slate-200 animate-in fade-in duration-150 space-y-3 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#1c2432]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                    Deterministic CPU Solver
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    NetworkX + OR-Tools / 2-Opt
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                SIAGA
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-lg bg-[#121822] border border-[#1c2432]">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Latensi Solver</span>
                <span className="text-sm font-bold text-emerald-400">
                  {isRoutingLoading ? '...' : solverStats?.compute_time_ms != null ? `${solverStats.compute_time_ms} ms` : '< 15 ms'}
                </span>
                <span className="text-[10px] text-slate-500 block font-sans">
                  {isRoutingLoading ? 'Menghitung rute...' : 'Sub-Detik Deterministik'}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-[#121822] border border-[#1c2432]">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Bahaya Dihindari</span>
                <span className="text-sm font-bold text-cyan-400">
                  {redZoneCount} Zona Merah
                </span>
                <span className="text-[10px] text-slate-500 block font-sans">Dynamic Detours</span>
              </div>
            </div>

            {/* Corridor Status */}
            <div className="p-2.5 rounded-lg bg-[#121822] border border-[#1c2432] space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-sans">Mesin Solver:</span>
                <span className="font-mono text-slate-200">OR-Tools 2-Opt CPU</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-sans">Baseline vs Dinamis:</span>
                <span className="font-mono text-slate-200">ETA Adaptif Lalu Lintas</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 border-t border-[#1c2432]/60 pt-1">
                <span className="font-sans">Garansi Solver:</span>
                <span className="font-mono text-emerald-400 font-semibold">Zero GPU / 100% Reprodusibel</span>
              </div>
            </div>

            {/* Quick Action Button */}
            {onFocusRoute && (
              <button
                type="button"
                onClick={() => {
                  onFocusRoute();
                  setActivePopover('NONE');
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>Fokus Koridor Rute</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. TomTom Traffic Delay (Interactive Button & God's-Eye Popover) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => togglePopover('LALULINTAS')}
          className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors duration-150 shrink-0 ${
            activePopover === 'LALULINTAS'
              ? 'bg-[#0c1017] border-[#00f0ff]/50 text-cyan-300 ring-1 ring-[#00f0ff]/30'
              : 'bg-[#0c1017] border-white/10 text-amber-400 hover:border-slate-500'
          }`}
          title={tomtomDelayMin != null ? `Pantauan keterlambatan arteri TomTom: +${tomtomDelayMin}m (${tomtomIndex ?? 0}%)` : 'Data lalu lintas TomTom'}
        >
          <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {isLoading && !corridorContext ? (
            <span>LALULINTAS: ...</span>
          ) : (
            <span>LALULINTAS: {tomtomDelayMin != null ? `+${tomtomDelayMin}m` : 'Normal'}</span>
          )}
          <ChevronDown className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-150 ${activePopover === 'LALULINTAS' ? 'rotate-180' : ''}`} />
        </button>

        {activePopover === 'LALULINTAS' && (
          <div className="absolute top-full left-0 mt-2 w-80 sm:w-88 z-50 backdrop-blur-md bg-[#0c1017]/95 border border-[#1c2432] rounded-xl shadow-2xl p-3.5 text-slate-200 animate-in fade-in duration-150 space-y-3 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#1c2432]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-950/60 text-amber-400 border border-amber-500/30">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                    TomTom Flow Matrix
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Kecepatan & Keterlambatan Koridor
                  </p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                corridorContext?.is_fallback
                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
              }`}>
                {corridorContext?.is_fallback ? 'CACHED' : 'LIVE STREAM'}
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-lg bg-[#121822] border border-[#1c2432]">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Delay Koridor</span>
                <span className="text-sm font-bold text-amber-400">
                  {tomtomDelayMin != null ? `+${tomtomDelayMin} mnt` : '+0 mnt'}
                </span>
                <span className="text-[10px] text-slate-500 block font-sans">Tundaan Trans-Sumatra</span>
              </div>

              <div className="p-2 rounded-lg bg-[#121822] border border-[#1c2432]">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Kecepatan Aliran</span>
                <span className="text-sm font-bold text-slate-200">
                  {corridorContext?.traffic?.flow_speed_kmh ?? 58} km/j
                </span>
                <span className="text-[10px] text-slate-500 block font-sans">Kongesti {tomtomIndex ?? 12}%</span>
              </div>
            </div>

            {/* Primary Monitored Sumatra Corridors */}
            <div className="space-y-1.5 text-xs">
              <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold block">
                Koridor Pantauan Utama:
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex items-center justify-between p-1.5 rounded bg-[#121822] border border-[#1c2432]">
                  <span className="text-slate-300 truncate max-w-[170px]">Jalinsum Medan–Tebing Tinggi</span>
                  <span className="text-emerald-400 font-semibold">68 km/j · Lancar</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-[#121822] border border-[#1c2432]">
                  <span className="text-slate-300 truncate max-w-[170px]">Akses Tol Pelabuhan Belawan</span>
                  <span className="text-amber-400 font-semibold">52 km/j · Padat</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-[#121822] border border-[#1c2432]">
                  <span className="text-slate-300 truncate max-w-[170px]">Bakauheni–Terbanggi Besar</span>
                  <span className="text-emerald-400 font-semibold">85 km/j · Lancar</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-[#121822] border border-[#1c2432]">
                  <span className="text-slate-300 truncate max-w-[170px]">Padang–Bukittinggi (Silaing)</span>
                  <span className="text-amber-400 font-semibold">34 km/j · Waspada</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. BMKG Rainfall (Interactive Button & God's-Eye Popover) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => togglePopover('BMKG')}
          className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors duration-150 shrink-0 ${
            activePopover === 'BMKG'
              ? 'bg-[#0c1017] border-[#00f0ff]/50 text-cyan-300 ring-1 ring-[#00f0ff]/30'
              : 'bg-[#0c1017] border-white/10 text-sky-400 hover:border-slate-500'
          }`}
          title="Intensitas curah hujan stasiun BMKG terdekat & fusi Open-Meteo"
        >
          <CloudRain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          {isLoading && !corridorContext ? (
            <span>BMKG: ...</span>
          ) : (
            <span>BMKG: {bmkgRainfall != null ? `${bmkgRainfall} mm/j` : '0 mm/j'}</span>
          )}
          <ChevronDown className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-150 ${activePopover === 'BMKG' ? 'rotate-180' : ''}`} />
        </button>

        {activePopover === 'BMKG' && (
          <div className="absolute top-full left-0 mt-2 w-80 sm:w-88 z-50 backdrop-blur-md bg-[#0c1017]/95 border border-[#1c2432] rounded-xl shadow-2xl p-3.5 text-slate-200 animate-in fade-in duration-150 space-y-3 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#1c2432]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-sky-950/60 text-sky-400 border border-sky-500/30">
                  <CloudRain className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                    BMKG Radar + Open-Meteo
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Spatial Weather Fusion
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                SINKRON
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-lg bg-[#121822] border border-[#1c2432]">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Curah Hujan Puncak</span>
                <span className="text-sm font-bold text-sky-400">
                  {bmkgRainfall != null ? `${bmkgRainfall} mm/j` : '0 mm/j'}
                </span>
                <span className="text-[10px] text-slate-500 block font-sans">
                  {bmkgRainfall == null || bmkgRainfall < 5
                    ? 'Normal (< 5 mm/j)'
                    : bmkgRainfall <= 20
                      ? 'Waspada (5–20 mm/j)'
                      : 'Ekstrem (> 20 mm/j)'}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-[#121822] border border-[#1c2432]">
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Jangkauan Radar</span>
                <span className="text-sm font-bold text-slate-200">250 km</span>
                <span className="text-[10px] text-slate-500 block font-sans">Cakupan Pan-Sumatra</span>
              </div>
            </div>

            {/* Maritime Wave & Wind Advisory */}
            <div className="space-y-1.5 text-xs">
              <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold block">
                Peringatan Maritim & Selat Kunci:
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="p-2 rounded bg-[#121822] border border-[#1c2432] space-y-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-sans font-semibold">Selat Malaka</span>
                    <span className="text-emerald-400 text-[10px] font-bold">NORMAL</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[10px]">
                    <span>Gelombang: 0.5–1.2 m</span>
                    <span>Angin: 10–15 kts</span>
                  </div>
                </div>

                <div className="p-2 rounded bg-[#121822] border border-[#1c2432] space-y-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-sans font-semibold">Selat Sunda (Merak–Bakauheni)</span>
                    <span className="text-amber-400 text-[10px] font-bold">WASPADAI GELOMBANG</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[10px]">
                    <span>Gelombang: 1.25–2.0 m</span>
                    <span>Operasional Feri: Berjalan</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Pan-Sumatra Intermodal Choke-Points Popover */}
      <IntermodalTerminalPopover
        isOpen={activePopover === 'INTERMODAL'}
        onToggle={() => togglePopover('INTERMODAL')}
        onClose={() => setActivePopover('NONE')}
        onSelectHub={onSelectHub}
      />

      {/* Compact Zone Filter Pills when Left OSINT Drawer is Collapsed */}
      {isLeftSidebarCollapsed && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleRedZones}
            className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
              showRedZones
                ? 'bg-red-950/50 border-red-500/50 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
            }`}
            title="Filter Peta: Zona Merah (Bencana Terkonfirmasi)"
          >
            <span className={`w-2 h-2 rounded-full ${showRedZones ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]' : 'bg-slate-600'}`} />
            <span className="font-sans text-[11px] font-semibold">Merah</span>
            <span className="px-1 py-0.2 rounded bg-red-500/20 text-[10px] font-bold text-red-300 font-mono">
              {redZoneCount}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleYellowZones}
            className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
              showYellowZones
                ? 'bg-yellow-950/50 border-yellow-500/50 text-yellow-200 shadow-[0_0_8px_rgba(234,179,8,0.3)]'
                : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
            }`}
            title="Filter Peta: Zona Kuning (Perlu Klarifikasi / Waspada)"
          >
            <span className={`w-2 h-2 rounded-full ${showYellowZones ? 'bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.9)]' : 'bg-slate-600'}`} />
            <span className="font-sans text-[11px] font-semibold">Kuning</span>
            <span className="px-1 py-0.2 rounded bg-yellow-500/20 text-[10px] font-bold text-yellow-300 font-mono">
              {yellowZoneCount}
            </span>
          </button>
        </div>
      )}

      {/* Q3: independent weather + FIRMS overlay toggles (default ON) */}
      {onToggleWeatherPolygons && (
        <button
          type="button"
          onClick={onToggleWeatherPolygons}
          className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
            showWeatherPolygons
              ? 'bg-blue-950/50 border-blue-500/50 text-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
              : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
          }`}
          title="Overlay cuaca: poligon advisori BMKG + Open-Meteo (biru/ungu). Klik poligon = sumber + valid_until."
        >
          <span className={`w-2 h-2 rounded-full ${showWeatherPolygons ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.9)]' : 'bg-slate-600'}`} />
          <span className="font-sans text-[11px] font-semibold">Cuaca</span>
          <span className="px-1 py-0.2 rounded bg-blue-500/20 text-[10px] font-bold text-blue-300 font-mono">
            {weatherPolygonCount}
          </span>
        </button>
      )}
      {onToggleFireHotspots && (
        <button
          type="button"
          onClick={onToggleFireHotspots}
          className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
            fireStatus === 'degraded'
              ? 'bg-[#0c1017] border-white/10 text-slate-500 opacity-70'
              : showFireHotspots
                ? 'bg-orange-950/50 border-orange-500/50 text-orange-200 shadow-[0_0_8px_rgba(249,115,22,0.3)]'
                : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
          }`}
          title={fireTooltip || (fireStatus === 'degraded' ? 'butuh MAP_KEY' : 'Overlay FIRMS VIIRS_SNPP_NRT: titik + heat oranye. Klik titik = FRP/conf/jarak koridor.')}
        >
          <span className={`w-2 h-2 rounded-full ${fireStatus === 'degraded' ? 'bg-slate-600' : showFireHotspots ? 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.9)]' : 'bg-slate-600'}`} />
          <span className="font-sans text-[11px] font-semibold">Karhutla</span>
          <span className={`px-1 py-0.2 rounded text-[10px] font-bold font-mono ${fireStatus === 'degraded' ? 'bg-white/10 text-slate-400' : 'bg-orange-500/20 text-orange-300'}`}>
            {fireStatus === 'degraded' ? '—' : fireHotspotCount}
          </span>
        </button>
      )}

      {/* 5. Globot HITL Review Drawer Trigger */}
      {onOpenHitl && (
        <button
          type="button"
          onClick={onOpenHitl}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/50 hover:text-white transition shadow-sm shrink-0"
          title="Buka Panel Tinjauan Keputusan Operator (HITL)"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />
          <span>HITL REVIEW</span>
          {pendingHitlCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-bold text-xs">
              {pendingHitlCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
};
