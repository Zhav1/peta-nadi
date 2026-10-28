'use client';

import React, { useState } from 'react';
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
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from '@/components/base-ui/popover';

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
  /** Fixed telemetry playback speed (hardcoded 1x); kept for prop plumbing. */
  simSpeed?: number;
  /** No-op retained for prop plumbing; speed control was removed (fixed 1x). */
  setSimSpeed?: (speed: number) => void;
  selectedCommodity?: string | null;
  onSelectCommodity?: (commodity: string | null) => void;
  /** True while the simulator target/polygon tools are armed. Manual 5/8/15
   *  pills render ONLY in this mode; otherwise the live-zone Auto badge shows. */
  isSimulatorArmed?: boolean;
  /** Backend-derived live zone radius (zoneGeom.radiusKm / agentRadiusKm). */
  autoRadiusKm?: number | null;
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
  isSimulatorArmed = false,
  autoRadiusKm = null,
}: CrisisSimulatorBarProps) {
  const [selectedType, setSelectedType] = useState<CrisisType>('flood');
  const [activePopover, setActivePopover] = useState<'nodes' | 'disruption' | 'radius' | 'cargo' | null>(null);
  // Speed is fixed at 1x — the prop is plumbing only; never surfaces a control.
  void simSpeed;
  void setSimSpeed;


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
 (route) => typeof route.description === 'string' && /simulasi/i.test(route.description)
  );
  const corridorProvenance = hasOfflineCorridors
 ? { label: 'Simulasi', className: 'text-slate-400' }
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

  const dockPositionClass = resolveMapDockClasses({
    isLeftSidebarCollapsed,
    isCrisisDrawerOpen: isSidebarOpen,
  });
 const pillsRowClass = `flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#0c1017] border border-white/10 shadow-2xl w-fit max-w-[calc(100vw-1.5rem)] transition-all duration-200 md:flex-nowrap md:w-auto ${
 isSidebarOpen ? 'md:justify-center' : ''
  }`;

  return (
    <div
 className={`absolute bottom-16 sm:bottom-20 z-40 ${isLeftSidebarCollapsed ? 'flex' : 'hidden md:flex'} flex-col items-center gap-2 pointer-events-auto select-none transition-all duration-300 ${dockPositionClass}`}
    >
      {/* Floating Action Bubble Pills Row */}
      <div className={pillsRowClass} data-testid="map-dock">
        {/* Reset Hidden Corridors Pill (shows only when user has hidden any route corridors on map) */}
        {effectiveHiddenCount > 0 && (
          <button
            type="button"
            onClick={() => onResetCorridorVisibility?.()}
 className="cursor-pointer px-3 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-sans font-medium transition-all duration-200 flex items-center gap-1.5 shadow-sm"
            title="Tampilkan kembali seluruh koridor rute yang disembunyikan"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
 <span>Tampil semua <span className="tabular-nums">({effectiveHiddenCount})</span></span>
          </button>
        )}

 {/* 2. Node Selector */}
 <Popover
 open={activePopover === 'nodes'}
 onOpenChange={(open) => setActivePopover(open ? 'nodes' : null)}
 >
 <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="corridor-summary-pill"
            className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-sans font-medium transition-all flex items-center gap-2 ${
              originName || destName
                ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
 : 'bg-[#121822] border-white/10 text-slate-300 hover:border-slate-600'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span className="max-w-[240px] truncate" title={corridorSummary || originName || destName || undefined}>
 {originName ? (destName ? `${originName} -> ${destName}` : `Asal: ${originName}`) : 'Rute'}
            </span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'nodes' ? 'rotate-180' : ''}`} />
          </button>
 </PopoverTrigger>
 <PopoverContent
 side="top"
 align="center"
 sideOffset={8}
 collisionPadding={12}
 className="w-72 max-w-[calc(100vw-32px)] flex flex-col gap-2"
 >
              <div className="flex items-center justify-between gap-2">
 <span className="text-xs text-cyan-400">Rute</span>
                {corridorProvenance && (
                  <span
 className={`text-xs ${corridorProvenance.className}`}
                    title={
 corridorProvenance.label === 'Simulasi'
                        ? 'Geometri hasil interpolasi garis lurus, bukan jalan raya live'
                        : 'Geometri rute live dari Mapbox Directions'
                    }
                  >
                    {corridorProvenance.label}
                  </span>
                )}
              </div>

 <div className="py-2 border-t border-white/10 flex flex-col gap-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <div className="min-w-0">
 <span className="text-slate-400 text-xs block">Asal</span>
                    <span className="text-white font-bold block break-words">{originName || 'Klik kota di peta...'}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <div className="min-w-0">
 <span className="text-slate-400 text-xs block">Tujuan</span>
                    <span className="text-white font-bold block break-words">{destName || 'Klik kota di peta...'}</span>
                  </div>
                </div>
                {(originResolved?.province || destResolved?.province) && (
 <span className="text-xs text-slate-500 font-sans">
                    {[originResolved?.province, destResolved?.province].filter(Boolean).join(' → ')}
                  </span>
                )}
              </div>

              {onToggleCorridor && (
 <div className="border-t border-white/10 pt-2 flex flex-col gap-1.5">
 <span className="text-xs text-slate-400">
 Koridor
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
 className={`cursor-pointer px-1.5 py-1.5 rounded border text-xs font-sans font-medium transition flex flex-col items-center gap-0.5 ${
                            isVisible
                              ? toggle.activeClass
 : 'bg-transparent border-white/10 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            {toggle.icon}
                            <span>{toggle.label}</span>
                          </span>
 <span className={`text-xs font-mono tabular-nums ${isVisible ? 'opacity-80' : 'opacity-60'}`}>
                            {isVisible ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
 <span className="text-xs leading-tight text-slate-500 font-sans">
 Darat langsung, laut/udara ring.
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
 className="cursor-pointer w-full py-1.5 rounded-md hover:bg-white/5 text-slate-200 text-xs font-sans font-medium flex items-center justify-center gap-1.5 transition border border-white/10"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
 <span>Reset titik</span>
                </button>
              )}
 </PopoverContent>
 </Popover>

        {/* 2.5 Cargo Preset Selector (Pelindo Cold-Chain vs Horti vs Dry-Bulk) */}
        {onSelectCommodity && (
          <Popover
            open={activePopover === 'cargo'}
            onOpenChange={(open) => setActivePopover(open ? 'cargo' : null)}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid="cargo-tier-pill"
                className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-sans font-medium transition-all flex items-center gap-1.5 ${
                  selectedCommodity
                    ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                    : 'bg-transparent border-white/10 text-slate-300 hover:border-white/25'
                }`}
                title="Pilih kargo"
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
                <span className="font-mono text-xs tabular-nums opacity-75">(10T)</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'cargo' ? 'rotate-180' : ''}`} />
              </button>
            </PopoverTrigger>

            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              collisionPadding={12}
              className="w-80 max-w-[calc(100vw-32px)] p-3 rounded-lg bg-[#0c1017] border border-white/10 shadow-2xl flex flex-col gap-2 z-50 text-left"
            >
              <div className="flex items-center justify-between pb-1 border-b border-white/10">
                <span className="text-xs font-sans text-slate-200 font-medium">Tier kargo</span>
                <span className="text-xs font-mono text-slate-400 tabular-nums">10 Ton</span>
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
                          : 'bg-transparent border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="mt-0.5">{tier.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white font-sans">{tier.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </div>
                        <span className="text-xs text-slate-400 block font-sans">{tier.sub}</span>
                        <span className="text-xs text-slate-500 block font-mono tabular-nums mt-0.5">{tier.desc}</span>
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
                  className="cursor-pointer w-full py-1.5 mt-1 rounded bg-transparent hover:bg-white/5 text-slate-400 hover:text-slate-200 text-xs font-sans font-medium flex items-center justify-center gap-1.5 transition border border-white/10"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400" />
                  <span>Reset kargo</span>
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* 3. Disruption Presets & Tools Bubble Pill */}
 <Popover
 open={activePopover === 'disruption'}
 onOpenChange={(open) => setActivePopover(open ? 'disruption' : null)}
 >
 <PopoverTrigger asChild>
          <button
            type="button"
            className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-sans font-medium transition-all flex items-center gap-2 ${
              isClickTargeting || drawModeActive || simulationActive
                ? 'bg-amber-950/90 border-amber-500/60 text-amber-300'
 : 'bg-[#121822] border-white/10 text-slate-300 hover:border-slate-600'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>{isClickTargeting ? 'Set Hazard...' : drawModeActive ? 'Gambar Poligon...' : 'Simulasi Bencana'}</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'disruption' ? 'rotate-180' : ''}`} />
          </button>
 </PopoverTrigger>
 <PopoverContent
 side="top"
 align="center"
 sideOffset={8}
 collisionPadding={12}
 className="w-72 max-w-[calc(100vw-32px)] flex flex-col gap-2.5 text-left"
 >
 <span className="text-xs text-amber-400">Skenario</span>
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
 : 'hover:bg-white/5 text-slate-300'
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
 <span className="text-xs text-slate-400">Alat</span>
                
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
 : 'bg-transparent text-slate-300 border border-white/10 hover:bg-white/5'
                  }`}
                >
                  <PenTool className={`w-4 h-4 ${drawModeActive ? 'text-amber-950' : 'text-amber-400'}`} />
 <span>Poligon bebas</span>
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
 <span>Hapus simulasi</span>
                  </button>
                )}
              </div>
 </PopoverContent>
 </Popover>

 {/* 4. Radius Selector — manual pills ONLY while simulator target/polygon
     tools are armed; live zone inspect shows the Auto badge from backend
     geometry (zoneGeom.radiusKm / agentRadiusKm), 8km fallback. */}
 {!isSimulatorArmed ? (
   <span
     data-testid="radius-auto-badge"
     title="Radius zona live dari geometri backend (Auto)"
     className="px-3 py-1.5 rounded-md bg-cyan-950/60 border border-cyan-500/40 text-xs font-sans font-medium text-cyan-300 flex items-center gap-1.5"
   >
     <Sliders className="w-3.5 h-3.5 text-cyan-400" />
     <span>Auto</span>
     <span className="font-mono tabular-nums">
       {(autoRadiusKm ?? selectedRadius ?? 8).toFixed(1)}km
     </span>
   </span>
 ) : (
 <Popover
 open={activePopover === 'radius'}
 onOpenChange={(open) => setActivePopover(open ? 'radius' : null)}
 >
 <PopoverTrigger asChild>
          <button
            type="button"
 className="cursor-pointer px-3 py-1.5 rounded-md bg-[#121822] border border-white/10 text-xs font-sans font-medium text-slate-300 hover:border-slate-600 transition-all flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
 <span className="font-mono tabular-nums">{selectedRadius}km</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${activePopover === 'radius' ? 'rotate-180' : ''}`} />
          </button>
 </PopoverTrigger>
 <PopoverContent
 side="top"
 align="end"
 sideOffset={8}
 collisionPadding={12}
 className="w-36 flex flex-col gap-1 p-2"
 >
 <span className="px-2 py-1 text-xs text-slate-400">Radius</span>
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
 : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
 <span className="tabular-nums">{r} km</span>
                  {selectedRadius === r && <Check className="w-3.5 h-3.5 text-[#080d14]" />}
                </button>
              ))}
 </PopoverContent>
 </Popover>
 )}

      </div>

      {/* Target Mode Helper Banner */}
      {isClickTargeting && (
 <div className="px-4 py-1.5 rounded-md bg-[#0c1017] border border-amber-500/60 text-xs font-sans text-amber-300 shadow-xl flex items-center gap-2 slide-in-from-top-1 duration-200">
          <Target className="w-3.5 h-3.5 text-amber-400" />
 <span>Klik lokasi mana saja di peta untuk menargetkan skenario {hazardOptions.find((h) => h.type === selectedType)?.label ?? selectedType} (<span className="tabular-nums">{selectedRadius}km</span>)</span>
        </div>
      )}
    </div>
  );
}
