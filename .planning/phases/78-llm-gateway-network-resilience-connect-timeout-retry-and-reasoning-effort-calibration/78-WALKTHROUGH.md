# Phase 78 Walkthrough: LLM Gateway Network Resilience & Reasoning Effort Calibration

## Changes Implemented

### 1. Network Retry Loop with Exponential Backoff
- **File:** `agents/llm_gateway.py`
- Implemented `max_retries = 2` (up to 3 total attempts) with exponential backoff ($1.0\text{s} \rightarrow 2.0\text{s}$).
- Automatically handles:
  - `httpx.TimeoutException` (`ConnectTimeout`, `ReadTimeout`, `WriteTimeout`, `PoolTimeout`).
  - `httpx.NetworkError` (connection drops, resets, DNS errors).
  - Transient server errors (`HTTP 502`, `503`, `504`).
- Fails loud immediately on client-side errors (`HTTP 401`, `403`, `404`) without retrying.
- Mirrored identical retry resilience in the backup NVIDIA NIM branch.

### 2. Reasoning Effort Calibration (`reasoning_effort`)
- **Files:** `agents/llm_gateway.py`, `backend/app/config.py`, `.env`, `backend/.env`
- Added optional `reasoning_effort: Optional[str] = None` parameter to `LLMGateway.generate_content(...)`.
- Added `opencode_reasoning_effort: Optional[str] = None` setting in `Settings` (`backend/app/config.py`).
- Configured `OPENCODE_REASONING_EFFORT=low` in `.env` and `backend/.env` to calibrate reasoning models (`deepseek-v4.1-flash`, `mimo-v2.6-pro`) so internal chain-of-thought tokens do not exhaust the total completion budget.

### 3. Reasoning Content Fallback Extraction
- **File:** `agents/llm_gateway.py`
- If output `content` is empty string due to token length termination, extracts `message["reasoning_content"]` instead of raising `ValueError("opencode returned an empty completion")`.

## Verification Results

1. **Unit Regression Suite:**
   - Command: `python -m pytest backend/tests/test_llm_gateway.py`
   - Result: 11 passed in 0.91s (100% pass rate).
2. **Adapter Suite:**
   - Command: `python -m pytest backend/tests/test_adapters.py`
   - Result: 19 passed in 6.53s.
3. **Live Probe Diagnostic:**
   - Script: `scratch/test_opencode.py`
   - Result: Status 200 OK for both `deepseek-v4.1-flash` and `mimo-v2.6-pro` on OpenCode Go with `reasoning_effort: "low"`.
