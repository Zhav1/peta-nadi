'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FleetVehicle } from '@/lib/types';
import { calculateRouteProgressPosition } from '@/lib/geoUtils';
import { getHaversineDistanceKm } from '@/lib/aiDynamicRouter';
import { Truck, Anchor, Plane, X, Navigation, ShieldCheck } from 'lucide-react';

interface FleetVehicleLayerProps {
  map: mapboxgl.Map | null;
  vehicles: FleetVehicle[];
  activeRoutes?: import('@/lib/types').RouteRecommendation[];
  activeRouteIdx?: number | null;
  modalityFilter?: 'all' | 'truck' | 'maritime' | 'air';
}

function calculatePathDistanceKm(coords: [number, number][]): number {
  if (!coords || coords.length < 2) return 50.0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getHaversineDistanceKm(coords[i], coords[i + 1]);
  }
  return Math.max(10.0, total);
}

export function FleetVehicleLayer({
  map,
  vehicles,
  activeRoutes,
  activeRouteIdx,
  modalityFilter = 'all',
}: FleetVehicleLayerProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<{
    vehicle: FleetVehicle;
    currentPos: [number, number];
    bearing: number;
  } | null>(null);

  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const animRef = useRef<number | null>(null);
  const progressMapRef = useRef<Record<string, number>>({});
  const lastTimeRef = useRef<number>(performance.now());

  // Setup HTML Mapbox Markers & Route-Bound Calibrated Animation Loop
  useEffect(() => {
    if (!map || !vehicles || vehicles.length === 0) return;

    let isCancelled = false;

    // Filter vehicles by active modality filter
    const visibleVehicles = vehicles.filter((v) => {
      if (!modalityFilter || modalityFilter === 'all') return true;
      return v.modality === modalityFilter;
    });

    // Remove markers for filtered out vehicles
    Object.keys(markersRef.current).forEach((vId) => {
      if (!visibleVehicles.some((v) => v.vehicle_id === vId)) {
        markersRef.current[vId]?.remove();
        delete markersRef.current[vId];
      }
    });

    // Initialize HTML markers for all visible vehicles (Globot Clean Aesthetic)
    visibleVehicles.forEach((v) => {
      if (!markersRef.current[v.vehicle_id]) {
        const isMaritime = v.modality === 'maritime';
        const isAir = v.modality === 'air';

        const el = document.createElement('div');
        el.className = 'cursor-pointer group relative flex flex-col items-center select-none transition-transform transform hover:scale-110 z-30';

        const boxClass = isMaritime
          ? 'bg-[#0a1626] border border-sky-400 text-sky-400 rounded-lg'
          : isAir
            ? 'bg-[#150f24] border border-purple-400 text-purple-300 rounded-full'
            : 'bg-[#0a141e] border border-emerald-400 text-emerald-400 rounded-lg';

        const iconSvg = isMaritime
          ? `<svg class="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20a6 6 0 0 0 4-1.5 6 6 0 0 1 8 0 6 6 0 0 0 8 0"/><path d="M3.5 16.5 6 7h12l2.5 9.5a2 2 0 0 1-2 2.5H5.5a2 2 0 0 1-2-2.5Z"/><path d="M12 7V3"/><path d="M8 7V5"/><path d="M16 7V5"/></svg>`
          : isAir
            ? `<svg class="w-4 h-4 text-purple-300 shrink-0 plane-icon" style="transition: transform 0.15s linear;" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`
            : `<svg class="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14v10"/><circle cx="17" cy="18.5" r="2.5"/><circle cx="7" cy="18.5" r="2.5"/></svg>`;

        el.innerHTML = `
          <div class="relative flex items-center justify-center w-7 h-7 ${boxClass} shadow-md backdrop-blur-sm">
            <span class="vehicle-icon-wrapper flex items-center justify-center">${iconSvg}</span>
            <span class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 border border-slate-950"></span>
          </div>
          <div class="opacity-0 group-hover:opacity-100 absolute -bottom-6 px-2 py-0.5 rounded bg-slate-900/95 border border-slate-700 text-[9px] font-mono font-bold text-slate-100 shadow-lg pointer-events-none transition whitespace-nowrap z-50">
            ${v.name} (${v.speed_kmh} km/j)
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const curProg = progressMapRef.current[v.vehicle_id] ?? 0.35;
          let coords = (v.route_geometry?.coordinates || v.path || []) as [number, number][];
          if (v.modality === 'truck' && activeRoutes && activeRoutes.length > 0) {
            const selRoute = activeRoutes[activeRouteIdx ?? 0] || activeRoutes[0];
            if (selRoute && selRoute.waypoints && selRoute.waypoints.length > 1) {
              coords = selRoute.waypoints.map((w: [number, number] | { lon?: number; lng?: number; lat?: number }) => {
                if (Array.isArray(w)) return [w[0], w[1]];
                return [w.lon ?? w.lng ?? 0, w.lat ?? 0];
              });
            }
          }
          const state = calculateRouteProgressPosition(coords, curProg);

          setSelectedVehicle({
            vehicle: v,
            currentPos: state.currentPosition,
            bearing: state.bearing,
          });

          map.flyTo({
            center: state.currentPosition,
            zoom: Math.max(map.getZoom(), 9.5),
            duration: 1000,
          });
        });

        const initialPos: [number, number] = v.path && v.path.length > 0 ? (v.path[0] as [number, number]) : [98.67, 3.58];
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(initialPos)
          .addTo(map);

        markersRef.current[v.vehicle_id] = marker;
        progressMapRef.current[v.vehicle_id] = v.progress ?? 0.35;
      }
    });

    // Calibrated requestAnimationFrame Loop (Simulation Scale 12x: 1s = 12s transit)
    const animate = (now: number) => {
      if (isCancelled || !map) return;

      const deltaSec = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      visibleVehicles.forEach((v) => {
        let coords = (v.route_geometry?.coordinates || v.path || []) as [number, number][];
        if (v.modality === 'truck' && activeRoutes && activeRoutes.length > 0) {
          const selRoute = activeRoutes[activeRouteIdx ?? 0] || activeRoutes[0];
          if (selRoute && selRoute.waypoints && selRoute.waypoints.length > 1) {
            coords = selRoute.waypoints.map((w: [number, number] | { lon?: number; lng?: number; lat?: number }) => {
              if (Array.isArray(w)) return [w[0], w[1]];
              return [w.lon ?? w.lng ?? 0, w.lat ?? 0];
            });
          }
        }

        const baseSpeed = v.speed_kmh || 60;
        const totalDistanceKm = calculatePathDistanceKm(coords);
        
        // Calibrated realistic progression: (speed_kmh / 3600) * deltaSec * SIM_SCALE / totalDistanceKm
        const simScale = 12.0;
        const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * (simScale / totalDistanceKm);

        let currentProgress = (progressMapRef.current[v.vehicle_id] ?? 0.35) + increment;
        if (currentProgress > 1.0) currentProgress = 0.0;
        progressMapRef.current[v.vehicle_id] = currentProgress;

        const state = calculateRouteProgressPosition(coords, currentProgress);

        const marker = markersRef.current[v.vehicle_id];
        if (marker) {
          marker.setLngLat(state.currentPosition);
          // Rotate plane icon according to flight bearing
          if (v.modality === 'air') {
            const el = marker.getElement();
            const planeSvg = el.querySelector('.plane-icon') as HTMLElement | null;
            if (planeSvg) {
              planeSvg.style.transform = `rotate(${state.bearing}deg)`;
            }
          }
        }
      });

      animRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      isCancelled = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
    };
  }, [map, vehicles, activeRoutes, activeRouteIdx, modalityFilter]);

  return (
    <>
      {/* Detailed Vehicle Inspection Card */}
      {selectedVehicle && (
        <div className="absolute top-20 left-4 z-40 w-84 bg-[#0c0e12]/95 border border-cyan-500/40 backdrop-blur-2xl p-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto text-slate-100">
          <div className="flex items-start justify-between border-b border-white/10 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl border ${
                selectedVehicle.vehicle.modality === 'maritime'
                  ? 'bg-sky-950/60 text-sky-400 border-sky-500/40'
                  : selectedVehicle.vehicle.modality === 'air'
                    ? 'bg-purple-950/60 text-purple-400 border-purple-500/40'
                    : 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
              }`}>
                {selectedVehicle.vehicle.modality === 'maritime' ? (
                  <Anchor className="w-4 h-4" />
                ) : selectedVehicle.vehicle.modality === 'air' ? (
                  <Plane className="w-4 h-4" />
                ) : (
                  <Truck className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="text-xs font-bold text-white font-sans">{selectedVehicle.vehicle.name}</h3>
                <span className="text-[9px] font-mono text-slate-400 uppercase">
                  {selectedVehicle.vehicle.vehicle_id} · {selectedVehicle.vehicle.modality}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedVehicle(null)}
              className="cursor-pointer p-1 rounded-lg bg-slate-900 text-slate-400 hover:text-white transition"
              title="Tutup Info Armada"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            {/* Cargo Box */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Muatan Kargo Strategis:</span>
              <p className="text-xs font-bold text-cyan-300 font-sans">{selectedVehicle.vehicle.cargo || 'Logistik Pangan Nasional'}</p>
            </div>

            {/* Route Status */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[8px] text-slate-400 uppercase block">Asal</span>
                <span className="text-[10px] text-slate-200 font-bold truncate block">{selectedVehicle.vehicle.origin || 'Asal'}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[8px] text-slate-400 uppercase block">Tujuan</span>
                <span className="text-[10px] text-cyan-300 font-bold truncate block">{selectedVehicle.vehicle.destination || 'Tujuan'}</span>
              </div>
            </div>

            {/* Telemetry Metrics */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-cyan-950/30 border border-cyan-500/20 text-[10px]">
              <span className="flex items-center gap-1 text-slate-300">
                <Navigation className="w-3 h-3 text-cyan-400" />
                <span>Kecepatan Telemetri:</span>
              </span>
              <span className="font-bold text-emerald-400 font-mono">{selectedVehicle.vehicle.speed_kmh} km/j</span>
            </div>

            <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Status Pelacakan:</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700 font-bold uppercase">
                {selectedVehicle.vehicle.vehicle_id.startsWith('MMSI:') ? 'AIS AKTIF' : 'SIMULASI KORIDOR'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
