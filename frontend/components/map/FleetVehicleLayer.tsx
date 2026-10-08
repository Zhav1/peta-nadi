'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FleetVehicle } from '@/lib/types';
import { calculateRouteProgressPosition, projectBearingEndpoint } from '@/lib/geoUtils';
import { getHaversineDistanceKm } from '@/lib/aiDynamicRouter';
import { TargetLockReticle } from './TargetLockReticle';
import {
  Truck,
  Anchor,
  Plane,
  X,
  Navigation,
  ShieldCheck,
  Video,
  Crosshair,
  Thermometer,
} from 'lucide-react';

interface FleetVehicleLayerProps {
  map: mapboxgl.Map | null;
  vehicles: FleetVehicle[];
  activeRoutes?: import('@/lib/types').RouteRecommendation[];
  activeRouteIdx?: number | null;
  modalityFilter?: 'all' | 'truck' | 'maritime' | 'air';
  simSpeed?: number;
}

function calculatePathDistanceKm(coords: [number, number][]): number {
  if (!coords || coords.length < 2) return 50.0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getHaversineDistanceKm(coords[i], coords[i + 1]);
  }
  return Math.max(10.0, total);
}

function getCardinalDirection(deg: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((deg % 360) / 45)) % 8;
  return directions[index];
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
  simSpeed = 1,
}: FleetVehicleLayerProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<{
    vehicle: FleetVehicle;
    currentPos: [number, number];
    bearing: number;
  } | null>(null);

  const [isFollowCamActive, setIsFollowCamActive] = useState<boolean>(false);

  const animRef = useRef<number | null>(null);
  const progressMapRef = useRef<Record<string, number>>({});
  const breadcrumbsRef = useRef<Record<string, [number, number][]>>({});
  const lastTimeRef = useRef<number>(performance.now());
  const selectedVehicleIdRef = useRef<string | null>(null);
  const isFollowCamActiveRef = useRef<boolean>(false);

  selectedVehicleIdRef.current = selectedVehicle?.vehicle.vehicle_id ?? null;
  isFollowCamActiveRef.current = isFollowCamActive;

  // Listen to manual map drag to disengage follow-camera immediately without input fighting
  useEffect(() => {
    if (!map) return;

    const onDragStart = () => {
      setIsFollowCamActive(false);
    };

    map.on('dragstart', onDragStart);
    return () => {
      map.off('dragstart', onDragStart);
    };
  }, [map]);

  // Register high-DPI sprites
  const registerSprites = useCallback((targetMap: mapboxgl.Map) => {
    const sprites: Array<{ id: string; type: 'truck' | 'maritime' | 'air'; color: string }> = [
      { id: 'truck-icon', type: 'truck', color: '#34d399' },
      { id: 'vessel-icon', type: 'maritime', color: '#38bdf8' },
      { id: 'plane-icon', type: 'air', color: '#c084fc' },
    ];

    sprites.forEach(({ id, type, color }) => {
      try {
        if (!targetMap.hasImage(id)) {
          const imgData = createModalitySprite(type, color);
          targetMap.addImage(id, imgData, { pixelRatio: 2 });
        }
      } catch {
        // Sprite may already exist or context not ready
      }
    });
  }, []);

  // Initialize Mapbox WebGL sources and layers
  const setupLayers = useCallback((targetMap: mapboxgl.Map) => {
    if (!targetMap.isStyleLoaded()) return;

    try {
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

        // Ensure newly added symbol layer has its layout properties immediately initialized
        const styleAny = (targetMap as any).style;
        const layerInst = styleAny?._layers?.['fleet-telemetry-points-layer'] || styleAny?._mergedLayers?.['fleet-telemetry-points-layer'];
        if (layerInst && !layerInst.layout && typeof layerInst.recalculate === 'function') {
          layerInst.recalculate({ zoom: targetMap.getZoom() }, styleAny?._availableImages || {});
        }
      }
    } catch {
      // Style was mutating, retry on idle
    }
  }, [registerSprites]);

  // Setup WebGL layers on style load or map ready
  useEffect(() => {
    if (!map) return;

    const handleSetup = () => {
      if (map.isStyleLoaded()) {
        setupLayers(map);
      }
    };

    if (map.isStyleLoaded()) {
      setupLayers(map);
    }

    map.on('idle', handleSetup);
    map.on('styledata', handleSetup);

    return () => {
      map.off('idle', handleSetup);
      map.off('styledata', handleSetup);
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

        if (map.getPitch() < 30) {
          map.easeTo({
            center: coords,
            pitch: 35,
            zoom: Math.max(map.getZoom(), 9.5),
            duration: 800,
          });
        } else {
          map.easeTo({
            center: coords,
            zoom: Math.max(map.getZoom(), 9.5),
            duration: 800,
          });
        }
      }
    };

    const onMouseEnter = () => {
      try {
        const canvas = map?.getCanvas();
        if (canvas?.style) canvas.style.cursor = 'pointer';
      } catch {}
    };

    const onMouseLeave = () => {
      try {
        const canvas = map?.getCanvas();
        if (canvas?.style) canvas.style.cursor = '';
      } catch {}
    };

    map.on('click', 'fleet-telemetry-points-layer', onLayerClick);
    map.on('mouseenter', 'fleet-telemetry-points-layer', onMouseEnter);
    map.on('mouseleave', 'fleet-telemetry-points-layer', onMouseLeave);

    return () => {
      try {
        map.off('click', 'fleet-telemetry-points-layer', onLayerClick);
        map.off('mouseenter', 'fleet-telemetry-points-layer', onMouseEnter);
        map.off('mouseleave', 'fleet-telemetry-points-layer', onMouseLeave);
        const canvas = map?.getCanvas();
        if (canvas?.style) canvas.style.cursor = '';
      } catch {}
    };
  }, [map, vehicles]);

  // Calibrated requestAnimationFrame animation loop updating WebGL GeoJSON sources & follow camera
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

        // Specific dynamic rerouting: Only assign active alternative route if vehicle is explicitly
        // flagged as rerouting or is the designated demonstration unit (TRK-003-BELAWAN-TEBING).
        // Other 23 trucks strictly preserve their surveyed Trans-Sumatra highway corridors.
        if (v.status === 'rerouting' && v.route_geometry?.coordinates && v.route_geometry.coordinates.length > 1) {
          coords = v.route_geometry.coordinates as [number, number][];
        } else if (
          v.vehicle_id === 'TRK-003-BELAWAN-TEBING' &&
          activeRoutes &&
          activeRoutes.length > 0
        ) {
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

        // Calibrated realistic progression modulated by tactical simulation speed (1x, 5x, 15x)
        const simSpeedMultiplier = typeof simSpeed === 'number' && simSpeed > 0 ? simSpeed : 1.0;
        const simScale = 8.0 * simSpeedMultiplier;
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

        // Update selected vehicle live position & Follow camera tracking
        if (isSelected) {
          setSelectedVehicle((prev) => {
            if (!prev || prev.vehicle.vehicle_id !== v.vehicle_id) return prev;
            return {
              ...prev,
              currentPos: state.currentPosition,
              bearing: state.bearing,
            };
          });

          if (isFollowCamActiveRef.current) {
            // Smooth 60 FPS top-down North-Up lerp center without disorienting rotational swings or easeTo queue lag
            const currentCenter = map.getCenter();
            const lerpFactor = 0.08;
            const nextLng = currentCenter.lng + (state.currentPosition[0] - currentCenter.lng) * lerpFactor;
            const nextLat = currentCenter.lat + (state.currentPosition[1] - currentCenter.lat) * lerpFactor;
            map.setCenter([nextLng, nextLat]);
          }
        }
      });

      // Update Mapbox WebGL sources
      try {
        const styleAny = (map as any).style;
        const layerInst = styleAny?._layers?.['fleet-telemetry-points-layer'] || styleAny?._mergedLayers?.['fleet-telemetry-points-layer'];
        if (layerInst && !layerInst.layout && typeof layerInst.recalculate === 'function') {
          layerInst.recalculate({ zoom: map.getZoom() }, styleAny?._availableImages || {});
        }

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
  }, [map, vehicles, activeRoutes, activeRouteIdx, modalityFilter, simSpeed]);

  // Clean up sources and layers on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (!map) return;
      try {
        if (map.getLayer('fleet-telemetry-points-layer')) map.removeLayer('fleet-telemetry-points-layer');
        if (map.getLayer('fleet-bearing-vectors-layer')) map.removeLayer('fleet-bearing-vectors-layer');
        if (map.getLayer('fleet-breadcrumb-trails-layer')) map.removeLayer('fleet-breadcrumb-trails-layer');
        if (map.getSource('fleet-telemetry-points')) map.removeSource('fleet-telemetry-points');
        if (map.getSource('fleet-bearing-vectors')) map.removeSource('fleet-bearing-vectors');
        if (map.getSource('fleet-breadcrumb-trails')) map.removeSource('fleet-breadcrumb-trails');
      } catch {
        // Map may be tearing down
      }
    };
  }, [map]);

  const vehicle = selectedVehicle?.vehicle;
  const isMaritime = vehicle?.modality === 'maritime';
  const isAir = vehicle?.modality === 'air';
  const isTruck = vehicle?.modality === 'truck' || (!isMaritime && !isAir);
  const temp = vehicle?.temperature_c ?? 2.8;

  const transponderId = vehicle?.mmsi
    ? `MMSI: ${vehicle.mmsi}`
    : vehicle?.icao24
      ? `ICAO24: ${vehicle.icao24}`
      : vehicle?.vin
        ? `VIN: ${vehicle.vin}`
        : `ID: ${vehicle?.vehicle_id}`;

  const statusLabel = isMaritime
    ? 'AIS AKTIF'
    : isAir
      ? 'ADS-B LOCK'
      : vehicle?.vehicle_id.startsWith('MMSI:')
        ? 'AIS AKTIF'
        : 'GPS LOCK';

  return (
    <>
      {/* Tactical Screen-Space Target Reticle Overlay */}
      {selectedVehicle && (
        <TargetLockReticle
          map={map}
          targetLngLat={selectedVehicle.currentPos}
          callsign={selectedVehicle.vehicle.name || selectedVehicle.vehicle.vehicle_id}
          onDismiss={() => {
            setSelectedVehicle(null);
            setIsFollowCamActive(false);
          }}
        />
      )}

      {/* Telemetry Inspector Console */}
      {selectedVehicle && (
        <div className="absolute top-20 left-4 z-40 w-96 bg-[#0c1017] border border-[#1c2432] shadow-xl rounded-lg p-4 text-slate-100 animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto space-y-3 font-sans">
          {/* Header Bar */}
          <div className="flex items-start justify-between border-b border-[#1c2432] pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg border ${
                  isMaritime
                    ? 'bg-sky-950/50 text-sky-400 border-sky-500/30'
                    : isAir
                      ? 'bg-purple-950/50 text-purple-400 border-purple-500/30'
                      : 'bg-emerald-950/50 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {isMaritime ? (
                  <Anchor className="w-4 h-4" />
                ) : isAir ? (
                  <Plane className="w-4 h-4" />
                ) : (
                  <Truck className="w-4 h-4" />
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white tracking-tight leading-tight">
                  {selectedVehicle.vehicle.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono tabular-nums text-slate-400 uppercase">
                    {transponderId}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#121822] text-slate-300 border border-[#1c2432] text-xs font-mono">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{statusLabel}</span>
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedVehicle(null);
                setIsFollowCamActive(false);
              }}
              className="cursor-pointer p-1 rounded-md bg-[#121822] text-slate-400 hover:text-white border border-[#1c2432] transition"
              title="Tutup Inspeksi Armada"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Kinematics Grid */}
          <div className="p-3 rounded-lg bg-[#121822] border border-[#1c2432] space-y-2.5">
            <div className="flex items-baseline justify-between border-b border-[#1c2432]/60 pb-2">
              <div>
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Navigation className="w-3.5 h-3.5 text-slate-400" />
                  <span>Kecepatan Telemetri</span>
                </span>
                <span className="text-xl font-semibold text-white font-mono tabular-nums leading-none tracking-tight mt-1 inline-block">
                  {isMaritime
                    ? `${(selectedVehicle.vehicle.sog_knots ?? (selectedVehicle.vehicle.speed_kmh / 1.852)).toFixed(1)} kts`
                    : isAir
                      ? `${(selectedVehicle.vehicle.ground_speed_kts ?? (selectedVehicle.vehicle.speed_kmh / 1.852)).toFixed(0)} kts`
                      : `${selectedVehicle.vehicle.speed_kmh} km/j`}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-400 ml-1.5">
                  ({selectedVehicle.vehicle.speed_kmh} km/j)
                </span>
              </div>

              <div className="text-right">
                <span className="text-xs font-medium text-slate-400 block uppercase tracking-wider">
                  Heading
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-200 mt-1 inline-block">
                  {Math.round(selectedVehicle.bearing)}° {getCardinalDirection(selectedVehicle.bearing)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
              <div>
                <span className="text-slate-400 block">
                  {isMaritime ? 'Draught Kapal:' : isAir ? 'Ketinggian ADS-B:' : 'Elevasi Radar:'}
                </span>
                <span className="text-slate-200 font-mono tabular-nums font-medium">
                  {isMaritime
                    ? `${selectedVehicle.vehicle.draught_m ?? 7.2} m`
                    : isAir
                      ? `${(selectedVehicle.vehicle.altitude_ft ?? 28000).toLocaleString()} ft`
                      : '45 m dpl'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Koordinat:</span>
                <span className="text-slate-300 font-mono tabular-nums">
                  {selectedVehicle.currentPos[1].toFixed(3)}°N, {selectedVehicle.currentPos[0].toFixed(3)}°E
                </span>
              </div>
            </div>
          </div>

          {/* Strategic Cargo & Cold-Chain */}
          <div className="p-3 rounded-lg bg-[#121822] border border-[#1c2432] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Muatan Logistik:</span>
              {(isTruck || vehicle?.temperature_c !== undefined) && (
                <div
                  className={`px-2 py-0.5 rounded border text-xs font-mono flex items-center gap-1 ${
                    temp <= 4.0
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                  }`}
                >
                  <Thermometer className="w-3 h-3" />
                  <span>
                    {temp.toFixed(1)}°C {temp <= 4.0 ? 'Normal' : 'Peringatan'}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-200 font-medium">
              {selectedVehicle.vehicle.cargo || 'Logistik Pangan Nasional'}
            </p>
          </div>

          {/* Route & Signal Freshness */}
          <div className="p-3 rounded-lg bg-[#121822] border border-[#1c2432] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Koridor Rute:</span>
              <span className="text-slate-200 font-medium truncate max-w-[200px]">
                {selectedVehicle.vehicle.origin || 'Asal'} → {selectedVehicle.vehicle.destination || 'Tujuan'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400 pt-1.5 border-t border-[#1c2432]">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span>Latensi Telemetri:</span>
              </span>
              <span className="text-slate-300 font-mono tabular-nums">
                {selectedVehicle.vehicle.last_ping_seconds_ago ?? 1.2}s lalu
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (!isFollowCamActive && map) {
                  if (map.getPitch() < 30) {
                    map.easeTo({
                      pitch: 35,
                      zoom: Math.max(map.getZoom(), 9.5),
                      duration: 600,
                    });
                  }
                }
                setIsFollowCamActive((prev) => !prev);
              }}
              className={`w-full py-2 px-3 rounded-md border text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150 ${
                isFollowCamActive
                  ? 'bg-white text-[#080d14] border-white font-semibold'
                  : 'bg-[#121822] text-slate-200 hover:text-white hover:bg-[#1a2230] border-[#1c2432]'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>{isFollowCamActive ? 'Kamera Pengikut Aktif' : 'Aktifkan Kamera Pengikut'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedVehicle(null);
                setIsFollowCamActive(false);
              }}
              className="w-full py-1 text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Crosshair className="w-3 h-3" />
              <span>Tutup Inspeksi</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
