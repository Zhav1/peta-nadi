'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FleetVehicle } from '@/lib/types';
import { calculateRouteProgressPosition } from '@/lib/geoUtils';

import { Truck, Anchor, Plane, X } from 'lucide-react';

interface FleetVehicleLayerProps {
  map: mapboxgl.Map | null;
  vehicles: FleetVehicle[];
  activeRoutes?: import('@/lib/types').RouteRecommendation[];
  activeRouteIdx?: number | null;
}

// 🚚 Truck SVG Sprite Icon (48x48)
const truckSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="21" fill="#090d16" fill-opacity="0.95" stroke="#06b6d4" stroke-width="2.5"/>
    <rect x="10" y="14" width="18" height="14" rx="2" fill="#0284c7" stroke="#38bdf8" stroke-width="1.5"/>
    <polygon points="28,19 33,19 37,23 37,28 28,28" fill="#0891b2" stroke="#22d3ee" stroke-width="1.5"/>
    <circle cx="15" cy="31" r="3.5" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
    <circle cx="31" cy="31" r="3.5" fill="#0f172a" stroke="#22d3ee" stroke-width="2"/>
  </svg>
`;

// ⚓ Vessel SVG Sprite Icon (48x48)
const vesselSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="21" fill="#06192a" fill-opacity="0.95" stroke="#f59e0b" stroke-width="2.5"/>
    <path d="M10 26l4 10h20l4-10H10z" fill="#d97706" stroke="#fbbf24" stroke-width="1.5"/>
    <rect x="16" y="18" width="16" height="8" rx="1.5" fill="#0284c7" stroke="#38bdf8" stroke-width="1.5"/>
    <path d="M24 10v8" stroke="#fbbf24" stroke-width="2.5"/>
  </svg>
`;

// ✈️ Aircraft SVG Sprite Icon (48x48)
const planeSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="21" fill="#1e1035" fill-opacity="0.95" stroke="#a855f7" stroke-width="2.5"/>
    <path d="M24 10l3 10 10 3-10 3-3 10-3-10-10-3 10-3z" fill="#c084fc" stroke="#e879f9" stroke-width="1.5"/>
  </svg>
`;

export function FleetVehicleLayer({ map, vehicles, activeRoutes, activeRouteIdx }: FleetVehicleLayerProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<{
    vehicle: FleetVehicle;
    x: number;
    y: number;
    currentPos: [number, number];
    bearing: number;
  } | null>(null);

  const animRef = useRef<number | null>(null);
  const progressMapRef = useRef<Record<string, number>>({});
  const lastTimeRef = useRef<number>(performance.now());

  // Register SVG icons with Mapbox & handle styleimagemissing fallback
  useEffect(() => {
    if (!map) return;

    const loadIcon = (name: string, svgStr: string) => {
      if (!map || map.hasImage(name)) return;
      const img = new Image(48, 48);
      img.onload = () => {
        if (map && !map.hasImage(name)) {
          map.addImage(name, img);
          if (map.getLayer('fleet-vehicles-layer')) {
            map.setLayoutProperty('fleet-vehicles-layer', 'icon-image', ['get', 'icon']);
          }
          map.triggerRepaint();
        }
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    };

    const registerAllIcons = () => {
      loadIcon('truck-icon', truckSvg);
      loadIcon('vessel-icon', vesselSvg);
      loadIcon('plane-icon', planeSvg);
    };

    const handleMissingImage = (e: { id: string }) => {
      if (e.id === 'truck-icon') loadIcon('truck-icon', truckSvg);
      if (e.id === 'vessel-icon') loadIcon('vessel-icon', vesselSvg);
      if (e.id === 'plane-icon') loadIcon('plane-icon', planeSvg);
    };

    map.on('styleimagemissing', handleMissingImage);

    if (map.isStyleLoaded()) {
      registerAllIcons();
    } else {
      map.once('style.load', registerAllIcons);
      map.once('load', registerAllIcons);
    }

    return () => {
      map.off('styleimagemissing', handleMissingImage);
    };
  }, [map]);

  // Setup WebGL Native Layers & 60 FPS Route-Bound Animation Loop
  useEffect(() => {
    if (!map || vehicles.length === 0) return;

    let isCancelled = false;

    const sourceId = 'fleet-vehicles-source';
    const routesSourceId = 'fleet-routes-source';
    const layerId = 'fleet-vehicles-layer';
    const routesLayerId = 'fleet-routes-layer';

    const initFleetLayers = () => {
      if (isCancelled || !map || !map.isStyleLoaded()) return;

      // Build GeoJSON features for routes (dynamically synced to active Mapbox road polyline)
      const routeFeatures = vehicles.map((v) => {
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
        return {
          type: 'Feature' as const,
          properties: {
            id: v.vehicle_id,
            modality: v.modality,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: coords.length >= 2 ? coords : [[98.67, 3.58], [98.68, 3.59]],
          },
        };
      });

      const routesGeoJson = {
        type: 'FeatureCollection' as const,
        features: routeFeatures,
      };

      try {
        // Add sources & layers to Mapbox WebGL canvas safely
        if (!map.getSource(routesSourceId)) {
          map.addSource(routesSourceId, {
            type: 'geojson',
            data: routesGeoJson,
          });

          map.addLayer({
            id: routesLayerId,
            type: 'line',
            source: routesSourceId,
            paint: {
              'line-color': [
                'match',
                ['get', 'modality'],
                'truck', '#06b6d4',
                'maritime', '#f59e0b',
                'air', '#a855f7',
                '#06b6d4'
              ],
              'line-width': 2.2,
              'line-opacity': 0.6,
              'line-dasharray': [3, 2],
            },
          });
        } else {
          (map.getSource(routesSourceId) as mapboxgl.GeoJSONSource).setData(routesGeoJson);
        }

        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.addLayer({
            id: layerId,
            type: 'symbol',
            source: sourceId,
            layout: {
              'icon-image': ['get', 'icon'],
              'icon-size': 0.85,
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
        }
      } catch (err) {
        console.warn('Prevented Mapbox style load race condition:', err);
        return;
      }

      // Hover & Click interaction listeners on WebGL Native Symbol layer
      const onMouseEnter = () => {
        if (map.getCanvas()) map.getCanvas().style.cursor = 'pointer';
      };
      const onMouseLeave = () => {
        if (map.getCanvas()) map.getCanvas().style.cursor = '';
      };

      const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const vId = feat.properties?.id;
        const v = vehicles.find((item) => item.vehicle_id === vId);

        if (v) {
          setSelectedVehicle({
            vehicle: v,
            x: e.point.x,
            y: e.point.y,
            currentPos: feat.geometry.type === 'Point' ? (feat.geometry.coordinates as [number, number]) : [98.67, 3.58],
            bearing: feat.properties?.bearing || 0,
          });
        }
      };

      if (map.getLayer(layerId)) {
        map.off('mouseenter', layerId, onMouseEnter);
        map.off('mouseleave', layerId, onMouseLeave);
        map.off('click', layerId, onClick);

        map.on('mouseenter', layerId, onMouseEnter);
        map.on('mouseleave', layerId, onMouseLeave);
        map.on('click', layerId, onClick);
      }

      // Initial progress setup
      vehicles.forEach((v) => {
        if (progressMapRef.current[v.vehicle_id] === undefined) {
          progressMapRef.current[v.vehicle_id] = v.progress ?? 0.35;
        }
      });

      // 60 FPS requestAnimationFrame Loop
      const animate = (now: number) => {
        if (isCancelled || !map || !map.isStyleLoaded()) return;

        const deltaSec = Math.min((now - lastTimeRef.current) / 1000, 0.1);
        lastTimeRef.current = now;

        const pointFeatures = vehicles.map((v) => {
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

          // Speed-based progress increments
          const baseSpeed = v.speed_kmh || 60;
          const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * 0.05;

          let currentProgress = (progressMapRef.current[v.vehicle_id] ?? 0.35) + increment;
          if (currentProgress > 1.0) currentProgress = 0.0;
          progressMapRef.current[v.vehicle_id] = currentProgress;

          // Calculate exact route-bound position & bearing
          const state = calculateRouteProgressPosition(coords, currentProgress);

          const iconName = v.modality === 'maritime' ? 'vessel-icon' : v.modality === 'air' ? 'plane-icon' : 'truck-icon';

          return {
            type: 'Feature' as const,
            properties: {
              id: v.vehicle_id,
              name: v.name,
              modality: v.modality,
              icon: iconName,
              bearing: state.bearing,
              progressPct: Math.round(state.progress * 100),
              speed_kmh: v.speed_kmh,
              status: v.status,
              cargo: v.cargo || 'Kargo Logistik',
              origin: v.origin || 'Asal',
              destination: v.destination || 'Tujuan',
            },
            geometry: {
              type: 'Point' as const,
              coordinates: state.currentPosition,
            },
          };
        });

        const pointGeoJson = {
          type: 'FeatureCollection' as const,
          features: pointFeatures,
        };

        try {
          const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
          if (source) {
            source.setData(pointGeoJson);
          }
        } catch {
          // Ignore transient style reloading frames
        }

        animRef.current = requestAnimationFrame(animate);
      };

      lastTimeRef.current = performance.now();
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(animate);
    };

    if (map.isStyleLoaded()) {
      initFleetLayers();
    } else {
      map.once('style.load', initFleetLayers);
      map.once('load', initFleetLayers);
    }

    return () => {
      isCancelled = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      map.off('style.load', initFleetLayers);
      map.off('load', initFleetLayers);
    };
  }, [map, vehicles, activeRoutes, activeRouteIdx]);

  if (!selectedVehicle) return null;

  const { vehicle, x, y } = selectedVehicle;

  return (
    <div
      className="absolute z-50 transform -translate-x-1/2 -translate-y-full mb-3 pointer-events-auto"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="bg-slate-950/90 border border-cyan-500/40 rounded-xl p-3.5 shadow-2xl backdrop-blur-xl min-w-[240px] text-xs font-mono text-slate-100">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-cyan-400">
              {vehicle.modality === 'truck' ? <Truck className="w-4 h-4 text-cyan-400" /> : vehicle.modality === 'maritime' ? <Anchor className="w-4 h-4 text-amber-400" /> : <Plane className="w-4 h-4 text-purple-400" />}
            </span>
            <span className="font-bold text-cyan-300 tracking-wide">{vehicle.vehicle_id}</span>
          </div>
          <button
            onClick={() => setSelectedVehicle(null)}
            className="cursor-pointer text-slate-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors"
            title="Tutup Tooltip"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-400">Armada:</span>
            <span className="font-semibold text-slate-200">{vehicle.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Kecepatan:</span>
            <span className="font-bold text-emerald-400">{vehicle.speed_kmh} km/h</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Status Rute:</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              {vehicle.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Muatan Kargo:</span>
            <span className="text-amber-300 font-semibold">{vehicle.cargo || 'Logistik Pangan'}</span>
          </div>
          <div className="border-t border-slate-800/80 pt-1.5 text-[10px] text-slate-300 flex justify-between">
            <span>{vehicle.origin}</span>
            <span>➔</span>
            <span>{vehicle.destination}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
