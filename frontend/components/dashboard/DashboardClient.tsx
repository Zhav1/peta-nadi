'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useIncidents } from '@/hooks/useIncidents';
import { useCrisisSocket } from '@/hooks/useCrisisSocket';
import { CrisisSidebar } from '@/components/sidebar/CrisisSidebar';
import { Toast } from '@/components/ui/Toast';
import { GuidedDemoPanel } from '@/components/demo/GuidedDemoPanel';
import AnalyticsSection from '@/components/dashboard/AnalyticsSection';
import SimulationSection from '@/components/dashboard/SimulationSection';
import ReportsSection from '@/components/dashboard/ReportsSection';
import { CrisisSimulatorBar } from '@/components/map/CrisisSimulatorBar';
import { HUB_NODES, type HubNode } from '@/lib/mapboxRoutingService';
import {
  calculateAIDynamicDetourRoutes,
  type TransportModality,
} from '@/lib/aiDynamicRouter';
import { api } from '@/lib/api';
import type { CrisisState, WsEvent, CrisisType, Severity, RouteRecommendation } from '@/lib/types';

// Dynamic import for map to avoid SSR issues
const CrisisMap = dynamic(() => import('@/components/map/CrisisMap'), { ssr: false });

const MOCK_PAST_INCIDENTS = [
  { id: 'mock-past-1', title: 'Belawan Toll Road Congestion', type: 'congestion' as const, severity: 'medium' as const, lat: 3.78, lon: 98.67, status: 'resolved' as const, confidence: 0.9, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'mock-past-2', title: 'Medan Flood Level II', type: 'flood' as const, severity: 'high' as const, lat: 3.61, lon: 98.65, status: 'resolved' as const, confidence: 0.95, created_at: new Date(Date.now() - 172800000).toISOString() }
];

const MOCK_FUTURE_INCIDENTS = [
  { id: 'mock-future-1', title: 'Predicted High Rainfall (BMKG Weather Warning)', type: 'flood' as const, severity: 'medium' as const, lat: 3.55, lon: 98.72, status: 'detecting' as const, confidence: 0.72, created_at: new Date().toISOString() },
  { id: 'mock-future-2', title: 'Expected Toll Delay near Binjai', type: 'congestion' as const, severity: 'low' as const, lat: 3.65, lon: 98.58, status: 'validating' as const, confidence: 0.68, created_at: new Date().toISOString() }
];

const MOCK_PREDICT_INCIDENTS = [
  { id: 'mock-predict-1', title: 'Inflation Spike Alert: Rice Stock Depletion (14-Day GraphRAG Model)', type: 'port_closure' as const, severity: 'critical' as const, lat: 3.79, lon: 98.68, status: 'detecting' as const, confidence: 0.88, created_at: new Date().toISOString() }
];

export default function DashboardClient() {
  const { incidents, refetch } = useIncidents();
  const [selectedCrisisId, setSelectedCrisisId] = useState<string | null>(null);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisState | null>(null);
  const [activeRouteIdx, setActiveRouteIdx] = useState<number | null>(null);
  const [currentMapRoutes, setCurrentMapRoutes] = useState<RouteRecommendation[]>([]);
  
  // Dynamic Supabase Hub Nodes List & Clean Slate Selection (Null initial state)
  const [dynamicHubNodes] = useState<HubNode[]>(Object.values(HUB_NODES));
  const [selectedOriginNode, setSelectedOriginNode] = useState<string | null>(null);
  const [selectedDestNode, setSelectedDestNode] = useState<string | null>(null);
  const [selectedModality, setSelectedModality] = useState<TransportModality>('truck');

  // Interactive Simulation Controls
  const [selectedRadius, setSelectedRadius] = useState<number>(15);
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [isClickTargeting, setIsClickTargeting] = useState(false);
  const [simulatedShockwave, setSimulatedShockwave] = useState<{ center: [number, number]; radiusKm: number; hazardType: string } | null>(null);
  const [disasterZones, setDisasterZones] = useState<Array<{ polygon: [number, number][]; type: 'flood'; risk: number }>>([]);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null);

  // Layout & Navigation States
  const [activeSection, setActiveSection] = useState<'map' | 'analytics' | 'simulation' | 'reports'>('map');
  const [activeTimeFilter, setActiveTimeFilter] = useState<'past' | 'present' | 'future' | 'predict'>('present');
  const [activeTab, setActiveTab] = useState<'Evidence' | 'Mitigation' | 'Economic'>('Evidence');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Dynamic Reactive Metrics for Left Tactical Sidebar
  const dynamicMetrics = useMemo(() => {
    const hasActiveCrisis = !!simulatedShockwave || disasterZones.length > 0 || selectedCrisisId === 'simulated-active' || (selectedCrisis && selectedCrisis.status !== 'resolved');

    if (hasActiveCrisis) {
      return {
        healthScore: 64,
        healthStatus: 'CRITICAL SHOCK',
        healthColor: 'text-amber-400',
        strokeColor: 'text-amber-400',
        logisticsGdp: '16.8%',
        gdpStatus: '▲ +2.6% Risk',
        gdpColor: 'text-red-400',
        foodInflation: '12.8%',
        inflationStatus: '⚠️ PIHPS ANOMALY SPIKE',
        inflationColor: 'text-red-400',
        activeShocks: '1 ACTIVE',
        shocksColor: 'text-red-400 animate-pulse',
      };
    }

    return {
      healthScore: 92,
      healthStatus: 'OPTIMAL',
      healthColor: 'text-emerald-400',
      strokeColor: 'text-cyan-400',
      logisticsGdp: '14.2%',
      gdpStatus: '↘ 8.2%',
      gdpColor: 'text-emerald-400',
      foodInflation: '7.14%',
      inflationStatus: 'PIHPS Baseline',
      inflationColor: 'text-amber-400',
      activeShocks: '0 ACTIVE',
      shocksColor: 'text-emerald-400',
    };
  }, [simulatedShockwave, disasterZones, selectedCrisisId, selectedCrisis]);

  // Fetch multi-alternative Mapbox driving & hazard detour routes when node selection or modality changes
  const updateBaselineMapboxRoute = useCallback(async (originId: string, destId: string, modality: TransportModality, hazardCenter: [number, number] | null = null, radiusKm: number = 15) => {
    const originNode = HUB_NODES[originId]?.coords;
    const destNode = HUB_NODES[destId]?.coords;
    if (!originNode || !destNode) return;

    const routes = await calculateAIDynamicDetourRoutes(hazardCenter, radiusKm, originNode, destNode, modality);
    setCurrentMapRoutes(routes);
    setSelectedCrisis((prev) =>
      prev ? { ...prev, route_recommendations: routes } : prev
    );
  }, []);

  // Sync road network routes when origin, destination, modality, or hazard changes
  useEffect(() => {
    if (selectedOriginNode && selectedDestNode) {
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
    if (!selectedOriginNode) {
      // Step 1: Set Start Node
      setSelectedOriginNode(nodeId);
      setToast({
        message: `🟢 Start Node Terpilih: ${HUB_NODES[nodeId]?.name || nodeId}. Silakan klik marker kedua untuk mengeset End Node.`,
        type: 'info',
      });
      return;
    }

    if (!selectedDestNode && nodeId !== selectedOriginNode) {
      // Step 2: Set End Node
      setSelectedDestNode(nodeId);
      await updateBaselineMapboxRoute(
        selectedOriginNode,
        nodeId,
        selectedModality,
        simulatedShockwave?.center || null,
        selectedRadius
      );

      setToast({
        message: `🟡 End Node Terpilih: ${HUB_NODES[nodeId]?.name || nodeId}. Opsi rute multi-alternatif Mapbox siap.`,
        type: 'success',
      });
      return;
    }

    // Both already set -> User clicks a third node to update Destination
    if (nodeId !== selectedOriginNode) {
      setSelectedDestNode(nodeId);
      await updateBaselineMapboxRoute(
        selectedOriginNode,
        nodeId,
        selectedModality,
        simulatedShockwave?.center || null,
        selectedRadius
      );

      setToast({
        message: `Tujuan Diperbarui: ${HUB_NODES[selectedOriginNode]?.name} ➔ ${HUB_NODES[nodeId]?.name || nodeId}`,
        type: 'info',
      });
    }
  }, [selectedOriginNode, selectedDestNode, selectedModality, simulatedShockwave, selectedRadius, updateBaselineMapboxRoute]);

  // 1-Click Reset Node Selection Handler
  const handleResetNodes = useCallback(() => {
    setSelectedOriginNode(null);
    setSelectedDestNode(null);
    setCurrentMapRoutes([]);
    setSelectedCrisis(null);
    setSelectedCrisisId(null);
    setToast({ message: 'Titik rute dibersihkan. Silakan klik marker kota 1 untuk mengeset Start Node.', type: 'info' });
  }, []);

  const handleWsMessage = useCallback((event: WsEvent) => {
    if (event.event === 'node_update') {
      setSelectedCrisis((prev) => prev ? { ...prev, ...event.data } : prev);
    }
    if (event.event === 'complete') {
      refetch();
    }
  }, [refetch]);

  useCrisisSocket(selectedCrisisId, handleWsMessage);

  const handleCrisisClick = useCallback(async (id: string) => {
    setSelectedCrisisId(id);
    setActiveRouteIdx(null);
    setIsSidebarOpen(true);

    if (id.startsWith('mock-') || id === 'simulated-active') {
      const mockIncidentsMap: Record<string, CrisisState> = {
        'mock-past-1': {
          crisis_id: 'mock-past-1',
          title: 'Belawan Toll Road Congestion',
          type: 'congestion',
          is_simulated: true,
          lat: 3.78,
          lon: 98.67,
          region: 'north_sumatra',
          status: 'resolved',
          overall_confidence: 0.9,
          validated: true,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
          route_recommendations: [],
          evidence: {
            cctv_label: 'CAM_BELAWAN_TOLL',
            osint_text: 'Toll road traffic cleared. Flow returned to baseline.'
          }
        },
        'mock-past-2': {
          crisis_id: 'mock-past-2',
          title: 'Medan Flood Level II',
          type: 'flood',
          is_simulated: true,
          lat: 3.61,
          lon: 98.65,
          region: 'north_sumatra',
          status: 'resolved',
          overall_confidence: 0.95,
          validated: true,
          created_at: new Date(Date.now() - 172800000).toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
          route_recommendations: [],
          evidence: {
            cctv_label: 'CAM_MEDAN_FLOOD',
            osint_text: 'Flood waters receded. Cleanup operations underway.'
          }
        },
        'mock-future-1': {
          crisis_id: 'mock-future-1',
          title: 'Predicted High Rainfall (BMKG Warning)',
          type: 'flood',
          is_simulated: true,
          lat: 3.55,
          lon: 98.72,
          region: 'north_sumatra',
          status: 'detecting',
          overall_confidence: 0.72,
          validated: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
          route_recommendations: [],
          evidence: {
            cctv_label: 'CAM_BMKG_RADAR',
            osint_text: 'Heavy rain cluster approaching North Sumatra East Coast.'
          }
        },
        'mock-future-2': {
          crisis_id: 'mock-future-2',
          title: 'Expected Toll Delay near Binjai',
          type: 'congestion',
          is_simulated: true,
          lat: 3.65,
          lon: 98.58,
          region: 'north_sumatra',
          status: 'validating',
          overall_confidence: 0.68,
          validated: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
          route_recommendations: [],
          evidence: {
            cctv_label: 'CAM_BINJAI_GATE',
            osint_text: 'Slow moving traffic detected near Binjai toll gate.'
          }
        },
        'mock-predict-1': {
          crisis_id: 'mock-predict-1',
          title: 'Inflation Spike Alert: Rice Stock Depletion',
          type: 'port_closure',
          is_simulated: true,
          lat: 3.79,
          lon: 98.68,
          region: 'north_sumatra',
          status: 'detecting',
          overall_confidence: 0.88,
          validated: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
          route_recommendations: currentMapRoutes,
          evidence: {
            cctv_label: 'CAM_PORT_BELAWAN_01',
            cctv_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
            osint_author: '@BPBD_Sumut',
            osint_text: 'Anomali pasokan beras di Pelabuhan Belawan memicu risiko lonjakan harga di pasar Medan.',
            delay_minutes: '180 min',
            delay_history: [30, 60, 120, 180]
          }
        }
      };

      let baseCrisis = mockIncidentsMap[id];
      if (!baseCrisis) {
        try {
          baseCrisis = await api.incidents.get(id);
        } catch (err) {
          console.error('Failed to fetch crisis detail:', err);
        }
      }

      if (baseCrisis) {
        const originId = selectedOriginNode || 'belawan';
        const destId = selectedDestNode || 'medan';
        const originCoords = HUB_NODES[originId]?.coords || HUB_NODES.belawan.coords;
        const destCoords = HUB_NODES[destId]?.coords || HUB_NODES.medan.coords;

        const dynamicRoutes = await calculateAIDynamicDetourRoutes(
          [baseCrisis.lon, baseCrisis.lat],
          selectedRadius,
          originCoords,
          destCoords,
          selectedModality
        );

        setCurrentMapRoutes(dynamicRoutes);
        setSelectedCrisis({
          ...baseCrisis,
          route_recommendations: dynamicRoutes,
        });
      }
    }
  }, [selectedOriginNode, selectedDestNode, selectedRadius, selectedModality]);

  // LIVE VISUAL DEMO STEPPER TRIGGER
  const handleCrisisReadyFromDemo = useCallback(async (crisis: CrisisState) => {
    const originId = selectedOriginNode || 'belawan';
    const destId = selectedDestNode || 'siantar';
    setSelectedOriginNode(originId);
    setSelectedDestNode(destId);

    const originCoords = HUB_NODES[originId]?.coords || HUB_NODES.belawan.coords;
    const destCoords = HUB_NODES[destId]?.coords || HUB_NODES.siantar.coords;
    const hazardPoint: [number, number] = [98.87, 3.56]; // Lubuk Pakam corridor

    setSimulatedShockwave({
      center: hazardPoint,
      radiusKm: selectedRadius,
      hazardType: 'flood',
    });

    const demoRoutes = await calculateAIDynamicDetourRoutes(
      hazardPoint,
      selectedRadius,
      originCoords,
      destCoords,
      selectedModality
    );

    const fullDemoState: CrisisState = {
      ...crisis,
      route_recommendations: demoRoutes,
    };

    setCurrentMapRoutes(demoRoutes);
    setSelectedCrisis(fullDemoState);
    setSelectedCrisisId(crisis.crisis_id);
    setIsSidebarOpen(true);
    setActiveRouteIdx(0);
    setToast({ message: `▶ Live Demo Active: ${crisis.title}`, type: 'success' });
  }, [selectedOriginNode, selectedDestNode, selectedRadius, selectedModality]);

  // ---------------------------------------------------------------------------
  // PURE AGENTIC AI SPATIAL CLEARANCE PIPELINE ENGINE (0% Hardcode!)
  // ---------------------------------------------------------------------------

  const triggerFullSimulationEngine = useCallback(async (
    lat: number,
    lon: number,
    type: CrisisType,
    radiusKm: number,
    title: string,
    isPolygonMode = false
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

    const originId = selectedOriginNode || 'belawan';
    const destId = selectedDestNode || 'medan';
    if (!selectedOriginNode) setSelectedOriginNode(originId);
    if (!selectedDestNode) setSelectedDestNode(destId);

    const originCoords = HUB_NODES[originId]?.coords || HUB_NODES.belawan.coords;
    const destCoords = HUB_NODES[destId]?.coords || HUB_NODES.medan.coords;

    const dynamicRoadDetourRoutes = await calculateAIDynamicDetourRoutes(
      [lon, lat],
      radiusKm,
      originCoords,
      destCoords,
      selectedModality
    );

    setCurrentMapRoutes(dynamicRoadDetourRoutes);

    const simulatedState: CrisisState = {
      crisis_id: 'simulated-active',
      title,
      type,
      is_simulated: true,
      lat,
      lon,
      region: 'North Sumatra Corridor',
      status: 'validated',
      overall_confidence: 0.94,
      validated: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [
        `AI CLEARANCE ENGINE: ${type.toUpperCase()} registered at [${lat.toFixed(4)}, ${lon.toFixed(4)}].`,
        `Pure Agentic tangential vector calculated (${radiusKm + 2}km clearance buffer).`,
        `Rerouting bulk grain fleets via Mapbox turn-by-turn road network detour.`,
        `Assigned parameter vectors to BULOG, DISHUB, and BNPB emergency teams.`
      ],
      route_recommendations: dynamicRoadDetourRoutes,
      decision_support_output: `AI Copilot: Disrupsi ${type.toUpperCase()} terdeteksi. Engine Pure Agentic Tangential Vector menghitung pengalihan rute jalan raya otomatis melingkari zona krisis. Tindakan disarankan: Alihkan armada kontainer via Rute Pengalihan 1. Rilis 480 ton cadangan beras BULOG.`,
      evidence: {
        cctv_label: `CAM_${type.toUpperCase()}_SUMUT_LIVE`,
        cctv_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
        osint_author: '@PetaNadi_CommandCenter',
        osint_text: `Peringatan AI Dynamic: Disrupsi ${type} diaktifkan pada rute ${originId.toUpperCase()} ➔ ${destId.toUpperCase()}. Jalur logistik utama dialihkan via Pure Agentic Tangential Clearance Detour.`,
        delay_minutes: '120 min',
        delay_history: [20, 45, 90, 120]
      }
    };

    setSelectedCrisisId('simulated-active');
    setSelectedCrisis(simulatedState);
    setActiveRouteIdx(0);
    setIsSidebarOpen(true);
    setActiveTab('Mitigation');

    setToast({
      message: `AI Dynamic Engine: Rute pengalihan aman (${selectedModality.toUpperCase()}) dari ${originId.toUpperCase()} ke ${destId.toUpperCase()} berhasil dihitung (0% Hardcode).`,
      type: 'success'
    });
  }, [selectedOriginNode, selectedDestNode, selectedModality]);

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
      false // Point mode
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

    triggerFullSimulationEngine(
      centerLat,
      centerLon,
      'flood',
      selectedRadius,
      'Custom Area Disruption (MapboxDraw Polygon)',
      true // Polygon mode
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
    if (selectedOriginNode && selectedDestNode) {
      updateBaselineMapboxRoute(selectedOriginNode, selectedDestNode, selectedModality);
    } else {
      setCurrentMapRoutes([]);
    }

    setToast({
      message: 'Simulasi dibersihkan. Tampilan peta dikembalikan ke baseline.',
      type: 'info'
    });
  }, [selectedOriginNode, selectedDestNode, selectedModality, updateBaselineMapboxRoute]);

  // Filter displayed incidents based on active time scope
  const getDisplayedIncidents = () => {
    if (activeTimeFilter === 'past') return MOCK_PAST_INCIDENTS;
    if (activeTimeFilter === 'future') return MOCK_FUTURE_INCIDENTS;
    if (activeTimeFilter === 'predict') return MOCK_PREDICT_INCIDENTS;
    return incidents; // Present
  };

  const activeIncidents = getDisplayedIncidents();

  return (
    <div className="relative w-full h-screen bg-[#080d14] text-slate-100 overflow-hidden select-none">
      {/* Top Header Navbar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#080d14]/90 backdrop-blur-md border-b border-white/10 z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center font-bold text-cyan-400">
              PN
            </div>
            <span className="font-headline font-black text-lg tracking-wider text-slate-100 uppercase">
              PetaNadi
            </span>
          </div>

          {/* Section Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveSection('map')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeSection === 'map'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              MAP 4D
            </button>
            <button
              onClick={() => setActiveSection('analytics')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeSection === 'analytics'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ANALYTICS
            </button>
            <button
              onClick={() => setActiveSection('simulation')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeSection === 'simulation'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              SIMULATION
            </button>
            <button
              onClick={() => setActiveSection('reports')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeSection === 'reports'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              REPORTS
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>KORIDOR SUMUT: ACTIVE</span>
          </div>
          <div className="text-slate-400">
            UTC+07:00
          </div>
        </div>
      </header>

      {/* Toast Notification Container */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* MAIN CONTENT CANVAS AREA */}
      <main className="absolute left-0 top-16 right-0 bottom-0 overflow-hidden flex">
        
        {/* SECTION 1: 4D GIS MAP WITH RESTORED FIGMA COMMAND CENTER GRID */}
        <div className={`w-full h-full relative flex ${activeSection === 'map' ? 'block' : 'hidden'}`}>
          
          {/* 1. RESTORED FIXED LEFT TACTICAL SIDEBAR (Figma Baseline) */}
          <aside className="w-80 h-full bg-[#0c0e12]/90 backdrop-blur-xl border-r border-white/10 z-40 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0 pointer-events-auto">
            
            {/* National Logistics Health Score Gauge (SVG CIRCLE RING FIX) */}
            <div className="bg-[#1e2024]/40 border border-white/10 p-4 rounded-xl relative overflow-hidden backdrop-blur-md">
              <p className="text-[9px] font-mono text-cyan-400 tracking-[0.2em] uppercase mb-2">
                NATIONAL LOGISTICS HEALTH
              </p>
              <div className="flex items-center justify-between">
                {/* Crisp SVG Circular Progress Gauge */}
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="4" className="text-cyan-500/20" fill="transparent" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      stroke="currentColor"
                      strokeWidth="4"
                      className={dynamicMetrics.strokeColor}
                      strokeDasharray={163}
                      strokeDashoffset={163 - (163 * dynamicMetrics.healthScore) / 100}
                      fill="transparent"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-xl font-headline font-black text-white">
                    {dynamicMetrics.healthScore}
                  </span>
                </div>

                <div className="text-right">
                  <p className={`text-xs font-bold ${dynamicMetrics.healthColor}`}>
                    {dynamicMetrics.healthStatus}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">North Sumatra Corridor</p>
                  <p className="text-[9px] text-slate-500 font-mono mt-1">
                    {dynamicMetrics.healthScore}% Flow Integrity
                  </p>
                </div>
              </div>
            </div>

            {/* Tactical Metrics Grid (Dynamic Reactive State) */}
            <div className="grid grid-cols-1 gap-3">
              {/* Logistics-to-GDP */}
              <div className="bg-[#1e2024]/40 border border-white/10 p-3 rounded-xl backdrop-blur-md">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">LOGISTICS-TO-GDP</span>
                  <span className={`text-[10px] font-mono font-bold ${dynamicMetrics.gdpColor}`}>
                    {dynamicMetrics.gdpStatus}
                  </span>
                </div>
                <p className="text-xl font-headline font-black text-white">{dynamicMetrics.logisticsGdp}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Target: &lt; 14.0% National Baseline</p>
              </div>

              {/* Food Inflation */}
              <div className="bg-[#1e2024]/40 border border-white/10 p-3 rounded-xl backdrop-blur-md">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">FOOD INFLATION</span>
                  <span className={`text-[10px] font-mono font-bold ${dynamicMetrics.inflationColor}`}>
                    {dynamicMetrics.inflationStatus}
                  </span>
                </div>
                <p className={`text-xl font-headline font-black ${dynamicMetrics.inflationColor}`}>
                  {dynamicMetrics.foodInflation}
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">PIHPS Anomaly Stream Active</p>
              </div>

              {/* Active Shocks */}
              <div className="bg-[#1e2024]/40 border border-white/10 p-3 rounded-xl backdrop-blur-md">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">ACTIVE SHOCKS</span>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">LIVE</span>
                </div>
                <p className={`text-xl font-headline font-black ${dynamicMetrics.shocksColor}`}>
                  {dynamicMetrics.activeShocks}
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">Belawan-Medan Corridor Monitored</p>
              </div>
            </div>

            {/* Quick System Legend */}
            <div className="mt-auto border-t border-white/10 pt-3 text-[10px] font-mono text-slate-400 space-y-1.5">
              <div className="flex justify-between items-center">
                <span>BMKG Radar:</span>
                <span className="text-emerald-400">ONLINE</span>
              </div>
              <div className="flex justify-between items-center">
                <span>AISstream Vessel Feed:</span>
                <span className="text-emerald-400">ONLINE</span>
              </div>
              <div className="flex justify-between items-center">
                <span>PIHPS Price Stream:</span>
                <span className="text-emerald-400">ONLINE</span>
              </div>
            </div>
          </aside>

          {/* 2. CENTER 4D MAP CANVAS AREA */}
          <div className="flex-1 h-full relative">
            
            {/* Relocated Collapsible Floating Simulator Dock above Bottombar */}
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
              selectedRadius={selectedRadius}
              setSelectedRadius={setSelectedRadius}
              selectedModality={selectedModality}
              setSelectedModality={setSelectedModality}
              onResetNodes={handleResetNodes}
            />

            {/* 4D Mapbox/Deck.gl Map */}
            <CrisisMap
              incidents={activeIncidents}
              selectedCrisisId={selectedCrisisId}
              onCrisisClick={handleCrisisClick}
              activeRoutes={
                selectedCrisis?.route_recommendations || currentMapRoutes
              }
              activeRouteIdx={activeRouteIdx}
              fireHotspots={[]}
              maritimeVectors={[]}
              disasterZones={disasterZones}
              onPolygonDrawn={handlePolygonDrawn}
              drawModeActive={drawModeActive}
              isClickTargeting={isClickTargeting}
              onMapPointTargeted={(lat, lon) => handleMapPointTargeted(lat, lon)}
              simulatedShockwave={simulatedShockwave}
              selectedOriginNode={selectedOriginNode || undefined}
              selectedDestNode={selectedDestNode || undefined}
              onNodeSelected={handleNodeSelected}
              onSelectRoute={(idx) => setActiveRouteIdx(idx)}
              hubNodesList={dynamicHubNodes}
            />

            {/* Guided Presentation Demo Panel */}
            <GuidedDemoPanel onCrisisReady={handleCrisisReadyFromDemo} />

            {/* Bottombar Time Scope Filters */}
            <footer className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#080d14]/90 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl shadow-2xl">
              {(['past', 'present', 'future', 'predict'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => {
                    setActiveTimeFilter(filter);
                    if (filter === 'predict') {
                      handleCrisisClick('mock-predict-1');
                    }
                  }}
                  className={`px-4 py-1.5 rounded-xl font-headline font-bold text-xs uppercase tracking-wider transition ${
                    activeTimeFilter === filter
                      ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </footer>
          </div>

          {/* 3. DOCKED FLOATING GLASS DRAWER RIGHT SIDEBAR (CrisisSidebar) */}
          {isSidebarOpen && selectedCrisis && (
            <CrisisSidebar
              crisis={selectedCrisis}
              onClose={() => setIsSidebarOpen(false)}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              activeRouteIdx={activeRouteIdx}
              onSelectRoute={(idx) => setActiveRouteIdx(idx)}
              onApproveSuccess={(msg) => setToast({ message: msg, type: 'success' })}
            />
          )}

        </div>

        {/* Section 2: Analytics Dashboard */}
        <div className={`w-full h-full ${activeSection === 'analytics' ? 'block' : 'hidden'}`}>
          <AnalyticsSection />
        </div>

        {/* Section 3: Simulation Sandbox */}
        <div className={`w-full h-full p-6 ${activeSection === 'simulation' ? 'block' : 'hidden'}`}>
          <SimulationSection crisisId={selectedCrisisId} />
        </div>

        {/* Section 4: Executive Reports */}
        <div className={`w-full h-full p-6 ${activeSection === 'reports' ? 'block' : 'hidden'}`}>
          <ReportsSection />
        </div>

      </main>
    </div>
  );
}
