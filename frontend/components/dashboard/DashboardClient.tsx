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
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useIncidents } from '@/hooks/useIncidents';
import { useCrisisSocket } from '@/hooks/useCrisisSocket';
import { CrisisSidebar } from '@/components/sidebar/CrisisSidebar';
import { Toast } from '@/components/ui/Toast';
import { useDemoState } from '@/hooks/useDemoState';
import { useFleetVehicles } from '@/hooks/useFleetVehicles';
import { useCorridorContext } from '@/hooks/useCorridorContext';
import { useNewsVerification } from '@/hooks/useNewsVerification';
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
import type { CrisisState, WsEvent, CrisisType, Severity, RouteRecommendation, DisasterZone, HazardImpactProfile, ZoneTier, FleetVehicle, TacticalManeuver, FireHotspot } from '@/lib/types';
import { useAuth } from '@/lib/authContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { FleetOnboardingModal } from '@/components/fleet/FleetOnboardingModal';
import { TenantFleetRoster } from '@/components/fleet/TenantFleetRoster';
import { useCrisisSimulationStream } from '@/hooks/useCrisisSimulationStream';

import { TopNavTelemetry } from '@/components/dashboard/TopNavTelemetry';
import { RoutingStatusBanner } from '@/components/dashboard/RoutingStatusBanner';
import { DispatcherAlertQueue } from '@/components/dashboard/DispatcherAlertQueue';
import { HitlDecisionDrawer } from '@/components/dashboard/HitlDecisionDrawer';
import { RouteDetailModal } from '@/components/sidebar/RouteDetailModal';
import type { DisruptionImpactResponse, ImpactedVehicleAssessment } from '@/lib/types';

// Dynamic import for map to avoid SSR issues
const CrisisMap = dynamic(() => import('@/components/map/CrisisMap'), { ssr: false });

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

// Applies operational approval styling: the approved corridor turns cyan, its alternatives dim out.
// Shared by handleDeployUnifiedActionPlan and handleCommitOperationalRoute so both route stores stay identical.
function styleApprovedRoutes(routes: RouteRecommendation[], approved: RouteRecommendation): RouteRecommendation[] {
  return routes.map((r) =>
    (r.id && r.id === approved.id) || (r.description && r.description === approved.description)
      ? { ...r, color: '#00f0ff', is_compromised: false, safety_status: 'SAFE_DETOUR' }
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
}) {
  return (
    <div className="relative pointer-events-auto">
      <button
        type="button"
        onClick={onToggle}
        className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xl ${
          isOpen
            ? 'bg-white text-[#080d14] border-white'
            : 'bg-[#0c1017] text-slate-300 border-[#1c2432] hover:text-white hover:bg-[#121822]'
        }`}
        title="Buka Legenda Peta & Rute"
      >
        <Info className="w-4 h-4 text-slate-300" />
        <span>LEGENDA RUTE</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-[#0c1017] border border-[#1c2432] p-3.5 rounded-lg shadow-xl text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150 z-50">
          <div className="flex items-center justify-between border-b border-[#1c2432] pb-2">
            <span className="font-mono font-semibold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-slate-300" />
              <span>Legenda Peta & Keputusan</span>
            </span>
            <button
              type="button"
              onClick={onToggle}
              className="cursor-pointer p-1 rounded-md bg-[#121822] text-slate-400 hover:text-white border border-[#1c2432] transition-colors"
              title="Tutup Legenda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
              <div>
                <span className="text-slate-200 font-medium block">Rute Rekomendasi Tercepat</span>
                <span className="text-xs text-slate-400 font-sans">Bebas bahaya dengan jarak dan waktu tempuh paling efisien.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <div>
                <span className="text-slate-200 font-medium block">Rute Alternatif Sekunder</span>
                <span className="text-xs text-slate-400 font-sans">Jalur alternatif cadangan dengan deviasi waktu lebih panjang.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <div>
                <span className="text-slate-200 font-medium block">Koridor Utama Terblokir</span>
                <span className="text-xs text-slate-400 font-sans">Jalur utama yang terhambat genangan atau longsor.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full border border-rose-500 bg-rose-500/20 shrink-0" />
              <div>
                <span className="text-slate-200 font-medium block">Zona Radius Bahaya (Shockwave)</span>
                <span className="text-xs text-slate-400 font-sans">Area bahaya hasil konsensus BMKG dan OSINT.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full border border-orange-400 bg-orange-500/25 shrink-0" />
              <div>
                <span className="text-slate-200 font-medium block">Karhutla FIRMS (Radius 1 / 2,5 / 5 km)</span>
                <span className="text-xs text-slate-400 font-sans">Area oranye by FRP: kritis 5 km, tinggi 2,5 km, sedang 1 km. Klik area/titik = FRP/conf/jarak koridor.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white shrink-0" />
              <div>
                <span className="text-slate-200 font-medium block">Hub Logistik Pangan</span>
                <span className="text-xs text-slate-400 font-sans">Pelabuhan Utama, Gudang BULOG, Pasar Induk.</span>
              </div>
            </div>

            <div className="pt-2 mt-2 border-t border-[#1c2432]/80 space-y-2">
              <span className="text-slate-400 font-sans font-semibold text-[11px] uppercase tracking-wider block">
                Armada Multimoda & Koridor Maritim
              </span>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                <div>
                  <span className="text-slate-200 font-medium block">Kapal Kargo & Feri Maritim (AIS)</span>
                  <span className="text-xs text-slate-400 font-sans">Transponder AIS Selat Malaka, Selat Sunda & Teluk Palembang.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                <div>
                  <span className="text-slate-200 font-medium block">Truk Logistik Pangan (GPS)</span>
                  <span className="text-xs text-slate-400 font-sans">Telemetri satelit koridor Tol Trans-Sumatera & Jalinsum.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0 shadow-[0_0_8px_rgba(192,132,252,0.5)]" />
                <div>
                  <span className="text-slate-200 font-medium block">Kargo Udara Darurat (ADS-B)</span>
                  <span className="text-xs text-slate-400 font-sans">Penerbangan logistik hub KNO, PDG, & PLM.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 border-b-2 border-dashed border-blue-600 shrink-0" />
                <div>
                  <span className="text-slate-200 font-medium block">Alur Laut Selat Malaka (TSS)</span>
                  <span className="text-xs text-slate-400 font-sans">Koridor pelayaran vital logistik maritim Sumatra.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 border-b-2 border-dashed border-amber-400 shrink-0" />
                <div>
                  <span className="text-slate-200 font-medium block">Proyeksi Rute Estimasi</span>
                  <span className="text-xs text-slate-400 font-sans">Lintasan terencana berbasis manifes pelayaran.</span>
                </div>
              </div>
            </div>

            {/* Disruption-only weather legend: filtered set counts (biru=gangguan, ungu=advisori). */}
            <div className="pt-2 mt-2 border-t border-[#1c2432]/80 space-y-2">
              <span className="text-slate-400 font-sans font-semibold text-[11px] uppercase tracking-wider block">
                Radar Cuaca (Gangguan)
              </span>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                <div>
                  <span className="text-slate-200 font-medium block">Radar Cuaca (Gangguan, biru) — {weatherDisruptionCount} zona</span>
                  <span className="text-xs text-slate-400 font-sans">Hujan lebat disruptif: high/critical, presipitasi 50mm/24j atau banjir 80%. Default ON. Hazard: flood/landslide/severe_storm/marine_wave.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                <div>
                  <span className="text-slate-200 font-medium block">Dampak Dispather per Zona Biru</span>
                  <span className="text-xs text-slate-400 font-sans">Klik poligon: koridor+segmen+jarak, delay jam (flood 14/landslide 10/marine 18 × severity), aksi (CAUTION/DELAY/REROUTE/HOLD), moda truck/sea/air, confidence + observasi/prakiraan.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                <div>
                  <span className="text-slate-200 font-medium block">Advisori (ungu) — {weatherAdvisoryCount} zona {showWeatherAdvisory ? '(ON)' : '(OFF)'}</span>
                  <span className="text-xs text-slate-400 font-sans">Medium drizzle (mis. BMKG 60): hanya tampil bila toggle advisori ON.</span>
                </div>
              </div>
            </div>

            {/* Q4/Q5: direct land vs island-ring corridors + live/offline provenance */}
            <div className="pt-2 mt-2 border-t border-[#1c2432]/80 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-sans font-semibold text-[11px] uppercase tracking-wider">
                  Koridor Langsung vs Ring Pulau
                </span>
                <span className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300 font-mono text-[9px] font-bold tracking-wide">
                  SIMULASI/OFFLINE
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-emerald-400 shrink-0 rounded" />
                <div>
                  <span className="text-slate-200 font-medium block">Darat Langsung (disorot)</span>
                  <span className="text-xs text-slate-400 font-sans">Garis penuh emerald: rute darat bebas bahaya.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 border-b-2 border-sky-500 shrink-0" />
                <div>
                  <span className="text-slate-200 font-medium block">Laut — Ring Pulau</span>
                  <span className="text-xs text-slate-400 font-sans">Biru: legs maritim/intermodal antar-pulau.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 border-b-2 border-cyan-400 shrink-0" />
                <div>
                  <span className="text-slate-200 font-medium block">Udara — Ring Pulau</span>
                  <span className="text-xs text-slate-400 font-sans">Cyan: legs kargo udara darurat antar-pulau.</span>
                </div>
              </div>

              <p className="text-[10px] leading-tight text-amber-300/80 font-sans">
                Badge SIMULASI/OFFLINE menandai geometri interpolasi (garis lurus), bukan rute jalan raya live.
              </p>

              {onToggleCorridor && (
                <div className="space-y-1.5 pt-1 border-t border-[#1c2432]/60">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans font-semibold text-[10px] uppercase tracking-wider">
                      Visibilitas Koridor
                    </span>
                    {onResetCorridorVisibility && (
                      <button
                        type="button"
                        onClick={onResetCorridorVisibility}
                        className="cursor-pointer text-[10px] font-mono text-slate-400 hover:text-white transition-colors"
                        title="Aktifkan kembali semua koridor"
                      >
                        Semua ON
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { key: 'land' as const, label: 'Darat', Icon: Truck, activeClass: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300' },
                      { key: 'sea' as const, label: 'Laut', Icon: Anchor, activeClass: 'bg-sky-500/15 border-sky-500/50 text-sky-300' },
                      { key: 'air' as const, label: 'Udara', Icon: Plane, activeClass: 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300' },
                    ]).map(({ key, label, Icon, activeClass }) => {
                      const isVisible = corridorVisibility[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onToggleCorridor(key)}
                          aria-pressed={isVisible}
                          title={`${label}: ${isVisible ? 'tampil' : 'disembunyikan'}`}
                          className={`cursor-pointer px-1.5 py-1.5 rounded border text-[10px] font-sans font-medium transition flex flex-col items-center gap-0.5 ${
                            isVisible
                              ? activeClass
                              : 'bg-[#121822]/60 border-[#1c2432] text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <Icon className="w-3 h-3" />
                            <span>{label}</span>
                          </span>
                          <span className={`text-[9px] font-mono ${isVisible ? 'opacity-80' : 'opacity-60'}`}>
                            {isVisible ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 font-sans pt-1 border-t border-[#1c2432] leading-tight">
            <strong>Transparansi HITL:</strong> PreHub menampilkan semua alternatif rute agar operator dapat membandingkan trade-off waktu dan risiko sebelum persetujuan.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardClient() {
  const { user, role, openAuthModal, isAuthModalOpen, closeAuthModal } = useAuth();
  const { incidents, refetch } = useIncidents();
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
  } = useFleetVehicles();

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
  const [selectedCrisisId, setSelectedCrisisId] = useState<string | null>(initialCrisis);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisState | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [activeRouteIdx, setActiveRouteIdx] = useState<number | null>(initialRouteIdx);
  const [currentMapRoutes, setCurrentMapRoutes] = useState<RouteRecommendation[]>([]);
  // Phase 77: single selection entry point state — modal opens on every select.
  const [routeModalIdx, setRouteModalIdx] = useState<number | null>(null);
  const [isActing, setIsActing] = useState(false);

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
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [isClickTargeting, setIsClickTargeting] = useState(false);
  const [simulatedShockwave, setSimulatedShockwave] = useState<{ center: [number, number]; radiusKm: number; hazardType: string } | null>(null);
  const [disasterZones, setDisasterZones] = useState<DisasterZone[]>([]);
  const [showRedZones, setShowRedZones] = useState<boolean>(true);
  const [showYellowZones, setShowYellowZones] = useState<boolean>(true);
  const [mapFlyTo, setMapFlyTo] = useState<{ lon: number; lat: number; zoom?: number; ts: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null);
  const isDemoRunningRef = useRef<boolean>(false);

  // Decision Support System (DSS) Impact Assessment States
  const [impactAssessmentData, setImpactAssessmentData] = useState<DisruptionImpactResponse | null>(null);
  const [selectedImpactedVehicle, setSelectedImpactedVehicle] = useState<ImpactedVehicleAssessment | null>(null);
  const [isAlertQueueDismissed, setIsAlertQueueDismissed] = useState(false);
  const [isHitlDrawerOpen, setIsHitlDrawerOpen] = useState(false);
  const [pendingHitlCount, setPendingHitlCount] = useState<number>(0);

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
  const [approvalsCount, setApprovalsCount] = useState<number>(14);

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

  // Dispatcher tenant view (issue #2): the map draws LIVE_GPS tenant units only.
  // An explicitly inspected PROYEKSI unit is injected into the layer so it can be
  // framed and inspected, but it never becomes ambient orange corridor noise.
  const isDispatcherWorkspace = role === 'DISPATCHER';
  const selectedIsProjected = selectedVehicle?.tracking_mode === 'ROUTE_ESTIMATED';
  const mapFleetVehicles = useMemo(() => {
    if (!selectedIsProjected || !selectedVehicle) return activeFleetVehicles;
    if (activeFleetVehicles.some((v) => v.vehicle_id === selectedVehicle.vehicle_id)) {
      return activeFleetVehicles;
    }
    return [...activeFleetVehicles, selectedVehicle];
  }, [activeFleetVehicles, selectedIsProjected, selectedVehicle]);

  // Counts follow what is actually drawable for the current role.
  const fleetCountVehicles = isDispatcherWorkspace ? liveTenantVehicles : activeFleetVehicles;

  const isRightInspectorActive = (isSidebarOpen && !!selectedCrisis) || !!selectedVehicle;

  // User Transparency States (Map Legend & Sensor Info)
  const [isMapLegendOpen, setIsMapLegendOpen] = useState(false);
  const [showSensorInfo, setShowSensorInfo] = useState(false);

  // Live Corridor Context Telemetry Hook (BMKG + TomTom + PIHPS 30s Poller)
  const { corridorContext, isLoading: isCorridorLoading, applyOperationalImpact } = useCorridorContext('sumatra_belawan_medan');

  // Live OSINT News & Intelligence Hook (Google News RSS & Verified Sinyal Lapangan)
  const { newsFeed } = useNewsVerification();
  const [newsSearchQuery, setNewsSearchQuery] = useState('');
  const [selectedNewsCategory, setSelectedNewsCategory] = useState<'ALL' | 'OFFICIAL' | 'WEATHER' | 'OSINT' | 'MARKET'>('ALL');
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [expandedNewsId, setExpandedNewsId] = useState<string | null>(null);

  const filteredNews = useMemo(() => {
    return newsFeed.filter((item) => {
      if (selectedNewsCategory === 'OFFICIAL' && item.source_type !== 'OFFICIAL_NEWS') return false;
      if (selectedNewsCategory === 'WEATHER' && item.source_type !== 'BMKG_WEATHER') return false;
      if (selectedNewsCategory === 'OSINT' && item.source_type !== 'MEDSOS_OSINT') return false;
      if (selectedNewsCategory === 'MARKET' && item.source_type !== 'PIHPS_MARKET') return false;

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
  }, [newsFeed, selectedNewsCategory, newsSearchQuery]);

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
    for (const n of newsFeed) {
      if (n.lat == null || n.lon == null) continue;
      if (n.zone_tier === 'DROPPED_IRRELEVANT') continue;
      if (n.zone_tier === 'YELLOW_CLARIFY') yellow += 1;
      else red += 1;
    }
    return { red, yellow };
  }, [newsFeed]);

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

  // Derive live Red & Yellow news zones + combine with manual disasterZones (independent checkboxes)
  // and the selected crisis' PostGIS hazard polygons.
  const combinedDisasterZones: DisasterZone[] = useMemo(() => {
    const live: DisasterZone[] = [];
    for (const n of newsFeed) {
      if (n.lat == null || n.lon == null) continue;
      const tier = (n.zone_tier || 'RED_CONFIRMED') as ZoneTier;
      if (tier === 'DROPPED_IRRELEVANT') continue;
      if (tier === 'RED_CONFIRMED' && !showRedZones) continue;
      if (tier === 'YELLOW_CLARIFY' && !showYellowZones) continue;
      const hazardType = (n.hazardType || n.incident_type || 'other_disruption') as CrisisType;
      const risk = tier === 'RED_CONFIRMED' ? 0.88 : 0.55;
      if (n.affected_locations && n.affected_locations.length > 0) {
        n.affected_locations.forEach((loc, idx) => {
          const agentRadius = loc.radius_km ?? n.radius_km;
          const geom = buildHazardSpecificZoneGeometry(loc.longitude, loc.latitude, hazardType, tier, agentRadius, loc.geometry_polygon ?? n.geometry_polygon);
          live.push({
            polygon: geom.polygon,
            type: hazardType,
            risk,
            crisis_id: `news-${n.id}-loc-${idx}`,
            id: `news-${n.id}-loc-${idx}`,
            zone_tier: tier,
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
        const geom = buildHazardSpecificZoneGeometry(n.lon, n.lat, hazardType, tier, agentRadius, n.geometry_polygon);
        live.push({
          polygon: geom.polygon,
          type: hazardType,
          risk,
          crisis_id: `news-${n.id}`,
          id: `news-${n.id}`,
          zone_tier: tier,
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
  }, [crisisHazardZones, disasterZones, newsFeed, showRedZones, showYellowZones, buildHazardSpecificZoneGeometry]);

  // Synchronize activeSection from URL query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const section = params.get('section') as 'map' | 'analytics' | 'reports' | 'evaluation';
      if (section && ['map', 'analytics', 'reports', 'evaluation'].includes(section)) {
        setActiveSection(section);
      }
    }
  }, []);

  // Poll for pending HITL items from Supabase
  useEffect(() => {
    let isMounted = true;
    const checkHitl = async () => {
      try {
        const res = await api.news.hitlPending();
        if (isMounted && res) {
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
    };
  }, []);

  const [spatialWeatherPolygons, setSpatialWeatherPolygons] = useState<GeoJSON.FeatureCollection | null>(null);
  const [advisoryWeatherPolygons, setAdvisoryWeatherPolygons] = useState<GeoJSON.FeatureCollection | null>(null);
  const [showWeatherPolygons, setShowWeatherPolygons] = useState<boolean>(true);
  const [showWeatherAdvisory, setShowWeatherAdvisory] = useState<boolean>(false);
  const [showFireHotspots, setShowFireHotspots] = useState<boolean>(true);
  const [fireHotspots, setFireHotspots] = useState<FireHotspot[]>([]);
  const [fireStatus, setFireStatus] = useState<'ok' | 'degraded'>('ok');
  const [fireReason, setFireReason] = useState<string | null>(null);
  const [routingInfo, setRoutingInfo] = useState<{ solver: string; compute_time_ms: number | null; savings_pct: number | null } | null>(null);
  // Persistent route-computation status: a cold render can take 30-50s, so the
  // operator needs lasting feedback plus an explicit abort action (not a 3s toast).
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
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


  useEffect(() => {
    let isMounted = true;
    async function loadSpatialWeather() {
      try {
        // Disruption-only default: heavy rain that can cause disruptions (high/critical).
        const geojson = await api.weather.spatialPolygons({ min_severity: 'high', min_precip: 50, min_flood: 80 });
        if (isMounted) setSpatialWeatherPolygons(geojson);
      } catch (e) {
        console.warn('Backend spatial weather polygons fallback:', e);
      }
    }
    loadSpatialWeather();
    const interval = setInterval(loadSpatialWeather, 120000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Advisory (purple, default OFF): full-fidelity medium path, fetched only when toggled ON.
  useEffect(() => {
    if (!showWeatherAdvisory) {
      setAdvisoryWeatherPolygons(null);
      return;
    }
    let isMounted = true;
    async function loadAdvisoryWeather() {
      try {
        const geojson = await api.weather.spatialPolygons({ min_severity: 'medium', min_precip: 0, min_flood: 0 });
        if (!isMounted) return;
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
    };
  }, [showWeatherAdvisory]);

  useEffect(() => {
    let isMounted = true;
    async function loadFireHotspots() {
      try {
        const res = await api.fire.hotspots();
        if (!isMounted) return;
        if (res.status === 'degraded') {
          setFireHotspots([]);
          setFireStatus('degraded');
          setFireReason(res.reason ?? 'butuh MAP_KEY — set NASA_FIRMS_MAP_KEY di Render env / .env.local');
        } else {
          setFireHotspots(res.hotspots ?? []);
          setFireStatus('ok');
          setFireReason(res.reason ?? null);
        }
      } catch (e) {
        console.warn('Backend FIRMS fire hotspots fallback (degraded):', e);
        if (isMounted) {
          setFireHotspots([]);
          setFireStatus('degraded');
          setFireReason('butuh MAP_KEY — set NASA_FIRMS_MAP_KEY di Render env / .env.local');
        }
      }
    }
    loadFireHotspots();
    const interval = setInterval(loadFireHotspots, 300000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
  const weatherPolygonCount = combinedWeatherPolygons?.features?.length ?? 0;
  const weatherDisruptionCount = showWeatherPolygons ? disruptionFeatures.length : 0;
  const weatherAdvisoryCount = advisoryFeatures.length;
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
  const fireHotspotCount = fireHotspots.length;
  const fireTooltip =
    fireStatus === 'degraded'
      ? (fireReason ?? 'butuh MAP_KEY — set NASA_FIRMS_MAP_KEY di Render env / .env.local')
      : fireReason ?? `Overlay FIRMS VIIRS_SNPP_NRT: ${fireHotspotCount} area radius (5/2,5/1 km by FRP) + heat oranye. Klik area/titik = FRP/conf/jarak koridor.`;





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

  const updateBaselineMapboxRoute = useCallback(async (originId: string, destId: string, modality: TransportModality, hazardCenter: [number, number] | null = null, radiusKm: number = DEFAULT_HAZARD_RADIUS_KM, hazardType: CrisisType = 'flood', impactProfile?: HazardImpactProfile, zoneTier: 'RED_CONFIRMED' | 'YELLOW_CLARIFY' = 'RED_CONFIRMED', hedgingOpts?: { commodity?: string; cargo_tonnage?: number; vehicle_golongan?: string; fuel_type?: string; toll_segments?: string[]; p_disruption?: number; disruption_delay_hours?: number }): Promise<boolean> => {
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

    // The node-selection handler calls this directly while the auto-recompute effect
    // fires for the same selection right after state commits. Reuse the in-flight
    // request instead of aborting it, so the click still resolves to a real result.
    const routeKey = JSON.stringify([originId, destId, modality, hazardCenter, radiusKm, hazardType, zoneTier]);
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
      // Synchronize Deterministic CPU Route Solver (NetworkX + OR-Tools)
      try {
        const routingRes = await api.routing.optimizeRouting({
          origin_id: originId,
          dest_id: destId,
          ...(originNode ? { origin_coords: originNode } : {}),
          ...(destNode ? { dest_coords: destNode } : {}),
          ...(originInfo ? { origin_name: formatNodeId(originId, originInfo) } : {}),
          ...(destInfo ? { dest_name: formatNodeId(destId, destInfo) } : {}),
          fleet_size: 3,
          hazard_zones: hazardCenter ? [{ center: hazardCenter, radiusKm }] : [],
          // Forward hedging economics only when the caller supplied them;
          // no hardcoded cargo values are injected into every request.
          ...(hedgingOpts?.commodity ? { commodity: hedgingOpts.commodity } : {}),
          ...(hedgingOpts?.cargo_tonnage != null ? { cargo_tonnage: hedgingOpts.cargo_tonnage } : {}),
          ...(hedgingOpts?.vehicle_golongan ? { vehicle_golongan: hedgingOpts.vehicle_golongan } : {}),
          ...(hedgingOpts?.fuel_type ? { fuel_type: hedgingOpts.fuel_type } : {}),
          ...(hedgingOpts?.toll_segments ? { toll_segments: hedgingOpts.toll_segments } : {}),
          ...(hedgingOpts?.p_disruption != null ? { p_disruption: hedgingOpts.p_disruption } : {}),
          ...(hedgingOpts?.disruption_delay_hours != null ? { disruption_delay_hours: hedgingOpts.disruption_delay_hours } : {}),
        }, signal);
        if (isStale()) return false;
        const nested = (routingRes as { point_to_point_path?: { status?: string; message?: string } } | null)?.point_to_point_path;
        if (nested?.status === 'no_route') {
          const message = nested.message || 'Rute tidak ditemukan untuk titik yang dipilih.';
          setRoutingError(message);
          setCurrentMapRoutes([]);
          setSelectedCrisis((prev) =>
            prev ? { ...prev, route_recommendations: [] } : prev
          );
          setRoutingInfo(null);
          setActiveRouteIdx(null);
          setHiddenRouteIndices(new Set());
          setToast({ message, type: 'error' });
          return false;
        }
        const backendPtpRoutes = (nested as { routes?: Array<{ route_index?: number; hedging?: NonNullable<RouteRecommendation['hedging']> }> } | undefined)?.routes;
        if (Array.isArray(backendPtpRoutes)) {
          backendPtpRoutes.forEach((br, order) => {
            const key = typeof br?.route_index === 'number' ? br.route_index : order;
            if (br?.hedging) backendHedgingByIndex.set(key, br.hedging);
          });
        }
        if (routingRes && routingRes.optimization_summary) {
          // Savings stay null until the backend reports a real baseline comparison;
          // the HUD hides the pill when null (no fabricated fallback).
          setRoutingInfo({
            solver: routingRes.solver || 'Deterministic CPU Routing Solver (NetworkX + OR-Tools)',
            compute_time_ms: routingRes.compute_time_ms ?? routingRes.total_pipeline_time_ms ?? null,
            savings_pct: routingRes.optimization_summary.fuel_cost_reduction_pct ?? null
          });
        }
      } catch (err) {
        if (isStale() || isAbortError(err)) return false;
        // The CPU solver is enrichment only; Mapbox routing below stays authoritative.
        console.warn('CPU routing solver API fallback:', err);
      }

      let routes: RouteRecommendation[];
      try {
        routes = await calculateAIDynamicDetourRoutes(hazardCenter, radiusKm, originNode, destNode, modality, hazardType, impactProfile, zoneTier, signal);
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

      // Merge backend hedging economics onto the Mapbox estimator routes by
      // index order. routes[0] is the baseline and carries no hedging by design;
      // detour corridors fall back to routes[1].hedging. Absent => undefined.
      if (backendHedgingByIndex.size > 0) {
        const detourHedging = backendHedgingByIndex.get(1);
        routes.forEach((route, idx) => {
          const match = backendHedgingByIndex.get(idx) ?? (idx > 0 ? detourHedging : undefined);
          if (match) (route as { hedging?: NonNullable<RouteRecommendation['hedging']> }).hedging = match;
        });
      }

      setCurrentMapRoutes(routes);
      setSelectedCrisis((prev) =>
        prev ? { ...prev, route_recommendations: routes } : prev
      );
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
  // so picking KAPAL switches both the maritime vehicle layer and the route visualization.
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
            setCurrentMapRoutes(dynamicRoutes);
            setSelectedCrisis({
              ...baseCrisis,
              route_recommendations: dynamicRoutes,
            });
          } else {
            setSelectedCrisis(baseCrisis);
          }
        } else {
          // Clean Slate: If user has not selected Start and End nodes, do not force a mockup route on the map
          setCurrentMapRoutes(baseCrisis.route_recommendations || []);
          setSelectedCrisis(baseCrisis);
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
        setActiveTab('Mitigation');

        // Honest savings: only claim hedging savings when the backend computed one.
        const rawSavings = backendCrisisState.hedging_breakdown?.net_savings_idr;
        const netSavings = rawSavings != null && Number(rawSavings) > 0
          ? `Rp ${Number(rawSavings).toLocaleString('id-ID')}`
          : null;

        setToast({
          message: netSavings
            ? `Swarm AI Selesai: Keputusan taktis aktif. Proyeksi penghematan hedging: ${netSavings}.`
            : 'Swarm AI Selesai: Keputusan taktis aktif.',
          type: 'success',
        });
      }
    );
  }, [selectedOriginNode, selectedDestNode, selectedModality, selectedVehicle, triggerSimulation, clearImpactAssessment]);

  // Unified stored-audit-trail inspection for news "Fokus" & map zone clicks (zero extra LLM cost).
  const inspectNewsOrZoneAuditTrail = useCallback(async (
    newsItem: (typeof newsFeed)[number] | undefined,
    fallbackZone?: DisasterZone
  ) => {
    const zoneTier: 'RED_CONFIRMED' | 'YELLOW_CLARIFY' = ((newsItem?.zone_tier as string) || (fallbackZone?.zone_tier as string) || 'RED_CONFIRMED') === 'YELLOW_CLARIFY' ? 'YELLOW_CLARIFY' : 'RED_CONFIRMED';
    const tierReason: string =
      newsItem?.tier_reason || fallbackZone?.tier_reason ||
      (zoneTier === 'RED_CONFIRMED'
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
    const originId = activeOriginRef.current || selectedOriginNode;
    const destId = activeDestRef.current || selectedDestNode;
    if (originId && destId) {
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
        routes.length > 0
          ? `${routes.length} koridor darat/laut/udara dihitung ulang menghindari zona ${zoneTier === 'RED_CONFIRMED' ? 'Merah' : 'Kuning'} (${hazardType}, ${passability}).`
          : `Pilih Titik Asal & Tujuan untuk menghitung ulang koridor menghindari zona ${zoneTier === 'RED_CONFIRMED' ? 'Merah' : 'Kuning'} (${hazardType}).`
      ),
      economic_intelligence_finding: mkFinding(
        'economic_intelligence',
        0.7,
        `Estimasi penundaan ~${impactProfile?.estimated_delay_hours ?? (zoneTier === 'RED_CONFIRMED' ? 8 : 2)} jam untuk komoditas ${newsItem?.commodity_name || 'pangan pokok'}; pantau harga PIHPS koridor ${corridorSegment}.`
      ),
      decision_support_output: `${customHazardLabel} — ${zoneTier === 'RED_CONFIRMED' ? 'Zona Merah terkonfirmasi' : 'Zona Kuning perlu klarifikasi'} di ${corridorSegment}. ${tierReason} Ringkasan tersimpan: ${summary} Moda terdampak: ${affectedModalities} (status ${passability}).`,
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
        { name: zoneTier === 'RED_CONFIRMED' ? 'Zona Merah: Bencana Aktif' : 'Zona Kuning: Perlu Klarifikasi', relation: 'diklasifikasikan LLM sebagai', impact_score: zoneTier === 'RED_CONFIRMED' ? 0.92 : 0.64 },
        { name: `Dampak Moda (${affectedModalities})`, relation: 'mengganggu', impact_score: 0.75 },
        { name: `Mitigasi Koridor (${corridorSegment})`, relation: 'dialihkan via', impact_score: 0.8 },
      ],
      zone_tier: zoneTier,
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

  const handleSelectRoute = useCallback(async (
    idx: number,
    source: 'sidebar' | 'map-popover' | 'map-eta' | 'demo' = 'sidebar'
  ) => {
    void source;
    setActiveRouteIdx(idx);
    updateUrlParams({ route: String(idx) });
    setRouteModalIdx(idx);
    const routes =
      currentMapRoutes.length > 0
        ? currentMapRoutes
        : (selectedCrisis?.route_recommendations || []);
    const route = routes[idx];
    if (!selectedCrisis?.crisis_id || !route) return;
    // Guest sandbox: zero POST to /approvals or /news/hitl-action.
    if (role === 'GUEST') {
      setToast({
        message: 'Mode Sandbox: pratinjau lokal berwatermark, tidak dikirim ke armada.',
        type: 'info',
      });
      return;
    }
    try {
      const originName =
        formatNodeId(selectedOriginNode, resolveNodeInfo(selectedOriginNode)) || undefined;
      const destName =
        formatNodeId(selectedDestNode, resolveNodeInfo(selectedDestNode)) || undefined;
      await api.approvals.create({
        incident_id: selectedCrisis.crisis_id,
        route_id: String(idx),
        recommended_route: route,
        action: 'ACCEPT',
        tactical_action: 'REROUTE',
        operator_id: user?.name || user?.email || user?.id || 'OP-CHIEF-01',
        route_name: route.route_name || route.description,
        origin: originName,
        destination: destName,
      });
      await refreshHitlCount();
    } catch {
      setToast({
        message: `HITL pending gagal dicatat (${selectedCrisis.crisis_id} #${idx}). Modal tetap terbuka.`,
        type: 'error',
      });
    }
  }, [currentMapRoutes, selectedCrisis, role, user, selectedOriginNode, selectedDestNode, resolveNodeInfo, refreshHitlCount]);

  const handleCommitOperationalRoute = useCallback(
    async (route: RouteRecommendation, action: any, tactical: any) => {
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

  // Phase 77: modal commit path — role-branched. Dispatcher commits + TMS ping
  // (via handleCommitOperationalRoute); regulator HOLD-only; guest sandbox only.
  const handleModalAction = useCallback(async (
    decision: 'APPROVE' | 'REJECT' | 'HOLD',
    tactical: TacticalManeuver,
    notes?: string
  ) => {
    const routes =
      currentMapRoutes.length > 0
        ? currentMapRoutes
        : (selectedCrisis?.route_recommendations || []);
    const idx = routeModalIdx ?? activeRouteIdx ?? 0;
    const route = routes[idx];
    if (!route || !selectedCrisis?.crisis_id) return;
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
    setIsActing(true);
    try {
      const action = decision === 'REJECT' ? 'REJECT' : 'ACCEPT';
      await api.approvals.create({
        incident_id: selectedCrisis.crisis_id,
        route_id: String(idx),
        recommended_route: route,
        action,
        tactical_action: tactical,
        operator_id: user?.name || user?.email || user?.id || 'OP-CHIEF-01',
        approved_by: user?.name || user?.email || user?.id || 'OP-CHIEF-01',
        notes,
      });
      await handleCommitOperationalRoute(route, action, tactical);
      await refreshHitlCount();
      setRouteModalIdx(null);
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
  }, [currentMapRoutes, selectedCrisis, routeModalIdx, activeRouteIdx, role, user, handleCommitOperationalRoute, refreshHitlCount]);

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
    <div className="relative w-full h-screen bg-[#080d14] text-slate-100 overflow-hidden select-none">
      {/* Top Header Navbar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#0c1017] border-b border-white/10 z-50 flex items-center justify-between px-3 md:px-6 select-none">
        <div className="flex items-center gap-2 sm:gap-6 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#080d14] border border-white/15 p-1 flex items-center justify-center">
              <img src="/logo_prehub.png" alt="PreHub" className="w-6 h-6 object-contain" />
            </div>
            <span className="font-headline font-bold text-base tracking-wider text-slate-100 uppercase hidden sm:inline">
              PreHub
            </span>
            <Link
              href="/"
              className="ml-1 sm:ml-2 px-2 sm:px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-sans text-slate-300 hover:text-white hover:border-white/20 transition flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Kembali ke Portal Utama (Landing Page)"
            >
              <Home className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Portal Utama</span>
            </Link>
          </div>

          {/* Section Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-[#080d14] p-1 rounded-lg border border-white/10 overflow-x-auto no-scrollbar shrink">
            {[
              { id: 'map', label: 'Peta Operasi' },
              { id: 'analytics', label: 'Analitik' },
              { id: 'reports', label: 'Laporan' },
              { id: 'evaluation', label: 'Evaluasi' },
            ].map((tab) => (
              <button
                key={tab.id}
                id={`nav-${tab.id}`}
                type="button"
                onClick={() => setActiveSection(tab.id as typeof activeSection)}
                className={`cursor-pointer px-3 sm:px-3.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${activeSection === tab.id
                    ? 'bg-white text-[#080d14] font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Workspace Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
            className={`cursor-pointer px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${role === 'DISPATCHER'
                ? 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white'
                : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 hover:text-white'
              }`}
            title={role === 'DISPATCHER' ? 'Onboard Armada & Unggah Manifest Pengiriman' : 'Onboard Armada (Terkunci: Khusus Wewenang Dispatcher)'}
          >
            {role === 'DISPATCHER' ? (
              <PlusCircle className="w-3.5 h-3.5 text-slate-300" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline">Onboard Armada</span>
            {role !== 'DISPATCHER' && (
              <span className="hidden md:inline px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">
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
            className="cursor-pointer px-2.5 sm:px-3 py-1.5 rounded-lg border border-white/10 bg-[#080d14] hover:border-white/20 transition flex items-center gap-2 group text-left"
            title="Ganti Persona Akses & Ruang Kerja (RBAC)"
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${role === 'DISPATCHER' ? 'bg-cyan-400' : role === 'REGULATOR' ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                  {role}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-white transition" />
              </div>
              <span className="text-xs font-sans text-slate-400 max-w-[120px] truncate hidden sm:block">
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

      {/* Toast Notification Container */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

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

      {/* MAIN CONTENT CANVAS AREA */}
      <main className="absolute left-0 top-16 right-0 bottom-0 overflow-hidden flex">

        {/* SECTION 1: 4D GIS MAP WITH RESTORED FIGMA COMMAND CENTER GRID */}
        <div className={`w-full h-full relative overflow-hidden ${activeSection === 'map' ? 'flex' : 'hidden'}`}>

          {/* COLUMN 1: COLLAPSIBLE LEFT OSINT & NEWS SIDEBAR (GLOBOT STYLE) */}
          <aside
            className={`h-full bg-[#0c1017] flex flex-col gap-3 overflow-hidden pointer-events-auto transition-all duration-300 ease-in-out shadow-xl ${
              isLeftSidebarCollapsed
                ? 'w-0 p-0 overflow-hidden border-r-0 opacity-0 pointer-events-none -translate-x-full md:translate-x-0 shrink-0'
                : 'absolute md:relative inset-y-0 left-0 md:inset-auto z-40 md:z-30 shrink-0 w-80 md:w-[352px] p-3.5 border-r border-[#1c2432] opacity-100 translate-x-0'
            }`}
          >
            {/* Header: OSINT Wire & Live Pulse */}
            <div className="flex items-center justify-between pb-2 border-b border-[#1c2432] shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center w-7 h-7 rounded-md bg-[#121822] border border-[#1c2432] text-slate-300">
                  <Radio className="w-4 h-4" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                </div>
                <div>
                  <h2 className="text-xs font-bold font-sans text-white uppercase tracking-wider">
                    Intelijen Berita Resmi
                  </h2>
                  <span className="text-xs font-mono text-slate-400">
                    {filteredNews.length} Sumber Terverifikasi
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsLeftSidebarCollapsed(true)}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Sembunyikan Panel"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Search & Category Filter */}
            <div className="space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={newsSearchQuery}
                  onChange={(e) => setNewsSearchQuery(e.target.value)}
                  placeholder="Cari berita atau lokasi..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition font-sans"
                />
                {newsSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setNewsSearchQuery('')}
                    className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
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
                    className={`cursor-pointer px-1.5 py-1 text-center rounded-lg border font-medium transition text-xs ${selectedNewsCategory === tab.id
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                        : 'bg-slate-950/50 text-slate-400 border-white/5 hover:border-white/20 hover:text-slate-200'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Compact Zona Filter Pills in Left News Drawer Header */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRedZones((v) => !v)}
                  className={`cursor-pointer flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
                    showRedZones
                      ? 'bg-red-950/50 border-red-500/50 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                      : 'bg-slate-950/40 border-white/5 text-slate-500 hover:text-slate-300'
                  }`}
                  title="Filter Peta: Zona Merah (Bencana Terkonfirmasi)"
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${showRedZones ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]' : 'bg-slate-600'}`} />
                    <span className="font-sans text-[11px] font-semibold">Zona Merah</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-[10px] font-bold text-red-300 font-mono">
                    {liveNewsZoneCounts.red}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowYellowZones((v) => !v)}
                  className={`cursor-pointer flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 ${
                    showYellowZones
                      ? 'bg-yellow-950/50 border-yellow-500/50 text-yellow-200 shadow-[0_0_8px_rgba(234,179,8,0.3)]'
                      : 'bg-slate-950/40 border-white/5 text-slate-500 hover:text-slate-300'
                  }`}
                  title="Filter Peta: Zona Kuning (Perlu Klarifikasi / Waspada)"
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${showYellowZones ? 'bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.9)]' : 'bg-slate-600'}`} />
                    <span className="font-sans text-[11px] font-semibold">Zona Kuning</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 text-[10px] font-bold text-yellow-300 font-mono">
                    {liveNewsZoneCounts.yellow}
                  </span>
                </button>
              </div>
            </div>

            {/* Scrollable Feed List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-0.5">
              {filteredNews.length === 0 ? (
                <div className="p-6 text-center text-slate-500 font-mono text-xs space-y-1">
                  <Newspaper className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                  <p>Tidak ada berita yang cocok.</p>
                </div>
              ) : (
                filteredNews.map((item) => {
                  const isSelected = selectedNewsId === item.id;
                  const isOfficial = item.source_tier === 'TIER_1_OFFICIAL' || item.source_type === 'OFFICIAL_NEWS';
                  const isEarlyWarning = item.temporal_phase === 'forecast_early_warning';

                  const articleLink = item.link || item.url;
                  const canOpenSource = Boolean(articleLink) && item.link_alive !== 'dead';
                  const isExpiredLink = item.link_alive === 'dead';
                  const isExcerptExpanded = expandedNewsId === item.id;
                  const itemZoneTier = (item.zone_tier || 'RED_CONFIRMED') as ZoneTier;

                  const handleFocusMap = () => {
                    if (item.originNode && item.destNode) {
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
                      className={`p-3 rounded-lg border transition-colors space-y-2 cursor-pointer ${isSelected
                          ? 'bg-[#121822] border-white/40 ring-1 ring-white/20'
                          : 'bg-[#0c1017] border-[#1c2432] hover:border-slate-600 hover:bg-[#121822]'
                        }`}
                    >
                      {/* Source & Timestamp */}
                      <div className="flex items-center justify-between gap-1 text-xs font-mono">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`px-1.5 py-0.5 rounded border text-xs font-semibold uppercase ${isOfficial
                              ? 'bg-white/10 text-slate-200 border-white/20'
                              : 'bg-[#121822] text-slate-400 border-[#1c2432]'
                            }`}>
                            {item.source_name || (isOfficial ? 'ANTARA' : 'BERITA')}
                          </span>
                          <span className="text-slate-400 truncate">{item.pubDate || 'Terkini'}</span>
                        </div>
                        {isEarlyWarning && (
                          <span className="text-amber-400 font-semibold text-xs shrink-0">
                            Early Warning {item.lead_time_hours ? `(${item.lead_time_hours}j)` : ''}
                          </span>
                        )}
                      </div>

                      {/* Headline with external link */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {itemZoneTier === 'RED_CONFIRMED' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/15 border border-red-500/40 text-red-300">ZONA MERAH</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-yellow-400/10 border border-yellow-400/40 text-yellow-300">ZONA KUNING: PERLU KLARIFIKASI</span>
                        )}
                        {(item.custom_hazard_label) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans text-slate-200 bg-white/5 border border-white/10 truncate max-w-[180px]" title={item.custom_hazard_label}>
                            {item.custom_hazard_label}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-semibold text-slate-100 leading-snug font-sans group">
                        {canOpenSource ? (
                          <a
                            href={articleLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-cyan-300 hover:underline transition-colors flex items-start gap-1 cursor-pointer"
                            title="Buka Berita Asli (Tab Baru)"
                          >
                            <span className="flex-1">{item.headline}</span>
                            <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 shrink-0 mt-0.5" />
                          </a>
                        ) : (
                          <span className="flex items-start gap-1">
                            <span className="flex-1">{item.headline}</span>
                          </span>
                        )}
                      </h3>

                      {item.affected_locations && item.affected_locations.length > 1 && (
                        <div className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-[11px] font-sans leading-snug">
                          📍 {item.affected_locations.length} Daerah: {item.affected_locations.map((l) => l.name).join(', ')}
                        </div>
                      )}

                      {/* Stored excerpt: rendered only when distinct from headline */}
                      {item.summary && item.summary.trim().toLowerCase() !== item.headline.trim().toLowerCase() && item.summary.trim().length >= 15 && (
                        <p
                          className={`text-xs text-slate-400 font-sans leading-relaxed transition-all duration-200 ${isExcerptExpanded ? '' : 'line-clamp-2'
                            }`}
                        >
                          {item.summary}
                        </p>
                      )}

                      {/* God's-Eye Monospaced Tactical Telemetry Grid */}
                      <div className="p-2 rounded-lg bg-[#0a0e16] border border-[#1c2432] font-mono text-[11px] space-y-1.5 leading-snug">
                        {/* Row 1 — CAKUPAN SPASIAL */}
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">CAKUPAN SPASIAL:</span>
                          <span className="text-cyan-300 font-semibold truncate max-w-[170px]" title={item.location_name || 'Koridor Sumatera'}>
                            {item.location_name || 'Koridor Sumatera'}
                            {item.lat && item.lon ? ` · ${item.lat.toFixed(2)}°N, ${item.lon.toFixed(2)}°E` : ''}
                            {' '}({item.location_precision === 'corridor_point'
                              ? 'Koridor ~0.9 km'
                              : item.location_precision === 'kecamatan_kelurahan'
                                ? 'Sub-Distrik ~1.8 km'
                                : 'Kab/Kota'})
                          </span>
                        </div>

                        {/* Row 2 — KONSENSUS AGEN */}
                        <div className="flex items-center justify-between text-slate-300 border-t border-[#1c2432]/60 pt-1">
                          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">KONSENSUS AGEN:</span>
                          <div className="flex items-center gap-1">
                            <span className="px-1 py-0.2 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-500/30 text-[10px]">
                              {isOfficial ? 'ANTARA' : 'BMKG'}
                            </span>
                            <span className="px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 text-[10px]">
                              TOMTOM
                            </span>
                            <span className="text-emerald-400 font-bold ml-0.5">
                              {item.confidence_score != null && Number.isFinite(Number(item.confidence_score))
                                ? `${Math.round(Number(item.confidence_score) * 100)}%`
                                : 'Keyakinan belum tersedia'}
                            </span>
                          </div>
                        </div>

                        {/* Row 3 — STATUS KORIDOR */}
                        <div className="flex items-center justify-between text-slate-300 border-t border-[#1c2432]/60 pt-1">
                          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">STATUS KORIDOR:</span>
                          <div className="flex items-center gap-1.5 truncate max-w-[185px]">
                            <span className={itemZoneTier === 'RED_CONFIRMED' ? 'text-red-400 font-semibold shrink-0' : 'text-amber-400 font-semibold shrink-0'}>
                              {itemZoneTier === 'RED_CONFIRMED' ? 'Terputus Total' : 'Lalin Tersendat'}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-300 truncate" title={item.commodity_name || 'Komoditas Pangan'}>
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
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="cursor-pointer p-1 rounded bg-[#121822] text-slate-400 hover:text-white border border-[#1c2432] transition-colors"
                              title="Buka Berita Asli di Tab Baru"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-500/40 bg-amber-950/40 text-amber-300 text-xs font-mono">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>{isExpiredLink ? 'Tautan asli kedaluwarsa' : 'Tautan sumber tidak tersedia'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedNewsId(isExcerptExpanded ? null : item.id);
                                }}
                                className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded bg-[#121822] text-slate-300 hover:text-white border border-[#1c2432] transition-colors text-xs font-mono"
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

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFocusMap();
                          }}
                          className="cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-200 text-[#080d14] text-xs font-mono font-semibold transition-colors shadow-sm shrink-0"
                        >
                          <span>Fokus</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Honest Dynamic Sensor Pipeline Status Bar */}
            <div className="border-t border-white/10 pt-2.5 text-xs font-mono text-slate-400 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between">
                <span className="uppercase tracking-wider text-slate-400 font-bold">STATUS PIPELINE DATA</span>
                <button
                  type="button"
                  onClick={() => setShowSensorInfo(v => !v)}
                  className="cursor-pointer text-slate-400 hover:text-cyan-400 transition"
                  title="Transparansi Data"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
              </div>

              {showSensorInfo && (
                <div className="p-2 rounded bg-slate-950/90 border border-white/10 text-xs font-sans text-slate-300 leading-relaxed animate-in fade-in duration-150">
                  <strong>Transparansi Data:</strong> Status koneksi telemetri dan integrasi API operasional.
                </div>
              )}

              {(() => {
                const isBmkgLive = (corridorContext?.weather?.rainfall_mm !== undefined && corridorContext?.weather?.rainfall_mm !== null) || (corridorContext?.weather?.status != null && corridorContext?.weather?.status !== 'offline');
                const isTomtomLive = (corridorContext?.traffic?.delay_minutes !== undefined && corridorContext?.traffic?.delay_minutes !== null) || (corridorContext?.traffic?.congestion_level_pct !== undefined && corridorContext?.traffic?.congestion_level_pct !== null);
                const isPihpsLive = (corridorContext?.commodity_prices?.rice_price !== undefined && corridorContext?.commodity_prices?.rice_price !== null) || filteredNews.length > 0;

                return (
                  <div className="grid grid-cols-3 gap-1 text-xs text-center">
                    <div className="p-1 rounded bg-slate-950/80 border border-white/5">
                      <span className="text-slate-500 block">BMKG</span>
                      <span className={`font-bold font-mono ${isCorridorLoading ? 'text-cyan-400' : isBmkgLive ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isCorridorLoading ? 'MEMUAT' : isBmkgLive ? 'LIVE' : 'FALLBACK'}
                      </span>
                    </div>
                    <div className="p-1 rounded bg-slate-950/80 border border-white/5">
                      <span className="text-slate-500 block">TOMTOM</span>
                      <span className={`font-bold font-mono ${isCorridorLoading ? 'text-cyan-400' : isTomtomLive ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isCorridorLoading ? 'MEMUAT' : isTomtomLive ? 'LIVE' : 'FALLBACK'}
                      </span>
                    </div>
                    <div className="p-1 rounded bg-slate-950/80 border border-white/5">
                      <span className="text-slate-500 block">PIHPS</span>
                      <span className={`font-bold font-mono ${isCorridorLoading ? 'text-cyan-400' : isPihpsLive ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isCorridorLoading ? 'MEMUAT' : isPihpsLive ? 'LIVE' : 'FALLBACK'}
                      </span>
                    </div>
                  </div>
                );
              })()}
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
                hideEstimatedRoutes={isDispatcherWorkspace}
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
                    weatherSample={weatherSample}
                    showFireHotspots={showFireHotspots}
                    onToggleFireHotspots={() => setShowFireHotspots(v => !v)}
                    fireHotspotCount={fireHotspotCount}
                    fireStatus={fireStatus}
                    fireTooltip={fireTooltip}
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
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0c1017]/90 backdrop-blur-md border border-[#1c2432] shadow-xl overflow-x-auto no-scrollbar max-w-[calc(100vw-2rem)]">
                      {[
                        { id: 'all', label: 'SEMUA', count: fleetCountVehicles.length, icon: null },
                        { id: 'truck', label: 'TRUK', count: fleetCountVehicles.filter((v) => v.modality === 'truck').length, icon: Truck },
                        { id: 'maritime', label: 'KAPAL', count: fleetCountVehicles.filter((v) => v.modality === 'maritime').length, icon: Anchor },
                        { id: 'air', label: 'UDARA', count: fleetCountVehicles.filter((v) => v.modality === 'air').length, icon: Plane },
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
                            className={`cursor-pointer px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 ${fleetModalityFilter === m.id
                                ? 'bg-white text-[#080d14] font-bold'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                              }`}
                          >
                            {IconComp && <IconComp className="w-3.5 h-3.5" />}
                            <span>{m.label}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${fleetModalityFilter === m.id ? 'bg-[#080d14] text-white' : 'bg-white/10 text-slate-400'
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
                          className={`cursor-pointer px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 ${isFleetSimMode
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold'
                            }`}
                          title="Mode Telemetri:&#10;• Cyan [Hanya GPS & Transponder Live]: Dispatch taktis instan berbasis sinyal fisik AIS & GPS satelit.&#10;• Amber [Live AIS/ADS-B + Rute Estimasi]: Perencanaan kapasitas makro koridor logistik pangan."
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${isFleetSimMode ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400 animate-pulse'
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
                          className="px-2.5 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 bg-cyan-500/20 text-cyan-300 border border-cyan-400/40"
                          title="Sesi DISPATCHER: hanya armada tenant Anda dengan GPS live yang ditampilkan. Rute estimasi tersedia lewat panel Armada Tenant (badge PROYEKSI)."
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                          <span>Tenant Live GPS ({fleetCountVehicles.length})</span>
                          {tenantFleetAssetCount > fleetCountVehicles.length && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 text-[10px] tabular-nums">
                              {tenantFleetAssetCount - fleetCountVehicles.length} PROYEKSI
                            </span>
                          )}
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
                    weatherDisruptionCount={weatherDisruptionCount}
                    weatherAdvisoryCount={weatherAdvisoryCount}
                    showWeatherAdvisory={showWeatherAdvisory}
                  />
                }
              />
            </div>

            {/* Dispatcher tenant roster: honest inventory of onboarded assets.
                LIVE_GPS units drive the map; ROUTE_ESTIMATED units are listed
                with a PROYEKSI badge and only drawn on click inspection. */}
            {isDispatcherWorkspace && (
              <TenantFleetRoster
                vehicles={tenantFleetVehicles}
                isLoading={isFleetLoading}
                error={fleetError}
                isTenantScoped={isFleetTenantScoped}
                companyId={fleetCompanyId}
                selectedVehicleId={selectedVehicle?.vehicle_id ?? null}
                onSelectVehicle={handleSelectVehicle}
                onOpenOnboarding={() => setIsOnboardingModalOpen(true)}
              />
            )}

            {/* Persistent route-computation banner: spinner + elapsed time + Batal */}
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3">
              <RoutingStatusBanner
                isLoading={isRoutingLoading}
                error={routingError}
                elapsedMs={routingElapsedMs}
                onCancel={handleCancelRouting}
                onDismissError={() => setRoutingError(null)}
              />
            </div>

            {/* Decision Support System (DSS): Dispatcher Alert Queue Strip */}
            {!isAlertQueueDismissed && impactAssessmentData && impactAssessmentData.impacted_vehicles.length > 0 && (
              <DispatcherAlertQueue
                impactData={impactAssessmentData}
                selectedVehicleId={selectedImpactedVehicle?.vehicle_id || null}
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

            {/* Run Demo Dock */}
            {!demoState.isRunning && (
              <footer className={`absolute bottom-4 sm:bottom-6 z-40 flex items-center gap-1.5 bg-[#0c1017] border border-[#1c2432] p-1.5 rounded-lg shadow-xl transition-all duration-300 pointer-events-auto -translate-x-1/2 overflow-x-auto no-scrollbar ${footerDockClass}`}>
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
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-white hover:bg-slate-200 text-[#080d14] font-semibold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer shrink-0"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Run Demo</span>
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
                onSelectRoute={(idx) => void handleSelectRoute(idx, 'sidebar')}
                onApproveSuccess={(msg) => setToast({ message: msg, type: 'success' })}
                onCommitOperationalRoute={handleCommitOperationalRoute}
                selectedImpactedVehicle={selectedImpactedVehicle}
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
                />
              );
            })()}
          </div>

        </div>

        {/* Section 2: Analytics Dashboard */}
        <div className={`w-full h-full p-4 lg:p-6 overflow-y-auto ${activeSection === 'analytics' ? 'block' : 'hidden'}`}>
          <AnalyticsSection
            selectedCrisis={selectedCrisis}
            corridorContext={corridorContext}
            activeRoutes={currentMapRoutes}
            onSwitchTab={(tab) => setActiveSection(tab)}
          />
        </div>

        {/* Section 3: Executive Reports */}
        <div className={`w-full h-full p-4 lg:p-6 overflow-y-auto ${activeSection === 'reports' ? 'block' : 'hidden'}`}>
          <ReportsSection
            approvalsCount={approvalsCount}
            corridorContext={corridorContext}
            selectedCrisis={selectedCrisis}
            activeRoutes={currentMapRoutes}
          />
        </div>

        {/* Section 5: Dedicated Evaluation & Benchmark Dashboard */}
        <div className={`w-full h-full p-4 lg:p-6 overflow-y-auto ${activeSection === 'evaluation' ? 'block' : 'hidden'}`}>
          <EvaluationSection
            corridorContext={corridorContext}
            selectedCrisis={selectedCrisis}
            activeRoutes={currentMapRoutes}
          />
        </div>

      </main>
    </div>
  );
}
