'use client';

import React from 'react';
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
  selectedModality,
  setSelectedModality,
  onResetNodes,
}: CrisisSimulatorBarProps) {
  const [selectedType, setSelectedType] = React.useState<CrisisType>('flood');

  const hazardOptions: Array<{ type: CrisisType; label: string; icon: string }> = [
    { type: 'flood', label: 'Banjir', icon: '🌊' },
    { type: 'port_closure', label: 'Pelabuhan Belawan', icon: '⚓' },
    { type: 'congestion', label: 'Macet Jalinsum', icon: '🚛' },
    { type: 'wildfire', label: 'Titik Panas', icon: '🔥' },
    { type: 'earthquake', label: 'Gempa', icon: '🌋' },
  ];

  const originName = originNodeId ? HUB_NODES[originNodeId]?.name || originNodeId : null;
  const destName = destNodeId ? HUB_NODES[destNodeId]?.name || destNodeId : null;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-auto">
      {/* Sleek Minimalist Glassmorphic Control Bar */}
      <div className="px-4 py-2 rounded-2xl bg-[#080d14]/90 border border-cyan-500/30 backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.15)] flex items-center gap-3 text-xs">
        
        {/* Title Badge */}
        <div className="flex items-center gap-1.5 border-r border-slate-800 pr-3">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-headline font-bold uppercase tracking-wider text-cyan-400 text-[10px]">
            SIMULATOR INTERAKTIF
          </span>
        </div>

        {/* Google Maps Style Modality Selection Bar with (Best) Auto Recommendation */}
        {setSelectedModality && (
          <div className="flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-cyan-500/30 font-mono text-[10px]">
            {[
              { mode: 'best', label: '🌟 Best', icon: '' },
              { mode: 'truck', label: 'Truk', icon: '🚚' },
              { mode: 'maritime', label: 'Kapal', icon: '⚓' },
              { mode: 'air', label: 'Udara', icon: '✈️' },
            ].map((m) => {
              const active = (selectedModality || 'best') === m.mode;
              return (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => setSelectedModality(m.mode as TransportModality)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition flex items-center gap-1 ${
                    active
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.icon && <span>{m.icon}</span>}
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Dynamic Clean Slate Node Selection Status Indicator */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1 rounded-xl border border-slate-800 font-mono text-[10px]">
          {!originName ? (
            <span className="text-cyan-400 font-bold animate-pulse">
              🟢 KLIK MARKER KOTA 1 UNTUK SET START
            </span>
          ) : !destName ? (
            <>
              <span className="text-cyan-400 font-bold">🟢 START: {originName}</span>
              <span className="text-slate-500">➔</span>
              <span className="text-amber-400 font-bold animate-pulse">
                🟡 KLIK MARKER KOTA 2 UNTUK SET END
              </span>
            </>
          ) : (
            <>
              <span className="text-cyan-400 font-bold">🟢 START: {originName}</span>
              <span className="text-slate-500">➔</span>
              <span className="text-amber-400 font-bold">🟡 END: {destName}</span>
            </>
          )}

          {onResetNodes && (originName || destName) && (
            <button
              type="button"
              onClick={onResetNodes}
              className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-bold transition"
              title="Reset pilihan titik Asal & Tujuan"
            >
              🔄 RESET
            </button>
          )}
        </div>

        {/* Hazard Selector Buttons */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          {hazardOptions.map((h) => (
            <button
              key={h.type}
              type="button"
              onClick={() => setSelectedType(h.type)}
              className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-bold transition flex items-center gap-1 ${
                selectedType === h.type
                  ? 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <span>{h.icon}</span>
              <span>{h.label}</span>
            </button>
          ))}
        </div>

        {/* Radius Selector */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          <span className="text-[9px] font-mono text-slate-500 px-1">RADIUS:</span>
          {[5, 15, 30].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelectedRadius(r)}
              className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold transition ${
                selectedRadius === r
                  ? 'bg-slate-200 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {r}km
            </button>
          ))}
        </div>

        {/* Game-Like Target Click Button */}
        <button
          type="button"
          onClick={() => {
            setIsClickTargeting(!isClickTargeting);
            if (drawModeActive) setDrawModeActive(false);
          }}
          className={`px-3.5 py-1.5 rounded-xl font-headline font-bold uppercase tracking-wider text-[10px] transition flex items-center gap-1.5 ${
            isClickTargeting
              ? 'bg-amber-500 text-slate-950 animate-pulse shadow-lg shadow-amber-500/20'
              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
          }`}
        >
          <span>🎯</span>
          <span>{isClickTargeting ? 'KLIK KOTA DI PETA...' : 'SET HAZARD'}</span>
        </button>

        {/* Freehand Draw Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            setDrawModeActive(!drawModeActive);
            if (isClickTargeting) setIsClickTargeting(false);
          }}
          className={`px-3 py-1.5 rounded-xl font-headline font-bold uppercase tracking-wider text-[10px] transition flex items-center gap-1 ${
            drawModeActive
              ? 'bg-orange-500 text-slate-950 shadow-lg shadow-orange-500/20'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <span>✏️</span>
          <span>GAMBAR AREA</span>
        </button>

        {/* 1-Click Clear Simulation Button */}
        {(simulationActive || drawModeActive) && (
          <button
            type="button"
            onClick={onClearSimulation}
            className="px-3 py-1.5 rounded-xl font-headline font-bold uppercase tracking-wider text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/40 transition flex items-center gap-1"
          >
            <span>🧹</span>
            <span>HAPUS AREA</span>
          </button>
        )}
      </div>

      {/* Targeting Helper Message */}
      {isClickTargeting && (
        <div className="px-4 py-1.5 rounded-full bg-amber-950/90 border border-amber-500/60 backdrop-blur-md text-[10px] font-mono text-amber-300 animate-in fade-in slide-in-from-top-1 duration-200">
          🎯 Sasar kota/titik di peta untuk memicu {selectedType.toUpperCase()} ({selectedRadius}km - {selectedModality?.toUpperCase() || 'AUTO'}) pada rute {originName || 'START'} ➔ {destName || 'END'}
        </div>
      )}
    </div>
  );
}
