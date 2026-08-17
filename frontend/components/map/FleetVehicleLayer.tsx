'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FleetVehicle } from '@/lib/types';
import { calculateRouteProgressPosition } from '@/lib/geoUtils';
import { Truck, Anchor, Plane, X, Navigation, Clock, Fuel, ShieldCheck, MapPin } from 'lucide-react';

interface FleetVehicleLayerProps {
  map: mapboxgl.Map | null;
  vehicles: FleetVehicle[];
  activeRoutes?: import('@/lib/types').RouteRecommendation[];
  activeRouteIdx?: number | null;
  modalityFilter?: 'all' | 'truck' | 'maritime' | 'air';
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

  // Setup HTML Mapbox Markers & 60 FPS Route-Bound Animation Loop
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

    // Initialize HTML markers for all visible vehicles
    visibleVehicles.forEach((v) => {
      if (!markersRef.current[v.vehicle_id]) {
        const isMaritime = v.modality === 'maritime';
        const isAir = v.modality === 'air';

        const el = document.createElement('div');
        el.className = 'cursor-pointer group relative flex flex-col items-center select-none transition-transform transform hover:scale-125 z-35';

        const iconColor = isMaritime
          ? 'text-amber-400 border-amber-400 bg-[#0c192a]'
          : isAir
            ? 'text-purple-400 border-purple-400 bg-[#1a0f2b]'
            : 'text-cyan-400 border-cyan-400 bg-[#081524]';

        const ringColor = isMaritime
          ? 'shadow-[0_0_12px_rgba(245,158,11,0.6)]'
          : isAir
            ? 'shadow-[0_0_12px_rgba(168,85,247,0.6)]'
            : 'shadow-[0_0_12px_rgba(6,182,212,0.6)]';

        const iconSvg = isMaritime
          ? `<svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`
          : isAir
            ? `<svg class="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5 0 1 .4 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.2c.3.4.8.6 1.3.4l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`
            : `<svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;

        el.innerHTML = `
          <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 ${iconColor} ${ringColor} backdrop-blur-md transition-all duration-300">
            <span class="vehicle-icon-wrapper">${iconSvg}</span>
            <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950 animate-ping"></span>
            <span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950"></span>
          </div>
          <div class="opacity-0 group-hover:opacity-100 absolute -bottom-7 px-2 py-0.5 rounded-lg bg-[#0c0e12]/95 border border-white/20 text-[9px] font-mono font-bold text-white shadow-xl pointer-events-none transition whitespace-nowrap z-50">
            ${v.name} (${v.speed_kmh} km/h)
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const curProg = progressMapRef.current[v.vehicle_id] ?? 0.35;
          let coords = v.route_geometry?.coordinates || v.path || [];
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

          // Smoothly fly camera to vehicle
          map.flyTo({
            center: state.currentPosition,
            zoom: Math.max(map.getZoom(), 10),
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

    // 60 FPS requestAnimationFrame Loop for visible vehicles
    const animate = (now: number) => {
      if (isCancelled || !map) return;

      const deltaSec = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      visibleVehicles.forEach((v) => {
        let coords = v.route_geometry?.coordinates || v.path || [];
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
        const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * 0.05;

        let currentProgress = (progressMapRef.current[v.vehicle_id] ?? 0.35) + increment;
        if (currentProgress > 1.0) currentProgress = 0.0;
        progressMapRef.current[v.vehicle_id] = currentProgress;

        const state = calculateRouteProgressPosition(coords, currentProgress);

        const marker = markersRef.current[v.vehicle_id];
        if (marker) {
          marker.setLngLat(state.currentPosition);
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
      {/* Floating Detailed Vehicle Cargo Inspection Card */}
      {selectedVehicle && (
        <div className="absolute top-20 left-4 z-40 w-84 bg-[#0c0e12]/95 border border-cyan-500/40 backdrop-blur-2xl p-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto text-slate-100">
          <div className="flex items-start justify-between border-b border-white/10 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl border ${
                selectedVehicle.vehicle.modality === 'maritime'
                  ? 'bg-amber-950/60 text-amber-400 border-amber-500/40'
                  : selectedVehicle.vehicle.modality === 'air'
                    ? 'bg-purple-950/60 text-purple-400 border-purple-500/40'
                    : 'bg-cyan-950/60 text-cyan-400 border-cyan-500/40'
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
              <p className="text-xs font-bold text-cyan-300 font-sans">{selectedVehicle.vehicle.cargo || 'Logistik Sembako Nasional'}</p>
            </div>

            {/* Route Status */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[8px] text-slate-400 uppercase block">Asal (Origin)</span>
                <span className="text-[10px] text-slate-200 font-bold truncate block">{selectedVehicle.vehicle.origin || 'Asal'}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[8px] text-slate-400 uppercase block">Tujuan (Dest)</span>
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
                <span>Status AIS / GPS:</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-bold uppercase">
                {selectedVehicle.vehicle.status === 'anchored' ? 'LABUH JANGKAR' : 'BERGERAK (LIVE)'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
