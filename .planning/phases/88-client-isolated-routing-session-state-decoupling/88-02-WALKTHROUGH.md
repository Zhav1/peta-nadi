# Phase 88 Walkthrough: Client-Isolated Routing Session vs. Global Read-Only Environmental State

## Overview
Phase 88 resolves multi-user state collisions by architecturally decoupling ambient global environmental state (BMKG radar alerts, incident telemetry, news feeds, fleet tracking) from session-local routing state (selected endpoints, active route index, custom detours). Routing selections now live in local React memory and are synchronized bidirectionally with URL query parameters (`origin`, `dest`, `modality`, `route`, `crisis`) via in-place `window.history.replaceState`. Ambient WebSocket telemetry updates (`node_update`) are guarded and stripped of foreign routing payloads, preventing broadcast events from overwriting active user corridors.

---

## Changes Implemented

### 1. Two-Layer State Architecture
- **Layer 1 (Global Environmental State - Read-Only Broadcast):**
  * Incidents (`incidents`), spatial weather polygons, combined disaster zones (`disasterZones`), news feed (`newsFeed`), and fleet telemetry (`activeFleetVehicles`).
  * Ingests ambient broadcasts without mutating active client routing choices.
- **Layer 2 (Session-Local State - Scoped to Active Browser Session):**
  * `selectedOriginNode`, `selectedDestNode`, `selectedModality`, `activeRouteIdx`, `currentMapRoutes`, `selectedRadius`.
  * Managed locally and mirrored synchronously in the browser URL query string.

### 2. Bidirectional URL Synchronization & Next.js App Router Hydration
- **`<Suspense>` Boundary (`frontend/app/dashboard/page.tsx`):**
  * Wrapped `<DashboardClient />` inside `<Suspense fallback={...}>` to comply with Next.js 14 App Router standards for client-side search parameter hydration.
- **In-Place URL Mirroring (`frontend/components/dashboard/DashboardClient.tsx`):**
  * Implemented `updateUrlParams(updates: Record<string, string | null>)` utilizing `window.history.replaceState`.
  * Mutates query parameters without triggering full page reloads, remounts, or map canvas flicker.
  * Mirrored across:
    - Origin / Destination selection (`handleNodeSelected`, `handleCustomPointSelected`).
    - Modality toggles (`handleModalityChange`).
    - Alternative route activations (`handleSelectRoute`).
    - Crisis inspection (`handleCrisisClick`, `handleSelectVehicle`).
    - Clean-slate resets (`handleResetNodes`, `handleResetDemo`).
- **Deep-Link Route Hydration:**
  * When opening `/dashboard?origin=belawan&dest=tebingtinggi&modality=truck&route=0`, `DashboardClient` automatically hydrates endpoints and computes baseline routes, activating the requested alternative.

### 3. Ambient WebSocket Route Isolation Guard
- **`handleWsMessage` Sanitization (`DashboardClient.tsx`):**
  ```typescript
  if (event.event === 'node_update') {
    const rawData = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, any>;
    const { route_recommendations, routes, ...ambientData } = rawData;
    setSelectedCrisis((prev) => prev ? { ...prev, ...ambientData } : prev);
  }
  ```
  Foreign or server-injected `route_recommendations` are stripped from broadcast ambient events, guaranteeing that another user's action or server worker broadcast never overwrites an operator's active routing polyline.

---

## Verification & Proof of Work

### 1. TypeScript Strict Typecheck
```powershell
npx tsc --noEmit
# Exit code: 0 (0 errors)
```

### 2. Standalone Verification Suite
```powershell
node --no-warnings --experimental-strip-types scripts/test_state_isolation.ts
```
**Results:**
- Test 1: URL Query Parameter Parsing & Defaults (PASS)
- Test 2: In-place URL Serialization & Parameter Mutability (PASS)
- Test 3: WebSocket Ambient Payload Sanitization Guard (PASS)
- Test 4: Multi-Client Session Isolation (PASS)
- **Status:** 4/4 assertions passed.

### 3. Playwright Multi-Client Concurrency E2E Test
```powershell
npx playwright test e2e/multi-client-routing-isolation.spec.ts e2e/mapbox-turn-by-turn.spec.ts
```
**Results:**
- Context A navigated to `origin=belawan&dest=tebingtinggi&route=0` $\rightarrow$ Corridor pill verified: `Belawan -> Tebing Tinggi`.
- Context B navigated to `origin=pekanbaru&dest=dumai_port&route=1` $\rightarrow$ Corridor pill verified: `Pekanbaru -> Dumai Port`.
- Context A mutated route to `route=2` $\rightarrow$ Context B remained completely intact (`route=1`, `Pekanbaru -> Dumai Port`).
- **Status:** 4/4 tests passed (8.4s total runtime).
