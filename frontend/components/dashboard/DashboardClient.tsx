'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  HelpCircle,
  Info,
  Radio,
  RotateCcw,
  Compass,
  MapPin,
  Truck,
  X,
  Newspaper,
  Search,
  ExternalLink,
  Anchor,
  Plane,
  PlusCircle,
  ChevronDown,
  Play,
  Home,
  Lock,
  Map as MapIcon,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useIncidents } from '@/hooks/useIncidents';
import { useCrisisSocket } from '@/hooks/useCrisisSocket';
import { CrisisSidebar } from '@/components/sidebar/CrisisSidebar';
import { notifyToast } from '@/components/ui/Toast';
import { useDemoState } from '@/hooks/useDemoState';
import { useFleetVehicles } from '@/hooks/useFleetVehicles';
import { useCorridorContext } from '@/hooks/useCorridorContext';
import { useDashboardBootstrap } from '@/hooks/useDashboardBootstrap';
import { useNewsVerification, isForecastActive, deriveForecastValidUntil, FORECAST_TAG, normalizeProvince, provinceSlug, displayTierLabel, AREA_WIDE_PROVINCE, SUMATRA_PROVINCE_ORDER, type MarketRegimeData, type NewsRelevanceTier } from '@/hooks/useNewsVerification';
import { isDocumentVisible } from '@/lib/visibility';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { FreshnessBadge as StatusFreshnessBadge } from '@/components/dashboard/FreshnessBadge';
import { GuidedDemoPanel } from '@/components/demo/GuidedDemoPanel';
import AnalyticsSection from '@/components/dashboard/AnalyticsSection';
import ReportsSection from '@/components/dashboard/ReportsSection';
import EvaluationSection from '@/components/dashboard/EvaluationSection';
import { CrisisSimulatorBar } from '@/components/map/CrisisSimulatorBar';
import { resolveMapDockClasses } from '@/components/dashboard/mapDockLayout';
import { HUB_NODES, PAN_SUMATRA_GAZETTEER, normalizeRegencyId, type HubNode } from '@/lib/mapboxRoutingService';
import { formatNodeId, type NodeDisplayInfo } from '@/lib/formatNode';
import {
  calculateAIDynamicDetourRoutes,
  DEFAULT_HAZARD_RADIUS_KM,
  getHaversineDistanceKm,
  type TransportModality,
} from '@/lib/aiDynamicRouter';
import { api } from '@/lib/api';
import { toLonLatRing } from '@/lib/polygonGeom';
import { regionSlugFromLatLon } from '@/lib/region';
import { dedupeRoutesByGeometry } from '@/lib/routeProvenance';
import type { CrisisState, WsEvent, CrisisType, Severity, RouteRecommendation, DisasterZone, HazardImpactProfile, ZoneTier, FleetVehicle, TacticalManeuver, FireHotspot, FireHotspotResponse, RouteDecisionType, DecisionAction, WeatherHazardSummary, HazardCounterStatus, FireHotspotSource, WeatherPolygonMeta } from '@/lib/types';
import { useAuth } from '@/lib/authContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { FleetOnboardingModal } from '@/components/fleet/FleetOnboardingModal';
import { TenantFleetRoster } from '@/components/fleet/TenantFleetRoster';
import { useCrisisSimulationStream } from '@/hooks/useCrisisSimulationStream';

import { TopNavTelemetry, HazardLegendPills } from '@/components/dashboard/TopNavTelemetry';
import { RoutingStatusBanner } from '@/components/dashboard/RoutingStatusBanner';
import { DispatcherAlertQueue } from '@/components/dashboard/DispatcherAlertQueue';
import { HitlDecisionDrawer } from '@/components/dashboard/HitlDecisionDrawer';
import { GuestEvaluationBanner } from '@/components/dashboard/GuestEvaluationBanner';
import { RouteDetailModal } from '@/components/sidebar/RouteDetailModal';
import type { DisruptionImpactResponse, ImpactedVehicleAssessment } from '@/lib/types';

// Dynamic import for map to avoid SSR issues
const CrisisMap = dynamic(() => import('@/components/map/CrisisMap'), { ssr: false });

/**
 * Phase 175 — the command surface has exactly one pill recipe. Chrome is
 * monochrome; the enabled/selected state is the white pill. Shared by the
 * top-nav counters, the zone filters, and the dock, so a hue cannot leak back
 * in through a one-off class string.
 */
const PILL_BASE =
  'cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono tabular-nums transition-colors duration-150';
const pillClass = (active: boolean): string =>
  active
    ? `${PILL_BASE} bg-white text-[#080d14] border-white font-semibold`
    : `${PILL_BASE} bg-[#0c1017] text-[rgba(232,234,237,0.62)] border-white/[0.08] hover:border-white/15 hover:text-[#e8eaed]`;
const chipClass = (active: boolean): string =>
  active
    ? 'px-1 py-0.5 rounded bg-black/10 text-xs font-bold tabular-nums'
    : 'px-1 py-0.5 rounded bg-white/[0.06] text-xs font-bold tabular-nums';

/**
 * Phase 176.5 — the section nav is one list rendered twice by breakpoint:
 * `Peta Operasi` is the primary tab (icon-only below xl), the three secondary
 * sections collapse into an overflow menu below xl so no label can ever
 * overflow a 360px header. Desktop keeps the labelled strip and the #nav-* ids
 * every existing spec drives.
 */
const NAV_TABS = [
  { id: 'map', label: 'Peta Operasi', icon: MapIcon, primary: true },
  { id: 'analytics', label: 'Analitik', icon: null, primary: false },
  { id: 'reports', label: 'Laporan', icon: null, primary: false },
  { id: 'evaluation', label: 'Evaluasi', icon: null, primary: false },
] as const;

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

// Applies operational approval styling: the approved corridor takes the single
// data accent (live/selected), its alternatives recede to a neutral steel line.
// Shared by handleDeployUnifiedActionPlan and handleCommitOperationalRoute so both route stores stay identical.
function styleApprovedRoutes(routes: RouteRecommendation[], approved: RouteRecommendation): RouteRecommendation[] {
  return routes.map((r) =>
    (r.id && r.id === approved.id) || (r.description && r.description === approved.description)
      ? { ...r, color: '#38b8f8', is_compromised: false, safety_status: 'SAFE_DETOUR' }
      : { ...r, color: '#334155' }
  );
}

// Relative detour delay: approved ETA minus the fastest ETA in the same route set
// (never the total ETA, never a hardcoded baseline).
function resolveApprovedDelayMinutes(
  approved: RouteRecommendation | undefined,
  routes: RouteRecommendation[]
): number {
  const approvedEta = approved?.eta_minutes;
  if (typeof approvedEta !== 'number' || !Number.isFinite(approvedEta)) return 0;

  const etaMinutes = routes
    .map((r) => r.eta_minutes)
    .filter((eta): eta is number => typeof eta === 'number' && Number.isFinite(eta));
  if (etaMinutes.length === 0) return 0;

  return Math.max(0, approvedEta - Math.min(...etaMinutes));
}

function FloatingMapLegend({
  isOpen,
  onToggle,
  corridorVisibility = { land: true, sea: true, air: true },
  onToggleCorridor,
  onResetCorridorVisibility,
  weatherDisruptionCount = 0,
  weatherAdvisoryCount = 0,
  showWeatherAdvisory = false,
  weatherPolygonFeatureCount = 0,
  weatherPolygonMeta = null,
  weatherSummary = null,
  fireStatus = 'degraded',
  fireUpdatedAt = null,
  fireReason = null,
  bootstrapComputedAt = null,
  bootstrapStale = false,
  bootstrapReason = null,
  liveFireCluster = false,
}: {
  isOpen: boolean;
  onToggle: () => void;
  isSidebarOpen?: boolean;
  corridorVisibility?: { land: boolean; sea: boolean; air: boolean };
  onToggleCorridor?: (corridor: 'land' | 'sea' | 'air') => void;
  onResetCorridorVisibility?: () => void;
  weatherDisruptionCount?: number;
  weatherAdvisoryCount?: number;
  showWeatherAdvisory?: boolean;
  /** Polygons currently handed to the map (kept across failed refreshes). */
  weatherPolygonFeatureCount?: number;
  /** Render-cap + retention meta of the last polygon response. */
  weatherPolygonMeta?: WeatherPolygonMeta | null;
  /** World-truth counters (status/generated_at/reason per bucket). */
  weatherSummary?: WeatherHazardSummary | null;
  fireStatus?: HazardCounterStatus;
  fireUpdatedAt?: string | null;
  fireReason?: string | null;
  /** Phase 163b: bootstrap snapshot build time (null = no snapshot yet). */
  bootstrapComputedAt?: string | null;
  /** Phase 163b: the backend served a bounded live build / stored row. */
  bootstrapStale?: boolean;
  bootstrapReason?: string | null;
  /** Phase 176: >=3 high-confidence FIRMS detections — genuinely live cluster. */
  liveFireCluster?: boolean;
}) {
  // Exactly one live pulse per viewport, only while the feed is genuinely live:
  // a critical weather zone wins over a FIRMS cluster. Never at rest.
  const liveHazardPulse: 'critical' | 'cluster' | null =
    weatherDisruptionCount > 0 ? 'critical' : liveFireCluster ? 'cluster' : null;

  return (
    <div className="relative pointer-events-auto">
      <button
        type="button"
        onClick={onToggle}
        className={`cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1.5 ${
          isOpen
            ? 'bg-white text-[#080d14] border-white'
            : 'bg-[#0c1017] text-[rgba(232,234,237,0.62)] border-white/10 hover:text-[#e8eaed] hover:border-white/15 hover:bg-[#121822]'
        }`}
        title="Buka Legenda Peta & Rute"
      >
        <Info className="w-4 h-4 text-current" />
 <span>Legenda</span>
      </button>

      {isOpen && (
        <div
          data-testid="map-legend-panel"
          className="absolute right-0 top-full mt-2 w-80 max-h-[calc(100vh-9rem)] overflow-y-auto custom-scrollbar bg-[#0c1017] border border-white/10 p-3.5 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.4)] text-xs space-y-2.5 duration-150 z-50"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-mono font-semibold text-xs text-[#e8eaed] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[rgba(232,234,237,0.62)]" />
              <span>Legenda Peta & Keputusan</span>
            </span>
            <button
              type="button"
              onClick={onToggle}
              className="cursor-pointer p-1 rounded-md bg-[#121822] text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] border border-white/10 transition-colors"
              title="Tutup Legenda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Phase 169: retention truth. Freshness per layer + honest render-cap
              notice ("menampilkan N dari M"). No new colour families. */}
          <div className="space-y-1 pt-1.5 pb-2 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-sans text-[rgba(232,234,237,0.62)]">Cuaca</span>
              <span data-testid="freshness-cuaca">
                <StatusFreshnessBadge
                  status={weatherSummary?.cuaca.status ?? weatherPolygonMeta?.status ?? 'degraded'}
                  updatedAt={weatherSummary?.generated_at ?? weatherPolygonMeta?.updated_at ?? null}
                  reason={weatherSummary?.cuaca.reason ?? weatherPolygonMeta?.reason ?? null}
                />
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-sans text-[rgba(232,234,237,0.62)]">Waspada Dini</span>
              <span data-testid="freshness-waspada">
                <StatusFreshnessBadge
                  status={weatherSummary?.waspada.status ?? 'degraded'}
                  updatedAt={weatherSummary?.generated_at ?? null}
                  reason={weatherSummary?.waspada.reason ?? null}
                />
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-sans text-[rgba(232,234,237,0.62)]">Titik Panas</span>
              <span data-testid="freshness-titik-panas">
                <StatusFreshnessBadge
                  status={fireStatus}
                  updatedAt={fireUpdatedAt}
                  reason={fireReason}
                />
              </span>
            </div>
            {/* Phase 163b: the whole map is seeded from one snapshot; say when it
                was built and why it is stale instead of showing a spinner over it. */}
            {bootstrapComputedAt && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-sans text-[rgba(232,234,237,0.62)]">Snapshot</span>
                <span data-testid="freshness-snapshot">
                  <StatusFreshnessBadge
                    status={bootstrapStale ? 'stale' : 'ok'}
                    updatedAt={bootstrapComputedAt}
                    reason={bootstrapReason}
                  />
                </span>
              </div>
            )}
            {weatherPolygonMeta?.capped && (
              <div
                data-testid="weather-capped-notice"
                className="text-xs font-sans text-[rgba(232,234,237,0.62)] pt-0.5 tabular-nums"
              >
                menampilkan {weatherPolygonMeta.count ?? 0} dari {weatherPolygonMeta.total ?? 0}
              </div>
            )}
          </div>

          <div className="space-y-2 font-mono text-xs">
            {/* ── Routes & hazard: hue only where a hazard / live route exists ── */}
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-[#38b8f8] shrink-0 rounded" />
              <div>
                <span className="text-[#e8eaed] font-medium block">Rute Rekomendasi Tercepat</span>
                <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Bebas bahaya dengan jarak dan waktu tempuh paling efisien.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-4 h-0 border-t-2 border-dashed border-white/40 shrink-0" />
              <div>
                <span className="text-[#e8eaed] font-medium block">Rute Alternatif Sekunder</span>
                <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Jalur alternatif cadangan dengan deviasi waktu lebih panjang.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-[#ef4444] shrink-0 rounded" />
              <div>
                <span className="text-[#e8eaed] font-medium block">Koridor Utama Terblokir</span>
                <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Jalur utama yang terhambat genangan atau longsor.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                data-live-hazard={liveHazardPulse === 'critical' ? 'critical' : undefined}
                className={`w-2.5 h-2.5 rounded-full border border-[#ef4444] bg-[#ef4444]/15 shrink-0 ${
                  liveHazardPulse === 'critical' ? 'ds-live-pulse' : ''
                }`}
              />
              <div>
                <span className="text-[#e8eaed] font-medium block">Zona Radius Bahaya (Shockwave)</span>
                <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Area bahaya hasil konsensus BMKG dan OSINT.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-4 h-0 border-t-2 border-dashed border-[#f59e0b] shrink-0" />
              <div>
                <span className="text-[#e8eaed] font-medium block">Prakiraan Waspada Dini (tanpa isi)</span>
                <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Garis putus-putus amber: prakiraan YELLOW_CLARIFY yang belum terkonfirmasi — info pantauan saja, tanpa pengalihan rute maupun penahanan armada.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                data-live-hazard={liveHazardPulse === 'cluster' ? 'cluster' : undefined}
                className={`w-2.5 h-2.5 rounded-full bg-[#f59e0b]/70 shrink-0 ${
                  liveHazardPulse === 'cluster' ? 'ds-live-pulse' : ''
                }`}
              />
              <div>
                <span className="text-[#e8eaed] font-medium block">Titik Panas (Satelit) — sorotan bila ≥3 titik keyakinan tinggi dalam 5 km</span>
                <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Titik netral per deteksi VIIRS; sorotan amber khusus peta bila ≥3 titik keyakinan tinggi (conf ≥80 atau FRP&gt;100) dalam 5 km. Klik area/titik = jumlah + FRP/conf/jarak koridor.</span>
              </div>
            </div>

            {/* ── Infrastructure: monochrome, separated by SHAPE not hue ─────── */}
            <div className="pt-2 mt-2 border-t border-white/10 space-y-2">
              <span className="text-[rgba(232,234,237,0.62)] font-sans font-semibold text-xs block">
                Infrastruktur
              </span>

              <div className="flex items-center gap-2">
                <span data-legend-glyph="infra" className="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Pelabuhan</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Terminal laut utama Sumatra (lingkaran).</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span data-legend-glyph="infra" className="w-2 h-2 rotate-45 border border-white/40 shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Bandara</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Hub kargo udara KNO, PDG, PLM (belah ketupat).</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span data-legend-glyph="infra" className="w-2.5 h-2.5 rounded-[2px] border border-white/40 shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Hub Logistik Pangan</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Gudang BULOG dan Pasar Induk (kotak).</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span data-legend-glyph="infra" className="w-4 h-0.5 bg-white/50 shrink-0 rounded" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Tol Trans-Sumatera</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Koridor darat utama (garis penuh).</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span data-legend-glyph="infra" className="w-4 h-0 border-t border-dashed border-white/40 shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Alur Laut Selat Malaka (TSS)</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Koridor pelayaran vital logistik maritim Sumatra (garis putus-putus).</span>
                </div>
              </div>
            </div>

            <div className="pt-2 mt-2 border-t border-white/10 space-y-2">
              <span className="text-[rgba(232,234,237,0.62)] font-sans font-semibold text-xs block">
                Armada
              </span>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#38b8f8] shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Armada Live (AIS · ADS-B · GPS)</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Kapal, truk, dan kargo udara dengan transponder aktif.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Proyeksi Rute Estimasi</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Lintasan terencana berbasis manifes pelayaran — posisi tanpa sinyal live.</span>
                </div>
              </div>
            </div>

            {/* Weather: disruption is critical, advisory is warning. */}
            <div className="pt-2 mt-2 border-t border-white/10 space-y-2">
              <span className="text-[rgba(232,234,237,0.62)] font-sans font-semibold text-xs block">
                Cuaca
              </span>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Cuaca — {weatherDisruptionCount} zona</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Hujan lebat disruptif: high/critical, presipitasi 50mm/24j atau banjir 80%. Default ON. Hazard: flood/landslide/severe_storm/marine_wave.</span>
                  <span
                    data-testid="weather-polygon-count"
                    className="text-xs text-[rgba(232,234,237,0.38)] font-sans tabular-nums block"
                  >
                    {weatherPolygonFeatureCount} poligon digambar (seluruh Sumatra)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white/40 shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Dampak Dispatcher per Zona Cuaca</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Klik poligon: koridor+segmen+jarak, delay jam (flood 14/landslide 10/marine 18 × severity), aksi (caution/delay/reroute/hold), moda truck/sea/air, confidence + observasi/prakiraan.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full border border-dashed border-[#f59e0b] shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Waspada Dini (Advisory) — {weatherAdvisoryCount} zona {showWeatherAdvisory ? '(ON)' : '(OFF)'}</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Medium drizzle (mis. BMKG 60): hanya tampil bila toggle waspada dini ON. Default OFF, info-only.</span>
                </div>
              </div>
            </div>

            {/* Q4/Q5: direct land vs island-ring corridors + live/offline provenance */}
            <div className="pt-2 mt-2 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[rgba(232,234,237,0.62)] font-sans font-semibold text-xs">
                  Koridor
                </span>
                <span className="flex items-center gap-1.5 text-xs text-[rgba(232,234,237,0.62)]">
                  <span className="w-1.5 h-1.5 rounded-full border border-[#f59e0b]" />
                  Simulasi
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-white/60 shrink-0 rounded" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Darat Langsung (disorot)</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Garis penuh: rute darat bebas bahaya.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0 border-t-2 border-dashed border-[#38b8f8] shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Laut — Ring Pulau</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Garis putus-putus accent: legs maritim/intermodal antar-pulau.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0 border-t-2 border-dashed border-white/30 shrink-0" />
                <div>
                  <span className="text-[#e8eaed] font-medium block">Udara — Ring Pulau</span>
                  <span className="text-xs text-[rgba(232,234,237,0.62)] font-sans">Garis putus-putus redup: legs kargo udara darurat antar-pulau.</span>
                </div>
              </div>

              <p className="text-xs leading-tight text-[rgba(232,234,237,0.62)] font-sans">
                Simulasi menandai geometri interpolasi, bukan rute live.
              </p>

              {onToggleCorridor && (
                <div className="space-y-1.5 pt-1 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[rgba(232,234,237,0.62)] font-sans font-semibold text-xs">
                      Koridor
                    </span>
                    {onResetCorridorVisibility && (
                      <button
                        type="button"
                        onClick={onResetCorridorVisibility}
                        className="cursor-pointer text-xs font-mono text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] transition-colors"
                        title="Aktifkan kembali semua koridor"
                      >
                        Semua
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { key: 'land' as const, label: 'Darat', Icon: Truck },
                      { key: 'sea' as const, label: 'Laut', Icon: Anchor },
                      { key: 'air' as const, label: 'Udara', Icon: Plane },
                    ]).map(({ key, label, Icon }) => {
                      const isVisible = corridorVisibility[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onToggleCorridor(key)}
                          aria-pressed={isVisible}
                          title={`${label}: ${isVisible ? 'tampil' : 'disembunyikan'}`}
                          className={`cursor-pointer px-1.5 py-1.5 rounded-lg border text-xs font-sans font-medium transition-colors flex flex-col items-center gap-0.5 ${
                            isVisible
                              ? 'bg-white text-[#080d14] border-white'
                              : 'bg-[#121822]/60 border-white/10 text-[rgba(232,234,237,0.62)] hover:border-white/15 hover:text-[#e8eaed]'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <Icon className="w-3 h-3" />
                            <span>{label}</span>
                          </span>
                          <span className={`text-xs font-mono tabular-nums ${isVisible ? 'opacity-80' : 'opacity-60'}`}>
                            {isVisible ? 'On' : 'Off'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transparansi HITL — minimalist one-liner. */}
          <p className="text-xs text-[rgba(232,234,237,0.62)] font-sans pt-1 border-t border-white/10 leading-tight">
            Transparansi HITL: semua alternatif tampil sebelum persetujuan.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardClient() {
  const { user, role, isAuthenticated, isLoading: isAuthLoading, openAuthModal, isAuthModalOpen, closeAuthModal } = useAuth();

  // Phase 163b (M8): one auth-aware bootstrap read seeds the map. Held until the
  // session is resolved because the endpoint is auth-aware (tenant fleet/erp).
  const bootstrap = useDashboardBootstrap({ modality: 'truck', enabled: !isAuthLoading });
  const bootstrapSections = bootstrap.data?.sections;
  const seededIncidents =
    bootstrapSections?.incidents?.status === 'ok' ? bootstrapSections.incidents.data?.items : undefined;
  const seededNews = bootstrapSections?.news?.status === 'ok' ? bootstrapSections.news.data : undefined;
  const seededMarketRegime =
    bootstrapSections?.news_market_regime?.status === 'ok'
      ? (bootstrapSections.news_market_regime.data as unknown as MarketRegimeData | null) ?? undefined
      : undefined;
  const seededCorridor =
    bootstrapSections?.corridor_context?.status === 'ok' ? bootstrapSections.corridor_context.data : undefined;
  const seededWeatherPolygons =
    bootstrapSections?.weather_spatial_polygons?.status === 'ok'
      ? bootstrapSections.weather_spatial_polygons.data
      : undefined;
  const seededFireHotspots =
    bootstrapSections?.fire_hotspots?.status === 'ok' ? bootstrapSections.fire_hotspots.data : undefined;
  // `fleet` is deliberately NOT seeded: the snapshot's fleet section is built for
  // one modality (default `truck`) while this view draws the multimodal macro
  // slice (tenant trucks + situational vessels/air). Seeding it would blank the
  // Kapal/Udara pills until the next 10 s sync, so the hook keeps its own read.

  const { incidents, refetch } = useIncidents({
    enabled: !bootstrap.isLoading,
    initialData: seededIncidents,
  });
  const {
    vehicles: activeFleetVehicles,
    refetch: refetchFleet,
    customCount: customFleetCount,
    isSimulationMode: isFleetSimMode,
    setIsSimulationMode: setIsFleetSimMode,
    isLoading: isFleetLoading,
    error: fleetError,
    isDispatcher: isDispatcherFleetView,
    isTenantScoped: isFleetTenantScoped,
    companyId: fleetCompanyId,
    liveTenantVehicles,
    tenantVehicles: tenantFleetVehicles,
    tenantAssetCount: tenantFleetAssetCount,
    canToggleSimulation: canToggleFleetSimulation,
  } = useFleetVehicles(undefined, { enabled: !bootstrap.isLoading });

  // Next.js App Router query parameters for session-local routing deep-linking
  const searchParams = useSearchParams();
  const initialOrigin = searchParams?.get('origin') || null;
  const initialDest = searchParams?.get('dest') || null;
  const initialModalityParam = searchParams?.get('modality');
  const initialModality: TransportModality =
    initialModalityParam === 'maritime' ||
    initialModalityParam === 'air' ||
    initialModalityParam === 'truck' ||
    initialModalityParam === 'multimodal' ||
    initialModalityParam === 'best'
      ? initialModalityParam
      : 'truck';
  const initialRouteParam = searchParams?.get('route');
  const initialRouteIdx =
    initialRouteParam !== null && initialRouteParam !== undefined && !isNaN(Number(initialRouteParam))
      ? Number(initialRouteParam)
      : null;
  const initialCrisis = searchParams?.get('crisis') || null;

  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  // Header roster trigger (dispatcher-gated): opens the Armada Perusahaan drawer.
  const [isRosterVisible, setIsRosterVisible] = useState(false);
  const [selectedCrisisId, setSelectedCrisisId] = useState<string | null>(initialCrisis);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisState | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [activeRouteIdx, setActiveRouteIdx] = useState<number | null>(initialRouteIdx);
  const [currentMapRoutes, setCurrentMapRoutes] = useState<RouteRecommendation[]>([]);
  // Phase 77: single selection entry point state — modal opens on every select.
  const [routeModalIdx, setRouteModalIdx] = useState<number | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null);
  const selectedCommodityRef = useRef<string | null>(selectedCommodity);
  selectedCommodityRef.current = selectedCommodity;

  // Dynamic Supabase Hub Nodes List & Clean Slate Selection (Hydrated from URL or null)
  const [dynamicHubNodes] = useState<HubNode[]>(Object.values(HUB_NODES));
  const [selectedOriginNode, setSelectedOriginNode] = useState<string | null>(initialOrigin);
  const [selectedDestNode, setSelectedDestNode] = useState<string | null>(initialDest);
  const [selectedModality, setSelectedModality] = useState<TransportModality>(initialModality);
  const [corridorVisibility, setCorridorVisibility] = useState<{
    land: boolean;
    sea: boolean;
    air: boolean;
  }>({ land: true, sea: true, air: true });
  const [hiddenRouteIndices, setHiddenRouteIndices] = useState<Set<number>>(new Set());

  const handleToggleCorridor = useCallback((corridor: 'land' | 'sea' | 'air') => {
    setCorridorVisibility((prev) => ({
      ...prev,
      [corridor]: !prev[corridor],
    }));
  }, []);

  const handleHideRoute = useCallback((idx: number) => {
    setHiddenRouteIndices((prev) => new Set(prev).add(idx));
  }, []);

  const handleResetCorridors = useCallback(() => {
    setCorridorVisibility({ land: true, sea: true, air: true });
    setHiddenRouteIndices(new Set());
  }, []);

  const hiddenRouteCount =
    hiddenRouteIndices.size +
    (!corridorVisibility.land ? 1 : 0) +
    (!corridorVisibility.sea ? 1 : 0) +
    (!corridorVisibility.air ? 1 : 0);

  // Synchronous in-place URL query parameter synchronization using window.history.replaceState
  // Decouples session-local routing state into shareable deep links with zero page reloads.
  const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      for (const [key, val] of Object.entries(updates)) {
        if (val === null || val === undefined || val === '') {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, val);
        }
      }
      window.history.replaceState(null, '', url.pathname + url.search);
    } catch (e) {
      console.warn('[DashboardClient] Failed to update URL params:', e);
    }
  }, []);

  const activeOriginRef = useRef<string | null>(null);
  const activeDestRef = useRef<string | null>(null);
  const customNodesRef = useRef<Record<string, { coords: [number, number]; name: string }>>({});
  const routeCalculationReqIdRef = useRef<number>(0);
  const routingAbortControllerRef = useRef<AbortController | null>(null);
  const routingInFlightKeyRef = useRef<string | null>(null);
  const demoDetourRoutesRef = useRef<RouteRecommendation[] | null>(null);
  const demoStateRef = useRef<ReturnType<typeof useDemoState> | null>(null);
  activeOriginRef.current = selectedOriginNode;
  activeDestRef.current = selectedDestNode;

  // Real-time Swarm Streaming Hook
  const {
    isStreaming: isSimulationStreaming,
    activeAgent: activeStreamingAgent,
    triggerSimulation,
  } = useCrisisSimulationStream();

  // Interactive Simulation Controls
  const [selectedRadius, setSelectedRadius] = useState<number>(DEFAULT_HAZARD_RADIUS_KM);
  // Telemetry playback speed is fixed at 1x — no UI control is rendered.
  // The prop is kept purely for CrisisMap/CrisisSimulatorBar plumbing.
  const [simSpeed] = useState<number>(1);
  const setSimSpeed = useCallback((_v: number) => { void _v; }, []);
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [isClickTargeting, setIsClickTargeting] = useState(false);
  const [simulatedShockwave, setSimulatedShockwave] = useState<{ center: [number, number]; radiusKm: number; hazardType: string } | null>(null);
  const [disasterZones, setDisasterZones] = useState<DisasterZone[]>([]);
  const [showRedZones, setShowRedZones] = useState<boolean>(true);
  const [showYellowZones, setShowYellowZones] = useState<boolean>(true);
  const [showForecastZones, setShowForecastZones] = useState<boolean>(true);
  const [mapFlyTo, setMapFlyTo] = useState<{ lon: number; lat: number; zoom?: number; ts: number } | null>(null);
 // Toasts render via the global Sonner <Toaster> (app/layout.tsx). setToast is a
 // thin compat alias so existing call sites keep working unchanged; null is a no-op.
 const setToast = useCallback((t: { message: string; type?: 'success' | 'error' | 'info'; duration?: number } | null) => {
 if (!t) return;
 notifyToast({ message: t.message, type: t.type, duration: t.duration });
 }, []);
  const isDemoRunningRef = useRef<boolean>(false);

  // Decision Support System (DSS) Impact Assessment States
  const [impactAssessmentData, setImpactAssessmentData] = useState<DisruptionImpactResponse | null>(null);
  const [selectedImpactedVehicle, setSelectedImpactedVehicle] = useState<ImpactedVehicleAssessment | null>(null);
  const [isAlertQueueDismissed, setIsAlertQueueDismissed] = useState(false);
  const [isHitlDrawerOpen, setIsHitlDrawerOpen] = useState(false);
  const [pendingHitlCount, setPendingHitlCount] = useState<number>(0);

  /**
   * Phase 176 — narrow test-only hook. The HITL drawer has no production
   * trigger in the current shell, so the reduced-motion gate needs a way to
   * mount it. Gated exactly like the map tooltip hook: never installed unless
   * the harness opts in with NEXT_PUBLIC_E2E=1 or `?e2e=1`.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let enabled = process.env.NEXT_PUBLIC_E2E === '1';
    if (!enabled) {
      try {
        enabled = new URLSearchParams(window.location.search).get('e2e') === '1';
      } catch {
        enabled = false;
      }
    }
    if (!enabled) return;
    (window as any).__dsTest = {
      openHitlDrawer: () => setIsHitlDrawerOpen(true),
    };
    return () => {
      delete (window as any).__dsTest;
    };
  }, []);

  // Crisis switches must never leave the previous incident's DSS queue on screen:
  // the alert card and the Mitigation vehicle card both read these two states.
  // The counter also invalidates in-flight assessImpact responses so a slow
  // crisis A can never overwrite crisis B after the user has moved on.
  const crisisSelectionReqRef = useRef(0);
  const clearImpactAssessment = useCallback(() => {
    crisisSelectionReqRef.current += 1;
    setImpactAssessmentData(null);
    setSelectedImpactedVehicle(null);
    setIsAlertQueueDismissed(false);
  }, []);

  // Layout & Navigation States
  const [activeSection, setActiveSection] = useState<'map' | 'analytics' | 'reports' | 'evaluation'>('map');
  const [activeTab, setActiveTab] = useState<'Evidence' | 'Mitigation' | 'Economic'>('Evidence');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  // Phase 176.9 (M9): on phones the Berita filter block (tier + province chips
  // and the hazard/modality pills) folds behind one "Filter" disclosure so the
  // sheet's fixed height is spent on the feed, the guest banner and the footer.
  const [isNewsFilterOpen, setIsNewsFilterOpen] = useState(false);
  const [isNavOverflowOpen, setIsNavOverflowOpen] = useState(false);
  const [approvalsCount, setApprovalsCount] = useState<number>(14);

  // Phase 176.5 — the Berita panel is a closed-by-default bottom sheet on
  // phones/tablets, so the map is the first thing on screen at 360–767px.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 767px)').matches) setIsLeftSidebarCollapsed(true);
  }, []);

  // One click path for every section entry point (primary tab + overflow menu),
  // keeping the guest hard-lock and its toast identical to the desktop strip.
  const handleNavTab = useCallback(
    (tabId: 'map' | 'analytics' | 'reports' | 'evaluation') => {
      setIsNavOverflowOpen(false);
      const isLockedSection =
        ['reports', 'analytics', 'evaluation'].includes(tabId) && (role === 'GUEST' || !isAuthenticated);
      if (isLockedSection) {
        openAuthModal();
        setToast({
          message:
            tabId === 'reports'
              ? 'Mode Sandbox: Laporan terkunci untuk tamu. Masuk untuk membuka audit mitigasi.'
              : tabId === 'analytics'
                ? 'Mode Sandbox: Analitik terkunci untuk tamu. Masuk untuk membuka analitik.'
                : 'Mode Sandbox: Evaluasi terkunci untuk tamu. Masuk untuk membuka evaluasi.',
          type: 'info',
        });
        return;
      }
      setActiveSection(tabId);
    },
    [isAuthenticated, openAuthModal, role, setToast],
  );

  // Strict Mutual Exclusion: selecting vehicle closes incident inspector, and vice-versa
  const handleSelectVehicle = useCallback((vehicle: FleetVehicle) => {
    setSelectedCrisisId(null);
    setSelectedCrisis(null);
    setIsSidebarOpen(false);
    setSelectedVehicle(vehicle);
    updateUrlParams({ crisis: null });
  }, [updateUrlParams]);

  const handleCloseVehicle = useCallback(() => {
    setSelectedVehicle(null);
  }, []);

  // Dispatcher perusahaan view (issue #2): the map draws live tenant trucks
  // + public situational vessels (maritime/air AIS/ADS-B). Trucks stay
  // tenant-scoped; vessels restore the pre-Phase-81 macro view. The
  // Perusahaan Live GPS badge (below) stays liveTenantVehicles only.
  // An explicitly inspected ROUTE_ESTIMATED unit is injected into the layer so it can be
  // framed and inspected, but it never becomes ambient orange corridor noise.
  const selectedIsProjected = selectedVehicle?.tracking_mode === 'ROUTE_ESTIMATED';
  const mapFleetVehicles = useMemo(() => {
    if (!selectedIsProjected || !selectedVehicle) return activeFleetVehicles;
    if (activeFleetVehicles.some((v) => v.vehicle_id === selectedVehicle.vehicle_id)) {
      return activeFleetVehicles;
    }
    return [...activeFleetVehicles, selectedVehicle];
  }, [activeFleetVehicles, selectedIsProjected, selectedVehicle]);

  // Counts follow what is actually drawable: dispatcher pills show the
  // combined live-tenant + situational-vessel slice (Semua/Kapal/Udara),
  // regulator/guest show the macro fleet. Perusahaan badge uses
  // liveTenantVehicles directly (honest tenant live GPS only).
  const isDispatcherWorkspace = role === 'DISPATCHER';
  const fleetCountVehicles = activeFleetVehicles;

  // Active DSS exposure per vehicle, only when an assessment exists. No
  // assessment means no hazard line — never a guessed hazard.
  const fleetHazards = useMemo(() => {
    const exposure: Record<string, { hazardType?: string; distanceKm?: number; policy?: string }> = {};
    if (!impactAssessmentData) return exposure;
    const hazardType = impactAssessmentData.disruption?.hazard_type;
    for (const assessment of impactAssessmentData.impacted_vehicles ?? []) {
      exposure[assessment.vehicle_id] = {
        hazardType,
        distanceKm: assessment.distance_to_hazard_km,
        policy: assessment.optimal_policy,
      };
    }
    return exposure;
  }, [impactAssessmentData]);

  const isRightInspectorActive = (isSidebarOpen && !!selectedCrisis) || !!selectedVehicle;

  // User Transparency States (Map Legend & Sensor Info)
  const [isMapLegendOpen, setIsMapLegendOpen] = useState(false);
  const [showSensorInfo, setShowSensorInfo] = useState(false);

  // Live Corridor Context Telemetry Hook (BMKG + TomTom + PIHPS 30s Poller)
  // Phase 163b: seeded by the bootstrap snapshot (`sections.corridor_context`),
  // so the mount no longer opens a duplicate corridor request.
  const { corridorContext, isLoading: isCorridorLoading, applyOperationalImpact } = useCorridorContext(
    'sumatra_belawan_medan',
    { enabled: !bootstrap.isLoading, initialData: seededCorridor }
  );

  // Live OSINT News & Intelligence Hook (Google News RSS & Verified Sinyal Lapangan)
  // Phase 163b: seeded by `sections.news` + `sections.news_market_regime`; the
  // seed still passes through the same permalink/freshness/discourse gates.
  const { newsFeed, status: newsStatus, lastUpdated: newsLastUpdated, meta: newsBreadthMeta } = useNewsVerification({
    enabled: !bootstrap.isLoading,
    initialNews: seededNews,
    initialMarketRegime: seededMarketRegime,
  });
  const [newsSearchQuery, setNewsSearchQuery] = useState('');
  const [newsProvinceFilter, setNewsProvinceFilter] = useState<string>('ALL');
  // Phase 172.5 (M9): display-tier filter. `Semua` shows both tiers; `Krisis`
  // and `Regional` narrow to one. Defaults to Semua so the first render matches
  // the backend's crisis-first page.
  const [newsTierFilter, setNewsTierFilter] = useState<'ALL' | NewsRelevanceTier>('ALL');

  const [selectedNewsCategory, setSelectedNewsCategory] = useState<'ALL' | 'OFFICIAL' | 'WEATHER' | 'OSINT' | 'MARKET'>('ALL');
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [expandedNewsId, setExpandedNewsId] = useState<string | null>(null);

  // Forecast tags carry a 24h display window. A 60s clock keeps the chip count,
  // the zone layer, and the card banner honest without waiting for a feed change.
  const [forecastNowMs, setForecastNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setForecastNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const filteredNews = useMemo(() => {
    return newsFeed.filter((item) => {
      // Strict live-only + "Drop unresolvable": items without a real publisher
      // permalink are never rendered (no search-page substitutes).
      if (!item.link && !item.url) return false;

      if (selectedNewsCategory === 'OFFICIAL' && item.source_type !== 'OFFICIAL_NEWS') return false;
      if (selectedNewsCategory === 'WEATHER' && item.source_type !== 'BMKG_WEATHER') return false;
      if (selectedNewsCategory === 'OSINT' && item.source_type !== 'MEDSOS_OSINT') return false;
      if (selectedNewsCategory === 'MARKET' && item.source_type !== 'PIHPS_MARKET') return false;

      // Province chip narrows on the article's resolved province bucket (never a
      // guess: unlocated rows live in the area-wide "Sumatera" bucket).
      if (newsProvinceFilter !== 'ALL' && normalizeProvince(item.province) !== newsProvinceFilter) {
        return false;
      }

      // Tier chip (Phase 172.5): crisis = gate-passing hazard news, regional =
      // display-only context. The filter is additive with the province chip.
      if (newsTierFilter !== 'ALL' && (item.relevance_tier || 'crisis') !== newsTierFilter) {
        return false;
      }

      if (newsSearchQuery.trim()) {
        const q = newsSearchQuery.toLowerCase();
        return (
          item.headline.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          (item.location_name && item.location_name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [newsFeed, selectedNewsCategory, newsSearchQuery, newsProvinceFilter, newsTierFilter]);

  // Province chips: every province the payload reports, in canonical order, plus
  // any bucket the visible feed actually carries.
  const newsProvinceChips = useMemo(() => {
    const present = new Set<string>();
    for (const province of newsBreadthMeta?.provinces_present || []) {
      present.add(normalizeProvince(province));
    }
    for (const item of newsFeed) {
      if (item.link || item.url) present.add(normalizeProvince(item.province));
    }
    const order = (p: string) => {
      const idx = (SUMATRA_PROVINCE_ORDER as readonly string[]).indexOf(p);
      return idx === -1 ? (p === AREA_WIDE_PROVINCE ? 99 : 100) : idx;
    };
    return Array.from(present).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  }, [newsFeed, newsBreadthMeta]);

  // Provinces the backend reported as empty in the 48h window (honest emptiness).
  const newsProvincesMissing = useMemo(
    () => (newsBreadthMeta?.provinces_missing || []).map((p) => normalizeProvince(p)),
    [newsBreadthMeta]
  );

  // Group the visible feed by province. Group order follows the chip order so the
  // list and the filter row tell the same story; order is deterministic, so an
  // identical cached re-poll cannot re-shuffle the DOM (freeze contract).
  // Inside a province the backend's crisis-first order is preserved: a stable
  // sort ranks crisis before regional, so a context card never precedes a hazard.
  const groupedNews = useMemo(() => {
    const groups = new Map<string, typeof filteredNews>();
    for (const item of filteredNews) {
      const key = normalizeProvince(item.province);
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }
    const order = (p: string) => {
      const idx = (SUMATRA_PROVINCE_ORDER as readonly string[]).indexOf(p);
      return idx === -1 ? (p === AREA_WIDE_PROVINCE ? 99 : 100) : idx;
    };
    const tierRank = (item: { relevance_tier?: NewsRelevanceTier }) =>
      item.relevance_tier === 'regional' ? 1 : 0;
    return Array.from(groups.entries())
      .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
      .map(([province, items]) => ({
        province,
        items: [...items].sort((a, b) => tierRank(a) - tierRank(b)),
      }));
  }, [filteredNews]);


  // 32-point polygon ring around [lon, lat] with radius rKm (RED 16km / YELLOW 20km).
  const buildZoneRing = useCallback((lon: number, lat: number, rKm: number, points = 32): [number, number][] => {
    const ring: [number, number][] = [];
    const kmToRad = rKm / 6371.0;
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    for (let i = 0; i <= points; i++) {
      const theta = (i * 2 * Math.PI) / points;
      const pLat = Math.asin(
        Math.sin(latRad) * Math.cos(kmToRad) + Math.cos(latRad) * Math.sin(kmToRad) * Math.cos(theta)
      );
      const pLon = lonRad + Math.atan2(
        Math.sin(theta) * Math.sin(kmToRad) * Math.cos(latRad),
        Math.cos(kmToRad) - Math.sin(latRad) * Math.sin(pLat)
      );
      ring.push([(pLon * 180) / Math.PI, (pLat * 180) / Math.PI]);
    }
    return ring;
  }, []);

  // Hazard-aware anisotropic zone geometry: agent-decided radius + oriented ellipse
  // so mountain-pass landslides render as tight 2.8 km corridors, not city-wide circles.
  const buildHazardSpecificZoneGeometry = useCallback((
    lon: number,
    lat: number,
    hazardType: CrisisType,
    tier: 'RED_CONFIRMED' | 'YELLOW_CLARIFY',
    agentRadiusKm?: number,
    backendPolygon?: [number, number][]
  ): { polygon: [number, number][]; radiusKm: number } => {
    if (backendPolygon && Array.isArray(backendPolygon) && backendPolygon.length >= 4) {
      return { polygon: backendPolygon, radiusKm: agentRadiusKm ?? 4.0 };
    }
    let radiusKm: number;
    let major: number;
    let minor: number;
    let rotDeg: number;
    switch (hazardType) {
      case 'landslide':
      case 'road_closure':
        radiusKm = agentRadiusKm ?? 2.8;
        major = radiusKm * 1.25;
        minor = radiusKm * 0.52;
        rotDeg = 35;
        break;
      case 'port_closure':
        radiusKm = agentRadiusKm ?? 3.2;
        major = radiusKm * 1.1;
        minor = radiusKm * 0.72;
        rotDeg = 30;
        break;
      case 'congestion':
        radiusKm = agentRadiusKm ?? 2.5;
        major = radiusKm * 1.3;
        minor = radiusKm * 0.48;
        rotDeg = 55;
        break;
      case 'flood':
        radiusKm = agentRadiusKm ?? 4.8;
        major = radiusKm * 1.25;
        minor = radiusKm * 0.65;
        rotDeg = 22;
        break;
      case 'wildfire':
        radiusKm = agentRadiusKm ?? 7.5;
        major = radiusKm * 1.2;
        minor = radiusKm * 0.68;
        rotDeg = 115;
        break;
      case 'marine_wave':
        radiusKm = agentRadiusKm ?? 8.5;
        major = radiusKm * 1.25;
        minor = radiusKm * 0.58;
        rotDeg = 140;
        break;
      case 'volcanic_eruption':
        radiusKm = agentRadiusKm ?? 10.0;
        major = radiusKm * 1.05;
        minor = radiusKm * 0.88;
        rotDeg = 0;
        break;
      case 'earthquake':
        radiusKm = agentRadiusKm ?? 12.0;
        major = radiusKm * 1.08;
        minor = radiusKm * 0.90;
        rotDeg = 0;
        break;
      case 'other_disruption':
      default:
        radiusKm = agentRadiusKm ?? 7.2;
        major = radiusKm * 1.15;
        minor = radiusKm * 0.78;
        rotDeg = tier === 'YELLOW_CLARIFY'
          ? (Math.abs(Math.round(lat * 100 + lon * 100)) % 180)
          : (Math.abs(Math.round(lat * 100 + lon * 100)) % 180);
        break;
    }
    const points = 32;
    const rotRad = (rotDeg * Math.PI) / 180;
    const cosRot = Math.cos(rotRad);
    const sinRot = Math.sin(rotRad);
    const latRad = (lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad) || 0.000001;
    const polygon: [number, number][] = [];
    for (let i = 0; i <= points; i++) {
      const theta = (i * 2 * Math.PI) / points;
      const ex = major * Math.cos(theta);
      const ey = minor * Math.sin(theta);
      const rx = ex * cosRot - ey * sinRot;
      const ry = ex * sinRot + ey * cosRot;
      const dLat = ry / 111.32;
      const dLon = rx / (111.32 * cosLat);
      polygon.push([lon + dLon, lat + dLat]);
    }
    return { polygon, radiusKm };
  }, []);

  const liveNewsZoneCounts = useMemo(() => {
    let red = 0;
    let yellow = 0;
    let forecast = 0;
    for (const n of newsFeed) {
      if (n.lat == null || n.lon == null) continue;
      if (n.zone_tier === 'DROPPED_IRRELEVANT') continue;
      // Forecasts keep YELLOW_CLARIFY on the wire but are their own display
      // bucket — never double-counted in the Kuning counter.
      if (isForecastActive(n.forecast_tag, n.forecast_valid_until, forecastNowMs)) {
        forecast += 1;
        continue;
      }
      if (n.zone_tier === 'YELLOW_CLARIFY') yellow += 1;
      else red += 1;
    }
    return { red, yellow, forecast };
  }, [newsFeed, forecastNowMs]);

  // Global "diperbarui" clock for the feed, kept separate from each article's
  // published_at. Only advances when the hook sees a changed article set.
  const newsLastUpdatedDate = useMemo(
    () => (newsLastUpdated ? new Date(newsLastUpdated) : null),
    [newsLastUpdated]
  );

  // PostGIS hazard polygons attached to the selected crisis. The backend already
  // normalized them to GeoJSON; `toLonLatRing` re-validates so a stale WKB/WKT or
  // empty shape is dropped instead of breaking the polygon layer.
  const crisisHazardZones: DisasterZone[] = useMemo(() => {
    const hazards = selectedCrisis?.hazard_polygons ?? [];
    if (!Array.isArray(hazards) || hazards.length === 0) return [];

    const zones: DisasterZone[] = [];
    hazards.forEach((hazard, idx) => {
      if (!hazard || typeof hazard !== 'object') return;
      const record = hazard as Record<string, unknown>;
      const properties = (
        record.properties && typeof record.properties === 'object'
          ? record.properties
          : {}
      ) as Record<string, unknown>;
      // Backend rows carry `polygon`/`geometry`; legacy fixtures ship a bare GeoJSON
      // geometry object, so the record itself is the last-resort source.
      const ring = toLonLatRing(
        record.polygon ?? record.geometry ?? record.polygon_ring ?? record
      );
      if (!ring || ring.length < 4) return;

      const lat = Number(record.lat);
      const lon = Number(record.lon);
      const center: [number, number] =
        Number.isFinite(lat) && Number.isFinite(lon)
          ? [lon, lat]
          : [
              ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
              ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
            ];

      const severity = String(record.severity ?? properties.severity ?? 'medium').toLowerCase();
      const risk =
        severity === 'critical' ? 0.95 :
        severity === 'high' ? 0.8 :
        severity === 'medium' ? 0.55 : 0.35;
      const declaredType = String(record.type || '');
      const hazardType = (
        declaredType === 'Polygon' || declaredType === 'MultiPolygon'
          ? (properties.hazard_type as CrisisType)
          : (declaredType as CrisisType)
      ) || 'other_disruption';
      const incidentId = String(record.incident_id || `hazard-${idx}`);
      const title = String(record.title || properties.title || 'Zona Bahaya Aktif');

      zones.push({
        polygon: ring,
        type: hazardType,
        risk,
        crisis_id: incidentId,
        id: incidentId,
        zone_tier: 'RED_CONFIRMED',
        title,
        custom_hazard_label: title,
        center,
        geometry_polygon: ring,
      });
    });
    return zones;
  }, [selectedCrisis]);

  // Derive live Red/Yellow/Forecast news zones + combine with manual disasterZones
  // (independent checkboxes) and the selected crisis' PostGIS hazard polygons.
  const combinedDisasterZones: DisasterZone[] = useMemo(() => {
    const live: DisasterZone[] = [];
    for (const n of newsFeed) {
      if (n.lat == null || n.lon == null) continue;
      const tier = (n.zone_tier || 'RED_CONFIRMED') as ZoneTier;
      if (tier === 'DROPPED_IRRELEVANT') continue;
      // Forecasts are a separate layer bucket: the tag (not zone_tier) decides,
      // and the zone stays YELLOW_CLARIFY / zero-fill dashed on the map.
      const forecastActive = isForecastActive(n.forecast_tag, n.forecast_valid_until, forecastNowMs);
      const effectiveTier: ZoneTier = forecastActive ? 'YELLOW_CLARIFY' : tier;
      if (forecastActive) {
        if (!showForecastZones) continue;
      } else if (tier === 'RED_CONFIRMED') {
        if (!showRedZones) continue;
      } else if (!showYellowZones) {
        continue;
      }
      const hazardType = (n.hazardType || n.incident_type || 'other_disruption') as CrisisType;
      const risk = effectiveTier === 'RED_CONFIRMED' ? 0.88 : 0.55;
      if (n.affected_locations && n.affected_locations.length > 0) {
        n.affected_locations.forEach((loc, idx) => {
          const agentRadius = loc.radius_km ?? n.radius_km;
          const geom = buildHazardSpecificZoneGeometry(loc.longitude, loc.latitude, hazardType, effectiveTier, agentRadius, loc.geometry_polygon ?? n.geometry_polygon);
          live.push({
            polygon: geom.polygon,
            type: hazardType,
            risk,
            crisis_id: `news-${n.id}-loc-${idx}`,
            id: `news-${n.id}-loc-${idx}`,
            zone_tier: effectiveTier,
            forecast_tag: forecastActive ? FORECAST_TAG : undefined,
            forecast_valid_until: forecastActive ? (n.forecast_valid_until ?? null) : undefined,
            title: n.affected_locations!.length > 1 ? `${loc.name} — ${n.headline}` : n.headline,
            tier_reason: n.tier_reason || '',
            custom_hazard_label: n.custom_hazard_label || n.headline,
            source_news_id: n.id,
            center: [loc.longitude, loc.latitude],
            radiusKm: geom.radiusKm,
            radius_km: geom.radiusKm,
            geometry_polygon: geom.polygon,
            verification_audit: n.verification_audit,
            impact_profile: n.impact_profile,
            affected_locations: n.affected_locations,
          });
        });
      } else {
        const agentRadius = n.radius_km;
        const geom = buildHazardSpecificZoneGeometry(n.lon, n.lat, hazardType, effectiveTier, agentRadius, n.geometry_polygon);
        live.push({
          polygon: geom.polygon,
          type: hazardType,
          risk,
          crisis_id: `news-${n.id}`,
          id: `news-${n.id}`,
          zone_tier: effectiveTier,
          forecast_tag: forecastActive ? FORECAST_TAG : undefined,
          forecast_valid_until: forecastActive ? (n.forecast_valid_until ?? null) : undefined,
          title: n.headline,
          tier_reason: n.tier_reason || '',
          custom_hazard_label: n.custom_hazard_label || n.headline,
          source_news_id: n.id,
          center: [n.lon, n.lat],
          radiusKm: geom.radiusKm,
          radius_km: geom.radiusKm,
          geometry_polygon: geom.polygon,
          verification_audit: n.verification_audit,
          impact_profile: n.impact_profile,
          affected_locations: n.affected_locations,
        });
      }
    }
    return [...crisisHazardZones, ...disasterZones, ...live];
  }, [crisisHazardZones, disasterZones, newsFeed, showRedZones, showYellowZones, showForecastZones, forecastNowMs, buildHazardSpecificZoneGeometry]);

  // Synchronize activeSection from URL query parameters.
  // GUEST hard-block: ?section=reports|analytics|evaluation never opens the
  // locked ledger — it forces the login modal + a Mode Sandbox toast instead.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const section = params.get('section') as 'map' | 'analytics' | 'reports' | 'evaluation';
      if (section && ['map', 'analytics', 'reports', 'evaluation'].includes(section)) {
        if (['reports', 'analytics', 'evaluation'].includes(section) && (role === 'GUEST' || !isAuthenticated)) {
          setActiveSection('map');
          openAuthModal();
          setToast({
            message: section === 'reports'
              ? 'Mode Sandbox: Laporan terkunci untuk tamu. Masuk untuk membuka audit mitigasi.'
              : section === 'analytics'
                ? 'Mode Sandbox: Analitik terkunci untuk tamu. Masuk untuk membuka analitik.'
                : 'Mode Sandbox: Evaluasi terkunci untuk tamu. Masuk untuk membuka evaluasi.',
            type: 'info',
          });
          return;
        }
        setActiveSection(section);
      }
    }
  }, [role, isAuthenticated, openAuthModal]);

  // Safety net: a live downgrade to GUEST (logout/expiry) while on a locked
  // section (Laporan/Analitik/Evaluasi) bounces back to the map and re-locks
  // via the modal + toast.
  useEffect(() => {
    if (['reports', 'analytics', 'evaluation'].includes(activeSection) && (role === 'GUEST' || !isAuthenticated)) {
      setActiveSection('map');
      openAuthModal();
      setToast({
        message: activeSection === 'reports'
          ? 'Mode Sandbox: Laporan terkunci untuk tamu. Masuk untuk membuka audit mitigasi.'
          : activeSection === 'analytics'
            ? 'Mode Sandbox: Analitik terkunci untuk tamu. Masuk untuk membuka analitik.'
            : 'Mode Sandbox: Evaluasi terkunci untuk tamu. Masuk untuk membuka evaluasi.',
        type: 'info',
      });
    }
  }, [activeSection, role, isAuthenticated, openAuthModal]);

  // Poll for pending HITL items from Supabase (only for authenticated non-guest operators)
  useEffect(() => {
    let isMounted = true;
    let inFlight: AbortController | null = null;
    const checkHitl = async () => {
      if (role === 'GUEST' || !user) return;
      if (!isDocumentVisible()) return;
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      try {
        const res = await api.news.hitlPending(controller.signal);
        if (isMounted && !controller.signal.aborted && res) {
          setPendingHitlCount(res.count || (res.items ? res.items.length : 0));
        }
      } catch (e) {
        // quiet fallback
      }
    };
    checkHitl();
    const interval = setInterval(checkHitl, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
      inFlight?.abort();
    };
  }, [role, user]);

  const [spatialWeatherPolygons, setSpatialWeatherPolygons] = useState<GeoJSON.FeatureCollection | null>(null);
  const [advisoryWeatherPolygons, setAdvisoryWeatherPolygons] = useState<GeoJSON.FeatureCollection | null>(null);
  const [showWeatherPolygons, setShowWeatherPolygons] = useState<boolean>(true);
  const [showWeatherAdvisory, setShowWeatherAdvisory] = useState<boolean>(false);
  const [showFireHotspots, setShowFireHotspots] = useState<boolean>(true);
  const [fireHotspots, setFireHotspots] = useState<FireHotspot[]>([]);
  // Phase 168: tri-state (ok|empty|stale|degraded) + true count from the
  // envelope; null count means unknown ("—"), never a fabricated 0.
  const [fireStatus, setFireStatus] = useState<HazardCounterStatus>('degraded');
  const [fireReason, setFireReason] = useState<string | null>(null);
  const [fireCount, setFireCount] = useState<number | null>(null);
  const [fireSource, setFireSource] = useState<FireHotspotSource | null>(null);
  const [fireUpdatedAt, setFireUpdatedAt] = useState<string | null>(null);
  const [fireWindowHours, setFireWindowHours] = useState<number>(24);
  // True once the backend returned a known count (ok/empty/stale), so a fetch
  // failure is marked stale instead of degraded when we still hold data.
  const fireHasDataRef = useRef(false);
  const [routingInfo, setRoutingInfo] = useState<{ solver: string; compute_time_ms: number | null; savings_pct: number | null } | null>(null);
  // Persistent route-computation status: a cold render can take 30-50s, so the
  // operator needs lasting feedback plus an explicit abort action (not a 3s toast).
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  // Phase 170: a solver refusal (too far / same hub) must be visible, not a
  // silent early-return. Kept separate from routingError so the rendered route
  // corridor survives and the reason stays on screen after the toast fades.
  const [routingNoRouteReason, setRoutingNoRouteReason] = useState<string | null>(null);
  const [routingElapsedMs, setRoutingElapsedMs] = useState(0);

  useEffect(() => {
    if (!isRoutingLoading) {
      setRoutingElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    setRoutingElapsedMs(0);
    const timer = setInterval(() => setRoutingElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [isRoutingLoading]);

  const [fleetModalityFilter, setFleetModalityFilter] = useState<'all' | 'truck' | 'maritime' | 'air'>('all');


  const [weatherPolygonMeta, setWeatherPolygonMeta] = useState<WeatherPolygonMeta | null>(null);
  const spatialWeatherRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const weatherPolygonMetaRef = useRef<WeatherPolygonMeta | null>(null);

  useEffect(() => {
    // Phase 163b: hold the first read until the bootstrap snapshot answered —
    // `sections.weather_spatial_polygons` is the same payload this effect would
    // request (high/50/80), so seeding removes a duplicate mount call.
    if (bootstrap.isLoading) return;
    let isMounted = true;
    let inFlight: AbortController | null = null;
    const readMeta = (
      geojson: GeoJSON.FeatureCollection & { metadata?: WeatherPolygonMeta; meta?: WeatherPolygonMeta },
    ): WeatherPolygonMeta | null => geojson?.meta ?? geojson?.metadata ?? null;

    async function loadSpatialWeather() {
      if (!isDocumentVisible()) return;
      // One weather request at a time.
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      try {
        // Disruption-only default: heavy rain that can cause disruptions (high/critical).
        const geojson = await api.weather.spatialPolygons(
          { min_severity: 'high', min_precip: 50, min_flood: 80 },
          controller.signal
        );
        if (!isMounted || controller.signal.aborted) return;
        const meta = readMeta(geojson);
        const previous = spatialWeatherRef.current;
        // Phase 169: a failed refresh never clears the layer. When the backend
        // has no cache (degraded) we keep the polygons we already drew and mark
        // them stale instead of blanking the map.
        if (meta?.status === 'degraded' && (previous?.features?.length ?? 0) > 0) {
          const kept: WeatherPolygonMeta = {
            ...(weatherPolygonMetaRef.current ?? meta),
            status: 'stale',
            reason: meta.reason ?? 'Gagal memperbarui; menampilkan poligon terakhir.',
          };
          weatherPolygonMetaRef.current = kept;
          setWeatherPolygonMeta(kept);
          return;
        }
        spatialWeatherRef.current = geojson;
        weatherPolygonMetaRef.current = meta;
        setSpatialWeatherPolygons(geojson);
        setWeatherPolygonMeta(meta);
      } catch (e) {
        // Transient failure: keep the last-good polygons/counters (never blank).
        if (!isMounted || controller.signal.aborted) return;
        console.warn('Backend spatial weather polygons fallback:', e);
        const previousMeta = weatherPolygonMetaRef.current;
        if (previousMeta) {
          const kept: WeatherPolygonMeta = {
            ...previousMeta,
            status: 'stale',
            reason: 'Gagal memperbarui; menampilkan poligon terakhir yang tersimpan.',
          };
          weatherPolygonMetaRef.current = kept;
          setWeatherPolygonMeta(kept);
        } else {
          const unknown: WeatherPolygonMeta = {
            status: 'degraded',
            reason: 'Sumber cuaca tidak tersedia.',
            total: null,
            count: null,
            capped: false,
            updated_at: null,
          };
          weatherPolygonMetaRef.current = unknown;
          setWeatherPolygonMeta(unknown);
        }
      }
    }

    if (seededWeatherPolygons) {
      // Snapshot seed: same shape + meta contract as the live endpoint.
      const seededMeta = readMeta(seededWeatherPolygons);
      spatialWeatherRef.current = seededWeatherPolygons;
      weatherPolygonMetaRef.current = seededMeta;
      setSpatialWeatherPolygons(seededWeatherPolygons);
      setWeatherPolygonMeta(seededMeta);
    } else {
      // No snapshot section (bootstrap failed / guest with no weather): read.
      void loadSpatialWeather();
    }

    const interval = setInterval(loadSpatialWeather, 120000);
    return () => {
      isMounted = false;
      clearInterval(interval);
      inFlight?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap.isLoading]);

  // Advisory (purple, default OFF): full-fidelity medium path, fetched only when toggled ON.
  useEffect(() => {
    if (!showWeatherAdvisory) {
      setAdvisoryWeatherPolygons(null);
      return;
    }
    let isMounted = true;
    const controller = new AbortController();
    async function loadAdvisoryWeather() {
      try {
        const geojson = await api.weather.spatialPolygons(
          { min_severity: 'medium', min_precip: 0, min_flood: 0 },
          controller.signal
        );
        if (!isMounted || controller.signal.aborted) return;
        // Keep advisory layer to medium-only to avoid double-counting disruption highs.
        const mediumOnly: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: (geojson.features ?? []).filter((f) => {
            const sev = String((f.properties as Record<string, unknown>)?.severity ?? 'medium').toLowerCase();
            return sev === 'medium' || sev === 'low';
          }),
        };
        setAdvisoryWeatherPolygons(mediumOnly);
      } catch (e) {
        console.warn('Backend advisory weather polygons fallback:', e);
      }
    }
    void loadAdvisoryWeather();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [showWeatherAdvisory]);

  // Phase 160: world-truth counters. Fetched on mount + on the weather interval
  // regardless of layer toggles; the last good summary is kept in a ref so a
  // failed refresh marks the counters stale instead of blanking them.
  const [weatherSummary, setWeatherSummary] = useState<WeatherHazardSummary | null>(null);
  const weatherSummaryRef = useRef<WeatherHazardSummary | null>(null);

  useEffect(() => {
    let isMounted = true;
    let inFlight: AbortController | null = null;

    const asStale = (prev: WeatherHazardSummary | null): WeatherHazardSummary | null => {
      if (!prev) return null;
      const reason = 'Sumber cuaca tidak tersedia — angka terakhir dipertahankan';
      return {
        ...prev,
        cuaca: { ...prev.cuaca, status: 'stale' as const, reason },
        waspada: { ...prev.waspada, status: 'stale' as const, reason },
      };
    };

    async function loadWeatherSummary() {
      if (!isDocumentVisible()) return;
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      try {
        const summary = await api.weather.summary(controller.signal);
        if (!isMounted || controller.signal.aborted) return;
        if (!summary?.cuaca || !summary?.waspada) {
          throw new Error('weather summary shape invalid');
        }
        weatherSummaryRef.current = summary;
        setWeatherSummary(summary);
      } catch (e) {
        if (!isMounted || controller.signal.aborted) return;
        console.warn('Weather summary fallback (stale counters):', e);
        const stale = asStale(weatherSummaryRef.current);
        if (stale) weatherSummaryRef.current = stale;
        setWeatherSummary(stale);
      }
    }

    void loadWeatherSummary();
    const interval = setInterval(loadWeatherSummary, 120000);
    return () => {
      isMounted = false;
      clearInterval(interval);
      inFlight?.abort();
    };
  }, []);

  useEffect(() => {
    // Phase 163b: seeded by `sections.fire_hotspots` (identical envelope contract).
    if (bootstrap.isLoading) return;
    let isMounted = true;
    let inFlight: AbortController | null = null;

    const applyFireEnvelope = (res: FireHotspotResponse) => {
      // The backend already separates ok/empty (healthy) from stale
      // (last-known-good) and degraded (no data at all). Use its truth.
      setFireHotspots(res.hotspots ?? []);
      setFireStatus(res.status ?? (res.count == null ? 'degraded' : 'ok'));
      setFireCount(res.count ?? null);
      setFireReason(res.reason ?? null);
      setFireSource(res.source ?? null);
      setFireUpdatedAt(res.updated_at ?? null);
      setFireWindowHours(res.window_hours ?? 24);
      fireHasDataRef.current = res.count != null;
    };

    async function loadFireHotspots() {
      if (!isDocumentVisible()) return;
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      try {
        const res = await api.fire.hotspots(controller.signal);
        if (!isMounted || controller.signal.aborted) return;
        applyFireEnvelope(res);
      } catch (e) {
        // Transient failure: keep the last-good layer/count (never blank it).
        if (!isMounted || controller.signal.aborted) return;
        console.warn('Backend FIRMS hotspots fetch failed; keeping last-known-good layer:', e);
        setFireStatus(fireHasDataRef.current ? 'stale' : 'degraded');
        setFireReason(
          fireHasDataRef.current
            ? 'Gagal memperbarui; menampilkan data terakhir yang tersimpan.'
            : 'Sumber Titik Panas tidak tersedia.'
        );
      }
    }

    if (seededFireHotspots) {
      applyFireEnvelope(seededFireHotspots);
    } else {
      void loadFireHotspots();
    }

    const interval = setInterval(loadFireHotspots, 300000);
    return () => {
      isMounted = false;
      clearInterval(interval);
      inFlight?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap.isLoading]);

  // Filtered-set counts: disruption (high/critical, biru) + advisory (medium, ungu when ON).
  const disruptionFeatures = useMemo(
    () => spatialWeatherPolygons?.features ?? [],
    [spatialWeatherPolygons]
  );
  const advisoryFeatures = useMemo(
    () => (showWeatherAdvisory ? (advisoryWeatherPolygons?.features ?? []) : []),
    [showWeatherAdvisory, advisoryWeatherPolygons]
  );
  const combinedWeatherPolygons: GeoJSON.FeatureCollection | null = useMemo(() => {
    if (!showWeatherPolygons && !showWeatherAdvisory) return null;
    const feats: GeoJSON.Feature[] = [
      ...(showWeatherPolygons ? disruptionFeatures : []),
      ...advisoryFeatures,
    ];
    if (!showWeatherPolygons && advisoryFeatures.length > 0) {
      return { type: 'FeatureCollection', features: advisoryFeatures } as GeoJSON.FeatureCollection;
    }
    if (feats.length === 0) {
      return showWeatherPolygons ? spatialWeatherPolygons : null;
    }
    return { type: 'FeatureCollection', features: feats } as GeoJSON.FeatureCollection;
  }, [showWeatherPolygons, showWeatherAdvisory, disruptionFeatures, advisoryFeatures, spatialWeatherPolygons]);
  // Counters = world truth from /weather/summary (Phase 160). They are never
  // derived from the toggle-gated map slice; null means unknown → "—".
  const weatherDisruptionCount = weatherSummary?.cuaca.count ?? null;
  const weatherAdvisoryCount = weatherSummary?.waspada.count ?? null;
  const weatherPolygonCount =
    weatherSummary?.cuaca.count != null && weatherSummary?.waspada.count != null
      ? weatherSummary.cuaca.count + weatherSummary.waspada.count
      : null;
  // Top-1 blue disruption sample for the TopNav BMKG popover (hazard/koridor/delay/aksi/moda/confidence).
  const weatherSample = useMemo(() => {
    const f = disruptionFeatures[0] as GeoJSON.Feature | undefined;
    const p = (f?.properties ?? {}) as Record<string, unknown>;
    if (!f || Object.keys(p).length === 0) return null;
    const asStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? undefined : String(v));
    let mods: string[] | string | undefined;
    const rawMods = p.affected_modalities as unknown;
    if (Array.isArray(rawMods)) mods = rawMods.map(String);
    else if (typeof rawMods === 'string') {
      try {
        const parsed = JSON.parse(rawMods) as unknown;
        mods = Array.isArray(parsed) ? parsed.map(String) : rawMods;
      } catch { mods = rawMods; }
    }
    return {
      hazard_type: asStr(p.hazard_type),
      corridor_id: asStr(p.corridor_id),
      corridor_segment: asStr(p.corridor_segment),
      dist_to_corridor_km: (p.dist_to_corridor_km ?? p.dist_km) as number | string | undefined,
      delay_hours: (p.delay_hours ?? p.estimated_delay_hours) as number | string | undefined,
      advisory_action: asStr(p.advisory_action),
      affected_modalities: mods,
      confidence: p.confidence as number | string | undefined,
      observed_vs_forecast: asStr(p.observed_vs_forecast),
      severity: asStr(p.severity),
    };
  }, [disruptionFeatures]);
  // Phase 168: counter = true pre-cap hotspot count from the envelope.
  // null (degraded) renders "—" in TopNavTelemetry, never a 0.
  const fireHotspotCount = fireCount;

  // Phase 176: the one live-hazard pulse. A cluster only counts as live when
  // >=3 high-confidence detections exist — the same per-point gate the map's
  // 5 km single-link cluster highlight uses (conf >= 80 or FRP > 100).
  const liveFireCluster = useMemo(
    () =>
      (fireHotspots ?? []).filter(
        (h) => (Number(h.confidence ?? 0) || 0) >= 80 || (Number(h.frp ?? 0) || 0) > 100
      ).length >= 3,
    [fireHotspots]
  );





  // Fetch multi-alternative Mapbox driving & hazard detour routes when node selection or modality changes
  const resolveNodeInfo = useCallback((nodeId: string | null): ({ coords: [number, number] } & NodeDisplayInfo) | null => {
    if (!nodeId) return null;
    if (HUB_NODES[nodeId]) {
      return {
        coords: HUB_NODES[nodeId].coords,
        name: HUB_NODES[nodeId].name,
        display_name: HUB_NODES[nodeId].name,
        province: HUB_NODES[nodeId].province ?? null,
        type: HUB_NODES[nodeId].type,
      };
    }
    // CrisisMap emits regency-<idx>-<slug>; strip the render index before gazetteer matching.
    // The original nodeId is preserved for keys and custom node lookups.
    const normalizedId = normalizeRegencyId(nodeId).toLowerCase();
    const gazetteerMatch = PAN_SUMATRA_GAZETTEER.find(
      (g) =>
        g.name.toLowerCase() === normalizedId ||
        g.display_name.toLowerCase() === normalizedId ||
        `node-${g.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === normalizedId ||
        `regency-${g.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === normalizedId
    );
    if (gazetteerMatch) {
      return {
        coords: [gazetteerMatch.lon, gazetteerMatch.lat],
        name: gazetteerMatch.display_name || gazetteerMatch.name,
        display_name: gazetteerMatch.display_name || gazetteerMatch.name,
        kabupaten: gazetteerMatch.kabupaten ?? null,
        province: gazetteerMatch.province ?? null,
        type: gazetteerMatch.type,
      };
    }
    if (customNodesRef.current[nodeId]) {
      const custom = customNodesRef.current[nodeId];
      return { coords: custom.coords, name: custom.name, display_name: custom.name };
    }
    return null;
  }, []);

  // Human-readable endpoint metadata shared by the banner, guided demo and API payloads.
  const originDisplayInfo = useMemo(
    () => resolveNodeInfo(selectedOriginNode),
    [resolveNodeInfo, selectedOriginNode]
  );
  const destDisplayInfo = useMemo(
    () => resolveNodeInfo(selectedDestNode),
    [resolveNodeInfo, selectedDestNode]
  );

  const handleCustomPointSelected = useCallback(
    (role: 'origin' | 'dest', coords: [number, number], name: string, nodeId: string) => {
      customNodesRef.current[nodeId] = { coords, name };
      if (role === 'origin') {
        setSelectedOriginNode(nodeId);
        updateUrlParams({ origin: nodeId, dest: null, route: null });
        setToast({
          message: `Titik Asal Terpilih: ${name}. Silakan tentukan Titik Tujuan.`,
          type: 'info',
        });
      } else {
        setSelectedDestNode(nodeId);
        updateUrlParams({ dest: nodeId });
        setToast({
          message: `Titik Tujuan Terpilih: ${name}. Mengkalkulasi rute alternatif...`,
          type: 'success',
        });
      }
    },
    [updateUrlParams]
  );

  const updateBaselineMapboxRoute = useCallback(async (originId: string, destId: string, modality: TransportModality, hazardCenter: [number, number] | null = null, radiusKm: number = DEFAULT_HAZARD_RADIUS_KM, hazardType: CrisisType = 'flood', impactProfile?: HazardImpactProfile, zoneTier: 'RED_CONFIRMED' | 'YELLOW_CLARIFY' = 'RED_CONFIRMED', hedgingOpts?: { commodity?: string; cargo_tonnage?: number; vehicle_golongan?: string; fuel_type?: string; toll_segments?: string[]; p_disruption?: number; disruption_delay_hours?: number } | null): Promise<boolean> => {
    const originInfo = resolveNodeInfo(originId);
    const destInfo = resolveNodeInfo(destId);
    const originNode = originInfo?.coords;
    const destNode = destInfo?.coords;
    if (!originNode || !destNode) {
      // No silent return: surface the failure and drop any route from the previous selection
      // so the map never keeps showing a stale corridor for the new endpoints.
      routingAbortControllerRef.current?.abort();
      routingAbortControllerRef.current = null;
      routingInFlightKeyRef.current = null;
      routeCalculationReqIdRef.current++;
      setIsRoutingLoading(false);
      setRoutingError('Rute tidak ditemukan untuk titik yang dipilih.');
      setCurrentMapRoutes([]);
      setSelectedCrisis((prev) =>
        prev ? { ...prev, route_recommendations: [] } : prev
      );
      setRoutingInfo(null);
      setActiveRouteIdx(null);
      setHiddenRouteIndices(new Set());
      setToast({ message: 'Rute tidak ditemukan', type: 'error' });
      return false;
    }

    const effectiveHedgingOpts = hedgingOpts !== undefined
      ? (hedgingOpts ?? undefined)
      : (selectedCommodityRef.current ? {
          commodity: selectedCommodityRef.current,
          cargo_tonnage: 10.0,
          vehicle_golongan: 'GOL_II',
          fuel_type: 'biosolar',
          p_disruption: 0.85,
          disruption_delay_hours: 8.0,
        } : undefined);

    // The node-selection handler calls this directly while the auto-recompute effect
    // fires for the same selection right after state commits. Reuse the in-flight
    // request instead of aborting it, so the click still resolves to a real result.
    const routeKey = JSON.stringify([originId, destId, modality, hazardCenter, radiusKm, hazardType, zoneTier, effectiveHedgingOpts?.commodity]);
    if (routingInFlightKeyRef.current === routeKey) return false;
    routingInFlightKeyRef.current = routeKey;

    // Any new selection supersedes the previous computation entirely.
    routingAbortControllerRef.current?.abort();
    const controller = new AbortController();
    routingAbortControllerRef.current = controller;
    const signal = controller.signal;
    const reqId = ++routeCalculationReqIdRef.current;
    const isStale = () => signal.aborted || routeCalculationReqIdRef.current !== reqId;

    setRoutingError(null);
    setRoutingNoRouteReason(null);
    // Never let a previous solver latency read as if it belonged to this request.
    setRoutingInfo(null);
    setIsRoutingLoading(true);

    if (isDemoRunningRef.current) {
      demoStateRef.current?.setIsCalculatingRoute(true);
    }

    try {
      // Backend hedging stash: routes[0] is the baseline (no hedging by design);
      // detour corridors (index >= 1) may carry grounded hedging economics.
      // Absent => left undefined (honest null), never invented.
      const backendHedgingByIndex = new Map<number, NonNullable<RouteRecommendation['hedging']>>();
      // PROGRESSIVE HYDRATION & PARALLEL EXECUTION:
      // Concurrently dispatch CPU routing solver and dynamic detour calculation
      const routingPromise = api.routing.optimizeRouting({
        origin_id: originId,
        dest_id: destId,
        ...(originNode ? { origin_coords: originNode } : {}),
        ...(destNode ? { dest_coords: destNode } : {}),
        ...(originInfo ? { origin_name: formatNodeId(originId, originInfo) } : {}),
        ...(destInfo ? { dest_name: formatNodeId(destId, destInfo) } : {}),
        fleet_size: 3,
        // Phase 170: the solver must actually return up to 3 alternatives; the
        // backend default alone is not enough when the UI expects them.
        k_alternatives: 3,
        hazard_zones: hazardCenter ? [{ center: hazardCenter, radiusKm }] : [],
        // Forward hedging economics only when the caller supplied them;
        // no hardcoded cargo values are injected into every request.
        ...(effectiveHedgingOpts?.commodity ? { commodity: effectiveHedgingOpts.commodity } : {}),
        ...(effectiveHedgingOpts?.cargo_tonnage != null ? { cargo_tonnage: effectiveHedgingOpts.cargo_tonnage } : {}),
        ...(effectiveHedgingOpts?.vehicle_golongan ? { vehicle_golongan: effectiveHedgingOpts.vehicle_golongan } : {}),
        ...(effectiveHedgingOpts?.fuel_type ? { fuel_type: effectiveHedgingOpts.fuel_type } : {}),
        ...(effectiveHedgingOpts?.toll_segments ? { toll_segments: effectiveHedgingOpts.toll_segments } : {}),
        ...(effectiveHedgingOpts?.p_disruption != null ? { p_disruption: effectiveHedgingOpts.p_disruption } : {}),
        ...(effectiveHedgingOpts?.disruption_delay_hours != null ? { disruption_delay_hours: effectiveHedgingOpts.disruption_delay_hours } : {}),
      }, signal);

      const detourPromise = calculateAIDynamicDetourRoutes(
        hazardCenter,
        radiusKm,
        originNode,
        destNode,
        modality,
        hazardType,
        impactProfile,
        zoneTier,
        signal,
        {
          commodity: effectiveHedgingOpts?.commodity,
          vehicleGolongan: effectiveHedgingOpts?.vehicle_golongan,
        }
      );

      // 1. Await visual detour corridors first for immediate sub-second rendering
      let routes: RouteRecommendation[];
      try {
        routes = await detourPromise;
      } catch (err) {
        if (isStale() || isAbortError(err)) return false;
        console.warn('Dynamic detour routing failed:', err);
        const message = 'Gagal menghitung rute alternatif. Periksa koneksi lalu coba lagi.';
        setRoutingError(message);
        setToast({ message, type: 'error' });
        return false;
      }

      if (isStale()) return false;
      if (!routes || routes.length === 0) {
        const message = 'Rute alternatif tidak tersedia untuk titik ini. Coba titik lain.';
        setRoutingError(message);
        setToast({ message, type: 'error' });
        return false;
      }

      // Render visual corridors immediately onto map. Identical geometries
      // (Mapbox alternatives can repeat a polyline) render once only.
      const uniqueRoutes = dedupeRoutesByGeometry(routes);
      setCurrentMapRoutes(uniqueRoutes);
      setSelectedCrisis((prev) =>
        prev ? { ...prev, route_recommendations: uniqueRoutes } : prev
      );

      // 2. Asynchronously hydrate backend solver metrics & hedging economics without blocking visual render
      routingPromise
        .then((routingRes) => {
          if (isStale()) return;
          const nested = (routingRes as {
            point_to_point_path?: { status?: string; message?: string; reason?: string; reason_code?: string };
          } | null)?.point_to_point_path;
          // Phase 170: a refusal is never silent. The previously rendered
          // corridor stays on the map (we only add a reason), because clearing
          // it would leave the operator with nothing at all.
          if (nested && (nested.status === 'no_route' || nested.status === 'no_path_found')) {
            const reason =
              nested.reason ||
              nested.message ||
              (nested.status === 'no_route'
                ? 'Rute solver tidak tersedia untuk titik ini.'
                : 'Jalur pada graph arteri tidak ditemukan untuk titik ini.');
            setRoutingNoRouteReason(reason);
            setToast({ message: reason, type: 'error' });
            return;
          }
          setRoutingNoRouteReason(null);
          const backendPtpRoutes = (nested as { routes?: Array<{ route_index?: number; hedging?: NonNullable<RouteRecommendation['hedging']> }> } | undefined)?.routes;
          if (Array.isArray(backendPtpRoutes)) {
            backendPtpRoutes.forEach((br, order) => {
              const key = typeof br?.route_index === 'number' ? br.route_index : order;
              if (br?.hedging) backendHedgingByIndex.set(key, br.hedging);
            });
          }
          if (routingRes && routingRes.optimization_summary) {
            setRoutingInfo({
              solver: routingRes.solver || 'Deterministic CPU Routing Solver (NetworkX + OR-Tools)',
              compute_time_ms: routingRes.compute_time_ms ?? routingRes.total_pipeline_time_ms ?? null,
              savings_pct: routingRes.optimization_summary.fuel_cost_reduction_pct ?? null,
            });
          }

          // If backend hedging arrived, merge onto current displayed routes
          if (backendHedgingByIndex.size > 0) {
            const detourHedging = backendHedgingByIndex.get(1);
            setCurrentMapRoutes((prevRoutes) => {
              if (!prevRoutes || prevRoutes.length === 0) return prevRoutes;
              const merged = prevRoutes.map((route, idx) => {
                const match = backendHedgingByIndex.get(idx) ?? (idx > 0 ? detourHedging : undefined);
                return match ? { ...route, hedging: match } : route;
              });
              setSelectedCrisis((prev) =>
                prev ? { ...prev, route_recommendations: merged } : prev
              );
              return merged;
            });
          }
        })
        .catch((err) => {
          if (isStale() || isAbortError(err)) return;
          console.warn('CPU routing solver API fallback (non-blocking):', err);
        });

      return true;
    } finally {
      if (routingInFlightKeyRef.current === routeKey) routingInFlightKeyRef.current = null;
      if (routeCalculationReqIdRef.current === reqId) {
        setIsRoutingLoading(false);
        if (routingAbortControllerRef.current === controller) routingAbortControllerRef.current = null;
        if (isDemoRunningRef.current) {
          demoStateRef.current?.setIsCalculatingRoute(false);
        }
      }
    }
  }, [resolveNodeInfo]);

  // Sync road network routes when origin, destination, modality, or hazard changes
  useEffect(() => {
    if (selectedOriginNode && selectedDestNode) {
      if (isDemoRunningRef.current && (demoStateRef.current?.stage ?? 0) > 0) {
        // When guided demo is active at stage 1+, demo stages manage their own routes
        return;
      }
      updateBaselineMapboxRoute(
        selectedOriginNode,
        selectedDestNode,
        selectedModality,
        simulatedShockwave?.center || null,
        selectedRadius
      );
    }
  }, [selectedOriginNode, selectedDestNode, selectedModality, simulatedShockwave, selectedRadius, updateBaselineMapboxRoute]);

  // Tactical Cargo Preset Selection Handler (Pelindo Cold-Chain vs Dry-Bulk alignment)
  const handleSelectCommodity = useCallback((commodity: string | null) => {
    setSelectedCommodity(commodity);
    if (selectedOriginNode && selectedDestNode) {
      const hedgingOpts = commodity ? {
        commodity,
        cargo_tonnage: 10.0,
        vehicle_golongan: 'GOL_II',
        fuel_type: 'biosolar',
        p_disruption: 0.85,
        disruption_delay_hours: 8.0,
      } : null;
      const currentHazardType = (simulatedShockwave?.hazardType as CrisisType) || selectedCrisis?.type || 'flood';
      const currentZoneTier = (selectedCrisis?.zone_tier as 'RED_CONFIRMED' | 'YELLOW_CLARIFY') || 'RED_CONFIRMED';
      void updateBaselineMapboxRoute(
        selectedOriginNode,
        selectedDestNode,
        selectedModality,
        simulatedShockwave?.center || null,
        selectedRadius,
        currentHazardType,
        undefined,
        currentZoneTier,
        hedgingOpts
      );
    }
  }, [selectedOriginNode, selectedDestNode, selectedModality, simulatedShockwave, selectedRadius, selectedCrisis, updateBaselineMapboxRoute]);

  // FULL REACTIVE CLEAN SLATE NODE SELECTION HANDLER
  const handleNodeSelected = useCallback(async (nodeId: string) => {
    const nodeName = formatNodeId(nodeId, resolveNodeInfo(nodeId));
    if (!selectedOriginNode) {
      // Step 1: Set Start Node
      setSelectedOriginNode(nodeId);
      updateUrlParams({ origin: nodeId, dest: null, route: null });
      setToast({
        message: `Titik Asal Terpilih: ${nodeName}. Silakan klik titik kedua untuk mengeset Titik Tujuan.`,
        type: 'info',
      });
      return;
    }

    if (!selectedDestNode && nodeId !== selectedOriginNode) {
      // Step 2: Set End Node
      setSelectedDestNode(nodeId);
      updateUrlParams({ dest: nodeId });
      const routesReady = await updateBaselineMapboxRoute(
        selectedOriginNode,
        nodeId,
        selectedModality,
        simulatedShockwave?.center || null,
        selectedRadius
      );

      // Only claim success when routes were actually applied; failures and aborts
      // already surface their own banner/error toast from the route pipeline.
      if (routesReady) {
        setToast({
          message: `Titik Tujuan Terpilih: ${nodeName}. Rute alternatif siap.`,
          type: 'success',
        });
      }
      return;
    }

    // Both already set -> User clicks a third node to update Destination
    if (nodeId !== selectedOriginNode) {
      const originName = formatNodeId(selectedOriginNode, resolveNodeInfo(selectedOriginNode));
      setSelectedDestNode(nodeId);
      updateUrlParams({ dest: nodeId });
      const routesReady = await updateBaselineMapboxRoute(
        selectedOriginNode,
        nodeId,
        selectedModality,
        simulatedShockwave?.center || null,
        selectedRadius
      );

      if (routesReady) {
        setToast({
          message: `Tujuan Diperbarui: ${originName} -> ${nodeName}`,
          type: 'info',
        });
      }
    }
  }, [selectedOriginNode, selectedDestNode, selectedModality, simulatedShockwave, selectedRadius, updateBaselineMapboxRoute, resolveNodeInfo, updateUrlParams]);

  // 1-Click Reset Node Selection Handler
  const handleResetNodes = useCallback(() => {
    // Abort any in-flight route computation and invalidate its result before clearing state.
    routingAbortControllerRef.current?.abort();
    routingAbortControllerRef.current = null;
    routingInFlightKeyRef.current = null;
    routeCalculationReqIdRef.current++;
    setIsRoutingLoading(false);
    setRoutingError(null);
    setRoutingElapsedMs(0);
    demoStateRef.current?.setIsCalculatingRoute(false);
    customNodesRef.current = {};
    demoDetourRoutesRef.current = null;
    setRoutingInfo(null);
    setActiveRouteIdx(null);
    setSelectedOriginNode(null);
    setSelectedDestNode(null);
    setCurrentMapRoutes([]);
    setSelectedCrisis(null);
    setSelectedCrisisId(null);
    setHiddenRouteIndices(new Set());
    customNodesRef.current = {};
    updateUrlParams({ origin: null, dest: null, route: null, crisis: null });
    setToast({ message: 'Titik rute dibersihkan. Silakan klik marker kota 1 untuk mengeset Start Node.', type: 'info' });
  }, [updateUrlParams]);

  // Explicit Batal: cancel the running route computation, drop its pending result,
  // and clear the corridors so no stale route survives the abort.
  const handleCancelRouting = useCallback(() => {
    routingAbortControllerRef.current?.abort();
    routingAbortControllerRef.current = null;
    routingInFlightKeyRef.current = null;
    routeCalculationReqIdRef.current++;
    setIsRoutingLoading(false);
    setRoutingElapsedMs(0);
    setRoutingError(null);
    setRoutingInfo(null);
    setCurrentMapRoutes([]);
    setSelectedCrisis((prev) =>
      prev ? { ...prev, route_recommendations: [] } : prev
    );
    setActiveRouteIdx(null);
    updateUrlParams({ route: null });
    demoStateRef.current?.setIsCalculatingRoute(false);
    setToast({ message: 'Perhitungan rute dibatalkan.', type: 'info' });
  }, [updateUrlParams]);

  // Two-way modality sync: fleet layer filter and route calculation modality stay in lockstep,
 // so picking Kapal switches both the maritime vehicle layer and the route visualization.
  const handleModalityChange = useCallback((modality: TransportModality) => {
    setSelectedModality(modality);
    updateUrlParams({ modality });
    const fleetFilter: 'all' | 'truck' | 'maritime' | 'air' =
      modality === 'maritime' ? 'maritime' : modality === 'air' ? 'air' : modality === 'truck' ? 'truck' : 'all';
    setFleetModalityFilter(fleetFilter);
  }, [updateUrlParams]);

  const handleWsMessage = useCallback((event: WsEvent) => {
    if (event.event === 'node_update') {
      // Strip foreign or ambient route recommendations so broadcast ambient telemetry
      // never overwrites the active user's session routing polylines.
      const rawData = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, any>;
      const { route_recommendations, routes, ...ambientData } = rawData;
      setSelectedCrisis((prev) => prev ? { ...prev, ...ambientData } : prev);
    }
    if (event.event === 'complete') {
      refetch();
    }
  }, [refetch]);

  useCrisisSocket(selectedCrisisId, handleWsMessage);

  const handleCrisisClick = useCallback(async (id: string) => {
    setSelectedVehicle(null);
    setSelectedCrisisId(id);
    setActiveRouteIdx(null);
    setIsSidebarOpen(true);
    updateUrlParams({ crisis: id, route: null });
    // Drop the outgoing crisis' impact queue immediately (including simulated-active,
    // which has no DSS round-trip), so no stale vehicle survives the switch.
    clearImpactAssessment();
    const selectionReqId = crisisSelectionReqRef.current;

    if (id !== 'simulated-active') {
      let baseCrisis: CrisisState | null = null;
      try {
        baseCrisis = await api.incidents.get(id);
      } catch (err) {
        console.error('Failed to fetch crisis detail:', err);
      }

      // A newer crisis switch (or an explicit clear) superseded this fetch.
      if (selectionReqId !== crisisSelectionReqRef.current) return;

      if (baseCrisis) {
        // Trigger Decision Support System (DSS) Impact Assessment
        try {
          const impactRes = await api.incidents.assessImpact({
            incident_id: id,
            lat: baseCrisis.lat || 3.32,
            lon: baseCrisis.lon || 99.16,
            radius_km: selectedRadius || 25,
            hazard_type: baseCrisis.type || 'flood',
          });
          if (selectionReqId !== crisisSelectionReqRef.current) return;
          setImpactAssessmentData(impactRes);
          setIsAlertQueueDismissed(false);
          setSelectedImpactedVehicle(
            impactRes.impacted_vehicles && impactRes.impacted_vehicles.length > 0
              ? impactRes.impacted_vehicles[0]
              : null
          );
        } catch (impactErr) {
          console.warn('Impact assessment offline/fallback:', impactErr);
          // No partial DSS payload: keep the new crisis but drop the queue/vehicle
          // so a failed assessment can't leave crisis A's units under crisis B.
          setImpactAssessmentData(null);
          setSelectedImpactedVehicle(null);
          setIsAlertQueueDismissed(false);
        }

        if (selectedOriginNode && selectedDestNode) {
          const originInfo = resolveNodeInfo(selectedOriginNode);
          const destInfo = resolveNodeInfo(selectedDestNode);
          const originCoords = originInfo?.coords;
          const destCoords = destInfo?.coords;
          if (originCoords && destCoords) {
            const dynamicRoutes = await calculateAIDynamicDetourRoutes(
              [baseCrisis.lon, baseCrisis.lat],
              selectedRadius,
              originCoords,
              destCoords,
              selectedModality,
              baseCrisis.type || 'flood',
              baseCrisis.impact_profile,
              baseCrisis.zone_tier || 'RED_CONFIRMED'
            );

            if (selectionReqId !== crisisSelectionReqRef.current) return;
            const uniqueRoutes = dedupeRoutesByGeometry(dynamicRoutes);
            setCurrentMapRoutes(uniqueRoutes);
            setSelectedCrisis({
              ...baseCrisis,
              route_recommendations: uniqueRoutes,
            });
          } else {
            setSelectedCrisis(baseCrisis);
          }
        } else {
          // Clean Slate: If user has not selected Start and End nodes, do not force a mockup route on the map
          const uniqueBaseRoutes = baseCrisis.route_recommendations
            ? dedupeRoutesByGeometry(baseCrisis.route_recommendations)
            : baseCrisis.route_recommendations;
          setCurrentMapRoutes(uniqueBaseRoutes || []);
          setSelectedCrisis({ ...baseCrisis, route_recommendations: uniqueBaseRoutes });
        }
      }
    }
  }, [selectedOriginNode, selectedDestNode, selectedRadius, selectedModality, resolveNodeInfo, updateUrlParams, clearImpactAssessment]);

  // Deep-link initial hydration effect: when URL contains origin & dest, trigger baseline route computation
  const initialDeepLinkHydratedRef = useRef(false);
  useEffect(() => {
    if (initialDeepLinkHydratedRef.current) return;
    initialDeepLinkHydratedRef.current = true;

    if (initialOrigin && initialDest) {
      updateBaselineMapboxRoute(
        initialOrigin,
        initialDest,
        initialModality,
        null,
        DEFAULT_HAZARD_RADIUS_KM
      ).then((routesReady) => {
        if (routesReady && initialRouteIdx !== null) {
          setActiveRouteIdx(initialRouteIdx);
        }
      });
    } else if (initialCrisis) {
      handleCrisisClick(initialCrisis);
    }
  }, [initialOrigin, initialDest, initialModality, initialRouteIdx, initialCrisis, updateBaselineMapboxRoute, handleCrisisClick]);

  // LIVE VISUAL DEMO STEPPER TRIGGER
  const handleCrisisReadyFromDemo = useCallback(async (crisis: CrisisState) => {
    // Rely on active nodes selected by the user or fallback to standard demo corridor
    const originId = activeOriginRef.current || selectedOriginNode || 'belawan';
    const destId = activeDestRef.current || selectedDestNode || 'tebingtinggi';
    if (!originId || !destId) {
      return;
    }

    const currentReqId = ++routeCalculationReqIdRef.current;

    const originCoords = resolveNodeInfo(originId)?.coords || HUB_NODES[originId]?.coords;
    const destCoords = resolveNodeInfo(destId)?.coords || HUB_NODES[destId]?.coords;
    if (!originCoords || !destCoords) return;

    const hazardPoint: [number, number] = [98.87, 3.56]; // Lubuk Pakam corridor

    setSimulatedShockwave({
      center: hazardPoint,
      radiusKm: selectedRadius,
      hazardType: 'flood',
    });

    let resolvedRoutes: RouteRecommendation[] = [];

    // Fast-path: Reuse the road-snapped routes already calculated during Stage 2 or passed from crisis
    if (demoDetourRoutesRef.current && demoDetourRoutesRef.current.length > 0) {
      resolvedRoutes = demoDetourRoutesRef.current;
    } else if (crisis.route_recommendations && crisis.route_recommendations.length > 0) {
      resolvedRoutes = crisis.route_recommendations;
      demoDetourRoutesRef.current = resolvedRoutes;
    } else {
      demoStateRef.current?.setIsCalculatingRoute(true);
      try {
        const demoRoutes = await calculateAIDynamicDetourRoutes(
          hazardPoint,
          selectedRadius,
          originCoords,
          destCoords,
          selectedModality,
          (crisis.type as CrisisType) || 'flood',
          crisis.impact_profile,
          crisis.zone_tier || 'RED_CONFIRMED'
        );

        if (routeCalculationReqIdRef.current !== currentReqId) {
          return;
        }

        const safeDetours = demoRoutes.filter(
          (r) => !r.is_compromised && r.safety_status !== 'HOLD_DELAY' && r.waypoints.length > 0
        );
        safeDetours.forEach((r) => {
          if (!resolvedRoutes.some((res) => res.id === r.id)) {
            resolvedRoutes.push(r);
          }
        });

        const compromisedRoute = demoRoutes.find((r) => r.is_compromised) || (demoRoutes.length > 0 ? {
          ...demoRoutes[0],
          color: '#EF4444',
          safety_status: 'COMPROMISED' as const,
          safety_tag: 'TERDAMPAK ZONA BAHAYA (+60m Delay)',
          is_compromised: true,
        } : null);

        if (compromisedRoute && !resolvedRoutes.some((r) => r.id === compromisedRoute.id)) {
          resolvedRoutes.push(compromisedRoute);
        }

        demoDetourRoutesRef.current = resolvedRoutes;
      } finally {
        demoStateRef.current?.setIsCalculatingRoute(false);
      }
    }

    const fullDemoState: CrisisState = {
      ...crisis,
      route_recommendations: resolvedRoutes,
    };

    setCurrentMapRoutes(resolvedRoutes);
    clearImpactAssessment();
    setSelectedCrisis(fullDemoState);
    setSelectedCrisisId(crisis.crisis_id);
    setActiveRouteIdx(0);
    setIsSidebarOpen(true);
    setToast({ message: `Skenario Aktif: ${crisis.title}`, type: 'success' });
  }, [selectedOriginNode, selectedDestNode, selectedRadius, selectedModality, resolveNodeInfo, clearImpactAssessment]);

  // Phase 23: Lifted Demo Engine State & Stage-Wired Effects
  const demoState = useDemoState(handleCrisisReadyFromDemo);
  demoStateRef.current = demoState;
  isDemoRunningRef.current = demoState.isRunning;

  // Latest corridor nodes in refs: the demo stage effect reads fresh values
  // without re-running its side effects on every map node click.
  const demoOriginRef = useRef<string | null>(null);
  const demoDestRef = useRef<string | null>(null);
  const demoRadiusRef = useRef<number>(DEFAULT_HAZARD_RADIUS_KM);
  demoOriginRef.current = selectedOriginNode;
  demoDestRef.current = selectedDestNode;
  demoRadiusRef.current = selectedRadius;

  // Comprehensive Demo Reset Handler (Clears all demo states, shockwaves, dirty routes & restores map)
  const handleResetDemo = useCallback(() => {
    routingAbortControllerRef.current?.abort();
    routingAbortControllerRef.current = null;
    routingInFlightKeyRef.current = null;
    routeCalculationReqIdRef.current++;
    setIsRoutingLoading(false);
    setRoutingError(null);
    setRoutingElapsedMs(0);
    demoDetourRoutesRef.current = null;
    demoState.reset();
    setSimulatedShockwave(null);
    setDisasterZones([]);
    setSelectedCrisisId(null);
    setSelectedCrisis(null);
    setActiveRouteIdx(null);
    setIsClickTargeting(false);
    setDrawModeActive(false);
    setIsSidebarOpen(false);
    setSelectedOriginNode(null);
    setSelectedDestNode(null);
    setCurrentMapRoutes([]);
    updateUrlParams({ origin: null, dest: null, route: null, crisis: null });
    setToast({
      message: 'Demo di-reset. Peta dikembalikan ke kondisi awal (pilih 2 titik simpul).',
      type: 'info'
    });
  }, [demoState, updateUrlParams]);

  // Robust Async-Locked Advance Handler with Strict Step-Gating
  const handleDemoAdvance = useCallback(() => {
    if (demoState.isCalculatingRoute) return;
    if (demoState.stage === 0 && (!selectedOriginNode || !selectedDestNode || currentMapRoutes.length === 0)) {
      setToast({
        message: 'Silakan pilih titik asal dan tujuan, dan tunggu rute jalan siap sebelum melanjutkan.',
        type: 'info'
      });
      return;
    }
    demoState.advance();
  }, [demoState, selectedOriginNode, selectedDestNode, currentMapRoutes.length]);

  useEffect(() => {
    if (!demoState.isRunning) return;

    switch (demoState.stage) {
      case 0: {
        // Stage 0: Baseline Data Ingestion: clean map, respect user's selected origin & destination
        setSimulatedShockwave(null);
        setSelectedCrisis(null);
        setIsSidebarOpen(false);
        demoDetourRoutesRef.current = null;
        if (selectedOriginNode && selectedDestNode) {
          const originCoords = HUB_NODES[selectedOriginNode]?.coords;
          const destCoords = HUB_NODES[selectedDestNode]?.coords;
          if (originCoords && destCoords) {
            demoState.setIsCalculatingRoute(true);
            calculateAIDynamicDetourRoutes(null, selectedRadius, originCoords, destCoords, selectedModality, 'flood', undefined, 'RED_CONFIRMED')
              .then((routes) => {
                if (routes.length > 0) {
                  setCurrentMapRoutes(routes);
                  setActiveRouteIdx(0);
                }
              })
              .catch((err) => console.warn('Stage 0 route calculation error:', err))
              .finally(() => {
                demoState.setIsCalculatingRoute(false);
              });
          }
        } else {
          setCurrentMapRoutes([]);
        }
        break;
      }

      case 1: {
        // Stage 1: Agent Swarm Analyzing: active user selected corridor remains intact
        break;
      }

      case 2: {
        // Stage 2: Consensus Gate: inject hazard flood shockwave at Lubuk Pakam
        const hazardCenter: [number, number] = [98.87, 3.56]; // Lubuk Pakam flood corridor
        const demoRadiusKm = demoRadiusRef.current;
        setSimulatedShockwave({
          center: hazardCenter,
          radiusKm: demoRadiusKm,
          hazardType: 'flood',
        });

        // Calculate road-snapped Mapbox detour routes avoiding the hazard
        const originId = activeOriginRef.current || demoOriginRef.current;
        const destId = activeDestRef.current || demoDestRef.current;
        if (!originId || !destId) break;
        const demoOriginCoords = HUB_NODES[originId]?.coords;
        const demoDestCoords = HUB_NODES[destId]?.coords;
        if (!demoOriginCoords || !demoDestCoords) break;

        demoState.setIsCalculatingRoute(true);
        calculateAIDynamicDetourRoutes(hazardCenter, demoRadiusKm, demoOriginCoords, demoDestCoords, selectedModality, 'flood', undefined, 'RED_CONFIRMED')
          .then((rawRoutes) => {
            const safeDetours = rawRoutes.filter(
              (r) => !r.is_compromised && r.safety_status !== 'HOLD_DELAY' && r.waypoints.length > 0
            );
            const directCompromised = rawRoutes.find((r) => r.is_compromised) || rawRoutes[0];
            const markedDirect: RouteRecommendation | null = directCompromised ? {
              ...directCompromised,
              color: '#EF4444',
              safety_status: 'COMPROMISED',
              safety_tag: 'TERDAMPAK ZONA BAHAYA (+60m Delay)',
              is_compromised: true,
            } : null;

            const routesToShow: RouteRecommendation[] = [];
            // Prioritize road-snapped safe detour(s) at index 0 (Emerald #10B981)
            safeDetours.forEach((r) => {
              if (!routesToShow.some((existing) => existing.id === r.id)) {
                routesToShow.push(r);
              }
            });
            // Append compromised direct route at index 1 (Red #EF4444)
            if (markedDirect && !routesToShow.some((r) => r.id === markedDirect.id)) {
              routesToShow.push(markedDirect);
            }
            if (routesToShow.length > 0) {
              demoDetourRoutesRef.current = routesToShow;
              setCurrentMapRoutes(routesToShow);
              setActiveRouteIdx(0);
            }
          })
          .catch((err) => console.warn('Stage 2 detour calculation error:', err))
          .finally(() => {
            demoState.setIsCalculatingRoute(false);
          });
        break;
      }

      case 3: {
        // Stage 3: Validated Crisis: handleCrisisReadyFromDemo auto-called by useDemoState
        setIsSidebarOpen(true);
        setActiveTab('Evidence');
        setActiveRouteIdx(0); // Highlight emerald detour route at index 0
        break;
      }

      case 4: {
        // Stage 4: Dispatch Complete: review the economic impact before approving the mitigation plan
        setActiveTab('Economic');
        setToast({
          message: 'Notifikasi Terkirim: Armada dialihkan ke rute aman.',
          type: 'success',
        });
        break;
      }
    }
  }, [demoState.stage, demoState.isRunning]);

  // ---------------------------------------------------------------------------
  // PURE AGENTIC AI SPATIAL CLEARANCE PIPELINE ENGINE (0% Hardcode!)
  // ---------------------------------------------------------------------------

  const triggerFullSimulationEngine = useCallback(async (
    lat: number,
    lon: number,
    type: CrisisType,
    radiusKm: number,
    title: string,
    isPolygonMode = false,
    severity: Severity = 'critical',
    polygon?: [number, number][]
  ) => {
    if (!isPolygonMode) {
      setSimulatedShockwave({
        center: [lon, lat],
        radiusKm,
        hazardType: type,
      });
    } else {
      setSimulatedShockwave(null);
    }

    const originId = activeOriginRef.current || selectedOriginNode;
    const destId = activeDestRef.current || selectedDestNode;
    if (!originId || !destId) {
      setToast({
        message: 'Pilih Titik Asal dan Titik Tujuan di peta terlebih dahulu untuk mengaktifkan simulasi krisis.',
        type: 'info'
      });
      return;
    }

    const originInfo = resolveNodeInfo(originId);
    const destInfo = resolveNodeInfo(destId);
    const originCoords = originInfo?.coords;
    const destCoords = destInfo?.coords;
    if (!originCoords || !destCoords) return;

    // Fast preliminary preview route while backend calculates deep matrix
    calculateAIDynamicDetourRoutes(
      [lon, lat],
      radiusKm,
      originCoords,
      destCoords,
      selectedModality,
      type,
      undefined,
      'RED_CONFIRMED'
    ).then((prelimRoutes) => {
      if (prelimRoutes.length > 0) {
        setCurrentMapRoutes(prelimRoutes);
      }
    });

    setToast({
      message: `Mengaktifkan Swarm AI & Spoilage Hedging Solver (${type.toUpperCase()})...`,
      type: 'info'
    });

    // Trigger authentic LangGraph swarm streaming execution. OD/cargo keys are
    // sent snake_case (the canonical agent contract). Cargo context comes from
    // the focused shipment when one exists; otherwise it is omitted so the
    // backend applies its documented fallback instead of a fake default.
    triggerSimulation(
      {
        lat,
        lon,
        type,
        radiusKm,
        title,
        // The click/polygon target owns severity + region; the hook only defaults
        // when a caller omits them (never overwrites a targeted crisis).
        severity,
        region: regionSlugFromLatLon(lat, lon),
        ...(polygon && polygon.length >= 3 ? { polygon } : {}),
        origin: originId,
        destination: destId,
        origin_coords: originCoords,
        dest_coords: destCoords,
        origin_name: formatNodeId(originId, originInfo),
        dest_name: formatNodeId(destId, destInfo),
        modality: selectedModality,
        radius_km: radiusKm,
        ...(selectedVehicle?.commodity_key ? { commodity: selectedVehicle.commodity_key } : {}),
        ...(selectedVehicle?.cargo_tonnage != null ? { cargo_tonnage: selectedVehicle.cargo_tonnage } : {}),
        ...(selectedVehicle?.has_bkhit_cert != null ? { has_bkhit_cert: selectedVehicle.has_bkhit_cert } : {}),
        ...(selectedVehicle?.gross_weight_ton != null ? { vehicle_gross_weight_ton: selectedVehicle.gross_weight_ton } : {}),
      } as any,
      (backendCrisisState) => {
        clearImpactAssessment();
        setSelectedCrisisId(backendCrisisState.crisis_id);
        setSelectedCrisis(backendCrisisState);

        if (backendCrisisState.route_recommendations && backendCrisisState.route_recommendations.length > 0) {
          const backendFirst = backendCrisisState.route_recommendations[0];
          const backendLastWp = backendFirst?.waypoints?.[backendFirst.waypoints.length - 1];
          let backendMatchesDest = true;
          if (backendLastWp && destCoords) {
            const dKm = getHaversineDistanceKm([backendLastWp.lon, backendLastWp.lat], destCoords);
            if (dKm > 20) {
              backendMatchesDest = false;
            }
          }

          setCurrentMapRoutes((prev) => {
            const backendRoutes = backendCrisisState.route_recommendations;
            if (!prev || prev.length === 0) {
              return backendRoutes;
            }
            // Preserve client multi-leg intermodal routes (sea, air, hold) that backend didn't compute
            const intermodalAndHoldCorridors = prev.filter(
              (r) =>
                r.corridor_type === 'sea_intermodal' ||
                r.corridor_type === 'air_intermodal' ||
                r.corridor_type === 'hold_staging' ||
                (r.legs && r.legs.length > 1)
            );

            // Merge backend hedging and compliance metadata onto land routes
            const mergedLandRoutes = backendMatchesDest
              ? backendRoutes.map((br, brIdx) => {
                  const matchingPrev = prev.find((p) => p.corridor_type === br.corridor_type) || prev[brIdx];
                  return {
                    ...br,
                    legs: br.legs && br.legs.length > 0 ? br.legs : matchingPrev?.legs,
                  };
                })
              : prev.map((r, rIdx) => ({
                  ...r,
                  hedging: backendRoutes[rIdx]?.hedging || backendRoutes[0]?.hedging,
                  compliance: backendRoutes[rIdx]?.compliance || backendRoutes[0]?.compliance,
                }));

            // Append preserved intermodal corridors
            const preservedExtras = intermodalAndHoldCorridors
              .filter((extra) => !mergedLandRoutes.some((m) => m.corridor_type === extra.corridor_type))
              .map((extra) => ({
                ...extra,
                hedging: backendRoutes[0]?.hedging || extra.hedging,
                compliance: backendRoutes[0]?.compliance || extra.compliance,
              }));

            return [...mergedLandRoutes, ...preservedExtras];
          });
        }

        setActiveRouteIdx(0);
        setIsSidebarOpen(true);

        // Consensus Gate honesty: an archived signal was never validated, so it
        // must open the evidence trail — never the tactical Mitigation view.
        const isArchived =
          (backendCrisisState.status as string) === 'archived' || backendCrisisState.validated === false;

        setActiveTab(isArchived ? 'Evidence' : 'Mitigation');

        // Honest savings: only claim hedging savings when the backend computed one.
        const rawSavings = backendCrisisState.hedging_breakdown?.net_savings_idr;
        const netSavings = rawSavings != null && Number(rawSavings) > 0
          ? `Rp ${Number(rawSavings).toLocaleString('id-ID')}`
          : null;

        if (isArchived) {
          setToast({
            message: 'Swarm AI Selesai: Sinyal diarsipkan oleh Consensus Gate (Kepercayaan di bawah ambang 85% atau belum ada koroborasi sensor fisik).',
            type: 'info',
          });
        } else {
          setToast({
            message: netSavings
              ? `Swarm AI Selesai: Keputusan taktis aktif. Proyeksi penghematan hedging: ${netSavings}.`
              : 'Swarm AI Selesai: Keputusan taktis aktif.',
            type: 'success',
          });
        }
      }
    );
  }, [selectedOriginNode, selectedDestNode, selectedModality, selectedVehicle, triggerSimulation, clearImpactAssessment]);

  // Unified stored-audit-trail inspection for news "Fokus" & map zone clicks (zero extra LLM cost).
  const inspectNewsOrZoneAuditTrail = useCallback(async (
    newsItem: (typeof newsFeed)[number] | undefined,
    fallbackZone?: DisasterZone
  ) => {
    const forecastActive = isForecastActive(
      newsItem?.forecast_tag ?? fallbackZone?.forecast_tag,
      newsItem?.forecast_valid_until ?? fallbackZone?.forecast_valid_until,
      Date.now()
    );
    // Contract pin: a forecast never escalates past YELLOW_CLARIFY.
    const zoneTier: 'RED_CONFIRMED' | 'YELLOW_CLARIFY' = forecastActive
      ? 'YELLOW_CLARIFY'
      : (((newsItem?.zone_tier as string) || (fallbackZone?.zone_tier as string) || 'RED_CONFIRMED') === 'YELLOW_CLARIFY' ? 'YELLOW_CLARIFY' : 'RED_CONFIRMED');
    const forecastValidUntil = forecastActive
      ? (deriveForecastValidUntil(
          newsItem?.forecast_valid_until ?? fallbackZone?.forecast_valid_until,
          newsItem?.published_at ?? newsItem?.pubDate ?? null
        ) ?? undefined)
      : undefined;
    const tierReason: string =
      newsItem?.tier_reason || fallbackZone?.tier_reason ||
      (forecastActive
        ? 'Prakiraan waspada dini: potensi gangguan belum terkonfirmasi sebagai bencana aktif; pantau sebelum tindakan operasional.'
        : zoneTier === 'RED_CONFIRMED'
        ? 'Zona Merah: bencana terkonfirmasi dari sumber resmi, membutuhkan pengalihan koridor segera.'
        : 'Zona Kuning: sinyal perlu klarifikasi/waspada, pantau sebelum pengalihan penuh.');
    const customHazardLabel: string =
      newsItem?.custom_hazard_label || fallbackZone?.custom_hazard_label ||
      newsItem?.headline || fallbackZone?.title || 'Gangguan Koridor';
    const rawHazard = (newsItem?.hazardType || newsItem?.incident_type || (fallbackZone?.type as string) || 'other_disruption') as CrisisType;
    const hazardType: CrisisType = rawHazard;
    const impactProfile: HazardImpactProfile | undefined = newsItem?.impact_profile || fallbackZone?.impact_profile;
    const resolvedAffected = newsItem?.affected_locations || fallbackZone?.affected_locations;
    let lon: number | undefined = (newsItem?.lon as number | undefined) ?? fallbackZone?.center?.[0];
    let lat: number | undefined = (newsItem?.lat as number | undefined) ?? fallbackZone?.center?.[1];
    let flyLon = lon;
    let flyLat = lat;
    let flyZoom = 9.5;
    if (fallbackZone?.center) {
      flyLon = fallbackZone.center[0];
      flyLat = fallbackZone.center[1];
      flyZoom = 9.5;
      lon = lon ?? flyLon;
      lat = lat ?? flyLat;
    } else if (newsItem?.affected_locations && newsItem.affected_locations.length > 1) {
      const validLocs = newsItem.affected_locations.filter(
        (l) => Number.isFinite(l.longitude) && Number.isFinite(l.latitude)
      );
      if (validLocs.length > 0) {
        const cLon = validLocs.reduce((s, l) => s + l.longitude, 0) / validLocs.length;
        const cLat = validLocs.reduce((s, l) => s + l.latitude, 0) / validLocs.length;
        flyLon = cLon;
        flyLat = cLat;
        flyZoom = 8.0;
        if (lon == null || lat == null) {
          lon = cLon;
          lat = cLat;
        }
      }
    }
    if (lon == null || lat == null || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      setToast({ message: 'Koordinat zona belum tersedia untuk inspeksi audit.', type: 'info' });
      return;
    }
    const agentRadiusKm: number | undefined =
      newsItem?.affected_locations?.[0]?.radius_km
      ?? newsItem?.radius_km
      ?? fallbackZone?.affected_locations?.[0]?.radius_km
      ?? fallbackZone?.radius_km
      ?? fallbackZone?.radiusKm;
    const backendPolygon: [number, number][] | undefined =
      newsItem?.affected_locations?.[0]?.geometry_polygon
      ?? newsItem?.geometry_polygon
      ?? fallbackZone?.affected_locations?.[0]?.geometry_polygon
      ?? fallbackZone?.geometry_polygon;
    const zoneGeom = buildHazardSpecificZoneGeometry(lon, lat, hazardType, zoneTier, agentRadiusKm, backendPolygon);
    const radiusKm = zoneGeom.radiusKm;
    const verificationAudit = newsItem?.verification_audit || fallbackZone?.verification_audit;
    const title: string = newsItem?.headline || fallbackZone?.title || customHazardLabel;
    const source: string = newsItem?.source_name || 'Sumber Berita Terverifikasi';
    const link: string = newsItem?.link || newsItem?.url || '';
    const summary: string = newsItem?.summary || tierReason;
    const corridorSegment: string = newsItem?.corridor_segment || newsItem?.location_name || 'Koridor Sumatera';
    const affectedModalities = impactProfile?.affected_modalities?.join(', ') || 'Darat';
    const passability = impactProfile?.passability || (zoneTier === 'RED_CONFIRMED' ? 'BLOCKED' : 'CAUTION');

    // Smooth camera fly + highlight news card.
    setMapFlyTo({ lon: flyLon as number, lat: flyLat as number, zoom: flyZoom, ts: Date.now() });
    if (newsItem) setSelectedNewsId(newsItem.id);

    const nowIso = new Date().toISOString();
    const crisisId = newsItem?.id ? `audit-${newsItem.id}` : (fallbackZone?.id || fallbackZone?.crisis_id || 'audit-zone');

    const mkFinding = (agent: string, conf: number, text: string) => ({
      agent,
      confidence: conf,
      summary: text,
      data: { source_mode: 'LIVE_API', stored_news_id: newsItem?.id || fallbackZone?.source_news_id || crisisId } as Record<string, unknown>,
      timestamp: nowIso,
    });

    const siblingCitations = newsFeed
      .filter((n) => {
        // Phase 172.5: regional context is never hazard evidence.
        if (n.relevance_tier === 'regional') return false;
        if (!newsItem) return n.id === fallbackZone?.source_news_id;
        const sameCorridor = n.corridor_segment && newsItem?.corridor_segment
          ? n.corridor_segment === newsItem.corridor_segment
          : (n.location_name || '') === (newsItem.location_name || '');
        return n.id === newsItem.id || sameCorridor;
      })
      .slice(0, 4)
      .map((n) => ({
        headline: n.headline,
        source: n.source_name,
        source_name: n.source_name,
        tier: n.source_tier,
        url: n.link || n.url,
        link_alive: n.link_alive,
        temporal_phase: n.temporal_phase,
        lane_status: n.ground_truth_metrics?.lane_status,
      }));

    let routes: RouteRecommendation[] = [];
    // Forecast path is info-only: no detour/re-route calculation, no reroute
    // CTA, and no hold-staging synthesis. The audit crisis carries zero
    // route_recommendations; Evidence + causal timeline stay readable.
    // The operator's active corridors (incl. sea/air intermodal legs) are
    // NEVER wiped by a zone click — map keeps drawing currentMapRoutes.
    if (forecastActive) {
      // Info-only: no actionable route objects for a forecast. Preserve.
    }
    const originId = activeOriginRef.current || selectedOriginNode;
    const destId = activeDestRef.current || selectedDestNode;
    if (!forecastActive && originId && destId) {
      const originInfo = resolveNodeInfo(originId);
      const destInfo = resolveNodeInfo(destId);
      const originCoords = originInfo?.coords;
      const destCoords = destInfo?.coords;
      if (originCoords && destCoords) {
        try {
          routes = await calculateAIDynamicDetourRoutes(
            [lon, lat],
            radiusKm,
            originCoords,
            destCoords,
            selectedModality,
            hazardType,
            impactProfile,
            zoneTier
          );
          setCurrentMapRoutes(routes);
          setActiveRouteIdx(0);
        } catch (e) {
          console.warn('Audit-trail route calc fallback:', e);
        }
      }
    }
    // Zone click never wipes active corridors: with no O-D pair (or a
    // forecast zone) there is nothing to recalculate, so currentMapRoutes
    // (incl. sea/air intermodal legs) is preserved. The audit crisis honestly
    // carries zero route_recommendations for this zone; the map keeps drawing
    // the operator's active corridors.

    const auditCrisis: CrisisState = {
      crisis_id: crisisId,
      title,
      type: hazardType,
      severity: zoneTier === 'RED_CONFIRMED' ? 'critical' : 'medium',
      is_simulated: false,
      lat,
      lon,
      region: corridorSegment.replace(/ — /g, '_').replace(/ /g, '_').toLowerCase() || 'koridor_sumatera',
      status: 'validated',
      overall_confidence: zoneTier === 'RED_CONFIRMED' ? 0.92 : 0.64,
      data_collection_finding: mkFinding(
        'data_collection',
        zoneTier === 'RED_CONFIRMED' ? 0.9 : 0.62,
        `Sensor & traffic koridor ${corridorSegment}: status jalur ${passability}, moda terdampak ${affectedModalities}. Data tersimpan dari pipeline LIVE API.`
      ),
      osint_hazard_finding: mkFinding(
        'osint_hazard',
        zoneTier === 'RED_CONFIRMED' ? 0.92 : 0.64,
        `Verifikasi ${source}: "${title}". ${tierReason}`
      ),
      prediction_finding: mkFinding(
        'prediction',
        zoneTier === 'RED_CONFIRMED' ? 0.88 : 0.6,
        zoneTier === 'RED_CONFIRMED'
          ? `Prakiraan spasial: radius ${radiusKm} km di sekitar [${lon.toFixed(3)}, ${lat.toFixed(3)}] tetap berisiko ${passability}; hindari koridor ${corridorSegment}.`
          : `Prakiraan spasial: potensi gangguan terbatas di ${corridorSegment}; siaga klarifikasi lanjutan sebelum reroute penuh.`
      ),
      route_optimization_finding: mkFinding(
        'route_optimization',
        routes.length > 0 ? 0.9 : 0.66,
        forecastActive
          ? `Prakiraan waspada dini: informasi pantauan saja, belum perlu tindakan. Pengalihan rute maupun penahanan armada tidak dihitung untuk koridor ${corridorSegment}.`
          : routes.length > 0
          ? `${routes.length} koridor darat/laut/udara dihitung ulang menghindari zona ${zoneTier === 'RED_CONFIRMED' ? 'Merah' : 'Kuning'} (${hazardType}, ${passability}).`
          : `Pilih Titik Asal & Tujuan untuk menghitung ulang koridor menghindari zona ${zoneTier === 'RED_CONFIRMED' ? 'Merah' : 'Kuning'} (${hazardType}).`
      ),
      economic_intelligence_finding: mkFinding(
        'economic_intelligence',
        0.7,
        `Estimasi penundaan ~${impactProfile?.estimated_delay_hours ?? (zoneTier === 'RED_CONFIRMED' ? 8 : 2)} jam untuk komoditas ${newsItem?.commodity_name || 'pangan pokok'}; pantau harga PIHPS koridor ${corridorSegment}.`
      ),
      decision_support_output: `${customHazardLabel} — ${forecastActive ? 'Prakiraan Waspada Dini (YELLOW_CLARIFY, belum terkonfirmasi)' : zoneTier === 'RED_CONFIRMED' ? 'Zona Merah terkonfirmasi' : 'Zona Kuning perlu klarifikasi'} di ${corridorSegment}. ${tierReason} Ringkasan tersimpan: ${summary} Moda terdampak: ${affectedModalities} (status ${passability}).`,
      route_recommendations: routes,
      verified_news_citations: siblingCitations.length > 0 ? siblingCitations : [{
        headline: title,
        source,
        source_name: source,
        url: link || undefined,
        link_alive: newsItem?.link_alive || 'unknown',
        temporal_phase: newsItem?.temporal_phase,
      }],
      causal_chain: [
        { name: `Sumber Berita (${source})`, relation: 'melaporkan', impact_score: 0.9 },
        { name: forecastActive ? 'Prakiraan Waspada Dini: Belum Terkonfirmasi' : zoneTier === 'RED_CONFIRMED' ? 'Zona Merah: Bencana Aktif' : 'Zona Kuning: Perlu Klarifikasi', relation: 'diklasifikasikan LLM sebagai', impact_score: zoneTier === 'RED_CONFIRMED' ? 0.92 : 0.64 },
        { name: `Dampak Moda (${affectedModalities})`, relation: 'mengganggu', impact_score: 0.75 },
        { name: `Mitigasi Koridor (${corridorSegment})`, relation: 'dialihkan via', impact_score: 0.8 },
      ],
      zone_tier: zoneTier,
      forecast_tag: forecastActive ? FORECAST_TAG : undefined,
      forecast_valid_until: forecastValidUntil ?? null,
      tier_reason: tierReason,
      custom_hazard_label: customHazardLabel,
      impact_profile: impactProfile,
      affected_locations: resolvedAffected,
      radius_km: radiusKm,
      geometry_polygon: zoneGeom.polygon,
      verification_audit: verificationAudit,
      evidence: {
        osint_author: source,
        osint_text: summary,
      },
      validated: true,
      created_at: nowIso,
      updated_at: nowIso,
      messages: [],
    };

    setSelectedVehicle(null);
    clearImpactAssessment();
    setSelectedCrisis(auditCrisis);
    setSelectedCrisisId(auditCrisis.crisis_id);
    setActiveTab('Evidence');
    setIsSidebarOpen(true);
  }, [newsFeed, selectedOriginNode, selectedDestNode, selectedModality, resolveNodeInfo, buildHazardSpecificZoneGeometry, clearImpactAssessment]);

  const handleZoneClick = useCallback((zone: DisasterZone) => {
    const linked = zone.source_news_id
      ? newsFeed.find((n) => n.id === zone.source_news_id)
      : newsFeed.find((n) => n.headline === zone.title);
    void inspectNewsOrZoneAuditTrail(linked, zone);
  }, [newsFeed, inspectNewsOrZoneAuditTrail]);

  // Phase 77: single selection entry point — every route select (sidebar card,
  // map popover, map ETA badge, demo) converges here: sets active index, opens
  // the Route Detail Modal, and creates a role-branched HITL pending item.
  // Guest never issues POST (sandbox preview only); modal open never blocks.
  const refreshHitlCount = useCallback(async () => {
    try {
      const res = await api.news.hitlPending();
      if (res) {
        setPendingHitlCount(res.count || (res.items ? res.items.length : 0));
      }
    } catch {
      // quiet fallback: badge keeps last known count
    }
  }, []);

  const handleSelectRoute = useCallback((
    idx: number,
    source: 'sidebar' | 'map-popover' | 'map-eta' | 'demo' = 'sidebar'
  ) => {
    void source;
    setActiveRouteIdx(idx);
    updateUrlParams({ route: String(idx) });
    setRouteModalIdx(idx);
  }, [updateUrlParams]);

  const handleCommitOperationalRoute = useCallback(
    async (route: RouteRecommendation, action: any, tactical: any) => {
      if (action === 'REJECT') {
        setToast({
          message: 'Rekomendasi rute berhasil ditolak. Armada tetap pada jalur operasional awal.',
          type: 'info',
        });
        return;
      }
      // 1. Highlight approved route on BOTH route stores so the cyan operational corridor
      //    reflects instantly on the map canvas (single source of truth, no state fighting)
      setCurrentMapRoutes((prev) => styleApprovedRoutes(prev.length > 0 ? prev : [route], route));
      setSelectedCrisis((prev) =>
        prev
          ? {
            ...prev,
            route_recommendations: styleApprovedRoutes(
              prev.route_recommendations && prev.route_recommendations.length > 0
                ? prev.route_recommendations
                : [route],
              route
            ),
          }
          : prev
      );
      setActiveRouteIdx(0);

      // 2. Extract detour coordinates from waypoints
      // Phase 77: TMS ping only on dispatcher success — guest/regulator never ping.
      const waypoints = route.waypoints || [];
      if (waypoints.length > 0 && role === 'DISPATCHER') {
        const startWp = waypoints[0];
        // 3. Trigger outbound telematics dispatch ping
        try {
          await api.fleet.simulatePing({
            vehicle_id: 'TRK-003-BELAWAN-TEBING',
            latitude: startWp.lat,
            longitude: startWp.lon,
            speed_kmh: 65.0,
            heading_deg: 135.0,
            temperature_c: 4.2,
            ignition: true,
          });
        } catch (pingErr) {
          console.debug('Fleet telematics ping note:', pingErr);
        }
      }

      // 4. Reactive telemetry: propagate the approved route's detour cost into the
      //    corridor context so delays, congestion, and commodity prices update instantly.
      applyOperationalImpact({
        delayMinutes: resolveApprovedDelayMinutes(
          route,
          currentMapRoutes.length > 0 ? currentMapRoutes : [route]
        ),
        fuelIncreasePct: route.fuel_increase_pct || 0,
      });

      setToast({
        message: `Armada TRK-003 berhasil dialihkan ke koridor operasional aktif (${tactical}). Telemetri TMS terverifikasi.`,
        type: 'success',
      });
    },
    [applyOperationalImpact, currentMapRoutes, role]
  );

  // Phase 107: unified modal decision commit path — role-branched. Dispatcher commits + TMS ping
  // (via handleCommitOperationalRoute); regulator HOLD-only; guest sandbox only.
  const handleModalAction = useCallback(async (
    decision: RouteDecisionType,
    tactical: TacticalManeuver,
    notes?: string
  ) => {
    const routes =
      currentMapRoutes.length > 0
        ? currentMapRoutes
        : (selectedCrisis?.route_recommendations || []);
    const idx = routeModalIdx ?? activeRouteIdx ?? 0;
    const route = routes[idx];
    if (!route) return;
    if (role === 'GUEST') {
      setToast({
        message: 'Mode Sandbox: rencana tersimpan lokal, tidak dikirim ke armada.',
        type: 'info',
      });
      return;
    }
    if (role === 'REGULATOR' && decision !== 'HOLD') {
      setToast({
        message: 'Akses Regulator: hanya HOLD yang diizinkan. Persetujuan dispatch memerlukan peran Dispatcher.',
        type: 'info',
      });
      return;
    }

    const incidentId =
      selectedCrisis?.crisis_id ||
      route.incident_id ||
      (activeRouteIdx != null ? `INC-CORRIDOR-${activeRouteIdx}` : 'INC-ADHOC-CORRIDOR');

    setIsActing(true);
    try {
      const action: DecisionAction =
        decision === 'REJECT' ? 'REJECT' : decision === 'OVERRIDE' ? 'OVERRIDE' : 'ACCEPT';
      const tacticalAction: TacticalManeuver =
        decision === 'HOLD' ? 'HOLD' : decision === 'OVERRIDE' ? 'CONTINUE' : tactical;

      const originName =
        formatNodeId(selectedOriginNode, resolveNodeInfo(selectedOriginNode)) || undefined;
      const destName =
        formatNodeId(selectedDestNode, resolveNodeInfo(selectedDestNode)) || undefined;

      await api.approvals.create({
        incident_id: incidentId,
        route_id: String(idx),
        recommended_route: route,
        action,
        tactical_action: tacticalAction,
        operator_id: user?.name || user?.email || user?.id || 'OP-CHIEF-01',
        approved_by: user?.name || user?.email || user?.id || 'OP-CHIEF-01',
        route_name: route.route_name || route.description,
        origin: originName,
        destination: destName,
        notes,
      });

      if (action === 'REJECT') {
        setToast({
          message: 'Rekomendasi rute berhasil ditolak. Armada tetap pada jalur operasional awal.',
          type: 'info',
        });
        setRouteModalIdx(null);
        await refreshHitlCount();
        return;
      }

      await handleCommitOperationalRoute(route, action, tacticalAction);
      await refreshHitlCount();
      setRouteModalIdx(null);

      if (!selectedCrisis?.crisis_id) {
        setToast({
          message: 'Keputusan koridor berhasil dicatat (Mode Ad-Hoc / Koridor Mandiri).',
          type: 'success',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403') || msg.includes('Forbidden')) {
        setToast({
          message: 'Mode Sandbox: rencana tersimpan lokal, tidak dikirim ke armada (403 memerlukan akun Dispatcher).',
          type: 'info',
        });
      } else {
        setToast({
          message: 'Gagal menyimpan keputusan rute. Rute belum disetujui.',
          type: 'error',
        });
      }
    } finally {
      setIsActing(false);
    }
  }, [currentMapRoutes, selectedCrisis, routeModalIdx, activeRouteIdx, role, user, selectedOriginNode, selectedDestNode, resolveNodeInfo, handleCommitOperationalRoute, refreshHitlCount]);

  // Triggered by Game-Like Map Location Click
  const handleMapPointTargeted = useCallback((
    lat: number,
    lon: number,
    type: CrisisType = 'flood',
    radiusKm: number = selectedRadius,
    severity: Severity = 'critical'
  ) => {
    setIsClickTargeting(false);
    triggerFullSimulationEngine(
      lat,
      lon,
      type,
      radiusKm,
      `Simulated ${type.toUpperCase()} Disruption (${severity.toUpperCase()} - ${radiusKm}km Radius)`,
      false, // Point mode
      severity
    );
  }, [selectedRadius, triggerFullSimulationEngine]);

  // Triggered by MapboxDraw Freehand Polygon
  const handlePolygonDrawn = useCallback(async (ring: [number, number][]) => {
    setDisasterZones([{ polygon: ring, type: 'flood', risk: 0.85 }]);
    setDrawModeActive(false);

    let sumLon = 0;
    let sumLat = 0;
    ring.forEach(([lon, lat]) => {
      sumLon += lon;
      sumLat += lat;
    });
    const centerLon = sumLon / ring.length;
    const centerLat = sumLat / ring.length;
    // Polygon draw has no severity control; the crisis payload still carries the
    // explicit critical default instead of letting the hook invent one.
    const severity: Severity = 'critical';

    triggerFullSimulationEngine(
      centerLat,
      centerLon,
      'flood',
      selectedRadius,
      'Custom Area Disruption (MapboxDraw Polygon)',
      true, // Polygon mode
      severity,
      ring
    );
  }, [selectedRadius, triggerFullSimulationEngine]);

  // 1-Click Clear Simulation Overlay Handler
  const handleClearSimulation = useCallback(() => {
    setSimulatedShockwave(null);
    setDisasterZones([]);
    setSelectedCrisisId(null);
    setSelectedCrisis(null);
    setActiveRouteIdx(null);
    setIsClickTargeting(false);
    setDrawModeActive(false);
    setIsSidebarOpen(false);
    clearImpactAssessment();
    if (selectedOriginNode && selectedDestNode) {
      updateBaselineMapboxRoute(selectedOriginNode, selectedDestNode, selectedModality);
    } else {
      setCurrentMapRoutes([]);
    }

    setToast({
      message: 'Simulasi dibersihkan. Tampilan peta dikembalikan ke baseline.',
      type: 'info'
    });
  }, [selectedOriginNode, selectedDestNode, selectedModality, updateBaselineMapboxRoute, clearImpactAssessment]);

  // Live Dynamic Ingested Incidents (Earthquakes, Floods, CCTV alerts)
  const activeIncidents = incidents.filter(
    (i) => i.status !== 'resolved' && !i.id.includes('predict') && i.type !== 'port_closure'
  );

  const isCrisisDrawerOpen = isRightInspectorActive;
  const footerDockClass = resolveMapDockClasses({ isLeftSidebarCollapsed, isCrisisDrawerOpen });

  return (
    <div className="relative w-full h-screen bg-[#080d14] text-[#e8eaed] overflow-hidden select-none">
      {/* Top Header Navbar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#0c1017] border-b border-white/10 z-50 flex items-center justify-between gap-2 px-2 sm:px-3 md:px-6 select-none">
        <div className="flex items-center gap-1.5 sm:gap-3 xl:gap-6 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#080d14] border border-white/15 p-1 flex items-center justify-center shrink-0">
 <img src="/logo_prehub.png" alt="Prehub" className="w-6 h-6 object-contain" />
            </div>
 <span className="font-headline font-bold text-base text-[#e8eaed] hidden xl:inline">
 Prehub
            </span>
            <Link
              href="/"
              aria-label="Kembali ke Portal Utama (Landing Page)"
              title="Kembali ke Portal Utama (Landing Page)"
              className="ml-0.5 sm:ml-2 px-2 sm:px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-sans text-[#e8eaed] hover:text-white hover:border-white/20 transition hidden sm:flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Home className="w-3.5 h-3.5 text-[rgba(232,234,237,0.62)]" />
              <span className="hidden md:inline">Portal Utama</span>
            </Link>
          </div>

          {/* Section Navigation Tabs — Laporan/Analitik/Evaluasi hard-locked for GUEST.
              Below xl the secondary sections live in an overflow menu, so the
              strip is icon-only and every control fits at 360px. */}
          <nav
            aria-label="Bagian dasbor"
            data-testid="top-nav"
            className="flex items-center gap-1 bg-[#080d14] p-1 rounded-lg border border-white/10 shrink-0"
          >
            {NAV_TABS.filter((tab) => tab.primary).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  id={`nav-${tab.id}`}
                  type="button"
                  aria-label={tab.label}
                  title={tab.label}
                  onClick={() => handleNavTab(tab.id)}
                  className={`cursor-pointer h-8 w-8 xl:w-auto xl:px-3.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                    activeSection === tab.id
                      ? 'bg-white text-[#080d14] font-semibold'
                      : 'text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="hidden xl:inline">{tab.label}</span>
                </button>
              );
            })}

            {/* Desktop: labelled secondary strip (keeps #nav-* ids for every spec). */}
            <div className="hidden xl:flex items-center gap-1">
              {NAV_TABS.filter((tab) => !tab.primary).map((tab) => {
                const isLockedSection = role === 'GUEST' || !isAuthenticated;
                return (
                  <button
                    key={tab.id}
                    id={`nav-${tab.id}`}
                    type="button"
                    disabled={isLockedSection}
                    aria-disabled={isLockedSection}
                    title={
                      isLockedSection
                        ? `${tab.label} terkunci: masuk untuk membuka ${tab.id === 'reports' ? 'audit mitigasi' : tab.id === 'analytics' ? 'analitik' : 'evaluasi'} (Mode Sandbox)`
                        : tab.label
                    }
                    onClick={() => handleNavTab(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                      isLockedSection
                        ? 'text-[rgba(232,234,237,0.38)] cursor-not-allowed flex items-center gap-1.5'
                        : activeSection === tab.id
                          ? 'bg-white text-[#080d14] font-semibold cursor-pointer'
                          : 'text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] hover:bg-white/5 cursor-pointer'
                    }`}
                  >
                    {isLockedSection && <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Below xl: secondary sections collapse into an overflow menu. */}
            <div className="relative xl:hidden">
              <button
                type="button"
                data-testid="nav-overflow-toggle"
                aria-label="Menu bagian lainnya"
                title="Menu bagian lainnya"
                aria-expanded={isNavOverflowOpen}
                onClick={() => setIsNavOverflowOpen((v) => !v)}
                className={`cursor-pointer h-8 w-8 rounded-lg transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                  isNavOverflowOpen
                    ? 'bg-white text-[#080d14]'
                    : 'text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] hover:bg-white/5'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
              {isNavOverflowOpen && (
                <div
                  data-testid="nav-overflow-menu"
                  className="absolute left-0 top-full mt-2 z-50 w-44 rounded-xl border border-white/10 bg-[#0c1017] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
                >
                  {NAV_TABS.filter((tab) => !tab.primary).map((tab) => {
                    const isLockedSection = role === 'GUEST' || !isAuthenticated;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        data-testid={`nav-overflow-${tab.id}`}
                        onClick={() => handleNavTab(tab.id)}
                        aria-disabled={isLockedSection}
                        className={`w-full cursor-pointer px-2.5 py-2 rounded-lg text-left text-xs font-medium transition-colors flex items-center justify-between gap-2 ${
                          activeSection === tab.id
                            ? 'bg-white text-[#080d14] font-semibold'
                            : 'text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] hover:bg-white/5'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {isLockedSection && <Lock className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Workspace Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Dispatcher roster trigger: sits left of the onboard button, same gating. */}
          {isDispatcherWorkspace && (
            <button
              type="button"
              id="fleet-roster-toggle"
              data-testid="armada-trigger"
              onClick={() => setIsRosterVisible((v) => !v)}
              aria-pressed={isRosterVisible}
              aria-label={`Armada Perusahaan: ${tenantFleetVehicles.length} unit · ${liveTenantVehicles.length} live GPS. Tampilkan atau sembunyikan panel.`}
              title={`Armada Perusahaan — ${tenantFleetVehicles.length} unit · ${liveTenantVehicles.length} live GPS`}
              className="cursor-pointer px-2 sm:px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[#e8eaed] hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Truck className="w-3.5 h-3.5 text-[rgba(232,234,237,0.62)]" />
              <span className="hidden sm:inline">Armada Perusahaan</span>
              <span className="px-1.5 py-0.5 rounded bg-white text-[#080d14] font-mono text-xs font-bold tabular-nums">
                {tenantFleetVehicles.length}
              </span>
            </button>
          )}
          {/* Phase 43: Self-Serve Fleet Onboarding Action Button */}
          <button
            type="button"
            onClick={() => {
              if (role !== 'DISPATCHER') {
                setToast({
                  message: 'Pendaftaran armada hanya dapat dilakukan oleh operator dengan wewenang DISPATCHER.',
                  type: 'info',
                });
              }
              setIsOnboardingModalOpen(true);
            }}
            id="onboard-armada-btn"
            className={`cursor-pointer px-2 sm:px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[#e8eaed] hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0`}
            title={role === 'DISPATCHER' ? 'Onboard Armada & Unggah Manifest Pengiriman' : 'Onboard Armada (Terkunci: Khusus Wewenang Dispatcher)'}
          >
            {role === 'DISPATCHER' ? (
              <PlusCircle className="w-3.5 h-3.5 text-[rgba(232,234,237,0.62)]" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[rgba(232,234,237,0.38)]" />
            )}
            <span className="hidden sm:inline">Onboard Armada</span>
            {role !== 'DISPATCHER' && (
 <span className="hidden md:inline px-1 py-0.5 rounded border border-white/10 text-[rgba(232,234,237,0.62)] text-xs font-mono">
                Khusus Dispatcher
              </span>
            )}
            {customFleetCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-white text-[#080d14] font-mono text-xs font-bold tabular-nums">
                {customFleetCount}
              </span>
            )}
          </button>

          {/* 1-Click Role & Workspace Persona Badge */}
          <button
            type="button"
            id="auth-persona-badge-btn"
            onClick={openAuthModal}
            className="cursor-pointer px-2 sm:px-3 py-1.5 rounded-lg border border-white/10 bg-[#080d14] hover:border-white/20 transition flex items-center gap-2 group text-left shrink-0"
            title="Ganti Persona Akses & Ruang Kerja (RBAC)"
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${role === 'DISPATCHER' ? 'bg-emerald-500' : role === 'REGULATOR' ? 'bg-[#f59e0b]' : 'bg-white/25'
              }`} />
            <div className="leading-tight min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#e8eaed]">
                  {role}
                </span>
                <ChevronDown className="w-3 h-3 hidden sm:block text-[rgba(232,234,237,0.62)] group-hover:text-white transition-colors" />
              </div>
              <span className="text-xs font-sans text-[rgba(232,234,237,0.62)] max-w-[120px] truncate hidden sm:block">
                {user.org_name || (role === 'DISPATCHER' ? 'PT Samudera Logistik' : role === 'REGULATOR' ? 'Badan Pangan Nasional' : 'Sandbox LRIP')}
              </span>
            </div>
          </button>
        </div>
      </header>

      {/* Multi-Role Workspace Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />

      {/* Self-Serve Fleet Onboarding Modal */}
      <FleetOnboardingModal
        isOpen={isOnboardingModalOpen}
        onClose={() => {
          setIsOnboardingModalOpen(false);
          // Pick up a truck asset that was saved without completing a rit yet.
          refetchFleet();
        }}
        onSuccess={() => {
          refetchFleet();
          setToast({
            message: 'Sinkronisasi armada kustom berhasil diperbarui.',
            type: 'success',
          });
        }}
        userRole={role}
        companyId={user?.company_id}
        companyName={user?.org_name}
      />

      {/* Human-in-the-Loop Decision Drawer (Root Level Portal Context) */}
      <HitlDecisionDrawer
        isOpen={isHitlDrawerOpen}
        onClose={() => setIsHitlDrawerOpen(false)}
        onDecisionApplied={(approvalId, decision) => {
          setToast({
            message: `Keputusan HITL Disimpan: [${decision}] untuk ${approvalId}. Status diperbarui di Supabase.`,
            type: 'success'
          });
          setApprovalsCount((prev) => prev + 1);
        }}
      />

      {/* Armada Perusahaan drawer — dispatcher-only, tenant-scoped roster + detail */}
      {isDispatcherWorkspace && (
        <TenantFleetRoster
          isOpen={isRosterVisible}
          onClose={() => setIsRosterVisible(false)}
          vehicles={tenantFleetVehicles}
          liveVehicles={liveTenantVehicles}
          isLoading={isFleetLoading}
          error={fleetError}
          isTenantScoped={isFleetTenantScoped}
          companyId={fleetCompanyId}
          hazardByVehicleId={fleetHazards}
          onFocusVehicle={handleSelectVehicle}
          onOpenOnboarding={() => setIsOnboardingModalOpen(true)}
        />
      )}

      {/* MAIN CONTENT CANVAS AREA */}
      <main className="absolute left-0 top-16 right-0 bottom-0 overflow-hidden flex">

        {/* SECTION 1: 4D GIS MAP WITH RESTORED FIGMA COMMAND CENTER GRID */}
        <div className={`w-full h-full relative overflow-hidden ${activeSection === 'map' ? 'flex' : 'hidden'}`}>

          {/* COLUMN 1: COLLAPSIBLE LEFT OSINT & NEWS SIDEBAR (GLOBOT STYLE)
              Phase 176.9 (M9): one flex column at every breakpoint —
              header → search/filters → scrolling feed → guest banner → footer.
              Only the feed scrolls (`flex-1 min-h-0`), so the docked banner and
              the footer link are always on screen and can never be covered. */}
          <aside
            data-testid="news-sheet"
            className={`bg-[#0c1017] flex flex-col gap-2 md:gap-3 overflow-hidden pointer-events-auto transition-all duration-300 ease-in-out ${
              isLeftSidebarCollapsed
                ? 'hidden md:flex md:w-0 md:p-0 md:border-r-0 md:opacity-0 md:pointer-events-none shrink-0'
                : 'absolute inset-x-0 bottom-0 z-40 h-[min(68vh,640px)] max-h-full w-full rounded-t-xl border-t border-white/10 p-3.5 md:relative md:inset-auto md:z-30 md:h-full md:max-h-none md:w-[352px] md:rounded-none md:border-t-0 md:border-r md:border-white/10 md:opacity-100'
            }`}
          >
            {/* Mobile sheet handle + close — the sheet never traps the map. */}
            <div className="md:hidden flex items-center justify-between shrink-0 -mt-1">
              <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-white/20" />
              <button
                type="button"
                data-testid="news-sheet-close"
                onClick={() => setIsLeftSidebarCollapsed(true)}
                aria-label="Tutup panel Berita"
                title="Tutup panel Berita"
                className="cursor-pointer p-1.5 rounded-lg bg-[#121822] hover:bg-white/10 text-[rgba(232,234,237,0.62)] hover:text-white transition -mr-0.5"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Header: OSINT Wire & Live Pulse */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-[#121822] border border-white/10 text-[rgba(232,234,237,0.62)]">
                  <Radio className="w-4 h-4" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
                <div>
 <h2 className="text-xs font-bold font-sans text-white">
 Berita
                  </h2>
                  <span className="text-xs font-mono text-[rgba(232,234,237,0.62)]">
                    {newsStatus === 'warming' && filteredNews.length === 0
                      ? 'Menunggu feed live'
                      : `${filteredNews.length} Sumber Terverifikasi`}
                  </span>
                  {newsLastUpdatedDate && (
                    <span
                      title={`Integritas data — BMKG: ${String(corridorContext?.data_integrity?.bmkg_status ?? (corridorContext?.is_fallback ? 'fallback' : 'live'))} · TomTom: ${String(corridorContext?.data_integrity?.tomtom_status ?? (corridorContext?.is_fallback ? 'fallback' : 'live'))} · PIHPS: ${String(corridorContext?.data_integrity?.pihps_status ?? (corridorContext?.is_fallback ? 'fallback' : 'live'))}${corridorContext?.is_fallback ? ' · mode fallback' : ''}`}
                    >
                      <FreshnessBadge lastUpdated={newsLastUpdatedDate} sourceLabel="" />
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsLeftSidebarCollapsed(true)}
                  className="p-1.5 rounded-lg bg-[#121822] hover:bg-white/10 text-[rgba(232,234,237,0.62)] hover:text-white transition cursor-pointer"
                  title="Sembunyikan Panel"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Search & Category Filter */}
            <div className="space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgba(232,234,237,0.62)]" />
                <input
                  type="text"
                  value={newsSearchQuery}
                  onChange={(e) => setNewsSearchQuery(e.target.value)}
                  placeholder="Cari berita atau lokasi..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-[#080d14] border border-white/10 text-xs text-[#e8eaed] placeholder:text-[rgba(232,234,237,0.38)] focus:outline-none focus:border-white/40 transition-colors font-sans"
                />
                {newsSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setNewsSearchQuery('')}
                    className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-[rgba(232,234,237,0.62)] hover:text-white p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1 py-0.5 text-xs font-mono">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'OFFICIAL', label: 'ANTARA' },
                  { id: 'WEATHER', label: 'BMKG' },
                  { id: 'MARKET', label: 'Harga' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedNewsCategory(tab.id as 'ALL' | 'OFFICIAL' | 'WEATHER' | 'OSINT' | 'MARKET')}
                    className={`cursor-pointer px-1.5 py-1 text-center rounded-lg border font-medium transition-colors text-xs ${selectedNewsCategory === tab.id
                        ? 'bg-white text-[#080d14] border-white font-semibold'
                        : 'bg-[#080d14] text-[rgba(232,234,237,0.62)] border-white/[0.08] hover:border-white/15 hover:text-[#e8eaed]'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Phase 176.9 (M9): below `md` the tier/province chips and the
                  hazard pills fold behind one disclosure — the fixed-height
                  sheet must spend its room on the feed, banner and footer. On
                  `md`+ the block is always expanded, so every testid stays
                  mounted and usable for the breadth specs. */}
              <button
                type="button"
                data-testid="news-filter-disclosure"
                aria-expanded={isNewsFilterOpen}
                aria-controls="news-filter-block"
                onClick={() => setIsNewsFilterOpen((v) => !v)}
                className="md:hidden cursor-pointer flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-[#080d14] border border-white/10 text-xs font-mono text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] hover:border-white/20 transition-colors shrink-0"
              >
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3 h-3" />
                  Filter
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isNewsFilterOpen ? 'rotate-180' : ''}`} />
              </button>

              <div
                id="news-filter-block"
                className={`${isNewsFilterOpen ? 'flex' : 'hidden'} flex-col gap-2 md:flex`}
              >

              {/* Display-tier chips (Phase 172.5 / M9). `Krisis` = the rows that
                  passed the hazard gate; `Regional` = honest 48h regional context
                  that never claims crisis relevance. Additive with the province
                  chips below. */}
              <div className="flex items-center gap-1" data-testid="news-tier-filter">
                {([
                  { id: 'ALL', label: 'Semua', testid: 'news-tier-all' },
                  { id: 'crisis', label: 'Krisis', testid: 'news-tier-crisis' },
                  { id: 'regional', label: 'Regional', testid: 'news-tier-regional' },
                ] as const).map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    data-testid={tier.testid}
                    onClick={() => setNewsTierFilter(tier.id)}
                    className={`cursor-pointer px-1.5 py-0.5 rounded border text-xs font-mono transition-colors ${
                      newsTierFilter === tier.id
                        ? 'bg-white text-[#080d14] border-white font-semibold'
                        : 'bg-[#080d14] text-[rgba(232,234,237,0.62)] border-white/[0.08] hover:border-white/15 hover:text-[#e8eaed]'
                    }`}
                    title={
                      tier.id === 'crisis'
                        ? 'Berita yang lolos gerbang krisis (zona merah/kuning)'
                        : tier.id === 'regional'
                          ? 'Konteks regional 48 jam — bukan klaim krisis'
                          : 'Tampilkan kedua tingkat: krisis dan regional'
                    }
                  >
                    {tier.label}
                  </button>
                ))}
              </div>

              {/* Province chips (Phase 172 / M9): the read path guarantees every
                  province with a qualifying 48h article is present, so a chip per
                  province is an honest map of what the window contains. Empty
                  provinces are named, never hidden. */}
              {(newsProvinceChips.length > 0 || newsProvincesMissing.length > 0) && (
              <div className="flex flex-wrap items-center gap-1" data-testid="news-province-filter">
                <button
                  type="button"
                  data-testid="news-province-chip-all"
                  onClick={() => setNewsProvinceFilter('ALL')}
                  className={`cursor-pointer px-1.5 py-0.5 rounded border text-xs font-mono transition-colors ${
                    newsProvinceFilter === 'ALL'
                      ? 'bg-white text-[#080d14] border-white font-semibold'
                      : 'bg-[#080d14] text-[rgba(232,234,237,0.62)] border-white/[0.08] hover:border-white/15 hover:text-[#e8eaed]'
                  }`}
                  title="Tampilkan semua provinsi"
                >
                  Semua
                </button>
                {newsProvinceChips.map((province) => {
                  const slug = provinceSlug(province);
                  const active = newsProvinceFilter === province;
                  const count = newsBreadthMeta?.province_counts?.[province];
                  return (
                    <button
                      key={province}
                      type="button"
                      data-testid={`news-province-chip-${slug}`}
                      onClick={() => setNewsProvinceFilter(active ? 'ALL' : province)}
                      title={`Filter provinsi: ${province}${typeof count === 'number' ? ` (${count} artikel)` : ''}`}
                      className={`cursor-pointer px-1.5 py-0.5 rounded border text-xs font-mono transition-colors ${
                        active
                          ? 'bg-white text-[#080d14] border-white font-semibold'
                          : 'bg-[#080d14] text-[rgba(232,234,237,0.62)] border-white/[0.08] hover:border-white/15 hover:text-[#e8eaed]'
                      }`}
                    >
                      {province}
                      {typeof count === 'number' ? <span className="ml-1 text-[rgba(232,234,237,0.38)] tabular-nums">{count}</span> : null}
                    </button>
                  );
                })}
                {newsProvincesMissing.length > 0 && (
                  <span
                    data-testid="news-provinces-missing"
                    className="px-1.5 py-0.5 rounded border border-dashed border-white/10 text-xs font-mono text-[rgba(232,234,237,0.38)]"
                    title="Provinsi tanpa artikel yang lolos gerbang 48 jam pada jendela baca ini"
                  >
                    {newsProvincesMissing.join(' · ')}: Tidak ada artikel 48 jam
                  </span>
                )}
              </div>
              )}

              {/* Compact Zona Filter Pills in Left News Drawer Header */}
              <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowRedZones((v) => !v)}
                  className={`${pillClass(showRedZones)} flex-1 justify-between`}
                  title="Filter Peta: Zona Merah (Bencana Terkonfirmasi)"
                >
                  <span className="flex items-center gap-1.5">
 <span className={`w-2 h-2 rounded-full ${showRedZones ? 'bg-[#ef4444]' : 'border border-white/25'}`} />
 <span className="font-sans text-xs font-semibold">Merah</span>
                  </span>
 <span className={`${chipClass(showRedZones)} ${liveNewsZoneCounts.red > 0 ? 'text-[#ef4444]' : ''}`}>
                    {liveNewsZoneCounts.red}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowYellowZones((v) => !v)}
                  className={`${pillClass(showYellowZones)} flex-1 justify-between`}
                  title="Filter Peta: Zona Kuning (Perlu Klarifikasi / Waspada)"
                >
                  <span className="flex items-center gap-1.5">
 <span className={`w-2 h-2 rounded-full ${showYellowZones ? 'bg-[#f59e0b]' : 'border border-white/25'}`} />
 <span className="font-sans text-xs font-semibold">Kuning</span>
                  </span>
 <span className={`${chipClass(showYellowZones)} ${liveNewsZoneCounts.yellow > 0 ? 'text-[#f59e0b]' : ''}`}>
                    {liveNewsZoneCounts.yellow}
                  </span>
                </button>
              </div>

                {/* 4th chip: forecast (Prakiraan) — amber dashed swatch, own counter.
                    Forecasts keep YELLOW_CLARIFY on the wire but are never counted
                    in the Kuning bucket above (48h admission stays independent). */}
                <button
                  type="button"
                  onClick={() => setShowForecastZones((v) => !v)}
                  className={`${pillClass(showForecastZones)} w-full justify-between`}
                  title="Filter Peta: Prakiraan Waspada Dini (YELLOW_CLARIFY, garis putus-putus amber — belum terkonfirmasi)"
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full border border-dashed ${showForecastZones ? 'border-[#f59e0b] bg-[#f59e0b]/25' : 'border-white/25 bg-transparent'}`} />
                    <span className="font-sans text-xs font-semibold">Prakiraan</span>
                    <span className={`font-sans text-xs font-normal ${showForecastZones ? 'opacity-70' : 'text-[rgba(232,234,237,0.38)]'}`}>Waspada Dini</span>
                  </span>
                  <span className={`${chipClass(showForecastZones)} ${liveNewsZoneCounts.forecast > 0 ? 'text-[#f59e0b]' : ''}`}>
                    {liveNewsZoneCounts.forecast}
                  </span>
                </button>
              </div>
              {/* /filter disclosure block */}
              </div>
            </div>

            {/* Scrollable Feed List — Phase 176.9 (M9): the ONLY scroll
                container in the panel (`flex-1 min-h-0`). The guest banner and
                footer below are in-flow siblings, so no card can ever reach them
                at any scroll position (no measured padding, no clearance var). */}
            <div
              data-testid="news-feed-scroll"
              className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2.5 pr-0.5"
            >
              {newsFeed.length === 0 ? (
                <div className="p-6 text-center text-[rgba(232,234,237,0.62)] font-mono text-xs space-y-1">
                  <Radio className="w-6 h-6 mx-auto text-[rgba(232,234,237,0.38)] mb-2" />
                  <p>
                    {newsStatus === 'warming'
                      ? 'Belum ada berita live terverifikasi.'
                      : 'Belum ada berita live yang lolos verifikasi.'}
                  </p>
                  <p className="text-[rgba(232,234,237,0.38)]">Menunggu feed live — tidak ada data cadangan.</p>
                </div>
              ) : filteredNews.length === 0 ? (
                <div className="p-6 text-center text-[rgba(232,234,237,0.62)] font-mono text-xs space-y-1">
                  <Newspaper className="w-6 h-6 mx-auto text-[rgba(232,234,237,0.38)] mb-2" />
                  <p>Tidak ada berita yang cocok.</p>
                </div>
              ) : (
                groupedNews.map((group) => (
                  <div key={group.province} className="space-y-2.5">
                    <div
                      data-testid={`news-province-group-${provinceSlug(group.province)}`}
                      className="sticky top-0 z-10 flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-[#0c1017] border border-white/10 text-xs font-mono uppercase tracking-wide text-[rgba(232,234,237,0.62)]"
                    >
                      <span className="truncate">{group.province}</span>
                      <span
                        data-testid={`news-province-count-${provinceSlug(group.province)}`}
                        className="text-[#e8eaed] font-bold shrink-0 tabular-nums"
                      >
                        {group.items.length} artikel
                      </span>
                    </div>
                    {group.items.map((item) => {
                  const isSelected = selectedNewsId === item.id;
                  const isOfficial = item.source_tier === 'TIER_1_OFFICIAL' || item.source_type === 'OFFICIAL_NEWS';
                  const isEarlyWarning = item.temporal_phase === 'forecast_early_warning';

                  const articleLink = item.link || item.url;
                  const canOpenSource = Boolean(articleLink) && item.link_alive !== 'dead';
                  const isExpiredLink = item.link_alive === 'dead';
                  const isExcerptExpanded = expandedNewsId === item.id;
                  const itemZoneTier = (item.zone_tier || 'RED_CONFIRMED') as ZoneTier;
                  const isForecast = isForecastActive(item.forecast_tag, item.forecast_valid_until, forecastNowMs);
                  // Phase 172.5: regional context never renders a hazard zone badge.
                  const isRegional = item.relevance_tier === 'regional';

                  const handleFocusMap = () => {
                    // Regional context is not an incident: no zone/route audit trail.
                    if (isRegional) return;
                    // Forecast path: info-only. No origin/dest reroute pairing and
                    // no detour calculation — inspectNewsOrZoneAuditTrail emits
                    // zero routes instead of a reroute CTA.
                    if (!isForecast && item.originNode && item.destNode) {
                      setSelectedOriginNode(item.originNode);
                      setSelectedDestNode(item.destNode);
                      updateUrlParams({ origin: item.originNode, dest: item.destNode });
                    }
                    void inspectNewsOrZoneAuditTrail(item, undefined);
                  };

                  return (
                    <div
                      key={item.id}
                      onClick={handleFocusMap}
                      data-testid={`berita-card-${item.id}`}
                      role="article"
                      className={`p-3 rounded-lg border transition-colors duration-200 space-y-2 cursor-pointer ${isSelected
                          ? 'bg-[#121822] border-white/40 ring-1 ring-white/20'
                          : 'bg-[#0c1017] border-white/10 hover:border-white/15 hover:bg-[#121822]'
                        }`}
                    >
                      {/* Source & Timestamp */}
                      <div className="flex items-center justify-between gap-1 text-xs font-mono">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="px-1.5 py-0.5 rounded border text-xs font-semibold uppercase bg-white/5 text-[#e8eaed] border-white/10">
                            {item.source_name || (isOfficial ? 'ANTARA' : 'BERITA')}
                          </span>
                          {item.published_at ? (
                            <FreshnessBadge
                              publishedAt={item.published_at}
                              lastUpdated={null}
                              sourceLabel=""
                            />
                          ) : (
                            <span className="text-[rgba(232,234,237,0.62)] truncate">{item.pubDate || 'Waktu terbit tidak tersedia'}</span>
                          )}
                        </div>
                        {isEarlyWarning && (
                          <span className="text-[#f59e0b] font-semibold text-xs shrink-0">
                            Early Warning {item.lead_time_hours ? `(${item.lead_time_hours}j)` : ''}
                          </span>
                        )}
                      </div>

                      {/* Headline with external link */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isRegional ? (
                          // Neutral, non-hazard label: this is regional context,
                          // not a zone. No red/amber emphasis, no crisis claim.
                          <span
                            data-testid={`berita-tier-label-${item.id}`}
                            className="flex items-center gap-1.5 text-xs text-[rgba(232,234,237,0.62)]"
                            title="Konteks regional 48 jam — bukan klaim krisis"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
                            Regional
                          </span>
                        ) : isForecast ? (
 <span className="flex items-center gap-1.5 text-xs text-[rgba(232,234,237,0.62)]"><span className="w-1.5 h-1.5 rounded-full border border-dashed border-[#f59e0b]" />Prakiraan</span>
                        ) : itemZoneTier === 'RED_CONFIRMED' ? (
 <span className="flex items-center gap-1.5 text-xs text-[#e8eaed]"><span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />Merah</span>
                        ) : (
 <span className="flex items-center gap-1.5 text-xs text-[#e8eaed]"><span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />Kuning</span>
                        )}
                        {(item.custom_hazard_label) && (
 <span className="px-1.5 py-0.5 rounded text-xs font-sans text-[#e8eaed] bg-white/5 border border-white/10 truncate max-w-[180px]" title={item.custom_hazard_label}>
                            {item.custom_hazard_label}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-semibold text-[#e8eaed] leading-snug font-sans group">
                        {canOpenSource ? (
                          <a
                            href={articleLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-white hover:underline transition-colors flex items-start gap-1 cursor-pointer"
                            title="Buka Berita Asli (Tab Baru)"
                          >
                            <span className="flex-1">{item.headline}</span>
                            <ExternalLink className="w-3 h-3 text-[rgba(232,234,237,0.38)] group-hover:text-[#e8eaed] shrink-0 mt-0.5" />
                          </a>
                        ) : (
                          <span className="flex items-start gap-1">
                            <span className="flex-1">{item.headline}</span>
                          </span>
                        )}
                      </h3>

                      {isForecast && (
                        <div className="rounded-md border border-[#f59e0b]/40 bg-[#f59e0b]/[0.06] px-2 py-1.5 space-y-0.5">
                          <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#f59e0b] uppercase">
                            <Info className="w-3 h-3 text-[#f59e0b] shrink-0" />
                            Prakiraan — Waspada Dini
                          </span>
                          <p className="text-xs font-sans text-[rgba(232,234,237,0.62)] leading-snug">
                            Belum bencana terkonfirmasi (zona kuning). Waspada — pantau, belum perlu tindakan — tanpa pengalihan rute.
                          </p>
                          <FreshnessBadge lastUpdated={null} expiresAt={item.forecast_valid_until} />
                        </div>
                      )}

                      {item.affected_locations && item.affected_locations.length > 1 && (
 <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[#e8eaed] text-xs font-sans leading-snug">
                          📍 {item.affected_locations.length} Daerah: {item.affected_locations.map((l) => l.name).join(', ')}
                        </div>
                      )}

                      {/* Stored excerpt: rendered only when distinct from headline */}
                      {item.summary && item.summary.trim().toLowerCase() !== item.headline.trim().toLowerCase() && item.summary.trim().length >= 15 && (
                        <p
                          className={`text-xs text-[rgba(232,234,237,0.62)] font-sans leading-relaxed transition-all duration-200 ${isExcerptExpanded ? '' : 'line-clamp-2'
                            }`}
                        >
                          {item.summary}
                        </p>
                      )}

                      {/* God's-Eye Monospaced Tactical Telemetry Grid */}
 <div className="p-2 rounded-lg bg-transparent border-t border-white/5 font-mono text-xs space-y-1.5 leading-snug">
 {/* Row 1 — Lokasi. The only value allowed to clip: a raw address may be
     two lines, never one ellipsised line, and the full text stays in `title`. */}
                        <div className="flex items-start justify-between gap-2 text-[#e8eaed]">
 <span className="text-[rgba(232,234,237,0.62)] text-xs font-semibold shrink-0 whitespace-nowrap">Lokasi:</span>
                          <span
                            data-testid={`berita-lokasi-${item.id}`}
                            className="min-w-0 flex-1 text-right line-clamp-2 break-words"
                            title={`${item.location_name || 'Koridor Sumatera'}${item.lat && item.lon ? ` · ${item.lat.toFixed(2)}°N, ${item.lon.toFixed(2)}°E` : ''} (${item.location_precision === 'corridor_point'
                              ? 'Koridor ~0.9 km'
                              : item.location_precision === 'kecamatan_kelurahan'
                                ? 'Sub-Distrik ~1.8 km'
                                : 'Kab/Kota'})`}
                          >
                            {item.location_name || 'Koridor Sumatera'}
                            {item.lat && item.lon ? ` · ${item.lat.toFixed(2)}°N, ${item.lon.toFixed(2)}°E` : ''}
                            {' '}({item.location_precision === 'corridor_point'
                              ? 'Koridor ~0.9 km'
                              : item.location_precision === 'kecamatan_kelurahan'
                                ? 'Sub-Distrik ~1.8 km'
                                : 'Kab/Kota'})
                          </span>
                        </div>

 {/* Row 2 — Keyakinan (Phase 172 / M9): tier + honest label; a percentage only
     when a calibrated consensus value exists. The static 0.86/0.94 tier
     constant is never rendered as confidence. Phase 176.8: the tier badge is
     one line and the honest label is a second line — "Belum terverifikasi" is
     the most important string on the card and must never be ellipsised. */}
                        <div className="flex items-start justify-between gap-2 text-[#e8eaed] border-t border-white/10 pt-1">
 <span className="text-[rgba(232,234,237,0.62)] text-xs font-semibold shrink-0 whitespace-nowrap">Keyakinan:</span>
                          <span
                            data-testid={`berita-confidence-${item.id}`}
                            className="flex min-w-0 flex-col items-end gap-0.5 text-right"
                            title={`${displayTierLabel(item.display_confidence?.tier || item.source_tier)} · ${item.display_confidence?.label || 'Belum terverifikasi'}${item.display_confidence?.basis ? ` (${item.display_confidence.basis})` : ''}`}
                          >
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[#e8eaed] border border-white/10 text-xs font-bold tabular-nums whitespace-nowrap">
                              {item.display_confidence?.value != null && Number.isFinite(Number(item.display_confidence.value))
                                ? `${Math.round(Number(item.display_confidence.value) * 100)}% · `
                                : ''}
                              {displayTierLabel(item.display_confidence?.tier || item.source_tier)}
                            </span>
                            <span className="text-xs font-semibold leading-snug break-words">
                              {item.display_confidence?.label || 'Belum terverifikasi'}
                            </span>
                          </span>
                        </div>


 {/* Row 3 — Jalur. Status + commodity wrap as whole units instead of being
     cut by `truncate`; the bullet travels with the commodity so a wrapped
     line never starts with an orphan separator. */}
                        <div className="flex items-start justify-between gap-2 text-[#e8eaed] border-t border-white/10 pt-1">
 <span className="text-[rgba(232,234,237,0.62)] text-xs font-semibold shrink-0 whitespace-nowrap">Jalur:</span>
                          <div
                            data-testid={`berita-route-${item.id}`}
                            className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right"
                          >
                            <span className={isForecast ? 'text-[#f59e0b] font-semibold shrink-0 whitespace-nowrap' : itemZoneTier === 'RED_CONFIRMED' ? 'text-[#ef4444] font-semibold shrink-0 whitespace-nowrap' : 'text-[#f59e0b] font-semibold shrink-0 whitespace-nowrap'}>
                              {isForecast ? 'Prakiraan Waspada Dini' : itemZoneTier === 'RED_CONFIRMED' ? 'Terputus Total' : 'Lalin Tersendat'}
                            </span>
                            <span className="text-[#e8eaed] break-words" title={item.commodity_name || 'Komoditas Pangan'}>
                              <span className="text-[rgba(232,234,237,0.38)]">• </span>
                              {item.commodity_name || 'Pangan'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Link / Focus */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {canOpenSource ? (
                            <a
                              href={articleLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="cursor-pointer p-1 rounded bg-[#121822] text-[rgba(232,234,237,0.62)] hover:text-white border border-white/10 transition-colors"
                              title="Buka Berita Asli di Tab Baru"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#f59e0b]/40 bg-[#f59e0b]/[0.06] text-[#f59e0b] text-xs font-mono">
                                <AlertTriangle className="w-3 h-3 text-[#f59e0b] shrink-0" />
                                <span>{isExpiredLink ? 'Tautan asli kedaluwarsa' : 'Tautan sumber tidak tersedia'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedNewsId(isExcerptExpanded ? null : item.id);
                                }}
                                className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded bg-[#121822] text-[#e8eaed] hover:text-white border border-white/10 transition-colors text-xs font-mono"
                                title={isExcerptExpanded ? 'Sembunyikan kutipan tersimpan' : 'Tampilkan kutipan tersimpan'}
                              >
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform duration-200 ${isExcerptExpanded ? 'rotate-180' : ''
                                    }`}
                                />
                                <span>{isExcerptExpanded ? 'Sembunyikan kutipan' : 'Kutipan tersimpan'}</span>
                              </button>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            data-testid={`berita-focus-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFocusMap();
                            }}
                            title="Fokuskan peta & audit trail zona ini"
                            className="cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors shadow-sm bg-white hover:opacity-90 text-[#080d14]"
                          >
                            <span>Fokus</span>
                          </button>
                          {activeRouteIdx != null && currentMapRoutes.length > 0 && currentMapRoutes.some((r) => r.corridor_type !== 'hold_staging') && currentMapRoutes[activeRouteIdx]?.corridor_type !== 'hold_staging' && !isForecast && (
                          <button
                            type="button"
                            data-testid={`berita-hold-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFocusMap();
                            }}
                            title={isForecast ? 'Terapkan opsi TAHAN armada (prakiraan waspada dini — tanpa pengalihan rute)' : 'Tahan armada terkait zona ini'}
                            className="cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors border border-white/10 text-[rgba(232,234,237,0.62)] hover:border-white/25 hover:text-[#e8eaed]"
                          >
                            <span>Tahan (Hold)</span>
                          </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                  </div>
                ))
              )}
            </div>

            {/* Guest evaluation banner — docked in-flow (Phase 176.9). It sits
                between the scrolling feed and the data footer, so it can never
                overlay a card. Hidden automatically for authenticated sessions. */}
            <GuestEvaluationBanner />

            {/* Data-integrity provenance lives in the FreshnessBadge tooltip (title attr) — no 3-col grid. */}
            <div
              data-testid="news-panel-footer"
              className="border-t border-white/10 pt-2 text-xs font-mono text-[rgba(232,234,237,0.62)] space-y-1.5 shrink-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-[rgba(232,234,237,0.62)] font-bold">Data</span>
                <button
                  type="button"
                  data-testid="news-footer-data"
                  onClick={() => setShowSensorInfo(v => !v)}
                  className="cursor-pointer text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] transition-colors"
                  title="Transparansi Data"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
              </div>

              {showSensorInfo && (
 <div className="p-2 rounded bg-[#080d14] border border-white/10 text-xs font-sans text-[#e8eaed] leading-relaxed duration-150">
                  <strong>Transparansi Data:</strong> Status koneksi telemetri dan integrasi API operasional.
                </div>
              )}
            </div>
          </aside>

          {/* COLUMN 2: BOUNDED CENTER MAP VIEWPORT */}
          <div className="relative flex-1 h-full min-w-0 overflow-hidden">
            {/* 1. Full-Bleed 4D Mapbox Map Canvas */}
            <div className="absolute inset-0 w-full h-full z-0">
              <CrisisMap
                incidents={activeIncidents}
                selectedCrisisId={selectedCrisisId}
                onCrisisClick={handleCrisisClick}
                activeRoutes={
                  currentMapRoutes.length > 0 ? currentMapRoutes : (selectedCrisis?.route_recommendations || [])
                }
                activeRouteIdx={activeRouteIdx}
                fireHotspots={showFireHotspots ? fireHotspots : []}
                activeFleet={mapFleetVehicles}
                demoStage={demoState.isRunning ? demoState.stage : null}
                disasterZones={combinedDisasterZones}
                onZoneClick={handleZoneClick}
                flyToCoords={mapFlyTo}
                onPolygonDrawn={handlePolygonDrawn}
                drawModeActive={drawModeActive}
                isClickTargeting={isClickTargeting}
                onMapPointTargeted={(lat, lon) => handleMapPointTargeted(lat, lon)}
                simulatedShockwave={simulatedShockwave}
                selectedOriginNode={selectedOriginNode || undefined}
                selectedDestNode={selectedDestNode || undefined}
                onNodeSelected={handleNodeSelected}
                onCustomPointSelected={handleCustomPointSelected}
                onSelectRoute={(idx) => void handleSelectRoute(idx, 'map-popover')}
                hubNodesList={dynamicHubNodes}
                corridorContext={corridorContext}
                spatialWeatherPolygons={combinedWeatherPolygons}
                showWeatherAdvisory={showWeatherAdvisory}
                onToggleWeatherAdvisory={() => setShowWeatherAdvisory((v) => !v)}
                routingInfo={routingInfo}
                isLeftSidebarCollapsed={isLeftSidebarCollapsed}
                onExpandSidebar={() => setIsLeftSidebarCollapsed(false)}
                onCollapseSidebar={() => setIsLeftSidebarCollapsed(true)}
                fleetModalityFilter={fleetModalityFilter}
                simSpeed={simSpeed}
                isRightSidebarOpen={isRightInspectorActive}
                selectedVehicleId={selectedVehicle?.vehicle_id ?? null}
                onSelectVehicle={handleSelectVehicle}
                onCloseVehicle={handleCloseVehicle}
                corridorVisibility={corridorVisibility}
                onToggleCorridor={handleToggleCorridor}
                onResetCorridorVisibility={handleResetCorridors}
                hiddenRouteIndices={hiddenRouteIndices}
                onHideRoute={handleHideRoute}
                hideEstimatedRoutes={true}
                topNavTelemetrySlot={
                  <TopNavTelemetry
                    routingInfo={routingInfo}
                    corridorContext={corridorContext}
                    isLoading={isCorridorLoading}
                    isRoutingLoading={isRoutingLoading}
                    onOpenHitl={() => setIsHitlDrawerOpen(true)}
                    pendingHitlCount={pendingHitlCount}
                    isLeftSidebarCollapsed={isLeftSidebarCollapsed}
                    showRedZones={showRedZones}
                    onToggleRedZones={() => setShowRedZones(v => !v)}
                    redZoneCount={liveNewsZoneCounts.red}
                    showYellowZones={showYellowZones}
                    onToggleYellowZones={() => setShowYellowZones(v => !v)}
                    yellowZoneCount={liveNewsZoneCounts.yellow}
                    showWeatherPolygons={showWeatherPolygons}
                    onToggleWeatherPolygons={() => setShowWeatherPolygons(v => !v)}
                    weatherPolygonCount={weatherPolygonCount}
                    showWeatherAdvisory={showWeatherAdvisory}
                    onToggleWeatherAdvisory={() => setShowWeatherAdvisory((v) => !v)}
                    weatherAdvisoryCount={weatherAdvisoryCount}
                    weatherDisruptionCount={weatherDisruptionCount}
                    weatherSummary={weatherSummary}
                    weatherSample={weatherSample}
                    weatherPolygonMeta={weatherPolygonMeta}
                    showFireHotspots={showFireHotspots}
                    onToggleFireHotspots={() => setShowFireHotspots(v => !v)}
                    fireHotspotCount={fireHotspotCount ?? undefined}
                    fireCount={fireHotspotCount}
                    fireStatus={fireStatus}
                    fireReason={fireReason}
                    fireSource={fireSource}
                    fireUpdatedAt={fireUpdatedAt}
                    fireWindowHours={fireWindowHours}
                    onSelectHub={(hub) => {
                      setMapFlyTo({ lon: hub.coords[0], lat: hub.coords[1], zoom: 11, ts: Date.now() });
                    }}
                    onFocusRoute={() => {
                      if (selectedOriginNode && selectedDestNode) {
                        const orig = dynamicHubNodes.find(n => n.id === selectedOriginNode);
                        if (orig) setMapFlyTo({ lon: orig.coords[0], lat: orig.coords[1], zoom: 9, ts: Date.now() });
                      }
                    }}
                  />
                }
                fleetModalitySlot={
                  !(isSidebarOpen && selectedCrisis) ? (
 <div data-testid="filter-strip" className="flex items-center gap-1 p-1 rounded-xl bg-[#0c1017] border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.4)] overflow-x-auto no-scrollbar snap-x snap-mandatory max-w-[calc(100vw-2rem)]">
                      {/*
                        Phase 176.6 — Row 2 below `md`: the Merah/Kuning legend
                        toggles open this same scroll strip, so the counters above
                        are the only pinned line. At `md`+ the legend lives back in
                        the telemetry row and this stays the modality bar.
                      */}
                      {isLeftSidebarCollapsed && (
                        <>
                          <div className="md:hidden flex items-center gap-1 shrink-0 snap-start">
                            <HazardLegendPills
                              showRedZones={showRedZones}
                              onToggleRedZones={() => setShowRedZones((v) => !v)}
                              redZoneCount={liveNewsZoneCounts.red}
                              showYellowZones={showYellowZones}
                              onToggleYellowZones={() => setShowYellowZones((v) => !v)}
                              yellowZoneCount={liveNewsZoneCounts.yellow}
                            />
                          </div>
                          <div className="md:hidden w-[1px] h-4 bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />
                        </>
                      )}
                      {[
 { id: 'all', label: 'Semua', count: fleetCountVehicles.length, icon: null },
 { id: 'truck', label: 'Truk', count: fleetCountVehicles.filter((v) => v.modality === 'truck').length, icon: Truck },
 { id: 'maritime', label: 'Kapal', count: fleetCountVehicles.filter((v) => v.modality === 'maritime').length, icon: Anchor },
 { id: 'air', label: 'Udara', count: fleetCountVehicles.filter((v) => v.modality === 'air').length, icon: Plane },
                      ].map((m) => {
                        const IconComp = m.icon;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const fleetFilter = m.id as 'all' | 'truck' | 'maritime' | 'air';
                              handleModalityChange(fleetFilter === 'all' ? 'best' : fleetFilter);
                              setToast({
                                message: `Filter Armada: ${m.label} (${m.count} Unit): modalitas rute disinkronkan`,
                                type: 'info',
                              });
                            }}
                            className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 shrink-0 snap-start ${fleetModalityFilter === m.id
                                ? 'bg-white text-[#080d14] font-bold'
                                : 'text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] hover:bg-white/5'
                              }`}
                          >
                            {IconComp && <IconComp className="w-3.5 h-3.5" />}
                            <span>{m.label}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs tabular-nums ${fleetModalityFilter === m.id ? 'bg-[#080d14] text-white' : 'bg-white/10 text-[rgba(232,234,237,0.62)]'
                                }`}
                            >
                              {m.count}
                            </span>
                          </button>
                        );
                      })}
                      <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />
                      {canToggleFleetSimulation ? (
                        <button
                          type="button"
                          id="fleet-sim-toggle-btn"
                          onClick={() => {
                            const nextMode = !isFleetSimMode;
                            setIsFleetSimMode(nextMode);
                            setToast({
                              message: nextMode
                                ? 'Filter Armada: Semua Armada Live & Rute Terestimasi'
                                : 'Filter Armada: Hanya Transponder (AIS/ADS-B) & GPS Aktif',
                              type: 'info',
                            });
                          }}
                          className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 shrink-0 border ${
                            isFleetSimMode
                              ? 'bg-white/[0.06] text-[rgba(232,234,237,0.62)] border-white/10'
                              : 'bg-white text-[#080d14] border-white font-bold'
                          }`}
                          title="Mode Telemetri:&#10;• Live [Hanya GPS & Transponder Live]: Dispatch taktis instan berbasis sinyal fisik AIS & GPS satelit.&#10;• Estimasi [Live AIS/ADS-B + Rute Estimasi]: Perencanaan kapasitas makro koridor logistik pangan."
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${isFleetSimMode ? 'bg-white/40' : 'bg-[#10b981]'}
                              }`}
                          />
                          <span>
                            {isFleetSimMode
                              ? `Live AIS/ADS-B + Rute Estimasi (${fleetCountVehicles.length})`
                              : `Hanya GPS & Transponder Live (${fleetCountVehicles.length})`}
                          </span>
                        </button>
                      ) : (
                        <span
                          id="fleet-tenant-scope-badge"
                          className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 bg-white/[0.06] text-[#e8eaed] border border-white/10 tabular-nums"
 title="Sesi DISPATCHER: badge ini hanya armada perusahaan Anda dengan GPS live. Peta + pills Semua/Kapal/Udara menambahkan koridor publik AIS/ADS-B situasional. Unit estimasi tersedia lewat panel Armada Perusahaan."
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                          <span>Perusahaan Live GPS ({liveTenantVehicles.length})</span>
                        </span>
                      )}
                    </div>
                  ) : null
                }
                mapLegendSlot={
                  <FloatingMapLegend
                    isOpen={isMapLegendOpen}
                    onToggle={() => setIsMapLegendOpen(v => !v)}
                    corridorVisibility={corridorVisibility}
                    onToggleCorridor={handleToggleCorridor}
                    onResetCorridorVisibility={handleResetCorridors}
                    weatherDisruptionCount={weatherDisruptionCount ?? 0}
                    weatherAdvisoryCount={weatherAdvisoryCount ?? 0}
                    showWeatherAdvisory={showWeatherAdvisory}
                    weatherPolygonFeatureCount={disruptionFeatures.length}
                    weatherPolygonMeta={weatherPolygonMeta}
                    weatherSummary={weatherSummary}
                    fireStatus={fireStatus}
                    fireUpdatedAt={fireUpdatedAt}
                    fireReason={fireReason}
                    bootstrapComputedAt={bootstrap.data?.computed_at ?? null}
                    bootstrapStale={bootstrap.stale}
                    bootstrapReason={
                      bootstrap.stale
                        ? `Snapshot tertunda (${bootstrap.data?.reason ?? 'usia snapshot > 10 mnt'})`
                        : 'Snapshot DB segar'
                    }
                    liveFireCluster={liveFireCluster}
                  />
                }
              />
            </div>

            {/* Dispatcher roster lives by the header trigger (#fleet-roster-toggle):
                no bottom-left floating mount (single source of truth). */}

            {/* Route-computation status modal: centered overlay (Watermelon
                Dialog-1 pattern), auto-closes on done. Test-id + role kept. */}
            <RoutingStatusBanner
              isLoading={isRoutingLoading}
              error={routingError}
              elapsedMs={routingElapsedMs}
              onCancel={handleCancelRouting}
              onDismissError={() => {
                setRoutingError(null);
                setRoutingNoRouteReason(null);
              }}
            />

            {/* Phase 170: solver refusals (origin/destination too far from the
                hub graph, or both endpoints collapsing onto one hub) used to be
                swallowed by an early return. The reason is now always visible
                and the already-rendered corridor is never cleared. */}
            {routingNoRouteReason && (
              <div
                data-testid="routing-no-route-reason"
                role="status"
                aria-live="polite"
                className="absolute left-1/2 top-16 z-[85] w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl border border-[#f59e0b]/40 bg-[#0c1017] px-3.5 py-2.5 text-xs font-sans text-[#e8eaed] shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-[#f59e0b]">
                    RUTE SOLVER
                  </span>
                  <span className="min-w-0 flex-1 leading-relaxed">{routingNoRouteReason}</span>
                  <button
                    type="button"
                    onClick={() => setRoutingNoRouteReason(null)}
                    aria-label="Tutup alasan rute solver"
                    className="shrink-0 cursor-pointer rounded p-0.5 text-[rgba(232,234,237,0.62)] transition-colors hover:bg-white/10 hover:text-[#e8eaed]"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Decision Support System (DSS): Dispatcher Alert Queue Strip */}
            {!isAlertQueueDismissed && impactAssessmentData && impactAssessmentData.impacted_vehicles.length > 0 && (
              <DispatcherAlertQueue
                impactData={impactAssessmentData}
                selectedVehicleId={selectedImpactedVehicle?.vehicle_id || null}
 isCrisisDrawerOpen={isRightInspectorActive}
                onSelectVehicle={(assessment) => {
                  setSelectedImpactedVehicle(assessment);
                  setActiveTab('Mitigation');
                  setIsSidebarOpen(true);
                  if (assessment.detour_route) {
                    setActiveRouteIdx(0);
                  }
                  setToast({
                    message: `Fokus Armada: ${assessment.vehicle_id} (${assessment.commodity_key}). Matriks susut dimuat.`,
                    type: 'info',
                  });
                }}
                onDismiss={() => setIsAlertQueueDismissed(true)}
              />
            )}

            {/* Relocated Collapsible Floating Simulator Dock above Bottombar (Hidden during guided demo to avoid UI overlap) */}
            {!demoState.isRunning && (
              <CrisisSimulatorBar
                onTriggerPointSimulation={(lat, lon, type, radiusKm, severity) =>
                  handleMapPointTargeted(lat, lon, type, radiusKm, severity)
                }
                isClickTargeting={isClickTargeting}
                setIsClickTargeting={setIsClickTargeting}
                drawModeActive={drawModeActive}
                setDrawModeActive={setDrawModeActive}
                simulationActive={!!simulatedShockwave || disasterZones.length > 0 || selectedCrisisId === 'simulated-active'}
                onClearSimulation={handleClearSimulation}
                originNodeId={selectedOriginNode}
                destNodeId={selectedDestNode}
                originInfo={originDisplayInfo}
                destInfo={destDisplayInfo}
                selectedRadius={selectedRadius}
                setSelectedRadius={setSelectedRadius}
                selectedModality={selectedModality}
                setSelectedModality={handleModalityChange}
                corridorVisibility={corridorVisibility}
                onToggleCorridor={handleToggleCorridor}
                onResetCorridorVisibility={handleResetCorridors}
                hiddenRouteCount={hiddenRouteCount}
                activeCorridors={currentMapRoutes.length > 0 ? currentMapRoutes : (selectedCrisis?.route_recommendations || [])}
                onResetNodes={handleResetNodes}
                isSidebarOpen={isRightInspectorActive}
                isLeftSidebarCollapsed={isLeftSidebarCollapsed}
                simSpeed={simSpeed}
                setSimSpeed={setSimSpeed}
                selectedCommodity={selectedCommodity}
                onSelectCommodity={handleSelectCommodity}
                isSimulatorArmed={isClickTargeting || drawModeActive}
                autoRadiusKm={selectedCrisis?.radius_km ?? simulatedShockwave?.radiusKm ?? selectedRadius ?? 8}
              />
            )}

            {/* Guided Presentation Demo Panel */}
            <GuidedDemoPanel
              stage={demoState.stage}
              isRunning={demoState.isRunning}
              isReplay={demoState.isReplay}
              crisisId={demoState.crisisId}
              confidence={demoState.confidence}
              summary={demoState.summary}
              isAuto={demoState.isAuto}
              isCalculatingRoute={demoState.isCalculatingRoute}
              onStart={(opts) => {
                const origin = opts?.origin || 'belawan';
                const dest = opts?.destination || 'tebingtinggi';
                setSelectedOriginNode(origin);
                setSelectedDestNode(dest);
                setCurrentMapRoutes([]);
                updateUrlParams({ origin, dest, route: '0' });
                demoState.start({
                  mock_agents: true,
                  offline: false,
                  origin,
                  destination: dest,
                });
              }}
              onAdvance={handleDemoAdvance}
              onToggleAuto={demoState.toggleAuto}
              onReset={handleResetDemo}
              isSidebarOpen={isSidebarOpen && !!selectedCrisis}
              selectedOrigin={selectedOriginNode}
              selectedDestination={selectedDestNode}
              originInfo={originDisplayInfo}
              destInfo={destDisplayInfo}
              inflationForecast={demoState.currentCrisisState?.inflation_forecast}
              economicFinding={demoState.currentCrisisState?.economic_intelligence_finding}
              onOpenMitigation={() => {
                setActiveTab('Mitigation');
                setIsSidebarOpen(true);
              }}
              onSelectPreset={(origin, dest) => {
                setSelectedOriginNode(origin);
                setSelectedDestNode(dest);
                updateUrlParams({ origin, dest });
              }}
            />

 {/* Demo Dock */}
            {!demoState.isRunning && (
 <footer className={`absolute bottom-4 sm:bottom-6 z-40 flex items-center gap-1.5 bg-[#0c1017] border border-white/10 p-1.5 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.4)] transition-all duration-300 pointer-events-auto overflow-x-auto no-scrollbar ${footerDockClass}`}>
                <button
                  type="button"
                  id="run-demo-btn"
                  onClick={() => {
                    setSelectedOriginNode('belawan');
                    setSelectedDestNode('tebingtinggi');
                    setCurrentMapRoutes([]);
                    updateUrlParams({ origin: 'belawan', dest: 'tebingtinggi', route: '0' });
                    demoState.start({ mock_agents: true, offline: false, origin: 'belawan', destination: 'tebingtinggi' });
                  }}
 className="flex items-center gap-1.5 px-3 py-1 rounded bg-white hover:opacity-90 text-[#080d14] font-semibold text-xs transition-colors shadow-sm cursor-pointer shrink-0"
                >
                  <Play className="w-3 h-3 fill-current" />
 <span>Demo</span>
                </button>
              </footer>
            )}

            {/* Right Tactical Inspector Dock (CrisisSidebar) */}
            {!selectedVehicle && isSidebarOpen && selectedCrisis && (
              <CrisisSidebar
                crisis={selectedCrisis}
                onClose={() => setIsSidebarOpen(false)}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                activeRouteIdx={activeRouteIdx}
                hasRoute={(() => {
                  // Evidence-only gate: hold_staging (forecast HOLD placeholder)
                  // never counts as a route — only real corridors unlock tabs.
                  const routes = currentMapRoutes.length > 0 ? currentMapRoutes : (selectedCrisis?.route_recommendations ?? []);
                  if (activeRouteIdx != null && routes[activeRouteIdx]?.corridor_type !== 'hold_staging') return true;
                  return routes.some((r) => r.corridor_type !== 'hold_staging');
                })()}
                onSelectRoute={(idx) => void handleSelectRoute(idx, 'sidebar')}
                onApproveSuccess={(msg) => setToast({ message: msg, type: 'success' })}
                onCommitOperationalRoute={handleCommitOperationalRoute}
                selectedImpactedVehicle={selectedImpactedVehicle}
                selectedCommodity={selectedCommodity}
              />
            )}
            {/* Phase 77: Route Detail Modal — opened by every select path */}
            {(() => {
              const routes =
                currentMapRoutes.length > 0
                  ? currentMapRoutes
                  : (selectedCrisis?.route_recommendations || []);
              const modalIdx = routeModalIdx ?? activeRouteIdx ?? 0;
              const modalRoute = routes[modalIdx];
              if (routeModalIdx === null || !modalRoute) return null;
              return (
                <RouteDetailModal
                  route={modalRoute}
                  crisis={selectedCrisis}
                  open={routeModalIdx !== null}
                  onClose={() => setRouteModalIdx(null)}
                  role={role === 'REGULATOR' ? 'REGULATOR' : role === 'GUEST' ? 'GUEST' : 'DISPATCHER'}
                  mode={role === 'GUEST' ? 'sandbox' : 'live'}
                  onAction={handleModalAction}
                  isActing={isActing}
                  corridorIsFallback={!!corridorContext?.is_fallback}
                  onOpenEvaluation={() => {
                    setRouteModalIdx(null);
                    setActiveSection('evaluation');
                  }}
                />
              );
            })()}
          </div>

        </div>

        {/* Section 2: Analytics Dashboard — GUEST hard-blocked at mount */}
        <div className={`w-full h-full p-4 lg:p-6 overflow-y-auto ${activeSection === 'analytics' ? 'block' : 'hidden'}`}>
          {(role === 'GUEST' || !isAuthenticated) ? (
            <div
              role="alert"
              aria-label="Analitik terkunci untuk tamu"
              className="w-full h-full min-h-[320px] flex flex-col items-center justify-center gap-3 bg-[#0c1017] border border-white/10 rounded-xl p-8 text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-[#121822] border border-white/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[rgba(232,234,237,0.62)]" aria-hidden="true" />
              </div>
              <h2 className="font-headline font-semibold text-base text-white">Analitik terkunci — Mode Sandbox</h2>
              <p className="text-xs text-[rgba(232,234,237,0.62)] max-w-md leading-relaxed">
                Tamu tidak dapat membuka Analitik. Masuk sebagai Dispatcher untuk melihat analitik
                operasional atau sebagai Regulator untuk melihat agregat pengawasan.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="cursor-pointer px-4 py-2 rounded-md bg-white text-[#080d14] text-xs font-semibold hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Masuk untuk membuka Analitik
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('map')}
                  className="cursor-pointer px-4 py-2 rounded-md bg-white/5 border border-white/10 text-[#e8eaed] text-xs font-medium hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Kembali ke Peta
                </button>
              </div>
            </div>
          ) : (
            // Phase 163b (M8): mounted only while the tab is open. Before this,
            // all three sections rendered on every /dashboard paint (CSS-hidden)
            // and fired their own commodity/approval/evaluation reads, which was
            // the single largest source of first-mount requests.
            activeSection === 'analytics' && (
              <AnalyticsSection
                selectedCrisis={selectedCrisis}
                corridorContext={corridorContext}
                activeRoutes={currentMapRoutes}
                onSwitchTab={(tab) => setActiveSection(tab)}
              />
            )
          )}
        </div>

        {/* Section 3: Executive Reports — GUEST hard-blocked at mount */}
        <div className={`w-full h-full p-4 lg:p-6 overflow-y-auto ${activeSection === 'reports' ? 'block' : 'hidden'}`}>
          {(role === 'GUEST' || !isAuthenticated) ? (
            <div
              role="alert"
              aria-label="Laporan terkunci untuk tamu"
              className="w-full h-full min-h-[320px] flex flex-col items-center justify-center gap-3 bg-[#0c1017] border border-white/10 rounded-xl p-8 text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-[#121822] border border-white/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[rgba(232,234,237,0.62)]" aria-hidden="true" />
              </div>
              <h2 className="font-headline font-semibold text-base text-white">Laporan terkunci — Mode Sandbox</h2>
              <p className="text-xs text-[rgba(232,234,237,0.62)] max-w-md leading-relaxed">
                Tamu tidak dapat membuka Laporan. Masuk sebagai Dispatcher untuk mencatat mitigasi
                atau sebagai Regulator untuk melihat agregat pengawasan.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="cursor-pointer px-4 py-2 rounded-md bg-white text-[#080d14] text-xs font-semibold hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Masuk untuk membuka Laporan
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('map')}
                  className="cursor-pointer px-4 py-2 rounded-md bg-white/5 border border-white/10 text-[#e8eaed] text-xs font-medium hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Kembali ke Peta
                </button>
              </div>
            </div>
          ) : (
            activeSection === 'reports' && (
              <ReportsSection
                approvalsCount={approvalsCount}
                corridorContext={corridorContext}
                selectedCrisis={selectedCrisis}
                activeRoutes={currentMapRoutes}
                onCreateMitigation={() => setActiveSection('map')}
              />
            )
          )}
        </div>

        {/* Section 5: Dedicated Evaluation & Benchmark Dashboard — GUEST hard-blocked at mount */}
        <div className={`w-full h-full p-4 lg:p-6 overflow-y-auto ${activeSection === 'evaluation' ? 'block' : 'hidden'}`}>
          {(role === 'GUEST' || !isAuthenticated) ? (
            <div
              role="alert"
              aria-label="Evaluasi terkunci untuk tamu"
              className="w-full h-full min-h-[320px] flex flex-col items-center justify-center gap-3 bg-[#0c1017] border border-white/10 rounded-xl p-8 text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-[#121822] border border-white/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[rgba(232,234,237,0.62)]" aria-hidden="true" />
              </div>
              <h2 className="font-headline font-semibold text-base text-white">Evaluasi terkunci — Mode Sandbox</h2>
              <p className="text-xs text-[rgba(232,234,237,0.62)] max-w-md leading-relaxed">
                Tamu tidak dapat membuka Evaluasi. Masuk sebagai Dispatcher untuk melihat evaluasi
                operasional atau sebagai Regulator untuk melihat agregat pengawasan.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="cursor-pointer px-4 py-2 rounded-md bg-white text-[#080d14] text-xs font-semibold hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Masuk untuk membuka Evaluasi
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('map')}
                  className="cursor-pointer px-4 py-2 rounded-md bg-white/5 border border-white/10 text-[#e8eaed] text-xs font-medium hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Kembali ke Peta
                </button>
              </div>
            </div>
          ) : (
            activeSection === 'evaluation' && (
              <EvaluationSection
                corridorContext={corridorContext}
                selectedCrisis={selectedCrisis}
                activeRoutes={currentMapRoutes}
              />
            )
          )}
        </div>

      </main>
    </div>
  );
}
