'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FleetVehicle } from '@/lib/types';
import { calculateRouteProgressPosition } from '@/lib/geoUtils';
import { getHaversineDistanceKm } from '@/lib/aiDynamicRouter';
import { corridorSnappingService } from '@/lib/corridorSnappingService';
import { getVehicleFix } from '@/lib/fleetScope';
import { FLEET_DOTS_PAINT, MODALITY_COLOR } from '@/lib/mapDataPaint';
import { api } from '@/lib/api';
import { TargetLockReticle } from './TargetLockReticle';
import {
  Truck,
  Anchor,
  Plane,
  X,
  Navigation,
  Video,
  Crosshair,
  Thermometer,
} from 'lucide-react';

export interface FleetVehicleLayerProps {
  map: mapboxgl.Map | null;
  vehicles: FleetVehicle[];
  activeRoutes?: import('@/lib/types').RouteRecommendation[];
  activeRouteIdx?: number | null;
  modalityFilter?: 'all' | 'truck' | 'maritime' | 'air';
  simSpeed?: number;
  onSelectVehicle?: (vehicle: FleetVehicle) => void;
  selectedVehicleId?: string | null;
  onCloseVehicle?: () => void;
  /**
   * Dispatcher tenant view: suppress ambient ROUTE_ESTIMATED corridor projections
   * (orange lines / amber pulse rings) unless that unit is explicitly selected
   * for inspection. Default: true.
   */
  hideEstimatedRoutes?: boolean;
}

interface DeadReckonState {
  currentPos: [number, number];
  baseLocation: [number, number];
  lastTimestamp: number;
}

interface HoveredVehicleInfo {
  vehicle: FleetVehicle;
  screenPos: { x: number; y: number };
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
 * Great-Circle Dead-Reckoning Extrapolation (motionModel).
 * Extrapolates [lon, lat] forward in time based on speed_kmh and bearingDeg.
 */
function deadReckonPosition(
  start: [number, number],
  bearingDeg: number,
  distanceKm: number
): [number, number] {
  const [lon1, lat1] = start;
  const R = 6371.0;
  const d = distanceKm / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const phi1 = (lat1 * Math.PI) / 180;
  const lambda1 = (lon1 * Math.PI) / 180;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(d) +
    Math.cos(phi1) * Math.sin(d) * Math.cos(brng)
  );
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(phi1),
    Math.cos(d) - Math.sin(phi1) * Math.sin(phi2)
  );

  const lon2 = ((lambda2 * 180) / Math.PI + 540) % 360 - 180;
  const lat2 = (phi2 * 180) / Math.PI;

  return [lon2, lat2];
}

export function FleetVehicleLayer({
  map,
  vehicles,
  activeRoutes,
  activeRouteIdx,
  modalityFilter = 'all',
  simSpeed = 1.0,
  onSelectVehicle,
  selectedVehicleId = null,
  onCloseVehicle,
  hideEstimatedRoutes = true,
}: FleetVehicleLayerProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<{
    vehicle: FleetVehicle;
    currentPos: [number, number];
    bearing: number;
  } | null>(null);

  const [hoveredVehicle, setHoveredVehicle] = useState<HoveredVehicleInfo | null>(null);
  const [isFollowCamActive, setIsFollowCamActive] = useState(false);

  const vehiclesRef = useRef<FleetVehicle[]>(vehicles);
  vehiclesRef.current = vehicles;

  const selectedVehicleIdRef = useRef<string | null>(selectedVehicleId);
  const isFollowCamActiveRef = useRef(isFollowCamActive);
  isFollowCamActiveRef.current = isFollowCamActive;

  const onSelectVehicleRef = useRef(onSelectVehicle);
  onSelectVehicleRef.current = onSelectVehicle;

  const onCloseVehicleRef = useRef(onCloseVehicle);
  onCloseVehicleRef.current = onCloseVehicle;

  const progressMapRef = useRef<Record<string, number>>({});
  const deadReckonMapRef = useRef<Record<string, DeadReckonState>>({});

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const lastPopupSyncRef = useRef<number>(0);
  const selectedPosRef = useRef<[number, number] | null>(null);
  const lastRouteKeyRef = useRef<string>('');
  const wasEmptyRef = useRef<boolean>(false);

  // Handle vehicle selection
  const handleVehicleSelect = useCallback(
    (v: FleetVehicle, currentPos: [number, number], bearing: number) => {
      selectedVehicleIdRef.current = v.vehicle_id;
      setSelectedVehicle({
        vehicle: v,
        currentPos,
        bearing,
      });
      onSelectVehicleRef.current?.(v);

      if (map) {
        try {
          const routeSource = map.getSource('fleet-selected-route-source') as mapboxgl.GeoJSONSource | undefined;
          let coords = (
            v.route_geometry?.coordinates ||
            (v as any).route_coordinates ||
            corridorSnappingService.getCorridorCoordinates(v.vehicle_id) ||
            (Array.isArray((v as any).waypoints)
              ? (v as any).waypoints.map((w: any) => (Array.isArray(w) ? [w[0], w[1]] : [w.lon ?? w.lng ?? 0, w.lat ?? 0]))
              : null) ||
            v.path ||
            []
          ) as [number, number][];

          if (routeSource) {
            routeSource.setData({
              type: 'FeatureCollection',
              features: coords.length >= 2 ? [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: coords,
                  },
                  properties: {},
                }
              ] : [],
            });
          }

          // If coordinates are missing (lean telemetry mode or custom un-cached asset), fetch on demand
          if (coords.length < 2 && v.vehicle_id) {
            api.fleet.vehicleGeometry(v.vehicle_id).then((res) => {
              if (!res) return;
              const fetchedCoords = (res.route_geometry?.coordinates || res.path) as [number, number][];
              if (Array.isArray(fetchedCoords) && fetchedCoords.length >= 2) {
                corridorSnappingService.setCorridorCoordinates(v.vehicle_id, fetchedCoords);
                if (selectedVehicleIdRef.current === v.vehicle_id && map) {
                  try {
                    const currentRouteSource = map.getSource('fleet-selected-route-source') as mapboxgl.GeoJSONSource | undefined;
                    if (currentRouteSource) {
                      currentRouteSource.setData({
                        type: 'FeatureCollection',
                        features: [
                          {
                            type: 'Feature',
                            geometry: {
                              type: 'LineString',
                              coordinates: fetchedCoords,
                            },
                            properties: {},
                          },
                        ],
                      });
                    }
                  } catch {}
                }
              }
            }).catch(() => {});
          }
        } catch {}
      }
    },
    [map]
  );

  const handleVehicleSelectRef = useRef(handleVehicleSelect);
  handleVehicleSelectRef.current = handleVehicleSelect;

  // Dismiss selection
  const handleDismissSelection = useCallback(() => {
    selectedVehicleIdRef.current = null;
    setSelectedVehicle(null);
    setIsFollowCamActive(false);
    isFollowCamActiveRef.current = false;
    onCloseVehicleRef.current?.();

    if (map) {
      try {
        const routeSource = map.getSource('fleet-selected-route-source') as mapboxgl.GeoJSONSource | undefined;
        if (routeSource) {
          routeSource.setData({
            type: 'FeatureCollection',
            features: [],
          });
        }
      } catch {}
    }
  }, [map]);

  // Preload precomputed high-density snapped corridors on mount
  useEffect(() => {
    corridorSnappingService.loadCorridors().catch(() => {});
  }, []);

  // Synchronize when selectedVehicleId prop changes externally
  useEffect(() => {
    if (selectedVehicleId === selectedVehicleIdRef.current) return;
    selectedVehicleIdRef.current = selectedVehicleId ?? null;

    if (!selectedVehicleId) {
      setSelectedVehicle(null);
      setIsFollowCamActive(false);
      isFollowCamActiveRef.current = false;
      if (map) {
        try {
          const routeSource = map.getSource('fleet-selected-route-source') as mapboxgl.GeoJSONSource | undefined;
          if (routeSource) {
            routeSource.setData({ type: 'FeatureCollection', features: [] });
          }
        } catch {}
      }
    } else {
      const found = vehicles.find((v) => v.vehicle_id === selectedVehicleId);
      if (found) {
        // No server fix => no map focus. A missing GPS must never be papered
        // over with a hardcoded city coordinate.
        const pos = getVehicleFix(found);
        if (pos) handleVehicleSelect(found, pos, found.heading_deg ?? 0);
      }
    }
  }, [selectedVehicleId, vehicles, map, handleVehicleSelect]);

  // Register Native Mapbox WebGL sources and layers safely
  const setupSourcesAndLayers = useCallback(() => {
    if (!map || !map.isStyleLoaded()) return;
    try {
      // 1. fleet-vehicles-source
      if (!map.getSource('fleet-vehicles-source')) {
        map.addSource('fleet-vehicles-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // 2. fleet-selected-route-source
      if (!map.getSource('fleet-selected-route-source')) {
        map.addSource('fleet-selected-route-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // 3. fleet-selected-route-line: high-contrast route for selected vehicle only
      if (!map.getLayer('fleet-selected-route-line')) {
        map.addLayer({
          id: 'fleet-selected-route-line',
          type: 'line',
          source: 'fleet-selected-route-source',
          minzoom: 4.0,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#38b8f8',
            'line-width': 2.5,
            'line-dasharray': [2, 1],
            'line-opacity': 0.85,
          },
        });
      }

      // 4. fleet-vehicle-selected-halo: aura visible strictly for selected or emergency/rerouting units
      if (!map.getLayer('fleet-vehicle-selected-halo')) {
        map.addLayer({
          id: 'fleet-vehicle-selected-halo',
          type: 'circle',
          source: 'fleet-vehicles-source',
          minzoom: 4.0,
          filter: ['any', ['==', ['get', 'isSelected'], true], ['==', ['get', 'isImpacted'], true]],
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 11,
              8, 15,
              14, 20,
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'isSelected'], true], 'rgba(56, 184, 248, 0.22)',
              'rgba(245, 158, 11, 0.22)',
            ],
            'circle-stroke-color': [
              'case',
              ['==', ['get', 'isSelected'], true], 'rgba(56, 184, 248, 0.85)',
              'rgba(245, 158, 11, 0.85)',
            ],
            'circle-stroke-width': 1.5,
          },
        });
      }

      // 5. fleet-vehicle-dots: crisp tactical dots on 3D globe surface with smooth zoom LOD dissolve
      if (!map.getLayer('fleet-vehicle-dots')) {
        map.addLayer({
          id: 'fleet-vehicle-dots',
          type: 'circle',
          source: 'fleet-vehicles-source',
          // Paint lives in lib/mapDataPaint.ts so scripts/test_fleet_paint.ts can
          // prove every expression parses in Node. A layer whose paint Mapbox
          // rejects never gets added — silently, behind this try/catch.
          paint: FLEET_DOTS_PAINT as unknown as mapboxgl.CircleLayerSpecification['paint'],
        });
      }
    } catch (err) {
      console.error('Failed to setup Mapbox fleet sources and layers:', err);
    }
  }, [map]);

  // Setup layer lifecycle and mouse interactions (stable across renders)
  useEffect(() => {
    if (!map) return;

    setupSourcesAndLayers();
    map.on('load', setupSourcesAndLayers);
    map.on('style.load', setupSourcesAndLayers);

    const onMouseEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      if (!e.features || e.features.length === 0) return;
      const vehicleId = e.features[0].properties?.vehicle_id;
      const found = vehiclesRef.current?.find((v) => v.vehicle_id === vehicleId);
      if (found) {
        setHoveredVehicle({
          vehicle: found,
          screenPos: {
            x: e.originalEvent ? e.originalEvent.clientX : e.point.x,
            y: e.originalEvent ? e.originalEvent.clientY : e.point.y,
          },
        });
      }
    };

    const onMouseMove = (e: mapboxgl.MapLayerMouseEvent) => {
      setHoveredVehicle((prev) =>
        prev
          ? {
              ...prev,
              screenPos: {
                x: e.originalEvent ? e.originalEvent.clientX : e.point.x,
                y: e.originalEvent ? e.originalEvent.clientY : e.point.y,
              },
            }
          : null
      );
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      setHoveredVehicle(null);
    };

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const vehicleId = feat.properties?.vehicle_id;
      const found = vehiclesRef.current?.find((v) => v.vehicle_id === vehicleId);
      if (found) {
        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        const heading = feat.properties?.heading || 0;
        handleVehicleSelectRef.current?.(found, coords, heading);
      }
    };

    map.on('mouseenter', 'fleet-vehicle-dots', onMouseEnter);
    map.on('mousemove', 'fleet-vehicle-dots', onMouseMove);
    map.on('mouseleave', 'fleet-vehicle-dots', onMouseLeave);
    map.on('click', 'fleet-vehicle-dots', onClick);

    return () => {
      map.off('load', setupSourcesAndLayers);
      map.off('style.load', setupSourcesAndLayers);
      map.off('mouseenter', 'fleet-vehicle-dots', onMouseEnter);
      map.off('mousemove', 'fleet-vehicle-dots', onMouseMove);
      map.off('mouseleave', 'fleet-vehicle-dots', onMouseLeave);
      map.off('click', 'fleet-vehicle-dots', onClick);

      try {
        if (map.getLayer('fleet-vehicle-dots')) map.removeLayer('fleet-vehicle-dots');
        if (map.getLayer('fleet-vehicle-selected-halo')) map.removeLayer('fleet-vehicle-selected-halo');
        if (map.getLayer('fleet-selected-route-line')) map.removeLayer('fleet-selected-route-line');
        if (map.getSource('fleet-vehicles-source')) map.removeSource('fleet-vehicles-source');
        if (map.getSource('fleet-selected-route-source')) map.removeSource('fleet-selected-route-source');
      } catch {}
    };
  }, [map, setupSourcesAndLayers]);

  // 60 FPS Kinematics interpolation and in-place GeoJSON buffer update loop
  useEffect(() => {
    if (!map) return;

    let isCancelled = false;
    lastTimeRef.current = performance.now();

    const animate = (now: number) => {
      if (isCancelled || !map) return;

      if (!map.isStyleLoaded()) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      let fleetSource = map.getSource('fleet-vehicles-source') as mapboxgl.GeoJSONSource | undefined;
      if (!fleetSource) {
        setupSourcesAndLayers();
        fleetSource = map.getSource('fleet-vehicles-source') as mapboxgl.GeoJSONSource | undefined;
        if (!fleetSource) {
          animRef.current = requestAnimationFrame(animate);
          return;
        }
      }

      const elapsedMs = now - lastTimeRef.current;
      if (elapsedMs < 14) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaSec = Math.min(elapsedMs / 1000, 0.1);
      lastTimeRef.current = now;

      const currentVehicles = vehiclesRef.current || [];
      const visibleVehicles = currentVehicles.filter((v) => {
        if (!modalityFilter || modalityFilter === 'all') {
          // all
        } else if (v.modality !== modalityFilter) {
          return false;
        }
        return true;
      });

      if (visibleVehicles.length === 0) {
        if (!wasEmptyRef.current) {
          fleetSource.setData({ type: 'FeatureCollection', features: [] });
          wasEmptyRef.current = true;
        }
        if (lastRouteKeyRef.current !== '') {
          const routeSource = map.getSource('fleet-selected-route-source') as mapboxgl.GeoJSONSource | undefined;
          if (routeSource) {
            routeSource.setData({ type: 'FeatureCollection', features: [] });
          }
          lastRouteKeyRef.current = '';
        }
        animRef.current = requestAnimationFrame(animate);
        return;
      }
      wasEmptyRef.current = false;

      visibleVehicles.forEach((v) => {
        if (progressMapRef.current[v.vehicle_id] === undefined) {
          progressMapRef.current[v.vehicle_id] = v.progress ?? 0.35;
        }
      });

      const simSpeedMultiplier = typeof simSpeed === 'number' && simSpeed > 0 ? simSpeed : 1.0;
      const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
      let activeSelectedCoords: [number, number][] | null = null;

      for (let i = 0; i < visibleVehicles.length; i++) {
        const v = visibleVehicles[i];
        let coords = (
          v.route_geometry?.coordinates ||
          (v as any).route_coordinates ||
          corridorSnappingService.getCorridorCoordinates(v.vehicle_id) ||
          (Array.isArray((v as any).waypoints)
            ? (v as any).waypoints.map((w: any) => (Array.isArray(w) ? [w[0], w[1]] : [w.lon ?? w.lng ?? 0, w.lat ?? 0]))
            : null) ||
          v.path ||
          []
        ) as [number, number][];

        if (v.status === 'rerouting' && v.route_geometry?.coordinates && v.route_geometry.coordinates.length > 1) {
          coords = v.route_geometry.coordinates as [number, number][];
        } else if (
          v.vehicle_id === 'TRK-003-BELAWAN-TEBING' &&
          activeRoutes &&
          activeRoutes.length > 0
        ) {
          const selRoute = activeRoutes[activeRouteIdx ?? 0] || activeRoutes[0];
          if (selRoute && selRoute.waypoints && selRoute.waypoints.length > 1) {
            coords = selRoute.waypoints.map((w: any) => (Array.isArray(w) ? [w[0], w[1]] : [w.lon ?? w.lng ?? 0, w.lat ?? 0]));
          }
        }

        const isSelected = selectedVehicleIdRef.current === v.vehicle_id;
        const isImpacted = v.status === 'rerouting' || Boolean((v as any).status === 'delayed') || Boolean((v as any).impacted);

        if (isSelected && coords.length >= 2) {
          activeSelectedCoords = coords;
        }

        let finalPos: [number, number];
        let finalBearing: number;

        // Server fix only. `coords` is a route corridor, not a position: a unit
        // without a ping must not be drawn at a fabricated point.
        const serverFix = getVehicleFix(v);

        const isLandTruck = v.modality === 'truck' || (v.modality as string) === 'land';

        if (isLandTruck) {
          if (coords.length >= 2) {
            const baseSpeed = v.speed_kmh || 60;
            const totalDistanceKm = calculatePathDistanceKm(coords);
            const simScale = 8.0 * simSpeedMultiplier;
            const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * (simScale / totalDistanceKm);

            const prevProg = progressMapRef.current[v.vehicle_id] ?? (v.progress ?? 0.35);
            let currentProgress = prevProg + increment;
            if (currentProgress > 1.0) {
              currentProgress = 0.0;
            }
            progressMapRef.current[v.vehicle_id] = currentProgress;

            const state = calculateRouteProgressPosition(coords, currentProgress);
            finalPos = state.currentPosition;
            finalBearing = state.bearing;
          } else if (serverFix) {
            finalPos = serverFix;
            finalBearing = v.heading_deg ?? (v as any).bearing ?? 0;
          } else {
            // No corridor and no fix: not plottable. Skip the feature entirely.
            continue;
          }
        } else {
          const hasSurveyedCorridor = coords.length >= 2 && calculatePathDistanceKm(coords) >= 15;
          if (v.modality === 'maritime' && hasSurveyedCorridor) {
            const baseSpeed = (v.sog_knots ? v.sog_knots * 1.852 : v.speed_kmh) || 22;
            const totalDistanceKm = calculatePathDistanceKm(coords);
            const simScale = 4.0 * simSpeedMultiplier;
            const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * (simScale / totalDistanceKm);

            const prevProg = progressMapRef.current[v.vehicle_id] ?? (v.progress ?? 0.35);
            let currentProgress = prevProg + increment;
            if (currentProgress > 1.0) {
              currentProgress = 0.0;
            }
            progressMapRef.current[v.vehicle_id] = currentProgress;

            const state = calculateRouteProgressPosition(coords, currentProgress);
            finalPos = state.currentPosition;
            finalBearing = state.bearing;
          } else if (!serverFix) {
            // Non-corridor unit without a ping: no position exists to draw.
            continue;
          } else {
            let drState = deadReckonMapRef.current[v.vehicle_id];
            if (!drState) {
              drState = {
                currentPos: [serverFix[0], serverFix[1]],
                baseLocation: [serverFix[0], serverFix[1]],
                lastTimestamp: now,
              };
              deadReckonMapRef.current[v.vehicle_id] = drState;
            } else {
              const driftKm = getHaversineDistanceKm(drState.currentPos, serverFix);
              if (driftKm > 15) {
                drState.currentPos[0] += (serverFix[0] - drState.currentPos[0]) * 0.25;
                drState.currentPos[1] += (serverFix[1] - drState.currentPos[1]) * 0.25;
                drState.baseLocation = [serverFix[0], serverFix[1]];
              } else if (driftKm > 0.8) {
                drState.currentPos[0] += (serverFix[0] - drState.currentPos[0]) * 0.06;
                drState.currentPos[1] += (serverFix[1] - drState.currentPos[1]) * 0.06;
              }
            }

            const isAnchored = v.status === 'anchored' || (v.modality === 'maritime' && (v.sog_knots || 0) < 0.2);
            const effectiveSpeedKmh = isAnchored
              ? 0
              : v.sog_knots
                ? v.sog_knots * 1.852
                : v.ground_speed_kts
                  ? v.ground_speed_kts * 1.852
                  : (v.speed_kmh || (v.modality === 'air' ? 520 : 25));

            const effectiveBearing = v.cog_deg ?? v.heading_deg ?? (v as any).bearing ?? 0;
            finalBearing = effectiveBearing;

            if (effectiveSpeedKmh > 0) {
              const speedScale = v.modality === 'air' ? 2.5 : 4.0;
              const distKm = (effectiveSpeedKmh / 3600) * deltaSec * simSpeedMultiplier * speedScale;
              finalPos = deadReckonPosition(drState.currentPos, effectiveBearing, distKm);

              finalPos[0] = Math.max(94.0, Math.min(109.0, finalPos[0]));
              finalPos[1] = Math.max(-7.0, Math.min(7.0, finalPos[1]));

              drState.currentPos = finalPos;
            } else {
              finalPos = drState.currentPos;
            }
          }
        }

        features.push({
          type: 'Feature',
          id: v.vehicle_id,
          geometry: {
            type: 'Point',
            coordinates: finalPos,
          },
          properties: {
            vehicle_id: v.vehicle_id,
            name: v.name || v.vehicle_id,
            modality: v.modality,
            speed_kmh: Math.round(v.speed_kmh || 0),
            heading: Math.round(finalBearing),
            isSelected,
            isImpacted,
            status: v.status || 'active',
            tracking_mode: v.tracking_mode,
            cargo: v.cargo || '',
          },
        });

        if (isSelected) {
          selectedPosRef.current = finalPos;
          if (now - lastPopupSyncRef.current >= 250) {
            lastPopupSyncRef.current = now;
            setSelectedVehicle((prev) => {
              if (!prev || prev.vehicle.vehicle_id !== v.vehicle_id) return prev;
              return {
                ...prev,
                currentPos: finalPos,
                bearing: finalBearing,
              };
            });
          }

          if (isFollowCamActiveRef.current) {
            map.easeTo({
              center: finalPos,
              duration: 100,
              easing: (t) => t,
            });
          }
        }
      }

      fleetSource.setData({
        type: 'FeatureCollection',
        features,
      });

      // Deduplicated route line update: only tessellate when selected route changes
      const routeKey = activeSelectedCoords
        ? `${selectedVehicleIdRef.current}_${activeSelectedCoords.length}_${activeSelectedCoords[0][0]}_${activeSelectedCoords[activeSelectedCoords.length - 1][0]}`
        : '';
      if (routeKey !== lastRouteKeyRef.current) {
        lastRouteKeyRef.current = routeKey;
        const routeSource = map.getSource('fleet-selected-route-source') as mapboxgl.GeoJSONSource | undefined;
        if (routeSource) {
          routeSource.setData({
            type: 'FeatureCollection',
            features: activeSelectedCoords
              ? [
                  {
                    type: 'Feature',
                    geometry: {
                      type: 'LineString',
                      coordinates: activeSelectedCoords,
                    },
                    properties: {},
                  },
                ]
              : [],
          });
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      isCancelled = true;
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [map, activeRoutes, activeRouteIdx, modalityFilter, simSpeed, hideEstimatedRoutes, setupSourcesAndLayers]);

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

  const isEstimated = vehicle?.tracking_mode === 'ROUTE_ESTIMATED';
 const isImpactedUnit = vehicle
 ? vehicle.status === 'rerouting' ||
 (vehicle as unknown as { status?: string }).status === 'delayed' ||
 Boolean((vehicle as unknown as { impacted?: boolean }).impacted)
 : false;
 const statusLabel = isImpactedUnit ? 'Terganggu' : '';

  return (
    <>
      {/* Tactical Screen-Space Target Reticle Overlay */}
      {selectedVehicle && (
        <TargetLockReticle
          map={map}
          targetLngLat={selectedVehicle.currentPos}
          currentPosRef={selectedPosRef}
          callsign={selectedVehicle.vehicle.name || selectedVehicle.vehicle.vehicle_id}
          onDismiss={handleDismissSelection}
        />
      )}

      {/* Impeccable Hover Micro-Tooltip */}
      {hoveredVehicle && !selectedVehicle && (
        <div
          className="fixed pointer-events-none z-50 bg-[#0c1017] border border-white/10 px-2.5 py-1.5 rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.4)] text-[#e8eaed] font-sans"
          style={{
            left: Math.min(
              hoveredVehicle.screenPos.x + 12,
              typeof window !== 'undefined' ? window.innerWidth - 240 : 600
            ),
            top: Math.max(12, hoveredVehicle.screenPos.y - 12),
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: MODALITY_COLOR[hoveredVehicle.vehicle.modality || 'truck'] ?? '#e2e8f0' }}
            />
            <span className="text-xs font-semibold text-white">
              {hoveredVehicle.vehicle.name || hoveredVehicle.vehicle.vehicle_id}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-[rgba(232,234,237,0.62)] font-mono tabular-nums">
            <span>{hoveredVehicle.vehicle.speed_kmh || 0} km/j</span>
            {hoveredVehicle.vehicle.cargo && (
              <>
                <span className="text-[rgba(232,234,237,0.38)]">·</span>
                <span className="text-[rgba(232,234,237,0.62)] truncate max-w-[160px]">{hoveredVehicle.vehicle.cargo}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Telemetry Inspector Console — Docked in Right Tactical Inspector Slot */}
      {selectedVehicle && (
 <div className="absolute top-16 right-3 bottom-4 z-40 w-[calc(100vw-1.5rem)] sm:w-[390px] bg-[#0c1017] border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.4)] rounded-lg p-4 text-[#e8eaed] duration-300 pointer-events-auto space-y-3 font-sans overflow-y-auto no-scrollbar">
          {/* Header Bar */}
 <div className="flex items-start justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg border ${
                  isEstimated
                    ? 'bg-white/[0.06] text-[rgba(232,234,237,0.62)] border-white/10'
                    : 'bg-[#121822] text-[#e8eaed] border-white/10'
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
 <span className="text-xs font-mono tabular-nums text-[rgba(232,234,237,0.62)]">
                    {transponderId}
                  </span>
                  <span className="text-[rgba(232,234,237,0.38)]">·</span>
 {statusLabel ? (
 <span className="flex items-center gap-1.5 text-xs text-[rgba(232,234,237,0.62)]">
 <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                    <span>{statusLabel}</span>
                  </span>
 ) : null}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismissSelection}
 className="cursor-pointer p-1 rounded-md bg-transparent text-[rgba(232,234,237,0.62)] hover:text-white border border-white/10 transition"
              title="Tutup Inspeksi Armada"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Kinematics Grid */}
 <div className="py-3 border-t border-white/10 space-y-2.5">
 <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
              <div>
 <span className="text-xs font-medium text-[rgba(232,234,237,0.62)] flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-[rgba(232,234,237,0.62)]" />
                  <span>Kecepatan Telemetri</span>
                </span>
                <span className="text-xl font-semibold text-white font-mono tabular-nums leading-none tracking-tight mt-1 inline-block">
                  {isMaritime
                    ? `${(selectedVehicle.vehicle.sog_knots ?? (selectedVehicle.vehicle.speed_kmh / 1.852)).toFixed(1)} kts`
                    : isAir
                      ? `${(selectedVehicle.vehicle.ground_speed_kts ?? (selectedVehicle.vehicle.speed_kmh / 1.852)).toFixed(0)} kts`
                      : `${selectedVehicle.vehicle.speed_kmh} km/j`}
                </span>
                <span className="text-xs font-mono tabular-nums text-[rgba(232,234,237,0.62)] ml-1.5">
                  ({selectedVehicle.vehicle.speed_kmh} km/j)
                </span>
              </div>

              <div className="text-right">
 <span className="text-xs font-medium text-[rgba(232,234,237,0.62)] block">
                  Heading
                </span>
                <span className="text-xs font-mono tabular-nums text-[#e8eaed] mt-1 inline-block">
                  {Math.round(selectedVehicle.bearing)}° {getCardinalDirection(selectedVehicle.bearing)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
              <div>
                <span className="text-[rgba(232,234,237,0.62)] block">
                  {isMaritime ? 'Draught Kapal:' : isAir ? 'Ketinggian ADS-B:' : 'Elevasi Radar:'}
                </span>
                <span className="text-[#e8eaed] font-mono tabular-nums font-medium">
                  {isMaritime
                    ? `${selectedVehicle.vehicle.draught_m ?? 7.2} m`
                    : isAir
                      ? `${(selectedVehicle.vehicle.altitude_ft ?? 28000).toLocaleString()} ft`
                      : '45 m dpl'}
                </span>
              </div>
              <div>
                <span className="text-[rgba(232,234,237,0.62)] block">Koordinat:</span>
                <span className="text-[rgba(232,234,237,0.62)] font-mono tabular-nums">
                  {selectedVehicle.currentPos[1].toFixed(3)}°N, {selectedVehicle.currentPos[0].toFixed(3)}°E
                </span>
              </div>
            </div>
          </div>

          {/* Strategic Cargo & Cold-Chain */}
 <div className="py-3 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[rgba(232,234,237,0.62)]">Muatan Logistik:</span>
              {(isTruck || vehicle?.temperature_c !== undefined) && (
                <div
                  className={`px-2 py-0.5 rounded border text-xs font-mono flex items-center gap-1 ${
                    temp <= 4.0
                      ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'
                      : 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30'
                  }`}
                >
                  <Thermometer className="w-3 h-3" />
                  <span>
                    {temp.toFixed(1)}°C {temp <= 4.0 ? 'Normal' : 'Peringatan'}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-[#e8eaed] font-medium">
              {selectedVehicle.vehicle.cargo || 'Logistik Pangan Nasional'}
            </p>
          </div>

          {/* Route & Signal Freshness */}
 <div className="py-3 border-t border-white/10 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[rgba(232,234,237,0.62)]">Koridor Rute:</span>
              <span className="text-[#e8eaed] font-medium truncate max-w-[200px]">
                {selectedVehicle.vehicle.origin || 'Asal'} → {selectedVehicle.vehicle.destination || 'Tujuan'}
              </span>
            </div>
 <div className="flex items-center justify-between text-[rgba(232,234,237,0.62)] pt-1.5 border-t border-white/10">
              <span className="flex items-center gap-1.5">
 <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]"></span>
                <span>Latensi Telemetri:</span>
              </span>
              <span className="text-[rgba(232,234,237,0.62)] font-mono tabular-nums">
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
 : 'bg-transparent text-[#e8eaed] hover:text-white hover:bg-white/5 border-white/10'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>{isFollowCamActive ? 'Kamera Pengikut Aktif' : 'Aktifkan Kamera Pengikut'}</span>
            </button>

            <button
              type="button"
              onClick={handleDismissSelection}
              className="w-full py-1 text-xs text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed] flex items-center justify-center gap-1.5 cursor-pointer transition"
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
