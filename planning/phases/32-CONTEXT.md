# Phase 32 — Context: Real Data & Functional Reality Upgrade

**Created:** 2026-08-16  
**Status:** CONTEXT LOCKED — ready for planning  

---

## Phase Goal

Replace placeholder/hardcoded data and absent UI functionality with real, always-on data feeds
and persistent agent status indicators, so the PreHub dashboard feels alive from the moment a
user lands — not only after a demo sequence runs.

---

## User Intent (verbatim context)

> "there are a lot of placeholders here, and idk whether this could potentially show the actual
> mockup itself. what abt the news agent? and there are no really indicators on the web whether
> the all of the agents works or not... too many buzzwords, icons etc that has no really
> functionalities, and no traffic data or ship or the truck itself on the map."

---

## Decisions Locked

### D1 — News Agent: Build a working Google News RSS news feed
- **Decision:** Implement `news_router.py` (currently 0 bytes) as a real FastAPI router that
  fetches Google News RSS for food disruption keywords (`banjir pangan Sumut`, `logistik
  terganggu`, `harga cabai beras naik`, etc.), parses item titles/descriptions, and runs a
  lightweight LLM call via LLMGateway to assign a relevance score and verification status.
- **UI:** Show news in the existing `EvidenceTab` "Sensory Evidence Chain" section and/or in a
  dedicated "News Intelligence" card on the dashboard sidebar — always populated, not only during
  demo runs.
- **Fallback:** Keep `MOCK_NEWS_FALLBACK` if RSS fails, but mark it clearly as `[OFFLINE DEMO]`.

### D2 — Agent Status Widget: Persistent always-visible agent health indicator
- **Decision:** Add a compact `AgentStatusWidget` to the top-nav area (or bottom of the left
  sidebar) showing each of the 6 agents (DataCollection, OSINTHazard, Prediction, RouteOpt,
  EconomicIntelligence, DecisionSupport) with:
  - Status: idle (grey) / last-run (green dot + relative timestamp) / running (pulsing cyan)
  - Last confidence score
- **Backend:** Add `GET /api/v1/agents/status` endpoint that returns per-agent last-run metadata
  from an in-memory store (updated after each swarm run).
- **Auto-trigger:** On backend startup, run a single lightweight agent swarm pass with the default
  Belawan corridor context so the widget shows real data (not all-idle) on first load.

### D3 — Always-alive Map: Traffic, fleet, and weather layers active on load
- **Decision:** The three key layers — fleet vehicles, TomTom traffic coloring, BMKG weather
  polygon — should be active by default without requiring a demo sequence.
  - Fleet: `useFleetVehicles` is already called in DashboardClient. The hook has an offline
    fallback. Ensure the `FleetVehicleLayer` renders regardless of demo stage.
  - TomTom traffic: Port the traffic segment coloring out of `useDemoState` stage-gating and
    render it by default using the `corridorContext.traffic` data.
  - Weather polygon: Same — render BMKG weather zone using `corridorContext.weather`.

### D4 — Live Telemetry: Poll corridor context on mount
- **Decision:** Wire `DashboardClient` (or a new `useCorridorContext` hook) to call
  `GET /api/v1/corridor/context` on mount and every 30 seconds. Pass the result down to
  `TopNavTelemetry` and map layers.
- **Loading state:** Show skeleton/spinner in telemetry badges while first fetch is in-flight,
  then replace with real data.

### D5 — No Emoji Icons: Replace all emoji with Lucide SVG icons
- **Decision:** Sweep all emoji used as functional icons across the codebase:
  - `FleetVehicleLayer` tooltip: 🚚 → `<Truck />`, ⚓ → `<Anchor />`, ✈️ → `<Plane />`
  - `CrisisSidebar`: 🔗 causal chain toggle → `<GitFork />` or `<Link2 />`
  - `TopNavTelemetry`: Already uses Lucide (Zap, Truck, CloudRain) — good.
  - Any ✕ close buttons → `<X />` from Lucide
  - Any other emoji found during sweep

---

## Scope Boundaries (NOT in this phase)

- No real AISstream WebSocket connection (AIS data requires paid API key not available)
- No changes to the agent LangGraph logic itself — only expose status metadata
- No new demo scenarios — the existing Belawan flood scenario remains the default
- No mobile layout changes

---

## Key Files to Change

| File | Change |
|---|---|
| `backend/app/routers/news_router.py` | Implement full router (currently empty) |
| `backend/app/routers/agent_router.py` | Add `GET /api/v1/agents/status` endpoint |
| `backend/app/main.py` | Add `news_router` to router includes; add startup agent warmup |
| `frontend/hooks/useCorridorContext.ts` | **[NEW]** Poll `GET /api/v1/corridor/context` every 30s |
| `frontend/components/dashboard/DashboardClient.tsx` | Mount corridor context hook; pass to TopNav + map |
| `frontend/components/dashboard/TopNavTelemetry.tsx` | Add loading skeleton for telemetry badges |
| `frontend/components/map/FleetVehicleLayer.tsx` | Replace emoji in tooltip with Lucide SVG |
| `frontend/components/map/CrisisMap.tsx` | Remove demo-stage gate for traffic/weather layers |
| `frontend/components/sidebar/CrisisSidebar.tsx` | Replace 🔗/✕ emoji with Lucide `<Link2 />`/`<X />` |
| `frontend/components/dashboard/AgentStatusWidget.tsx` | **[NEW]** Always-visible 6-agent health widget |

---

## Verification Plan

1. Open dashboard cold (no demo run) — fleet vehicles should be animating on the map
2. TopNav badges show real fetched values (or loading skeleton if backend is down)
3. Agent Status Widget shows at least one agent with a run timestamp
4. News feed shows at least 2 real headlines from Google News RSS
5. No emoji found as functional icons in the UI (text content like "→" is fine)
6. All existing tests still pass: `pytest tests/ -v --tb=short`
