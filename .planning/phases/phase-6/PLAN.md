# Phase 6: Demo Polish & `run_demo.py` Finalization

## Goal
Make PetaNadi hackathon-ready. A judge should be able to watch a flawless, scripted 3-minute demo — without live internet — and leave with a clear mental model of the product's value. This phase is pure integration, hardening, and polish: no new features.

> [!NOTE]
> The **Interactive Guided Demo Panel** (in-game-tutorial-style UX, step-by-step stepper, mock-agents mode, offline deep mode) has been promoted to its own dedicated **Phase 7**. Phase 6 focuses purely on getting the core demo pipeline rock-solid and well-documented.

---

## Context

All five prior phases are COMPLETE ✅. Current state of the Phase 6 deliverables:

| Asset | State |
|---|---|
| `backend/run_demo.py` | Stub — PIHPS + social events load from `pihps_sample.json`, but NASA/BMKG/TomTom/AISstream synthetic events are missing. `events[]` in `SCENARIOS` is never fully populated. |
| `data/synthetic/pihps_sample.json` | Only 3 PIHPS price spikes + 2 social OSINT events. Missing: wildfire polygon, BMKG weather alert, TomTom congestion, AISstream vessel queue. |
| `README.md` | Phase status table still says TODO for all phases. No offline demo instructions. |
| `agents/` | 6-agent LangGraph swarm complete ✅ |
| `frontend/` | Built and tested ✅ |

---

## Proposed Changes

### Wave 1 — Synthetic Dataset Completion

#### [NEW] `data/synthetic/belawan_scenario.json`

A complete scenario dataset covering all 6 data source types the agent swarm expects. `pihps_sample.json` is kept as-is for backward compat; this is the new canonical demo dataset.

Events:
- **NASA FIRMS**: Synthetic wildfire polygon ~100 km east of Belawan along Trans-Sumatra corridor (severity=critical)
- **BMKG**: Severe weather / heavy rain alert polygon over Deli Serdang & Serdang Bedagai regencies
- **TomTom**: Congestion event on Trans-Sumatra Highway at Km 41 (velocity=0 km/h, delay=180 min)
- **AISstream**: Port queue depth event at Belawan Port (8 vessels waiting, avg wait=3 days)
- **PIHPS**: 3 price spikes migrated from `pihps_sample.json` (minyak_goreng +17%, cabai_merah +12.5%, beras baseline)
- **Social OSINT**: 2 events migrated from `pihps_sample.json` (Twitter + TikTok) + 1 new Facebook report near Km 41

Total: ~9 events, all with lat/lon, dedup keys, and `_stream` routing tags.

---

### Wave 2 — `run_demo.py` Finalization

#### [MODIFY] [run_demo.py](file:///d:/College/Pidi.id/backend/run_demo.py)

1. **Load `belawan_scenario.json`** instead of `pihps_sample.json` — all 6 source types with correct `_stream` routing per event type
2. **`--offline` flag**: skip Redis injection entirely, call `run_crisis_event()` directly — hackathon safety net if Redis is unavailable
3. **Progress banner**: pretty-printed step-by-step console output matching the 5 pipeline stages (`[1/5] Injecting events → [2/5] Agent swarm → ...`)
4. **Timing pacing**: `time.sleep()` between injections, configurable via `--speed fast|normal` to simulate live scenario unfolding
5. **Graceful Redis-absent fallback**: if Redis ping fails, auto-activate offline mode with a warning instead of crashing

---

### Wave 3 — Performance Audit

#### [NEW] `backend/scripts/perf_check.py`

One-shot verification script:
- Times `run_crisis_event()` end-to-end with the full `belawan_scenario.json` dataset
- Prints total time + per-agent timing breakdown from LangGraph node durations
- Pass/fail assertion: total pipeline time < 180 seconds

---

### Wave 4 — Documentation

#### [MODIFY] [README.md](file:///d:/College/Pidi.id/README.md)

- Update all phase statuses to ✅ (phases 0–6)
- Add Phase 7 to the Build Phases table (status: TODO)
- Replace the placeholder Demo section with actual one-command instructions for both online and offline modes
- Add troubleshooting section for hackathon environment issues (Redis down, no internet)

#### [NEW] `DEMO_SCRIPT.md` (project root)

Standalone presenter guide for team dry-runs:
- Scene-by-scene 3-minute walkthrough: what to click, what to say, expected screen state
- 5 sections matching the pipeline stages
- Judge Q&A cheat sheet — anticipated questions + answers derivable from the dashboard alone

---

## Verification Plan

### Automated Checks
```bash
# 1. All backend tests still pass
cd backend && .venv\Scripts\activate
python -m pytest tests/ -v

# 2. Dry run — verify dataset loads correctly
python run_demo.py --dry-run

# 3. Offline end-to-end (no Redis required)
python run_demo.py --offline --speed fast

# 4. Performance audit (target: < 180s)
python scripts/perf_check.py

# 5. Frontend build compiles cleanly
cd frontend && npm run build
```

### Manual Verification (UAT)

| Check | Criteria |
|---|---|
| `run_demo.py` offline end-to-end | Completes in < 3 minutes, no exceptions, no Redis required |
| All 3 sidebar tabs populated | Evidence, Mitigation Detour, Economic Fallout all show data |
| WhatsApp notification | Delivered to test number OR gracefully logged if no network |
| 60 FPS confirmed | Chrome DevTools Performance tab during full dataset render |
| `run_demo.py --dry-run` prints all 9 events | Correct stream routing for each event type |
| Team dry-run with `DEMO_SCRIPT.md` | Completes the scripted 3-minute walk-through without touching a terminal |
