'use client';
import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useIncidents } from '@/hooks/useIncidents';
import { useCrisisSocket } from '@/hooks/useCrisisSocket';
import { CrisisSidebar } from '@/components/sidebar/CrisisSidebar';
import { StatusHeader } from '@/components/ui/StatusHeader';
import { SimulateButton } from '@/components/ui/SimulateButton';
import { TimelineScrubber } from '@/components/ui/TimelineScrubber';
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

export default function DashboardClient() {
  const { incidents, loading, lastUpdated, refetch } = useIncidents();
  const [selectedCrisisId, setSelectedCrisisId] = useState<string | null>(null);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisState | null>(null);
  const [activeRouteIdx, setActiveRouteIdx] = useState<number | null>(null);
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [disasterZones, setDisasterZones] = useState<Array<{ polygon: [number, number][]; type: 'flood'; risk: number }>>([]);

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
    try {
      const detail = await api.incidents.get(id);
      setSelectedCrisis(detail);
    } catch (err) {
      console.error('Failed to fetch crisis detail:', err);
    }
  }, []);

  // Subscribe over WS when selectedCrisisId / selectedCrisis is loaded
  useEffect(() => {
    if (selectedCrisis && selectedCrisisId) {
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
  }, []);

  const handlePolygonDrawn = useCallback(async (polygon: [number, number][]) => {
    setDrawModeActive(false);
    setDisasterZones((prev) => [...prev, { polygon, type: 'flood', risk: 0.8 }]);
    setSimulateLoading(true);
    try {
      const res = await api.incidents.simulate({ type: 'flood', polygon, region: 'north_sumatra' });
      console.log('Simulation queued:', res.scenario_id);
      setTimeout(refetch, 5000);
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setSimulateLoading(false);
    }
  }, [refetch]);

  const validatedCount = incidents.filter((i) => i.status === 'validated').length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080d14]">
      {/* Full-screen map */}
      <CrisisMap
        incidents={incidents}
        selectedCrisisId={selectedCrisisId}
        onCrisisClick={handleCrisisClick}
        activeRoutes={selectedCrisis?.route_recommendations ?? []}
        activeRouteIdx={activeRouteIdx}
        fireHotspots={STUB_FIRE_HOTSPOTS}
        maritimeVectors={STUB_MARITIME}
        disasterZones={disasterZones}
        onPolygonDrawn={handlePolygonDrawn}
        drawModeActive={drawModeActive}
      />

      {/* Header */}
      <StatusHeader
        incidentCount={incidents.length}
        validatedCount={validatedCount}
        lastUpdated={lastUpdated}
      />

      {/* Simulate Disaster button */}
      <SimulateButton
        isActive={drawModeActive}
        isLoading={simulateLoading}
        onClick={() => setDrawModeActive((v) => !v)}
      />

      {/* Crisis sidebar */}
      {selectedCrisis && (
        <CrisisSidebar
          crisis={selectedCrisis}
          onClose={handleCloseSidebar}
          onSelectRoute={setActiveRouteIdx}
          activeRouteIdx={activeRouteIdx}
        />
      )}

      {/* Timeline scrubber (stub — snapshots come from Phase 6) */}
      <TimelineScrubber
        snapshots={[
          { timestamp: new Date().toISOString(), label: 'Live', data: {} },
        ]}
        onSeek={() => {}}
        isLive
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#080d14]/80 flex items-center justify-center z-50 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Loading incidents...</span>
          </div>
        </div>
      )}
    </div>
  );
}
