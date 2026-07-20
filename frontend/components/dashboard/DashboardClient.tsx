'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useIncidents } from '@/hooks/useIncidents';
import { useCrisisSocket } from '@/hooks/useCrisisSocket';
import { CrisisSidebar } from '@/components/sidebar/CrisisSidebar';
import { Toast } from '@/components/ui/Toast';
import { GuidedDemoPanel } from '@/components/demo/GuidedDemoPanel';
import AnalyticsSection from '@/components/dashboard/AnalyticsSection';
import SimulationSection from '@/components/dashboard/SimulationSection';
import ReportsSection from '@/components/dashboard/ReportsSection';
import { api } from '@/lib/api';
import type { CrisisState, WsEvent } from '@/lib/types';

// Dynamic import for map to avoid SSR issues
const CrisisMap = dynamic(() => import('@/components/map/CrisisMap'), { ssr: false });

// Stub fire hotspots and maritime vectors
const STUB_FIRE_HOTSPOTS = [
  { coordinates: [98.5, 3.6] as [number, number], confidence: 85 },
  { coordinates: [98.8, 3.9] as [number, number], confidence: 70 },
];
const STUB_MARITIME = [
  { path: [[98.67, 3.79], [98.7, 3.85], [98.72, 3.9]] as [number, number][], vessel_id: 'V001', name: 'Belawan Ferry 1' },
];

const MOCK_PAST_INCIDENTS = [
  { id: 'mock-past-1', title: 'Belawan Toll Road Congestion', type: 'congestion' as const, severity: 'medium' as const, lat: 3.78, lon: 98.67, status: 'resolved' as const, confidence: 0.9, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'mock-past-2', title: 'Medan Flood Level II', type: 'flood' as const, severity: 'high' as const, lat: 3.61, lon: 98.65, status: 'resolved' as const, confidence: 0.95, created_at: new Date(Date.now() - 172800000).toISOString() }
];

const MOCK_FUTURE_INCIDENTS = [
  { id: 'mock-future-1', title: 'Predicted High Rainfall (BMKG Weather Warning)', type: 'flood' as const, severity: 'medium' as const, lat: 3.55, lon: 98.72, status: 'detecting' as const, confidence: 0.72, created_at: new Date().toISOString() },
  { id: 'mock-future-2', title: 'Expected Toll Delay near Binjai', type: 'congestion' as const, severity: 'low' as const, lat: 3.65, lon: 98.58, status: 'validating' as const, confidence: 0.68, created_at: new Date().toISOString() }
];

const MOCK_PREDICT_INCIDENTS = [
  { id: 'mock-predict-1', title: 'Inflation Spike Alert: Rice Stock Depletion', type: 'port_closure' as const, severity: 'critical' as const, lat: 3.79, lon: 98.68, status: 'detecting' as const, confidence: 0.88, created_at: new Date().toISOString() }
];

export default function DashboardClient() {
  const { incidents, loading, lastUpdated, refetch } = useIncidents();
  const [selectedCrisisId, setSelectedCrisisId] = useState<string | null>(null);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisState | null>(null);
  const [activeRouteIdx, setActiveRouteIdx] = useState<number | null>(null);
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [disasterZones, setDisasterZones] = useState<Array<{ polygon: [number, number][]; type: 'flood'; risk: number }>>([]);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null);

  // Stitch Design States
  const [activeSection, setActiveSection] = useState<'map' | 'analytics' | 'simulation' | 'reports'>('map');
  const [activeLayer, setActiveLayer] = useState<'evidence' | 'traffic' | 'commodities' | 'fleet'>('evidence');
  const [activeTimeFilter, setActiveTimeFilter] = useState<'past' | 'present' | 'future' | 'predict'>('present');
  const [activeTab, setActiveTab] = useState<'Evidence' | 'Mitigation' | 'Economic'>('Evidence');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleWsMessage = useCallback((event: WsEvent) => {
    if (event.event === 'node_update') {
      setSelectedCrisis((prev) => prev ? { ...prev, ...event.data } : prev);
    }
    if (event.event === 'complete') {
      refetch();
    }
  }, [refetch]);

  const { send: sendWs } = useCrisisSocket(selectedCrisisId, handleWsMessage);

  const handleCrisisClick = useCallback(async (id: string) => {
    setSelectedCrisisId(id);
    setActiveRouteIdx(null);
    setIsSidebarOpen(true);

    if (id.startsWith('mock-')) {
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
            cctv_label: 'CAM_MEDAN_INTERCHANGE',
            osint_text: 'Water receded. Secondary lane reopened.'
          }
        },
        'mock-future-1': {
          crisis_id: 'mock-future-1',
          title: 'Predicted High Rainfall (BMKG Weather Warning)',
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
            cctv_label: 'BMKG_SATELLITE_FEED',
            osint_text: 'Expected rainfall > 150mm/day in North Sumatra area.'
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
            cctv_label: 'BINJAI_TOLL_CAM',
            osint_text: 'Predictive flow indicates bottlenecks on route.'
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
          validated: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
          route_recommendations: [],
          evidence: {
            cctv_label: 'BELAWAN_STORAGE_CAM',
            osint_text: 'Low incoming volume at the grain terminals.'
          }
        }
      };
      setSelectedCrisis(mockIncidentsMap[id] || null);
      return;
    }

    try {
      const detail = await api.incidents.get(id);
      setSelectedCrisis(detail);
    } catch (err) {
      console.error('Failed to fetch crisis detail:', err);
    }
  }, []);

  // Subscribe over WS when selectedCrisisId / selectedCrisis is loaded
  useEffect(() => {
    if (selectedCrisis && selectedCrisisId && !selectedCrisisId.startsWith('mock-')) {
      sendWs({
        type: selectedCrisis.type,
        source: 'dashboard_subscribe',
        severity: 'high',
        crisis_id: selectedCrisisId,
      });
    }
  }, [selectedCrisis, selectedCrisisId, sendWs]);

  const handleCloseSidebar = useCallback(() => {
    setSelectedCrisisId(null);
    setSelectedCrisis(null);
    setActiveRouteIdx(null);
    setIsSidebarOpen(false);
  }, []);

  const handlePolygonDrawn = useCallback(async (polygon: [number, number][]) => {
    setDrawModeActive(false);
    setDisasterZones((prev) => [...prev, { polygon, type: 'flood', risk: 0.8 }]);
    setSimulateLoading(true);
    try {
      const res = await api.incidents.simulate({ type: 'flood', polygon, region: 'north_sumatra' });
      console.log('Simulation queued:', res.scenario_id);
      setToast({ message: 'Simulation triggered successfully', type: 'success' });
      setTimeout(refetch, 5000);
    } catch (err) {
      console.error('Simulation failed:', err);
      setToast({ message: 'Simulation failed to start', type: 'error' });
    } finally {
      setSimulateLoading(false);
    }
  }, [refetch]);

  const handleDemoCrisisReady = useCallback((crisis: CrisisState) => {
    setSelectedCrisis(crisis);
    setSelectedCrisisId(crisis.crisis_id);
    refetch();
  }, [refetch]);

  // Determine active time filter results
  const filteredIncidents = [...incidents, ...MOCK_PAST_INCIDENTS, ...MOCK_FUTURE_INCIDENTS, ...MOCK_PREDICT_INCIDENTS].filter((incident) => {
    if (activeTimeFilter === 'past') {
      return incident.status === 'resolved';
    }
    if (activeTimeFilter === 'present') {
      return incident.status !== 'resolved' && !incident.id.startsWith('mock-');
    }
    if (activeTimeFilter === 'future') {
      return (incident.status === 'detecting' || incident.status === 'validating') && incident.id.startsWith('mock-future');
    }
    // predict
    return incident.id.startsWith('mock-predict');
  });

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-surface-dim font-body select-none">
      {/* Full-screen map (acting as background) */}
      <div className={`absolute inset-0 z-0 transition-all duration-500 ${
        activeSection !== 'map' ? 'opacity-20 blur-sm pointer-events-none' : 'opacity-100'
      }`}>
        <CrisisMap
          incidents={filteredIncidents}
          selectedCrisisId={selectedCrisisId}
          onCrisisClick={handleCrisisClick}
          activeRoutes={activeLayer === 'traffic' ? (selectedCrisis?.route_recommendations ?? []) : []}
          activeRouteIdx={activeRouteIdx}
          fireHotspots={activeLayer === 'evidence' ? STUB_FIRE_HOTSPOTS : []}
          maritimeVectors={activeLayer === 'fleet' ? STUB_MARITIME : []}
          disasterZones={disasterZones}
          onPolygonDrawn={handlePolygonDrawn}
          drawModeActive={drawModeActive}
        />
        {/* Shadow overlays on map */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50 pointer-events-none"></div>
        <div className="absolute inset-0 hex-overlay opacity-20 pointer-events-none"></div>
      </div>

      {/* TopNavBar */}
      <header className="flex justify-between items-center w-full px-6 h-16 fixed top-0 z-50 bg-[#0c0e12]/80 backdrop-blur-xl border-b border-[#00F0FF]/15 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-8">
          <span className="text-2xl font-black tracking-tighter text-[#00F0FF] drop-shadow-[0_0_8px_rgba(0,240,255,0.5)] font-headline">PetaNadi</span>
          <nav className="hidden md:flex gap-6">
            <button 
              className={`font-headline uppercase tracking-widest text-sm font-bold pb-1 transition-all ${
                activeSection === 'map' 
                  ? 'text-[#00F0FF] border-b-2 border-[#00F0FF] shadow-[0_4px_12px_rgba(0,240,255,0.3)]' 
                  : 'text-[#e2e2e8]/60 hover:text-[#e2e2e8]'
              }`}
              onClick={() => setActiveSection('map')}
            >
              Map
            </button>
            <button 
              className={`font-headline uppercase tracking-widest text-sm font-bold pb-1 transition-all ${
                activeSection === 'analytics' 
                  ? 'text-[#00F0FF] border-b-2 border-[#00F0FF] shadow-[0_4px_12px_rgba(0,240,255,0.3)]' 
                  : 'text-[#e2e2e8]/60 hover:text-[#e2e2e8]'
              }`}
              onClick={() => setActiveSection('analytics')}
            >
              Analytics
            </button>
             <button 
              className={`font-headline uppercase tracking-widest text-sm font-bold pb-1 transition-all ${
                activeSection === 'simulation' 
                  ? 'text-[#00F0FF] border-b-2 border-[#00F0FF] shadow-[0_4px_12px_rgba(0,240,255,0.3)]' 
                  : 'text-[#e2e2e8]/60 hover:text-[#e2e2e8]'
              }`}
              onClick={() => setActiveSection('simulation')}
            >
              Simulation
            </button>
            <button 
              className={`font-headline uppercase tracking-widest text-sm font-bold pb-1 transition-all ${
                activeSection === 'reports' 
                  ? 'text-[#00F0FF] border-b-2 border-[#00F0FF] shadow-[0_4px_12px_rgba(0,240,255,0.3)]' 
                  : 'text-[#e2e2e8]/60 hover:text-[#e2e2e8]'
              }`}
              onClick={() => setActiveSection('reports')}
            >
              Reports
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-surface-container-high px-3 py-1 border border-outline-variant/30 flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px] text-primary-container">schedule</span>
            <span className="font-['Space_Grotesk'] text-xs uppercase tracking-widest font-bold text-[#00F0FF]">UTC+00:00</span>
          </div>
        </div>
      </header>

      {/* SideNavBar (Hover to expand) */}
      <aside className="fixed left-0 top-16 bottom-0 z-40 flex flex-col bg-[#0c0e12]/90 backdrop-blur-2xl border-r border-[#00F0FF]/10 shadow-[4px_0_24px_rgba(0,0,0,0.8)] w-20 hover:w-64 transition-all duration-300 ease-in-out group">
        <div className="p-6 flex items-center gap-4 overflow-hidden whitespace-nowrap border-b border-outline-variant/10">
          <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center border border-primary-container/30 shrink-0">
            <span className="material-symbols-outlined text-primary-container text-sm">person</span>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out">
            <p className="font-bold text-xs font-headline tracking-tighter text-on-surface">OPERATOR_01</p>
            <p className="text-[10px] text-on-surface-variant font-mono uppercase">Sector: SE-ASIA</p>
          </div>
        </div>
        <nav className="flex-1 flex flex-col py-4">
          <button 
            onClick={() => {
              setActiveLayer('evidence');
              setActiveTab('Evidence');
              setIsSidebarOpen(true);
              if (!selectedCrisisId && filteredIncidents.length > 0) {
                handleCrisisClick(filteredIncidents[0].id);
              }
            }}
            className={`flex items-center px-6 py-4 gap-4 transition-all duration-300 ease-in-out w-full text-left ${
              activeLayer === 'evidence' 
                ? 'bg-[#00F0FF]/20 text-[#00F0FF] border-r-2 border-[#00F0FF]' 
                : 'text-[#e2e2e8]/40 hover:text-[#00F0FF]/80 hover:bg-[#1a1c20]'
            }`}
          >
            <span className="material-symbols-outlined">policy</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out font-['Inter'] text-xs tracking-tight uppercase font-bold">Evidence</span>
          </button>
          <button 
            onClick={() => {
              setActiveLayer('traffic');
              setActiveTab('Mitigation');
              setIsSidebarOpen(true);
              if (!selectedCrisisId && filteredIncidents.length > 0) {
                handleCrisisClick(filteredIncidents[0].id);
              }
            }}
            className={`flex items-center px-6 py-4 gap-4 transition-all duration-300 ease-in-out w-full text-left ${
              activeLayer === 'traffic' 
                ? 'bg-[#00F0FF]/20 text-[#00F0FF] border-r-2 border-[#00F0FF]' 
                : 'text-[#e2e2e8]/40 hover:text-[#00F0FF]/80 hover:bg-[#1a1c20]'
            }`}
          >
            <span className="material-symbols-outlined">traffic</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out font-['Inter'] text-xs tracking-tight uppercase font-bold">Traffic</span>
          </button>
          <button 
            onClick={() => {
              setActiveLayer('commodities');
              setActiveTab('Economic');
              setIsSidebarOpen(true);
              if (!selectedCrisisId && filteredIncidents.length > 0) {
                handleCrisisClick(filteredIncidents[0].id);
              }
            }}
            className={`flex items-center px-6 py-4 gap-4 transition-all duration-300 ease-in-out w-full text-left ${
              activeLayer === 'commodities' 
                ? 'bg-[#00F0FF]/20 text-[#00F0FF] border-r-2 border-[#00F0FF]' 
                : 'text-[#e2e2e8]/40 hover:text-[#00F0FF]/80 hover:bg-[#1a1c20]'
            }`}
          >
            <span className="material-symbols-outlined">inventory_2</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out font-['Inter'] text-xs tracking-tight uppercase font-bold">Commodities</span>
          </button>
          <button 
            onClick={() => {
              setActiveLayer('fleet');
              setActiveTab('Mitigation');
              setIsSidebarOpen(true);
              if (!selectedCrisisId && filteredIncidents.length > 0) {
                handleCrisisClick(filteredIncidents[0].id);
              }
            }}
            className={`flex items-center px-6 py-4 gap-4 transition-all duration-300 ease-in-out w-full text-left ${
              activeLayer === 'fleet' 
                ? 'bg-[#00F0FF]/20 text-[#00F0FF] border-r-2 border-[#00F0FF]' 
                : 'text-[#e2e2e8]/40 hover:text-[#00F0FF]/80 hover:bg-[#1a1c20]'
            }`}
          >
            <span className="material-symbols-outlined">local_shipping</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out font-['Inter'] text-xs tracking-tight uppercase font-bold">Fleet</span>
          </button>
        </nav>
        <div className="mt-auto flex flex-col py-4 border-t border-outline-variant/10">
          <button className="text-[#e2e2e8]/40 hover:text-[#00F0FF]/80 flex items-center px-6 py-4 gap-4 transition-all duration-300 ease-in-out hover:bg-[#1a1c20] w-full text-left">
            <span className="material-symbols-outlined">settings</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out font-['Inter'] text-xs tracking-tight uppercase font-bold">Settings</span>
          </button>
          <button className="text-[#e2e2e8]/40 hover:text-[#00F0FF]/80 flex items-center px-6 py-4 gap-4 transition-all duration-300 ease-in-out hover:bg-[#1a1c20] w-full text-left">
            <span className="material-symbols-outlined">help_center</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out font-['Inter'] text-xs tracking-tight uppercase font-bold">Support</span>
          </button>
        </div>
      </aside>

      {/* Main Viewport Content Overlay */}
      <main className="absolute left-20 top-16 right-0 bottom-0 overflow-hidden flex flex-col z-10 pointer-events-none">
        
        {/* Micro-Telemetry Ticker */}
        <div className="w-full bg-surface-container-lowest/80 border-y border-outline-variant/10 py-1 flex items-center overflow-hidden pointer-events-auto shrink-0">
          <div className="flex whitespace-nowrap animate-pulse gap-12 px-6">
            <span className="text-[10px] font-mono text-primary-fixed-dim/70 tracking-widest">SYS_STATUS: OPERATIONAL</span>
            <span className="text-[10px] font-mono text-primary-fixed-dim/70 tracking-widest">NETWORK_LATENCY: 12ms</span>
            <span className="text-[10px] font-mono text-primary-fixed-dim/70 tracking-widest">COORD: 3.7922° N, 98.6776° E</span>
            <span className="text-[10px] font-mono text-primary-fixed-dim/70 tracking-widest">ENCRYPTION: AES-256-GCM</span>
            <span className="text-[10px] font-mono text-primary-fixed-dim/70 tracking-widest">SAT_RELAY: ACTIVE</span>
            <span className="text-[10px] font-mono text-primary-fixed-dim/70 tracking-widest">DATA_FEED: {lastUpdated ? `ACTIVE (${lastUpdated.toLocaleTimeString()})` : 'REALTIME'}</span>
          </div>
        </div>

        {/* Viewport Content based on activeSection */}
        {activeSection === 'map' && (
          <>
            {/* Tactical Columns overlay */}
            <div className="flex-1 p-6 pb-24 flex justify-between gap-6 overflow-hidden">
              
              {/* Left Tactical Column */}
              <div className="w-80 flex flex-col gap-6 shrink-0 pointer-events-auto max-h-full overflow-y-auto no-scrollbar">
                {/* National Health Index Gauge */}
                <div className="glass-panel border border-outline-variant/15 p-6 rounded-sm relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary-container/5 rounded-full blur-2xl group-hover:bg-primary-container/10 transition-all"></div>
                  <p className="text-[10px] font-headline font-bold text-primary-container tracking-[0.2em] mb-4 uppercase">National Logistics Health</p>
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="relative w-40 h-40 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle className="text-surface-container-highest" cx="80" cy="80" fill="transparent" r="70" stroke="currentColor" strokeWidth="4"></circle>
                        <circle 
                          className="text-primary-container drop-shadow-[0_0_8px_rgba(0,240,255,0.6)] transition-all duration-500" 
                          cx="80" 
                          cy="80" 
                          fill="transparent" 
                          r="70" 
                          stroke="currentColor" 
                          strokeDasharray="440" 
                          strokeDashoffset={Math.max(440 - (440 * Math.max(100 - filteredIncidents.length * 8, 30)) / 100, 0)} 
                          strokeWidth="8"
                        ></circle>
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-4xl font-black font-headline text-on-surface">
                          {Math.max(100 - filteredIncidents.length * 8, 30)}
                        </span>
                        <span className="text-[10px] text-primary-fixed-dim uppercase font-bold tracking-tighter">Index Score</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-between items-end">
                    <span className="text-[10px] font-mono text-on-surface-variant">
                      {filteredIncidents.length > 3 ? 'LVL_CRITICAL' : filteredIncidents.length > 0 ? 'LVL_WARNING' : 'LVL_NOMINAL'}
                    </span>
                    <span className="text-[10px] font-mono text-primary-container">
                      {filteredIncidents.length > 0 ? `-${filteredIncidents.length * 2.4}% Δ` : '+2.4% Δ'}
                    </span>
                  </div>
                </div>

                {/* Strategic KPI Stack */}
                <div className="flex flex-col gap-2">
                  <div className="bg-surface-container-low/60 border-l-2 border-primary-container p-4 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-on-surface-variant font-headline uppercase tracking-widest font-bold">Logistics-to-GDP</span>
                      <span className="material-symbols-outlined text-[14px] text-primary-container">trending_down</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-headline text-on-surface">14.2%</span>
                      <span className="text-[10px] font-mono text-primary-fixed-dim/60">-0.8%</span>
                    </div>
                  </div>
                  <div className="bg-surface-container-low/60 border-l-2 border-tertiary-fixed-dim p-4 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-on-surface-variant font-headline uppercase tracking-widest font-bold">Food Inflation</span>
                      <span className="material-symbols-outlined text-[14px] text-tertiary-fixed-dim">warning</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-headline text-on-surface">7.14%</span>
                      <span className="text-[10px] font-mono text-tertiary-fixed-dim/60">+1.2%</span>
                    </div>
                  </div>
                  <div className="bg-surface-container-low/60 border-l-2 border-error p-4 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-on-surface-variant font-headline uppercase tracking-widest font-bold">Active Shocks</span>
                      <span className="material-symbols-outlined text-[14px] text-error">error</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-headline text-on-surface">{filteredIncidents.length}</span>
                      <span className="text-[10px] font-mono text-error/60">
                        {filteredIncidents.length > 3 ? 'CRITICAL' : filteredIncidents.length > 0 ? 'ACTIVE' : 'NOMINAL'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Central Map area is transparent for map interactibility */}
              <div className="flex-1" />

              {/* Right Column: Strategic Alerts (when sidebar is closed) */}
              <div className="w-96 flex flex-col gap-6 shrink-0 pointer-events-auto relative">
                {!selectedCrisis && (
                  <div className="flex-1 glass-panel border border-outline-variant/15 flex flex-col overflow-hidden rounded-sm animate-fade-in">
                    <div className="p-4 border-b border-outline-variant/20 bg-surface-container-high/40 flex justify-between items-center">
                      <h3 className="text-xs font-headline font-bold text-on-surface tracking-widest uppercase">Strategic Alerts</h3>
                      <span className="text-[10px] font-mono text-primary-container">COUNT: {filteredIncidents.length}</span>
                    </div>
                    
                    {filteredIncidents.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 text-xs">
                        <span className="material-symbols-outlined text-lg mb-2 text-primary/30">verified_user</span>
                        No active disruptions in this viewport.
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
                        {filteredIncidents.map((incident) => (
                          <div
                            key={incident.id}
                            onClick={() => handleCrisisClick(incident.id)}
                            className={`border-l-2 pl-4 py-1.5 group cursor-pointer hover:bg-surface-container-low/40 transition-colors ${
                              incident.severity === 'critical' ? 'border-error' :
                              incident.severity === 'high' ? 'border-[#ffb950]' :
                              incident.severity === 'medium' ? 'border-[#fff4ea]' : 'border-[#00dbe9]'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className={`text-[10px] font-mono font-bold ${
                                incident.severity === 'critical' ? 'text-error' : 'text-[#ffb950]'
                              }`}>
                                {incident.status.toUpperCase()}
                              </span>
                              <span className="text-[9px] font-mono text-on-surface-variant">
                                {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
                              </span>
                            </div>
                            <p className="text-xs font-medium text-on-surface mb-1 truncate">{incident.title}</p>
                            <div className="flex gap-2">
                              <span className="px-1.5 py-0.5 bg-surface-container-highest text-on-surface-variant text-[8px] uppercase font-bold">
                                Confidence: {Math.round(incident.confidence * 100)}%
                              </span>
                              <span className="px-1.5 py-0.5 bg-surface-container-highest text-on-surface-variant text-[8px] uppercase font-bold">
                                {incident.type}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="p-4 bg-surface-container-lowest/50 border-t border-outline-variant/10 text-center">
                      <button 
                        onClick={() => {
                          setDrawModeActive((v) => !v);
                        }}
                        className={`text-[10px] font-headline font-bold hover:text-primary transition-colors uppercase tracking-[0.2em] ${
                          simulateLoading || drawModeActive ? 'text-orange-400 animate-pulse' : 'text-primary-container'
                        }`}
                      >
                        {simulateLoading ? 'Simulating...' : drawModeActive ? 'Drawing Mode Active...' : 'Simulate Disruption'}
                      </button>
                    </div>
                  </div>
                )}
                
                {selectedCrisis && (
                  // Empty space to let absolute CrisisSidebar sit here cleanly without overlapping
                  <div className="flex-1 w-full bg-transparent" />
                )}
              </div>

            </div>

            {/* Bottom Time-Scope Footer */}
            <footer className="w-full z-50 h-20 bg-[#111317]/95 backdrop-blur-md border-t border-[#00F0FF]/20 flex justify-center items-center gap-4 pointer-events-auto">
              <button 
                onClick={() => setActiveTimeFilter('past')}
                className={`flex flex-col items-center justify-center px-8 h-full transition-all ${
                  activeTimeFilter === 'past' 
                    ? 'bg-[#00F0FF]/15 text-[#00F0FF] border-t-4 border-[#00F0FF]' 
                    : 'text-[#e2e2e8]/40 hover:bg-[#00F0FF]/5 hover:text-[#00F0FF]'
                }`}
              >
                <span className="material-symbols-outlined">history</span>
                <span className="font-['Inter'] font-mono text-[10px] uppercase mt-1">Past</span>
              </button>
              <button 
                onClick={() => setActiveTimeFilter('present')}
                className={`flex flex-col items-center justify-center px-8 h-full transition-all ${
                  activeTimeFilter === 'present' 
                    ? 'bg-[#00F0FF]/15 text-[#00F0FF] border-t-4 border-[#00F0FF]' 
                    : 'text-[#e2e2e8]/40 hover:bg-[#00F0FF]/5 hover:text-[#00F0FF]'
                }`}
              >
                <span className="material-symbols-outlined">settings_input_component</span>
                <span className="font-['Inter'] font-mono text-[10px] uppercase mt-1">Present</span>
              </button>
              <button 
                onClick={() => setActiveTimeFilter('future')}
                className={`flex flex-col items-center justify-center px-8 h-full transition-all ${
                  activeTimeFilter === 'future' 
                    ? 'bg-[#00F0FF]/15 text-[#00F0FF] border-t-4 border-[#00F0FF]' 
                    : 'text-[#e2e2e8]/40 hover:bg-[#00F0FF]/5 hover:text-[#00F0FF]'
                }`}
              >
                <span className="material-symbols-outlined">update</span>
                <span className="font-['Inter'] font-mono text-[10px] uppercase mt-1">Future</span>
              </button>
              <button 
                onClick={() => setActiveTimeFilter('predict')}
                className={`flex flex-col items-center justify-center px-8 h-full transition-all ${
                  activeTimeFilter === 'predict' 
                    ? 'bg-[#00F0FF]/15 text-[#00F0FF] border-t-4 border-[#00F0FF]' 
                    : 'text-[#e2e2e8]/40 hover:bg-[#00F0FF]/5 hover:text-[#00F0FF]'
                }`}
              >
                <span className="material-symbols-outlined">psychology</span>
                <span className="font-['Inter'] font-mono text-[10px] uppercase mt-1">Predict</span>
              </button>
            </footer>
          </>
        )}

        {activeSection === 'analytics' && (
          <div className="flex-1 p-6 overflow-hidden">
            <AnalyticsSection />
          </div>
        )}

        {activeSection === 'simulation' && (
          <div className="flex-1 p-6 overflow-hidden">
            <SimulationSection crisisId={selectedCrisisId} />
          </div>
        )}

        {activeSection === 'reports' && (
          <div className="flex-1 p-6 overflow-hidden">
            <ReportsSection />
          </div>
        )}
      </main>

      {isSidebarOpen && selectedCrisis && (
        <CrisisSidebar
          crisis={selectedCrisis}
          onClose={handleCloseSidebar}
          onSelectRoute={setActiveRouteIdx}
          activeRouteIdx={activeRouteIdx}
          onApproveSuccess={(msg) => setToast({ message: msg, type: 'success' })}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      )}

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#080d14]/80 flex items-center justify-center z-50 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Syncing telemetry data...</span>
          </div>
        </div>
      )}

      {/* Guided Demo Stepper Panel (Positioned bottom-right above the footer) */}
      <div className="bottom-24 fixed right-6 z-50">
        <GuidedDemoPanel onCrisisReady={handleDemoCrisisReady} />
      </div>
    </div>
  );
}
