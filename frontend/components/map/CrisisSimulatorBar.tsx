'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Compass,
  Truck,
  ChevronDown,
  MapPin,
  RotateCcw,
  AlertTriangle,
  CloudRain,
  Anchor,
  Flame,
  Activity,
  Mountain,
  Waves,
  Target,
  PenTool,
  Trash2,
  Sliders,
  Check,
  Gauge,
} from 'lucide-react';
import type { CrisisType, Severity, RouteRecommendation } from '@/lib/types';
import { HUB_NODES } from '@/lib/mapboxRoutingService';
import { HAZARD_RADIUS_OPTIONS_KM, type TransportModality } from '@/lib/aiDynamicRouter';
import { resolveMapDockClasses } from '@/components/dashboard/mapDockLayout';

export interface CorridorVisibilityState {
  land: boolean;
  sea: boolean;
  air: boolean;
}

export interface CrisisSimulatorBarProps {
  onTriggerPointSimulation: (
    lat: number,
    lon: number,
    type: CrisisType,
    radiusKm: number,
    severity: Severity
  ) => void;
  isClickTargeting: boolean;
  setIsClickTargeting: (active: boolean) => void;
  drawModeActive: boolean;
  setDrawModeActive: (active: boolean) => void;
  simulationActive: boolean;
  onClearSimulation: () => void;
  originNodeId?: string | null;
  destNodeId?: string | null;
  selectedRadius: number;
  setSelectedRadius: (radius: number) => void;
  selectedModality?: TransportModality;
  setSelectedModality?: (modality: TransportModality) => void;
  corridorVisibility?: CorridorVisibilityState;
  onToggleCorridor?: (corridor: 'land' | 'sea' | 'air') => void;
  onResetCorridorVisibility?: () => void;
  activeCorridors?: RouteRecommendation[];
  hiddenRouteCount?: number;
  onResetNodes?: () => void;
  isSidebarOpen?: boolean;
  isLeftSidebarCollapsed?: boolean;
  simSpeed?: number;
  setSimSpeed?: (speed: number) => void;
}

export function CrisisSimulatorBar({
  isClickTargeting,
  setIsClickTargeting,
  drawModeActive,
  setDrawModeActive,
  simulationActive,
  onClearSimulation,
  originNodeId = null,
  destNodeId = null,
  selectedRadius,
  setSelectedRadius,
  selectedModality = 'best',
  setSelectedModality,
  corridorVisibility = { land: true, sea: true, air: true },
  onToggleCorridor,
  onResetCorridorVisibility,
  activeCorridors = [],
  hiddenRouteCount,
  onResetNodes,
  isSidebarOpen = false,
  isLeftSidebarCollapsed = false,
  simSpeed = 1,
  setSimSpeed,
}: CrisisSimulatorBarProps) {
  const [selectedType, setSelectedType] = useState<CrisisType>('flood');
  const [activePopover, setActivePopover] = useState<'nodes' | 'disruption' | 'radius' | 'speed' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hazardOptions: Array<{ type: CrisisType; label: string; icon: React.ReactNode }> = [
    { type: 'flood', label: 'Banjir', icon: <CloudRain className="w-3.5 h-3.5 text-cyan-400" /> },
    { type: 'port_closure', label: 'Penutupan Pelabuhan', icon: <Anchor className="w-3.5 h-3.5 text-amber-400" /> },
    { type: 'marine_wave', label: 'Gelombang Tinggi', icon: <Waves className="w-3.5 h-3.5 text-sky-400" /> },
    { type: 'road_closure', label: 'Jalan / Jembatan Putus', icon: <Truck className="w-3.5 h-3.5 text-yellow-400" /> },
    { type: 'landslide', label: 'Longsor', icon: <Mountain className="w-3.5 h-3.5 text-emerald-400" /> },
    { type: 'earthquake', label: 'Gempa', icon: <Activity className="w-3.5 h-3.5 text-red-400" /> },
    { type: 'volcanic_eruption', label: 'Erupsi / Abu Vulkanik', icon: <Flame className="w-3.5 h-3.5 text-orange-400" /> },
    { type: 'wildfire', label: 'Kebakaran / Asap', icon: <Flame className="w-3.5 h-3.5 text-orange-400" /> },
    { type: 'congestion', label: 'Macet', icon: <Truck className="w-3.5 h-3.5 text-yellow-400" /> },
  ];

  const originName = originNodeId ? HUB_NODES[originNodeId]?.name || originNodeId : null;
  const destName = destNodeId ? HUB_NODES[destNodeId]?.name || destNodeId : null;

  const effectiveHiddenCount =
    typeof hiddenRouteCount === 'number'
      ? hiddenRouteCount
      : (!corridorVisibility.land ? 1 : 0) +
        (!corridorVisibility.sea ? 1 : 0) +
        (!corridorVisibility.air ? 1 : 0);

  const togglePopover = (popover: 'nodes' | 'disruption' | 'radius' | 'speed') => {
    setActivePopover((prev) => (prev === popover ? null : popover));
  };

  const dockPositionClass = resolveMapDockClasses({
    isLeftSidebarCollapsed,
    isCrisisDrawerOpen: isSidebarOpen,
  });
  const pillsRowClass = `flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-md bg-[#0c0e12]/80 border border-white/10 shadow-2xl max-w-full overflow-visible transition-all duration-200 ${
    isSidebarOpen ? 'flex-wrap justify-center' : ''
  }`;

  return (
    <div
      ref={containerRef}
      className={`absolute bottom-16 sm:bottom-20 z-40 flex flex-col items-center gap-2 pointer-events-auto select-none transition-all duration-300 left-1/2 -translate-x-1/2 max-w-[95vw] ${dockPositionClass}`}
    >
      {/* Floating Action Bubble Pills Row */}
      <div className={pillsRowClass}>
        {/* Reset Hidden Corridors Pill (shows only when user has hidden any route corridors on map) */}
        {effectiveHiddenCount > 0 && (
          <button
            type="button"
            onClick={() => onResetCorridorVisibility?.()}
            className="cursor-pointer px-3 py-1.5 rounded-md backdrop-blur-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-sans font-medium transition-all duration-200 flex items-center gap-1.5 shadow-sm"
            title="Tampilkan kembali seluruh koridor rute yang disembunyikan"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Tampilkan Semua Rute ({effectiveHiddenCount} Tersembunyi)</span>
          </button>
        )}

        {/* 2. Node Selector Bubble Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('nodes')}
            className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-sans font-medium transition-all flex items-center gap-2 ${
              originName || destName
                ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                : 'bg-[#121822] border-[#1c2432] text-slate-300 hover:border-slate-600'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {originName ? (destName ? `${originName} -> ${destName}` : `Start: ${originName}`) : 'Rute Asal & Tujuan'}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'nodes' ? 'rotate-180' : ''}`} />
          </button>

          {/* Node Selector Popover */}
          {activePopover === 'nodes' && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-md bg-[#0c1017] border border-[#1c2432] shadow-xl flex flex-col gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <span className="text-xs font-sans text-cyan-400 font-bold">TITIK RUTE KORIDOR</span>
              <div className="p-2 rounded-md bg-[#121822] border border-[#1c2432] flex flex-col gap-1 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-slate-400 font-sans">Start:</span>
                  <span className="text-white font-bold">{originName || 'Klik kota di peta...'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-slate-400 font-sans">End:</span>
                  <span className="text-white font-bold">{destName || 'Klik kota di peta...'}</span>
                </div>
              </div>

              {onResetNodes && (originName || destName) && (
                <button
                  type="button"
                  onClick={() => {
                    onResetNodes();
                    setActivePopover(null);
                  }}
                  className="cursor-pointer w-full py-1.5 rounded-md bg-[#121822] hover:bg-slate-800 text-slate-200 text-xs font-sans font-medium flex items-center justify-center gap-1.5 transition border border-[#1c2432]"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Reset Titik Node</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 3. Disruption Presets & Tools Bubble Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('disruption')}
            className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-sans font-medium transition-all flex items-center gap-2 ${
              isClickTargeting || drawModeActive || simulationActive
                ? 'bg-amber-950/90 border-amber-500/60 text-amber-300'
                : 'bg-[#121822] border-[#1c2432] text-slate-300 hover:border-slate-600'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>{isClickTargeting ? 'Set Hazard...' : drawModeActive ? 'Gambar Poligon...' : 'Simulasi Bencana'}</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'disruption' ? 'rotate-180' : ''}`} />
          </button>

          {/* Disruption Popover */}
          {activePopover === 'disruption' && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-md bg-[#0c1017] border border-[#1c2432] shadow-xl flex flex-col gap-2.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 text-left">
              <span className="text-xs font-sans text-amber-400 font-bold">PRESET SKENARIO CRISIS</span>
              <div className="grid grid-cols-1 gap-1">
                {hazardOptions.map((h) => (
                  <button
                    key={h.type}
                    type="button"
                    onClick={() => {
                      setSelectedType(h.type);
                      setIsClickTargeting(true);
                      if (drawModeActive) setDrawModeActive(false);
                      setActivePopover(null);
                    }}
                    className={`cursor-pointer p-2 rounded-md text-left font-sans text-xs font-medium transition flex items-center justify-between ${
                      selectedType === h.type
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {h.icon}
                      <span>{h.label}</span>
                    </div>
                    <Target className="w-3.5 h-3.5 opacity-60" />
                  </button>
                ))}
              </div>

              <div className="border-t border-[#1c2432] pt-2 flex flex-col gap-1.5">
                <span className="text-xs font-sans text-slate-400 font-bold">MODES & ALAT MANUVER</span>
                
                {/* Freehand Draw Mode Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setDrawModeActive(!drawModeActive);
                    if (isClickTargeting) setIsClickTargeting(false);
                    setActivePopover(null);
                  }}
                  className={`cursor-pointer w-full p-2 rounded-md font-sans text-xs font-medium transition flex items-center gap-2 ${
                    drawModeActive
                      ? 'bg-amber-400 text-amber-950 font-bold'
                      : 'bg-[#121822] text-slate-300 border border-[#1c2432] hover:bg-slate-800'
                  }`}
                >
                  <PenTool className={`w-4 h-4 ${drawModeActive ? 'text-amber-950' : 'text-amber-400'}`} />
                  <span>Gambar Poligon Bebas</span>
                </button>

                {/* 1-Click Clear Simulation Button */}
                {(simulationActive || drawModeActive) && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearSimulation();
                      setActivePopover(null);
                    }}
                    className="cursor-pointer w-full p-2 rounded-md font-sans text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Hapus Semua Simulasi</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 4. Radius Selector Bubble Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('radius')}
            className="cursor-pointer px-3 py-1.5 rounded-md bg-[#121822] border border-[#1c2432] text-xs font-sans font-medium text-slate-300 hover:border-slate-600 transition-all flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono">{selectedRadius}km</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'radius' ? 'rotate-180' : ''}`} />
          </button>

          {/* Radius Popover */}
          {activePopover === 'radius' && (
            <div className="absolute bottom-full right-0 mb-2 w-36 p-2 rounded-md bg-[#0c1017] border border-[#1c2432] shadow-xl flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <span className="px-2 py-1 text-xs font-sans text-slate-400 font-bold">RADIUS BAHAYA</span>
              {HAZARD_RADIUS_OPTIONS_KM.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setSelectedRadius(r);
                    setActivePopover(null);
                  }}
                  className={`cursor-pointer w-full px-3 py-1.5 rounded-md font-sans text-xs font-medium transition flex items-center justify-between ${
                    selectedRadius === r
                      ? 'bg-white text-[#080d14] font-semibold'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span>{r} kilometer</span>
                  {selectedRadius === r && <Check className="w-3.5 h-3.5 text-[#080d14]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 5. Tactical Simulation Speed Selector Pill */}
        {setSimSpeed && (
          <div className="relative">
            <button
              type="button"
              onClick={() => togglePopover('speed')}
              className="cursor-pointer px-3 py-1.5 rounded-md bg-[#121822] border border-[#1c2432] text-xs font-sans font-medium text-slate-300 hover:border-slate-600 transition-all flex items-center gap-1.5"
              title="Kecepatan Simulasi Telemetri Peta"
            >
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-cyan-400 font-bold">{simSpeed}x</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'speed' ? 'rotate-180' : ''}`} />
            </button>

            {/* Speed Popover */}
            {activePopover === 'speed' && (
              <div className="absolute bottom-full right-0 mb-2 w-36 p-2 rounded-md bg-[#0c1017] border border-[#1c2432] shadow-xl flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <span className="px-2 py-1 text-xs font-sans text-slate-400 font-bold uppercase tracking-wider">Pacing Peta</span>
                {[
                  { speed: 1, label: '1x (Realistis)' },
                  { speed: 5, label: '5x (Taktis)' },
                  { speed: 15, label: '15x (Cepat)' },
                ].map(({ speed, label }) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => {
                      setSimSpeed(speed);
                      setActivePopover(null);
                    }}
                    className={`cursor-pointer w-full px-3 py-1.5 rounded-md font-sans text-xs font-medium transition flex items-center justify-between ${
                      simSpeed === speed
                        ? 'bg-cyan-500 text-[#080d14] font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span>{label}</span>
                    {simSpeed === speed && <Check className="w-3.5 h-3.5 text-[#080d14]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Target Mode Helper Banner */}
      {isClickTargeting && (
        <div className="px-4 py-1.5 rounded-md bg-[#0c1017] border border-amber-500/60 text-xs font-sans text-amber-300 shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <Target className="w-3.5 h-3.5 text-amber-400" />
          <span>Klik lokasi mana saja di peta untuk menargetkan skenario {selectedType.toUpperCase()} ({selectedRadius}km)</span>
        </div>
      )}
    </div>
  );
}
