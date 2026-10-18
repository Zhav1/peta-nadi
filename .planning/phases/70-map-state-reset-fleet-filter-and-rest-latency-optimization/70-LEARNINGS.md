# Phase 70: Operational Learnings & Architecture Patterns

## Key Technical Learnings

### 1. Synchronization Gap Between React State & Mapbox GL Sources
- **The Issue**: Mapbox GL JS maintains its own internal GeoJSON source cache (`map.getSource(id).setData(...)`). Simply updating React parent state without an explicit effect synchronizing the WebGL canvas source creates ghost visuals where polylines and markers persist despite empty parent state.
- **The Fix**: Always provide a dedicated synchronization `useEffect` inside the map component that watches the canonical selection IDs (e.g. `selectedOriginNode`, `selectedDestNode`). When nullified, immediately set data to empty `FeatureCollection` across all dependent sources (`custom-pinned-source`, `route-paths-source`, `route-eta-badges-source`, `congestion-segments-source`).

### 2. Guarding In-Flight Async Route Solvers
- **The Issue**: When users rapidly click "Reset" or re-pick points, previously dispatched async route calculations (e.g. OSRM, OR-Tools, or custom Dijkstra/2-opt) can resolve *after* the reset, re-populating `currentMapRoutes` and overwriting the user's intent.
- **The Fix**: Implement a monotonically increasing request ID ref (`routeCalculationReqIdRef.current++`). Whenever a reset occurs, increment the ref. When any async routing promise completes, verify that its captured ID still matches `routeCalculationReqIdRef.current`. If not, discard the result.

### 3. Honest Telemetry Classification & Viewport Awareness
- **The Issue**: A toggle filter that filters items outside the current camera viewport appears broken to the end user. If 4 estimated units are in distant provinces and none are in the active viewport (Medan-Belawan), toggling the button produces zero visible change on the screen.
- **The Fix**: Ensure primary demo corridors have representative samples of both live and estimated units. Provide clear visual cues for estimated units (e.g., amber dashed trajectory path lines via Deck.gl `PathLayer` and distinct tactical rings) so the user can immediately observe the difference between live transponder tracking and dead-reckoning/scheduled projections.

### 4. Fast-Path Caching for Telemetry Endpoints
- **The Issue**: Aggregating multiple third-party APIs (BMKG, TomTom, Supabase) sequentially causes latency to compound. Even worse, setting data to Redis without reading from it on subsequent requests leads to wasteful repeated roundtrips.
- **The Fix**:
  1. Multi-tier caching: Process in-memory cache (<1ms) -> Redis distributed cache (<10ms) -> Upstream fetch.
  2. Parallel fetch with `asyncio.gather(..., return_exceptions=True)`.
  3. Decouple audit/metrics logging into non-blocking background tasks (`asyncio.create_task`).
  4. Use HTTP `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` on proxy layers to leverage Edge CDN caching.
