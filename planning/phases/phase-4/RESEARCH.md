# RESEARCH — Phase 4: 3D Map Dashboard

**Phase:** 4
**Researched:** 2026-07-09
**Source:** Subagent web research + codebase audit

---

## 1. Mapbox GL JS v3 + Deck.gl v9 Integration (Next.js 14 App Router)

### Integration Pattern
`MapboxOverlay` from `@deck.gl/mapbox` is the **only supported** path in deck.gl v9.
`MapboxLayer` is **deprecated** — do not use it.
`MapboxOverlay` is registered as a Mapbox `IControl` via `map.addControl(overlay)`.

### Critical: SSR Must Be Disabled
Both `mapbox-gl` and all deck.gl packages reference `window` / `WebGLRenderingContext` at import time.
Pattern: Server Component page → `dynamic(() => import('./CrisisMap'), { ssr: false })`.

### `next.config.mjs` Must Transpile ESM Packages
```js
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
      config.resolve.fallback = { ...config.resolve.fallback, worker_threads: false };
    }
    return config;
  },
};
export default nextConfig;
```

### Reactive Layer Updates (Real-Time)
Store `MapboxOverlay` in a `useRef`. When WebSocket data arrives, call:
```ts
overlayRef.current.setProps({ layers: [...newLayers] })
```
Do NOT destroy and recreate the overlay. Deck.gl diffs by layer `id` and only re-renders changed layers.

### Mapbox GL JS v2 → v3 Breaking Changes
| Change | Action Required |
|--------|----------------|
| WebGL 2 required | Hard requirement — no workaround |
| `optimizeForTerrain` removed | Delete from Map options |
| Built-in TypeScript types (v3.5+) | **Remove `@types/mapbox-gl`** — it now conflicts |
| `MapboxLayer` deprecated (deck.gl v9) | Switch to `MapboxOverlay` |
| Slots API (Standard style) | Add `slot: 'top'` prop on deck.gl layers |

### `interleaved: true` Mode
With `interleaved: true`, deck.gl layers render between Mapbox layers (not on top of everything).
Deck.gl layers support a `slot` prop (`'bottom'`, `'middle'`, `'top'`) to control z-ordering within
the Mapbox Standard style layer stack.

---

## 2. WebSocket in Next.js 14 App Router

### Rules
- WebSocket is browser-only → must be in `'use client'` component
- Use `useRef` to hold socket (avoids triggering re-renders)
- `useEffect` with `[]` deps for lifecycle; always return cleanup
- React StrictMode fires `useEffect` twice in dev — cleanup prevents ghost connections

### Exponential Backoff Reconnect Pattern
```ts
const connect = useCallback(() => {
  const ws = new WebSocket(`ws://localhost:8000/ws/crisis/${crisisId}`);
  ws.onopen = () => { retryDelay.current = 1000; };
  ws.onclose = () => {
    setTimeout(() => {
      retryDelay.current = Math.min(retryDelay.current * 2, 30000);
      connect();
    }, retryDelay.current);
  };
  ws.onerror = () => ws.close(); // triggers onclose → reconnect
}, [crisisId]);
```

### Architecture Decision
For the crisis panel WebSocket: the socket is opened when a user clicks a crisis pin (per-crisis).
A global WebSocket for live incident list updates (new pins appearing) uses a separate broadcast channel.
Both patterns should use the same `useCrisisSocket` hook.

---

## 3. Deck.gl v9.3 Layer API

### Import Paths (Important Gotcha)
| Layer | Package |
|-------|---------|
| `HeatmapLayer` | **`@deck.gl/aggregation-layers`** (NOT `@deck.gl/layers`) |
| `PathLayer` | `@deck.gl/layers` |
| `ScatterplotLayer` | `@deck.gl/layers` |
| `PolygonLayer` | `@deck.gl/layers` |

`@deck.gl/aggregation-layers` is NOT currently in `package.json` — it must be added.

### Key Constructor Arguments
**HeatmapLayer** (NASA fire hotspots):
- `getPosition: (d) => d.coordinates` — `[lng, lat]`
- `getWeight: (d) => d.confidence / 100`
- `radiusPixels: 40`, `intensity: 1`, `threshold: 0.03`

**PathLayer** (alternative routes, maritime vectors):
- `getPath: (d) => d.path` — `[[lng,lat], [lng,lat], ...]`
- `getColor`, `getWidth`, `capRounded: true`, `jointRounded: true`

**ScatterplotLayer** (crisis pins):
- `getPosition: (d) => d.position`
- `getRadius: (d) => d.severity === 'high' ? 1500 : 800` (meters)
- `radiusMinPixels: 6`, `radiusMaxPixels: 30`
- `stroked: true`, `getLineColor`

**PolygonLayer** (drawn disaster zones):
- `getPolygon: (d) => d.polygon` — ring of `[lng,lat]` pairs
- `getFillColor`, `extruded: false`, `filled: true`, `stroked: true`

---

## 4. Mapbox GL Draw (Polygon Draw Tool)

### Compatibility: `@mapbox/mapbox-gl-draw` v1.5.x + mapbox-gl v3 ✅
Community complaints about "v3 incompatibility" refer to **MapLibre GL JS v3**, not Mapbox GL JS v3.
`@mapbox/mapbox-gl-draw` works without issue.

### Integration Rules
1. Import CSS explicitly: `import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'`
2. Add draw control **inside** `map.on('load', ...)` — never before load
3. Listen to `draw.create`, `draw.update`, `draw.delete` events on the map instance
4. Add TypeScript support via `@types/mapbox__mapbox-gl-draw`

### Interaction Conflict with Deck.gl
In `interleaved: true` mode, pointer events can conflict. If draw stops responding,
switch to `interleaved: false` or use a `drawMode` state to temporarily disable deck.gl
event capture while drawing is active.

---

## 5. Chart Library Decision: Recharts ✅

**Recharts** over Chart.js for this project:
- Composable JSX API (custom tooltips with crisis data are trivial)
- Works well at PIHPS data volumes (daily/weekly intervals, ~365 points)
- Native shadcn/ui compatibility if UI primitives are added later
- Must be loaded with `dynamic(() => import(...), { ssr: false })` to avoid hydration errors

---

## 6. Glassmorphism Dark UI — Tailwind v3 Recipe

```
bg-slate-900/60 backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl shadow-black/60 ring-1 ring-white/5
```

| Effect | Class |
|--------|-------|
| Semi-transparent dark bg | `bg-slate-900/60` |
| Frosted glass blur | `backdrop-blur-lg` |
| Subtle border | `border border-white/10` |
| Deep shadow | `shadow-2xl shadow-black/60` |
| Inner glow | `ring-1 ring-white/5` |
| Accent glow | `ring-1 ring-cyan-400/20` |

**Performance**: Apply backdrop-blur only to side panels and tooltips — never to the map canvas itself.
`backdrop-blur` is GPU-intensive; limit to 2–3 elements on screen at once.

---

## 7. Mapbox Token in Next.js 14

- Use `NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...` in `.env.local`
- `pk.` (public) tokens are intentionally visible in client bundles — by design
- Harden by adding **URL restrictions** in Mapbox Dashboard (allowed URLs only)
- Restrict token scopes to `styles:read` + `tiles:read` only
- Never use `sk.` (secret) tokens with `NEXT_PUBLIC_` prefix

---

## Packages Requiring Action

| Package | Action | Reason |
|---------|--------|--------|
| `@deck.gl/aggregation-layers` | **ADD** | HeatmapLayer lives here |
| `recharts` | **ADD** | PIHPS price charts |
| `@mapbox/mapbox-gl-draw` | **ADD** | Polygon draw tool |
| `@types/mapbox__mapbox-gl-draw` | **ADD** | TypeScript types for draw |
| `@types/mapbox-gl` | **REMOVE** | Conflicts with mapbox-gl v3 built-in types |

---

## Existing Frontend State

```
frontend/
  app/
    page.tsx          ← default Next.js scaffold (to be completely replaced)
    layout.tsx        ← minimal layout (update metadata + font)
    globals.css       ← minimal (update to dark theme)
  package.json        ← has mapbox-gl v3.25, deck.gl v9.3, Next.js 14.2
  next.config.mjs     ← minimal (update with transpilePackages)
  tailwind.config.ts  ← standard config (ready to use)
```

## Backend Contracts Phase 4 Consumes

| Endpoint | Status | Action in Phase 4 |
|----------|--------|-------------------|
| `GET /api/v1/incidents` | Stub (returns []) | Hydrate from Supabase |
| `GET /api/v1/incidents/{id}` | Stub (404) | Hydrate from Supabase |
| `POST /api/crisis/process` | **Live** | Consume directly |
| `WS /ws/crisis/{id}` | **Live** | Connect from CrisisMap |
| `POST /api/v1/incidents/simulate` | Stub | Wire to Redis + agent pipeline |

### `CrisisState` Fields Used by UI
- `lat`, `lon` → ScatterplotLayer crisis pin position
- `route_recommendations[].waypoints` → PathLayer alternative route
- `causal_chain` → GraphRAG collapsible panel
- `inflation_forecast` → Economic tab chart annotations
- `hazard_polygons` → PolygonLayer flood/fire zones
- `consensus_breakdown` → confidence breakdown display
- `decision_support_output` → Evidence tab summary text
- `status`, `overall_confidence`, `validated` → crisis pin color + badge
