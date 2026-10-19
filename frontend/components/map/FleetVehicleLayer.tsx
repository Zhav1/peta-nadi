'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer, ScatterplotLayer, IconLayer, TextLayer } from '@deck.gl/layers';
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
import {
  defaultSpatialHashArbiter,
  arbitrateVisibleLabels,
  arbitrateMacroZoomLabels,
  PRIORITY_SELECTED_ROUTE,
  PRIORITY_IMPACTED_FLEET,
  PRIORITY_AIRCRAFT_CALLSIGN,
  PRIORITY_MAJOR_VESSEL,
  PRIORITY_FLEET_CALLSIGN,
  type DeclutterItem,
} from '@/lib/spatialHashArbiter';

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
}

interface DeadReckonState {
  currentPos: [number, number];
  baseLocation: [number, number];
  lastTimestamp: number;
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

/**
 * Pre-rendered 384x64 high-DPI canvas icon atlas for GPU-instanced Deck.gl IconLayer.
 * Contains 6 slots (64x64):
 * 0: Truck normal (#34d399)
 * 1: Maritime normal (#38bdf8)
 * 2: Air normal (#c084fc)
 * 3: Truck selected (#00f0ff)
 * 4: Maritime selected (#00f0ff)
 * 5: Air selected (#00f0ff)
 */
let cachedAtlasDataUrl: string | null = null;

function getVehicleAtlasDataUrl(): string {
  if (cachedAtlasDataUrl) return cachedAtlasDataUrl;
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const drawSlot = (
    slotIdx: number,
    type: 'truck' | 'maritime' | 'air',
    colorHex: string,
    isSelected: boolean
  ) => {
    const ox = slotIdx * 64;
    const cx = ox + 32;
    const cy = 32;

    ctx.save();
    // Tactical disc background
    ctx.beginPath();
    ctx.arc(cx, cy, 27, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#081420' : '#0c0e12';
    ctx.fill();

    ctx.lineWidth = isSelected ? 3.5 : 2.5;
    ctx.strokeStyle = colorHex;
    ctx.stroke();

    if (isSelected) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Forward indicator pip at top (north / 0 deg)
    ctx.beginPath();
    ctx.arc(cx, 8, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.fill();

    // Vector silhouette
    ctx.fillStyle = colorHex;
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'maritime') {
      ctx.beginPath();
      ctx.moveTo(cx, 16);
      ctx.lineTo(cx, 44);
      ctx.moveTo(ox + 20, 28);
      ctx.lineTo(ox + 44, 28);
      ctx.moveTo(ox + 18, 38);
      ctx.quadraticCurveTo(cx, 48, ox + 46, 38);
      ctx.stroke();
    } else if (type === 'air') {
      ctx.beginPath();
      ctx.moveTo(cx, 14);
      ctx.lineTo(ox + 46, 42);
      ctx.lineTo(cx, 36);
      ctx.lineTo(ox + 18, 42);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.strokeRect(ox + 18, 20, 28, 24);
      ctx.fillRect(ox + 22, 24, 20, 8);
      ctx.beginPath();
      ctx.arc(ox + 24, 46, 3, 0, Math.PI * 2);
      ctx.arc(ox + 40, 46, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  drawSlot(0, 'truck', '#34d399', false);
  drawSlot(1, 'maritime', '#38bdf8', false);
  drawSlot(2, 'air', '#c084fc', false);
  drawSlot(3, 'truck', '#00f0ff', true);
  drawSlot(4, 'maritime', '#00f0ff', true);
  drawSlot(5, 'air', '#00f0ff', true);

  cachedAtlasDataUrl = canvas.toDataURL();
  return cachedAtlasDataUrl;
}

const ICON_MAPPING: Record<
  string,
  { x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; mask: boolean }
> = {
  truck: { x: 0, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: false },
  maritime: { x: 64, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: false },
  air: { x: 128, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: false },
  'truck-selected': { x: 192, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: false },
  'maritime-selected': { x: 256, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: false },
  'air-selected': { x: 320, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: false },
};

/**
 * Calculates responsive pixel size for Deck.gl IconLayer.
 * Tuned so at macro overview (zoom 5.5 - 7.5), ships and planes are clearly distinguishable.
 */
function getVehicleIconSize(modality: string, zoom: number, isSelected: boolean): number {
  let base = 22;
  if (zoom < 5.0) {
    base = 16;
  } else if (zoom < 6.5) {
    base = 23; // Overview zoom (6.0): crisp 23-28px display
  } else if (zoom < 8.0) {
    base = 27;
  } else if (zoom < 11.0) {
    base = 32;
  } else {
    base = 38;
  }

  if (modality === 'maritime' || modality === 'air') {
    base = Math.round(base * 1.15);
  }
  if (isSelected) {
    base = Math.round(base * 1.25);
  }
  return base;
}

export function FleetVehicleLayer({
  map,
  vehicles,
  activeRoutes,
  activeRouteIdx,
  modalityFilter = 'all',
  simSpeed = 1,
  onSelectVehicle,
  selectedVehicleId,
  onCloseVehicle,
}: FleetVehicleLayerProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<{
    vehicle: FleetVehicle;
    currentPos: [number, number];
    bearing: number;
  } | null>(null);

  const [isFollowCamActive, setIsFollowCamActive] = useState<boolean>(false);

  const overlayRef = useRef<MapboxOverlay | null>(null);
  const animRef = useRef<number | null>(null);
  const progressMapRef = useRef<Record<string, number>>({});
  const deadReckonMapRef = useRef<Record<string, DeadReckonState>>({});
  const breadcrumbsRef = useRef<Record<string, [number, number][]>>({});
  const lastTimeRef = useRef<number>(performance.now());
  const lastArbitrateTimeRef = useRef<number>(0);
  const lastArbitrateZoomRef = useRef<number>(0);
  const cachedWinnersRef = useRef<Set<string>>(new Set());
  const selectedVehicleIdRef = useRef<string | null>(null);
  const isFollowCamActiveRef = useRef<boolean>(false);
  const lastDeckUpdateRef = useRef<number>(0);
  const lastPopupSyncRef = useRef<number>(0);
  const isInteractingRef = useRef<boolean>(false);
  const vehiclesRef = useRef<FleetVehicle[]>(vehicles);
  vehiclesRef.current = vehicles;

  selectedVehicleIdRef.current = selectedVehicle?.vehicle.vehicle_id ?? null;
  isFollowCamActiveRef.current = isFollowCamActive;

  // Sync external selection clear (e.g. when incident or crisis is selected)
  useEffect(() => {
    if (selectedVehicleId === null && selectedVehicle !== null) {
      setSelectedVehicle(null);
      setIsFollowCamActive(false);
    }
  }, [selectedVehicleId, selectedVehicle]);

  const handleDismissSelection = useCallback(() => {
    setSelectedVehicle(null);
    setIsFollowCamActive(false);
    onCloseVehicle?.();
  }, [onCloseVehicle]);

  // Clear dead-reckon and progress refs strictly on component unmount
  useEffect(() => {
    return () => {
      progressMapRef.current = {};
      deadReckonMapRef.current = {};
      breadcrumbsRef.current = {};
    };
  }, []);

  // Listen to manual map gestures to pause heavy deck rebuilding and disengage follow-camera
  useEffect(() => {
    if (!map) return;

    const onMoveStart = () => {
      isInteractingRef.current = true;
      setIsFollowCamActive(false);
    };

    const onMoveEnd = () => {
      isInteractingRef.current = false;
      // Force next frame to immediately rebuild Deck.gl layers with newly projected screen bounds
      lastDeckUpdateRef.current = 0;
    };

    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
    };
  }, [map]);

  const handleVehicleSelect = useCallback(
    (targetVehicle: FleetVehicle, coords: [number, number], heading: number) => {
      setSelectedVehicle({
        vehicle: targetVehicle,
        currentPos: coords,
        bearing: heading,
      });

      if (onSelectVehicle) {
        onSelectVehicle(targetVehicle);
      }

      if (map) {
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
    },
    [map, onSelectVehicle]
  );

  // Initialize and mount Deck.gl MapboxOverlay control
  useEffect(() => {
    if (!map) return;

    // Remove legacy Mapbox layers/sources if present from previous renders
    try {
      if (map.getLayer('fleet-telemetry-points-layer')) map.removeLayer('fleet-telemetry-points-layer');
      if (map.getLayer('fleet-bearing-vectors-layer')) map.removeLayer('fleet-bearing-vectors-layer');
      if (map.getLayer('fleet-breadcrumb-trails-layer')) map.removeLayer('fleet-breadcrumb-trails-layer');
      if (map.getLayer('fleet-callsign-labels-layer')) map.removeLayer('fleet-callsign-labels-layer');
      if (map.getSource('fleet-telemetry-points')) map.removeSource('fleet-telemetry-points');
      if (map.getSource('fleet-bearing-vectors')) map.removeSource('fleet-bearing-vectors');
      if (map.getSource('fleet-breadcrumb-trails')) map.removeSource('fleet-breadcrumb-trails');
      if (map.getSource('fleet-callsign-labels')) map.removeSource('fleet-callsign-labels');
    } catch {}

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onHover: (info) => {
        try {
          const canvas = map.getCanvas();
          if (canvas?.style) {
            canvas.style.cursor = info.object ? 'pointer' : '';
          }
        } catch {}
      },
    });

    try {
      map.addControl(overlay as unknown as mapboxgl.IControl);
      overlayRef.current = overlay;
    } catch (err) {
      console.error('PreHub Deck.gl MapboxOverlay mount error:', err);
    }

    return () => {
      try {
        if (overlayRef.current) {
          map.removeControl(overlayRef.current as unknown as mapboxgl.IControl);
          overlayRef.current.finalize();
          overlayRef.current = null;
        }
      } catch {}
    };
  }, [map]);

  // High-performance 60 FPS Kinematics & GPU Instanced Deck.gl rendering loop
  useEffect(() => {
    if (!map) return;

    let isCancelled = false;
    const atlasUrl = getVehicleAtlasDataUrl();

    const animate = (now: number) => {
      if (isCancelled || !map || !overlayRef.current) return;

      // Throttle telemetry update to ~25 FPS (40ms interval) to liberate main-thread CPU
      const elapsedMs = now - lastTimeRef.current;
      if (elapsedMs < 38) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaSec = Math.min(elapsedMs / 1000, 0.1);
      lastTimeRef.current = now;

      // Throttle Deck.gl layer updates to ~4 Hz (every 250ms)
      // and pause heavy layer rebuilding while the user is actively zooming or panning
      const isInteracting = isInteractingRef.current || map.isMoving() || map.isZooming() || map.isRotating();
      const timeSinceDeckUpdate = now - lastDeckUpdateRef.current;

      if (timeSinceDeckUpdate < 250 || (isInteracting && timeSinceDeckUpdate < 600)) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }
      lastDeckUpdateRef.current = now;

      const currentVehicles = vehiclesRef.current || [];
      const visibleVehicles = currentVehicles.filter((v) => {
        if (!modalityFilter || modalityFilter === 'all') return true;
        return v.modality === modalityFilter;
      });

      if (visibleVehicles.length === 0) {
        if (overlayRef.current) {
          overlayRef.current.setProps({ layers: [] });
        }
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      // Initialize progress map for newly arrived vehicles without wiping existing
      visibleVehicles.forEach((v) => {
        if (progressMapRef.current[v.vehicle_id] === undefined) {
          progressMapRef.current[v.vehicle_id] = v.progress ?? 0.35;
        }
      });

      const currentZoom = map.getZoom();
      const simSpeedMultiplier = typeof simSpeed === 'number' && simSpeed > 0 ? simSpeed : 1.0;

      const trailData: Array<{ path: [number, number][]; color: [number, number, number, number]; width: number }> = [];
      const vectorData: Array<{ path: [number, number][]; color: [number, number, number, number] }> = [];
      const estimatedRouteData: Array<{ path: [number, number][]; color: [number, number, number, number] }> = [];
      const pulseData: Array<{
        position: [number, number];
        radius: number;
        fillColor: [number, number, number, number];
        lineColor: [number, number, number, number];
      }> = [];
      const baseDotsData: Array<{
        vehicle: FleetVehicle;
        position: [number, number];
        heading: number;
        isSelected: boolean;
        fillColor: [number, number, number, number];
        lineColor: [number, number, number, number];
      }> = [];
      const iconData: Array<{
        vehicle: FleetVehicle;
        iconKey: string;
        position: [number, number];
        heading: number;
        size: number;
        isSelected: boolean;
      }> = [];
      const declutterCandidates: DeclutterItem[] = [];

      visibleVehicles.forEach((v, idx) => {
        let coords = (
          v.route_geometry?.coordinates ||
          (v as any).route_coordinates ||
          (Array.isArray((v as any).waypoints)
            ? (v as any).waypoints.map((w: any) => (Array.isArray(w) ? [w[0], w[1]] : [w.lon ?? w.lng ?? 0, w.lat ?? 0]))
            : null) ||
          v.path ||
          []
        ) as [number, number][];

        // Alternative corridor assignment for rerouted vehicle or demo unit
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

        const isSelected = selectedVehicleIdRef.current === v.vehicle_id;
        let finalPos: [number, number];
        let finalBearing: number;

        // Extract latest server location fix (read current_coords first from telemetry_service.py)
        const serverFix: [number, number] =
          Array.isArray((v as any).current_coords) && (v as any).current_coords.length >= 2
            ? [(v as any).current_coords[0], (v as any).current_coords[1]]
            : (v as any).current_location?.coordinates
              ? [(v as any).current_location.coordinates[0], (v as any).current_location.coordinates[1]]
              : Array.isArray((v as any).location) && (v as any).location.length >= 2
                ? [(v as any).location[0], (v as any).location[1]]
                : (v as any).location?.coordinates
                  ? [(v as any).location.coordinates[0], (v as any).location.coordinates[1]]
                  : coords.length > 0
                    ? coords[Math.floor(coords.length / 2)]
                    : [98.6722, 3.5952];

        const isLandTruck = v.modality === 'truck' || (v.modality as string) === 'land';

        if (isLandTruck) {
          // Keep land trucks strictly snapped/interpolated along their Sumatra highway waypoints
          // NEVER send land trucks into unbounded spherical dead-reckoning drifting into ocean
          if (coords.length >= 2) {
            const baseSpeed = v.speed_kmh || 60;
            const totalDistanceKm = calculatePathDistanceKm(coords);
            const simScale = 8.0 * simSpeedMultiplier;
            const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * (simScale / totalDistanceKm);

            const prevProg = progressMapRef.current[v.vehicle_id] ?? (v.progress ?? 0.35);
            let currentProgress = prevProg + increment;
            if (currentProgress > 1.0) {
              currentProgress = 0.0;
              breadcrumbsRef.current[v.vehicle_id] = [];
            }
            progressMapRef.current[v.vehicle_id] = currentProgress;

            const state = calculateRouteProgressPosition(coords, currentProgress);
            finalPos = state.currentPosition;
            finalBearing = state.bearing;
          } else {
            finalPos = serverFix;
            finalBearing = v.heading_deg ?? (v as any).bearing ?? 0;
          }
        } else {
          // Maritime & Air Kinematics
          const hasSurveyedCorridor = coords.length >= 2 && calculatePathDistanceKm(coords) >= 15;
          if (v.modality === 'maritime' && hasSurveyedCorridor) {
            // Surveyed channel navigation (e.g. Belawan channel or Sunda Strait ferry route)
            const baseSpeed = (v.sog_knots ? v.sog_knots * 1.852 : v.speed_kmh) || 22;
            const totalDistanceKm = calculatePathDistanceKm(coords);
            const simScale = 4.0 * simSpeedMultiplier;
            const increment = v.status === 'anchored' ? 0 : (baseSpeed / 3600) * deltaSec * (simScale / totalDistanceKm);

            const prevProg = progressMapRef.current[v.vehicle_id] ?? (v.progress ?? 0.35);
            let currentProgress = prevProg + increment;
            if (currentProgress > 1.0) {
              currentProgress = 0.0;
              breadcrumbsRef.current[v.vehicle_id] = [];
            }
            progressMapRef.current[v.vehicle_id] = currentProgress;

            const state = calculateRouteProgressPosition(coords, currentProgress);
            finalPos = state.currentPosition;
            finalBearing = state.bearing;
          } else {
            // Dead-reckoning for flights or open sea vessels
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
                // Smooth blend toward new server fix if drift is large, rather than resetting to stern/prev
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

              // Regional bounding clamp — removed crude longitude wraparound (+= 14.5 / -= 14.5)
              // that caused vessels in Malacca Strait to teleport across Sumatra mainland
              finalPos[0] = Math.max(94.0, Math.min(109.0, finalPos[0]));
              finalPos[1] = Math.max(-7.0, Math.min(7.0, finalPos[1]));

              drState.currentPos = finalPos;
            } else {
              finalPos = drState.currentPos;
            }
          }
        }

        // Maintain rolling circular history of coordinates for breadcrumb wake/trail
        const history = breadcrumbsRef.current[v.vehicle_id] || [];
        const lastPt = history[history.length - 1];
        if (!lastPt || Math.hypot(lastPt[0] - finalPos[0], lastPt[1] - finalPos[1]) > 0.0003) {
          history.push(finalPos);
          if (history.length > 12) history.shift();
          breadcrumbsRef.current[v.vehicle_id] = history;
        }

        if (history.length > 1) {
          const wakeColor: [number, number, number, number] =
            v.modality === 'maritime'
              ? [56, 189, 248, 65]
              : v.modality === 'air'
                ? [192, 132, 252, 60]
                : [255, 255, 255, 45];
          trailData.push({
            path: history,
            color: wakeColor,
            width: v.modality === 'maritime' ? 2.5 : v.modality === 'air' ? 2.0 : 1.2,
          });
        }

        // Forward geodesic velocity vector
        // Display tactical velocity vector only for actively selected unit or actively rerouting/delayed unit
        const isImpacted = v.status === 'rerouting' || Boolean((v as any).status === 'delayed') || Boolean((v as any).impacted);
        if (v.status !== 'anchored' && (v.speed_kmh || 0) > 0 && (isSelected || isImpacted)) {
          const vectorColor: [number, number, number, number] = isSelected
            ? [0, 240, 255, 240]
            : v.modality === 'maritime'
              ? [56, 189, 248, 200]
              : v.modality === 'air'
                ? [192, 132, 252, 200]
                : [52, 211, 153, 200];

          // Forward time projection: ~1.2 minutes (0.02h) so vector indicates heading cleanly without spanning the map
          const endPoint = projectBearingEndpoint(
            finalPos,
            finalBearing,
            v.speed_kmh || 60,
            v.modality === 'air' ? 0.025 : 0.02
          );

          vectorData.push({
            path: [finalPos, endPoint],
            color: vectorColor,
          });
        }

        // Hazard pulse ring for selected, delayed, or rerouting vehicles
        if (isSelected || isImpacted) {
          const pulsePhase = ((now + idx * 250) % 1800) / 1800; // 0.0 to 1.0
          const radiusPixels = isSelected ? 22 + pulsePhase * 16 : 16 + pulsePhase * 12;
          const alphaFill = Math.round((1.0 - pulsePhase) * 60);
          const alphaLine = Math.round((1.0 - pulsePhase) * 220);

          pulseData.push({
            position: finalPos,
            radius: radiusPixels,
            fillColor: isSelected ? [0, 240, 255, alphaFill] : [245, 158, 11, alphaFill],
            lineColor: isSelected ? [0, 240, 255, alphaLine] : [245, 158, 11, alphaLine],
          });
        } else if (v.tracking_mode === 'ROUTE_ESTIMATED') {
          // Subtle amber tactical ring for estimated corridor units
          pulseData.push({
            position: finalPos,
            radius: 14,
            fillColor: [245, 158, 11, 20],
            lineColor: [245, 158, 11, 140],
          });
        }

        // Collect planned trajectory line for ROUTE_ESTIMATED vehicles
        if (v.tracking_mode === 'ROUTE_ESTIMATED' && coords.length >= 2) {
          estimatedRouteData.push({
            path: coords,
            color: [245, 158, 11, 150],
          });
        }

        // Persistent base dot for all vehicles (always visible at all zoom levels)
        const dotColor: [number, number, number, number] = isSelected
          ? [0, 240, 255, 255]
          : v.modality === 'maritime'
            ? [56, 189, 248, 230]
            : v.modality === 'air'
              ? [192, 132, 252, 230]
              : [52, 211, 153, 230];

        baseDotsData.push({
          vehicle: v,
          position: finalPos,
          heading: finalBearing,
          isSelected,
          fillColor: dotColor,
          lineColor: [12, 16, 23, 220],
        });

        // Vehicle sprite item
        const iconKey = isSelected ? `${v.modality}-selected` : v.modality;
        const iconSize = getVehicleIconSize(v.modality, currentZoom, isSelected);

        iconData.push({
          vehicle: v,
          iconKey,
          position: finalPos,
          heading: finalBearing,
          size: iconSize,
          isSelected,
        });

        // Register candidate for screen-space anti-clutter arbiter
        const screenPt = map.project(finalPos);
        let priority = PRIORITY_FLEET_CALLSIGN;
        if (isSelected) {
          priority = PRIORITY_SELECTED_ROUTE;
        } else if (isImpacted) {
          priority = PRIORITY_IMPACTED_FLEET;
        } else if (v.modality === 'air') {
          priority = PRIORITY_AIRCRAFT_CALLSIGN;
        } else if (
          v.modality === 'maritime' &&
          ((v.speed_kmh || 0) > 12 ||
            v.cargo?.toLowerCase().includes('petikemas') ||
            v.cargo?.toLowerCase().includes('kontainer') ||
            v.cargo?.toLowerCase().includes('cpo'))
        ) {
          priority = PRIORITY_MAJOR_VESSEL;
        } else if (isLandTruck) {
          // Strategic cargo trucks on Trans-Sumatra Highway receive priority boost
          if (
            v.cargo?.toLowerCase().includes('beras') ||
            v.cargo?.toLowerCase().includes('bulog') ||
            v.cargo?.toLowerCase().includes('solar') ||
            v.cargo?.toLowerCase().includes('sayur') ||
            v.cargo?.toLowerCase().includes('sembako')
          ) {
            priority = 52;
          }
        }

        declutterCandidates.push({
          id: v.vehicle_id,
          screenX: screenPt.x,
          screenY: screenPt.y,
          priority,
          width: 90,
          height: 24,
          category: 'fleet',
          modality: isLandTruck ? 'truck' : v.modality,
          text: v.callsign || v.name || v.vehicle_id,
          coords: finalPos,
        });

        // Throttled selected vehicle live position sync (~2 Hz) & Follow Camera easeTo
        if (isSelected) {
          if (now - lastPopupSyncRef.current >= 500) {
            lastPopupSyncRef.current = now;
            setSelectedVehicle((prev) => {
              if (!prev || prev.vehicle.vehicle_id !== v.vehicle_id) return prev;
              if (
                Math.abs(prev.currentPos[0] - finalPos[0]) < 0.0001 &&
                Math.abs(prev.currentPos[1] - finalPos[1]) < 0.0001 &&
                Math.abs(prev.bearing - finalBearing) < 1
              ) {
                return prev;
              }
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
              duration: 250,
              easing: (t) => t,
            });
          }
        }
      });

      // SpatialHash Anti-Clutter Arbitration:
      // Cache arbitration winners and re-arbitrate only periodically (~350ms) or when camera zoom changes
      // Macro zoom (z < 7.5) uses balanced per-modality quota (trucks: 8, maritime: 9, air: 7)
      const isMacro = currentZoom < 7.5;
      const shouldReArbitrate =
        now - lastArbitrateTimeRef.current > 350 ||
        Math.abs(currentZoom - lastArbitrateZoomRef.current) > 0.25 ||
        cachedWinnersRef.current.size === 0;

      let winningLabelIds = cachedWinnersRef.current;
      if (shouldReArbitrate) {
        winningLabelIds = isMacro
          ? arbitrateMacroZoomLabels(declutterCandidates, defaultSpatialHashArbiter, now)
          : arbitrateVisibleLabels(declutterCandidates, defaultSpatialHashArbiter, now);
        cachedWinnersRef.current = winningLabelIds;
        lastArbitrateTimeRef.current = now;
        lastArbitrateZoomRef.current = currentZoom;
      }

      const textData: Array<{
        vehicle: FleetVehicle;
        text: string;
        position: [number, number];
        color: [number, number, number, number];
        borderColor: [number, number, number, number];
        size: number;
        heading: number;
      }> = [];

      declutterCandidates.forEach((c) => {
        const isSelected = selectedVehicleIdRef.current === c.id;
        if (isSelected || winningLabelIds.has(c.id)) {
          const targetVeh = visibleVehicles.find((veh) => veh.vehicle_id === c.id);
          if (targetVeh && c.coords) {
            let badge = 'GPS LIVE';
            let textColor: [number, number, number, number] = [52, 211, 153, 255]; // emerald
            if (targetVeh.modality === 'maritime') {
              badge = targetVeh.tracking_mode === 'ROUTE_ESTIMATED' ? 'AIS PROYEKSI' : 'AIS LIVE';
              textColor = [56, 189, 248, 255]; // sky
            } else if (targetVeh.modality === 'air') {
              badge = 'ADS-B';
              textColor = [192, 132, 252, 255]; // purple
            } else if (targetVeh.tracking_mode === 'ROUTE_ESTIMATED') {
              badge = 'ESTIMASI';
              textColor = [245, 158, 11, 255]; // amber
            }

            const labelText = isSelected
              ? `${c.text}\n[${badge}]`
              : `${c.text} - ${badge}`;

            textData.push({
              vehicle: targetVeh,
              text: labelText,
              position: c.coords,
              color: isSelected ? [0, 240, 255, 255] : textColor,
              borderColor: isSelected ? [0, 240, 255, 200] : [28, 36, 50, 180],
              size: isMacro ? 9.5 : 11,
              heading: targetVeh.heading_deg ?? 0,
            });
          }
        }
      });

      // Construct Deck.gl GPU-instanced layers
      const deckLayers = [
        new PathLayer({
          id: 'deck-fleet-estimated-routes',
          data: estimatedRouteData,
          getPath: (d: any) => d.path,
          getColor: (d: any) => d.color,
          getWidth: 2.5,
          widthUnits: 'pixels',
          widthMinPixels: 1.5,
          capRounded: true,
          jointRounded: true,
        }),
        new PathLayer({
          id: 'deck-fleet-wakes',
          data: trailData,
          getPath: (d: any) => d.path,
          getColor: (d: any) => d.color,
          getWidth: (d: any) => d.width,
          widthUnits: 'pixels',
          widthMinPixels: 1,
          capRounded: true,
          jointRounded: true,
        }),
        new PathLayer({
          id: 'deck-fleet-vectors',
          data: vectorData,
          getPath: (d: any) => d.path,
          getColor: (d: any) => d.color,
          getWidth: 2,
          widthUnits: 'pixels',
          widthMinPixels: 1,
          capRounded: true,
          jointRounded: true,
        }),
        new ScatterplotLayer({
          id: 'deck-fleet-pulse',
          data: pulseData,
          getPosition: (d: any) => d.position,
          getRadius: (d: any) => d.radius,
          radiusUnits: 'pixels',
          radiusMinPixels: 4,
          getFillColor: (d: any) => d.fillColor,
          getLineColor: (d: any) => d.lineColor,
          stroked: true,
          filled: true,
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 1.5,
        }),
        new ScatterplotLayer({
          id: 'deck-fleet-dots',
          data: baseDotsData,
          getPosition: (d: any) => d.position,
          getRadius: (d: any) => (d.isSelected ? 6 : 4),
          radiusUnits: 'pixels',
          radiusMinPixels: 3,
          getFillColor: (d: any) => d.fillColor,
          getLineColor: (d: any) => d.lineColor,
          stroked: true,
          filled: true,
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 1.5,
          billboard: true,
          pickable: true,
          onClick: (info: any) => {
            if (info.object) {
              handleVehicleSelect(info.object.vehicle, info.object.position, info.object.heading);
            }
          },
        }),
        new IconLayer({
          id: 'deck-fleet-icons',
          data: iconData,
          iconAtlas: atlasUrl,
          iconMapping: ICON_MAPPING,
          getIcon: (d: any) => d.iconKey,
          getPosition: (d: any) => d.position,
          getAngle: (d: any) => d.heading,
          getSize: (d: any) => d.size,
          sizeUnits: 'pixels',
          sizeMinPixels: 14,
          billboard: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [0, 240, 255, 60],
          onClick: (info: any) => {
            if (info.object) {
              handleVehicleSelect(info.object.vehicle, info.object.position, info.object.heading);
            }
          },
        }),
        new TextLayer({
          id: 'deck-fleet-labels',
          data: textData,
          getText: (d: any) => d.text,
          getPosition: (d: any) => d.position,
          getColor: (d: any) => d.color,
          getSize: (d: any) => d.size,
          sizeUnits: 'pixels',
          sizeMinPixels: 9,
          billboard: true,
          fontFamily: 'DIN Pro Medium, Arial Unicode MS Regular, sans-serif',
          fontWeight: '600',
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
          getPixelOffset: [18, 0],
          background: true,
          getBackgroundColor: [12, 16, 23, 215],
          getBorderColor: (d: any) => d.borderColor,
          getBorderWidth: 1,
          backgroundBorderRadius: 4,
          backgroundPadding: [5, 2, 5, 2],
          pickable: true,
          onClick: (info: any) => {
            if (info.object) {
              handleVehicleSelect(info.object.vehicle, info.object.position, info.object.heading);
            }
          },
        }),
      ];

      overlayRef.current.setProps({ layers: deckLayers });

      animRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      isCancelled = true;
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (overlayRef.current) {
        overlayRef.current.setProps({ layers: [] });
      }
    };
  }, [map, activeRoutes, activeRouteIdx, modalityFilter, simSpeed, handleVehicleSelect]);

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
  const statusLabel = isEstimated
    ? 'PROYEKSI RUTE'
    : isMaritime
      ? 'AIS LIVE SATELIT'
      : isAir
        ? 'ADS-B LIVE'
        : vehicle?.vehicle_id.startsWith('MMSI:')
          ? 'AIS LIVE SATELIT'
          : 'GPS LIVE SATELIT';

  return (
    <>
      {/* Tactical Screen-Space Target Reticle Overlay */}
      {selectedVehicle && (
        <TargetLockReticle
          map={map}
          targetLngLat={selectedVehicle.currentPos}
          callsign={selectedVehicle.vehicle.name || selectedVehicle.vehicle.vehicle_id}
          onDismiss={handleDismissSelection}
        />
      )}

      {/* Telemetry Inspector Console — Docked in Right Tactical Inspector Slot (Zero Overlap with Left Drawer) */}
      {selectedVehicle && (
        <div className="absolute top-16 right-3 bottom-4 z-40 w-[calc(100vw-1.5rem)] sm:w-[390px] bg-[#0c1017] border border-[#1c2432] shadow-xl rounded-lg p-4 text-slate-100 animate-in slide-in-from-right-4 duration-300 pointer-events-auto space-y-3 font-sans overflow-y-auto no-scrollbar">
          {/* Header Bar */}
          <div className="flex items-start justify-between border-b border-[#1c2432] pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg border ${
                  isEstimated
                    ? 'bg-amber-950/50 text-amber-400 border-amber-500/30'
                    : isMaritime
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
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono border ${
                    isEstimated
                      ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                      : 'bg-[#121822] text-slate-300 border-[#1c2432]'
                  }`}>
                    <ShieldCheck className={`w-3.5 h-3.5 ${isEstimated ? 'text-amber-400' : 'text-emerald-400'}`} />
                    <span>{statusLabel}</span>
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismissSelection}
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
              onClick={handleDismissSelection}
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
