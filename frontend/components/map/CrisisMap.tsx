'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { densifyPath, type LonLat } from '@/lib/pathDensifier';
import { HUB_NODES, STRATEGIC_BASELINE_CORRIDORS, type HubNode } from '@/lib/mapboxRoutingService';
import { Layers, Check } from 'lucide-react';

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
  fleetModalityFilter?: 'all' | 'truck' | 'maritime' | 'air';
}

const INITIAL_CENTER: [number, number] = [100.5, 0.5];
const INITIAL_ZOOM = 6.0;
const DRAG_THRESHOLD_PX = 5;

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
  fleetModalityFilter = 'all',
}: CrisisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  void isLeftSidebarCollapsed;
  void corridorContext;
  void cuOptOptimizationInfo;
  void demoStage;
  void fireHotspots;

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);
  const htmlMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const routeEtaMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const corridorMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const timeHorizonMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const isMapLoadedRef = useRef(false);

  // Interactive Map Layer Filters State
  const [showLayerFilterMenu, setShowLayerFilterMenu] = useState(false);
  const [layerFilters, setLayerFilters] = useState({
    baselineCorridors: true,
    bottlenecks: true,
    weatherRadar: true,
    fleetVehicles: true,
  });

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

  // Toggle map layer visibility
  const toggleLayerFilter = (key: keyof typeof layerFilters) => {
    setLayerFilters((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const map = mapRef.current;
      if (map && isMapLoadedRef.current) {
        if (key === 'baselineCorridors') {
          const vis = next.baselineCorridors ? 'visible' : 'none';
          if (map.getLayer('baseline-corridors-line')) map.setLayoutProperty('baseline-corridors-line', 'visibility', vis);
        }
        if (key === 'bottlenecks') {
          const vis = next.bottlenecks ? 'visible' : 'none';
          if (map.getLayer('congestion-segments-line')) map.setLayoutProperty('congestion-segments-line', 'visibility', vis);
        }
        if (key === 'weatherRadar') {
          const vis = next.weatherRadar ? 'visible' : 'none';
          if (map.getLayer('weather-polygons-fill')) map.setLayoutProperty('weather-polygons-fill', 'visibility', vis);
          if (map.getLayer('weather-polygons-outline')) map.setLayoutProperty('weather-polygons-outline', 'visibility', vis);
        }
      }
      return next;
    });
  };

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

    map.on('mousedown', (e) => {
      mouseDownPosRef.current = { x: e.point.x, y: e.point.y };
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-right');

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

      renderHtmlHubMarkers();

      // 0a. Strategic Trans-Sumatra Baseline Corridors Layer (Backbone Transit Network)
      map.addSource('baseline-corridors-source', {
        type: 'geojson',
        data: STRATEGIC_BASELINE_CORRIDORS,
      });
      map.addLayer({
        id: 'baseline-corridors-line',
        type: 'line',
        source: 'baseline-corridors-source',
        paint: {
          'line-color': [
            'match', ['get', 'type'],
            'maritime', '#1e40af',
            '#334155'
          ],
          'line-width': 2.0,
          'line-dasharray': [3, 2],
          'line-opacity': 0.6,
        },
      });

      // 0b. Regional Weather & Radar Polygons Layer
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
          'line-width': 2.0,
          'line-dasharray': [4, 3],
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
        },
      });

      // 1b. Historical Episodes Layer (PAST Mode)
      map.addSource('historical-episodes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'historical-episodes-fill',
        type: 'fill',
        source: 'historical-episodes-source',
        paint: {
          'fill-color': 'rgba(168, 85, 247, 0.25)',
          'fill-opacity': 0.75,
        },
      });
      map.addLayer({
        id: 'historical-episodes-outline',
        type: 'line',
        source: 'historical-episodes-source',
        paint: {
          'line-color': '#a855f7',
          'line-width': 2.0,
          'line-dasharray': [4, 2],
        },
      });

      // 1c. Predictive Risks Layer (FUTURE Mode with opacity proportional to risk score)
      map.addSource('predictive-risks-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'predictive-risks-fill',
        type: 'fill',
        source: 'predictive-risks-source',
        paint: {
          'fill-color': 'rgba(234, 179, 8, 0.30)',
          'fill-opacity': 0.80,
        },
      });
      map.addLayer({
        id: 'predictive-risks-outline',
        type: 'line',
        source: 'predictive-risks-source',
        paint: {
          'line-color': '#eab308',
          'line-width': 2.0,
          'line-dasharray': [2, 2],
        },
      });

      // 2. Active Route Paths Layer
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
          'line-width': ['case', ['get', 'isActive'], 6, 3.5],
          'line-opacity': ['case', ['get', 'isActive'], 0.95, 0.45],
        },
      });

      // 2b. Traffic Congestion Segments Layer (Google Maps Traffic Style)
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

      // 3. Simulated Shockwave Pulse Layer
      map.addSource('simulated-shockwave-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'simulated-shockwave-fill',
        type: 'fill',
        source: 'simulated-shockwave-source',
        paint: {
          'fill-color': 'rgba(239, 68, 68, 0.25)',
          'fill-opacity': 0.80,
        },
      });
      map.addLayer({
        id: 'simulated-shockwave-outline',
        type: 'line',
        source: 'simulated-shockwave-source',
        paint: {
          'line-color': '#ef4444',
          'line-width': 2.5,
          'line-dasharray': [2, 1],
        },
      });

      // Map click handler for point targeting
      map.on('click', (e) => {
        if (isClickTargetingRef.current && onMapPointTargetedRef.current) {
          onMapPointTargetedRef.current(e.lngLat.lat, e.lngLat.lng);
        }
      });

      // Route line click handler
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

  // Render HTML Markers for Hub Nodes (Ports, Cities, Airports)
  const renderHtmlHubMarkers = () => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    htmlMarkersRef.current.forEach((m) => m.remove());
    htmlMarkersRef.current = [];

    const nodesToRender = hubNodesList || Object.values(HUB_NODES);

    nodesToRender.forEach((node) => {
      const isOrigin = node.id === selectedOriginNode;
      const isDest = node.id === selectedDestNode;

      const isPort = node.type === 'port';
      const isAir = node.type === 'airport';

      const iconSvg = isPort
        ? `<svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`
        : isAir
          ? `<svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5 0 1 .4 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.2c.3.4.8.6 1.3.4l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`
          : `<svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;

      const rawName = node.name.split('(')[0].trim();
      const shortCityName = rawName
        .replace(/^(Hub Utama Pergudangan|Hub Logistik|Interchange Tol|Interchange|Pelabuhan|Bandara Internasional|Bandara|Kota)\s+/i, '')
        .trim();

      const el = document.createElement('div');
      el.className = 'cursor-pointer group relative flex flex-col items-center select-none z-30 transition-transform transform hover:scale-110';
      el.style.zIndex = isOrigin || isDest ? '40' : '25';

      if (isOrigin || isDest) {
        el.innerHTML = `
          <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold shadow-2xl border backdrop-blur-md ${
            isOrigin
              ? 'bg-cyan-950/95 text-cyan-300 border-cyan-400 ring-4 ring-cyan-500/30'
              : 'bg-amber-950/95 text-amber-300 border-amber-400 ring-4 ring-amber-500/30'
          }">
            <span>${iconSvg}</span>
            <span class="font-bold">${shortCityName}</span>
            <span class="px-1.5 py-0.5 ${isOrigin ? 'bg-cyan-400 text-slate-950' : 'bg-amber-400 text-slate-950'} rounded text-[9px] font-black">${isOrigin ? 'ASAL' : 'TUJUAN'}</span>
          </div>
        `;
      } else {
        el.innerHTML = `
          <div class="flex flex-col items-center">
            <div class="w-6 h-6 rounded-full border border-white/20 bg-[#0c0e12]/90 backdrop-blur-md flex items-center justify-center shadow-lg transition group-hover:border-cyan-400 group-hover:scale-110 ${
              isPort ? 'text-cyan-400 border-cyan-500/40' : isAir ? 'text-purple-400 border-purple-500/40' : 'text-emerald-400 border-emerald-500/40'
            }">
              ${iconSvg}
            </div>
            <span class="mt-0.5 px-1.5 py-0.2 rounded bg-slate-950/80 border border-white/10 text-[9px] font-mono text-slate-300 group-hover:text-cyan-300 group-hover:border-cyan-500/40 shadow-sm transition whitespace-nowrap">
              ${shortCityName}
            </span>
          </div>
          <div class="opacity-0 group-hover:opacity-100 absolute -top-8 px-2 py-0.5 rounded-lg bg-[#0c0e12]/95 border border-white/20 text-[10px] font-mono text-white shadow-xl pointer-events-none transition whitespace-nowrap z-50">
            ${node.name} ${node.province ? `(${node.province})` : ''}
          </div>
        `;
      }

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

    // Render On-Map Route ETA Badges
    if (activeRoutes && activeRoutes.length > 0) {
      activeRoutes.forEach((r, idx) => {
        if (!r.waypoints || r.waypoints.length === 0) return;
        const midIdx = Math.floor(r.waypoints.length / 2);
        const midPt = r.waypoints[midIdx];
        if (!midPt || midPt.lon == null || midPt.lat == null) return;

        const isActive = (activeRouteIdx ?? 0) === idx;
        const isHold = r.safety_status === 'HOLD_DELAY';

        const el = document.createElement('div');
        el.className = `cursor-pointer z-20 transition-all transform hover:scale-110 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold shadow-2xl border backdrop-blur-md ${
          r.is_compromised
            ? 'bg-red-950/90 text-red-300 border-red-500 shadow-red-500/30'
            : isHold
              ? 'bg-amber-950/90 text-amber-300 border-amber-500 shadow-amber-500/30'
              : isActive
                ? 'bg-cyan-500 text-slate-950 border-cyan-200 ring-4 ring-cyan-400/40 shadow-cyan-500/40'
                : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-cyan-400'
        }`;
        el.style.zIndex = '20';

        el.innerHTML = `
          <span>${isHold ? 'HOLD' : `${r.eta_minutes} min`}</span>
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

  // Render Time Horizon Badges
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
          <span class="text-[11px] font-bold text-amber-300">${String(pr.risk_score || 85)}% RISIKO</span>
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

    // 1. Update Weather Polygons
    const weatherSource = map.getSource('weather-polygons-source') as mapboxgl.GeoJSONSource;
    if (weatherSource) {
      if (spatialWeatherPolygons && spatialWeatherPolygons.features && spatialWeatherPolygons.features.length > 0) {
        weatherSource.setData(spatialWeatherPolygons);
      } else {
        weatherSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 2. Update Active Route Paths
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

    // 2b. Update Congestion Segments
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

    // 3. Update Disaster Zones
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

    // 3b. Update Historical Episodes (PAST Mode)
    const historicalSource = map.getSource('historical-episodes-source') as mapboxgl.GeoJSONSource;
    if (historicalSource) {
      if (activeTimeFilter === 'past' && historicalEpisodes.length > 0) {
        const histFeatures: GeoJSON.Feature[] = [];
        historicalEpisodes.forEach((ep) => {
          const geom = ep.geojson_geometry as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
          if (!geom) return;
          if (geom.type === 'FeatureCollection' && Array.isArray(geom.features)) {
            histFeatures.push(...geom.features);
          } else if (geom.type === 'Feature') {
            histFeatures.push(geom);
          }
        });
        historicalSource.setData({ type: 'FeatureCollection', features: histFeatures });
      } else {
        historicalSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 3c. Update Predictive Risks (FUTURE Mode)
    const predictiveSource = map.getSource('predictive-risks-source') as mapboxgl.GeoJSONSource;
    if (predictiveSource) {
      if (activeTimeFilter === 'future' && predictiveRisks.length > 0) {
        const predFeatures: GeoJSON.Feature[] = [];
        predictiveRisks.forEach((pr) => {
          const geom = pr.geojson_geometry as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
          if (!geom) return;
          if (geom.type === 'FeatureCollection' && Array.isArray(geom.features)) {
            predFeatures.push(...geom.features);
          } else if (geom.type === 'Feature') {
            predFeatures.push(geom);
          }
        });
        predictiveSource.setData({ type: 'FeatureCollection', features: predFeatures });
      } else {
        predictiveSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 4. Update Simulated Shockwave Pulse
    const shockwaveSource = map.getSource('simulated-shockwave-source') as mapboxgl.GeoJSONSource;
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
      } else {
        shockwaveSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  };

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

  useEffect(() => {
    updateMapSources();
    renderHtmlHubMarkers();
    renderTimeHorizonMarkers();
  }, [
    incidents,
    selectedCrisisId,
    activeRoutes,
    activeRouteIdx,
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

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        id="crisis-map"
        className="w-full h-full"
        aria-label="PreHub crisis intelligence map"
      />

      {/* Dynamic Fleet Vehicle Layer */}
      {layerFilters.fleetVehicles && (
        <FleetVehicleLayer
          map={mapInstance || mapRef.current}
          vehicles={activeFleet || []}
          activeRoutes={activeRoutes}
          activeRouteIdx={activeRouteIdx}
          modalityFilter={fleetModalityFilter}
        />
      )}

      {/* Floating Map Layer Filters Control */}
      <div className="absolute top-4 right-44 z-30 pointer-events-auto">
        <button
          type="button"
          onClick={() => setShowLayerFilterMenu((v) => !v)}
          className={`cursor-pointer px-3 py-2 rounded-xl border backdrop-blur-xl text-xs font-mono font-bold shadow-2xl transition-all flex items-center gap-1.5 ${
            showLayerFilterMenu
              ? 'bg-cyan-950 text-cyan-300 border-cyan-400 ring-2 ring-cyan-500/30'
              : 'bg-[#0c0e12]/90 text-slate-300 border-white/10 hover:text-white hover:border-white/20'
          }`}
          title="Filter Layer Peta"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>LAYER PETA</span>
        </button>

        {showLayerFilterMenu && (
          <div className="absolute right-0 mt-2 w-64 bg-[#0c0e12]/95 border border-cyan-500/30 backdrop-blur-2xl p-3 rounded-2xl shadow-2xl text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150">
            <div className="font-mono font-bold text-[10px] text-cyan-300 uppercase tracking-wider border-b border-white/10 pb-1.5">
              Filter Visualisasi Layer
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => toggleLayerFilter('baselineCorridors')}
                className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 transition"
              >
                <span className="text-slate-200">Koridor Utama</span>
                <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                  layerFilters.baselineCorridors ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-700'
                }`}>
                  {layerFilters.baselineCorridors && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleLayerFilter('bottlenecks')}
                className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 transition"
              >
                <span className="text-slate-200">Kemacetan / Bottleneck</span>
                <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                  layerFilters.bottlenecks ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-700'
                }`}>
                  {layerFilters.bottlenecks && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleLayerFilter('weatherRadar')}
                className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 transition"
              >
                <span className="text-slate-200">Radar Cuaca & Bahaya</span>
                <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                  layerFilters.weatherRadar ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-700'
                }`}>
                  {layerFilters.weatherRadar && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleLayerFilter('fleetVehicles')}
                className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 transition"
              >
                <span className="text-slate-200">Armada Logistik</span>
                <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                  layerFilters.fleetVehicles ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-700'
                }`}>
                  {layerFilters.fleetVehicles && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {drawModeActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[360] px-4 py-2 rounded-full bg-orange-950/90 border border-orange-500/60 backdrop-blur-md shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
          </span>
          <span className="font-mono text-xs font-bold text-orange-400 tracking-wider">
            GAMBAR POLIGON AREA DISRUPSI...
          </span>
          <span className="text-[10px] font-mono text-orange-300/80 border-l border-orange-500/30 pl-2">
            Klik titik pada peta untuk menutup bentuk poligon
          </span>
        </div>
      )}
    </div>
  );
}
