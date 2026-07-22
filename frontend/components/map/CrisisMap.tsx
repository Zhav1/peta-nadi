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
}: CrisisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);
  const htmlMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const routeEtaMarkersRef = useRef<mapboxgl.Marker[]>([]);

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
          'fill-color': '#ff9900',
          'fill-opacity': 0.18,
        },
      });
      map.addLayer({
        id: 'simulated-shockwave-outline',
        type: 'line',
        source: 'simulated-shockwave-source',
        paint: {
          'line-color': '#ff9900',
          'line-width': 2.5,
          'line-dasharray': [2, 1],
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

      const el = document.createElement('div');
      el.className = `cursor-pointer transition-transform transform hover:scale-110 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold shadow-xl border backdrop-blur-md ${
        isOrigin
          ? 'bg-cyan-950/90 text-cyan-300 border-cyan-400 ring-4 ring-cyan-500/30'
          : isDest
          ? 'bg-amber-950/90 text-amber-300 border-amber-400 ring-4 ring-amber-500/30'
          : 'bg-slate-900/80 text-slate-200 border-slate-700 hover:border-cyan-400/60'
      }`;

      el.innerHTML = `
        <span>${node.icon}</span>
        <span>${node.name}</span>
        ${isOrigin ? '<span class="px-1 bg-cyan-400 text-slate-950 rounded text-[9px]">START</span>' : ''}
        ${isDest ? '<span class="px-1 bg-amber-400 text-slate-950 rounded text-[9px]">END</span>' : ''}
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
        const modeIcon = r.modality === 'air' ? '✈️' : r.modality === 'maritime' ? '⚓' : '🚚';

        const el = document.createElement('div');
        el.className = `cursor-pointer transition-all transform hover:scale-110 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold shadow-2xl border backdrop-blur-md ${
          r.is_compromised
            ? 'bg-red-950/90 text-red-300 border-red-500 shadow-red-500/30'
            : isActive
            ? 'bg-cyan-500 text-slate-950 border-cyan-200 ring-4 ring-cyan-400/40 shadow-cyan-500/40'
            : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-cyan-400'
        }`;

        el.innerHTML = `
          <span>${modeIcon}</span>
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

    // 4. Update Simulated Shockwave Pulse Source
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

  return (
    <div className="relative w-full h-full">
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
    </div>
  );
}
