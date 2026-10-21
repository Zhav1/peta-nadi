# Phase 88 Learnings: Client-Isolated Routing Session vs. Global Read-Only Environmental State

## Key Architectural Insights

### 1. In-Place History Replacement vs. Router Navigation
- **Finding:** In Next.js App Router, using `router.replace(url)` or `router.push(url)` inside interactive geospatial dashboards can trigger React tree reconciliations, transient layout shifts, or canvas context re-initializations that disrupt smooth map panning.
- **Solution:** Using `window.history.replaceState(null, '', url.pathname + url.search)` mutates the browser address bar synchronously without causing any Next.js component remounts or visual canvas flicker. This keeps deep-linking instant, lightweight, and flicker-free.

### 2. Next.js 14 App Router Suspense Requirement
- **Finding:** Any component calling `useSearchParams()` inside Next.js App Router must be wrapped in a `<Suspense>` boundary. Without this boundary, client hydration warnings or build-time de-optimizations occur.
- **Solution:** Wrapping `<DashboardClient />` with a themed fallback spinner in `app/dashboard/page.tsx` satisfies App Router invariants while maintaining snappy cold loads.

### 3. Ambient Broadcast Sanitization Pattern
- **Finding:** Real-time WebSockets frequently send ambient `node_update` payloads containing aggregated backend state. If the backend attaches default or foreign `route_recommendations` to an incident, clients consuming the event blindly can have their local route alternatives overwritten.
- **Solution:** Destructuring and stripping `route_recommendations` and `routes` at the WebSocket consumer boundary (`handleWsMessage`) protects local state without modifying backend schemas or breaking other consumers.

### 4. Git Ignore Layering for Test Scripts
- **Finding:** In `.gitignore`, ignoring an entire directory with `frontend/scripts/` prevents negated rules (`!frontend/scripts/test_*.ts`) from working because git does not traverse into ignored directories.
- **Solution:** Specifying `frontend/scripts/*` followed by `!frontend/scripts/test_*.ts` allows test files to be tracked in version control while keeping HKI and internal manual build scripts safely excluded.
