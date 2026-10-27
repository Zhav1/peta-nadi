'use client';

import React from 'react';
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
  // Disruption-only: Cuaca = high/critical biru (default ON); Waspada Dini (Advisory) = medium (default OFF).
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
  /** Dispatch-enriched sample from the top blue disruption polygon (hazard/corridor/delay/aksi/modalities/confidence). */
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

/**
 * Minimalist map-critical header: Merah/Kuning filters (collapsed drawer),
 * Cuaca disruption (biru, default ON), Waspada Dini advisory (default OFF),
 * and Titik Panas satelit. Rute/latency, lalin, BMKG, intermodal hub, and
 * Tinjau pills stay dormant — the 15s `api.news.hitlPending` poll +
 * `HitlDecisionDrawer` + `hitlAction` wiring in `DashboardClient` are
 * untouched.
 */
export const TopNavTelemetry: React.FC<TopNavTelemetryProps> = ({
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
  weatherDisruptionCount,
  showWeatherAdvisory = false,
  onToggleWeatherAdvisory,
  weatherAdvisoryCount = 0,
  showFireHotspots = true,
  onToggleFireHotspots,
  fireHotspotCount = 0,
  fireStatus = 'ok',
  fireTooltip,
  // Dormant P2 props — accepted for API compatibility, rendered nowhere.
  routingInfo: _routingInfo,
  corridorContext: _corridorContext,
  isLoading: _isLoading,
  isRoutingLoading: _isRoutingLoading,
  onOpenHitl: _onOpenHitl,
  pendingHitlCount: _pendingHitlCount,
  onSelectHub: _onSelectHub,
  onFocusRoute: _onFocusRoute,
  weatherSample: _weatherSample,
}) => {
  void _routingInfo;
  void _corridorContext;
  void _isLoading;
  void _isRoutingLoading;
  void _onOpenHitl;
  void _pendingHitlCount;
  void _onSelectHub;
  void _onFocusRoute;
  void _weatherSample;

  return (
    <div className="relative flex flex-wrap items-center gap-1.5 text-xs font-mono select-none overflow-visible">
      {/* Compact Zone Filter Pills when Left OSINT Drawer is Collapsed */}
      {isLeftSidebarCollapsed && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleRedZones}
            className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
              showRedZones
                ? 'bg-red-950/50 border-red-500/50 text-red-200 '
                : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
            }`}
            title="Filter Peta: Zona Merah (Bencana Terkonfirmasi)"
          >
            <span className={`w-2 h-2 rounded-full ${showRedZones ? 'bg-red-500 ' : 'bg-slate-600'}`} />
            <span className="font-sans text-xs font-semibold">Merah</span>
            <span className="px-1 py-0.2 rounded bg-red-500/20 text-xs font-bold text-red-300 font-mono tabular-nums">
              {redZoneCount}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleYellowZones}
            className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
              showYellowZones
                ? 'bg-yellow-950/50 border-yellow-500/50 text-yellow-200 '
                : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
            }`}
            title="Filter Peta: Zona Kuning (Perlu Klarifikasi / Waspada)"
          >
            <span className={`w-2 h-2 rounded-full ${showYellowZones ? 'bg-yellow-400 ' : 'bg-slate-600'}`} />
            <span className="font-sans text-xs font-semibold">Kuning</span>
            <span className="px-1 py-0.2 rounded bg-yellow-500/20 text-xs font-bold text-yellow-300 font-mono tabular-nums">
              {yellowZoneCount}
            </span>
          </button>
        </div>
      )}

      {/* Disruption-only weather (biru, default ON) — the single map-critical hazard count. */}
      {onToggleWeatherPolygons && (
        <button
          type="button"
          onClick={onToggleWeatherPolygons}
          className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
            showWeatherPolygons
              ? 'bg-blue-950/50 border-blue-500/50 text-blue-200 '
              : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
          }`}
          title="Cuaca (gangguan, biru): hujan lebat disruptif high/critical 50mm/24j atau banjir 80%. Klik poligon = presipitasi/banjir/angin/sumber/valid_until."
        >
          <span className={`w-2 h-2 rounded-full ${showWeatherPolygons ? 'bg-blue-500 ' : 'bg-slate-600'}`} />
          <span className="font-sans text-xs font-semibold">Cuaca</span>
          <span className="px-1 py-0.2 rounded bg-blue-500/20 text-xs font-bold text-blue-300 font-mono tabular-nums">
            {weatherDisruptionCount ?? weatherPolygonCount}
          </span>
        </button>
      )}

      {/* Waspada Dini advisory (medium drizzle, default OFF, info-only). Off-map: single slate/cyan dot. */}
      {onToggleWeatherAdvisory && (
        <button
          type="button"
          onClick={onToggleWeatherAdvisory}
          className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
            showWeatherAdvisory
              ? 'bg-[#0c1017] border-cyan-500/50 text-cyan-200'
              : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
          }`}
          title="Waspada Dini (Advisory): medium drizzle (mis. BMKG 60). Hanya tampil bila toggle ON. Default OFF, info-only — tanpa pengalihan rute."
        >
          <span className={`w-2 h-2 rounded-full ${showWeatherAdvisory ? 'bg-cyan-300' : 'bg-slate-600'}`} />
          <span className="font-sans text-xs font-semibold">Waspada Dini</span>
          <span className="px-1 py-0.2 rounded bg-white/5 text-xs font-bold text-slate-300 font-mono tabular-nums">
            {weatherAdvisoryCount}
          </span>
        </button>
      )}

      {/* Titik Panas satelit (FIRMS VIIRS). Off-map: single slate dot; ON: single orange dot (map-only exception). */}
      {onToggleFireHotspots && (
        <button
          type="button"
          onClick={onToggleFireHotspots}
          className={`cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
            showFireHotspots
              ? 'bg-[#0c1017] border-white/20 text-slate-200'
              : 'bg-[#0c1017] border-white/5 text-slate-500 opacity-60 hover:opacity-100'
          }`}
          title={fireTooltip ?? 'Titik Panas (Satelit) VIIRS: sorotan oranye khusus peta bila >=3 titik keyakinan tinggi dalam 5 km.'}
        >
          <span className={`w-2 h-2 rounded-full ${showFireHotspots ? 'bg-orange-400' : 'bg-slate-600'}`} />
          <span className="font-sans text-xs font-semibold">Titik Panas</span>
          <span className="px-1 py-0.2 rounded bg-white/5 text-xs font-bold text-slate-300 font-mono tabular-nums">
            {fireStatus === 'degraded' ? '—' : fireHotspotCount}
          </span>
        </button>
      )}
    </div>
  );
};
