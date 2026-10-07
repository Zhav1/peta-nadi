# PLAN — Phase 12: Backend Demo Engine & AI Advisor Localization

**Phase:** 12  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Status:** READY TO EXECUTE ⏳  
**Estimated effort:** 1-2 days (solo, AI-assisted)  

---

## 1. Goal

Eliminate demo engine runtime crashes (HTTP 500 on `/api/demo/start` and 404 loops on `/api/demo/status/{id}`), adapt Gemini/DeepSeek AI Advisor prompts to automatically respond in Indonesian (or match user language), and implement a functional PDF Report generator for executive briefing exports.

---

## 2. Root Cause & Problem Analysis

1. **Demo Runner API 500 / 404 Errors**:
   - `POST /api/demo/start` failed with HTTP 500 when `mock_agents` was false and agent worker encountered missing live API keys or database connections.
   - When `/api/demo/start` failed, `useDemoState.ts` generated a fallback ID (`belawan-demo-offline-XXX`) but `pollStatus` continued attempting `GET /api/demo/status/belawan-demo-offline-XXX` against FastAPI every 2 seconds, causing continuous 404 errors.
   - Subsequent demo runs failed to reset backend/frontend state properly, causing the runner to hang.

2. **AI Advisor Language Limitation**:
   - `backend/app/routers/agent_router.py` hardcoded `Provide a brief, tactical response (max 3 sentences) in English.` and only provided English fallback responses.
   - AI Advisor did not adapt to user messages written in Indonesian.

3. **PDF Report Export Stub**:
   - `ReportsSection.tsx` button triggered `alert('PDF report compilation started...')` without generating or downloading any report file.

---

## 3. Implementation Tasks

### Task 1: Hardened Backend Demo Router (`backend/app/routers/demo_router.py`)
- Modify `start_demo`:
  - Default `mock_agents` to `True` for demo mode if not explicitly specified.
  - Wrap agent execution in robust fallback so missing API keys automatically load `data/fixtures/mock_crisis_state.json` instead of throwing HTTP 500.
  - Add explicit state reset logic to clear prior runs when starting a new scenario.

### Task 2: Robust Client Demo State Hook (`frontend/hooks/useDemoState.ts`)
- Modify `pollStatus`:
  - Skip backend polling if `crisisId` starts with `belawan-demo-offline` or if running in offline mode.
- Modify `reset`:
  - Ensure `reset()` purges interval timers and resets all agent statuses to `'pending'`.

### Task 3: AI Advisor Indonesian Localization (`backend/app/routers/agent_router.py`)
- Refactor system instruction for `/api/simulation/chat`:
  - Instruct LLMGateway to detect user prompt language and respond in the same language (default to Indonesian for Indonesian input).
  - Update fallback replies list to include tactical Indonesian recommendations for North Sumatra logistics.

### Task 4: Functional PDF Report Export (`frontend/components/dashboard/ReportsSection.tsx`)
- Implement printable/downloadable executive briefing generator on the "Generate PDF Report" button.
- Format document with PetaNadi header, executive summary, KPI metrics, active incident log, and mitigation recommendations.

---

## 4. Verification Plan

### Automated Tests
- Run backend pytest: `rtk pytest tests/`

### Manual Verification
1. Click "Run Demo" in dashboard stepper panel: verify HTTP 200 response, smooth stage progression, and zero 404 console errors.
2. Click "Run Demo" a second time: verify clean reset without UI freeze.
3. Open Simulation AI Advisor tab and send query in Indonesian ("Bagaimana rekomendasi mitigasi penutupan Pelabuhan Belawan?"): verify response in Indonesian.
4. Open Reports page and click "Generate PDF Report": verify PDF document is compiled and downloaded/opened cleanly.
