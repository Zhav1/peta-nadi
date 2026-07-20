'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

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
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);

  const isMapLoadedRef = useRef(false);
  const onCrisisClickRef = useRef(onCrisisClick);
  onCrisisClickRef.current = onCrisisClick;
  const onPolygonDrawnRef = useRef(onPolygonDrawn);
  onPolygonDrawnRef.current = onPolygonDrawn;
  const drawModeActiveRef = useRef(drawModeActive);
  drawModeActiveRef.current = drawModeActive;

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
      pitch: 30,
      projection: { name: 'globe' },
      antialias: true,
    });
    mapRef.current = map;

    // Map controls
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-right');

    // Polygon drawing tool
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'simple_select',
      styles: [
        {
          id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: { 'fill-color': '#f97316', 'fill-opacity': 0.35 },
        },
        {
          id: 'gl-draw-polygon-stroke-active',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: { 'line-color': '#f97316', 'line-width': 3 },
        },
        {
          id: 'gl-draw-line-active',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
          paint: { 'line-color': '#f97316', 'line-width': 3, 'line-dasharray': [0.2, 2] },
        },
        {
          id: 'gl-draw-polygon-and-line-vertex-active',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: { 'circle-radius': 6, 'circle-color': '#00F0FF', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
        },
      ],
    });
    drawRef.current = draw;

    map.on('load', () => {
      isMapLoadedRef.current = true;
      map.addControl(draw, 'top-left');

      // 1. Disaster Zones GeoJSON Layer
      map.addSource('disaster-zones-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'disaster-zones-fill',
        type: 'fill',
        source: 'disaster-zones-source',
        paint: {
          'fill-color': '#f97316',
          'fill-opacity': 0.25,
        },
      });
      map.addLayer({
        id: 'disaster-zones-outline',
        type: 'line',
        source: 'disaster-zones-source',
        paint: {
          'line-color': '#f97316',
          'line-width': 2,
        },
      });

      // 2. Route Paths GeoJSON Layer
      map.addSource('route-paths-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-paths-line',
        type: 'line',
        source: 'route-paths-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['case', ['get', 'isActive'], '#22d3ee', '#f97316'],
          'line-width': ['case', ['get', 'isActive'], 6, 3],
          'line-opacity': 0.9,
        },
      });

      // 3. Crisis Pins GeoJSON Layer (Native WebGL 3D Globe Anchored)
      map.addSource('crisis-pins-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Outer pulsing aura ring
      map.addLayer({
        id: 'crisis-pins-glow',
        type: 'circle',
        source: 'crisis-pins-source',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 26, 18],
          'circle-color': [
            'match', ['get', 'severity'],
            'critical', '#ef4444',
            'high', '#f97316',
            'medium', '#eab308',
            '#22c55e'
          ],
          'circle-opacity': 0.35,
          'circle-blur': 0.6,
        },
      });

      // Inner solid core pin
      map.addLayer({
        id: 'crisis-pins-core',
        type: 'circle',
        source: 'crisis-pins-source',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 14, 10],
          'circle-color': [
            'match', ['get', 'severity'],
            'critical', '#ef4444',
            'high', '#f97316',
            'medium', '#eab308',
            '#22c55e'
          ],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1.0,
        },
      });

      // Pin click events
      map.on('click', 'crisis-pins-core', (e) => {
        if (e.features && e.features[0]) {
          const id = e.features[0].properties?.id;
          if (id && onCrisisClickRef.current) {
            onCrisisClickRef.current(id);
          }
        }
      });
      map.on('mouseenter', 'crisis-pins-core', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'crisis-pins-core', () => {
        if (!drawModeActiveRef.current) map.getCanvas().style.cursor = '';
      });

      // Handle polygon drawing completion
      map.on('draw.create', (e: { features: GeoJSON.Feature[] }) => {
        const feature = e.features[0];
        if (feature && feature.geometry && feature.geometry.type === 'Polygon') {
          const ring = feature.geometry.coordinates[0] as [number, number][];
          if (onPolygonDrawnRef.current) {
            onPolygonDrawnRef.current(ring, feature);
          }
          draw.deleteAll();
          draw.changeMode('simple_select');
          if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
        }
      });

      // Populate initial layer data
      updateMapSources();

      // Sync initial draw mode if active
      if (drawModeActiveRef.current) {
        try {
          draw.changeMode('draw_polygon');
          map.getCanvas().style.cursor = 'crosshair';
        } catch (err) {
          console.warn('Initial draw mode sync error:', err);
        }
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
      isMapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update native GeoJSON map sources
  const updateMapSources = () => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    // 1. Update Crisis Pins Source
    const pinsSource = map.getSource('crisis-pins-source') as mapboxgl.GeoJSONSource;
    if (pinsSource) {
      const validIncidents = incidents.filter((i) => i.lat != null && i.lon != null);
      pinsSource.setData({
        type: 'FeatureCollection',
        features: validIncidents.map((i) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [i.lon!, i.lat!] },
          properties: {
            id: i.id,
            severity: i.severity,
            title: i.title,
            selected: i.id === selectedCrisisId,
          },
        })),
      });
    }

    // 2. Update Route Paths Source
    const routesSource = map.getSource('route-paths-source') as mapboxgl.GeoJSONSource;
    if (routesSource) {
      const targetIdx = activeRouteIdx ?? 0;
      routesSource.setData({
        type: 'FeatureCollection',
        features: activeRoutes.map((r, idx) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: r.waypoints.map((wp) => [wp.lon, wp.lat]),
          },
          properties: {
            isActive: idx === targetIdx,
            description: r.description,
          },
        })),
      });
    }

    // 3. Update Disaster Zones Source
    const zonesSource = map.getSource('disaster-zones-source') as mapboxgl.GeoJSONSource;
    if (zonesSource) {
      zonesSource.setData({
        type: 'FeatureCollection',
        features: disasterZones.map((z) => ({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [z.polygon],
          },
          properties: {
            type: z.type,
            risk: z.risk,
          },
        })),
      });
    }
  };

  // Update sources on prop changes
  useEffect(() => {
    updateMapSources();
  }, [incidents, selectedCrisisId, activeRoutes, activeRouteIdx, disasterZones]);

  // Toggle MapboxDraw mode & canvas cursor
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !isMapLoadedRef.current || !map) return;

    if (drawModeActive) {
      try {
        draw.changeMode('draw_polygon');
        map.getCanvas().style.cursor = 'crosshair';
      } catch (err) {
        console.warn('Failed to switch to draw_polygon:', err);
      }
    } else {
      try {
        draw.changeMode('simple_select');
        map.getCanvas().style.cursor = '';
      } catch (err) {
        console.warn('Failed to switch to simple_select:', err);
      }
    }
  }, [drawModeActive]);

  // Fly to selected crisis pin
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
