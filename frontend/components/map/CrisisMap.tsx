'use client';

import { useEffect, useRef, useState } from 'react';
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
  FleetVehicle,
  DisasterZone,
} from '@/lib/types';
import { FleetVehicleLayer } from './FleetVehicleLayer';


export interface CrisisMapProps {
  incidents: IncidentSummary[];
  selectedCrisisId: string | null;
  onCrisisClick: (id: string) => void;
  activeRoutes: RouteRecommendation[];
  activeRouteIdx: number | null;
  fireHotspots: FireHotspot[];
  activeFleet?: FleetVehicle[];
  demoStage?: number | null;
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
  activeTimeFilter?: 'past' | 'present' | 'future' | 'predict';
  historicalEpisodes?: Record<string, unknown>[];
  predictiveRisks?: Record<string, unknown>[];
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
  activeFleet = [],
  demoStage = null,
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

  activeTimeFilter = 'present',
  historicalEpisodes = [],
  predictiveRisks = [],
}: CrisisMapProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  void isLeftSidebarCollapsed;
  void corridorContext;
  void cuOptOptimizationInfo;
  void demoStage;


  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);
  const htmlMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const routeEtaMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const corridorMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const timeHorizonMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);

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

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

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
      setMapInstance(map);
      map.addControl(draw, 'top-left');

      // Immediately render interactive Hub Node Markers on map load
      renderHtmlHubMarkers();

      // 0. Regional Administrative Spatial Coverage Layer (Google Maps ADM Style Dashed Borders)
      map.addSource('weather-polygons-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'weather-polygons-fill',
        type: 'fill',
        source: 'weather-polygons-source',
        paint: {
          'fill-color': ['coalesce', ['get', 'fill_color'], 'rgba(239, 68, 68, 0.15)'],
          'fill-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'weather-polygons-outline',
        type: 'line',
        source: 'weather-polygons-source',
        paint: {
          'line-color': ['coalesce', ['get', 'stroke_color'], '#ef4444'],
          'line-width': 2.5,
          'line-dasharray': [4, 3],
        },
      });

      // Interactive Hover Popup for District Logistics Boundaries
      const districtPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'district-hover-popup',
      });

      map.on('mouseenter', 'weather-polygons-fill', (e) => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
        if (e.features && e.features[0]) {
          const props = e.features[0].properties;
          if (props) {
            districtPopup.setLngLat(e.lngLat).setHTML(`
              <div style="background: rgba(12, 14, 18, 0.95); border: 1px solid rgba(0, 240, 255, 0.4); border-radius: 12px; padding: 10px 12px; color: #f8fafc; font-family: monospace; font-size: 11px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <div style="font-weight: 900; color: #00f0ff; margin-bottom: 6px; display: flex; items-center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
                  <span>📍</span> <span>${props.name}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
                  <span style="color: #94a3b8;">Curah Hujan:</span>
                  <span style="font-weight: bold; color: #ffffff;">${props.rainfall_mm} mm/j</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px;">
                  <span style="color: #94a3b8;">Risiko Genangan:</span>
                  <span style="font-weight: bold; color: #f59e0b;">${props.flood_risk_pct}%</span>
                </div>
                <div style="font-size: 9px; color: #06b6d4; font-style: italic;">${props.status_label}</div>
              </div>
            `).addTo(map);
          }
        }
      });

      map.on('mouseleave', 'weather-polygons-fill', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
        districtPopup.remove();
      });

      // 1. Disaster Zones GeoJSON Layer (Multi-Hazard Dynamic Styling)
      map.addSource('disaster-zones-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'disaster-zones-fill',
        type: 'fill',
        source: 'disaster-zones-source',
        paint: {
          'fill-color': [
            'match', ['get', 'type'],
            'flood', 'rgba(6, 182, 212, 0.35)',
            'earthquake', 'rgba(244, 63, 94, 0.35)',
            'landslide', 'rgba(217, 119, 6, 0.35)',
            'wildfire', 'rgba(249, 115, 22, 0.35)',
            'congestion', 'rgba(234, 179, 8, 0.30)',
            'rgba(249, 115, 22, 0.25)'
          ],
          'fill-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'disaster-zones-outline',
        type: 'line',
        source: 'disaster-zones-source',
        paint: {
          'line-color': [
            'match', ['get', 'type'],
            'flood', '#06b6d4',
            'earthquake', '#f43f5e',
            'landslide', '#d97706',
            'wildfire', '#f97316',
            'congestion', '#eab308',
            '#f97316'
          ],
          'line-width': 2.5,
          'line-dasharray': ['case', ['==', ['get', 'type'], 'earthquake'], ['literal', [2, 2]], ['literal', [1, 0]]],
        },
      });

      // 1b. Historical Episodes Layer (PAST Mode - Hazard Differentiated Colors)
      map.addSource('historical-episodes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'historical-episodes-fill',
        type: 'fill',
        source: 'historical-episodes-source',
        paint: {
          'fill-color': [
            'match', ['get', 'type'],
            'flood', 'rgba(6, 182, 212, 0.32)',
            'earthquake', 'rgba(244, 63, 94, 0.32)',
            'landslide', 'rgba(217, 119, 6, 0.35)',
            'wildfire', 'rgba(249, 115, 22, 0.35)',
            'congestion', 'rgba(234, 179, 8, 0.30)',
            'rgba(168, 85, 247, 0.30)'
          ],
          'fill-opacity': ['coalesce', ['get', 'opacity'], 0.80],
        },
      });
      map.addLayer({
        id: 'historical-episodes-outline',
        type: 'line',
        source: 'historical-episodes-source',
        paint: {
          'line-color': [
            'match', ['get', 'type'],
            'flood', '#06b6d4',
            'earthquake', '#f43f5e',
            'landslide', '#d97706',
            'wildfire', '#f97316',
            'congestion', '#eab308',
            '#a855f7'
          ],
          'line-width': 2.5,
          'line-dasharray': [4, 2],
        },
      });

      // 1c. 24-48h TFT Predictive Risks Layer (FUTURE Mode)
      map.addSource('predictive-risks-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'predictive-risks-fill',
        type: 'fill',
        source: 'predictive-risks-source',
        paint: {
          'fill-color': 'rgba(234, 179, 8, 0.28)',
          'fill-opacity': 0.80,
        },
      });
      map.addLayer({
        id: 'predictive-risks-outline',
        type: 'line',
        source: 'predictive-risks-source',
        paint: {
          'line-color': '#eab308',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
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

      // 4. Crisis Pins GeoJSON Layer (Clean Canvas - Hidden Redundant Dots)
      map.addSource('crisis-pins-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'crisis-pins-glow',
        type: 'circle',
        source: 'crisis-pins-source',
        paint: {
          'circle-radius': 0,
          'circle-opacity': 0.0,
        },
      });

      map.addLayer({
        id: 'crisis-pins-core',
        type: 'circle',
        source: 'crisis-pins-source',
        paint: {
          'circle-radius': 0,
          'circle-opacity': 0.0,
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

  // Render Compact Lucide SVG Badges for Time Horizon Modes (Zero Canvas Clutter!)
  const renderTimeHorizonMarkers = () => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    timeHorizonMarkersRef.current.forEach((m) => m.remove());
    timeHorizonMarkersRef.current = [];

    if (activeTimeFilter === 'past' && historicalEpisodes && historicalEpisodes.length > 0) {
      historicalEpisodes.forEach((epItem) => {
        const ep = epItem as Record<string, unknown>;
        const lon = typeof ep.lon === 'number' ? ep.lon : null;
        const lat = typeof ep.lat === 'number' ? ep.lat : null;
        const id = (ep.incident_id || ep.id) as string;
        if (lon == null || lat == null) return;

        const el = document.createElement('div');
        el.className = 'cursor-pointer z-30 transition-all transform hover:scale-110 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold shadow-2xl border backdrop-blur-xl bg-[#0c0e12]/95 text-purple-200 border-purple-500/60 ring-2 ring-purple-500/20';
        el.style.zIndex = '30';
        el.innerHTML = `
          <svg class="w-3.5 h-3.5 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
          <span class="text-[11px] font-bold text-purple-200">${String(ep.type || 'LTM').toUpperCase()}</span>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (id && onCrisisClickRef.current) {
            onCrisisClickRef.current(id);
          }
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lon, lat])
          .addTo(map);
        timeHorizonMarkersRef.current.push(marker);
      });
    } else if (activeTimeFilter === 'future' && predictiveRisks && predictiveRisks.length > 0) {
      predictiveRisks.forEach((prItem) => {
        const pr = prItem as Record<string, unknown>;
        const lon = typeof pr.lon === 'number' ? pr.lon : null;
        const lat = typeof pr.lat === 'number' ? pr.lat : null;
        const id = (pr.risk_id || pr.id) as string;
        if (lon == null || lat == null) return;

        const el = document.createElement('div');
        el.className = 'cursor-pointer z-30 transition-all transform hover:scale-110 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold shadow-2xl border backdrop-blur-xl bg-[#0c0e12]/95 text-amber-200 border-amber-500/60 ring-2 ring-amber-500/20';
        el.style.zIndex = '30';
        el.innerHTML = `
          <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span class="text-[11px] font-bold text-amber-300">${String(pr.risk_score || 85)}% RISK</span>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (id && onCrisisClickRef.current) {
            onCrisisClickRef.current(id);
          }
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lon, lat])
          .addTo(map);
        timeHorizonMarkersRef.current.push(marker);
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

    // 0. Update Spatial Weather Polygons Source (Only populates if organic radar data exists; 0 artificial boxes!)
    const weatherSource = map.getSource('weather-polygons-source') as mapboxgl.GeoJSONSource;
    if (weatherSource) {
      if (activeTimeFilter === 'past' || activeTimeFilter === 'future') {
        if (map.getLayer('weather-polygons-fill')) {
          map.setLayoutProperty('weather-polygons-fill', 'visibility', 'none');
          map.setLayoutProperty('weather-polygons-outline', 'visibility', 'none');
        }
      } else {
        if (map.getLayer('weather-polygons-fill')) {
          map.setLayoutProperty('weather-polygons-fill', 'visibility', 'visible');
          map.setLayoutProperty('weather-polygons-outline', 'visibility', 'visible');
        }
        if (spatialWeatherPolygons && spatialWeatherPolygons.features && spatialWeatherPolygons.features.length > 0) {
          weatherSource.setData(spatialWeatherPolygons);
        } else {
          // Zero artificial boxes! Clean dark Mapbox canvas
          weatherSource.setData({ type: 'FeatureCollection', features: [] });
        }
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
      let segments = activeRoute?.congestion_segments || [];

      // If no route-specific segments, render default corridor highway segments from corridorContext
      if (segments.length === 0) {
        const tomtomPct = corridorContext?.traffic?.congestion_level_pct ?? 74.2;
        const mainLevel = tomtomPct > 70 ? 'heavy' : tomtomPct > 40 ? 'moderate' : 'low';
        segments = [
          { coordinates: [{ lon: 98.67, lat: 3.78 }, { lon: 98.68, lat: 3.70 }], level: 'heavy' },
          { coordinates: [{ lon: 98.68, lat: 3.70 }, { lon: 98.71, lat: 3.62 }], level: mainLevel },
          { coordinates: [{ lon: 98.71, lat: 3.62 }, { lon: 98.88, lat: 3.55 }], level: 'moderate' },
          { coordinates: [{ lon: 98.88, lat: 3.55 }, { lon: 99.16, lat: 3.32 }], level: 'low' },
        ];
      }

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

    // 3b. Update Historical Episodes Source (PAST Mode)
    const historicalSource = map.getSource('historical-episodes-source') as mapboxgl.GeoJSONSource;
    if (historicalSource) {
      if (activeTimeFilter === 'past' && historicalEpisodes.length > 0) {
        const histFeatures: GeoJSON.Feature[] = [];
        historicalEpisodes.forEach((ep) => {
          const geom = ep.geojson_geometry as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
          if (!geom) return;
          if (geom.type === 'FeatureCollection') {
            if (Array.isArray(geom.features)) {
              histFeatures.push(...geom.features);
            }
          } else if (geom.type === 'Feature') {
            histFeatures.push(geom);
          }
        });
        historicalSource.setData({
          type: 'FeatureCollection',
          features: histFeatures,
        });
      } else {
        historicalSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 3c. Update 24-48h TFT Predictive Risks Source (FUTURE Mode)
    const predictiveSource = map.getSource('predictive-risks-source') as mapboxgl.GeoJSONSource;
    if (predictiveSource) {
      if (activeTimeFilter === 'future' && predictiveRisks.length > 0) {
        const predFeatures: GeoJSON.Feature[] = [];
        predictiveRisks.forEach((pr) => {
          const geom = pr.geojson_geometry as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
          if (!geom) return;
          if (geom.type === 'FeatureCollection') {
            if (Array.isArray(geom.features)) {
              predFeatures.push(...geom.features);
            }
          } else if (geom.type === 'Feature') {
            predFeatures.push(geom);
          }
        });
        predictiveSource.setData({
          type: 'FeatureCollection',
          features: predFeatures,
        });
      } else {
        predictiveSource.setData({ type: 'FeatureCollection', features: [] });
      }
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
    renderTimeHorizonMarkers();
  }, [
    incidents,
    selectedCrisisId,
    activeRoutes,
    activeRouteIdx,
    fireHotspots,
    activeFleet,
    disasterZones,
    simulatedShockwave,
    selectedOriginNode,
    selectedDestNode,
    hubNodesList,
    activeTimeFilter,
    historicalEpisodes,
    predictiveRisks,
  ]);


  // WebGL Native Fleet Vehicle Layer is now handled by <FleetVehicleLayer /> component (Phase 28)



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
        aria-label="PreHub crisis intelligence map"
      />

      {/* WebGL Native Fleet Vehicle Layer (Phase 28 & Phase 29) */}
      <FleetVehicleLayer
        map={mapInstance || mapRef.current}
        vehicles={activeFleet || []}
        activeRoutes={activeRoutes}
        activeRouteIdx={activeRouteIdx}
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

    </div>
  );
}

