# Phase 7: Interactive Guided Demo Mode

## Goal

Build an in-game-tutorial-style guided demo experience wired directly into the existing dashboard. A judge or evaluator clicks one button and the system walks them through the entire LRIP/PetaNadi pipeline — stage by stage — with explanations, live data, and full presenter control. No terminal required.

---

## Context

All six prior phases are COMPLETE ✅. The demo infrastructure that exists today:

| Asset | State |
|---|---|
| `backend/run_demo.py` | Complete — loads `belawan_scenario.json`, runs offline with `--offline` flag |
| `data/synthetic/belawan_scenario.json` | 9 events across 6 source types (NASA, BMKG, TomTom, AISstream, PIHPS, Social) |
| `backend/app/routers/agent_router.py` | `POST /api/crisis/process` + `GET /ws/crisis/{crisis_id}` already exist |
| `frontend/components/dashboard/DashboardClient.tsx` | Main shell — renders map, sidebar, header, simulate button |
| `frontend/lib/api.ts` | `api.crisis.process()`, `api.incidents.*`, `api.approvals.*` already present |
| `frontend/hooks/useCrisisSocket.ts` | WebSocket hook with reconnect logic already exists |

**What does NOT exist yet:**
- Any guided/stepper demo UI
- `POST /api/demo/start` and `GET /api/demo/status/{crisis_id}` backend endpoints
- `--mock-agents` fixture mode (deterministic, no LLM calls)
- `DEMO_OFFLINE=true` in-memory Supabase stub
- `/demo-remote` presenter phone page
- Demo replay (JSON snapshot + frame-by-frame playback)

---

## Proposed Changes

### Wave 1 — Backend: Demo Router

#### [NEW] `backend/app/routers/demo_router.py`

New FastAPI router at prefix `/api/demo`.

**Endpoints:**

`POST /api/demo/start`
- Accepts optional body `{ mock_agents: bool, offline: bool, scenario: str }` (all default to env-var values)
- Loads `data/synthetic/belawan_scenario.json`
- If `mock_agents=true` (or `DEMO_MOCK_AGENTS=true`): bypasses `run_crisis_event()` entirely, returns a pre-scripted `CrisisState` fixture from `data/fixtures/mock_crisis_state.json` — zero LLM calls, 100% deterministic
- If `mock_agents=false`: calls `run_crisis_event()` normally
- In both modes: writes the result to an in-memory store `DEMO_STORE: dict[crisis_id, DemoRun]`
- Returns `{ crisis_id, stage: 0, total_stages: 5 }`

`GET /api/demo/status/{crisis_id}`
- Returns current `DemoRun` state: `{ crisis_id, stage, stage_name, agent_statuses, validated, summary }`
- If `DEMO_OFFLINE=true`: reads from `DEMO_STORE` (in-memory), never touches Supabase

`POST /api/demo/advance/{crisis_id}`
- Manually advances the pipeline stage counter by 1 (for "Next Step" presenter control)
- Broadcasts stage update over SSE or WebSocket to connected frontend clients

`GET /api/demo/replay/{crisis_id}`
- Returns the completed `DemoRun` serialized as a full JSON snapshot for replay

**In-memory offline store:**
- `DEMO_STORE`: module-level dict keyed by `crisis_id`
- When `DEMO_OFFLINE=true`, `POST /api/demo/start` stubs Supabase writes with the in-memory store

Register in `backend/app/main.py`:
```python
from app.routers import demo_router
app.include_router(demo_router.router, prefix="/api/demo", tags=["Demo"])
```

---

#### [NEW] `data/fixtures/mock_crisis_state.json`

Pre-scripted `CrisisState` fixture for `--mock-agents` mode. Contains all 6 agent outputs, `validated=true`, `overall_confidence=0.91`, full `route_recommendations` array, full `economic_impact` object, and a complete `decision_support_output` summary. Structured to match the existing `CrisisState` TypeScript type in `frontend/lib/types.ts`.

**Stage progression map embedded in the fixture:**
```json
{
  "stages": [
    { "id": 0, "name": "Injecting Events",   "sources": ["bmkg","tomtom","nasa","aisstream","pihps","social"] },
    { "id": 1, "name": "Agent Swarm Running", "agents": ["data_collection","osint_hazard","prediction","route_optimization","economic_intelligence","decision_support"] },
    { "id": 2, "name": "Consensus Gate",      "confidence": 0.91 },
    { "id": 3, "name": "Validated Alert",     "incident_id": "belawan-demo-001" },
    { "id": 4, "name": "Notification Sent",   "whatsapp_status": "delivered" }
  ]
}
```

---

### Wave 2 — Frontend: GuidedDemoPanel Component

#### [NEW] `frontend/components/demo/GuidedDemoPanel.tsx`

Floating panel wired into `DashboardClient`. Responsibilities:

**Trigger button** (always visible, bottom-right corner):
- Glassmorphism pill button: `▶ Run Demo`
- Position: `fixed bottom-6 right-6 z-50`
- Hidden during active demo (replaced by stepper UI)

**5-stage stepper** (visible once demo starts):
```
Stage 1 — Injecting Events       (BMKG, TomTom, NASA, AISstream, PIHPS, Social badges animate in)
Stage 2 — Agent Swarm Running    (6 agent pills, each tick green as they complete)
Stage 3 — Consensus Gate         (confidence meter sweeps to ≥ 91%)
Stage 4 — Validated Alert        (crisis pin appears on map, sidebar opens automatically)
Stage 5 — Notification Sent      (WhatsApp confirmation toast)
```

**Controls:**
- `Next Step` button — calls `POST /api/demo/advance/{crisis_id}` and immediately renders next stage
- `Run Automatically` toggle — enables a `setInterval` at configurable pace (default 15s per stage)
- `Restart` button — resets state, calls `POST /api/demo/start` again
- `Close` button — tears down demo state, returns to normal dashboard

**Per-stage explainer cards:**
- Expandable `?` tooltip per stage: 2–3 sentences in plain Indonesian/English explaining what's happening technically, written for non-technical judges
- Stage 1 copy: "PetaNadi is pulling real-time data from 6 sources: weather alerts (BMKG), road congestion (TomTom), satellite fire maps (NASA), port vessel queues (AISstream), commodity prices (PIHPS), and social media reports."
- Stage 2 copy: "6 AI agents are processing the incoming data in parallel. Each agent specializes in a domain: hazard mapping, route optimization, economic forecasting, and crisis decision support."
- Stage 3 copy: "The Consensus Gate evaluates confidence scores from all agents. A crisis is only validated when the weighted score exceeds 85% — preventing false alarms."
- Stage 4 copy: "The Belawan Port closure is validated. The dashboard now shows the crisis pin, alternative routes, and the projected economic impact on commodity prices."
- Stage 5 copy: "A WhatsApp alert has been sent to logistics operators with the crisis summary, recommended detour, and a link back to this dashboard."

**Source data badges** (Stage 1 only):
- 6 small animated badges slide in one-by-one: `BMKG`, `TomTom`, `NASA`, `AISstream`, `PIHPS`, `Social`
- Each badge has a source-specific color and emoji icon (🌩️🚗🛰️⚓💰📱)
- Animation: staggered slide-up with 400ms delay between each badge

**Agent status pills** (Stage 2):
- 6 pills in a 2×3 grid: `Data Collection`, `OSINT & Hazard`, `Prediction`, `Route Optimization`, `Economic Intelligence`, `Decision Support`
- Each starts gray → shows spinner → turns green with a checkmark as the mock stages advance
- Staggered completion: one agent completes every 1.5s during auto-advance

**Confidence meter** (Stage 3):
- Animated arc/radial progress bar sweeping from 0% to the final confidence value (91%)
- Color interpolation: red → amber → green as it crosses thresholds (60%, 85%)
- Threshold labels: "Investigating", "Probable", "Validated"

**State management:**
- All demo state lives in a `useDemoState` hook (Wave 2b)
- `crisis_id` returned from `POST /api/demo/start` stored in hook
- Periodic polling via `GET /api/demo/status/{crisis_id}` every 2s when `Run Automatically` is active
- On Stage 4: calls `api.incidents.get(crisis_id)` and passes the result to `DashboardClient`'s `setSelectedCrisis` via the `onCrisisReady` callback prop

---

#### [NEW] `frontend/hooks/useDemoState.ts`

Encapsulates all guided demo logic:
- `start(opts)` → POST `/api/demo/start` → store `crisis_id`, set `stage=0`, set `isRunning=true`
- `advance()` → POST `/api/demo/advance/{crisis_id}` → increment local `stage`
- `poll()` → GET `/api/demo/status/{crisis_id}` → sync remote stage to local state
- `reset()` → clear all state, set `isRunning=false`
- `loadReplay(snapshot)` → hydrate state from JSON snapshot; `isReplay=true`
- Returns: `{ stage, isRunning, isReplay, crisisId, agentStatuses, confidence, start, advance, toggleAuto, reset, loadReplay }`

---

#### [MODIFY] `frontend/components/dashboard/DashboardClient.tsx`

Two additions only — no structural changes to existing layout:

1. Import and render `<GuidedDemoPanel>` inside the root div, after the `<Toast>` block:
```tsx
import { GuidedDemoPanel } from '@/components/demo/GuidedDemoPanel';
// ...
<GuidedDemoPanel onCrisisReady={(crisis) => { setSelectedCrisis(crisis); setSelectedCrisisId(crisis.crisis_id); }} />
```

2. No other changes to existing component logic.

---

#### [MODIFY] `frontend/lib/api.ts`

Add `demo` namespace:
```ts
demo: {
  start: (opts?: { mock_agents?: boolean; offline?: boolean }) =>
    request<{ crisis_id: string; stage: number; total_stages: number }>(
      '/api/demo/start', { method: 'POST', body: JSON.stringify(opts ?? {}) }
    ),
  status: (crisisId: string) =>
    request<DemoStatus>(`/api/demo/status/${crisisId}`),
  advance: (crisisId: string) =>
    request<{ stage: number; stage_name: string }>(`/api/demo/advance/${crisisId}`, { method: 'POST' }),
  replay: (crisisId: string) =>
    request<unknown>(`/api/demo/replay/${crisisId}`),
},
```

Also add `DemoStatus` type to `frontend/lib/types.ts`:
```ts
export interface DemoStatus {
  crisis_id: string;
  stage: number;
  stage_name: string;
  agent_statuses: Record<string, 'pending' | 'running' | 'done'>;
  confidence: number;
  validated: boolean;
  summary?: string;
}
```

---

### Wave 3 — Mobile Presenter Remote

#### [NEW] `frontend/app/demo-remote/page.tsx`

Standalone Next.js page at `/demo-remote`. Fully self-contained, no map, no sidebar.

**Layout:**
- Dark full-screen page (`bg-[#080d14]`), centered content, uses existing global CSS
- Stage name in large text (e.g. "Consensus Gate")
- Stage indicator: `3 / 5`
- Progress bar showing stage fraction
- `⏭ Next Step` button — large (min-height 56px), full-width tap target
- `▶ Auto` / `⏸ Pause` toggle
- `↺ Restart` button (smaller, muted style)

**Wiring:**
- Reads `?crisis_id=XXX` from `useSearchParams()`
- If no `crisis_id`: shows a centered `Start Demo` button that calls `POST /api/demo/start` with `{ mock_agents: true }` and redirects to `?crisis_id=XXX`
- Uses the same `useDemoState` hook

**QR Code generation (in GuidedDemoPanel.tsx):**
- After demo starts, the stepper panel shows a small QR code in the bottom-left corner
- Generated client-side via `qrcode` npm package (add to `frontend/package.json`)
- QR encodes: `http://<window.location.hostname>:3000/demo-remote?crisis_id=XXX`
- Tapping the QR area opens the URL in a new tab as a fallback

---

### Wave 4 — Demo Replay

#### [MODIFY] `frontend/components/demo/GuidedDemoPanel.tsx`

**Save Replay** button (appears after Stage 5 completes):
- Calls `GET /api/demo/replay/{crisis_id}`
- Triggers a browser download: `belawan_replay_<YYYYMMDD_HHMM>.json`

**Load Replay** button on the trigger pill (pre-demo state):
- Hidden `<input type="file" accept=".json">` triggered by the button click
- Validates that the loaded file has a `stages` array and a `crisis_id`
- Hydrates `useDemoState` via `loadReplay(snapshot)`
- In replay mode: `advance()` steps through local `snapshot.stages[n]` instead of calling `/api/demo/advance`
- Polling is disabled in replay mode — all data is local

---

### Wave 5 — Environment & Configuration

#### [MODIFY] `backend/app/config.py`

Add two new settings:
```python
demo_mock_agents: bool = Field(default=False, alias="DEMO_MOCK_AGENTS")
demo_offline: bool = Field(default=False, alias="DEMO_OFFLINE")
```

#### [MODIFY] `.env.example`

Add at the bottom:
```
# Demo mode flags — set both to true for fully offline hackathon demo
DEMO_MOCK_AGENTS=false
DEMO_OFFLINE=false
```

---

## Verification Plan

### Automated Checks
```bash
# 1. Backend tests — no regressions
cd backend && .venv\Scripts\activate
python -m pytest tests/ -v

# 2. Demo router smoke test — mock-agents mode, no LLM calls required
curl -X POST http://localhost:8000/api/demo/start \
     -H "Content-Type: application/json" \
     -d "{\"mock_agents\": true, \"offline\": true}"
# Expected: { "crisis_id": "...", "stage": 0, "total_stages": 5 }

# 3. Advance stage
curl -X POST http://localhost:8000/api/demo/advance/<crisis_id>
# Expected: { "stage": 1, "stage_name": "Agent Swarm Running" }

# 4. Frontend compiles without TypeScript errors
cd frontend && npm run build
```

### Manual UAT

| # | Check | Pass Criteria |
|---|---|---|
| 1 | Click `▶ Run Demo` button | GuidedDemoPanel appears; Stage 1 shows 6 animated source badges sliding in |
| 2 | Click `Next Step` 4 times | Advances through all 5 stages; Stage 4 opens crisis sidebar automatically |
| 3 | `Run Automatically` toggle | Completes all 5 stages in < 3 minutes without any clicks |
| 4 | Per-stage `?` explainer cards | Each stage tooltip shows readable copy for non-technical judges |
| 5 | Agent pills (Stage 2) | 6 pills transition gray → spinning → green in staggered sequence |
| 6 | Confidence meter (Stage 3) | Arc sweeps from 0% to 91%; color changes at 60% and 85% thresholds |
| 7 | `DEMO_OFFLINE=true` | Runs with no Redis, no Supabase, no outbound network |
| 8 | `DEMO_MOCK_AGENTS=true` | Demo completes in < 5 seconds — zero LLM calls |
| 9 | Mobile remote `/demo-remote` | `Next Step` on phone advances stage on desktop dashboard simultaneously |
| 10 | QR code in stepper panel | Scanning opens `/demo-remote?crisis_id=XXX` on mobile correctly |
| 11 | Save Replay | After Stage 5, clicking `Save Replay` downloads a valid `.json` file |
| 12 | Load Replay | Loading saved file plays back all 5 stages faithfully without any backend calls |
