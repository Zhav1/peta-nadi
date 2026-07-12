# Walkthrough — Phase 4: 3D Map Dashboard

Phase 4 of the LRIP / PetaNadi project has been fully implemented.

## Changes Made

### Frontend Core & Infrastructure
- [next.config.mjs](file:///d:/College/Pidi.id/frontend/next.config.mjs): Added transpilation package list (`deck.gl`, `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/aggregation-layers`, `@deck.gl/mapbox`, `@luma.gl/core`) and disabled `worker_threads` for non-server environments.
- [package.json](file:///d:/College/Pidi.id/frontend/package.json): Installed `@deck.gl/aggregation-layers`, `recharts`, `@mapbox/mapbox-gl-draw`, and `clsx`. Uninstall conflicting `@types/mapbox-gl` to favor built-in types.
- [.env.local](file:///d:/College/Pidi.id/frontend/.env.local) & [.env.example](file:///d:/College/Pidi.id/frontend/.env.example): Configured API endpoints, Mapbox public token, and WebSocket endpoint (`NEXT_PUBLIC_WS_URL`).
- [app/globals.css](file:///d:/College/Pidi.id/frontend/app/globals.css) & [app/layout.tsx](file:///d:/College/Pidi.id/frontend/app/layout.tsx): Set up dark-theme styling, Inter font configuration, and page metadata.

### API & WebSocket Layers
- [lib/types.ts](file:///d:/College/Pidi.id/frontend/lib/types.ts): Typed interface definitions mapping backend `CrisisState` models.
- [lib/api.ts](file:///d:/College/Pidi.id/frontend/lib/api.ts): Defined REST client for fetching incidents and simulating disasters.
- [hooks/useCrisisSocket.ts](file:///d:/College/Pidi.id/frontend/hooks/useCrisisSocket.ts): Developed custom WebSocket hook with exponential backoff reconnect.
- [hooks/useIncidents.ts](file:///d:/College/Pidi.id/frontend/hooks/useIncidents.ts): Developed passive polling hook.

### Map & Overlays
- [lib/layers.ts](file:///d:/College/Pidi.id/frontend/lib/layers.ts): Wrote Deck.gl layer factory functions for custom visualization (Heatmaps, Maritime vectors, alternative route paths, zones, and pins).
- [components/map/CrisisMap.tsx](file:///d:/College/Pidi.id/frontend/components/map/CrisisMap.tsx): Created client-side wrapper embedding Mapbox GL JS v3, Deck.gl `MapboxOverlay`, and MapboxDraw polygon capture tools.
- [app/page.tsx](file:///d:/College/Pidi.id/frontend/app/page.tsx): Loaded main client dashboard dynamically to prevent SSR failures.

### Sidebar & Controls Panels
- [components/ui/GlassPanel.tsx](file:///d:/College/Pidi.id/frontend/components/ui/GlassPanel.tsx): Framed cards using frosted blur effects.
- [components/ui/FreshnessBadge.tsx](file:///d:/College/Pidi.id/frontend/components/ui/FreshnessBadge.tsx): Implemented color-coded indicator and label formatting.
- [components/sidebar/CrisisSidebar.tsx](file:///d:/College/Pidi.id/frontend/components/sidebar/CrisisSidebar.tsx) (and tabs): Built the tri-panel sections (Evidence findings, Mitigation routes, Economic forecasting charts via Recharts [PriceChart.tsx](file:///d:/College/Pidi.id/frontend/components/charts/PriceChart.tsx)).
- [components/ui/TimelineScrubber.tsx](file:///d:/College/Pidi.id/frontend/components/ui/TimelineScrubber.tsx): Wrote playback sliders.
- [components/ui/SimulateButton.tsx](file:///d:/College/Pidi.id/frontend/components/ui/SimulateButton.tsx) & [components/ui/StatusHeader.tsx](file:///d:/College/Pidi.id/frontend/components/ui/StatusHeader.tsx): Wired header metrics and simulate draw selectors.
- [components/dashboard/DashboardClient.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx): Orchestrated the full page layout, map states, selection handlers, and WebSocket subscriptions.

### Backend Integrations
- [backend/app/routers/incidents.py](file:///d:/College/Pidi.id/backend/app/routers/incidents.py): Replaced stubs with actual Supabase database queries and asynchronously triggered simulated crisis pipeline executions.

## Verification & Testing
- The frontend Next.js server resolves all dependencies cleanly.
- The next build script is compiling all pages, TypeScript declarations, and components without WebGL or SSR execution errors.
