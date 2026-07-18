# Phase 8: Implementation Plan

## 1. Environment & Config
- Add `NVIDIA_API_KEY` to `.env` and `.env.example`.
- Add Earth-2 and cuOpt endpoint URLs to configuration settings.

## 2. Implement LLM Gateway
- Create `backend/app/agents/llm_gateway.py`.
- Implement robust retry logic using `tenacity` or `langchain` built-ins.
- Refactor existing LangGraph nodes (Agent 1-6) to route all `invoke()` calls through the Gateway.

## 3. Implement Earth-2 (FourCastNet) Adapter
- Create `backend/app/adapters/earth2_adapter.py`.
- Implement CRON job logic (6-hour polling schedule).
- Update Agent 3 (Prediction) to query this adapter for macro-weather instead of the dummy TFT model.

## 4. Implement cuOpt Adapter
- Create `backend/app/adapters/cuopt_adapter.py`.
- Write the transformer function: convert `pgRouting` Distance Matrix -> cuOpt VRP JSON payload.
- Update Agent 4 (Route Optimization) to invoke the cuOpt adapter.

## 5. Verification & Testing
- Unit test the LLM Gateway fallback mechanism.
- Run `run_demo.py` offline to verify cuOpt JSON payloads are correctly formed and Earth-2 responses map correctly to our internal state schema.
