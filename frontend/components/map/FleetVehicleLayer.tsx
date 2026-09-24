'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FleetVehicle } from '@/lib/types';
import { calculateRouteProgressPosition, projectBearingEndpoint } from '@/lib/geoUtils';
import { getHaversineDistanceKm } from '@/lib/aiDynamicRouter';
import { TargetLockReticle } from './TargetLockReticle';
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

/**
 * Programmatic canvas SVG sprite generator for crisp high-DPI WebGL icons.
 */
function createModalitySprite(
  type: 'truck' | 'maritime' | 'air',
  colorHex: string
): ImageData {
  const size = 64; // 2x high-DPI for 32px display
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Tactical disc background with glow/border
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#0c0e12';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = colorHex;
  ctx.stroke();

  // Forward indicator pip at top (north / 0 deg)
  ctx.beginPath();
  ctx.arc(size / 2, 8, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#00f0ff';
  ctx.fill();

  // Vector silhouette
  ctx.fillStyle = colorHex;
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'maritime') {
    // Vessel anchor & hull geometry
    ctx.beginPath();
    ctx.moveTo(size / 2, 16);
    ctx.lineTo(size / 2, 44);
    ctx.moveTo(20, 28);
    ctx.lineTo(44, 28);
    ctx.moveTo(18, 38);
    ctx.quadraticCurveTo(size / 2, 48, 46, 38);
    ctx.stroke();
  } else if (type === 'air') {
    // Aircraft delta silhouette
    ctx.beginPath();
    ctx.moveTo(size / 2, 14);
    ctx.lineTo(46, 42);
    ctx.lineTo(size / 2, 36);
    ctx.lineTo(18, 42);
    ctx.closePath();
    ctx.fill();
  } else {
    // Cargo truck cab geometry
    ctx.beginPath();
    ctx.strokeRect(18, 20, 28, 24);
    ctx.fillRect(22, 24, 20, 8);
    // Wheels
    ctx.beginPath();
    ctx.arc(24, 46, 3, 0, Math.PI * 2);
    ctx.arc(40, 46, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
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

  const animRef = useRef<number | null>(null);
  const progressMapRef = useRef<Record<string, number>>({});
  const breadcrumbsRef = useRef<Record<string, [number, number][]>>({});
  const lastTimeRef = useRef<number>(performance.now());
  const selectedVehicleIdRef = useRef<string | null>(null);

  selectedVehicleIdRef.current = selectedVehicle?.vehicle.vehicle_id ?? null;

  // Register high-DPI sprites
  const registerSprites = useCallback((targetMap: mapboxgl.Map) => {
    const sprites: Array<{ id: string; type: 'truck' | 'maritime' | 'air'; color: string }> = [
      { id: 'truck-icon', type: 'truck', color: '#34d399' },
      { id: 'vessel-icon', type: 'maritime', color: '#38bdf8' },
      { id: 'plane-icon', type: 'air', color: '#c084fc' },
    ];

    sprites.forEach(({ id, type, color }) => {
      if (!targetMap.hasImage(id)) {
        const imgData = createModalitySprite(type, color);
        targetMap.addImage(id, imgData, { pixelRatio: 2 });
      }
    });
  }, []);

  // Initialize Mapbox WebGL sources and layers
  const setupLayers = useCallback((targetMap: mapboxgl.Map) => {
    if (!targetMap.isStyleLoaded()) return;

    registerSprites(targetMap);

    // 1. Breadcrumb trails source & layer
    if (!targetMap.getSource('fleet-breadcrumb-trails')) {
      targetMap.addSource('fleet-breadcrumb-trails', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('fleet-breadcrumb-trails-layer')) {
      targetMap.addLayer({
        id: 'fleet-breadcrumb-trails-layer',
        type: 'line',
        source: 'fleet-breadcrumb-trails',
        paint: {
          'line-color': 'rgba(255, 255, 255, 0.15)',
          'line-width': 1.0,
          'line-dasharray': [1, 2],
        },
      });
    }

    // 2. Bearing vectors source & layer
    if (!targetMap.getSource('fleet-bearing-vectors')) {
      targetMap.addSource('fleet-bearing-vectors', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('fleet-bearing-vectors-layer')) {
      targetMap.addLayer({
        id: 'fleet-bearing-vectors-layer',
        type: 'line',
        source: 'fleet-bearing-vectors',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-dasharray': [2, 2],
        },
      });
    }

    // 3. Telemetry points source & symbol layer
    if (!targetMap.getSource('fleet-telemetry-points')) {
      targetMap.addSource('fleet-telemetry-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('fleet-telemetry-points-layer')) {
      targetMap.addLayer({
        id: 'fleet-telemetry-points-layer',
        type: 'symbol',
        source: 'fleet-telemetry-points',
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }
  }, [registerSprites]);

  // Setup WebGL layers on style load or map ready
  useEffect(() => {
    if (!map) return;

    if (map.isStyleLoaded()) {
      setupLayers(map);
    } else {
      map.once('style.load', () => setupLayers(map));
    }

    const onStyleData = () => {
      setupLayers(map);
    };
    map.on('styledata', onStyleData);

    return () => {
      map.off('styledata', onStyleData);
    };
  }, [map, setupLayers]);

  // WebGL picking and hover handlers
  useEffect(() => {
    if (!map) return;

    const onLayerClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const vehicleId = feat.properties?.id;
      const targetVehicle = vehicles.find((v) => v.vehicle_id === vehicleId);

      if (targetVehicle) {
        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        const heading = Number(feat.properties?.heading ?? 0);
        setSelectedVehicle({
          vehicle: targetVehicle,
          currentPos: coords,
          bearing: heading,
        });

        map.flyTo({
          center: coords,
          zoom: Math.max(map.getZoom(), 9.5),
          duration: 1000,
        });
      }
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'fleet-telemetry-points-layer', onLayerClick);
    map.on('mouseenter', 'fleet-telemetry-points-layer', onMouseEnter);
    map.on('mouseleave', 'fleet-telemetry-points-layer', onMouseLeave);

    return () => {
      map.off('click', 'fleet-telemetry-points-layer', onLayerClick);
      map.off('mouseenter', 'fleet-telemetry-points-layer', onMouseEnter);
      map.off('mouseleave', 'fleet-telemetry-points-layer', onMouseLeave);
      map.getCanvas().style.cursor = '';
    };
  }, [map, vehicles]);

  // Calibrated requestAnimationFrame animation loop updating WebGL GeoJSON sources
  useEffect(() => {
    if (!map || !vehicles || vehicles.length === 0) return;

    let isCancelled = false;

    // Filter vehicles by active modality
    const visibleVehicles = vehicles.filter((v) => {
      if (!modalityFilter || modalityFilter === 'all') return true;
      return v.modality === modalityFilter;
    });

    // Initialize progress map
    visibleVehicles.forEach((v) => {
      if (progressMapRef.current[v.vehicle_id] === undefined) {
        progressMapRef.current[v.vehicle_id] = v.progress ?? 0.35;
      }
    });

    const animate = (now: number) => {
      if (isCancelled || !map) return;

      const deltaSec = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      const pointFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
      const trailFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      const vectorFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

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

        // Calibrated realistic progression (Simulation Scale 12x)
        const simScale = 12.0;
        const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * (simScale / totalDistanceKm);

        const prevProg = progressMapRef.current[v.vehicle_id] ?? 0.35;
        let currentProgress = prevProg + increment;
        if (currentProgress > 1.0) {
          currentProgress = 0.0;
          breadcrumbsRef.current[v.vehicle_id] = [];
        }
        progressMapRef.current[v.vehicle_id] = currentProgress;

        const state = calculateRouteProgressPosition(coords, currentProgress);

        // Maintain rolling circular buffer of last 10 historical coordinates for breadcrumb trail
        const history = breadcrumbsRef.current[v.vehicle_id] || [];
        const lastPt = history[history.length - 1];
        if (!lastPt || Math.hypot(lastPt[0] - state.currentPosition[0], lastPt[1] - state.currentPosition[1]) > 0.0002) {
          history.push(state.currentPosition);
          if (history.length > 10) history.shift();
          breadcrumbsRef.current[v.vehicle_id] = history;
        }

        if (history.length > 1) {
          trailFeatures.push({
            type: 'Feature',
            properties: { id: v.vehicle_id },
            geometry: {
              type: 'LineString',
              coordinates: history,
            },
          });
        }

        const icon = v.modality === 'maritime' ? 'vessel-icon' : v.modality === 'air' ? 'plane-icon' : 'truck-icon';
        const isSelected = selectedVehicleIdRef.current === v.vehicle_id;

        // Forward geodesic bearing vector
        if (v.status !== 'anchored' && (v.speed_kmh || 0) > 0) {
          const vectorColor = isSelected
            ? '#00f0ff'
            : v.modality === 'maritime'
              ? '#38bdf8'
              : v.modality === 'air'
                ? '#c084fc'
                : '#34d399';

          const endPoint = projectBearingEndpoint(
            state.currentPosition,
            state.bearing,
            v.speed_kmh || 60,
            v.modality === 'air' ? 0.08 : 0.05
          );

          vectorFeatures.push({
            type: 'Feature',
            properties: {
              id: v.vehicle_id,
              color: vectorColor,
            },
            geometry: {
              type: 'LineString',
              coordinates: [state.currentPosition, endPoint],
            },
          });
        }

        pointFeatures.push({
          type: 'Feature',
          properties: {
            id: v.vehicle_id,
            name: v.name,
            modality: v.modality,
            heading: state.bearing,
            speed_kmh: v.speed_kmh,
            status: v.status,
            icon,
            cargo: v.cargo || '',
            origin: v.origin || '',
            destination: v.destination || '',
            is_selected: isSelected,
          },
          geometry: {
            type: 'Point',
            coordinates: state.currentPosition,
          },
        });

        // Update selected vehicle live position
        if (isSelected) {
          setSelectedVehicle((prev) => {
            if (!prev || prev.vehicle.vehicle_id !== v.vehicle_id) return prev;
            return {
              ...prev,
              currentPos: state.currentPosition,
              bearing: state.bearing,
            };
          });
        }
      });

      // Update Mapbox WebGL sources
      try {
        const pointsSource = map.getSource('fleet-telemetry-points') as mapboxgl.GeoJSONSource | undefined;
        if (pointsSource) {
          pointsSource.setData({
            type: 'FeatureCollection',
            features: pointFeatures,
          });
        }

        const trailsSource = map.getSource('fleet-breadcrumb-trails') as mapboxgl.GeoJSONSource | undefined;
        if (trailsSource) {
          trailsSource.setData({
            type: 'FeatureCollection',
            features: trailFeatures,
          });
        }

        const vectorsSource = map.getSource('fleet-bearing-vectors') as mapboxgl.GeoJSONSource | undefined;
        if (vectorsSource) {
          vectorsSource.setData({
            type: 'FeatureCollection',
            features: vectorFeatures,
          });
        }
      } catch {
        // Handle race conditions during style reload
      }

      animRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      isCancelled = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [map, vehicles, activeRoutes, activeRouteIdx, modalityFilter]);

  // Clean up sources and layers on unmount
  useEffect(() => {
    return () => {
      if (!map) return;
      try {
        if (map.getLayer('fleet-telemetry-points-layer')) map.removeLayer('fleet-telemetry-points-layer');
        if (map.getLayer('fleet-bearing-vectors-layer')) map.removeLayer('fleet-bearing-vectors-layer');
        if (map.getLayer('fleet-breadcrumb-trails-layer')) map.removeLayer('fleet-breadcrumb-trails-layer');
        if (map.getSource('fleet-telemetry-points')) map.removeSource('fleet-telemetry-points');
        if (map.getSource('fleet-bearing-vectors')) map.removeSource('fleet-bearing-vectors');
        if (map.getSource('fleet-breadcrumb-trails')) map.removeSource('fleet-breadcrumb-trails');
        if (map.hasImage('truck-icon')) map.removeImage('truck-icon');
        if (map.hasImage('vessel-icon')) map.removeImage('vessel-icon');
        if (map.hasImage('plane-icon')) map.removeImage('plane-icon');
      } catch {
        // Map may be tearing down
      }
    };
  }, [map]);

  return (
    <>
      {/* Tactical Screen-Space Target Reticle Overlay */}
      {selectedVehicle && (
        <TargetLockReticle
          map={map}
          targetLngLat={selectedVehicle.currentPos}
          callsign={selectedVehicle.vehicle.name || selectedVehicle.vehicle.vehicle_id}
          onDismiss={() => setSelectedVehicle(null)}
        />
      )}

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
