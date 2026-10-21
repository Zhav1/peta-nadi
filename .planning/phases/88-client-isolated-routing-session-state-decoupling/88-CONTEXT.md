<!-- generated-by: gsd-plan-phase -->
# Phase 88: Client-Isolated Routing Session vs. Global Read-Only Environmental State — Context

**Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine  
**Phase:** 86  
**Status:** PLANNING 📋  
**Domain:** Frontend State Architecture, Multi-Client Concurrency, URL Query Parameter Binding, WebSocket Broadcast Isolation, Playwright Multi-Context Testing

---

## 1. Problem Statement

In the existing PreHub frontend and backend architecture (`frontend/components/dashboard/DashboardClient.tsx`, `frontend/hooks/useCrisisSocket.ts`, and `backend/app/main.py`):
1. **Volatile Routing State in Memory Only:**
   Selected origin (`selectedOriginNode`), destination (`selectedDestNode`), transport modality (`selectedModality`), and active route index (`activeRouteIdx`) exist only in transient React component state. They are not bound to browser URL query parameters. As a result:
   - Refreshing the browser or sharing a corridor link resets the state to clean slate.
   - Dispatchers cannot bookmark or deep-link to an active corridor evaluation (e.g. `/dashboard?origin=belawan&dest=tebingtinggi&modality=truck&route=0`).
2. **Multi-User State Contamination Risk:**
   Ambient WebSocket updates (`/ws/crisis/{id}`) handle `node_update` events by merging raw event payloads (`setSelectedCrisis(prev => ({ ...prev, ...event.data }))`). If an ambient broadcast carries `route_recommendations` from another tenant or automated background simulation, User A's active routing session in Medan can be overwritten by User B's route calculations in Aceh.
3. **Lack of Strict Two-Layer State Architecture:**
   The UI previously did not clearly demarcate between:
   - **Layer 1: Global Shared State (Read-Only Broadcast)** — Environmental ground truth (disaster zones, BMKG alerts, news citations, fleet telemetry, traffic congestion).
   - **Layer 2: Session-Local State (Client-Isolated)** — Dispatcher decision workbench (selected endpoints, custom detours, active modal indices, local sandbox simulations).
4. **Missing Multi-Context Concurrency Test:**
   There is no automated end-to-end test verifying that two simultaneous browser sessions (User A on Medan $\rightarrow$ Belawan vs. User B on Pekanbaru $\rightarrow$ Dumai) run completely isolated from each other without cross-session polyline collisions or state overwrites.

---

## 2. Target Architectural Invariants

1. **Strict Two-Layer State Architecture:**
   - **Global State (Layer 1):** Incidents, BMKG polygons, weather alerts, macro fleet coordinates, and news feed are read-only and broadcast-safe.
   - **Session State (Layer 2):** Origin node, destination node, modality, active route index, and route recommendations are scoped strictly to the current browser tab.
2. **Bidirectional URL Query Parameter Synchronization:**
   - URL schema: `/dashboard?origin=<originId>&dest=<destId>&modality=<modality>&route=<routeIdx>&crisis=<crisisId>`
   - On mount: Initialize React state from `useSearchParams()`.
   - On change: Synchronize URL query parameters in real time via `window.history.replaceState` without triggering page reload, preserving state across refreshes and deep links.
   - On reset: Strip routing params from URL when clean slate is triggered.
3. **WebSocket Route Isolation Guard:**
   - In `handleWsMessage`, filter incoming `node_update` payloads: NEVER allow ambient WebSocket messages to overwrite `route_recommendations` or `currentMapRoutes` unless explicitly tied to the client's own session request.
4. **Deterministic Multi-Session Concurrency:**
   - Playwright multi-context test (`browser.newContext()`): User A (Belawan $\rightarrow$ Tebing Tinggi) and User B (Pekanbaru $\rightarrow$ Dumai) operate simultaneously in separate isolated browser contexts. Actions in User A's tab must leave User B's corridor, nodes, and map polylines 100% unaltered.

---

## 3. Scope Lock

### Files Permitted to Modify
* `frontend/components/dashboard/DashboardClient.tsx` (URL parameter sync, state layer separation, WebSocket isolation guard)
* `frontend/app/dashboard/page.tsx` (ensure `<Suspense>` boundary wraps `DashboardClient` for `useSearchParams`)
* `frontend/e2e/multi-client-routing-isolation.spec.ts` (new multi-context Playwright concurrency test)
* `frontend/scripts/test_state_isolation.ts` (standalone headless Node runner verifying URL parameter serialization and WebSocket filter guards)

### Files Strictly Locked (DO NOT TOUCH)
* `backend/app/adapters/cpu_routing_adapter.py` (CPU routing solver invariant)
* `backend/app/services/weather_fusion_service.py` (BMKG fusion invariant)
* `agents/tools/consensus_gate.py` (consensus gate hardened in Phase 84)
* `frontend/components/dashboard/EvaluationSection.tsx` (empirical N=60 benchmark integrity)
* `frontend/lib/aiDynamicRouter.ts` (routing engine hardened in Phase 85)
