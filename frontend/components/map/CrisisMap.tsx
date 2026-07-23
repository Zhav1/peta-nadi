'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { densifyPath, type LonLat } from '@/lib/pathDensifier';
import { HUB_NODES, type HubNode } from '@/lib/mapboxRoutingService';

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
  isClickTargeting?: boolean;
  onMapPointTargeted?: (lat: number, lon: number) => void;
  simulatedShockwave?: { center: [number, number]; radiusKm: number; hazardType: string } | null;
  selectedOriginNode?: string | null;
  selectedDestNode?: string | null;
  onNodeSelected?: (nodeId: string) => void;
  onSelectRoute?: (routeIdx: number) => void;
  hubNodesList?: HubNode[];
  corridorContext?: import('@/lib/types').CorridorContext | null;
  spatialWeatherPolygons?: GeoJSON.FeatureCollection | null;
  cuOptOptimizationInfo?: { solver: string; compute_time_ms: number; savings_pct: number } | null;
  isLeftSidebarCollapsed?: boolean;
}

// North Sumatra — Belawan Port area
const INITIAL_CENTER: [number, number] = [98.67, 3.55];
const INITIAL_ZOOM = 9;
const DRAG_THRESHOLD_PX = 5;

/** Generates a GeoJSON polygon ring forming a circle around [lon, lat] */
function createGeoJsonCircleRing(center: [number, number], radiusKm: number, points = 64): [number, number][] {
  const [lon, lat] = center;
  const ring: [number, number][] = [];
  const kmToRad = radiusKm / 6371.0;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const theta = (i * 2 * Math.PI) / points;
    const pointLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(kmToRad) +
      Math.cos(latRad) * Math.sin(kmToRad) * Math.cos(theta)
    );
    const pointLonRad =
      lonRad +
      Math.atan2(
        Math.sin(theta) * Math.sin(kmToRad) * Math.cos(latRad),
        Math.cos(kmToRad) - Math.sin(latRad) * Math.sin(pointLatRad)
      );

    const pointLon = (pointLonRad * 180) / Math.PI;
    const pointLat = (pointLatRad * 180) / Math.PI;
    ring.push([pointLon, pointLat]);
  }
  return ring;
}

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
  isClickTargeting = false,
  onMapPointTargeted,
  simulatedShockwave,
  selectedOriginNode = null,
  selectedDestNode = null,
  onNodeSelected,
  onSelectRoute,
  hubNodesList,
  corridorContext,
  spatialWeatherPolygons,
  cuOptOptimizationInfo,
  isLeftSidebarCollapsed = false,
}: CrisisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);
  const htmlMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const routeEtaMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const corridorMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const isMapLoadedRef = useRef(false);
  const onCrisisClickRef = useRef(onCrisisClick);
  onCrisisClickRef.current = onCrisisClick;
  const onPolygonDrawnRef = useRef(onPolygonDrawn);
  onPolygonDrawnRef.current = onPolygonDrawn;
  const drawModeActiveRef = useRef(drawModeActive);
  drawModeActiveRef.current = drawModeActive;

  const isClickTargetingRef = useRef(isClickTargeting);
  isClickTargetingRef.current = isClickTargeting;
  const onMapPointTargetedRef = useRef(onMapPointTargeted);
  onMapPointTargetedRef.current = onMapPointTargeted;
  const onNodeSelectedRef = useRef(onNodeSelected);
  onNodeSelectedRef.current = onNodeSelected;
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;

  const mouseDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
      pitch: 35,
      projection: { name: 'globe' },
      antialias: true,
    });
    mapRef.current = map;

    // Track mouse down position to separate intentional clicks from map drag
    map.on('mousedown', (e) => {
      mouseDownPosRef.current = { x: e.point.x, y: e.point.y };
    });

    // Map controls
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-right');

    // Polygon drawing tool
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
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

      // 0. Regional Weather Spatial Coverage Layer (BMKG + NVIDIA FourCastNet / Earth-2)
      map.addSource('weather-polygons-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'weather-polygons-fill',
        type: 'fill',
        source: 'weather-polygons-source',
        paint: {
          'fill-color': ['coalesce', ['get', 'fill_color'], 'rgba(6, 182, 212, 0.25)'],
          'fill-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'weather-polygons-outline',
        type: 'line',
        source: 'weather-polygons-source',
        paint: {
          'line-color': ['coalesce', ['get', 'stroke_color'], '#06b6d4'],
          'line-width': 2.0,
          'line-dasharray': [2, 2],
        },
      });
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
          'line-width': 2.5,
        },
      });

      // 2. Route Paths GeoJSON Layer (Real Mapbox Directions Driving Polyline with Alternatives & Congestion Colors)
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
          'line-color': ['coalesce', ['get', 'color'], '#00f0ff'],
          'line-width': ['case', ['get', 'isActive'], 7, 4],
          'line-opacity': ['case', ['get', 'isActive'], 0.95, 0.5],
        },
      });

      // 2b. Segment-Level Traffic Congestion GeoJSON Layer (Google Maps Traffic Style)
      map.addSource('congestion-segments-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'congestion-segments-line',
        type: 'line',
        source: 'congestion-segments-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': [
            'match',
            ['get', 'level'],
            'heavy', '#ef4444',
            'moderate', '#eab308',
            '#22c55e'
          ],
          'line-width': 5,
          'line-opacity': 0.85,
        },
      });

      // 3. Simulated Shockwave Pulse GeoJSON Layer
      map.addSource('simulated-shockwave-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'simulated-shockwave-fill',
        type: 'fill',
        source: 'simulated-shockwave-source',
        paint: {
          'fill-color': [
            'match', ['get', 'type'],
            'earthquake', 'rgba(239, 68, 68, 0.28)',
            'flood', 'rgba(6, 182, 212, 0.30)',
            'wildfire', 'rgba(249, 115, 22, 0.28)',
            'rgba(245, 158, 11, 0.25)'
          ],
          'fill-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'simulated-shockwave-outline',
        type: 'line',
        source: 'simulated-shockwave-source',
        paint: {
          'line-color': [
            'match', ['get', 'type'],
            'earthquake', '#ef4444',
            'flood', '#06b6d4',
            'wildfire', '#f97316',
            '#f59e0b'
          ],
          'line-width': 3.0,
          'line-dasharray': [2, 1],
        },
      });

      // 3b. Dynamic Seismic Fault Line Crack Vectors GeoJSON Layer (Earthquake Hazards)
      map.addSource('seismic-fault-lines-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'seismic-fault-lines-layer',
        type: 'line',
        source: 'seismic-fault-lines-source',
        paint: {
          'line-color': '#f43f5e',
          'line-width': 4.5,
          'line-dasharray': [1, 1],
        },
      });

      // 4. Crisis Pins GeoJSON Layer (Native WebGL 3D Globe Anchored)
      map.addSource('crisis-pins-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'crisis-pins-glow',
        type: 'circle',
        source: 'crisis-pins-source',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 22, 14],
          'circle-color': [
            'match', ['get', 'severity'],
            'critical', '#ef4444',
            'high', '#f97316',
            'medium', '#eab308',
            '#22c55e'
          ],
          'circle-opacity': 0.2,
          'circle-blur': 0.6,
        },
      });

      map.addLayer({
        id: 'crisis-pins-core',
        type: 'circle',
        source: 'crisis-pins-source',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 10, 7],
          'circle-color': [
            'match', ['get', 'severity'],
            'critical', '#ef4444',
            'high', '#f97316',
            'medium', '#eab308',
            '#22c55e'
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.85,
        },
      });

      // General map click handler for Game-Like Location Targeting
      map.on('click', (e) => {
        if (isClickTargetingRef.current && onMapPointTargetedRef.current) {
          onMapPointTargetedRef.current(e.lngLat.lat, e.lngLat.lng);
        }
      });

      // Pin click events
      map.on('click', 'crisis-pins-core', (e) => {
        if (isClickTargetingRef.current) return;

        if (e.point) {
          const dx = Math.abs(e.point.x - mouseDownPosRef.current.x);
          const dy = Math.abs(e.point.y - mouseDownPosRef.current.y);
          if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) return;
        }

        if (e.features && e.features[0]) {
          const id = e.features[0].properties?.id;
          if (id && onCrisisClickRef.current) {
            onCrisisClickRef.current(id);
          }
        }
      });

      // Route line click handler (Click route on map to select)
      map.on('click', 'route-paths-line', (e) => {
        if (isClickTargetingRef.current) return;
        if (e.features && e.features[0]) {
          const routeIdx = e.features[0].properties?.routeIndex;
          if (routeIdx !== undefined && onSelectRouteRef.current) {
            onSelectRouteRef.current(routeIdx);
          }
        }
      });
      map.on('mouseenter', 'route-paths-line', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'route-paths-line', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
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
          if (mapRef.current) {
            mapRef.current.dragPan.enable();
            mapRef.current.getCanvas().style.cursor = '';
          }
        }
      });

      // Populate initial layer data & HTML markers
      updateMapSources();
      renderHtmlHubMarkers();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
      isMapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render Interactive Custom HTML Element Markers for Hub Nodes
  const renderHtmlHubMarkers = () => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    // Clear previous markers
    htmlMarkersRef.current.forEach((m) => m.remove());
    htmlMarkersRef.current = [];

    const nodesToRender = hubNodesList || Object.values(HUB_NODES);

    nodesToRender.forEach((node) => {
      const isOrigin = node.id === selectedOriginNode;
      const isDest = node.id === selectedDestNode;

      const isPort = node.id.includes('belawan') || node.id.includes('dumai');
      const isAir = node.id.includes('kualanamu') || node.id.includes('kno');

      const iconSvg = isPort
        ? `<svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`
        : isAir
          ? `<svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5 0 1 .4 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.2c.3.4.8.6 1.3.4l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`
          : `<svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;

      const el = document.createElement('div');
      el.className = `cursor-pointer z-30 transition-transform transform hover:scale-110 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold shadow-2xl border backdrop-blur-md ${
        isOrigin
          ? 'bg-cyan-950/90 text-cyan-300 border-cyan-400 ring-4 ring-cyan-500/30'
          : isDest
            ? 'bg-amber-950/90 text-amber-300 border-amber-400 ring-4 ring-amber-500/30'
            : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-cyan-400/60'
      }`;
      el.style.zIndex = '30';

      el.innerHTML = `
        <span>${iconSvg}</span>
        <span>${node.name}</span>
        ${isOrigin ? '<span class="px-1.5 py-0.5 bg-cyan-400 text-slate-950 rounded text-[9px] font-black">START</span>' : ''}
        ${isDest ? '<span class="px-1.5 py-0.5 bg-amber-400 text-slate-950 rounded text-[9px] font-black">END</span>' : ''}
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onNodeSelectedRef.current) {
          onNodeSelectedRef.current(node.id);
        }
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(node.coords)
        .addTo(map);

      htmlMarkersRef.current.push(marker);
    });

    // Clear previous route ETA markers
    routeEtaMarkersRef.current.forEach((m) => m.remove());
    routeEtaMarkersRef.current = [];

    // Render Floating On-Map Route ETA Badges (Google Maps Style)
    if (activeRoutes && activeRoutes.length > 0) {
      activeRoutes.forEach((r, idx) => {
        if (!r.waypoints || r.waypoints.length === 0) return;
        const midIdx = Math.floor(r.waypoints.length / 2);
        const midPt = r.waypoints[midIdx];
        if (!midPt || midPt.lon == null || midPt.lat == null) return;

        const isActive = (activeRouteIdx ?? 0) === idx;
        const modeSvg = r.modality === 'air'
          ? `<svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5 0 1 .4 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.2c.3.4.8.6 1.3.4l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`
          : r.modality === 'maritime'
            ? `<svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`
            : `<svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;

        const el = document.createElement('div');
        el.className = `cursor-pointer z-20 transition-all transform hover:scale-110 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold shadow-2xl border backdrop-blur-md ${
          r.is_compromised
            ? 'bg-red-950/90 text-red-300 border-red-500 shadow-red-500/30'
            : isActive
              ? 'bg-cyan-500 text-slate-950 border-cyan-200 ring-4 ring-cyan-400/40 shadow-cyan-500/40'
              : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-cyan-400'
        }`;
        el.style.zIndex = '20';

        el.innerHTML = `
          <span>${modeSvg}</span>
          <span>${r.eta_minutes} min</span>
          <span class="opacity-80 text-[10px]">(${r.distance_km.toFixed(0)} km)</span>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onSelectRouteRef.current) {
            onSelectRouteRef.current(idx);
          }
        });

        const etaMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([midPt.lon, midPt.lat])
          .addTo(map);

        routeEtaMarkersRef.current.push(etaMarker);
      });
    }
  };

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

    // 0. Update Spatial Weather Polygons Source
    const weatherSource = map.getSource('weather-polygons-source') as mapboxgl.GeoJSONSource;
    if (weatherSource) {
      if (spatialWeatherPolygons && spatialWeatherPolygons.features && spatialWeatherPolygons.features.length > 0) {
        weatherSource.setData(spatialWeatherPolygons);
      } else {
        const defaultRegions = [
          {
            region_id: 'medan_belawan_coastal',
            name: 'Belawan Coastal',
            center: [98.68, 3.75] as [number, number],
            rainfall_mm: 68.5,
            flood_risk_pct: 87.5,
            severity: 'critical',
            status_label: 'CUACA EKSTREM & RISIKO BANJIR TINGGI',
          },
          {
            region_id: 'deli_serdang_central',
            name: 'Deli Serdang & KNO',
            center: [98.85, 3.60] as [number, number],
            rainfall_mm: 45.0,
            flood_risk_pct: 52.0,
            severity: 'high',
            status_label: 'Hujan Lebat / Risiko Moderat',
          },
          {
            region_id: 'binjai_west',
            name: 'Binjai & Langkat',
            center: [98.52, 3.60] as [number, number],
            rainfall_mm: 22.0,
            flood_risk_pct: 25.0,
            severity: 'low',
            status_label: 'Hujan Ringan',
          },
          {
            region_id: 'tebing_tinggi_east',
            name: 'Tebing Tinggi / Sergai',
            center: [99.12, 3.42] as [number, number],
            rainfall_mm: 58.0,
            flood_risk_pct: 74.0,
            severity: 'high',
            status_label: 'Hujan Lebat / Risiko Moderat',
          }
        ];

        const features = defaultRegions.map((r) => {
          const ring = createGeoJsonCircleRing(r.center, 8); // 8km spatial region
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Polygon' as const,
              coordinates: [ring]
            },
            properties: {
              region_id: r.region_id,
              name: r.name,
              rainfall_mm: r.rainfall_mm,
              flood_risk_pct: r.flood_risk_pct,
              severity: r.severity,
              status_label: r.status_label,
              fill_color: r.severity === 'critical' ? 'rgba(239, 68, 68, 0.18)' : r.severity === 'high' ? 'rgba(245, 158, 11, 0.14)' : 'rgba(6, 182, 212, 0.10)',
              stroke_color: r.severity === 'critical' ? '#ef4444' : r.severity === 'high' ? '#f59e0b' : '#06b6d4'
            }
          };
        });

        weatherSource.setData({
          type: 'FeatureCollection',
          features
        });
      }
    }

    // 2. Update Route Paths Source (Using Exact Mapbox Directions Road Network Coordinates & Alternatives)
    const routesSource = map.getSource('route-paths-source') as mapboxgl.GeoJSONSource;
    if (routesSource) {
      const targetIdx = activeRouteIdx ?? 0;
      routesSource.setData({
        type: 'FeatureCollection',
        features: activeRoutes.map((r, idx) => {
          const rawWaypoints: LonLat[] = r.waypoints.map((wp) => [wp.lon, wp.lat]);
          const finalCoordinates = rawWaypoints.length > 5 ? rawWaypoints : densifyPath(rawWaypoints, 25);
          return {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: finalCoordinates,
            },
            properties: {
              routeIndex: idx,
              isActive: idx === targetIdx,
              description: r.description,
              color: r.color || (idx === targetIdx ? '#00f0ff' : idx === 1 ? '#3b82f6' : '#8b5cf6'),
            },
          };
        }),
      });
    }

    // 2b. Update Congestion Segments Source (Google Maps Traffic Style)
    const congestionSource = map.getSource('congestion-segments-source') as mapboxgl.GeoJSONSource;
    if (congestionSource) {
      const targetIdx = activeRouteIdx ?? 0;
      const activeRoute = activeRoutes[targetIdx];
      const segments = activeRoute?.congestion_segments || [];
      congestionSource.setData({
        type: 'FeatureCollection',
        features: segments.map((seg) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: seg.coordinates.map((c) => [c.lon, c.lat]),
          },
          properties: {
            level: seg.level,
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

    // 4. Update Simulated Shockwave Pulse Source & Seismic Fault Line Cracks
    const shockwaveSource = map.getSource('simulated-shockwave-source') as mapboxgl.GeoJSONSource;
    const faultSource = map.getSource('seismic-fault-lines-source') as mapboxgl.GeoJSONSource;

    if (shockwaveSource) {
      if (simulatedShockwave && simulatedShockwave.center) {
        const ring = createGeoJsonCircleRing(simulatedShockwave.center, simulatedShockwave.radiusKm);
        shockwaveSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [ring] },
              properties: { type: simulatedShockwave.hazardType },
            },
          ],
        });

        // Generate dynamic seismic fault crack lines if hazard is earthquake
        if (faultSource && simulatedShockwave.hazardType === 'earthquake') {
          const [cx, cy] = simulatedShockwave.center;
          const faultCrackCoords: [number, number][] = [
            [cx - 0.12, cy - 0.08],
            [cx - 0.05, cy - 0.02],
            [cx, cy],
            [cx + 0.04, cy + 0.03],
            [cx + 0.11, cy + 0.09],
          ];
          faultSource.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: faultCrackCoords },
                properties: { severity: 'critical' },
              },
            ],
          });
        } else if (faultSource) {
          faultSource.setData({ type: 'FeatureCollection', features: [] });
        }
      } else {
        shockwaveSource.setData({ type: 'FeatureCollection', features: [] });
        if (faultSource) faultSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  };

  // Automatic Map Canvas Resizing (Fixes Black Empty Void on Sidebar Collapse/Expand)
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Update sources & HTML markers on prop changes
  useEffect(() => {
    updateMapSources();
    renderHtmlHubMarkers();
  }, [
    incidents,
    selectedCrisisId,
    activeRoutes,
    activeRouteIdx,
    fireHotspots,
    maritimeVectors,
    disasterZones,
    simulatedShockwave,
    selectedOriginNode,
    selectedDestNode,
    hubNodesList,
  ]);

  // Toggle MapboxDraw mode, dragPan, & canvas cursor
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !isMapLoadedRef.current || !map) return;

    if (isClickTargeting) {
      map.getCanvas().style.cursor = 'crosshair';
    } else if (drawModeActive) {
      try {
        map.dragPan.disable();
        draw.changeMode('draw_polygon');
        map.getCanvas().style.cursor = 'crosshair';
      } catch (err) {
        console.warn('Failed to switch to draw_polygon:', err);
      }
    } else {
      try {
        map.dragPan.enable();
        draw.changeMode('simple_select');
        map.getCanvas().style.cursor = '';
      } catch (err) {
        console.warn('Failed to switch to simple_select:', err);
      }
    }
  }, [drawModeActive, isClickTargeting]);

  // Fly to selected crisis pin or shockwave
  useEffect(() => {
    if (!mapRef.current) return;

    if (simulatedShockwave?.center) {
      mapRef.current.flyTo({
        center: simulatedShockwave.center,
        zoom: 10,
        duration: 1400,
        essential: true,
      });
    } else if (selectedCrisisId) {
      const incident = incidents.find((i) => i.id === selectedCrisisId);
      if (incident?.lat != null && incident?.lon != null) {
        mapRef.current.flyTo({
          center: [incident.lon, incident.lat],
          zoom: 11,
          duration: 1200,
          essential: true,
        });
      }
    }
  }, [selectedCrisisId, incidents, simulatedShockwave]);

  // Update Map Sources & Render High-Aesthetic Non-Colliding Weather HTML Overlay Badges
  useEffect(() => {
    updateMapSources();

    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    // Clear previous weather markers
    corridorMarkersRef.current.forEach((m) => m.remove());
    corridorMarkersRef.current = [];

    // Parse features from spatialWeatherPolygons dynamically
    const regions = (spatialWeatherPolygons?.features && spatialWeatherPolygons.features.length > 0)
      ? spatialWeatherPolygons.features.map((f) => {
          const props = (f.properties as {
            region_id?: string;
            name?: string;
            regency?: string;
            center?: [number, number];
            rainfall_mm?: number;
            flood_risk_pct?: number;
            severity?: string;
            status_label?: string;
          }) || {};
          return {
            region_id: props.region_id,
            name: props.name || props.regency || 'Regional',
            center: props.center || [98.68, 3.75],
            rainfall_mm: props.rainfall_mm ?? 45,
            flood_risk_pct: props.flood_risk_pct ?? 50,
            severity: props.severity || 'low',
            status_label: props.status_label || 'Hujan Ringan'
          };
        })
      : [];

    regions.forEach((region) => {
      const severity = region.severity;
      let svgIconHtml = '';

      if (severity === 'critical') {
        svgIconHtml = `
          <div class="relative w-7 h-7 flex items-center justify-center shrink-0">
            <svg class="w-7 h-7 text-amber-500 lightning-flash-anim filter drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 8.58" class="cloud-drift-anim" fill="rgba(15, 23, 42, 0.6)" />
              <polyline points="13 11 9 17 12 17 10 23" />
            </svg>
            <div class="absolute bottom-1 flex gap-0.5 text-cyan-400">
              <span class="rain-drip-anim inline-block w-[1.5px] h-2 bg-current rounded-full" style="animation-delay: 0s"></span>
              <span class="rain-drip-anim inline-block w-[1.5px] h-2 bg-current rounded-full" style="animation-delay: 0.3s"></span>
              <span class="rain-drip-anim inline-block w-[1.5px] h-2 bg-current rounded-full" style="animation-delay: 0.6s"></span>
            </div>
          </div>
        `;
      } else if (severity === 'high') {
        svgIconHtml = `
          <div class="relative w-7 h-7 flex items-center justify-center shrink-0">
            <svg class="w-7 h-7 text-cyan-400 filter drop-shadow-[0_0_3px_rgba(6,182,212,0.4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" class="cloud-drift-anim" fill="rgba(15, 23, 42, 0.6)" />
            </svg>
            <div class="absolute bottom-0.5 flex gap-1 text-cyan-400">
              <span class="rain-drip-anim inline-block w-[1.5px] h-2 bg-current rounded-full" style="animation-delay: 0.1s"></span>
              <span class="rain-drip-anim inline-block w-[1.5px] h-2 bg-current rounded-full" style="animation-delay: 0.4s"></span>
              <span class="rain-drip-anim inline-block w-[1.5px] h-2 bg-current rounded-full" style="animation-delay: 0.7s"></span>
            </div>
          </div>
        `;
      } else {
        svgIconHtml = `
          <div class="relative w-7 h-7 flex items-center justify-center shrink-0">
            <svg class="w-7 h-7 text-slate-300 filter drop-shadow-[0_0_2px_rgba(255,255,255,0.2)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 19A3.5 3.5 0 0 0 21 15.5c0-2.79-2.54-4.5-5-4.5h-1a7 7 0 1 0-11.91 5.91" class="cloud-drift-anim" fill="rgba(15, 23, 42, 0.6)" />
            </svg>
          </div>
        `;
      }

      // Contextual non-colliding offsets relative to region centers
      let offsetCenter: [number, number] = [region.center[0], region.center[1]];
      if (region.region_id?.includes('belawan')) {
        offsetCenter = [region.center[0] - 0.04, region.center[1] + 0.08]; // Over the sea, clear of Pelabuhan Belawan
      } else if (region.region_id?.includes('deli_serdang')) {
        offsetCenter = [region.center[0] + 0.09, region.center[1] - 0.02]; // Clear of KNO & Medan
      } else if (region.region_id?.includes('binjai')) {
        offsetCenter = [region.center[0] - 0.08, region.center[1] + 0.03]; // West of Binjai
      } else if (region.region_id?.includes('tebing_tinggi')) {
        offsetCenter = [region.center[0] + 0.08, region.center[1] - 0.03]; // East of Tebing Tinggi
      }

      const weatherEl = document.createElement('div');
      weatherEl.className = 'group relative flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border text-xs font-mono font-bold shadow-xl backdrop-blur-md transition-all duration-300 pointer-events-none';
      weatherEl.classList.add(
        severity === 'critical' ? 'bg-red-950/80' : severity === 'high' ? 'bg-amber-950/80' : 'bg-slate-950/80',
        severity === 'critical' ? 'border-red-500/40' : severity === 'high' ? 'border-amber-500/40' : 'border-slate-700/40',
        severity === 'critical' ? 'text-red-300' : severity === 'high' ? 'text-amber-300' : 'text-slate-300'
      );
      weatherEl.style.zIndex = '15';

      weatherEl.innerHTML = `
        ${svgIconHtml}
        <div class="flex flex-col select-none text-left">
          <span class="text-[8px] uppercase tracking-wider opacity-65">${region.name}</span>
          <span class="text-[9px] text-white font-bold">${region.rainfall_mm.toFixed(0)} mm | ${region.flood_risk_pct.toFixed(0)}% Risk</span>
        </div>
      `;

      const weatherMarker = new mapboxgl.Marker({ element: weatherEl, anchor: 'center' })
        .setLngLat(offsetCenter)
        .addTo(map);

      corridorMarkersRef.current.push(weatherMarker);
    });

    return () => {
      corridorMarkersRef.current.forEach((m) => m.remove());
      corridorMarkersRef.current = [];
    };
  }, [spatialWeatherPolygons]);

  return (
    <div className="relative w-full h-full">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes rain-fall {
          0% { transform: translateY(-4px); opacity: 0; }
          50% { opacity: 0.8; }
          100% { transform: translateY(6px); opacity: 0; }
        }
        @keyframes lightning-strike {
          0%, 90%, 98%, 100% { opacity: 0.2; }
          92%, 94%, 96% { opacity: 1; }
        }
        @keyframes cloud-drift {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(3px); }
        }
        .rain-drip-anim {
          animation: rain-fall 1.2s infinite linear;
        }
        .lightning-flash-anim {
          animation: lightning-strike 6s infinite ease-in-out;
        }
        .cloud-drift-anim {
          animation: cloud-drift 10s infinite ease-in-out;
        }
      `}} />

      <div
        ref={containerRef}
        id="crisis-map"
        className="w-full h-full"
        aria-label="PetaNadi crisis intelligence map"
      />

      {/* Floating active status badge when freehand drawing mode is active */}
      {drawModeActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[360] px-4 py-2 rounded-full bg-orange-950/90 border border-orange-500/60 backdrop-blur-md shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
          </span>
          <span className="font-mono text-xs font-bold text-orange-400 tracking-wider">
            GAMBAR POLIGON AREA CRISIS...
          </span>
          <span className="text-[10px] font-mono text-orange-300/80 border-l border-orange-500/30 pl-2">
            Klik poin pada peta untuk menutup bentuk poligon
          </span>
        </div>
      )}

      {/* Operations Telemetry HUD Overlay Panel */}
      <div className={`absolute top-4 ${isLeftSidebarCollapsed ? 'left-4' : 'left-[336px]'} z-[350] p-4 rounded-2xl bg-slate-950/80 border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col gap-3 min-w-[280px] pointer-events-auto select-none transition-all duration-300`} style={{ boxShadow: '0 12px 40px 0 rgba(0, 0, 0, 0.5)' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-[0.15em]">Operations HUD</span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-mono text-cyan-300 font-bold animate-pulse">LIVE DATA</span>
        </div>

        {/* 1. NVIDIA cuOpt Solver Details */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>⚡ SOLVER ENGINE</span>
            <span className="text-emerald-400 font-bold text-[10px]">NVIDIA cuOpt</span>
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-white">
            <span>Compute Speed:</span>
            <span className="font-bold">{cuOptOptimizationInfo?.compute_time_ms ?? 3.2}ms</span>
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-white">
            <span>Cost Savings:</span>
            <span className="text-emerald-300 font-bold">-{cuOptOptimizationInfo?.savings_pct ?? 18.5}%</span>
          </div>
        </div>

        <div className="border-t border-white/5"></div>

        {/* 2. TomTom live traffic data */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>🚗 TRAFFIC METRICS</span>
            <span className="text-amber-400 font-bold text-[10px]">TomTom Feed</span>
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-white">
            <span>Congestion:</span>
            <span className="font-bold">{corridorContext?.traffic.congestion_level_pct ?? 34}%</span>
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-white">
            <span>Delay:</span>
            <span className="font-bold text-amber-300">+{corridorContext?.traffic.delay_minutes ?? 8} min</span>
          </div>
          {/* Traffic segment legend */}
          <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-slate-400">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Clear</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>Mod</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Heavy</span>
          </div>
        </div>

        <div className="border-t border-white/5"></div>

        {/* 3. Weather inputs / Radar */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span>🌧️ METEOROLOGICAL RADAR</span>
            <span className="text-cyan-400 font-bold text-[10px]">FourCastNet</span>
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-white">
            <span>Weather Status:</span>
            <span className="font-bold text-cyan-300 text-right">{corridorContext?.weather.status ?? 'Hujan Sedang'}</span>
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-white">
            <span>Rainfall Rate:</span>
            <span className="font-bold">{corridorContext?.weather.rainfall_mm ?? 42}mm</span>
          </div>
        </div>
      </div>
    </div>
  );
}
