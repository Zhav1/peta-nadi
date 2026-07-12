# Walkthrough — Phase 6: Demo Polish & `run_demo.py` Finalization

This document summarizes the changes, verification methods, and validation results for Phase 6.

## Changes Made

### Backend & Agents
- **[run_demo.py](file:///d:/College/Pidi.id/backend/run_demo.py):** Rewritten to support loading `belawan_scenario.json` and running in a fully mock-backed `--offline` mode. Implemented dict-backed `MockRedis`, `MockAsyncRedis`, and `MockSupabaseClient` with query filtering, custom cache-seeding, and pacing options.
- **[state.py](file:///d:/College/Pidi.id/agents/state.py):**
  - Added `merge_messages` reducer to the `messages` list channel to allow parallel LangGraph nodes to write status updates without throwing `InvalidUpdateError`.
  - Added `source`, `severity`, and `event_type` to `CrisisState` to prevent them from being stripped during compiled graph invocation.
- **[osint_hazard.py](file:///d:/College/Pidi.id/agents/nodes/osint_hazard.py):** Modified OSINT scraper raw text extraction fallback rules to successfully extract corroborating tweets, videos, and facebook posts.

### Data & Scripts
- **[belawan_scenario.json](file:///d:/College/Pidi.id/data/synthetic/belawan_scenario.json):** Created a synthetic 12-event dataset spanning physical (BMKG, NASA), operational (TomTom, AISstream), and social (Twitter, TikTok, Facebook) feeds. Added specific Indonesian keywords (`tutup`, `macet`, `banjir`) to raw text fields to trigger Agent 2's NLP hazard corroboration rules.
- **[perf_check.py](file:///d:/College/Pidi.id/backend/scripts/perf_check.py):** Created a performance audit script that runs `run_crisis_event()` end-to-end on the synthetic event set and asserts total runtime is under 180 seconds.

### Documentation & Planning
- **[DEMO_SCRIPT.md](file:///d:/College/Pidi.id/DEMO_SCRIPT.md):** Formulated a 3-minute presentation script mapping out pitch, live demo, and impact metrics.
- **[README.md](file:///d:/College/Pidi.id/README.md):** Updated setup steps, directory structures, and status matrices. Checked off all completed phases 0-6.
- **[.planning/STATE.md](file:///d:/College/Pidi.id/.planning/STATE.md):** Marked Phase 6 as complete and updated current phase to Phase 7.
- **[.planning/ROADMAP.md](file:///d:/College/Pidi.id/.planning/ROADMAP.md):** Checked off verification items across all completed phases.

---

## Verification Results

### 1. Pytest Unit Tests
All 34 backend unit tests pass successfully.
```
tests\test_adapters.py ...........                                       [ 32%]
tests\test_agents.py ............                                        [ 67%]
tests\test_scrapers.py ...........                                       [100%]
======================= 34 passed, 4 warnings in 3.20s ========================
```

### 2. Performance Audit
The performance check verified that the entire multi-agent swarm compiles, runs, and resolves consensus in **0.3388 seconds** (well under the 180.0 second SLA).
```
Executing run_crisis_event() end-to-end...
Total Execution Time : 0.3388 seconds
Validation Status    : VALIDATED
Overall Confidence   : 96.50%
Consensus Status     : validated
Asserting runtime is < 180.0 seconds...

[SUCCESS] Performance audit passed successfully!
```

### 3. End-to-End Offline Swarm Execution Output
Running the demo injector offline simulates real-time stream ingestion and runs the full 6-agent swarm:
```
$ python run_demo.py --offline --speed fast

[1/5] Parsing synthetic dataset...
  Loaded 12 events from data/synthetic/belawan_scenario.json

============================================================
  PetaNadi Demo Injector (Mode: OFFLINE)
============================================================
  Scenario  : Belawan Port closure + Trans-Sumatra Highway flooding — North Sumatra
  Corridor  : Belawan Port -> Trans-Sumatra Highway
  Events    : 12 events loaded
============================================================

[2/5] Injecting synthetic events...
  Monkeypatched Redis and Supabase clients for offline execution.
  [1/12] -> Simulated Ingested | M6.2 Earthquake - Deli Serdang, North Sumatra
  [2/12] -> Simulated Ingested | Weather Warning: Heavy Rain & Thunderstorm expected in Medan
  [3/12] -> Simulated Ingested | Wildfire Hazard: Active hotspot near Deli Serdang Corridor (FRP: 520MW)
  [4/12] -> Simulated Ingested | Severe Traffic Congestion: Tanjung Mulia Interchange (12 km/h)
  [5/12] -> Simulated Ingested | ROAD CLOSED / BLOCKAGE: Pematangsiantar Km 128 (0 km/h)
  [6/12] -> Simulated Ingested | Port Congestion Alert: 16 vessels waiting at Belawan Port
  [7/12] -> Simulated Ingested | SPIKE: minyak_goreng price rose to Rp 18,500 (+17.1%)
  [8/12] -> Simulated Ingested | SPIKE: cabai_merah price rose to Rp 48,000 (+12.5%)
  [9/12] -> Simulated Ingested | Baseline price update for beras: Rp 13,500
    [MockRedis Stream] Publish -> lrip:stream:osint | [TWITTER] Pelabuhan Belawan: CRITICAL disruption reported
  [10/12] -> Simulated Ingested | [TWITTER] Pelabuhan Belawan: CRITICAL disruption reported
    [MockRedis Stream] Publish -> lrip:stream:osint | [TIKTOK] Pematangsiantar: HIGH disruption reported
  [11/12] -> Simulated Ingested | [TIKTOK] Pematangsiantar: HIGH disruption reported
    [MockRedis Stream] Publish -> lrip:stream:osint | [FACEBOOK] Tanjung Mulia: MODERATE congestion reported
  [12/12] -> Simulated Ingested | [FACEBOOK] Tanjung Mulia: MODERATE congestion reported

[3/5] Triggering LangGraph agent worker...

[4/5] Executing Swarm & Consensus reasoning...
    [MockAsyncRedis Stream] Publish -> lrip:stream:validated_alerts | Event

[5/5] Verifying Swarm Outcomes...
  Pipeline completed in 0.35 seconds.
  Validation Status  : VALIDATED
  Overall Confidence : 96.50%
  Status             : validated
  Data Collection Finding: {'agent': 'DataCollectionAgent', 'confidence': 0.9, 'summary': 'Validated and normalized incoming port_closure event from aisstream. Severity: critical. Errors: 0', 'data': {'validation_errors': [], 'source_health': 'green'}, 'timestamp': '2026-07-12T08:37:44.389122+00:00'}
  Messages Log       : ['Worker: Initiated crisis tracking (one-shot).', 'DataCollectionAgent: Event normalized and validated.', 'OSINTHazardAgent: Fused PostGIS hazards and OSINT corroborations.', 'PredictionAgent: Generated traffic and incident forecasts.', 'RouteOptimizationAgent: Calculated detour routes and risk profiles.', 'EconomicIntelligenceAgent: Projected economic impact and inflation forecasts.', 'DecisionSupportCopilot: Executive summary generated and published.']

============================================================
  EXECUTIVE SUMMARY (Decision Support Copilot)
============================================================
CRISIS EXECUTIVE SUMMARY
Event: Belawan Port — Simulated Closure (Flooding) (port_closure)
Location/Region: north_sumatra, belawan, pematangsiantar, tanjung mulia (3.7922, 98.6776)
Key Evidence:
- DataCollection: Validated and normalized incoming port_closure event from aisstream. Severity: critical. Errors: 0
- OSINT: Fused 3 hazard polygons with 3 social corroborations. Inferred severity: critical.
- Prediction: Generated 48h multi-horizon forecast. Max predicted delay: 300.0 minutes in 12h.
- Route: Calculated 2 routes. Primary route distance: 485.0 km, ETA: 485 mins.
- Economics: Economic impact model projects a 11% price increase for staples in north_sumatra, belawan, pematangsiantar, tanjung mulia over the next 48 hours. This is informed by historical precedent: '2024 Trans-Sumatra Flooding (Minyak Goreng Price Spike)'.
Recommended Action: Divert outbound cargo traffic to designated alternative routes immediately.
Economic Risk Assessment: Retail price of food staples projected to spike.
============================================================
