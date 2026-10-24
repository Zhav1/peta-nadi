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
  Ship,
  Plane,
  Snowflake,
  Sprout,
  Package,
} from 'lucide-react';
import type { CrisisType, Severity, RouteRecommendation } from '@/lib/types';
import { formatNodeDisplay, prettyNodeSlug, resolveNodeDisplayInfo, type NodeDisplayInfo } from '@/lib/formatNode';
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
  /** Pre-resolved display metadata (includes DashboardClient customNodesRef entries). */
  originInfo?: NodeDisplayInfo | null;
  destInfo?: NodeDisplayInfo | null;
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
  selectedCommodity?: string | null;
  onSelectCommodity?: (commodity: string | null) => void;
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
  originInfo = null,
  destInfo = null,
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
  selectedCommodity = null,
  onSelectCommodity,
}: CrisisSimulatorBarProps) {
  const [selectedType, setSelectedType] = useState<CrisisType>('flood');
  const [activePopover, setActivePopover] = useState<'nodes' | 'disruption' | 'radius' | 'speed' | 'cargo' | null>(null);

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

  // Resolve human place names; never surface raw regency-/node-/pin- IDs in the banner.
  const originResolved = originInfo ?? resolveNodeDisplayInfo(originNodeId);
  const destResolved = destInfo ?? resolveNodeDisplayInfo(destNodeId);
  const originName = originNodeId
    ? formatNodeDisplay(originResolved) || prettyNodeSlug(originNodeId)
    : null;
  const destName = destNodeId
    ? formatNodeDisplay(destResolved) || prettyNodeSlug(destNodeId)
    : null;
  const corridorSummary = originName && destName ? `${originName} -> ${destName}` : null;

  // Route provenance: interpolated geometry is explicitly labeled, never shown as a live road.
  const hasOfflineCorridors = activeCorridors.some(
    (route) => typeof route.description === 'string' && /SIMULASI\/OFFLINE/i.test(route.description)
  );
  const corridorProvenance = hasOfflineCorridors
    ? { label: 'SIMULASI/OFFLINE', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40' }
    : activeCorridors.length > 0
      ? { label: 'LIVE', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' }
      : null;

  const corridorToggles: Array<{
    key: 'land' | 'sea' | 'air';
    label: string;
    hint: string;
    icon: React.ReactNode;
    activeClass: string;
  }> = [
    {
      key: 'land',
      label: 'Darat',
      hint: 'Rute langsung',
      icon: <Truck className="w-3.5 h-3.5" />,
      activeClass: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300',
    },
    {
      key: 'sea',
      label: 'Laut',
      hint: 'Ring pulau',
      icon: <Ship className="w-3.5 h-3.5" />,
      activeClass: 'bg-sky-500/15 border-sky-500/50 text-sky-300',
    },
    {
      key: 'air',
      label: 'Udara',
      hint: 'Ring pulau',
      icon: <Plane className="w-3.5 h-3.5" />,
      activeClass: 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300',
    },
  ];

  const effectiveHiddenCount =
    typeof hiddenRouteCount === 'number'
      ? hiddenRouteCount
      : (!corridorVisibility.land ? 1 : 0) +
        (!corridorVisibility.sea ? 1 : 0) +
        (!corridorVisibility.air ? 1 : 0);

  const togglePopover = (popover: 'nodes' | 'disruption' | 'radius' | 'speed' | 'cargo') => {
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
      className={`absolute bottom-16 sm:bottom-20 z-40 flex flex-col items-center gap-2 pointer-events-auto select-none transition-all duration-300 -translate-x-1/2 ${dockPositionClass}`}
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
            data-testid="corridor-summary-pill"
            onClick={() => togglePopover('nodes')}
            className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-sans font-medium transition-all flex items-center gap-2 ${
              originName || destName
                ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                : 'bg-[#121822] border-[#1c2432] text-slate-300 hover:border-slate-600'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span className="max-w-[240px] truncate" title={corridorSummary || originName || destName || undefined}>
              {originName ? (destName ? `${originName} -> ${destName}` : `Start: ${originName}`) : 'Rute Asal & Tujuan'}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'nodes' ? 'rotate-180' : ''}`} />
          </button>

          {/* Node Selector Popover */}
          {activePopover === 'nodes' && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-md bg-[#0c1017] border border-[#1c2432] shadow-xl flex flex-col gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-sans text-cyan-400 font-bold">TITIK RUTE KORIDOR</span>
                {corridorProvenance && (
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold tracking-wide ${corridorProvenance.className}`}
                    title={
                      corridorProvenance.label === 'SIMULASI/OFFLINE'
                        ? 'Geometri hasil interpolasi garis lurus, bukan jalan raya live'
                        : 'Geometri rute live dari Mapbox Directions'
                    }
                  >
                    {corridorProvenance.label}
                  </span>
                )}
              </div>

              <div className="p-2 rounded-md bg-[#121822] border border-[#1c2432] flex flex-col gap-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-slate-400 font-sans text-[10px] block">Start</span>
                    <span className="text-white font-bold block break-words">{originName || 'Klik kota di peta...'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-slate-400 font-sans text-[10px] block">End</span>
                    <span className="text-white font-bold block break-words">{destName || 'Klik kota di peta...'}</span>
                  </div>
                </div>
                {(originResolved?.province || destResolved?.province) && (
                  <span className="text-[10px] text-slate-500 font-sans">
                    {[originResolved?.province, destResolved?.province].filter(Boolean).join(' → ')}
                  </span>
                )}
              </div>

              {onToggleCorridor && (
                <div className="border-t border-[#1c2432] pt-2 flex flex-col gap-1.5">
                  <span className="text-[10px] font-sans text-slate-400 font-bold uppercase tracking-wider">
                    Visibilitas Koridor
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {corridorToggles.map((toggle) => {
                      const isVisible = corridorVisibility[toggle.key];
                      return (
                        <button
                          key={toggle.key}
                          type="button"
                          onClick={() => onToggleCorridor(toggle.key)}
                          aria-pressed={isVisible}
                          title={`${toggle.label} — ${toggle.hint}`}
                          className={`cursor-pointer px-1.5 py-1.5 rounded border text-[10px] font-sans font-medium transition flex flex-col items-center gap-0.5 ${
                            isVisible
                              ? toggle.activeClass
                              : 'bg-[#121822]/60 border-[#1c2432] text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            {toggle.icon}
                            <span>{toggle.label}</span>
                          </span>
                          <span className={`text-[9px] font-mono ${isVisible ? 'opacity-80' : 'opacity-60'}`}>
                            {isVisible ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] leading-tight text-slate-500 font-sans">
                    Darat = rute langsung (garis penuh). Laut &amp; udara = ring pulau (warna biru/cyan).
                  </span>
                </div>
              )}

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

        {/* 2.5 Cargo Preset Selector (Pelindo Cold-Chain vs Horti vs Dry-Bulk) */}
        {onSelectCommodity && (
          <div className="relative">
            <button
              type="button"
              data-testid="cargo-tier-pill"
              onClick={() => togglePopover('cargo')}
              className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-sans font-medium transition-all flex items-center gap-1.5 ${
                selectedCommodity
                  ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                  : 'bg-[#121822] border-[#1c2432] text-slate-300 hover:border-slate-600'
              }`}
              title="Pilih Tier Komoditas Kargo untuk Kalkulasi Hedging & Biaya Genset"
            >
              {selectedCommodity === 'ikan_segar' ? (
                <>
                  <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cold Chain</span>
                </>
              ) : selectedCommodity === 'cabai_merah' ? (
                <>
                  <Sprout className="w-3.5 h-3.5 text-rose-400" />
                  <span>Hortikultura</span>
                </>
              ) : selectedCommodity === 'beras' ? (
                <>
                  <Package className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kargo Kering</span>
                </>
              ) : (
                <>
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  <span>Pilih Kargo</span>
                </>
              )}
              <span className="font-mono text-[10px] opacity-75">(10T)</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'cargo' ? 'rotate-180' : ''}`} />
            </button>

            {/* Cargo Popover */}
            {activePopover === 'cargo' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 rounded-lg bg-[#0c1017] border border-[#1c2432] shadow-2xl flex flex-col gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 text-left">
                <div className="flex items-center justify-between pb-1 border-b border-[#1c2432]">
                  <span className="text-xs font-sans text-cyan-400 font-bold uppercase tracking-wider">Tier Kargo &amp; Hedging</span>
                  <span className="text-[10px] font-mono text-slate-400">10.0 Ton · GOL II</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    {
                      id: 'ikan_segar',
                      label: 'Cold Chain',
                      sub: 'Ikan Segar / Frozen Daging',
                      desc: 'Reefer genset Rp 45.000/jam aktif pada delay & detour',
                      icon: <Snowflake className="w-4 h-4 text-cyan-400 shrink-0" />,
                      activeBorder: 'border-cyan-500/60 bg-cyan-950/40 text-cyan-200',
                    },
                    {
                      id: 'cabai_merah',
                      label: 'Hortikultura',
                      sub: 'Cabai Merah / Sayur Mayur',
                      desc: 'Ultra-perishable (susut 2.5%/jam), tanpa genset',
                      icon: <Sprout className="w-4 h-4 text-rose-400 shrink-0" />,
                      activeBorder: 'border-rose-500/60 bg-rose-950/40 text-rose-200',
                    },
                    {
                      id: 'beras',
                      label: 'Kargo Kering',
                      sub: 'Beras Medium / Sembako Kering',
                      desc: 'Daya simpan tinggi, Rp 0 genset, susut minimal',
                      icon: <Package className="w-4 h-4 text-amber-400 shrink-0" />,
                      activeBorder: 'border-amber-500/60 bg-amber-950/40 text-amber-200',
                    },
                  ].map((tier) => {
                    const isSelected = selectedCommodity === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => {
                          onSelectCommodity(isSelected ? null : tier.id);
                          setActivePopover(null);
                        }}
                        className={`cursor-pointer p-2.5 rounded-md text-left transition flex items-start gap-2.5 border ${
                          isSelected
                            ? tier.activeBorder
                            : 'bg-[#121822] border-[#1c2432] text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="mt-0.5">{tier.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white font-sans">{tier.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                          </div>
                          <span className="text-[11px] text-slate-400 block font-sans">{tier.sub}</span>
                          <span className="text-[10px] text-slate-500 block font-mono mt-0.5">{tier.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedCommodity && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCommodity(null);
                      setActivePopover(null);
                    }}
                    className="cursor-pointer w-full py-1.5 mt-1 rounded bg-[#121822] hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-sans font-medium flex items-center justify-center gap-1.5 transition border border-[#1c2432]"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-400" />
                    <span>Reset Kargo (Tanpa Hedging)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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
