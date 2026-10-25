'use client';

import React, { useState } from 'react';
import { Zap, Truck, CloudRain, ChevronDown } from 'lucide-react';
import { IntermodalTerminalPopover } from '@/components/dashboard/IntermodalTerminalPopover';
import type { ChokePointItem } from '@/lib/types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/base-ui/popover';

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
 // Disruption-only: Cuaca = high/critical biru (default ON); Advisori = medium ungu (default OFF).
 showWeatherPolygons?: boolean;
 onToggleWeatherPolygons?: () => void;
 weatherPolygonCount?: number;
 showWeatherAdvisory?: boolean;
 onToggleWeatherAdvisory?: () => void;
 weatherAdvisoryCount?: number;
 weatherDisruptionCount?: number;
 showFireHotspots?: boolean;
 onToggleFireHotspots?: () => void;
 fireHotspotCount?: number;
 fireStatus?: 'ok' | 'degraded';
 fireTooltip?: string;
 onSelectHub?: (hub: ChokePointItem) => void;
 onFocusRoute?: () => void;
 /** Dispatch-enriched sample from the top blue disruption polygon (hazard/corridor/delay/action/modalities/confidence). */
 weatherSample?: {
 hazard_type?: string;
 corridor_id?: string;
 corridor_segment?: string;
 dist_to_corridor_km?: number | string;
 delay_hours?: number | string;
 advisory_action?: string;
 affected_modalities?: string[] | string;
 confidence?: number | string;
 observed_vs_forecast?: string;
 severity?: string;
 } | null;
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
 showWeatherAdvisory = false,
 onToggleWeatherAdvisory,
 weatherAdvisoryCount = 0,
 weatherDisruptionCount,
 showFireHotspots = true,
 onToggleFireHotspots,
 fireHotspotCount = 0,
 fireStatus = 'ok',
 fireTooltip,
 onSelectHub,
 onFocusRoute,
 weatherSample = null,
}) => {
 const solverStats = routingInfo;
 const bmkgRainfall = corridorContext?.weather?.rainfall_mm;
 const tomtomDelayMin = corridorContext?.traffic?.delay_minutes;
 const tomtomIndex = corridorContext?.traffic?.congestion_level_pct;

 const [activePopover, setActivePopover] = useState<ActivePopover>('NONE');

 const togglePopover = (target: ActivePopover) => {
 setActivePopover((prev) => (prev === target ? 'NONE' : target));
 };

 return (
 <div
 data-slot="tactical-command-ribbon"
 className="relative flex items-center gap-1.5 p-1 rounded-xl bg-[#0c1017]/90 border border-white/10 shadow-2xl backdrop-blur-md text-xs font-mono select-none overflow-x-auto no-scrollbar max-w-[calc(100vw-28rem)]"
 >
 {/* 1. Routing Compute Latency */}
 <Popover
 open={activePopover === 'RUTE'}
 onOpenChange={(open) => setActivePopover(open ? 'RUTE' : 'NONE')}
 >
 <PopoverTrigger asChild>
 <button
 type="button"
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-colors duration-150 shrink-0 ${
 activePopover === 'RUTE'
 ? 'bg-[#121822] border-cyan-500/50 text-cyan-300 ring-1 ring-cyan-500/30'
 : 'bg-white/5 border-white/5 text-emerald-400 hover:bg-white/10 hover:border-white/20'
 }`}
 title="Latensi solver optimasi rute mitigasi CPU (NetworkX + OR-Tools / 2-Opt)"
 >
 <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
 <span className="tabular-nums">
 Rute {isRoutingLoading ? '...' : solverStats?.compute_time_ms != null ? `${solverStats.compute_time_ms}ms` : '< 15ms'}
 </span>
 <ChevronDown className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-150 ${activePopover === 'RUTE' ? 'rotate-180' : ''}`} />
 </button>
 </PopoverTrigger>
 <PopoverContent
 side="bottom"
 align="start"
 sideOffset={8}
 collisionPadding={12}
 className="w-80 max-w-[calc(100vw-32px)] space-y-3 p-3.5 font-sans"
 >
 <div className="flex items-center gap-2 pb-2.5 border-b border-white/10">
 <div className="p-1.5 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
 <Zap className="w-4 h-4" />
 </div>
 <div>
 <h4 className="text-xs font-semibold text-white font-sans">
 Solver
 </h4>
 <p className="text-xs text-slate-400 font-mono">
 NetworkX + OR-Tools / 2-Opt
 </p>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-2 text-xs font-mono">
 <div className="pt-2 border-t border-white/10">
 <span className="text-slate-400 block text-xs font-sans">Latensi</span>
 <span className="text-sm font-bold text-emerald-400 tabular-nums">
 {isRoutingLoading ? '...' : solverStats?.compute_time_ms != null ? `${solverStats.compute_time_ms} ms` : '< 15 ms'}
 </span>
 <span className="text-xs text-slate-500 block font-sans">
 {isRoutingLoading ? 'Menghitung...' : 'Deterministik'}
 </span>
 </div>

 <div className="pt-2 border-t border-white/10">
 <span className="text-slate-400 block text-xs font-sans">Zona</span>
 <span className="text-sm font-bold text-cyan-400 tabular-nums">
 {redZoneCount} merah
 </span>
 <span className="text-xs text-slate-500 block font-sans">Detour dinamis</span>
 </div>
 </div>

 <div className="pt-2 border-t border-white/10 space-y-1.5 text-xs">
 <div className="flex justify-between items-center text-slate-400">
 <span className="font-sans">Solver:</span>
 <span className="font-mono text-slate-200">OR-Tools 2-Opt CPU</span>
 </div>
 <div className="flex justify-between items-center text-slate-400">
 <span className="font-sans">Baseline:</span>
 <span className="font-mono text-slate-200">ETA adaptif</span>
 </div>
 <div className="flex justify-between items-center text-slate-400 border-t border-white/10 pt-1">
 <span className="font-sans">Garansi:</span>
 <span className="font-mono text-emerald-400 font-semibold">Zero GPU</span>
 </div>
 </div>

 {onFocusRoute && (
 <button
 type="button"
 onClick={() => {
 onFocusRoute();
 setActivePopover('NONE');
 }}
 className="w-full py-1.5 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
 >
 <span>Fokus rute</span>
 </button>
 )}
 </PopoverContent>
 </Popover>

 {/* 2. TomTom Traffic Delay */}
 <Popover
 open={activePopover === 'LALULINTAS'}
 onOpenChange={(open) => setActivePopover(open ? 'LALULINTAS' : 'NONE')}
 >
 <PopoverTrigger asChild>
 <button
 type="button"
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-colors duration-150 shrink-0 ${
 activePopover === 'LALULINTAS'
 ? 'bg-[#121822] border-cyan-500/50 text-cyan-300 ring-1 ring-cyan-500/30'
 : 'bg-white/5 border-white/5 text-amber-400 hover:bg-white/10 hover:border-white/20'
 }`}
 title={tomtomDelayMin != null ? `Pantauan keterlambatan arteri TomTom: +${tomtomDelayMin}m (${tomtomIndex ?? 0}%)` : 'Data lalu lintas TomTom'}
 >
 <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
 {isLoading && !corridorContext ? (
 <span>Lalu lintas ...</span>
 ) : (
 <span className="tabular-nums">Lalu lintas {tomtomDelayMin != null ? `+${tomtomDelayMin}m` : 'Normal'}</span>
 )}
 <ChevronDown className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-150 ${activePopover === 'LALULINTAS' ? 'rotate-180' : ''}`} />
 </button>
 </PopoverTrigger>
 <PopoverContent
 side="bottom"
 align="start"
 sideOffset={8}
 collisionPadding={12}
 className="w-80 max-w-[calc(100vw-32px)] space-y-3 p-3.5 font-sans"
 >
 <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
 <div className="flex items-center gap-2">
 <div className="p-1.5 rounded-lg bg-amber-950/60 text-amber-400 border border-amber-500/30">
 <Truck className="w-4 h-4" />
 </div>
 <div>
 <h4 className="text-xs font-semibold text-white font-sans">
 Lalu lintas
 </h4>
 <p className="text-xs text-slate-400 font-mono">
 Kecepatan koridor
 </p>
 </div>
 </div>
 {corridorContext?.is_fallback ? (
 <span className="flex items-center gap-1.5 text-xs text-slate-400">
 <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
 Fallback
 </span>
 ) : null}
 </div>

 <div className="grid grid-cols-2 gap-2 text-xs font-mono">
 <div className="pt-2 border-t border-white/10">
 <span className="text-slate-400 block text-xs font-sans">Tunda</span>
 <span className="text-sm font-bold text-amber-400 tabular-nums">
 {tomtomDelayMin != null ? `+${tomtomDelayMin} mnt` : '+0 mnt'}
 </span>
 <span className="text-xs text-slate-500 block font-sans">Trans-Sumatra</span>
 </div>

 <div className="pt-2 border-t border-white/10">
 <span className="text-slate-400 block text-xs font-sans">Aliran</span>
 <span className="text-sm font-bold text-slate-200 tabular-nums">
 {corridorContext?.traffic?.flow_speed_kmh ?? 58} km/j
 </span>
 <span className="text-xs text-slate-500 block font-sans tabular-nums">Kongesti {tomtomIndex ?? 12}%</span>
 </div>
 </div>

 <div className="space-y-1.5 text-xs">
 <span className="text-xs font-mono text-slate-400 font-semibold block">
 Jalur
 </span>
 <div className="space-y-1 font-mono text-xs">
 <div className="flex items-center justify-between p-1.5 rounded border-t border-white/10">
 <span className="text-slate-300 truncate max-w-[170px]">Jalinsum Medan–Tebing Tinggi</span>
 <span className="text-emerald-400 font-semibold tabular-nums">68 km/j · Lancar</span>
 </div>
 <div className="flex items-center justify-between p-1.5 rounded border-t border-white/10">
 <span className="text-slate-300 truncate max-w-[170px]">Akses Tol Pelabuhan Belawan</span>
 <span className="text-amber-400 font-semibold tabular-nums">52 km/j · Padat</span>
 </div>
 <div className="flex items-center justify-between p-1.5 rounded border-t border-white/10">
 <span className="text-slate-300 truncate max-w-[170px]">Bakauheni–Terbanggi Besar</span>
 <span className="text-emerald-400 font-semibold tabular-nums">85 km/j · Lancar</span>
 </div>
 <div className="flex items-center justify-between p-1.5 rounded border-t border-white/10">
 <span className="text-slate-300 truncate max-w-[170px]">Padang–Bukittinggi (Silaing)</span>
 <span className="text-amber-400 font-semibold tabular-nums">34 km/j · Waspada</span>
 </div>
 </div>
 </div>
 </PopoverContent>
 </Popover>

 {/* 3. BMKG Rainfall */}
 <Popover
 open={activePopover === 'BMKG'}
 onOpenChange={(open) => setActivePopover(open ? 'BMKG' : 'NONE')}
 >
 <PopoverTrigger asChild>
 <button
 type="button"
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-colors duration-150 shrink-0 ${
 activePopover === 'BMKG'
 ? 'bg-[#121822] border-cyan-500/50 text-cyan-300 ring-1 ring-cyan-500/30'
 : 'bg-white/5 border-white/5 text-sky-400 hover:bg-white/10 hover:border-white/20'
 }`}
 title="Intensitas curah hujan stasiun BMKG terdekat & fusi Open-Meteo"
 >
 <CloudRain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
 {isLoading && !corridorContext ? (
 <span>BMKG: ...</span>
 ) : (
 <span className="tabular-nums">BMKG: {bmkgRainfall != null ? `${bmkgRainfall} mm/j` : '0 mm/j'}</span>
 )}
 <ChevronDown className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-150 ${activePopover === 'BMKG' ? 'rotate-180' : ''}`} />
 </button>
 </PopoverTrigger>
 <PopoverContent
 side="bottom"
 align="start"
 sideOffset={8}
 collisionPadding={12}
 className="w-80 max-w-[calc(100vw-32px)] space-y-3 p-3.5 font-sans"
 >
 <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
 <div className="flex items-center gap-2">
 <div className="p-1.5 rounded-lg bg-sky-950/60 text-sky-400 border border-sky-500/30">
 <CloudRain className="w-4 h-4" />
 </div>
 <div>
 <h4 className="text-xs font-semibold text-white font-sans">
 Cuaca
 </h4>
 <p className="text-xs text-slate-400 font-mono">
 Fusi cuaca
 </p>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-2 text-xs font-mono">
 <div className="pt-2 border-t border-white/10">
 <span className="text-slate-400 block text-xs font-sans">Hujan</span>
 <span className="text-sm font-bold text-sky-400 tabular-nums">
 {bmkgRainfall != null ? `${bmkgRainfall} mm/j` : '0 mm/j'}
 </span>
 <span className="text-xs text-slate-500 block font-sans">
 {bmkgRainfall == null || bmkgRainfall < 5
 ? 'Normal (< 5 mm/j)'
 : bmkgRainfall <= 20
 ? 'Waspada (5–20 mm/j)'
 : 'Ekstrem (> 20 mm/j)'}
 </span>
 </div>

 <div className="pt-2 border-t border-white/10">
 <span className="text-slate-400 block text-xs font-sans">Jangkauan</span>
 <span className="text-sm font-bold text-slate-200 tabular-nums">250 km</span>
 <span className="text-xs text-slate-500 block font-sans">Pan-Sumatra</span>
 </div>
 </div>

 <div className="space-y-1.5 text-xs">
 <span className="text-xs font-mono text-slate-400 font-semibold block">
 Laut
 </span>
 <div className="space-y-1 font-mono text-xs">
 <div className="p-2 rounded border-t border-white/10 space-y-0.5">
 <div className="flex justify-between items-center">
 <span className="text-white font-sans font-semibold">Selat Malaka</span>
 </div>
 <div className="flex justify-between text-slate-400 text-xs tabular-nums">
 <span>0.5–1.2 m</span>
 <span>10–15 kts</span>
 </div>
 </div>

 <div className="p-2 rounded border-t border-white/10 space-y-0.5">
 <div className="flex justify-between items-center">
 <span className="text-white font-sans font-semibold">Selat Sunda (Merak–Bakauheni)</span>
 <span className="text-amber-400 text-xs font-bold">Waspada</span>
 </div>
 <div className="flex justify-between text-slate-400 text-xs tabular-nums">
 <span>1.25–2.0 m</span>
 <span>Feri: jalan</span>
 </div>
 </div>
 </div>
 </div>

 {/* Dispatch enrichment: top blue disruption impact (hazard/koridor/delay/aksi/moda/confidence). */}
 <div className="space-y-1.5 text-xs">
 <span className="text-xs font-mono text-slate-400 font-semibold block">
 Dampak
 </span>
 {weatherSample ? (
 <div className="p-2 rounded border-t border-white/10 space-y-0.5 font-mono text-xs">
 <div className="flex justify-between text-slate-300">
 <span>hazard: {String(weatherSample.hazard_type ?? '-')}</span>
 <span>{String(weatherSample.severity ?? '')}</span>
 </div>
 <div className="text-slate-400 text-xs">
 koridor: {String(weatherSample.corridor_id ?? '-')} · {String(weatherSample.corridor_segment ?? '-')} ({String(weatherSample.dist_to_corridor_km ?? '?')} km)
 </div>
 <div className="flex justify-between text-slate-300 tabular-nums">
 <span>delay: +{String(weatherSample.delay_hours ?? '?')} jam</span>
 <span>{String(weatherSample.advisory_action ?? '-')}</span>
 </div>
 <div className="text-slate-400 text-xs">
 moda: {Array.isArray(weatherSample.affected_modalities) ? weatherSample.affected_modalities.join(', ') : String(weatherSample.affected_modalities ?? '-')} · conf: {String(weatherSample.confidence ?? '?')} ({String(weatherSample.observed_vs_forecast ?? '-')})
 </div>
 </div>
 ) : (
 <div className="p-2 rounded border-t border-white/10 font-mono text-xs text-slate-500">
 Belum ada zona biru. Hazard: flood/landslide/severe_storm/marine_wave.
 </div>
 )}
 <p className="text-xs leading-tight text-slate-500 font-sans">
 Aksi: proceed, delay, reroute, hold.
 </p>
 </div>
 </PopoverContent>
 </Popover>

 {/* 4. Pan-Sumatra Intermodal Choke-Points Popover */}
 <IntermodalTerminalPopover
 isOpen={activePopover === 'INTERMODAL'}
 onToggle={() => togglePopover('INTERMODAL')}
 onClose={() => setActivePopover('NONE')}
 onSelectHub={onSelectHub}
 />

 {/* Segment Divider: Telemetry to Overlays */}
 <div className="h-4 w-px bg-white/10 shrink-0 mx-0.5" />

 {/* Compact Zone Filter Pills when Left OSINT Drawer is Collapsed */}
 {isLeftSidebarCollapsed && (
 <div className="flex items-center gap-1 shrink-0">
 <button
 type="button"
 onClick={onToggleRedZones}
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-all duration-150 shrink-0 ${
 showRedZones
 ? 'bg-red-950/50 border-red-500/50 text-red-200'
 : 'bg-white/5 border-white/5 text-slate-500 opacity-60 hover:opacity-100'
 }`}
 title="Filter Peta: Zona Merah (Bencana Terkonfirmasi)"
 >
 <span className={`w-2 h-2 rounded-full ${showRedZones ? 'bg-red-500' : 'bg-slate-600'}`} />
 <span className="font-sans text-xs font-semibold">Merah</span>
 <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-xs font-bold text-red-300 font-mono tabular-nums leading-none">
 {redZoneCount}
 </span>
 </button>
 <button
 type="button"
 onClick={onToggleYellowZones}
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-all duration-150 shrink-0 ${
 showYellowZones
 ? 'bg-yellow-950/50 border-yellow-500/50 text-yellow-200'
 : 'bg-white/5 border-white/5 text-slate-500 opacity-60 hover:opacity-100'
 }`}
 title="Filter Peta: Zona Kuning (Perlu Klarifikasi / Waspada)"
 >
 <span className={`w-2 h-2 rounded-full ${showYellowZones ? 'bg-yellow-400' : 'bg-slate-600'}`} />
 <span className="font-sans text-xs font-semibold">Kuning</span>
 <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-xs font-bold text-yellow-300 font-mono tabular-nums leading-none">
 {yellowZoneCount}
 </span>
 </button>
 </div>
 )}

 {/* Disruption-only weather (biru, default ON) + advisory (ungu, default OFF). Counts reflect filtered set. */}
 {onToggleWeatherPolygons && (
 <button
 type="button"
 onClick={onToggleWeatherPolygons}
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-all duration-150 shrink-0 ${
 showWeatherPolygons
 ? 'bg-blue-950/50 border-blue-500/50 text-blue-200'
 : 'bg-white/5 border-white/5 text-slate-500 opacity-60 hover:opacity-100'
 }`}
 title="Cuaca (gangguan, biru): hujan lebat disruptif high/critical 50mm/24j atau banjir 80%. Klik poligon = presipitasi/banjir/angin/sumber/valid_until."
 >
 <span className={`w-2 h-2 rounded-full ${showWeatherPolygons ? 'bg-blue-500' : 'bg-slate-600'}`} />
 <span className="font-sans text-xs font-semibold">Cuaca</span>
 <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-xs font-bold text-blue-300 font-mono tabular-nums leading-none">
 {weatherDisruptionCount ?? weatherPolygonCount}
 </span>
 </button>
 )}
 {onToggleWeatherAdvisory && (
 <button
 type="button"
 onClick={onToggleWeatherAdvisory}
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-all duration-150 shrink-0 ${
 showWeatherAdvisory
 ? 'bg-purple-950/50 border-purple-500/50 text-purple-200'
 : 'bg-white/5 border-white/5 text-slate-500 opacity-60 hover:opacity-100'
 }`}
 title="Advisory cuaca (ungu, default OFF): medium drizzle termasuk BMKG 60. Aktifkan untuk lapisan advisori penuh."
 >
 <span className={`w-2 h-2 rounded-full ${showWeatherAdvisory ? 'bg-purple-500' : 'bg-slate-600'}`} />
 <span className="font-sans text-xs font-semibold">Advisori</span>
 <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-xs font-bold text-purple-300 font-mono tabular-nums leading-none">
 {weatherAdvisoryCount}
 </span>
 </button>
 )}
 {onToggleFireHotspots && (
 <button
 type="button"
 onClick={onToggleFireHotspots}
 className={`cursor-pointer h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-mono transition-all duration-150 shrink-0 ${
 fireStatus === 'degraded'
 ? 'bg-white/5 border-white/5 text-slate-500 opacity-70'
 : showFireHotspots
 ? 'bg-orange-950/50 border-orange-500/50 text-orange-200'
 : 'bg-white/5 border-white/5 text-slate-500 opacity-60 hover:opacity-100'
 }`}
 title={fireTooltip || (fireStatus === 'degraded' ? 'butuh MAP_KEY' : 'Overlay FIRMS VIIRS_SNPP_NRT: titik + heat oranye. Klik titik = FRP/conf/jarak koridor.')}
 >
 <span className={`w-2 h-2 rounded-full ${fireStatus === 'degraded' ? 'bg-slate-600' : showFireHotspots ? 'bg-orange-500' : 'bg-slate-600'}`} />
 <span className="font-sans text-xs font-semibold">Karhutla</span>
 <span className={`px-1.5 py-0.5 rounded text-xs font-bold font-mono tabular-nums leading-none ${fireStatus === 'degraded' ? 'bg-white/10 text-slate-400' : 'bg-orange-500/20 text-orange-300'}`}>
 {fireStatus === 'degraded' ? '—' : fireHotspotCount}
 </span>
 </button>
 )}

 {/* Segment Divider: Overlays to Actions */}
 {onOpenHitl && <div className="h-4 w-px bg-white/10 shrink-0 mx-0.5" />}

 {/* 5. Globot HITL Review Drawer Trigger */}
 {onOpenHitl && (
 <button
 type="button"
 onClick={onOpenHitl}
 className="cursor-pointer h-8 flex items-center gap-1.5 px-3 rounded-lg border bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-300 hover:text-white transition shadow-sm shrink-0 font-medium tabular-nums text-xs"
 title="Buka Panel Tinjauan Keputusan Operator (HITL)"
 >
 <span className="w-2 h-2 rounded-full bg-amber-400 motion-safe:animate-pulse ring-2 ring-amber-400/30 shrink-0" />
 <span>Tinjau</span>
 {pendingHitlCount > 0 && (
 <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold text-xs tabular-nums leading-none">
 {pendingHitlCount}
 </span>
 )}
 </button>
 )}
 </div>
 );
};
