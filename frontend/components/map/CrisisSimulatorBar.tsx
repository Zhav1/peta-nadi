'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Truck,
  Ship,
  Plane,
  ChevronDown,
  MapPin,
  RotateCcw,
  AlertTriangle,
  CloudRain,
  Anchor,
  Flame,
  Activity,
  Mountain,
  Target,
  PenTool,
  Trash2,
  Sliders,
  Check,
} from 'lucide-react';
import type { CrisisType, Severity } from '@/lib/types';
import { HUB_NODES } from '@/lib/mapboxRoutingService';
import type { TransportModality } from '@/lib/aiDynamicRouter';

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
  onResetNodes?: () => void;
  isSidebarOpen?: boolean;
  isLeftSidebarCollapsed?: boolean;
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
  onResetNodes,
  isSidebarOpen = false,
  isLeftSidebarCollapsed = false,
}: CrisisSimulatorBarProps) {
  const [selectedType, setSelectedType] = useState<CrisisType>('flood');
  const [activePopover, setActivePopover] = useState<'modality' | 'nodes' | 'disruption' | 'radius' | null>(null);

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
    { type: 'flood', label: 'Banjir Belawan', icon: <CloudRain className="w-3.5 h-3.5 text-cyan-400" /> },
    { type: 'port_closure', label: 'Pelabuhan Belawan', icon: <Anchor className="w-3.5 h-3.5 text-amber-400" /> },
    { type: 'congestion', label: 'Macet Jalinsum', icon: <Truck className="w-3.5 h-3.5 text-yellow-400" /> },
    { type: 'wildfire', label: 'Titik Panas', icon: <Flame className="w-3.5 h-3.5 text-orange-400" /> },
    { type: 'earthquake', label: 'Gempa Tektonik', icon: <Activity className="w-3.5 h-3.5 text-red-400" /> },
    { type: 'landslide', label: 'Longsor Berastagi', icon: <Mountain className="w-3.5 h-3.5 text-emerald-400" /> },
  ];


  const originName = originNodeId ? HUB_NODES[originNodeId]?.name || originNodeId : null;
  const destName = destNodeId ? HUB_NODES[destNodeId]?.name || destNodeId : null;

  const modalityIcons: Record<string, React.ReactNode> = {
    best: <Sparkles className="w-3.5 h-3.5 text-cyan-400" />,
    truck: <Truck className="w-3.5 h-3.5 text-emerald-400" />,
    maritime: <Ship className="w-3.5 h-3.5 text-blue-400" />,
    air: <Plane className="w-3.5 h-3.5 text-purple-400" />,
  };

  const togglePopover = (popover: 'modality' | 'nodes' | 'disruption' | 'radius') => {
    setActivePopover((prev) => (prev === popover ? null : popover));
  };

  const isLeftOpen = !isLeftSidebarCollapsed;
  const isRightOpen = isSidebarOpen;
  const positionClass = isLeftOpen && isRightOpen
    ? 'left-[calc(50%-30px)] -translate-x-1/2'
    : isLeftOpen && !isRightOpen
    ? 'left-[calc(50%+160px)] -translate-x-1/2'
    : !isLeftOpen && isRightOpen
    ? 'left-[calc(50%-190px)] -translate-x-1/2'
    : 'left-1/2 -translate-x-1/2';

  return (
    <div
      ref={containerRef}
      className={`absolute bottom-20 z-40 flex flex-col items-center gap-2 pointer-events-auto select-none transition-all duration-300 ${positionClass}`}
    >
      {/* Floating Action Bubble Pills Row */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[#080d14]/90 border border-white/10 backdrop-blur-xl shadow-2xl">
        
        {/* 1. Modality Bubble Pill */}
        {setSelectedModality && (
          <div className="relative">
            <button
              type="button"
              onClick={() => togglePopover('modality')}
              className="cursor-pointer px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-cyan-500/30 text-xs font-mono font-bold text-slate-200 hover:border-cyan-400 hover:bg-slate-800 transition-all flex items-center gap-2 shadow-md"
            >
              {modalityIcons[selectedModality] || modalityIcons.best}
              <span className="capitalize">{selectedModality === 'best' ? 'Best Mode' : selectedModality}</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'modality' ? 'rotate-180' : ''}`} />
            </button>

            {/* Modality Dropdown Popover */}
            {activePopover === 'modality' && (
              <div className="absolute bottom-full left-0 mb-2 w-48 p-2 rounded-2xl bg-[#0c0e12]/95 border border-white/10 backdrop-blur-2xl shadow-2xl flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <span className="px-2 py-1 text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold">PILIH MODALITAS DISTRIBUTION</span>
                {[
                  { mode: 'best', label: '🌟 Best Auto', desc: 'Sistem AI Otomatis', icon: <Sparkles className="w-4 h-4 text-cyan-400" /> },
                  { mode: 'truck', label: 'Truk Logistik', desc: 'Jalur Darat / Tol', icon: <Truck className="w-4 h-4 text-emerald-400" /> },
                  { mode: 'maritime', label: 'Kapal Laut', desc: 'Pelabuhan Belawan', icon: <Ship className="w-4 h-4 text-blue-400" /> },
                  { mode: 'air', label: 'Cargo Udara', desc: 'Bandara Kualanamu', icon: <Plane className="w-4 h-4 text-purple-400" /> },
                ].map((m) => {
                  const active = selectedModality === m.mode;
                  return (
                    <button
                      key={m.mode}
                      type="button"
                      onClick={() => {
                        setSelectedModality(m.mode as TransportModality);
                        setActivePopover(null);
                      }}
                      className={`cursor-pointer w-full p-2 rounded-xl text-left font-mono transition flex items-center justify-between ${
                        active ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {m.icon}
                        <div className="flex flex-col">
                          <span className="text-xs font-bold">{m.label}</span>
                          <span className="text-[9px] text-slate-400">{m.desc}</span>
                        </div>
                      </div>
                      {active && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. Node Selector Bubble Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => togglePopover('nodes')}
            className={`cursor-pointer px-3.5 py-1.5 rounded-full border text-xs font-mono font-bold transition-all flex items-center gap-2 shadow-md ${
              originName || destName
                ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {originName ? (destName ? `${originName} ➔ ${destName}` : `Start: ${originName}`) : 'Rute Asal & Tujuan'}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'nodes' ? 'rotate-180' : ''}`} />
          </button>

          {/* Node Selector Popover */}
          {activePopover === 'nodes' && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-2xl bg-[#0c0e12]/95 border border-white/10 backdrop-blur-2xl shadow-2xl flex flex-col gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider font-bold">TITIK RUTE KORIDOR</span>
              <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-1 text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-slate-400">Start:</span>
                  <span className="text-white font-bold">{originName || 'Klik kota di peta...'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-slate-400">End:</span>
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
                  className="cursor-pointer w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition"
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
            className={`cursor-pointer px-3.5 py-1.5 rounded-full border text-xs font-mono font-bold transition-all flex items-center gap-2 shadow-md ${
              isClickTargeting || drawModeActive || simulationActive
                ? 'bg-amber-950/90 border-amber-500/60 text-amber-300 ring-2 ring-amber-500/20'
                : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-amber-500/50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>{isClickTargeting ? 'Set Hazard...' : drawModeActive ? 'Gambar Poligon...' : 'Simulasi Bencana'}</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'disruption' ? 'rotate-180' : ''}`} />
          </button>

          {/* Disruption Popover */}
          {activePopover === 'disruption' && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-2xl bg-[#0c0e12]/95 border border-white/10 backdrop-blur-2xl shadow-2xl flex flex-col gap-2.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 text-left">
              <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider font-bold">PRESET SKENARIO CRISIS</span>
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
                    className={`cursor-pointer p-2 rounded-xl text-left font-mono text-xs font-bold transition flex items-center justify-between ${
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

              <div className="border-t border-white/10 pt-2 flex flex-col gap-1.5">
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider font-bold">MODES & ALAT MANUVER</span>
                
                {/* Freehand Draw Mode Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setDrawModeActive(!drawModeActive);
                    if (isClickTargeting) setIsClickTargeting(false);
                    setActivePopover(null);
                  }}
                  className={`cursor-pointer w-full p-2 rounded-xl font-mono text-xs font-bold transition flex items-center gap-2 ${
                    drawModeActive
                      ? 'bg-orange-500 text-slate-950 shadow-lg shadow-orange-500/20'
                      : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <PenTool className="w-4 h-4 text-orange-400" />
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
                    className="cursor-pointer w-full p-2 rounded-xl font-mono text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/40 transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
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
            className="cursor-pointer px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700 text-xs font-mono font-bold text-slate-300 hover:border-slate-500 transition-all flex items-center gap-1.5 shadow-md"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span>{selectedRadius}km</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'radius' ? 'rotate-180' : ''}`} />
          </button>

          {/* Radius Popover */}
          {activePopover === 'radius' && (
            <div className="absolute bottom-full right-0 mb-2 w-36 p-2 rounded-2xl bg-[#0c0e12]/95 border border-white/10 backdrop-blur-2xl shadow-2xl flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <span className="px-2 py-1 text-[9px] font-mono text-slate-400 uppercase tracking-wider font-bold">RADIUS BAHAYA</span>
              {[5, 15, 30].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setSelectedRadius(r);
                    setActivePopover(null);
                  }}
                  className={`cursor-pointer w-full px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition flex items-center justify-between ${
                    selectedRadius === r
                      ? 'bg-slate-200 text-slate-950'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span>{r} kilometer</span>
                  {selectedRadius === r && <Check className="w-3.5 h-3.5 text-slate-950" />}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Target Mode Helper Banner */}
      {isClickTargeting && (
        <div className="px-4 py-1.5 rounded-full bg-amber-950/90 border border-amber-500/60 backdrop-blur-md text-[10px] font-mono text-amber-300 shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <Target className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Klik lokasi mana saja di peta untuk menargetkan skenario {selectedType.toUpperCase()} ({selectedRadius}km)</span>
        </div>
      )}
    </div>
  );
}
