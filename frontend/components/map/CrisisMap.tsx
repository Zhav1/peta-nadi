'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { densifyPath, type LonLat } from '@/lib/pathDensifier';
import {
  HUB_NODES,
  STRATEGIC_BASELINE_CORRIDORS,
  fetchGazetteerNodes,
  normalizeRegencyId,
  PAN_SUMATRA_GAZETTEER,
  type HubNode,
} from '@/lib/mapboxRoutingService';
import { formatNodeDisplay, prettyNodeSlug } from '@/lib/formatNode';
import {
  defaultSpatialHashArbiter,
  arbitrateVisibleLabels,
  getMapboxZoomLODExpression,
  PRIORITY_REGENCY_NODE,
  type DeclutterItem,
} from '@/lib/spatialHashArbiter';
import { api } from '@/lib/api';
import {
  Layers,
  Check,
  Search,
  X,
  MapPin,
  Crosshair,
  ArrowUpRight,
  Flag,
  Loader2,
  Navigation,
  Truck,
  Ship,
  Plane,
  EyeOff,
  RotateCcw,
  PanelLeftOpen,
} from 'lucide-react';

import type {
  IncidentSummary,
  RouteRecommendation,
  FireHotspot,
  FleetVehicle,
  DisasterZone,
  GeocodeNode,
  GeocodeSearchResult,
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
  onCustomPointSelected?: (role: 'origin' | 'dest', coords: [number, number], name: string, nodeId: string) => void;
  onSelectRoute?: (routeIdx: number) => void;
  hubNodesList?: HubNode[];
  corridorContext?: import('@/lib/types').CorridorContext | null;
  spatialWeatherPolygons?: GeoJSON.FeatureCollection | null;
  routingInfo?: { solver: string; compute_time_ms: number | null; savings_pct: number | null } | null;
  isLeftSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  fleetModalityFilter?: 'all' | 'truck' | 'maritime' | 'air';
  simSpeed?: number;
  isRightSidebarOpen?: boolean;
  topNavTelemetrySlot?: React.ReactNode;
  fleetModalitySlot?: React.ReactNode;
  mapLegendSlot?: React.ReactNode;
  corridorVisibility?: { land: boolean; sea: boolean; air: boolean };
  onToggleCorridor?: (corridor: 'land' | 'sea' | 'air') => void;
  onResetCorridorVisibility?: () => void;
  hiddenRouteIndices?: Set<number>;
  onHideRoute?: (idx: number) => void;
  onZoneClick?: (zone: DisasterZone) => void;
  flyToCoords?: { lon: number; lat: number; zoom?: number; ts: number } | null;
  selectedVehicleId?: string | null;
  onSelectVehicle?: (vehicle: FleetVehicle) => void;
  onCloseVehicle?: () => void;
  /** Dispatcher tenant view: suppress ambient ROUTE_ESTIMATED projections. */
  hideEstimatedRoutes?: boolean;
}

const INITIAL_CENTER: [number, number] = [100.5, 0.5];
const INITIAL_ZOOM = 6.0;

type SearchItem = GeocodeNode | GeocodeSearchResult;

function normalizeSearchText(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Relevance rank for a search hit (0 = best). Keeps exact names ("Padang")
 * ahead of unrelated matches that merely contain the query ("Padang Sidempuan"),
 * which naive substring ordering gets wrong because the gazetteer is not
 * alphabetically sorted.
 */
function scoreSearchItem(query: string, item: SearchItem): number {
  const q = normalizeSearchText(query);
  const name = normalizeSearchText(item.name);
  const display = normalizeSearchText(item.display_name);
  if (name === q || display === q) return 0;
  if (name.startsWith(q) || display.startsWith(q)) return 1;
  if (
    name.includes(` ${q}`) ||
    name.endsWith(` ${q}`) ||
    display.includes(` ${q}`) ||
    display.endsWith(` ${q}`)
  ) {
    return 2;
  }
  if (name.includes(q) || display.includes(q)) return 3;
  return 4;
}

/** Union of local + live results, de-duplicated and relevance-sorted. */
function mergeSearchResults(query: string, ...groups: SearchItem[][]): SearchItem[] {
  const stripParen = (value: string) =>
    normalizeSearchText(value).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const isSamePlace = (a: SearchItem, b: SearchItem) => {
    const nameA = normalizeSearchText(a.name);
    const nameB = normalizeSearchText(b.name);
    // Same name, or the same base name with a parenthetical hub label
    // ("Bukittinggi" vs "Bukittinggi (Sentra Sayur & Cabai Agam)").
    const sameName = nameA === nameB || stripParen(a.name) === stripParen(b.name);
    if (!sameName) return false;
    // Within ~5 km → same place; same-named towns in different kabupaten stay.
    return Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;
  };
  const candidates: Array<{ item: SearchItem; index: number; score: number }> = [];
  let index = 0;
  for (const group of groups) {
    for (const item of group) {
      candidates.push({ item, index: index++, score: scoreSearchItem(query, item) });
    }
  }
  // Rank first, then de-dupe, so an exact gazetteer name beats a locally
  // labelled hub variant of the same place ("Bukittinggi" vs "Bukittinggi (...)").
  candidates.sort((a, b) => a.score - b.score || a.index - b.index);

  const merged: SearchItem[] = [];
  for (const candidate of candidates) {
    if (merged.some((existing) => isSamePlace(existing, candidate.item))) continue;
    merged.push(candidate.item);
    if (merged.length >= 10) break;
  }
  return merged;
}

/** Honest type badge — never label a port/kabupaten as "Desa". */
function searchResultBadge(item: SearchItem): string {
  const type = (item.type || '').toLowerCase();
  const name = normalizeSearchText(item.name);
  if (type === 'port' || name.includes('pelabuhan') || name.includes('dermaga')) return 'Pelabuhan';
  if (type === 'airport' || name.includes('bandara')) return 'Bandara';
  if (type === 'city') return 'Kota';
  if (type === 'kecamatan' || type === 'subdistrict' || type === 'municipality') return 'Kecamatan';
  if (
    type === 'village' ||
    type === 'hamlet' ||
    type === 'suburb' ||
    type === 'neighbourhood' ||
    type === 'residential' ||
    type === 'quarter'
  ) {
    return 'Desa';
  }
  if (type === 'hub' || type === 'strategic_hub' || type === 'corridor_point') return 'Hub';
  if (type === 'regency' || type === 'regency_hub' || type === 'county' || type === 'town') return 'Kota/Kab';
  if (type === 'administrative' || type === 'state' || type === 'province') return 'Wilayah';
  return 'Titik';
}

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
  onCustomPointSelected,
  onSelectRoute,
  hubNodesList,
  corridorContext,
  spatialWeatherPolygons,
  routingInfo,
  isLeftSidebarCollapsed = false,
  onExpandSidebar,
  fleetModalityFilter = 'all',
  simSpeed = 1,
  isRightSidebarOpen = false,
  topNavTelemetrySlot,
  fleetModalitySlot,
  mapLegendSlot,
  corridorVisibility = { land: true, sea: true, air: true },
  onToggleCorridor,
  onResetCorridorVisibility,
  hiddenRouteIndices: propHiddenRouteIndices,
  onHideRoute,
  onZoneClick,
  flyToCoords = null,
  selectedVehicleId = null,
  onSelectVehicle,
  onCloseVehicle,
  hideEstimatedRoutes = false,
}: CrisisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  void corridorContext;
  void routingInfo;
  void demoStage;
  void fireHotspots;

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const isMapLoadedRef = useRef(false);

  // Tier 2 Pan-Sumatra Gazetteer & Search State
  const [gazetteerNodes, setGazetteerNodes] = useState<GeocodeNode[]>(PAN_SUMATRA_GAZETTEER);
  const gazetteerNodesRef = useRef<GeocodeNode[]>(PAN_SUMATRA_GAZETTEER);
  gazetteerNodesRef.current = gazetteerNodes;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<GeocodeNode | GeocodeSearchResult>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Click-to-Pin / Right-Click / Village Context Popup State
  const [contextPopup, setContextPopup] = useState<{
    coords: [number, number];
    nodeId: string;
    name: string;
    type: string;
    province?: string;
    screenPos?: { x: number; y: number };
  } | null>(null);

  // On-Map Contextual Route Corridor Popover State
  const [selectedRoutePopover, setSelectedRoutePopover] = useState<{
    routeIndex: number;
    route: RouteRecommendation;
    lngLat: [number, number];
    screenPos: { x: number; y: number };
  } | null>(null);

  // User-hidden route corridors state (synced with parent and reset upon full corridor visibility)
  const [internalHiddenRouteIndices, setInternalHiddenRouteIndices] = useState<Set<number>>(new Set());
  const hiddenRouteIndices = propHiddenRouteIndices ?? internalHiddenRouteIndices;
  const activeRoutesRef = useRef<RouteRecommendation[]>(activeRoutes);
  activeRoutesRef.current = activeRoutes;

  // Custom User Pinned Points on Map (Origins, Dests, POIs)
  const [customPinnedPoints, setCustomPinnedPoints] = useState<Array<{
    id: string;
    coords: [number, number];
    name: string;
    role: 'origin' | 'dest' | 'poi';
  }>>([]);

  // Auto-restore hidden routes whenever all corridors become visible
  useEffect(() => {
    if (corridorVisibility?.land && corridorVisibility?.sea && corridorVisibility?.air) {
      setInternalHiddenRouteIndices(new Set());
    }
  }, [corridorVisibility?.land, corridorVisibility?.sea, corridorVisibility?.air]);

  // Issue 4: Immediately clear custom pinned points and remove glowing pulse/point when origin/dest are reset
  useEffect(() => {
    setCustomPinnedPoints((prev) => {
      let next = prev;
      if (!selectedOriginNode) {
        next = next.filter((p) => p.role !== 'origin');
      }
      if (!selectedDestNode) {
        next = next.filter((p) => p.role !== 'dest');
      }
      return next;
    });

    if (!selectedOriginNode && !selectedDestNode) {
      setCustomPinnedPoints([]);
      setSelectedRoutePopover(null);
      setContextPopup(null);
      if (mapRef.current) {
        const customSource = mapRef.current.getSource('custom-pinned-source') as mapboxgl.GeoJSONSource;
        if (customSource) {
          customSource.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    }
  }, [selectedOriginNode, selectedDestNode]);

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
  const onCustomPointSelectedRef = useRef(onCustomPointSelected);
  onCustomPointSelectedRef.current = onCustomPointSelected;
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;
  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;

  const mouseDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastFocusedCrisisIdRef = useRef<string | null>(null);
  const lastFocusedShockwaveKeyRef = useRef<string | null>(null);
  // Blink-reduction: route-paths-source / congestion / ETA only rewrite when
  // route inputs actually change. Fleet polls (~10s) flow via FleetVehicleLayer
  // props and must NOT retrigger densifyPath + route setData.
  const lastRouteWriteHashRef = useRef<string | null>(null);

  // Fetch updated gazetteer nodes from backend on mount (falls back to local PAN_SUMATRA_GAZETTEER)
  useEffect(() => {
    let isMounted = true;
    fetchGazetteerNodes().then((nodes) => {
      if (isMounted && nodes && nodes.length > 0) {
        setGazetteerNodes(nodes);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

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
    if (typeof window !== 'undefined') (window as any)._mapboxMap = map;

    map.on('mousedown', (e) => {
      mouseDownPosRef.current = { x: e.point.x, y: e.point.y };
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
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
      (window as any)._mapboxMap = map;
      map.addControl(draw, 'bottom-right');

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
      map.addLayer({
        id: 'baseline-corridors-symbol',
        type: 'symbol',
        source: 'baseline-corridors-source',
        filter: ['==', ['get', 'type'], 'maritime'],
        layout: {
          'symbol-placement': 'line',
          'text-field': 'ALUR LAUT SELAT MALAKA (TSS)',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 10.5,
          'text-letter-spacing': 0.15,
          'text-transform': 'uppercase',
          'symbol-spacing': 350,
          'text-keep-upright': true,
        },
        paint: {
          'text-color': '#60a5fa',
          'text-halo-color': '#0b0f17',
          'text-halo-width': 1.5,
          'text-opacity': 0.85,
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
            'match', ['get', 'zone_tier'],
            'RED_CONFIRMED', '#ef4444',
            'YELLOW_CLARIFY', '#eab308',
            // Fallback when zone_tier not set: color by legacy type, else red.
            ['match', ['get', 'type'],
              'flood', 'rgba(6, 182, 212, 0.35)',
              'earthquake', 'rgba(244, 63, 94, 0.35)',
              'landslide', 'rgba(217, 119, 6, 0.35)',
              'wildfire', 'rgba(249, 115, 22, 0.35)',
              'congestion', 'rgba(234, 179, 8, 0.30)',
              'rgba(239, 68, 68, 0.35)'
            ]
          ],
          'fill-opacity': [
            'match', ['get', 'zone_tier'],
            'RED_CONFIRMED', 0.32,
            'YELLOW_CLARIFY', 0.28,
            0.85
          ],
        },
      });
      map.addLayer({
        id: 'disaster-zones-outline',
        type: 'line',
        source: 'disaster-zones-source',
        paint: {
          'line-color': [
            'match', ['get', 'zone_tier'],
            'RED_CONFIRMED', '#ef4444',
            'YELLOW_CLARIFY', '#facc15',
            ['match', ['get', 'type'],
              'flood', '#06b6d4',
              'earthquake', '#f43f5e',
              'landslide', '#d97706',
              'wildfire', '#f97316',
              'congestion', '#eab308',
              '#ef4444'
            ]
          ],
          'line-width': 2.5,
        },
      });

      // 2. Active Route Paths Layers (Solid Active, Dashed Alternative, High-Hit-Target Hit Layer)
      map.addSource('route-paths-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // 2a. Wide transparent hit layer for effortless clicking
      map.addLayer({
        id: 'route-paths-hit',
        type: 'line',
        source: 'route-paths-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 18,
          'line-opacity': 0.001,
        },
      });

      // 2b. Solid active route corridor
      map.addLayer({
        id: 'route-paths-line',
        type: 'line',
        source: 'route-paths-source',
        filter: ['==', ['get', 'isActive'], true],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#10b981'],
          // Direct-land corridors are the highlighted/default story; island-ring legs stay thinner.
          'line-width': ['case', ['==', ['get', 'isDirectLand'], true], 6.5, 5],
          'line-opacity': 0.95,
        },
      });

      // 2c. Distinct dashed alternative route corridors
      map.addLayer({
        id: 'route-paths-alternative',
        type: 'line',
        source: 'route-paths-source',
        filter: ['==', ['get', 'isActive'], false],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#38bdf8'],
          'line-width': 4,
          'line-opacity': 0.70,
          'line-dasharray': [2, 2],
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

      // 4. Hub Nodes Native WebGL Layers (Ports, Airports, Strategic Distribution Hubs)
      map.addSource('hub-nodes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'hub-nodes-pulse-outer',
        type: 'circle',
        source: 'hub-nodes-source',
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isTransferHub'], 22,
            ['get', 'isKeyNode'], 18,
            ['get', 'isSelectablePrompt'], 14,
            0
          ],
          'circle-color': [
            'case',
            ['get', 'isTransferHub'],
            ['match', ['get', 'type'], 'port', '#3b82f6', 'airport', '#00f0ff', '#22d3ee'],
            ['get', 'isKeyNode'], '#22d3ee',
            '#00f0ff'
          ],
          'circle-opacity': [
            'case',
            ['get', 'isTransferHub'], 0.22,
            ['get', 'isKeyNode'], 0.25,
            ['get', 'isSelectablePrompt'], 0.35,
            0
          ],
          'circle-stroke-width': [
            'case',
            ['get', 'isTransferHub'], 2.5,
            ['get', 'isKeyNode'], 2.0,
            ['get', 'isSelectablePrompt'], 1.5,
            0
          ],
          'circle-stroke-color': [
            'case',
            ['get', 'isTransferHub'],
            ['match', ['get', 'type'], 'port', '#3b82f6', 'airport', '#00f0ff', '#22d3ee'],
            '#22d3ee'
          ],
          'circle-stroke-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'hub-nodes-circle',
        type: 'circle',
        source: 'hub-nodes-source',
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isTransferHub'], 9,
            ['get', 'isKeyNode'], 8,
            5
          ],
          'circle-color': [
            'match', ['get', 'type'],
            'port', '#38bdf8',
            'airport', '#c084fc',
            '#34d399'
          ],
          'circle-stroke-width': ['case', ['get', 'isKeyNode'], 2.5, 1.5],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'hub-nodes-label',
        type: 'symbol',
        source: 'hub-nodes-source',
        layout: {
          'text-field': ['get', 'shortName'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['case', ['get', 'isKeyNode'], 12, 10.5],
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#f8fafc',
          'text-halo-color': '#0c1017',
          'text-halo-width': 2.0,
        },
      });

      // Hub node WebGL click & hover handlers
      const handleNodeClick = (e: any) => {
        if (e.features && e.features[0] && e.features[0].properties) {
          const nodeId = e.features[0].properties.id;
          if (nodeId && onNodeSelectedRef.current) {
            onNodeSelectedRef.current(nodeId);
          }
        }
      };
      map.on('click', 'hub-nodes-circle', handleNodeClick);
      map.on('click', 'hub-nodes-pulse-outer', handleNodeClick);
      map.on('click', 'hub-nodes-label', handleNodeClick);

      const setPointerCursor = () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
      };
      const resetCursor = () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
      };
      map.on('mouseenter', 'hub-nodes-circle', setPointerCursor);
      map.on('mouseleave', 'hub-nodes-circle', resetCursor);
      map.on('mouseenter', 'hub-nodes-pulse-outer', setPointerCursor);
      map.on('mouseleave', 'hub-nodes-pulse-outer', resetCursor);
      map.on('mouseenter', 'hub-nodes-label', setPointerCursor);
      map.on('mouseleave', 'hub-nodes-label', resetCursor);

      // 4b. Tier 2 Pan-Sumatra Regency & Gazetteer Nodes WebGL Layers (minzoom: 7.5)
      map.addSource('regency-nodes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'regency-nodes-circle',
        type: 'circle',
        source: 'regency-nodes-source',
        minzoom: 7.5,
        paint: {
          'circle-radius': getMapboxZoomLODExpression('regency-node'),
          'circle-color': '#64748b',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#0c1017',
          'circle-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'regency-nodes-label',
        type: 'symbol',
        source: 'regency-nodes-source',
        minzoom: 7.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            7.5, 9.5,
            10.5, 11.5,
          ],
          'text-offset': [0, 1.0],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#cbd5e1',
          'text-halo-color': '#0c1017',
          'text-halo-width': 2.0,
        },
      });

      const handleRegencyClick = (e: any) => {
        if (e.features && e.features[0] && e.features[0].properties) {
          const props = e.features[0].properties;
          const coords: [number, number] = [Number(props.lon), Number(props.lat)];
          setContextPopup({
            coords,
            nodeId: props.id,
            name:
              formatNodeDisplay({
                display_name: props.displayName,
                name: props.name,
                kabupaten: props.kabupaten,
                province: props.province,
                type: props.type,
              }) || prettyNodeSlug(props.id),
            type: props.type === 'city' ? 'Kota' : props.type === 'kecamatan' ? 'Kecamatan' : 'Kabupaten',
            province: props.province,
            screenPos: { x: e.point.x, y: e.point.y },
          });
        }
      };
      map.on('click', 'regency-nodes-circle', handleRegencyClick);
      map.on('click', 'regency-nodes-label', handleRegencyClick);
      map.on('mouseenter', 'regency-nodes-circle', setPointerCursor);
      map.on('mouseleave', 'regency-nodes-circle', resetCursor);
      map.on('mouseenter', 'regency-nodes-label', setPointerCursor);
      map.on('mouseleave', 'regency-nodes-label', resetCursor);

      // 4c. Custom Pinned Points WebGL Layers (Origins, Dests, POIs)
      map.addSource('custom-pinned-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'custom-pinned-pulse',
        type: 'circle',
        source: 'custom-pinned-source',
        paint: {
          'circle-radius': 14,
          'circle-color': [
            'match', ['get', 'role'],
            'origin', '#00f0ff',
            'dest', '#22c55e',
            '#f59e0b'
          ],
          'circle-opacity': 0.25,
          'circle-stroke-width': 2,
          'circle-stroke-color': [
            'match', ['get', 'role'],
            'origin', '#00f0ff',
            'dest', '#22c55e',
            '#f59e0b'
          ],
        },
      });
      map.addLayer({
        id: 'custom-pinned-point',
        type: 'circle',
        source: 'custom-pinned-source',
        paint: {
          'circle-radius': 6.5,
          'circle-color': [
            'match', ['get', 'role'],
            'origin', '#00f0ff',
            'dest', '#22c55e',
            '#f59e0b'
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'custom-pinned-label',
        type: 'symbol',
        source: 'custom-pinned-source',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#0c1017',
          'text-halo-width': 2.5,
        },
      });

      // 5. Route ETA Badges Native WebGL Layer
      map.addSource('route-eta-badges-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-eta-badges-layer',
        type: 'symbol',
        source: 'route-eta-badges-source',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': ['get', 'textColor'],
          'text-halo-color': '#0c1017',
          'text-halo-width': 2.5,
        },
      });
      map.on('click', 'route-eta-badges-layer', (e) => {
        // Phase 77: ETA badge delegates to parent handleSelectRoute (modal path);
        // no direct active-route styling mutation happens on badge click.
        if (e.features && e.features[0]) {
          const rIdx = Number(e.features[0].properties?.routeIndex ?? 0);
          if (onSelectRouteRef.current) onSelectRouteRef.current(rIdx);
        }
      });
      map.on('mouseenter', 'route-eta-badges-layer', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'route-eta-badges-layer', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
      });

      // Map click handler for point targeting
      map.on('click', (e) => {
        if (isClickTargetingRef.current && onMapPointTargetedRef.current) {
          onMapPointTargetedRef.current(e.lngLat.lat, e.lngLat.lng);
        }
      });

      // Route line click handler (opens on-map contextual popover)
      const handleRouteClick = (e: mapboxgl.MapLayerMouseEvent) => {
        if (isClickTargetingRef.current) return;
        if (e.features && e.features[0]) {
          const props = e.features[0].properties;
          const origIdx = Number(props?.originalRouteIndex ?? props?.routeIndex);
          if (!isNaN(origIdx) && activeRoutesRef.current[origIdx]) {
            const targetRoute = activeRoutesRef.current[origIdx];
            setSelectedRoutePopover({
              routeIndex: origIdx,
              route: targetRoute,
              lngLat: [e.lngLat.lng, e.lngLat.lat],
              screenPos: { x: e.point.x, y: e.point.y },
            });
          }
        }
      };

      map.on('click', 'route-paths-line', handleRouteClick);
      map.on('click', 'route-paths-alternative', handleRouteClick);
      map.on('click', 'route-paths-hit', handleRouteClick);

      const setRoutePointer = () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
      };
      const resetRouteCursor = () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
      };

      ['route-paths-line', 'route-paths-alternative', 'route-paths-hit'].forEach((layerId) => {
        map.on('mouseenter', layerId, setRoutePointer);
        map.on('mouseleave', layerId, resetRouteCursor);
      });

      // Interactive Red/Yellow zone click → stored audit trail (no fake simulation stream).
      const handleDisasterZoneClick = (e: mapboxgl.MapLayerMouseEvent) => {
        if (isClickTargetingRef.current) return;
        if (!e.features || e.features.length === 0) return;
        const props: any = e.features[0].properties || {};
        let impact_profile: any = undefined;
        if (props.impact_profile_json) {
          try {
            impact_profile = JSON.parse(props.impact_profile_json);
          } catch {
            impact_profile = undefined;
          }
        }
        const geom: any = (e.features[0] as any).geometry;
        const polygon: [number, number][] =
          geom && geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])
            ? (geom.coordinates[0] as [number, number][])
            : [];
        const zone = {
          polygon,
          type: (props.type as any) || 'flood',
          risk: Number(props.risk ?? 0.85),
          crisis_id: props.crisis_id || props.id || undefined,
          id: props.id || props.crisis_id || undefined,
          zone_tier: (props.zone_tier as any) || 'RED_CONFIRMED',
          title: props.title || '',
          tier_reason: props.tier_reason || '',
          custom_hazard_label: props.custom_hazard_label || '',
          source_news_id: props.source_news_id || '',
          center: (props.center_lon != null && props.center_lat != null
            ? [Number(props.center_lon), Number(props.center_lat)] as [number, number]
            : undefined) as any,
          radiusKm: props.radiusKm != null ? Number(props.radiusKm) : 15,
          impact_profile,
        } as unknown as import('@/lib/types').DisasterZone;
        onZoneClickRef.current?.(zone);
        return;
      };
      map.on('click', 'disaster-zones-fill', handleDisasterZoneClick);
      map.on('click', 'disaster-zones-outline', handleDisasterZoneClick);
      ['disaster-zones-fill', 'disaster-zones-outline'].forEach((layerId) => {
        map.on('mouseenter', layerId, () => {
          if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
        });
      });

      // Tier 3 Settlement & Village WebGL Labels Enhancement (High contrast halo)
      const enhanceSettlementLabels = () => {
        ['settlement-subdivision-label', 'settlement-minor-label', 'settlement-major-label'].forEach((layerId) => {
          if (map.getLayer(layerId)) {
            try {
              map.setPaintProperty(layerId, 'text-halo-color', '#05070a');
              map.setPaintProperty(layerId, 'text-halo-width', 2.0);
              map.setPaintProperty(layerId, 'text-color', '#e2e8f0');
            } catch {}
          }
        });
      };
      enhanceSettlementLabels();

      // Tier 3 Settlement click handler for Village-level routing
      const handleSettlementClick = (e: any) => {
        if (e.features && e.features[0]) {
          const f = e.features[0];
          const name = f.properties?.name || f.properties?.name_en || 'Pemukiman';
          const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          setContextPopup({
            coords,
            nodeId: `settlement-${coords[0].toFixed(4)}-${coords[1].toFixed(4)}`,
            name,
            type: 'Desa / Pemukiman',
            province: 'Sumatra',
            screenPos: { x: e.point.x, y: e.point.y },
          });
        }
      };
      if (map.getLayer('settlement-subdivision-label')) {
        map.on('click', 'settlement-subdivision-label', handleSettlementClick);
        map.on('mouseenter', 'settlement-subdivision-label', setPointerCursor);
        map.on('mouseleave', 'settlement-subdivision-label', resetCursor);
      }
      if (map.getLayer('settlement-minor-label')) {
        map.on('click', 'settlement-minor-label', handleSettlementClick);
        map.on('mouseenter', 'settlement-minor-label', setPointerCursor);
        map.on('mouseleave', 'settlement-minor-label', resetCursor);
      }

      // Universal Click-to-Pin & Right-Click Context Menu with Reverse Geocoding
      map.on('contextmenu', async (e) => {
        const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        let displayName = `Titik [${coords[0].toFixed(3)}, ${coords[1].toFixed(3)}]`;
        let type = 'Koordinat Khusus';
        let province = 'Sumatra';

        try {
          const rev = await api.geocode.reverse(coords[1], coords[0]);
          if (rev && rev.display_name) {
            displayName = rev.display_name;
            type = rev.type || 'Titik Lapangan';
            province = rev.province || 'Sumatra';
          }
        } catch {
          // quiet fallback
        }

        setContextPopup({
          coords,
          nodeId: `pin-${coords[0].toFixed(4)}-${coords[1].toFixed(4)}`,
          name: displayName,
          type,
          province,
          screenPos: { x: e.point.x, y: e.point.y },
        });
      });

      // SpatialHash Screen-Space Anti-Clutter Arbiter for Regency Nodes
      const runRegencyDeclutter = () => {
        if (!mapRef.current || !isMapLoadedRef.current) return;
        const zoom = mapRef.current.getZoom();
        if (zoom < 7.5) return;

        const bounds = mapRef.current.getBounds();
        const candidates: DeclutterItem[] = [];
        const nodes = gazetteerNodesRef.current;

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (bounds && !bounds.contains([n.lon, n.lat])) continue;
          const pt = mapRef.current.project([n.lon, n.lat]);
          candidates.push({
            id: `regency-${i}-${n.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            screenX: pt.x,
            screenY: pt.y,
            priority: PRIORITY_REGENCY_NODE,
            category: 'regency',
            width: 75,
            height: 20,
          });
        }

        const winners = arbitrateVisibleLabels(candidates, defaultSpatialHashArbiter);
        if (mapRef.current.getLayer('regency-nodes-label')) {
          mapRef.current.setFilter('regency-nodes-label', ['in', ['get', 'id'], ['literal', Array.from(winners)]]);
        }
      };

      map.on('moveend', runRegencyDeclutter);
      map.on('zoomend', runRegencyDeclutter);

      // Track screen position of active context popup during map interaction
      map.on('move', () => {
        setContextPopup((prev) => {
          if (!prev || !mapRef.current) return prev;
          const p = mapRef.current.project(prev.coords);
          return { ...prev, screenPos: { x: p.x, y: p.y } };
        });
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

    // 1. Update Weather Polygons
    const weatherSource = map.getSource('weather-polygons-source') as mapboxgl.GeoJSONSource;
    if (weatherSource) {
      // Suppress ambient weather polygons during active demo simulation to prevent visual clutter
      if (demoStage == null && spatialWeatherPolygons && spatialWeatherPolygons.features && spatialWeatherPolygons.features.length > 0) {
        weatherSource.setData(spatialWeatherPolygons);
      } else {
        weatherSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 2. Update Active Route Paths (Per-Leg Multi-Color Corridors with Original Indices)
    // Dedupe: fleet polls (~10s) must NOT rewrite route/congestion/ETA sources.
    // Only rebuild when route inputs actually change; endpoint-clear effect
    // below still clears directly and stays cleared until this hash flips.
    const routeWriteHash = (() => {
      const hiddenSorted = Array.from(hiddenRouteIndices ?? []).sort((a, b) => a - b).join(',');
      const visFlag = `${corridorVisibility?.land ?? true},${corridorVisibility?.sea ?? true},${corridorVisibility?.air ?? true}`;
      let s = `idx=${activeRouteIdx ?? 0}|vis=${visFlag}|hid=${hiddenSorted}|n=${activeRoutes?.length ?? 0};`;
      (activeRoutes ?? []).forEach((r, ri) => {
        s += `#${ri}:${r.viable ?? ''}|${r.corridor_type ?? ''}|${(r as any).modality ?? ''}|${(r as any).color ?? ''}|${r.description ?? ''}|${Number((r as any).distance_km ?? 0).toFixed(2)}|${Number((r as any).eta_minutes ?? 0).toFixed(2)}|${(r as any).safety_status ?? ''}|${(r as any).is_compromised ? 'C' : ''}|`;
        const wps = (r as any).waypoints ?? [];
        s += `w${wps.length}:`;
        for (let wi = 0; wi < wps.length; wi++) {
          const wp = wps[wi] as any;
          s += `${Number(wp.lon ?? 0).toFixed(4)},${Number(wp.lat ?? 0).toFixed(4)};`;
        }
        const legs = (r as any).legs ?? [];
        s += `l${legs.length}:`;
        for (let li = 0; li < legs.length; li++) {
          const leg = legs[li] as any;
          const coords = leg.coordinates ?? [];
          s += `${leg.title ?? ''}:${leg.color ?? ''}:${leg.mode ?? ''}:${leg.modality ?? ''}:c${coords.length}:`;
          if (coords.length > 0) {
            const step = Math.max(1, Math.floor(coords.length / 8));
            for (let ci = 0; ci < coords.length; ci += step) {
              const c = coords[ci];
              s += `${Number(c[0] ?? 0).toFixed(4)},${Number(c[1] ?? 0).toFixed(4)};`;
            }
            const lastC = coords[coords.length - 1];
            s += `${Number(lastC[0] ?? 0).toFixed(4)},${Number(lastC[1] ?? 0).toFixed(4)}|`;
          }
          if (leg.transfer_hub?.id) s += `hub=${leg.transfer_hub.id};`;
        }
        const segs = (r as any).congestion_segments ?? [];
        s += `s${segs.length}:`;
        for (let si = 0; si < segs.length; si++) {
          const seg = segs[si] as any;
          s += `${seg.level ?? ''}:${(seg.coordinates ?? []).length};`;
        }
      });
      return s;
    })();
    const shouldRewriteRoutes = lastRouteWriteHashRef.current !== routeWriteHash;
    const routesSource = map.getSource('route-paths-source') as mapboxgl.GeoJSONSource;
    if (routesSource && shouldRewriteRoutes) {
      const targetIdx = activeRouteIdx ?? 0;
      const isCorridorVisible = (r: RouteRecommendation, origIdx: number) => {
        if (r.viable === false) return false;
        if (hiddenRouteIndices.has(origIdx)) return false;
        const type = r.corridor_type;
        if (!type) return true;
        if (type === 'land_primary' || type === 'land_detour') return corridorVisibility?.land ?? true;
        if (type === 'sea_intermodal') return corridorVisibility?.sea ?? true;
        if (type === 'air_intermodal') return corridorVisibility?.air ?? true;
        if (type === 'hold_staging') return corridorVisibility?.land ?? true;
        return true;
      };

      const routeFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

      activeRoutes.forEach((r, origIdx) => {
        if (!isCorridorVisible(r, origIdx)) return;
        const isRouteActive = origIdx === targetIdx;

        if (r.legs && r.legs.length > 0 && r.legs.some((l) => l.coordinates && l.coordinates.length >= 2)) {
          // Emit one feature per leg with exact leg color and coordinates
          r.legs.forEach((leg, lIdx) => {
            const legCoords = leg.coordinates || [];
            if (legCoords.length >= 2) {
              const finalCoords = legCoords.length > 5 ? legCoords : densifyPath(legCoords, 15);
              const legMode = (leg as any).modality || leg.mode;
              const legColor =
                leg.color ||
                (legMode === 'maritime'
                  ? '#3B82F6'
                  : legMode === 'air'
                    ? '#00F0FF'
                    : '#10B981');
              const legCorridorClass =
                legMode === 'maritime' ? 'sea' : legMode === 'air' ? 'air' : 'land';
              routeFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: finalCoords,
                },
                properties: {
                  originalRouteIndex: origIdx,
                  routeIndex: origIdx,
                  legIndex: lIdx,
                  isActive: isRouteActive,
                  description: `${r.description} (${leg.title})`,
                  color: legColor,
                  legMode: legMode,
                  corridorClass: legCorridorClass,
                  isDirectLand: legCorridorClass === 'land',
                  isIslandRing: legCorridorClass !== 'land',
                  isLeg: true,
                },
              });
            }
          });
        } else if (r.waypoints && r.waypoints.length >= 2) {
          const rawWaypoints: LonLat[] = r.waypoints.map((wp) => [wp.lon, wp.lat]);
          const finalCoordinates = rawWaypoints.length > 5 ? rawWaypoints : densifyPath(rawWaypoints, 25);
          const defaultColor =
            r.modality === 'maritime' || r.corridor_type === 'sea_intermodal'
              ? '#3B82F6'
              : r.modality === 'air' || r.corridor_type === 'air_intermodal'
                ? '#00F0FF'
                : isRouteActive
                  ? '#10B981'
                  : origIdx === 1
                    ? '#38BDF8'
                    : '#00F0FF';
          const routeCorridorClass =
            r.modality === 'maritime' || r.corridor_type === 'sea_intermodal'
              ? 'sea'
              : r.modality === 'air' || r.corridor_type === 'air_intermodal'
                ? 'air'
                : 'land';
          routeFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: finalCoordinates,
            },
            properties: {
              originalRouteIndex: origIdx,
              routeIndex: origIdx,
              isActive: isRouteActive,
              description: r.description,
              color: r.color || defaultColor,
              corridorClass: routeCorridorClass,
              isDirectLand: routeCorridorClass === 'land',
              isIslandRing: routeCorridorClass !== 'land',
              isLeg: false,
            },
          });
        }
      });

      routesSource.setData({
        type: 'FeatureCollection',
        features: routeFeatures,
      });
    }

    // 2b. Update Congestion Segments (route-scoped: same dedupe gate as routes)
    const congestionSource = map.getSource('congestion-segments-source') as mapboxgl.GeoJSONSource;
    if (congestionSource && shouldRewriteRoutes) {
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
            id: (z as any).id || (z as any).crisis_id || '',
            type: z.type,
            risk: z.risk,
            crisis_id: (z as any).crisis_id || (z as any).id || '',
            zone_tier: (z as any).zone_tier || 'RED_CONFIRMED',
            title: (z as any).title || '',
            tier_reason: (z as any).tier_reason || '',
            custom_hazard_label: (z as any).custom_hazard_label || '',
            source_news_id: (z as any).source_news_id || '',
            center_lon: (z as any).center?.[0] ?? null,
            center_lat: (z as any).center?.[1] ?? null,
            radiusKm: (z as any).radiusKm ?? 15,
            impact_profile_json: (z as any).impact_profile ? JSON.stringify((z as any).impact_profile) : '',
          },
        })),
      });
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

    // 5. Update Native WebGL Hub Nodes & Active Infrastructure Waypoints (Purged Static Hub Clutter)
    const hubSource = map.getSource('hub-nodes-source') as mapboxgl.GeoJSONSource;
    if (hubSource) {
      const hubFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
      const registeredIds = new Set<string>();

      // 1. Resolve & render Origin endpoint
      if (selectedOriginNode) {
        registeredIds.add(selectedOriginNode);
        let originCoords: LonLat | null = null;
        let originName = prettyNodeSlug(selectedOriginNode);
        if (HUB_NODES[selectedOriginNode]) {
          originCoords = HUB_NODES[selectedOriginNode].coords;
          originName = HUB_NODES[selectedOriginNode].name;
        } else {
          // Strip the regency render index (regency-<idx>-<slug>) before gazetteer matching;
          // the original selectedOriginNode is kept as the feature id.
          const normalizedOriginId = normalizeRegencyId(selectedOriginNode).toLowerCase();
          const match = PAN_SUMATRA_GAZETTEER.find(
            (g) =>
              g.name.toLowerCase() === normalizedOriginId ||
              `node-${g.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === normalizedOriginId ||
              `regency-${g.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === normalizedOriginId
          );
          if (match) {
            originCoords = [match.lon, match.lat];
            originName = formatNodeDisplay(match) || match.name;
          }
        }
        if (originCoords) {
          const shortName = originName
            .split('(')[0]
            .split(',')[0]
            .replace(/^(Hub Utama Pergudangan|Hub Logistik|Interchange Tol|Interchange|Pelabuhan|Bandara Internasional|Bandara|Kota)\s+/i, '')
            .trim();
          hubFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: originCoords },
            properties: {
              id: selectedOriginNode,
              name: originName,
              shortName: `${shortName} (ASAL)`,
              type: 'hub',
              isKeyNode: true,
              isSelectablePrompt: false,
              isTransferHub: false,
            },
          });
        }
      }

      // 2. Resolve & render Destination endpoint
      if (selectedDestNode) {
        registeredIds.add(selectedDestNode);
        let destCoords: LonLat | null = null;
        let destName = prettyNodeSlug(selectedDestNode);
        if (HUB_NODES[selectedDestNode]) {
          destCoords = HUB_NODES[selectedDestNode].coords;
          destName = HUB_NODES[selectedDestNode].name;
        } else {
          // Strip the regency render index (regency-<idx>-<slug>) before gazetteer matching;
          // the original selectedDestNode is kept as the feature id.
          const normalizedDestId = normalizeRegencyId(selectedDestNode).toLowerCase();
          const match = PAN_SUMATRA_GAZETTEER.find(
            (g) =>
              g.name.toLowerCase() === normalizedDestId ||
              `node-${g.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === normalizedDestId ||
              `regency-${g.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` === normalizedDestId
          );
          if (match) {
            destCoords = [match.lon, match.lat];
            destName = formatNodeDisplay(match) || match.name;
          }
        }
        if (destCoords) {
          const shortName = destName
            .split('(')[0]
            .split(',')[0]
            .replace(/^(Hub Utama Pergudangan|Hub Logistik|Interchange Tol|Interchange|Pelabuhan|Bandara Internasional|Bandara|Kota)\s+/i, '')
            .trim();
          hubFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: destCoords },
            properties: {
              id: selectedDestNode,
              name: destName,
              shortName: `${shortName} (TUJUAN)`,
              type: 'hub',
              isKeyNode: true,
              isSelectablePrompt: false,
              isTransferHub: false,
            },
          });
        }
      }

      // 3. Render contextual Infrastructure Transfer Hubs from visible active route legs
      const isCorridorVisible = (r: RouteRecommendation) => {
        if (r.viable === false) return false;
        const type = r.corridor_type;
        if (!type) return true;
        if (type === 'land_primary' || type === 'land_detour') return corridorVisibility?.land ?? true;
        if (type === 'sea_intermodal') return corridorVisibility?.sea ?? true;
        if (type === 'air_intermodal') return corridorVisibility?.air ?? true;
        if (type === 'hold_staging') return corridorVisibility?.land ?? true;
        return true;
      };

      const visibleRoutes = activeRoutes.filter(isCorridorVisible);
      visibleRoutes.forEach((r) => {
        if (r.legs) {
          r.legs.forEach((leg) => {
            if (leg.transfer_hub && !registeredIds.has(leg.transfer_hub.id)) {
              registeredIds.add(leg.transfer_hub.id);
              const hub = leg.transfer_hub;
              const badgeLabel =
                hub.type === 'seaport'
                  ? `⚓ ${hub.name.split('(')[0].trim()}`
                  : hub.type === 'airport'
                  ? `✈️ ${hub.name.split('(')[0].trim()}`
                  : `🛡️ ${hub.name.split('(')[0].trim()}`;

              hubFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: hub.coords },
                properties: {
                  id: hub.id,
                  name: hub.name,
                  shortName: badgeLabel,
                  type: hub.type === 'seaport' ? 'port' : hub.type === 'airport' ? 'airport' : 'hub',
                  isKeyNode: true,
                  isSelectablePrompt: false,
                  isTransferHub: true,
                },
              });
            }
          });
        }
      });

      // 4. During initial interactive selection (demoStage === 0 and missing endpoints), render selectable prompts
      if (demoStage === 0 && (!selectedOriginNode || !selectedDestNode)) {
        const selectableNodes = hubNodesList || Object.values(HUB_NODES);
        selectableNodes.forEach((node) => {
          if (!registeredIds.has(node.id)) {
            const rawName = node.name.split('(')[0].trim();
            const shortCityName = rawName
              .replace(/^(Hub Utama Pergudangan|Hub Logistik|Interchange Tol|Interchange|Pelabuhan|Bandara Internasional|Bandara|Kota)\s+/i, '')
              .trim();
            hubFeatures.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: node.coords },
              properties: {
                id: node.id,
                name: node.name,
                shortName: !selectedOriginNode ? `${shortCityName} (KLIK ASAL)` : `${shortCityName} (KLIK TUJUAN)`,
                type: node.type,
                isKeyNode: false,
                isSelectablePrompt: true,
                isTransferHub: false,
              },
            });
          }
        });
      }

      hubSource.setData({ type: 'FeatureCollection', features: hubFeatures });
    }

    // 6. Update Native WebGL Route ETA Badges (route-scoped: same dedupe gate)
    const etaSource = map.getSource('route-eta-badges-source') as mapboxgl.GeoJSONSource;
    if (etaSource && shouldRewriteRoutes) {
      const etaFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
      if (activeRoutes && activeRoutes.length > 0) {
        activeRoutes.forEach((r, idx) => {
          if (!r.waypoints || r.waypoints.length === 0) return;
          const midIdx = Math.floor(r.waypoints.length / 2);
          const midPt = r.waypoints[midIdx];
          if (!midPt || midPt.lon == null || midPt.lat == null) return;
          const isActive = (activeRouteIdx ?? 0) === idx;
          const isHold = r.safety_status === 'HOLD_DELAY';
          const label = isHold ? `HOLD (${r.distance_km.toFixed(0)} km)` : `${r.eta_minutes} min (${r.distance_km.toFixed(0)} km)`;
          etaFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [midPt.lon, midPt.lat] },
            properties: {
              routeIndex: idx,
              label,
              textColor: r.is_compromised ? '#fca5a5' : isHold ? '#fcd34d' : isActive ? '#00f0ff' : '#94a3b8',
            },
          });
        });
      }
      etaSource.setData({ type: 'FeatureCollection', features: etaFeatures });
    }
    if (shouldRewriteRoutes) {
      lastRouteWriteHashRef.current = routeWriteHash;
    }

    // 8. Update Tier 2 Pan-Sumatra Regency & Gazetteer Nodes Source
    const regencySource = map.getSource('regency-nodes-source') as mapboxgl.GeoJSONSource;
    if (regencySource) {
      regencySource.setData({
        type: 'FeatureCollection',
        features: gazetteerNodes.map((node, idx) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
          properties: {
            id: `regency-${idx}-${node.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            name: node.name,
            displayName: node.display_name,
            type: node.type,
            province: node.province || '',
            kabupaten: node.kabupaten || '',
            lon: node.lon,
            lat: node.lat,
          },
        })),
      });
    }

    // 9. Update Custom User Pinned Points Source
    const customSource = map.getSource('custom-pinned-source') as mapboxgl.GeoJSONSource;
    if (customSource) {
      customSource.setData({
        type: 'FeatureCollection',
        features: customPinnedPoints.map((pt) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: pt.coords },
          properties: {
            id: pt.id,
            label: pt.role === 'origin' ? `${pt.name || prettyNodeSlug(pt.id)} (ASAL)` : pt.role === 'dest' ? `${pt.name || prettyNodeSlug(pt.id)} (TUJUAN)` : pt.name || prettyNodeSlug(pt.id),
            role: pt.role,
          },
        })),
      });
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

  // Trigger WebGL canvas resize during and after panel transition animations
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.resize();
    const t1 = setTimeout(() => mapRef.current?.resize(), 150);
    const t2 = setTimeout(() => mapRef.current?.resize(), 320);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLeftSidebarCollapsed, isRightSidebarOpen]);

  useEffect(() => {
    updateMapSources();
    // NOTE: activeFleet intentionally excluded — fleet renders via
    // FleetVehicleLayer Deck overlay, not via these GeoJSON sources.
    // Route/congestion/ETA rewrites are additionally gated by routeWriteHash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    incidents,
    selectedCrisisId,
    activeRoutes,
    activeRouteIdx,
    disasterZones,
    simulatedShockwave,
    selectedOriginNode,
    selectedDestNode,
    hubNodesList,
    gazetteerNodes,
    customPinnedPoints,
    corridorVisibility,
    hiddenRouteIndices,
  ]);

  // Keep route popover screen position synchronized during map pan/zoom
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const updatePopoverScreenPos = () => {
      setSelectedRoutePopover((prev) => {
        if (!prev) return null;
        const pt = map.project(prev.lngLat);
        return {
          ...prev,
          screenPos: { x: pt.x, y: pt.y },
        };
      });
    };
    map.on('move', updatePopoverScreenPos);
    map.on('zoom', updatePopoverScreenPos);
    return () => {
      map.off('move', updatePopoverScreenPos);
      map.off('zoom', updatePopoverScreenPos);
    };
  }, []);

  // Immediately purge custom pinned points and route layers when corridor endpoints are cleared
  useEffect(() => {
    if (!selectedOriginNode && !selectedDestNode) {
      setCustomPinnedPoints([]);
      const map = mapRef.current;
      if (map && isMapLoadedRef.current) {
        const customSrc = map.getSource('custom-pinned-source') as mapboxgl.GeoJSONSource;
        if (customSrc) {
          customSrc.setData({ type: 'FeatureCollection', features: [] });
        }
        const routesSrc = map.getSource('route-paths-source') as mapboxgl.GeoJSONSource;
        if (routesSrc) {
          routesSrc.setData({ type: 'FeatureCollection', features: [] });
        }
        const badgesSrc = map.getSource('route-eta-badges-source') as mapboxgl.GeoJSONSource;
        if (badgesSrc) {
          badgesSrc.setData({ type: 'FeatureCollection', features: [] });
        }
        const congestionSrc = map.getSource('congestion-segments-source') as mapboxgl.GeoJSONSource;
        if (congestionSrc) {
          congestionSrc.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    }
  }, [selectedOriginNode, selectedDestNode]);

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
      const shockwaveKey = `${simulatedShockwave.center[0].toFixed(4)},${simulatedShockwave.center[1].toFixed(4)},${simulatedShockwave.radiusKm || 0}`;
      if (lastFocusedShockwaveKeyRef.current !== shockwaveKey) {
        lastFocusedShockwaveKeyRef.current = shockwaveKey;
        mapRef.current.flyTo({
          center: simulatedShockwave.center,
          zoom: 10,
          duration: 1400,
          essential: true,
        });
      }
    } else {
      lastFocusedShockwaveKeyRef.current = null;
      if (selectedCrisisId) {
        if (lastFocusedCrisisIdRef.current !== selectedCrisisId) {
          lastFocusedCrisisIdRef.current = selectedCrisisId;
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
      } else {
        lastFocusedCrisisIdRef.current = null;
      }
    }
  }, [selectedCrisisId, simulatedShockwave?.center?.[0], simulatedShockwave?.center?.[1], simulatedShockwave?.radiusKm]);

  // External camera focus (news "Fokus" / zone click) — independent of shockwave focus.
  useEffect(() => {
    if (!flyToCoords || !mapRef.current) return;
    try {
      mapRef.current.flyTo({
        center: [flyToCoords.lon, flyToCoords.lat],
        zoom: flyToCoords.zoom ?? 9.2,
        duration: 1200,
        essential: true,
      });
    } catch {
      // quiet fallback when map not ready
    }
  }, [flyToCoords?.lon, flyToCoords?.lat, flyToCoords?.zoom, flyToCoords?.ts]);

  // Step 1 interactive visual cues: animated pulse halo around selectable hub nodes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const isSelecting = demoStage === 0 && (!selectedOriginNode || !selectedDestNode);
    if (!isSelecting) return;

    let animId: number;
    const startTime = performance.now();

    const animatePulse = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const progress = (Math.sin(elapsed * 4) + 1) / 2;
      const radius = 13 + progress * 7;
      const opacity = 0.45 - progress * 0.25;

      try {
        if (map.getLayer('hub-nodes-pulse-outer')) {
          map.setPaintProperty('hub-nodes-pulse-outer', 'circle-radius', [
            'case',
            ['get', 'isKeyNode'], 18,
            ['get', 'isSelectablePrompt'], radius,
            0
          ]);
          map.setPaintProperty('hub-nodes-pulse-outer', 'circle-opacity', [
            'case',
            ['get', 'isKeyNode'], 0.3,
            ['get', 'isSelectablePrompt'], opacity,
            0
          ]);
        }
      } catch {}

      animId = requestAnimationFrame(animatePulse);
    };

    animId = requestAnimationFrame(animatePulse);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [demoStage, selectedOriginNode, selectedDestNode]);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);

  const cancelPendingSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    searchSeqRef.current += 1;
  }, []);

  useEffect(() => () => cancelPendingSearch(), [cancelPendingSearch]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    const q = query.trim().toLowerCase();

    // Cancel any debounce/in-flight request first: otherwise a late response
    // for a previous query repopulates the dropdown after the user cleared it.
    cancelPendingSearch();

    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      setIsSearchOpen(false);
      return;
    }

    // Instant local filter across gazetteer and hub nodes
    const localMatches = gazetteerNodesRef.current.filter((n) => {
      return (
        n.name.toLowerCase().includes(q) ||
        n.display_name.toLowerCase().includes(q) ||
        (n.kabupaten && n.kabupaten.toLowerCase().includes(q)) ||
        (n.province && n.province.toLowerCase().includes(q))
      );
    });

    const hubMatches = (hubNodesList || Object.values(HUB_NODES))
      .filter((h) => h.name.toLowerCase().includes(q))
      .map((h) => ({
        name: h.name,
        display_name: h.name,
        lat: h.coords[1],
        lon: h.coords[0],
        type: h.type,
        province: h.province || 'Sumatra',
      }));

    setSearchResults(mergeSearchResults(query, hubMatches, localMatches).slice(0, 8));
    setSearchError(null);
    setIsSearchOpen(true);

    const seq = searchSeqRef.current;
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.geocode.search(query.trim(), controller.signal);
        if (seq !== searchSeqRef.current) return;
        const live = res?.results ?? [];
        setSearchResults((prev) => mergeSearchResults(query, prev, live));
        setSearchError(null);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError' || seq !== searchSeqRef.current) return;
        // Keep the offline gazetteer hits but say the live lookup failed — never
        // pretend a partial list is the full result set.
        const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
        setSearchError(`Pencarian live gagal${detail} — menampilkan hasil gazetteer lokal saja.`);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 280);
  }, [hubNodesList, cancelPendingSearch]);

  const handleSelectSearchResult = useCallback(
    (item: GeocodeNode | GeocodeSearchResult, role: 'origin' | 'dest' | 'focus' = 'focus') => {
      const coords: [number, number] = [item.lon, item.lat];
      const nodeId = `node-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      mapRef.current?.flyTo({
        center: coords,
        zoom: 11,
        duration: 1200,
        essential: true,
      });

      if (role === 'origin' || role === 'dest') {
        setCustomPinnedPoints((prev) => [
          ...prev.filter((p) => p.role !== role),
          { id: nodeId, coords, name: item.name, role },
        ]);
        onCustomPointSelectedRef.current?.(role, coords, item.name, nodeId);
        onNodeSelectedRef.current?.(nodeId);
      } else {
        const pt = mapRef.current?.project(coords);
        setContextPopup({
          coords,
          nodeId,
          name: item.display_name || item.name,
          type: item.type || 'Titik Lokasi',
          province: item.province,
          screenPos: pt ? { x: pt.x, y: pt.y } : undefined,
        });
      }

      setIsSearchOpen(false);
    },
    []
  );

  return (
    <div className={`relative w-full h-full ${isRightSidebarOpen ? 'sidebar-open' : ''}`}>
      <div
        ref={containerRef}
        id="crisis-map"
        className="w-full h-full"
        aria-label="PreHub crisis intelligence map"
      />

      {/* Dynamic Fleet Vehicle Layer */}
      {mapInstance && layerFilters.fleetVehicles && (
        <FleetVehicleLayer
          map={mapInstance}
          vehicles={activeFleet || []}
          activeRoutes={activeRoutes}
          activeRouteIdx={activeRouteIdx}
          modalityFilter={fleetModalityFilter}
          simSpeed={simSpeed}
          onSelectVehicle={onSelectVehicle}
          selectedVehicleId={selectedVehicleId}
          onCloseVehicle={onCloseVehicle}
          hideEstimatedRoutes={hideEstimatedRoutes}
        />
      )}

      {/* Unified Top Command Bar inside Bounded Map Viewport */}
      <div className="absolute top-3 left-3 right-3 z-40 pointer-events-none flex flex-col gap-2">
        {/* Row 1: Primary Command & Telemetry Strip */}
        <div className="flex items-center justify-between gap-2 w-full">
          {/* Left Group: Expand Button + Universal Search Bar + TopNavTelemetry */}
          <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
            {/* 1. Expand Left Sidebar Button when Collapsed */}
            {isLeftSidebarCollapsed && onExpandSidebar && (
              <button
                type="button"
                onClick={onExpandSidebar}
                className="cursor-pointer px-3 py-1.5 rounded-md bg-[#0c1017] border border-[#1c2432] text-slate-300 hover:text-white hover:bg-[#121822] shadow-xl transition-colors flex items-center gap-1.5 text-xs font-semibold shrink-0"
                title="Tampilkan Panel Berita"
              >
                <PanelLeftOpen className="w-4 h-4 text-slate-300" />
                <span>BERITA</span>
              </button>
            )}

            {/* 2. Universal Location Search Bar */}
            <div className="relative shrink-0">
              <div className="flex items-center backdrop-blur-md bg-[#0c1017]/90 border border-[#1c2432] focus-within:border-cyan-500/50 rounded-lg px-2.5 py-1.5 shadow-xl transition-all w-52 sm:w-60 lg:w-68">
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => {
                    if (searchQuery.trim().length >= 2) setIsSearchOpen(true);
                  }}
                  placeholder="Cari desa, kecamatan, kota, atau hub..."
                  className="bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none w-full font-sans"
                />
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0 ml-1.5" />
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      cancelPendingSearch();
                      setSearchQuery('');
                      setSearchResults([]);
                      setSearchError(null);
                      setIsSearching(false);
                      setIsSearchOpen(false);
                    }}
                    className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>

              {isSearchOpen &&
                searchQuery.trim().length >= 2 &&
                (searchResults.length > 0 || isSearching || !!searchError) && (
                <div className="absolute left-0 top-full mt-2 w-80 bg-[#0c1017]/95 backdrop-blur-md border border-[#1c2432] rounded-lg shadow-2xl p-2 text-xs space-y-1.5 max-h-80 overflow-y-auto no-scrollbar z-50 animate-in fade-in duration-150">
                  <div className="font-sans font-medium text-[11px] text-slate-400 uppercase tracking-wider px-1 pb-1 border-b border-[#1c2432] flex items-center justify-between">
                    <span>Hasil Temuan Pan-Sumatra</span>
                    <span className="text-slate-500 lowercase">{searchResults.length} titik</span>
                  </div>

                  {isSearching && (
                    <div className="px-2 py-2 text-[11px] text-slate-400 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 text-cyan-400 animate-spin shrink-0" />
                      <span>Mencari gazetteer desa / kecamatan / kota…</span>
                    </div>
                  )}

                  {searchError && (
                    <div className="px-2 py-2 text-[10px] text-amber-300 leading-snug space-y-1.5">
                      <p>{searchError}</p>
                      <button
                        type="button"
                        onClick={() => handleSearchChange(searchQuery)}
                        className="cursor-pointer px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-[10px] font-semibold transition-colors"
                      >
                        Coba lagi
                      </button>
                    </div>
                  )}

                  {!isSearching && !searchError && searchResults.length === 0 && (
                    <div className="px-2 py-3 text-[11px] text-slate-400 leading-snug">
                      Tidak ada hasil untuk “{searchQuery.trim()}”. Coba nama desa, kecamatan, kota, atau hub lain.
                    </div>
                  )}

                  {searchResults.map((item, idx) => {
                    const key = `${item.name}-${idx}`;
                    const subtitle = `${item.province || 'Sumatra'}${item.kabupaten ? ' • ' + item.kabupaten : ''}`;
                    const badgeType = searchResultBadge(item);
                    return (
                      <div
                        key={key}
                        className="p-2 rounded-md hover:bg-[#121822] transition-colors border border-transparent hover:border-[#1c2432]/60 group"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                              <span className="font-medium text-slate-100 truncate">{item.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                {badgeType}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate pl-4.5 mt-0.5">{subtitle}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 mt-2 pl-4.5">
                          <button
                            type="button"
                            onClick={() => handleSelectSearchResult(item, 'origin')}
                            className="cursor-pointer px-2 py-0.5 rounded bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/50 text-[10px] flex items-center gap-1 transition-colors"
                          >
                            <ArrowUpRight className="w-2.5 h-2.5" />
                            <span>Set Asal</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectSearchResult(item, 'dest')}
                            className="cursor-pointer px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/50 text-[10px] flex items-center gap-1 transition-colors"
                          >
                            <Flag className="w-2.5 h-2.5" />
                            <span>Set Tujuan</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectSearchResult(item, 'focus')}
                            className="cursor-pointer px-2 py-0.5 rounded bg-[#1a2333] hover:bg-[#223044] text-slate-300 border border-[#2b3a50] text-[10px] flex items-center gap-1 transition-colors"
                          >
                            <Crosshair className="w-2.5 h-2.5" />
                            <span>Fokus</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. TopNavTelemetry Slot */}
            {topNavTelemetrySlot}
          </div>

          {/* Right Group: Action Controls (Restore + Layer Peta + Legenda Rute) */}
          {!(isRightSidebarOpen || (demoStage != null && demoStage >= 2)) && (
            <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
              {(hiddenRouteIndices.size > 0 ||
                !corridorVisibility?.land ||
                !corridorVisibility?.sea ||
                !corridorVisibility?.air) && (
                <button
                  type="button"
                  onClick={() => {
                    setInternalHiddenRouteIndices(new Set());
                    onResetCorridorVisibility?.();
                  }}
                  className="cursor-pointer px-3 py-1.5 rounded-md backdrop-blur-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 shadow-xl transition-all duration-200"
                  title="Tampilkan kembali seluruh koridor rute yang disembunyikan"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Tampilkan Semua Rute</span>
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLayerFilterMenu((v) => !v)}
                  className={`cursor-pointer px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xl ${
                    showLayerFilterMenu
                      ? 'bg-white text-[#080d14] border-white'
                      : 'bg-[#0c1017] text-slate-300 border-[#1c2432] hover:text-white hover:bg-[#121822]'
                  }`}
                  title="Filter Layer Peta"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span>Layer Peta</span>
                </button>

                {showLayerFilterMenu && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-[#0c1017] border border-[#1c2432] p-3 rounded-lg shadow-xl text-xs space-y-2 z-50 animate-in fade-in duration-150">
                    <div className="font-sans font-medium text-xs text-slate-300 uppercase tracking-wider border-b border-[#1c2432] pb-1.5">
                      Filter Visualisasi Layer
                    </div>

                    <div className="space-y-1 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleLayerFilter('baselineCorridors')}
                        className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded hover:bg-[#121822] transition"
                      >
                        <span className="text-slate-200">Koridor Utama</span>
                        <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                          layerFilters.baselineCorridors ? 'bg-white border-white text-[#080d14]' : 'border-[#1c2432]'
                        }`}>
                          {layerFilters.baselineCorridors && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleLayerFilter('bottlenecks')}
                        className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded hover:bg-[#121822] transition"
                      >
                        <span className="text-slate-200">Kemacetan / Bottleneck</span>
                        <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                          layerFilters.bottlenecks ? 'bg-white border-white text-[#080d14]' : 'border-[#1c2432]'
                        }`}>
                          {layerFilters.bottlenecks && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleLayerFilter('weatherRadar')}
                        className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded hover:bg-[#121822] transition"
                      >
                        <span className="text-slate-200">Radar Cuaca & Bahaya</span>
                        <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                          layerFilters.weatherRadar ? 'bg-white border-white text-[#080d14]' : 'border-[#1c2432]'
                        }`}>
                          {layerFilters.weatherRadar && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleLayerFilter('fleetVehicles')}
                        className="cursor-pointer w-full flex items-center justify-between p-1.5 rounded hover:bg-[#121822] transition"
                      >
                        <span className="text-slate-200">Armada Logistik</span>
                        <span className={`w-4 h-4 rounded flex items-center justify-center border ${
                          layerFilters.fleetVehicles ? 'bg-white border-white text-[#080d14]' : 'border-[#1c2432]'
                        }`}>
                          {layerFilters.fleetVehicles && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {mapLegendSlot}
            </div>
          )}
        </div>

        {/* Row 2: Fleet Modality Bar */}
        {fleetModalitySlot && (
          <div className="flex items-center gap-2 pointer-events-auto">
            {fleetModalitySlot}
          </div>
        )}
      </div>

      {/* Glassmorphic Village & Right-Click Context Menu Popup Card */}
      {contextPopup && (
        <div
          className="absolute z-50 pointer-events-auto transition-all duration-150"
          style={{
            left: Math.min(
              Math.max(16, (contextPopup.screenPos?.x || 100) - 140),
              typeof window !== 'undefined' ? window.innerWidth - 300 : 800
            ),
            top: Math.max(70, (contextPopup.screenPos?.y || 200) - 160),
          }}
        >
          <div className="w-72 backdrop-blur-md bg-[#0c1017]/95 border border-[#1c2432] p-3 rounded-lg shadow-2xl space-y-2.5 text-xs animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-2 border-b border-[#1c2432] pb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-semibold text-slate-100 truncate">{contextPopup.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setContextPopup(null)}
                className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                title="Tutup Popup"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                {contextPopup.type}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {contextPopup.coords[0].toFixed(3)}°, {contextPopup.coords[1].toFixed(3)}°
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const { coords, name, nodeId } = contextPopup;
                  setCustomPinnedPoints((prev) => [
                    ...prev.filter((p) => p.role !== 'origin'),
                    { id: nodeId, coords, name, role: 'origin' },
                  ]);
                  onCustomPointSelectedRef.current?.('origin', coords, name, nodeId);
                  onNodeSelectedRef.current?.(nodeId);
                  setContextPopup(null);
                }}
                className="cursor-pointer px-2.5 py-1.5 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-700/60 font-medium text-xs flex items-center justify-center gap-1 transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Jadikan Asal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const { coords, name, nodeId } = contextPopup;
                  setCustomPinnedPoints((prev) => [
                    ...prev.filter((p) => p.role !== 'dest'),
                    { id: nodeId, coords, name, role: 'dest' },
                  ]);
                  onCustomPointSelectedRef.current?.('dest', coords, name, nodeId);
                  onNodeSelectedRef.current?.(nodeId);
                  setContextPopup(null);
                }}
                className="cursor-pointer px-2.5 py-1.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/60 font-medium text-xs flex items-center justify-center gap-1 transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Jadikan Tujuan</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                mapRef.current?.flyTo({ center: contextPopup.coords, zoom: 12, duration: 1000 });
              }}
              className="cursor-pointer w-full py-1 rounded bg-[#161d27] hover:bg-[#1e2736] text-slate-300 border border-[#2b3a50] text-[11px] flex items-center justify-center gap-1 transition-colors"
            >
              <Crosshair className="w-3 h-3 text-slate-400" />
              <span>Fokuskan Kamera ke Titik Ini</span>
            </button>
          </div>
        </div>
      )}

      {/* Glassmorphic On-Map Route Corridor Selection & Metrics Popover Card */}
      {selectedRoutePopover && (
        <div
          className="absolute z-50 pointer-events-auto transition-transform duration-75"
          style={{
            left: Math.min(
              Math.max(16, selectedRoutePopover.screenPos.x - 150),
              typeof window !== 'undefined' ? window.innerWidth - 320 : 800
            ),
            top: Math.max(70, selectedRoutePopover.screenPos.y - 190),
          }}
        >
          <div className="w-80 backdrop-blur-md bg-[#0c0e12]/90 border border-white/10 p-3.5 rounded-xl shadow-2xl space-y-3 text-xs animate-in zoom-in-95 duration-150 text-slate-100 font-sans">
            {/* Header: Corridor Name & Modality Badge */}
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`p-1.5 rounded-lg border shrink-0 ${
                    selectedRoutePopover.route.corridor_type === 'sea_intermodal' || selectedRoutePopover.route.modality === 'maritime'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : selectedRoutePopover.route.corridor_type === 'air_intermodal' || selectedRoutePopover.route.modality === 'air'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {selectedRoutePopover.route.corridor_type === 'sea_intermodal' || selectedRoutePopover.route.modality === 'maritime' ? (
                    <Ship className="w-4 h-4" />
                  ) : selectedRoutePopover.route.corridor_type === 'air_intermodal' || selectedRoutePopover.route.modality === 'air' ? (
                    <Plane className="w-4 h-4" />
                  ) : (
                    <Truck className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-white truncate text-xs leading-tight">
                    {selectedRoutePopover.route.description || selectedRoutePopover.route.route_name || `Koridor #${selectedRoutePopover.routeIndex + 1}`}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border ${
                        selectedRoutePopover.route.corridor_type === 'sea_intermodal' || selectedRoutePopover.route.modality === 'maritime'
                          ? 'bg-blue-950/60 text-blue-300 border-blue-800/40'
                          : selectedRoutePopover.route.corridor_type === 'air_intermodal' || selectedRoutePopover.route.modality === 'air'
                            ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40'
                            : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
                      }`}
                    >
                      {selectedRoutePopover.route.corridor_type === 'sea_intermodal' || selectedRoutePopover.route.modality === 'maritime'
                        ? 'Laut + Darat'
                        : selectedRoutePopover.route.corridor_type === 'air_intermodal' || selectedRoutePopover.route.modality === 'air'
                          ? 'Udara + Darat'
                          : 'Darat'}
                    </span>
                    {selectedRoutePopover.routeIndex === (activeRouteIdx ?? 0) && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        AKTIF
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRoutePopover(null)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5 cursor-pointer transition-colors"
                title="Tutup Popover"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-[#121822]/70 border border-white/5 text-[11px]">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-mono">Estimasi Waktu (ETA)</span>
                <span className="font-semibold text-white font-mono">
                  {Math.floor(selectedRoutePopover.route.eta_minutes / 60)}j {Math.round(selectedRoutePopover.route.eta_minutes % 60)}m
                </span>
                <span className="text-[10px] text-slate-400 block">
                  ({selectedRoutePopover.route.distance_km.toFixed(0)} km)
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-mono">Estimasi Biaya Total</span>
                <span className="font-semibold text-emerald-300 font-mono">
                  Rp {(
                    selectedRoutePopover.route.hedging?.reroute_cost_idr ||
                    selectedRoutePopover.route.economic_comparison?.reroute_total_cost_idr ||
                    (selectedRoutePopover.route.corridor_type === 'air_intermodal' || selectedRoutePopover.route.modality === 'air'
                      ? 14500000
                      : selectedRoutePopover.route.corridor_type === 'sea_intermodal' || selectedRoutePopover.route.modality === 'maritime'
                        ? 6200000
                        : 3850000)
                  ).toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {selectedRoutePopover.route.safety_status === 'SAFE_DETOUR'
                    ? 'Detour Terverifikasi'
                    : selectedRoutePopover.route.safety_status === 'COMPROMISED'
                      ? 'Terdampak Krisis'
                      : 'Jalur Bebas Hambatan'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-0.5">
              {selectedRoutePopover.routeIndex === (activeRouteIdx ?? 0) ? (
                <div className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 select-none">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Koridor Utama Aktif</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Phase 77: delegate to parent handleSelectRoute (opens Route
                    // Detail Modal + role-branched HITL); no direct styling here.
                    onSelectRouteRef.current?.(selectedRoutePopover.routeIndex);
                    setSelectedRoutePopover(null);
                  }}
                  className="cursor-pointer flex-1 py-1.5 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Pilih Koridor Ini</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const targetIdx = selectedRoutePopover.routeIndex;
                  const r = selectedRoutePopover.route;
                  const mod: 'land' | 'sea' | 'air' =
                    r.corridor_type === 'sea_intermodal' || r.modality === 'maritime'
                      ? 'sea'
                      : r.corridor_type === 'air_intermodal' || r.modality === 'air'
                        ? 'air'
                        : 'land';
                  setInternalHiddenRouteIndices((prev) => new Set(prev).add(targetIdx));
                  onHideRoute?.(targetIdx);
                  onToggleCorridor?.(mod);
                  setSelectedRoutePopover(null);
                }}
                className="cursor-pointer py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200"
                title="Sembunyikan rute ini dari peta"
              >
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Sembunyikan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {drawModeActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[360] px-3.5 py-1.5 rounded-md bg-[#1a120b] border border-amber-500/40 shadow-xl flex items-center gap-2.5 animate-in fade-in duration-200">
          <span className="h-2 w-2 rounded-full bg-amber-400"></span>
          <span className="text-xs font-medium text-amber-300">
            Gambar Poligon Area Disrupsi
          </span>
          <span className="text-xs text-amber-200/60 border-l border-amber-500/30 pl-2">
            Klik titik pada peta untuk menutup bentuk poligon
          </span>
        </div>
      )}
    </div>
  );
}
