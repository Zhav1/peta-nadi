# PLAN — Phase 4: 3D Map Dashboard (Next.js + Mapbox + Deck.gl)

**Phase:** 4
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)
**Research:** `.planning/phases/phase-4/RESEARCH.md`
**Status:** READY TO EXECUTE
**Estimated effort:** 3–4 days (solo, AI-assisted)

---

## Goal

Build the PetaNadi 3D crisis intelligence dashboard: a full-screen Mapbox GL JS v3 +
Deck.gl v9 map with real-time WebSocket-driven crisis pins, a glassmorphism tri-panel
sidebar, a timeline scrubber, and a polygon draw tool for disaster simulation — all
styled in a premium dark glassmorphism UI.

---

## Prerequisites Check

- [x] Phase 3 complete — LangGraph swarm is live; `POST /api/crisis/process` and `WS /ws/crisis/{id}` work
- [x] Next.js 14.2 scaffolded in `/frontend` with mapbox-gl v3.25 + deck.gl v9.3 installed
- [x] Tailwind CSS v3 configured
- [ ] `@deck.gl/aggregation-layers` added (HeatmapLayer lives here — not in `@deck.gl/layers`)
- [ ] `recharts` added (PIHPS price charts)
- [ ] `@mapbox/mapbox-gl-draw` + `@types/mapbox__mapbox-gl-draw` added
- [ ] `@types/mapbox-gl` removed (conflicts with mapbox-gl v3 built-in types)
- [ ] `NEXT_PUBLIC_MAPBOX_TOKEN` set in `frontend/.env.local`
- [ ] `NEXT_PUBLIC_API_URL` set in `frontend/.env.local` (e.g. `http://localhost:8000`)

---

## Wave 1 — Foundation (execute first, all waves depend on these)

### Task 1.1 — Update `next.config.mjs`

**File:** `frontend/next.config.mjs`
**Action:** OVERWRITE

Deck.gl v9 ships as ESM and requires explicit transpilation in Next.js 14.
Without `transpilePackages`, imports fail at runtime with "SyntaxError: Cannot use import statement".

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    'deck.gl',
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/aggregation-layers',
    '@deck.gl/mapbox',
    '@luma.gl/core',
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        worker_threads: false,
      };
    }
    return config;
  },
};

export default nextConfig;
```

**Verification:** `npm run build` in `frontend/` completes without ESM import errors.

---

### Task 1.2 — Install missing npm packages

Run in `frontend/`:
```bash
npm install @deck.gl/aggregation-layers recharts @mapbox/mapbox-gl-draw
npm install --save-dev @types/mapbox__mapbox-gl-draw
npm uninstall @types/mapbox-gl
```

**Why remove `@types/mapbox-gl`:** mapbox-gl v3.5+ ships with built-in TypeScript declarations.
Having both causes duplicate type definition conflicts (TS errors on `Map`, `LngLatLike`, etc.).

**Verification:**
```bash
node -e "require('@deck.gl/aggregation-layers')"   # no error
node -e "require('recharts')"                       # no error
node -e "require('@mapbox/mapbox-gl-draw')"         # no error
```

---

### Task 1.3 — Environment variables

**File:** `frontend/.env.local` (already gitignored)
Add:
```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...   # your Mapbox public token
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

**File:** `frontend/.env.example` (commit this)
```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Security: Token must be URL-restricted in Mapbox Dashboard → Tokens → Edit →
Allowed URLs: `http://localhost:3000`, `https://petanadi.id`.

**Verification:** `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` is non-empty at runtime.

---

### Task 1.4 — Design system: `globals.css`

**File:** `frontend/app/globals.css`
**Action:** OVERWRITE

Set up CSS custom properties for the dark crisis-intelligence aesthetic.
Use Inter font from Google Fonts (loaded in layout.tsx).

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg: #080d14;
  --color-surface: rgba(15, 23, 42, 0.6);
  --color-border: rgba(255, 255, 255, 0.08);
  --color-accent: #22d3ee;        /* cyan-400 */
  --color-danger: #f87171;        /* red-400 */
  --color-warning: #fb923c;       /* orange-400 */
  --color-success: #34d399;       /* emerald-400 */
  --color-muted: #64748b;         /* slate-500 */
  --font-sans: 'Inter', system-ui, sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #__next {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family: var(--font-sans);
  background-color: var(--color-bg);
  color: #f1f5f9;
  -webkit-font-smoothing: antialiased;
}

/* Mapbox canvas must fill its container */
.mapboxgl-canvas {
  outline: none;
}

/* Custom scrollbar for sidebar panels */
.panel-scroll::-webkit-scrollbar {
  width: 4px;
}
.panel-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.panel-scroll::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.4);
  border-radius: 2px;
}

/* Animated pulse for loading states */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.shimmer {
  background: linear-gradient(90deg, #0f172a 25%, #1e293b 50%, #0f172a 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* Crisis severity pulse ring */
@keyframes crisis-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.4); }
  50% { box-shadow: 0 0 0 12px rgba(248, 113, 113, 0); }
}
.crisis-pulse {
  animation: crisis-pulse 2s infinite;
}
```

---

### Task 1.5 — Update `app/layout.tsx`

**File:** `frontend/app/layout.tsx`
**Action:** OVERWRITE

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PetaNadi — Logistics Resilience Intelligence Platform',
  description:
    'Real-time AI-powered crisis map for North Sumatra corridor logistics. ' +
    'Monitor floods, port closures, and supply chain disruptions with live agent intelligence.',
  keywords: ['logistics', 'crisis', 'North Sumatra', 'supply chain', 'AI'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body className="bg-[#080d14] text-slate-100 h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
```

**Verification:** `npm run dev` starts without errors. `localhost:3000` shows a dark blank page.

---

## Wave 2 — Type Definitions & API Client (parallel, depends on Wave 1)

### Task 2.1 — TypeScript types matching backend `CrisisState`

**File:** `frontend/lib/types.ts`
**Action:** CREATE NEW

```ts
// Mirror of agents/state.py TypedDicts — keep in sync with backend

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type CrisisType = 'flood' | 'port_closure' | 'wildfire' | 'congestion' | 'earthquake';
export type CrisisStatus = 'detecting' | 'validating' | 'validated' | 'resolved';

export interface AgentFinding {
  agent: string;
  confidence: number;
  summary: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RouteRecommendation {
  description: string;
  waypoints: Array<{ lat: number; lon: number }>;
  distance_km: number;
  eta_minutes: number;
  fuel_increase_pct: number;
  risk_score: number;
}

export interface LTMEpisode {
  episode_id: string;
  title: string;
  description: string;
  crisis_type: string;
  inflation_multiplier: number;
  recovery_days: number;
  similarity_score: number;
}

export interface GraphRAGNode {
  entity_id: string;
  entity_type: 'port' | 'route' | 'warehouse' | 'commodity' | 'supplier';
  name: string;
  relation: string;
  impact_score: number;
}

export interface CrisisState {
  crisis_id: string;
  title: string;
  type: CrisisType;
  is_simulated: boolean;
  lat: number;
  lon: number;
  region: string;
  affected_polygon?: number[][];
  status: CrisisStatus;
  overall_confidence: number;
  data_collection_finding?: AgentFinding;
  osint_hazard_finding?: AgentFinding;
  prediction_finding?: AgentFinding;
  route_optimization_finding?: AgentFinding;
  economic_intelligence_finding?: AgentFinding;
  decision_support_output?: string;
  route_recommendations: RouteRecommendation[];
  inflation_forecast?: {
    commodity: string;
    region: string;
    pct_increase: number;
    timeframe_hours: number;
  };
  causal_chain?: Array<{ node: string; relation: string }>;
  hazard_polygons?: Array<Record<string, unknown>>;
  consensus_breakdown?: Record<string, number>;
  validated: boolean;
  created_at: string;
  updated_at: string;
  messages: string[];
}

// Incident list item (lighter weight — from REST endpoint)
export interface IncidentSummary {
  id: string;
  title: string;
  type: CrisisType;
  severity: Severity;
  status: CrisisStatus;
  confidence: number;
  lat?: number;
  lon?: number;
  created_at: string;
}

// WebSocket message types
export type WsEvent =
  | { event: 'node_update'; crisis_id: string; data: Partial<CrisisState> }
  | { event: 'complete'; crisis_id: string; data: { status: 'finished' } }
  | { event: 'error'; crisis_id: string; error: string };

// Map layer data shapes
export interface FireHotspot {
  coordinates: [number, number];   // [lng, lat]
  confidence: number;               // 0–100
}

export interface MaritimeVector {
  path: [number, number][];         // [[lng, lat], ...]
  vessel_id: string;
  name: string;
}

export interface DisasterZone {
  polygon: [number, number][];      // ring [[lng, lat], ...]
  type: CrisisType;
  risk: number;                     // 0–1
  crisis_id?: string;
}

// PIHPS price chart data
export interface PricePoint {
  date: string;
  beras?: number;       // rice (IDR/kg)
  minyak?: number;      // cooking oil (IDR/liter)
  cabai?: number;       // chili (IDR/kg)
  gula?: number;        // sugar (IDR/kg)
}
```

**Verification:** `npx tsc --noEmit` in `frontend/` — no type errors on this file.

---

### Task 2.2 — API client

**File:** `frontend/lib/api.ts`
**Action:** CREATE NEW

```ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  incidents: {
    list: (params?: { status?: string; severity?: string; limit?: number }) => {
      const qs = params
        ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as string[][]).toString()
        : '';
      return request<{ items: import('./types').IncidentSummary[]; total: number }>(
        `/api/v1/incidents${qs}`
      );
    },
    get: (id: string) =>
      request<import('./types').CrisisState>(`/api/v1/incidents/${id}`),
    simulate: (body: {
      type: string;
      polygon: [number, number][];
      region?: string;
    }) =>
      request<{ scenario_id: string }>('/api/v1/incidents/simulate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  crisis: {
    process: (payload: {
      type: string;
      source: string;
      severity: string;
      lat?: number;
      lon?: number;
      region?: string;
      title?: string;
      is_simulated?: boolean;
    }) =>
      request<{ crisis_id: string; status: string; overall_confidence: number; validated: boolean; summary?: string }>(
        '/api/crisis/process',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
  },
};
```

**Verification:** TypeScript resolves all imports. No `any` types used.

---

### Task 2.3 — WebSocket hook

**File:** `frontend/hooks/useCrisisSocket.ts`
**Action:** CREATE NEW

```ts
'use client';
import { useEffect, useRef, useCallback } from 'react';
import type { WsEvent } from '@/lib/types';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';

export function useCrisisSocket(
  crisisId: string | null,
  onMessage: (event: WsEvent) => void
) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(1000);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage; // keep stable ref without re-connecting

  const connect = useCallback(() => {
    if (!crisisId) return;
    const ws = new WebSocket(`${WS_BASE}/ws/crisis/${crisisId}`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log(`[WS] Connected → crisis:${crisisId}`);
      retryDelayRef.current = 1000;
    };

    ws.onmessage = (e) => {
      try {
        onMessageRef.current(JSON.parse(e.data) as WsEvent);
      } catch {
        console.warn('[WS] Failed to parse message', e.data);
      }
    };

    ws.onclose = () => {
      console.log(`[WS] Closed — retrying in ${retryDelayRef.current}ms`);
      reconnectRef.current = setTimeout(() => {
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30_000);
        connect();
      }, retryDelayRef.current);
    };

    ws.onerror = () => ws.close(); // triggers onclose → reconnect
  }, [crisisId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  // Expose send for initial payload delivery
  return {
    send: (data: unknown) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify(data));
      }
    },
    close: () => socketRef.current?.close(),
  };
}
```

**Verification:**
- TypeScript: `npx tsc --noEmit` — no errors
- Manual: open `localhost:3000`, DevTools → Network → WS tab shows connection to `ws://localhost:8000/ws/crisis/...`

---

### Task 2.4 — Incidents polling hook

**File:** `frontend/hooks/useIncidents.ts`
**Action:** CREATE NEW

```ts
'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { IncidentSummary } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000; // 15-second passive poll

export function useIncidents() {
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await api.incidents.list({ limit: 100 });
      setIncidents(res.items);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    const timer = setInterval(fetchIncidents, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchIncidents]);

  return { incidents, loading, error, lastUpdated, refetch: fetchIncidents };
}
```

---

## Wave 3 — Map Canvas (parallel, depends on Wave 2)

### Task 3.1 — Deck.gl layer factory functions

**File:** `frontend/lib/layers.ts`
**Action:** CREATE NEW

```ts
import { ScatterplotLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { FireHotspot, MaritimeVector, DisasterZone, IncidentSummary, RouteRecommendation } from './types';

/** Severity → RGBA color */
function severityColor(severity: string, alpha = 200): [number, number, number, number] {
  switch (severity) {
    case 'critical': return [239, 68, 68, alpha];
    case 'high':     return [249, 115, 22, alpha];
    case 'medium':   return [234, 179, 8, alpha];
    default:         return [34, 197, 94, alpha];
  }
}

export function buildCrisisPinsLayer(
  incidents: IncidentSummary[],
  selectedId: string | null,
  onClick: (id: string) => void
) {
  return new ScatterplotLayer({
    id: 'crisis-pins',
    slot: 'top',
    data: incidents.filter((i) => i.lat != null && i.lon != null),
    getPosition: (d) => [d.lon!, d.lat!],
    getRadius: (d) => {
      const base = d.severity === 'critical' ? 2000 : d.severity === 'high' ? 1500 : 1000;
      return d.id === selectedId ? base * 1.5 : base;
    },
    radiusMinPixels: 6,
    radiusMaxPixels: 36,
    getFillColor: (d) => severityColor(d.severity),
    getLineColor: (d) => d.id === selectedId ? [255, 255, 255, 220] : [255, 255, 255, 80],
    stroked: true,
    lineWidthMinPixels: d => d.id === selectedId ? 2 : 1,
    pickable: true,
    onClick: (info) => info.object && onClick((info.object as IncidentSummary).id),
    updateTriggers: { getRadius: selectedId, getLineColor: selectedId },
  });
}

export function buildRoutePathsLayer(routes: RouteRecommendation[], activeIdx: number | null) {
  return new PathLayer({
    id: 'route-paths',
    slot: 'top',
    data: routes.map((r, i) => ({
      path: r.waypoints.map((wp) => [wp.lon, wp.lat] as [number, number]),
      isActive: i === activeIdx,
      riskScore: r.risk_score,
    })),
    getPath: (d) => d.path,
    getColor: (d) =>
      d.isActive
        ? [34, 211, 238, 255]          // cyan — selected route
        : [100, 116, 139, 160],        // muted gray — alternatives
    getWidth: (d) => (d.isActive ? 6 : 3),
    widthMinPixels: 2,
    widthMaxPixels: 10,
    capRounded: true,
    jointRounded: true,
    pickable: true,
    updateTriggers: { getColor: activeIdx, getWidth: activeIdx },
  });
}

export function buildFireHeatmapLayer(hotspots: FireHotspot[]) {
  return new HeatmapLayer({
    id: 'fire-heatmap',
    slot: 'bottom',
    data: hotspots,
    getPosition: (d) => d.coordinates,
    getWeight: (d) => d.confidence / 100,
    radiusPixels: 50,
    intensity: 1.2,
    threshold: 0.03,
    colorRange: [
      [0, 0, 255, 0],
      [255, 140, 0, 180],
      [255, 50, 0, 255],
    ],
    pickable: false,
  });
}

export function buildDisasterZonesLayer(
  zones: DisasterZone[],
  onClick: (zone: DisasterZone) => void
) {
  return new PolygonLayer({
    id: 'disaster-zones',
    slot: 'bottom',
    data: zones,
    getPolygon: (d) => d.polygon,
    getFillColor: (d) => {
      const r = Math.round(255 * d.risk);
      return [r, Math.round(255 * (1 - d.risk * 0.7)), 0, 70];
    },
    getLineColor: [255, 100, 0, 200],
    getLineWidth: 2,
    lineWidthMinPixels: 1,
    extruded: false,
    filled: true,
    stroked: true,
    pickable: true,
    onClick: (info) => info.object && onClick(info.object as DisasterZone),
  });
}

export function buildMaritimeLayer(vectors: MaritimeVector[]) {
  return new PathLayer({
    id: 'maritime-paths',
    slot: 'middle',
    data: vectors,
    getPath: (d) => d.path,
    getColor: [34, 211, 238, 120],   // translucent cyan
    getWidth: 2,
    widthMinPixels: 1,
    capRounded: true,
    pickable: false,
    dashArray: [4, 2],               // dashed line for vessels
  });
}
```

**Verification:** `npx tsc --noEmit` — all layer functions type-check.

---

### Task 3.2 — Main `CrisisMap` component

**File:** `frontend/components/map/CrisisMap.tsx`
**Action:** CREATE NEW

This is the core map canvas. It must be loaded with `ssr: false` from the page.
The overlay ref is the central control point — layer updates go through `overlayRef.current.setProps()`.

```tsx
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
```

**Verification:**
- Map renders at `localhost:3000`
- Browser DevTools: no WebGL errors in Console
- Crisis pins appear on map when backend returns incidents

---

### Task 3.3 — Dynamic map page wrapper

**File:** `frontend/app/page.tsx`
**Action:** OVERWRITE (skeleton — will be fully wired in Wave 6)

This is the Server Component shell. All map logic is deferred via `dynamic()`.

```tsx
import dynamic from 'next/dynamic';

const DashboardClient = dynamic(() => import('@/components/dashboard/DashboardClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-[#080d14] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm tracking-widest uppercase">
          Initializing PetaNadi...
        </span>
      </div>
    </div>
  ),
});

export default function Page() {
  return <DashboardClient />;
}
```

---

## Wave 4 — Sidebar & Panel UI (parallel, depends on Wave 2)

### Task 4.1 — Glassmorphism panel wrapper

**File:** `frontend/components/ui/GlassPanel.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function GlassPanel({ children, className, id }: GlassPanelProps) {
  return (
    <div
      id={id}
      className={cn(
        'bg-slate-900/60 backdrop-blur-lg',
        'border border-white/10',
        'rounded-2xl shadow-2xl shadow-black/60',
        'ring-1 ring-white/5',
        className
      )}
    >
      {children}
    </div>
  );
}
```

**File:** `frontend/lib/utils.ts`
**Action:** CREATE NEW

```ts
import { type ClassValue, clsx } from 'clsx';

// Install clsx: npm install clsx
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
```

Add dependency: `npm install clsx`

---

### Task 4.2 — Data freshness badge component

**File:** `frontend/components/ui/FreshnessBadge.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import { useEffect, useState } from 'react';

interface FreshnessBadgeProps {
  lastUpdated: Date | null;
  sourceLabel: string;
  thresholdYellowMs?: number;   // default: 5 min
  thresholdRedMs?: number;      // default: 15 min
}

function formatAge(ms: number): string {
  if (ms < 60_000) return '< 1 min ago';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export function FreshnessBadge({
  lastUpdated,
  sourceLabel,
  thresholdYellowMs = 300_000,
  thresholdRedMs = 900_000,
}: FreshnessBadgeProps) {
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => setAge(Date.now() - lastUpdated.getTime());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const health =
    age === null ? 'gray'
    : age < thresholdYellowMs ? 'green'
    : age < thresholdRedMs ? 'yellow'
    : 'red';

  const dotColor = {
    green: 'bg-emerald-400',
    yellow: 'bg-yellow-400',
    red: 'bg-red-400 animate-pulse',
    gray: 'bg-slate-600',
  }[health];

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{sourceLabel}</span>
      {age !== null && (
        <span className="text-slate-500">{formatAge(age)}</span>
      )}
    </div>
  );
}
```

---

### Task 4.3 — Tri-panel sidebar

**File:** `frontend/components/sidebar/CrisisSidebar.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { EvidenceTab } from './EvidenceTab';
import { MitigationTab } from './MitigationTab';
import { EconomicTab } from './EconomicTab';
import { CausalChainPanel } from './CausalChainPanel';
import type { CrisisState, RouteRecommendation } from '@/lib/types';

const TABS = ['Evidence', 'Mitigation', 'Economic'] as const;
type Tab = typeof TABS[number];

interface CrisisSidebarProps {
  crisis: CrisisState;
  onClose: () => void;
  onSelectRoute: (idx: number) => void;
  activeRouteIdx: number | null;
}

export function CrisisSidebar({
  crisis,
  onClose,
  onSelectRoute,
  activeRouteIdx,
}: CrisisSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Evidence');
  const [showCausalChain, setShowCausalChain] = useState(false);

  const severityColor = {
    critical: 'text-red-400 bg-red-400/10 ring-red-400/30',
    high: 'text-orange-400 bg-orange-400/10 ring-orange-400/30',
    medium: 'text-yellow-400 bg-yellow-400/10 ring-yellow-400/30',
    low: 'text-emerald-400 bg-emerald-400/10 ring-emerald-400/30',
  }['high']; // derive from crisis.status / confidence

  return (
    <GlassPanel
      id="crisis-sidebar"
      className="absolute top-4 right-4 w-96 max-h-[calc(100vh-2rem)] flex flex-col z-20 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 uppercase tracking-wide ${severityColor}`}>
              {crisis.status}
            </span>
            <span className="text-xs text-slate-500">
              {Math.round(crisis.overall_confidence * 100)}% confidence
            </span>
          </div>
          <h2 className="text-sm font-semibold text-white leading-snug truncate">
            {crisis.title}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {crisis.region.replace(/_/g, ' ')} · {crisis.type}
          </p>
        </div>
        <button
          id="sidebar-close-btn"
          onClick={onClose}
          className="ml-2 text-slate-500 hover:text-white transition-colors flex-shrink-0"
          aria-label="Close crisis panel"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab}
            id={`tab-${tab.toLowerCase()}`}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto panel-scroll p-4">
        {activeTab === 'Evidence' && <EvidenceTab crisis={crisis} />}
        {activeTab === 'Mitigation' && (
          <MitigationTab
            crisis={crisis}
            activeRouteIdx={activeRouteIdx}
            onSelectRoute={onSelectRoute}
          />
        )}
        {activeTab === 'Economic' && <EconomicTab crisis={crisis} />}
      </div>

      {/* GraphRAG causal chain */}
      {crisis.causal_chain && crisis.causal_chain.length > 0 && (
        <div className="border-t border-white/10">
          <button
            id="causal-chain-toggle"
            onClick={() => setShowCausalChain((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <span>🔗</span>
              <span>Why this alert? (Causal chain)</span>
            </span>
            <span>{showCausalChain ? '▲' : '▼'}</span>
          </button>
          {showCausalChain && (
            <div className="px-4 pb-3">
              <CausalChainPanel chain={crisis.causal_chain} />
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
```

---

### Task 4.4 — Evidence tab

**File:** `frontend/components/sidebar/EvidenceTab.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import type { CrisisState } from '@/lib/types';

interface EvidenceTabProps {
  crisis: CrisisState;
}

const AGENT_LABELS: Record<string, string> = {
  data_collection: 'Data Collection',
  osint_hazard: 'OSINT & Hazard',
  prediction: 'Prediction',
  route_optimization: 'Route Optimization',
  economic_intelligence: 'Economic Intelligence',
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? 'bg-emerald-400' : value >= 0.6 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

export function EvidenceTab({ crisis }: EvidenceTabProps) {
  const findings = [
    { key: 'data_collection', finding: crisis.data_collection_finding },
    { key: 'osint_hazard', finding: crisis.osint_hazard_finding },
    { key: 'prediction', finding: crisis.prediction_finding },
    { key: 'route_optimization', finding: crisis.route_optimization_finding },
    { key: 'economic_intelligence', finding: crisis.economic_intelligence_finding },
  ].filter((f) => f.finding != null);

  return (
    <div className="space-y-3">
      {/* Executive summary */}
      {crisis.decision_support_output && (
        <div className="bg-cyan-400/5 border border-cyan-400/20 rounded-xl p-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            {crisis.decision_support_output}
          </p>
        </div>
      )}

      {/* Consensus breakdown */}
      {crisis.consensus_breakdown && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Consensus Breakdown
          </p>
          {Object.entries(crisis.consensus_breakdown).map(([key, val]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{key.replace(/_/g, ' ')}</span>
              </div>
              <ConfidenceBar value={val} />
            </div>
          ))}
        </div>
      )}

      {/* Agent findings */}
      {findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Agent Findings
          </p>
          {findings.map(({ key, finding }) => (
            <div key={key} className="bg-slate-800/50 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-300">
                  {AGENT_LABELS[key] ?? key}
                </span>
                <ConfidenceBar value={finding!.confidence} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{finding!.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### Task 4.5 — Mitigation tab

**File:** `frontend/components/sidebar/MitigationTab.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import type { CrisisState, RouteRecommendation } from '@/lib/types';

interface MitigationTabProps {
  crisis: CrisisState;
  activeRouteIdx: number | null;
  onSelectRoute: (idx: number) => void;
}

function RouteCard({
  route,
  idx,
  isActive,
  onSelect,
}: {
  route: RouteRecommendation;
  idx: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  const riskColor = route.risk_score > 0.7 ? 'text-red-400' : route.risk_score > 0.4 ? 'text-yellow-400' : 'text-emerald-400';
  return (
    <button
      id={`route-option-${idx}`}
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isActive
          ? 'border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/30'
          : 'border-white/10 bg-slate-800/40 hover:border-white/20'
      }`}
    >
      <div className="flex justify-between items-start mb-1.5">
        <span className="text-xs font-semibold text-slate-200">
          {idx === 0 ? '★ Recommended' : `Option ${idx + 1}`}
        </span>
        <span className={`text-xs font-medium ${riskColor}`}>
          Risk: {Math.round(route.risk_score * 100)}%
        </span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed mb-2">{route.description}</p>
      <div className="flex gap-3 text-xs text-slate-500">
        <span>📍 {route.distance_km.toFixed(0)} km</span>
        <span>⏱ {route.eta_minutes} min</span>
        <span>⛽ +{route.fuel_increase_pct.toFixed(0)}%</span>
      </div>
    </button>
  );
}

export function MitigationTab({ crisis, activeRouteIdx, onSelectRoute }: MitigationTabProps) {
  if (!crisis.route_recommendations || crisis.route_recommendations.length === 0) {
    return (
      <p className="text-xs text-slate-500 text-center py-6">
        No route alternatives generated yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 leading-relaxed mb-3">
        Select an alternative to highlight it on the map.
      </p>
      {crisis.route_recommendations.map((route, idx) => (
        <RouteCard
          key={idx}
          route={route}
          idx={idx}
          isActive={activeRouteIdx === idx}
          onSelect={() => onSelectRoute(idx)}
        />
      ))}
    </div>
  );
}
```

---

### Task 4.6 — Economic fallout tab + PriceChart

**File:** `frontend/components/charts/PriceChart.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { PricePoint } from '@/lib/types';

interface PriceChartProps {
  data: PricePoint[];
  crisisDate?: string;  // show vertical crisis line
  title?: string;
}

export default function PriceChart({ data, crisisDate, title }: PriceChartProps) {
  const tooltipStyle = { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: 11 };
  const labelStyle = { color: '#94a3b8' };

  return (
    <div>
      {title && <p className="text-xs font-medium text-slate-400 mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            stroke="#475569"
            tick={{ fontSize: 9, fill: '#64748b' }}
            tickLine={false}
          />
          <YAxis stroke="#475569" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
          {crisisDate && (
            <ReferenceLine
              x={crisisDate}
              stroke="#f87171"
              strokeDasharray="4 2"
              label={{ value: 'Crisis', position: 'top', fill: '#f87171', fontSize: 9 }}
            />
          )}
          <Line type="monotone" dataKey="beras" name="Rice" stroke="#38bdf8" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="minyak" name="Cooking Oil" stroke="#fb923c" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="cabai" name="Chili" stroke="#a78bfa" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**File:** `frontend/components/sidebar/EconomicTab.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import dynamic from 'next/dynamic';
import type { CrisisState } from '@/lib/types';

const PriceChart = dynamic(() => import('@/components/charts/PriceChart'), {
  ssr: false,
  loading: () => <div className="h-40 shimmer rounded-xl" />,
});

// Synthetic PIHPS stub data — will be replaced by real Supabase query in Phase 6
const STUB_PRICES = Array.from({ length: 30 }, (_, i) => ({
  date: `D-${30 - i}`,
  beras: 14000 + Math.round(Math.random() * 1000),
  minyak: 17000 + Math.round(Math.random() * 1500),
  cabai: 55000 + Math.round(Math.random() * 20000),
}));

interface EconomicTabProps {
  crisis: CrisisState;
}

export function EconomicTab({ crisis }: EconomicTabProps) {
  const forecast = crisis.inflation_forecast;

  return (
    <div className="space-y-4">
      {forecast && (
        <div className="bg-orange-400/5 border border-orange-400/20 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">
            Inflation Forecast
          </p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{forecast.commodity}</span>
            <span className="text-sm font-bold text-orange-400">
              +{forecast.pct_increase.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Projected over next {forecast.timeframe_hours}h · {forecast.region.replace(/_/g, ' ')}
          </p>
        </div>
      )}

      {/* Historical price chart */}
      <PriceChart
        data={STUB_PRICES}
        crisisDate={`D-0`}
        title="PIHPS Commodity Prices (30d)"
      />

      {/* LTM episodes */}
      {crisis.economic_intelligence_finding?.data?.ltm_episodes && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Historical Analogues
          </p>
          {(crisis.economic_intelligence_finding.data.ltm_episodes as Array<{
            title: string; inflation_multiplier: number; recovery_days: number; similarity_score: number;
          }>).map((ep, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-300">{ep.title}</span>
                <span className="text-xs text-cyan-400">
                  {Math.round(ep.similarity_score * 100)}% similar
                </span>
              </div>
              <p className="text-xs text-slate-500">
                ×{ep.inflation_multiplier.toFixed(1)} inflation · {ep.recovery_days}d recovery
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### Task 4.7 — Causal chain panel

**File:** `frontend/components/sidebar/CausalChainPanel.tsx`
**Action:** CREATE NEW

```tsx
'use client';

interface ChainNode {
  node: string;
  relation: string;
}

interface CausalChainPanelProps {
  chain: ChainNode[];
}

export function CausalChainPanel({ chain }: CausalChainPanelProps) {
  return (
    <div className="space-y-1" role="list" aria-label="Causal chain">
      {chain.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="text-slate-200 font-medium truncate">{item.node}</span>
          {i < chain.length - 1 && (
            <>
              <span className="text-slate-600">→</span>
              <span className="text-slate-500 italic truncate">{item.relation}</span>
              <span className="text-slate-600">→</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Wave 5 — Timeline Scrubber & Simulation UI (parallel, depends on Wave 4)

### Task 5.1 — Timeline scrubber

**File:** `frontend/components/ui/TimelineScrubber.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

export interface TimelineSnapshot {
  timestamp: string;      // ISO 8601
  label: string;          // "T+1h", "T+6h", etc.
  data: Record<string, unknown>;  // snapshot of crisis state at that point
}

interface TimelineScrubberProps {
  snapshots: TimelineSnapshot[];
  onSeek: (snapshot: TimelineSnapshot) => void;
  isLive?: boolean;
}

export function TimelineScrubber({ snapshots, onSeek, isLive = true }: TimelineScrubberProps) {
  const [currentIdx, setCurrentIdx] = useState(snapshots.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const seek = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, snapshots.length - 1));
    setCurrentIdx(clamped);
    onSeek(snapshots[clamped]);
  }, [snapshots, onSeek]);

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setCurrentIdx((prev) => {
        const next = prev + 1;
        if (next >= snapshots.length) {
          setIsPlaying(false);
          return prev;
        }
        onSeek(snapshots[next]);
        return next;
      });
    }, 1500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, snapshots, onSeek]);

  if (snapshots.length === 0) return null;

  return (
    <div
      id="timeline-scrubber"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[560px] z-20"
    >
      <div className="bg-slate-900/70 backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            id="timeline-play-btn"
            onClick={() => setIsPlaying((v) => !v)}
            className="text-cyan-400 hover:text-cyan-300 transition-colors text-lg w-8 flex-shrink-0"
            aria-label={isPlaying ? 'Pause playback' : 'Play timeline'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Slider */}
          <div className="flex-1 relative">
            <input
              id="timeline-slider"
              type="range"
              min={0}
              max={snapshots.length - 1}
              value={currentIdx}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full h-1 appearance-none bg-slate-700 rounded-full cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Current timestamp */}
          <div className="text-right flex-shrink-0">
            <div className="text-xs font-semibold text-cyan-400">
              {snapshots[currentIdx]?.label ?? ''}
            </div>
            {isLive && currentIdx === snapshots.length - 1 && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 5.2 — Simulate Disaster button

**File:** `frontend/components/ui/SimulateButton.tsx`
**Action:** CREATE NEW

```tsx
'use client';

interface SimulateButtonProps {
  isActive: boolean;
  onClick: () => void;
  isLoading?: boolean;
}

export function SimulateButton({ isActive, onClick, isLoading }: SimulateButtonProps) {
  return (
    <button
      id="simulate-disaster-btn"
      onClick={onClick}
      disabled={isLoading}
      className={`
        absolute top-4 left-4 z-20
        flex items-center gap-2 px-4 py-2.5
        rounded-xl text-xs font-semibold uppercase tracking-wider
        border transition-all duration-200
        ${isActive
          ? 'bg-orange-500/20 border-orange-400/60 text-orange-400 ring-1 ring-orange-400/30'
          : 'bg-slate-900/60 backdrop-blur-lg border-white/10 text-slate-300 hover:text-white hover:border-white/20'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {isLoading ? (
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <span>{isActive ? '✏' : '⚡'}</span>
      )}
      {isActive ? 'Draw Zone' : 'Simulate Disaster'}
    </button>
  );
}
```

---

### Task 5.3 — Status header bar

**File:** `frontend/components/ui/StatusHeader.tsx`
**Action:** CREATE NEW

```tsx
'use client';
import { FreshnessBadge } from './FreshnessBadge';

interface StatusHeaderProps {
  incidentCount: number;
  validatedCount: number;
  lastUpdated: Date | null;
}

export function StatusHeader({ incidentCount, validatedCount, lastUpdated }: StatusHeaderProps) {
  return (
    <header
      id="status-header"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
    >
      <div className="bg-slate-900/60 backdrop-blur-lg border border-white/10 rounded-2xl px-5 py-2.5 shadow-xl">
        <div className="flex items-center gap-5">
          {/* Brand */}
          <div>
            <span className="text-sm font-bold tracking-tight text-white">Peta</span>
            <span className="text-sm font-bold tracking-tight text-cyan-400">Nadi</span>
          </div>

          <div className="w-px h-4 bg-white/10" />

          {/* Incident counts */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              <span className="text-white font-semibold">{incidentCount}</span> active
            </span>
            <span className="text-slate-400">
              <span className="text-emerald-400 font-semibold">{validatedCount}</span> validated
            </span>
          </div>

          <div className="w-px h-4 bg-white/10" />

          {/* Data freshness */}
          <FreshnessBadge lastUpdated={lastUpdated} sourceLabel="Live feed" />
        </div>
      </div>
    </header>
  );
}
```

---

## Wave 6 — Dashboard Assembly (depends on Waves 3, 4, 5)

### Task 6.1 — Main `DashboardClient` component

**File:** `frontend/components/dashboard/DashboardClient.tsx`
**Action:** CREATE NEW

This is the top-level client component that wires everything together.

```tsx
'use client';
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useIncidents } from '@/hooks/useIncidents';
import { CrisisSidebar } from '@/components/sidebar/CrisisSidebar';
import { StatusHeader } from '@/components/ui/StatusHeader';
import { SimulateButton } from '@/components/ui/SimulateButton';
import { TimelineScrubber } from '@/components/ui/TimelineScrubber';
import { api } from '@/lib/api';
import type { CrisisState, RouteRecommendation } from '@/lib/types';

// Dynamic import for map (already SSR-disabled at page level, but keep ssr: false here too for safety)
const CrisisMap = dynamic(() => import('@/components/map/CrisisMap'), { ssr: false });

// Stub fire hotspots and maritime vectors (will come from API in Phase 6 polish)
const STUB_FIRE_HOTSPOTS = [
  { coordinates: [98.5, 3.6] as [number, number], confidence: 85 },
  { coordinates: [98.8, 3.9] as [number, number], confidence: 70 },
];
const STUB_MARITIME = [
  { path: [[98.67, 3.79], [98.7, 3.85], [98.72, 3.9]] as [number, number][], vessel_id: 'V001', name: 'Belawan Ferry 1' },
];

export default function DashboardClient() {
  const { incidents, loading, lastUpdated, refetch } = useIncidents();
  const [selectedCrisisId, setSelectedCrisisId] = useState<string | null>(null);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisState | null>(null);
  const [activeRouteIdx, setActiveRouteIdx] = useState<number | null>(null);
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [disasterZones, setDisasterZones] = useState<Array<{ polygon: [number, number][]; type: 'flood'; risk: number }>>([]);

  const handleCrisisClick = useCallback(async (id: string) => {
    setSelectedCrisisId(id);
    setActiveRouteIdx(null);
    try {
      const detail = await api.incidents.get(id);
      setSelectedCrisis(detail);
    } catch (err) {
      console.error('Failed to fetch crisis detail:', err);
    }
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSelectedCrisisId(null);
    setSelectedCrisis(null);
    setActiveRouteIdx(null);
  }, []);

  const handlePolygonDrawn = useCallback(async (polygon: [number, number][]) => {
    setDrawModeActive(false);
    setDisasterZones((prev) => [...prev, { polygon, type: 'flood', risk: 0.8 }]);
    setSimulateLoading(true);
    try {
      const res = await api.incidents.simulate({ type: 'flood', polygon, region: 'north_sumatra' });
      console.log('Simulation queued:', res.scenario_id);
      // Poll for the new crisis pin that appears after the agent swarm runs
      setTimeout(refetch, 5000);
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setSimulateLoading(false);
    }
  }, [refetch]);

  const validatedCount = incidents.filter((i) => i.status === 'validated').length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080d14]">
      {/* Full-screen map */}
      <CrisisMap
        incidents={incidents}
        selectedCrisisId={selectedCrisisId}
        onCrisisClick={handleCrisisClick}
        activeRoutes={selectedCrisis?.route_recommendations ?? []}
        activeRouteIdx={activeRouteIdx}
        fireHotspots={STUB_FIRE_HOTSPOTS}
        maritimeVectors={STUB_MARITIME}
        disasterZones={disasterZones}
        onPolygonDrawn={handlePolygonDrawn}
        drawModeActive={drawModeActive}
      />

      {/* Header */}
      <StatusHeader
        incidentCount={incidents.length}
        validatedCount={validatedCount}
        lastUpdated={lastUpdated}
      />

      {/* Simulate Disaster button */}
      <SimulateButton
        isActive={drawModeActive}
        isLoading={simulateLoading}
        onClick={() => setDrawModeActive((v) => !v)}
      />

      {/* Crisis sidebar */}
      {selectedCrisis && (
        <CrisisSidebar
          crisis={selectedCrisis}
          onClose={handleCloseSidebar}
          onSelectRoute={setActiveRouteIdx}
          activeRouteIdx={activeRouteIdx}
        />
      )}

      {/* Timeline scrubber (stub — snapshots come from Phase 6) */}
      <TimelineScrubber
        snapshots={[
          { timestamp: new Date().toISOString(), label: 'Live', data: {} },
        ]}
        onSeek={() => {}}
        isLive
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#080d14]/80 flex items-center justify-center z-50 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Loading incidents...</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Wave 7 — Backend Stub Hydration (parallel to Wave 6)

The `GET /api/v1/incidents` endpoint currently returns an empty list.
Phase 4 needs real data there to show crisis pins on the map.

### Task 7.1 — Hydrate `GET /api/v1/incidents` from Supabase

**File:** `backend/app/routers/incidents.py`
**Action:** MODIFY — replace stub in `list_incidents`

```python
@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    List incidents from Supabase, sorted newest-first.
    Falls back to empty list if Supabase is unavailable (offline demo safety).
    """
    try:
        from app.db.supabase_client import get_supabase
        sb = get_supabase()
        query = sb.table("incidents").select(
            "id, title, type, severity, status, confidence, created_at, lat, lon"
        ).order("created_at", desc=True).limit(limit)
        
        if status:
            query = query.eq("status", status)
        if severity:
            query = query.eq("severity", severity)
            
        result = query.execute()
        items = result.data or []
        return IncidentListResponse(
            items=[IncidentResponse(**item) for item in items],
            total=len(items),
        )
    except Exception as e:
        logger.warning(f"Supabase unavailable, returning empty incidents list: {e}")
        return IncidentListResponse(items=[], total=0)
```

Update `IncidentResponse` to include `lat` and `lon` (optional fields for the map):

```python
class IncidentResponse(BaseModel):
    id: str
    title: str
    type: str
    severity: str
    status: str
    confidence: float
    lat: Optional[float] = None
    lon: Optional[float] = None
    created_at: datetime
```

**Note:** This requires `app/db/supabase_client.py` to exist (created in Phase 0/1).
Verify: `from app.db.supabase_client import get_supabase` imports without error.

---

### Task 7.2 — Hydrate `GET /api/v1/incidents/{id}` from Supabase

**File:** `backend/app/routers/incidents.py`
**Action:** MODIFY — replace stub in `get_incident`

```python
@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str):
    """Get a single incident with full CrisisState detail."""
    try:
        from app.db.supabase_client import get_supabase
        sb = get_supabase()
        result = sb.table("incidents").select("*").eq("id", incident_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch incident {incident_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

---

### Task 7.3 — Wire `POST /api/v1/incidents/simulate` to agent pipeline

**File:** `backend/app/routers/incidents.py`
**Action:** MODIFY — replace stub in `simulate_incident`

```python
@router.post("/simulate")
async def simulate_incident(body: dict):
    """
    TheoTown: accepts a GeoJSON polygon and triggers Crisis Mode via the agent swarm.
    Injects a synthetic crisis event into Redis Streams and runs the LangGraph pipeline.
    """
    try:
        from app.workers.agent_worker import run_crisis_event
        import uuid
        
        polygon = body.get("polygon", [])
        crisis_type = body.get("type", "flood")
        region = body.get("region", "north_sumatra")
        
        # Derive centroid from polygon for lat/lon
        if polygon:
            lons = [p[0] for p in polygon]
            lats = [p[1] for p in polygon]
            lat = sum(lats) / len(lats)
            lon = sum(lons) / len(lons)
        else:
            lat, lon = 3.79, 98.67  # Belawan default
        
        scenario_id = str(uuid.uuid4())
        event = {
            "type": crisis_type,
            "source": "simulation",
            "severity": "high",
            "lat": lat,
            "lon": lon,
            "region": region,
            "title": f"[Simulated] {crisis_type.replace('_', ' ').title()} — {region.replace('_', ' ').title()}",
            "is_simulated": True,
            "crisis_id": scenario_id,
            "affected_polygon": polygon,
        }
        
        # Fire-and-forget: run swarm asynchronously
        import asyncio
        asyncio.create_task(run_crisis_event(event))
        
        return {"scenario_id": scenario_id, "message": "Simulation pipeline triggered"}
    except Exception as e:
        logger.error(f"Simulation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

**Verification:** `curl -X POST http://localhost:8000/api/v1/incidents/simulate -H 'Content-Type: application/json' -d '{"type":"flood","polygon":[[98.6,3.7],[98.7,3.7],[98.7,3.8],[98.6,3.8]]}'` returns a `scenario_id` without error.

---

## Wave 8 — Real-Time WebSocket Integration (depends on Wave 6 + 7)

### Task 8.1 — Connect WebSocket to live map updates

**File:** `frontend/components/dashboard/DashboardClient.tsx`
**Action:** MODIFY — add `useCrisisSocket` hook after `selectedCrisisId` is set

Add to `DashboardClient`:

```tsx
import { useCrisisSocket } from '@/hooks/useCrisisSocket';
import type { WsEvent } from '@/lib/types';

// Add inside DashboardClient component:
const handleWsMessage = useCallback((event: WsEvent) => {
  if (event.event === 'node_update' && selectedCrisis) {
    setSelectedCrisis((prev) => prev ? { ...prev, ...event.data } : prev);
  }
  if (event.event === 'complete') {
    // Refresh incident list to pick up newly validated alert
    refetch();
  }
}, [selectedCrisis, refetch]);

const { send: sendWs } = useCrisisSocket(selectedCrisisId, handleWsMessage);

// After fetching crisis detail via REST, also send the event payload to the WS endpoint:
// (The WS endpoint requires the event payload as the first message before it streams)
useEffect(() => {
  if (selectedCrisis && selectedCrisisId) {
    sendWs({
      type: selectedCrisis.type,
      source: 'dashboard_subscribe',
      severity: 'high',
      crisis_id: selectedCrisisId,
    });
  }
}, [selectedCrisis, selectedCrisisId, sendWs]);
```

**Verification:**
- Open crisis pin → sidebar opens with static data
- Check DevTools Network → WS → messages stream in for agent progress
- Sidebar confidence scores update in real-time as agents run

---

## Verification Checklist

### Map & Layers
- [ ] `localhost:3000` loads map centered on Belawan (3.79°N, 98.67°E) within 3 seconds
- [ ] `npm run build` completes without errors (no ESM/SSR issues)
- [ ] Fire heatmap renders (orange-red glow) over North Sumatra coordinates
- [ ] Maritime path layer shows dashed cyan vectors
- [ ] Crisis pin ScatterplotLayer renders on map (use `run_demo.py` to inject a test event first)
- [ ] Clicking a crisis pin opens the tri-panel sidebar

### Sidebar
- [ ] Evidence tab shows agent findings and confidence bars
- [ ] Mitigation tab lists route alternatives; clicking one highlights a PathLayer on map
- [ ] Economic tab renders the PriceChart without hydration errors in browser Console
- [ ] GraphRAG causal chain expands/collapses correctly
- [ ] Sidebar close button works

### Real-Time
- [ ] WebSocket connects after crisis pin click (verify in DevTools → Network → WS)
- [ ] Agent progress messages update sidebar confidence scores live
- [ ] After `complete` event, incident list refetches and new validated pins appear

### Simulation
- [ ] "Simulate Disaster" button activates draw mode (cursor changes to crosshair)
- [ ] Drawing a polygon and closing it sends `POST /api/v1/incidents/simulate`
- [ ] Drawn zone appears as an orange PolygonLayer on the map
- [ ] New crisis pin appears within ~30 seconds (after agent swarm runs)

### Design Audit
- [ ] Glassmorphism panels use `backdrop-blur-lg` and `bg-slate-900/60`
- [ ] No `backdrop-filter` applied to the map canvas itself
- [ ] Status header shows incident count + freshness badge
- [ ] Run `/gsd-ui-review` after implementation for 6-pillar design audit

---

## File Structure After Phase 4

```
frontend/
  app/
    layout.tsx          ← updated metadata, dark bg
    page.tsx            ← server component → dynamic DashboardClient
    globals.css         ← dark theme, Inter font, custom scrollbar, animations
  components/
    dashboard/
      DashboardClient.tsx   ← top-level client wiring
    map/
      CrisisMap.tsx         ← MapboxOverlay + MapboxDraw
    sidebar/
      CrisisSidebar.tsx     ← tri-panel + causal chain
      EvidenceTab.tsx
      MitigationTab.tsx
      EconomicTab.tsx
      CausalChainPanel.tsx
    charts/
      PriceChart.tsx        ← Recharts (dynamic)
    ui/
      GlassPanel.tsx        ← glassmorphism wrapper
      FreshnessBadge.tsx    ← health indicator + age
      TimelineScrubber.tsx  ← playback slider
      SimulateButton.tsx    ← draw mode toggle
      StatusHeader.tsx      ← top header bar
  hooks/
    useCrisisSocket.ts      ← WebSocket hook with exponential backoff
    useIncidents.ts         ← polling hook
  lib/
    types.ts                ← TypeScript types (mirrors agents/state.py)
    api.ts                  ← REST API client
    layers.ts               ← Deck.gl layer factory functions
    utils.ts                ← cn() helper
  next.config.mjs           ← transpilePackages for deck.gl ESM

backend/app/routers/
  incidents.py              ← hydrated with Supabase queries
```

---

## Dependency Installation Summary

Run once in `frontend/`:
```bash
npm install @deck.gl/aggregation-layers recharts @mapbox/mapbox-gl-draw clsx
npm install --save-dev @types/mapbox__mapbox-gl-draw
npm uninstall @types/mapbox-gl
```
