'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

import {
  buildCrisisPinsLayer,
  buildRoutePathsLayer,
  buildFireHeatmapLayer,
  buildDisasterZonesLayer,
  buildMaritimeLayer,
} from '@/lib/layers';
import type {
  IncidentSummary,
  RouteRecommendation,
  FireHotspot,
  MaritimeVector,
  DisasterZone,
} from '@/lib/types';

export interface CrisisMapProps {
  incidents: IncidentSummary[];
  selectedCrisisId: string | null;
  onCrisisClick: (id: string) => void;
  activeRoutes: RouteRecommendation[];
  activeRouteIdx: number | null;
  fireHotspots: FireHotspot[];
  maritimeVectors: MaritimeVector[];
  disasterZones: DisasterZone[];
  onPolygonDrawn: (polygon: [number, number][], geojsonFeature: GeoJSON.Feature) => void;
  drawModeActive: boolean;
}

// North Sumatra — Belawan Port area
const INITIAL_CENTER: [number, number] = [98.67, 3.79];
const INITIAL_ZOOM = 9;

export default function CrisisMap({
  incidents,
  selectedCrisisId,
  onCrisisClick,
  activeRoutes,
  activeRouteIdx,
  fireHotspots,
  maritimeVectors,
  disasterZones,
  onPolygonDrawn,
  drawModeActive,
}: CrisisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);

  // Build and push updated layers to overlay
  const updateLayers = useCallback(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({
      layers: [
        buildFireHeatmapLayer(fireHotspots),
        buildMaritimeLayer(maritimeVectors),
        buildDisasterZonesLayer(disasterZones, () => {}),
        buildRoutePathsLayer(activeRoutes, activeRouteIdx),
        buildCrisisPinsLayer(incidents, selectedCrisisId, onCrisisClick),
      ],
    });
  }, [incidents, selectedCrisisId, onCrisisClick, activeRoutes, activeRouteIdx, fireHotspots, maritimeVectors, disasterZones]);

  // Mount map once
  useEffect(() => {
    if (!containerRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN is not set');

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      antialias: true,
    });
    mapRef.current = map;

    // Navigation controls (top-right)
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-right');

    // Deck.gl overlay
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    overlayRef.current = overlay;

    // Draw tool
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'simple_select',
      styles: [
        {
          id: 'gl-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: { 'fill-color': '#f97316', 'fill-opacity': 0.15 },
        },
        {
          id: 'gl-draw-polygon-stroke',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: { 'line-color': '#f97316', 'line-width': 2 },
        },
      ],
    });
    drawRef.current = draw;

    map.on('load', () => {
      map.addControl(overlay);
      map.addControl(draw, 'top-left');

      map.on('draw.create', (e: { features: GeoJSON.Feature[] }) => {
        const feature = e.features[0];
        if (feature.geometry.type === 'Polygon') {
          const ring = feature.geometry.coordinates[0] as [number, number][];
          onPolygonDrawn(ring, feature);
          draw.deleteAll(); // clear after capture
        }
      });
    });

    return () => {
      overlay.finalize();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // Update layers on data change (no map remount)
  useEffect(() => {
    updateLayers();
  }, [updateLayers]);

  // Toggle draw mode
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    if (drawModeActive) {
      draw.changeMode('draw_polygon');
    } else {
      draw.changeMode('simple_select');
    }
  }, [drawModeActive]);

  // Fly to selected crisis
  useEffect(() => {
    if (!selectedCrisisId || !mapRef.current) return;
    const incident = incidents.find((i) => i.id === selectedCrisisId);
    if (incident?.lat != null && incident?.lon != null) {
      mapRef.current.flyTo({
        center: [incident.lon, incident.lat],
        zoom: 11,
        duration: 1200,
        essential: true,
      });
    }
  }, [selectedCrisisId, incidents]);

  return (
    <div
      ref={containerRef}
      id="crisis-map"
      className="w-full h-full"
      aria-label="PetaNadi crisis intelligence map"
    />
  );
}
