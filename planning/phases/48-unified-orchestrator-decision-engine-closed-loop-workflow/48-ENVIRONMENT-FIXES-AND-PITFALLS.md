# Phase 48: Environment Conditions, Diagnostic Fixes, and Architectural Pitfalls

## 1. Context, Environment Conditions & Constraints

### 1.1. Operating System & Shell Environment
- **Host OS:** Windows 11 (64-bit).
- **Primary Shell:** Windows PowerShell.
- **Path Resolution Caveat:** Standard Unix utility commands (e.g. `ls`, `tail`, `grep`, `export`) are not available or behave differently in PowerShell:
  - `tail -20` fails with `The term 'tail' is not recognized`. Use PowerShell pipeline `| Select-Object -Last 20` or run without piping.
  - `export VAR=val` fails. Use `$env:VAR = "val"`.
  - `ls` via `rtk` fails if `ls.exe` is not in PATH. Use PowerShell `Get-ChildItem`.

### 1.2. Python Runtime & Virtual Environment
- **System Python (`C:\Python313\python.exe`):** Lacks project dependencies (`pytest`, `langgraph`, `fastapi`, `supabase`).
- **Canonical Virtual Environment:** Located at `d:\College\Pidi.id\backend\.venv`.
- **Python Executable:** `d:\College\Pidi.id\backend\.venv\Scripts\python.exe`.
- **Mandatory PYTHONPATH Variable:** Root and backend modules must both be importable simultaneously:
  ```powershell
  $env:PYTHONPATH = "D:\College\Pidi.id;D:\College\Pidi.id\backend"
  ```
  Failing to set both paths causes `ModuleNotFoundError: No module named 'agents'` or `ModuleNotFoundError: No module named 'app'`.

### 1.3. Token Optimization CLI Proxy (`rtk`)
- In accordance with the workspace rules, standard development commands should be routed through `rtk` (Rust Token Killer) to minimize token consumption:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
  ```
- Examples: `rtk git status`, `rtk git diff`, `rtk git add -A`, `rtk git commit`, `rtk npx tsc --noEmit`.

### 1.4. Database & Persistence Model
- **Dual Persistence Model:**
  - Supabase acts as cloud master (when internet connectivity and credentials are present).
  - SQLite database at `d:\College\Pidi.id\backend\app\db\prehub_local.db` acts as offline/fallback persistence.
  - When Supabase is unreachable, records are stored locally with `sync_status = "pending"`.
  - Queries must gracefully inspect local SQLite records without throwing unhandled connection errors.

### 1.5. UI/UX Design System Constraints (from `.agents/AGENTS.md`)
- **Strict Non-AI Anti-Patterns:**
  - ❌ No generic AI purple/pink gradients (`from-purple-500 to-pink-500`).
  - ❌ No emojis as icons (monochrome SVG from Lucide/Heroicons only).
  - ❌ No ungrounded marketing boasting or unscientific accuracy claims.
  - ✅ Strict 12px (`text-xs`) typography floor on functional labels, tables, and badges. Monospace restricted strictly to numbers, timestamps, coordinates, and scores (`tabular-nums`).
  - ✅ Solid elevated dark surfaces (`#080d14`, `#0c1017`, `#121822`) with 1px `#1c2432` hairline borders (no heavy `backdrop-blur-*` that degrades WebGL frame rates).
  - ✅ Explicit `cursor-pointer` on all interactive buttons and tabs.

---

## 2. Issues Discovered and Fixes Applied

### 2.1. Inverted LangGraph Swarm Topology & State Race Conditions
- **Issue:** `graph.py` triggered a flat parallel fan-out immediately after `data_collection`. Agent 4 (Routing) and Agent 5 (Economics) ran concurrently with Agent 2 (OSINT Hazard), attempting to read `hazard_polygons` and `blocked_corridors` from state before Agent 2 had produced them. Routing was calculated before the Consensus Gate determined if the event was real or noise.
- **Fix:** Restructured `agents/graph.py` into a 4-stage sequential-parallel DAG:
  - Stage 1: `data_collection`
  - Stage 2: `osint_hazard` + `prediction` in parallel $\to$ `consensus_gate`
  - Stage 3: `economic_intelligence` (runs only if consensus validated $\ge 0.85$)
  - Stage 4: `route_optimization` $\to$ `decision_support` $\to$ `END`
- **Result:** Race conditions completely eliminated; state transitions are strictly deterministic.

### 2.2. Isolated Decision Solvers Embedded Directly in Multi-Agent Swarm
- **Issue:** Phase 44 built high-performance solvers (`spoilage_hedging_service.py`, `compliance_service.py`, `intermodal_sync_service.py`), but they were isolated endpoints that the 6-agent swarm never utilized.
- **Fix:**
  - In `agents/nodes/route_optimization.py`, embedded the Spoilage Hedging monetary solver (Continue vs Reroute vs Hold factoring perishability, BPJT tolls, Pertamina diesel), statutory BKHIT quarantine check, and choke-point delay multipliers.
  - In `agents/nodes/decision_support.py`, injected hedging recommendations and compliance verdicts into the executive Indonesian brief.
- **Result:** All route recommendations produced by Agent 4 now contain itemized monetary valuations and compliance flags.

### 2.3. Frontend Client-Side Mock Simulation vs Live Swarm Execution
- **Issue:** Dropping a disaster pin in TheoTown mode or clicking an incident triggered a client-side mock (`simulated-active`) that calculated routes locally in the browser, completely bypassing the backend agent swarm.
- **Fix:**
  - Built `POST /api/v1/simulate/stream` in `backend/app/routers/incidents.py`, streaming LangGraph checkpoint events live via Server-Sent Events (`text/event-stream`).
  - Created `frontend/hooks/useCrisisSimulationStream.ts` to subscribe to the SSE stream and dispatch `agent-status-update` custom events to animate the 6-agent HUD in real time.
  - Wired `DashboardClient.tsx` to use the real SSE streaming hook.
- **Result:** Front-end simulation now triggers the actual 6-agent LangGraph execution on the backend.

### 2.4. The 6 Post-Phase-45 Forensic Audit Findings

#### Item 1: `causal_chain` Node Label Mismatch
- **Root Cause:** Backend GraphRAG (`agents/tools/graphrag.py`) returned objects with `{entity_id, entity_type, name, relation, impact_score}`, while frontend `CausalChainPanel.tsx` expected `item.node`, rendering blank node badges.
- **Fix:** Updated `ChainNode` interface and render expression in `CausalChainPanel.tsx` to check `node || name || entity_id`, and updated `frontend/lib/types.ts`.

#### Item 2: `inflation_forecast` Property Crash Risk in `EconomicTab.tsx`
- **Root Cause:** `agents/nodes/economic_intelligence.py` returned `{"region", "timeframe_hours", "inflation_multiplier", "anomalous_commodities"}`. Frontend `EconomicTab.tsx` called `forecast.pct_increase.toFixed(1)` and displayed `{forecast.commodity}`. Because both were undefined, rendering crashed with an unhandled JavaScript `TypeError`.
- **Fix:** In `agents/nodes/economic_intelligence.py`, added `commodity` and `pct_increase` to `inflation_forecast`. In `EconomicTab.tsx`, added null-safe fallbacks for `pct_increase` and `commodity`.

#### Item 3: `OutcomeHorizon` Discrepancy
- **Root Cause:** Schema defined `OutcomeHorizon` as `"T+12h"` and `"T+24h"`, while `approvals.py` passed `"horizon": "12h"`. Querying `list_outcomes(horizon="T+12h")` missed records.
- **Fix:** Standardized `approvals.py` to `OutcomeHorizon.T_12H.value` (`"T+12h"`). Updated `backend/app/db/local_storage.py` to match both `"T+12h"` and `"12h"`. Updated `backend/tests/test_pilot_e2e.py` line 516 to assert `horizon in ("T+12h", "12h")`.

#### Item 4: Delay Property Unit Mismatch in Route Extraction
- **Root Cause:** `approvals.py` extracted `payload.recommended_route.get("eta_hours", 2.5)`. But in `RouteRecommendation`, the field is `eta_minutes`, causing the getter to always evaluate to `None` and fall back to the default 2.5h.
- **Fix:** Updated delay extraction in both Supabase and offline paths to:
  ```python
  float(route_dict.get("eta_hours") or ((route_dict.get("eta_minutes") or 150) / 60.0))
  ```

#### Item 5: News Attributions vs Verified News Citations
- **Root Cause:** `MitigationTab.tsx` looked for `crisis.news_attributions`, whereas `OSINTHazardAgent` emits `verified_news_citations`. The UI always fell back to Google search links rather than displaying real LKBN ANTARA / BMKG citations.
- **Fix:** Updated `MitigationTab.tsx` to check `crisis.verified_news_citations`, formatting citations with tier badges, headlines, and authentic links, falling back to `news_attributions` or defaults only when empty.

#### Item 6: Missing WhatsApp Driver Dispatch Action in UI
- **Root Cause:** Phase 45 Onboarding Manual and Drill 1 in `test_pilot_e2e.py` tested deterministic WhatsApp dispatch URL generation (`https://wa.me/{driver_phone}?text=...`), but the route card in `MitigationTab.tsx` lacked an interactive button.
- **Fix:** Added a 1-click "Kirim Disposisi WhatsApp ke Driver" button on approved route cards in `MitigationTab.tsx`.

### 2.5. Subtle Syntax & Compiler Issues During Implementation
- **TypeScript Error in `MitigationTab.tsx`:**
  - *Symptom:* `Property 'name' does not exist on type 'RouteRecommendation'`.
  - *Fix:* `RouteRecommendation` defines `route_name?: string` and `description: string`. Replaced `route.name` with `route.route_name || route.description`.
- **Test Matrix Test Count Mismatch:**
  - *Symptom:* `backend/app/routers/evaluation_router.py` listed 133 tests in `TEST_CASES_DATA`, while the test suite grew to 137 tests after Phase 48 additions.
  - *Fix:* Appended the 4 Phase 48 tests (`TEST-FR05-10`, `TEST-FR05-11`, `TEST-FR20-09`, `TEST-FR10-03`) to `TEST_CASES_DATA`, updated the docstring to 137 tests, and updated `backend/tests/test_evaluation_router.py` assertions to expect 137 tests.

---

## 3. Extracted Architectural Learnings for Future Phases

1. **Explicit Causal Dependencies in LangGraph:**
   Never assume nodes will resolve concurrently without race conditions if data contracts are interdependent. Sensory observation nodes must be strictly partitioned from reasoning/mitigation nodes using barrier synchronization (like the Consensus Gate).
2. **Deterministic Solvers vs LLM Hallucination:**
   Critical business logic (tariffs, fuel burn, perishability decay, axle load compliance) must be written as deterministic pure functions, never delegated to LLM prompts. The LLM should only ingest and narrate the output of verified solvers.
3. **SSE for Multi-Agent UI Feedback:**
   For multi-agent systems where full pipeline latency spans 2 to 5 seconds, Server-Sent Events provide the cleanest, lightest streaming protocol to animate tactical HUD nodes progressively without the operational overhead of bidirectional WebSockets.
4. **Closed-Loop Feedback is Essential:**
   A decision support tool is only as good as its feedback loop. Capturing operator approvals, re-binding active WebGL fleet trajectories, simulating outbound telematics pings, and recording ground-truth outcomes for delayed evaluation ($T+12\text{h}$) ensures the system continually measures and recalibrates its performance.
5. **Strict Schema Parity Checks:**
   Always cross-check field names and units across the backend-to-frontend boundary (`eta_minutes` vs `eta_hours`, `route_name` vs `name`, `commodity` vs `anomalous_commodities[0]`). Small mismatches lead to silent fallbacks or client-side runtime crashes.
